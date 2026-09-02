import type { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	mkdirSync,
	openSync,
	readFileSync,
	writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { observeSessionLock, withSessionLock } from "../io/session-lock";
import {
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
} from "./db";
import {
	journalTailFingerprint,
	readExactTailBytes,
} from "./projection-watermark";
import {
	activeReceiptIntegrityDigest,
	readActiveSuggestionProjection,
} from "./suggestion-projection";

const GENESIS = "GENESIS";
const DEFAULT_EVENTS_DIR = ".afol/data/events/evolution";
const CHECKPOINT_LOCK = "__evolution-projection-checkpoint__";
const CHECKPOINT_READER_WAIT_MS = 10_000;

function waitForCheckpointWriter(root: string): void {
	const deadline = Date.now() + CHECKPOINT_READER_WAIT_MS;
	while (observeSessionLock(root, CHECKPOINT_LOCK).active) {
		if (Date.now() >= deadline)
			throw new Error("evolution projection checkpoint writer is busy");
		Bun.sleepSync(10);
	}
}

type ProjectionCheckpoint = {
	checkpoint_schema_version?: 2;
	sequence: number;
	event_id: string;
	project_id: string;
	observation_tail_digest: string;
	receipt_tail_digest: string;
	apply_tail_digest?: string;
	evaluation_tail_digest?: string;
	active_projection_digest: string;
	active_receipt_digest: string;
	previous_event_digest: string;
	timestamp: string;
	event_digest: string;
};

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}

function digest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function projectionCheckpointPath(
	root: string,
	eventsDir = DEFAULT_EVENTS_DIR,
): string {
	assertSafeEvolutionProjectRoot(root);
	return join(root, eventsDir, "projection-checkpoints.jsonl");
}

function eventJournalPath(
	root: string,
	eventsDir: string | undefined,
	name: string,
): string {
	assertSafeEvolutionProjectRoot(root);
	return join(root, eventsDir ?? DEFAULT_EVENTS_DIR, name);
}

function readCheckpoints(path: string): ProjectionCheckpoint[] {
	const target = assertSafeEvolutionTarget(
		path,
		"evolution checkpoint journal",
	);
	if (!target) return [];
	const rows = readFileSync(path, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as ProjectionCheckpoint);
	let previous = GENESIS;
	for (const [index, row] of rows.entries()) {
		const { event_digest, ...base } = row;
		if (
			row.sequence !== index + 1 ||
			row.previous_event_digest !== previous ||
			digest(base) !== event_digest
		)
			throw new Error("evolution projection checkpoint chain is invalid");
		previous = event_digest;
	}
	return rows;
}

function readLatestCheckpoint(path: string): ProjectionCheckpoint | null {
	const target = assertSafeEvolutionTarget(
		path,
		"evolution checkpoint journal",
	);
	if (!target || target.size <= 0) return null;
	const length = Math.min(Number(target.size), 65_536);
	const buffer = Buffer.alloc(length);
	const fd = openSync(
		path,
		fsConstants.O_RDONLY |
			(process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW),
	);
	try {
		const current = fstatSync(fd);
		if (
			!current.isFile() ||
			current.nlink !== 1 ||
			current.dev !== target.dev ||
			current.ino !== target.ino
		)
			throw new Error("evolution checkpoint journal changed during read");
		readExactTailBytes(
			fd,
			buffer,
			Number(current.size) - length,
			"evolution projection checkpoint read was incomplete",
		);
	} finally {
		closeSync(fd);
	}
	const latest = JSON.parse(
		buffer.toString("utf8").trimEnd().split("\n").at(-1) ?? "null",
	) as ProjectionCheckpoint | null;
	if (!latest) return null;
	const { event_digest, ...base } = latest;
	if (digest(base) !== event_digest)
		throw new Error("evolution projection checkpoint digest is invalid");
	return latest;
}

function tailDigest(path: string): string {
	return journalTailFingerprint(path)?.tail_digest ?? GENESIS;
}

function writeEvolutionProjectionCheckpointUnlocked(input: {
	root: string;
	db: Database;
	projectId: string;
	eventsDir?: string;
	now?: Date;
	writeBytes?: (fd: number, value: string) => number;
	syncFile?: (fd: number) => void;
}): ProjectionCheckpoint {
	const path = projectionCheckpointPath(input.root, input.eventsDir);
	const latest = readLatestCheckpoint(path);
	const active = readActiveSuggestionProjection(input.db, input.projectId);
	const base = {
		checkpoint_schema_version: 2 as const,
		sequence: (latest?.sequence ?? 0) + 1,
		event_id: `CHK-${randomUUID()}`,
		project_id: input.projectId,
		observation_tail_digest: tailDigest(
			eventJournalPath(input.root, input.eventsDir, "observations.jsonl"),
		),
		receipt_tail_digest: tailDigest(
			eventJournalPath(input.root, input.eventsDir, "receipts.jsonl"),
		),
		apply_tail_digest: tailDigest(
			eventJournalPath(input.root, input.eventsDir, "applies.jsonl"),
		),
		evaluation_tail_digest: tailDigest(
			eventJournalPath(input.root, input.eventsDir, "evaluations.jsonl"),
		),
		active_projection_digest: active.digest,
		active_receipt_digest: activeReceiptIntegrityDigest(
			input.db,
			input.projectId,
			active.candidateIds,
		),
		previous_event_digest: latest?.event_digest ?? GENESIS,
		timestamp: (input.now ?? new Date()).toISOString(),
	};
	const checkpoint = { ...base, event_digest: digest(base) };
	const before = assertSafeEvolutionTarget(
		path,
		"evolution checkpoint journal",
	);
	const previousSize = Number(before?.size ?? 0);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	try {
		const fd = openSync(
			path,
			fsConstants.O_WRONLY |
				fsConstants.O_APPEND |
				fsConstants.O_CREAT |
				(process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW),
			0o600,
		);
		try {
			const current = fstatSync(fd);
			if (!current.isFile() || current.nlink !== 1)
				throw new Error("evolution checkpoint journal must be a private file");
			if (before && (before.dev !== current.dev || before.ino !== current.ino))
				throw new Error("evolution checkpoint journal changed during append");
			const line = `${JSON.stringify(checkpoint)}\n`;
			const written = input.writeBytes
				? input.writeBytes(fd, line)
				: writeSync(fd, line, null, "utf8");
			if (written !== Buffer.byteLength(line, "utf8"))
				throw new Error("evolution checkpoint journal write was incomplete");
			(input.syncFile ?? fsyncSync)(fd);
		} finally {
			closeSync(fd);
		}
	} catch (error) {
		try {
			const rollbackFd = openSync(
				path,
				fsConstants.O_WRONLY |
					(process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW),
			);
			try {
				const current = fstatSync(rollbackFd);
				if (
					!current.isFile() ||
					current.nlink !== 1 ||
					(before && (before.dev !== current.dev || before.ino !== current.ino))
				)
					throw new Error(
						"evolution checkpoint journal changed before rollback",
					);
				ftruncateSync(rollbackFd, previousSize);
				fsyncSync(rollbackFd);
			} finally {
				closeSync(rollbackFd);
			}
		} catch (rollbackError) {
			throw new AggregateError(
				[error, rollbackError],
				"evolution checkpoint write and rollback failed",
			);
		}
		throw error;
	}
	return checkpoint;
}

export function writeEvolutionProjectionCheckpoint(input: {
	root: string;
	db: Database;
	projectId: string;
	eventsDir?: string;
	now?: Date;
	writeBytes?: (fd: number, value: string) => number;
	syncFile?: (fd: number) => void;
}): ProjectionCheckpoint {
	return withSessionLock(input.root, CHECKPOINT_LOCK, () =>
		writeEvolutionProjectionCheckpointUnlocked(input),
	);
}

function repairEvolutionProjectionCheckpointTailUnlocked(input: {
	root: string;
	eventsDir?: string;
}): boolean {
	const path = projectionCheckpointPath(input.root, input.eventsDir);
	const target = assertSafeEvolutionTarget(
		path,
		"evolution checkpoint journal",
	);
	if (!target || target.size === 0) return false;
	const readFd = openSync(
		path,
		fsConstants.O_RDONLY |
			(process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW),
	);
	let text: string;
	try {
		const current = fstatSync(readFd);
		if (
			!current.isFile() ||
			current.nlink !== 1 ||
			current.dev !== target.dev ||
			current.ino !== target.ino
		)
			throw new Error(
				"evolution checkpoint journal changed during repair read",
			);
		text = readFileSync(readFd, "utf8");
	} finally {
		closeSync(readFd);
	}
	if (text.endsWith("\n")) return false;
	const lastCompleteLine = text.lastIndexOf("\n");
	const retainedSize = Buffer.byteLength(
		lastCompleteLine < 0 ? "" : text.slice(0, lastCompleteLine + 1),
		"utf8",
	);
	const fd = openSync(
		path,
		fsConstants.O_WRONLY |
			(process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW),
	);
	try {
		const current = fstatSync(fd);
		if (
			!current.isFile() ||
			current.nlink !== 1 ||
			current.dev !== target.dev ||
			current.ino !== target.ino
		)
			throw new Error("evolution checkpoint journal changed during repair");
		ftruncateSync(fd, retainedSize);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	readCheckpoints(path);
	return true;
}

export function repairEvolutionProjectionCheckpointTail(input: {
	root: string;
	eventsDir?: string;
}): boolean {
	return withSessionLock(input.root, CHECKPOINT_LOCK, () =>
		repairEvolutionProjectionCheckpointTailUnlocked(input),
	);
}

function assertEvolutionProjectionCheckpointUnlocked(input: {
	root: string;
	db: Database;
	projectId: string;
	eventsDir?: string;
}): void {
	const latest = readLatestCheckpoint(
		projectionCheckpointPath(input.root, input.eventsDir),
	);
	if (!latest || latest.project_id !== input.projectId)
		throw new Error("evolution projection checkpoint is missing");
	if (latest.checkpoint_schema_version !== 2)
		throw new Error("evolution projection checkpoint is stale");
	const observationTail = tailDigest(
		eventJournalPath(input.root, input.eventsDir, "observations.jsonl"),
	);
	const receiptTail = tailDigest(
		eventJournalPath(input.root, input.eventsDir, "receipts.jsonl"),
	);
	const applyTail = tailDigest(
		eventJournalPath(input.root, input.eventsDir, "applies.jsonl"),
	);
	const evaluationTail = tailDigest(
		eventJournalPath(input.root, input.eventsDir, "evaluations.jsonl"),
	);
	if (
		latest.observation_tail_digest !== observationTail ||
		latest.receipt_tail_digest !== receiptTail ||
		((latest.apply_tail_digest !== undefined || applyTail !== GENESIS) &&
			latest.apply_tail_digest !== applyTail) ||
		((latest.evaluation_tail_digest !== undefined ||
			evaluationTail !== GENESIS) &&
			latest.evaluation_tail_digest !== evaluationTail)
	)
		throw new Error("evolution projection checkpoint is stale");
	const active = readActiveSuggestionProjection(input.db, input.projectId);
	const receiptDigest = activeReceiptIntegrityDigest(
		input.db,
		input.projectId,
		active.candidateIds,
	);
	if (
		latest.active_projection_digest !== active.digest ||
		latest.active_receipt_digest !== receiptDigest
	)
		throw new Error("evolution active projection differs from checkpoint");
}

export function assertEvolutionProjectionCheckpoint(input: {
	root: string;
	db: Database;
	projectId: string;
	eventsDir?: string;
}): void {
	waitForCheckpointWriter(input.root);
	assertEvolutionProjectionCheckpointUnlocked(input);
}

export function validateEvolutionProjectionCheckpoint(input: {
	root: string;
	db: Database;
	projectId: string;
	eventsDir?: string;
}): void {
	waitForCheckpointWriter(input.root);
	readCheckpoints(projectionCheckpointPath(input.root, input.eventsDir));
	assertEvolutionProjectionCheckpointUnlocked(input);
}
