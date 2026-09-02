import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
	chmodSync,
	closeSync,
	fchmodSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	mkdirSync,
	openSync,
	readSync,
	writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { readProjectConfig } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import {
	type ApplyJournalEvent,
	readApplyJournal,
	withApplyLock,
} from "./apply-journal";
import {
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
} from "./db";
import { applyMigrations } from "./migrations";
import {
	assertProjectionWatermark,
	clearProjectionWatermark,
	writeProjectionWatermark,
} from "./projection-watermark";

const GENESIS = "GENESIS";
const MAX_EVENT_BYTES = 512 * 1024;
const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;
const EVENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MUTATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EvaluationEventType = "evaluation" | "supersession";
export type EvaluationState =
	| "canary"
	| "stable"
	| "regressed"
	| "needs_more_data"
	| "not_evaluable"
	| "rolled_back"
	| "superseded";

export type EvaluationEventInput = {
	event_id: string;
	event_type: EvaluationEventType;
	project_id: string;
	mutation_id: string;
	state: EvaluationState;
	reason?: string | undefined;
	created_at: string;
	session?: string;
	task_id?: string;
	apply_commit_digest?: string | undefined;
	successor_mutation_id?: string;
	successor_apply_commit_digest?: string;
	apply_journal_sequence?: number;
	comparable_sessions?: number;
	production_day_window?: { start: number; end: number; size?: number };
	scorecard_comparison?: Record<string, unknown>;
	idempotency_digest?: string;
	[key: string]: unknown;
};

export type EvaluationJournalEvent = EvaluationEventInput & {
	sequence: number;
	previous_event_digest: string;
	event_digest: string;
};

export type EvaluationAppendOptions = {
	beforeOpen?: () => void;
	writeBytes?: (fd: number, value: Buffer) => number;
	syncFile?: (fd: number) => void;
	syncDirectory?: (path: string) => void;
	truncateFile?: (fd: number, size: number) => void;
	closeFile?: (fd: number) => void;
};

export type EvaluationReadOptions = {
	afterOpen?: () => void;
};

type JournalContext = { root: string; eventsDir?: string; projectId?: string };

function resolveEventsDir(root: string, eventsDir?: string): string {
	if (eventsDir) return eventsDir;
	try {
		const config = readProjectConfig(root) as {
			paths?: { evolution_events_dir?: unknown };
		};
		if (typeof config.paths?.evolution_events_dir === "string")
			return config.paths.evolution_events_dir;
	} catch {
		/* retain the source-repository default for unconfigured fixtures */
	}
	return ".afol/data/events/evolution";
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "null";
}

export function evaluationDigest(value: unknown): string {
	const serialized = JSON.stringify(value);
	if (serialized === undefined)
		throw new Error(
			"evolution evaluation digest value is not JSON serializable",
		);
	return createHash("sha256")
		.update(stableJson(JSON.parse(serialized)))
		.digest("hex");
}

function projectIdFromConfig(root: string): string | undefined {
	try {
		const config = readProjectConfig(root) as { project?: { id?: unknown } };
		return typeof config.project?.id === "string"
			? config.project.id
			: undefined;
	} catch {
		return undefined;
	}
}

function resolveProjectId(
	root: string,
	projectId?: string,
): string | undefined {
	const configured = projectIdFromConfig(root);
	if (!configured)
		throw new Error("evolution evaluation project identity is required");
	if (!UUID_RE.test(configured))
		throw new Error("evolution evaluation project id is invalid");
	if (projectId !== undefined && projectId !== configured)
		throw new Error("evolution evaluation project binding mismatch");
	return configured;
}

export function evaluationJournalPath(
	root: string,
	eventsDir?: string,
): string {
	assertSafeEvolutionProjectRoot(root);
	const resolved = resolveProjectWritePath(
		root,
		resolveEventsDir(root, eventsDir),
	);
	if (!resolved.ok) throw new Error(resolved.error);
	return join(resolved.value.path, "evaluations.jsonl");
}

function exactIso(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validateBase(
	event: EvaluationJournalEvent,
	index: number,
	previous: string,
	applyEvents: readonly ApplyJournalEvent[],
	priorEvaluationEvents: readonly EvaluationJournalEvent[],
	projectId?: string,
): void {
	if (
		!EVENT_ID_RE.test(event.event_id) ||
		!MUTATION_ID_RE.test(event.mutation_id) ||
		!new Set(["evaluation", "supersession"]).has(event.event_type) ||
		!new Set([
			"canary",
			"stable",
			"regressed",
			"needs_more_data",
			"not_evaluable",
			"rolled_back",
			"superseded",
		]).has(event.state) ||
		!UUID_RE.test(event.project_id) ||
		(projectId !== undefined && event.project_id !== projectId) ||
		!exactIso(event.created_at) ||
		event.sequence !== index + 1 ||
		event.previous_event_digest !== previous ||
		!DIGEST_RE.test(event.event_digest)
	)
		throw new Error(`invalid evolution evaluation event at line ${index + 1}`);
	if (event.event_type === "supersession" && !event.successor_mutation_id)
		throw new Error(
			`invalid evolution evaluation supersession at line ${index + 1}`,
		);
	if (event.event_type === "supersession" && event.state !== "superseded")
		throw new Error(
			`invalid evolution evaluation supersession state at line ${index + 1}`,
		);
	if (!event.apply_commit_digest || !DIGEST_RE.test(event.apply_commit_digest))
		throw new Error(
			`invalid evolution evaluation apply digest at line ${index + 1}`,
		);
	if (
		event.successor_apply_commit_digest !== undefined &&
		!DIGEST_RE.test(event.successor_apply_commit_digest)
	)
		throw new Error(
			`invalid evolution evaluation successor digest at line ${index + 1}`,
		);
	if (
		event.comparable_sessions !== undefined &&
		(!Number.isInteger(event.comparable_sessions) ||
			event.comparable_sessions < 0)
	)
		throw new Error(
			`invalid evolution evaluation comparable sessions at line ${index + 1}`,
		);
	if (event.production_day_window !== undefined) {
		const range = event.production_day_window;
		if (
			!Number.isInteger(range.start) ||
			!Number.isInteger(range.end) ||
			range.start < 1 ||
			range.end < range.start
		)
			throw new Error(
				`invalid evolution evaluation day window at line ${index + 1}`,
			);
	}
	const { event_digest: _ignored, ...base } = event;
	if (evaluationDigest(base) !== event.event_digest)
		throw new Error(
			`evolution evaluation event digest mismatch at line ${index + 1}`,
		);
	const subjectCommit = applyEvents.find(
		(candidate) =>
			candidate.phase === "commit" &&
			candidate.binding.mutation_id === event.mutation_id &&
			candidate.event_digest === event.apply_commit_digest,
	);
	if (!subjectCommit || subjectCommit.binding.project_id !== event.project_id)
		throw new Error(
			`evolution evaluation apply identity is unresolved at line ${index + 1}`,
		);
	if (
		!Number.isInteger(event.apply_journal_sequence) ||
		Number(event.apply_journal_sequence) < subjectCommit.sequence ||
		Number(event.apply_journal_sequence) > applyEvents.length
	)
		throw new Error(
			`invalid evolution evaluation apply anchor at line ${index + 1}`,
		);
	const anchor = Number(event.apply_journal_sequence);
	const subjectRolledBackAtAnchor = applyEvents.some(
		(candidate) =>
			candidate.phase === "rollback" &&
			candidate.sequence <= anchor &&
			candidate.binding.mutation_id === event.mutation_id,
	);
	if (
		event.event_type === "evaluation" &&
		((event.state === "rolled_back") !== subjectRolledBackAtAnchor ||
			event.state === "superseded")
	)
		throw new Error(
			`invalid evolution evaluation rollback state at line ${index + 1}`,
		);
	if (event.event_type === "supersession") {
		if (!event.successor_mutation_id || !event.successor_apply_commit_digest)
			throw new Error(
				`invalid evolution evaluation supersession identity at line ${index + 1}`,
			);
		const successorCommit = applyEvents.find(
			(candidate) =>
				candidate.phase === "commit" &&
				candidate.binding.mutation_id === event.successor_mutation_id &&
				candidate.event_digest === event.successor_apply_commit_digest,
		);
		if (
			!successorCommit ||
			successorCommit.binding.project_id !== event.project_id
		)
			throw new Error(
				`evolution evaluation successor identity is unresolved at line ${index + 1}`,
			);
		if (
			subjectCommit.binding.validator_version !== "lesson-apply-v2" ||
			successorCommit.binding.validator_version !== "lesson-apply-v2" ||
			successorCommit.sequence <= subjectCommit.sequence ||
			subjectCommit.binding.cluster_id !== successorCommit.binding.cluster_id ||
			subjectCommit.binding.task_type !== successorCommit.binding.task_type
		)
			throw new Error(
				`invalid evolution evaluation supersession contract at line ${index + 1}`,
			);
		if (anchor < successorCommit.sequence)
			throw new Error(
				`invalid evolution evaluation apply anchor at line ${index + 1}`,
			);
		if (
			applyEvents.some(
				(candidate) =>
					candidate.phase === "rollback" &&
					candidate.sequence <= anchor &&
					(candidate.binding.mutation_id === event.mutation_id ||
						candidate.binding.mutation_id === event.successor_mutation_id),
			)
		)
			throw new Error(
				`invalid evolution evaluation rolled-back supersession at line ${index + 1}`,
			);
		if (
			priorEvaluationEvents.some(
				(candidate) =>
					candidate.event_type === "supersession" &&
					candidate.mutation_id === event.mutation_id,
			)
		)
			throw new Error(
				`conflicting evolution evaluation supersession at line ${index + 1}`,
			);
	}
}

export function readEvaluationJournal(
	root: string,
	projectId?: string,
	eventsDir?: string,
	options: EvaluationReadOptions = {},
): EvaluationJournalEvent[] {
	const expectedProject = resolveProjectId(root, projectId);
	const resolvedEventsDir = resolveEventsDir(root, eventsDir);
	const path = evaluationJournalPath(root, resolvedEventsDir);
	const text = readEvaluationJournalText(path, options);
	if (text === null) return [];
	if (text.length > 0 && !text.endsWith("\n"))
		throw new Error(
			"evolution evaluation journal has a partial trailing event",
		);
	const lines = text.split("\n");
	if (lines.at(-1) === "") lines.pop();
	const events: EvaluationJournalEvent[] = [];
	const applyEvents = readApplyJournal(root, resolvedEventsDir);
	const eventIds = new Set<string>();
	let previous = GENESIS;
	for (const [index, line] of lines.entries()) {
		if (!line || Buffer.byteLength(line, "utf8") > MAX_EVENT_BYTES)
			throw new Error(`invalid evolution evaluation journal line ${index + 1}`);
		let event: EvaluationJournalEvent;
		try {
			event = JSON.parse(line) as EvaluationJournalEvent;
		} catch {
			throw new Error(`invalid evolution evaluation JSON at line ${index + 1}`);
		}
		validateBase(event, index, previous, applyEvents, events, expectedProject);
		if (eventIds.has(event.event_id))
			throw new Error(
				`duplicate evolution evaluation event at line ${index + 1}`,
			);
		eventIds.add(event.event_id);
		events.push(event);
		previous = event.event_digest;
	}
	return events;
}

function sameFile(
	left: {
		dev: string | number | bigint;
		ino: string | number | bigint;
		size: string | number | bigint;
		mtimeMs: string | number | bigint;
		ctimeMs: string | number | bigint;
	},
	right: {
		dev: string | number | bigint;
		ino: string | number | bigint;
		size: string | number | bigint;
		mtimeMs: string | number | bigint;
		ctimeMs: string | number | bigint;
	},
): boolean {
	return (
		String(left.dev) === String(right.dev) &&
		String(left.ino) === String(right.ino) &&
		Number(left.size) === Number(right.size) &&
		Number(left.mtimeMs) === Number(right.mtimeMs) &&
		Number(left.ctimeMs) === Number(right.ctimeMs)
	);
}

function readEvaluationJournalText(
	path: string,
	options: EvaluationReadOptions,
): string | null {
	const before = assertSafeEvolutionTarget(
		path,
		"evolution evaluation journal",
	);
	if (!before) return null;
	if (before.size > MAX_JOURNAL_BYTES)
		throw new Error("evolution evaluation journal exceeds size limit");
	const fd = openSync(
		path,
		fsConstants.O_RDONLY |
			(process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW),
	);
	try {
		options.afterOpen?.();
		const opened = fstatSync(fd);
		if (!opened.isFile() || opened.nlink !== 1 || !sameFile(before, opened))
			throw new Error("evolution evaluation journal changed during read");
		const size = Number(opened.size);
		const buffer = Buffer.allocUnsafe(size);
		let offset = 0;
		while (offset < size) {
			const bytesRead = readSync(fd, buffer, offset, size - offset, null);
			if (bytesRead <= 0)
				throw new Error("evolution evaluation journal changed during read");
			offset += bytesRead;
		}
		const afterFd = fstatSync(fd);
		const afterPath = assertSafeEvolutionTarget(
			path,
			"evolution evaluation journal",
			false,
		);
		if (
			!afterPath ||
			!sameFile(opened, afterFd) ||
			!sameFile(opened, afterPath)
		)
			throw new Error("evolution evaluation journal changed during read");
		return buffer.toString("utf8");
	} finally {
		closeSync(fd);
	}
}

function fsyncDirectory(path: string): void {
	if (process.platform === "win32") return;
	const fd = openSync(path, fsConstants.O_RDONLY);
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function appendLine(
	path: string,
	line: Buffer,
	options: EvaluationAppendOptions = {},
): void {
	const parent = dirname(path);
	mkdirSync(parent, { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") chmodSync(parent, 0o700);
	const before = assertSafeEvolutionTarget(
		path,
		"evolution evaluation journal",
	);
	const previousSize = Number(before?.size ?? 0);
	options.beforeOpen?.();
	const fd = openSync(
		path,
		fsConstants.O_RDWR |
			fsConstants.O_APPEND |
			fsConstants.O_CREAT |
			(process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW),
		0o600,
	);
	const writeBytes =
		options.writeBytes ??
		((targetFd: number, value: Buffer) =>
			writeSync(targetFd, value, 0, value.byteLength, null));
	const syncFile = options.syncFile ?? fsyncSync;
	const syncDirectory = options.syncDirectory ?? fsyncDirectory;
	const truncateFile = options.truncateFile ?? ftruncateSync;
	const closeFile = options.closeFile ?? closeSync;
	let writeAttempted = false;
	let committed = false;
	let primaryError: unknown;
	let rollbackError: unknown;
	let closeError: unknown;
	try {
		const opened = fstatSync(fd);
		const current = assertSafeEvolutionTarget(
			path,
			"evolution evaluation journal",
			false,
		);
		if (
			!opened.isFile() ||
			opened.nlink !== 1 ||
			Number(opened.size) !== previousSize ||
			(before && (before.dev !== opened.dev || before.ino !== opened.ino)) ||
			!current ||
			current.dev !== opened.dev ||
			current.ino !== opened.ino
		)
			throw new Error("evolution evaluation journal changed during append");
		if (previousSize > 0) {
			const tail = Buffer.allocUnsafe(1);
			if (readSync(fd, tail, 0, 1, previousSize - 1) !== 1 || tail[0] !== 0x0a)
				throw new Error(
					"evolution evaluation journal has a partial trailing event",
				);
		}
		if (previousSize + line.byteLength > MAX_JOURNAL_BYTES)
			throw new Error("evolution evaluation journal exceeds size limit");
		writeAttempted = true;
		let offset = 0;
		while (offset < line.byteLength) {
			const remaining = line.subarray(offset);
			const written = writeBytes(fd, remaining);
			if (
				!Number.isInteger(written) ||
				written <= 0 ||
				written > remaining.byteLength
			)
				throw new Error("evolution evaluation journal write was incomplete");
			offset += written;
		}
		const afterWrite = fstatSync(fd);
		if (Number(afterWrite.size) !== previousSize + line.byteLength)
			throw new Error(
				"evolution evaluation journal write was incomplete: size is inconsistent",
			);
		if (process.platform !== "win32") fchmodSync(fd, 0o600);
		syncFile(fd);
		const finalOpened = fstatSync(fd);
		const currentAfterWrite = assertSafeEvolutionTarget(
			path,
			"evolution evaluation journal",
			false,
		);
		if (!currentAfterWrite || !sameFile(finalOpened, currentAfterWrite))
			throw new Error("evolution evaluation journal changed during append");
		syncDirectory(parent);
		committed = true;
	} catch (error) {
		primaryError = error;
		if (writeAttempted) {
			try {
				const opened = fstatSync(fd);
				const current = assertSafeEvolutionTarget(
					path,
					"evolution evaluation journal",
					false,
				);
				if (
					!current ||
					String(opened.dev) !== String(current.dev) ||
					String(opened.ino) !== String(current.ino)
				)
					throw new Error(
						"evolution evaluation journal changed before rollback",
					);
				// Windows rejects ftruncate on an O_APPEND descriptor. Keep the
				// append descriptor for the write path, then roll back through a
				// separate non-append descriptor after verifying the same file.
				const rollbackFd = openSync(
					path,
					fsConstants.O_WRONLY |
						(process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW),
				);
				try {
					const rollbackOpened = fstatSync(rollbackFd);
					if (
						String(rollbackOpened.dev) !== String(opened.dev) ||
						String(rollbackOpened.ino) !== String(opened.ino)
					)
						throw new Error(
							"evolution evaluation journal changed before rollback",
						);
					truncateFile(rollbackFd, previousSize);
					syncFile(rollbackFd);
				} finally {
					closeSync(rollbackFd);
				}
				syncDirectory(parent);
			} catch (errorDuringRollback) {
				rollbackError = errorDuringRollback;
			}
		}
	}
	try {
		closeFile(fd);
	} catch (error) {
		closeError = error;
	}
	if (primaryError !== undefined) {
		if (rollbackError !== undefined)
			throw new AggregateError(
				[primaryError, rollbackError],
				"evolution evaluation journal append and rollback failed",
			);
		throw primaryError;
	}
	if (closeError !== undefined && !committed) throw closeError;
}

function normalizeAppendArgs(
	rootOrInput:
		| string
		| ({
				root: string;
				event: EvaluationEventInput;
				eventsDir?: string;
		  } & EvaluationAppendOptions),
	event?: EvaluationEventInput,
	eventsDir?: string,
): {
	root: string;
	event: EvaluationEventInput;
	eventsDir?: string;
} & EvaluationAppendOptions {
	return typeof rootOrInput === "string"
		? {
				root: rootOrInput,
				event: event as EvaluationEventInput,
				...(eventsDir ? { eventsDir } : {}),
			}
		: rootOrInput;
}

export function appendEvaluationEventUnlocked(
	root: string,
	event: EvaluationEventInput,
	eventsDir?: string,
): EvaluationJournalEvent;
export function appendEvaluationEventUnlocked(
	input: {
		root: string;
		event: EvaluationEventInput;
		eventsDir?: string;
	} & EvaluationAppendOptions,
): EvaluationJournalEvent;
export function appendEvaluationEventUnlocked(
	rootOrInput:
		| string
		| ({
				root: string;
				event: EvaluationEventInput;
				eventsDir?: string;
		  } & EvaluationAppendOptions),
	event?: EvaluationEventInput,
	eventsDir?: string,
): EvaluationJournalEvent {
	const input = normalizeAppendArgs(rootOrInput, event, eventsDir);
	if (!input.event || typeof input.event !== "object")
		throw new Error("evolution evaluation event is required");
	const expectedProject = resolveProjectId(input.root, input.event.project_id);
	if (expectedProject !== input.event.project_id)
		throw new Error("evolution evaluation project binding mismatch");
	const resolvedEventsDir = resolveEventsDir(input.root, input.eventsDir);
	const path = evaluationJournalPath(input.root, resolvedEventsDir);
	const prior = readEvaluationJournal(
		input.root,
		expectedProject,
		resolvedEventsDir,
	);
	if (prior.some((item) => item.event_id === input.event.event_id))
		throw new Error("evolution evaluation event id already exists");
	const applyEvents = readApplyJournal(input.root, resolvedEventsDir);
	const base = {
		...input.event,
		apply_journal_sequence:
			input.event.apply_journal_sequence ?? applyEvents.length,
		sequence: prior.length + 1,
		previous_event_digest: prior.at(-1)?.event_digest ?? GENESIS,
	};
	const journalEvent = {
		...base,
		event_digest: evaluationDigest(base),
	} as EvaluationJournalEvent;
	validateBase(
		journalEvent,
		prior.length,
		base.previous_event_digest,
		applyEvents,
		prior,
		expectedProject,
	);
	const serialized = JSON.stringify(journalEvent);
	if (Buffer.byteLength(serialized, "utf8") > MAX_EVENT_BYTES)
		throw new Error("evolution evaluation event exceeds size limit");
	const line = Buffer.from(`${serialized}\n`, "utf8");
	const current = assertSafeEvolutionTarget(
		path,
		"evolution evaluation journal",
	);
	if (Number(current?.size ?? 0) + line.byteLength > MAX_JOURNAL_BYTES)
		throw new Error("evolution evaluation journal exceeds size limit");
	appendLine(path, line, input);
	return journalEvent;
}

export function appendEvaluationEvent(
	root: string,
	event: EvaluationEventInput,
	eventsDir?: string,
): EvaluationJournalEvent {
	return withApplyLock(root, () =>
		withSessionLock(root, "__evolution-journal__", () =>
			appendEvaluationEventUnlocked(root, event, eventsDir),
		),
	);
}

export function withEvaluationMutationLock<T>(
	root: string,
	operation: () => T,
): T {
	return withSessionLock(root, "__evolution-journal__", operation);
}

export const withEvaluationLock = withEvaluationMutationLock;

function projectionRow(event: EvaluationJournalEvent): Record<string, unknown> {
	const range = event.production_day_window;
	return {
		project_id: event.project_id,
		mutation_id: event.mutation_id,
		state: event.state,
		apply_commit_digest: event.apply_commit_digest ?? null,
		event_id: event.event_id,
		event_digest: event.event_digest,
		event_type: event.event_type,
		successor_mutation_id: event.successor_mutation_id ?? null,
		comparable_sessions: event.comparable_sessions ?? null,
		production_day_start: range?.start ?? null,
		production_day_end: range?.end ?? null,
		scorecard_comparison: event.scorecard_comparison
			? JSON.stringify(event.scorecard_comparison)
			: null,
		payload_json: JSON.stringify(event),
		created_at: event.created_at,
		updated_at: event.created_at,
	};
}

function projected(
	events: readonly EvaluationJournalEvent[],
): Map<string, Record<string, unknown>> {
	const rows = new Map<string, Record<string, unknown>>();
	for (const event of events)
		rows.set(
			`${event.project_id}\u0000${event.mutation_id}`,
			projectionRow(event),
		);
	return rows;
}

function replay(
	db: Database,
	projectId: string,
	events: readonly EvaluationJournalEvent[],
	path?: string,
): void {
	applyMigrations(db);
	db.exec("BEGIN IMMEDIATE");
	try {
		db.query("DELETE FROM evaluations WHERE project_id = ?").run(projectId);
		const insert = db.prepare(
			`INSERT INTO evaluations(project_id,mutation_id,state,apply_commit_digest,event_id,event_digest,event_type,successor_mutation_id,comparable_sessions,production_day_start,production_day_end,scorecard_comparison,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		);
		for (const row of projected(events).values())
			insert.run(
				...([
					row.project_id,
					row.mutation_id,
					row.state,
					row.apply_commit_digest,
					row.event_id,
					row.event_digest,
					row.event_type,
					row.successor_mutation_id,
					row.comparable_sessions,
					row.production_day_start,
					row.production_day_end,
					row.scorecard_comparison,
					row.payload_json,
					row.created_at,
					row.updated_at,
				] as unknown as Parameters<typeof insert.run>),
			);
		if (path && events.length > 0)
			writeProjectionWatermark(db, "evaluation", path);
		else if (path) clearProjectionWatermark(db, "evaluation");
		db.exec("COMMIT");
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {}
		throw error;
	}
}

export function validateEvaluationProjection(
	input: JournalContext & { db: Database },
): void {
	const projectId = resolveProjectId(input.root, input.projectId);
	if (!projectId)
		throw new Error("evolution evaluation project identity is required");
	const events = readEvaluationJournal(input.root, projectId, input.eventsDir);
	const expected = new Database(":memory:");
	try {
		applyMigrations(expected);
		replay(expected, projectId, events);
		const actual = input.db
			.query(
				"SELECT * FROM evaluations WHERE project_id = ? ORDER BY mutation_id",
			)
			.all(projectId);
		const replayed = expected
			.query(
				"SELECT * FROM evaluations WHERE project_id = ? ORDER BY mutation_id",
			)
			.all(projectId);
		if (evaluationDigest(actual) !== evaluationDigest(replayed))
			throw new Error(
				"evolution db evaluation projection differs from canonical journal",
			);
		assertProjectionWatermark(
			input.db,
			"evaluation",
			evaluationJournalPath(input.root, input.eventsDir),
			events.length > 0,
		);
	} finally {
		expected.close();
	}
}

export function rebuildEvaluationProjection(
	input: JournalContext & { db: Database },
): void {
	const projectId = resolveProjectId(input.root, input.projectId);
	if (!projectId)
		throw new Error("evolution evaluation project identity is required");
	withSessionLock(input.root, "__evolution-journal__", () => {
		const path = evaluationJournalPath(input.root, input.eventsDir);
		const events = readEvaluationJournal(
			input.root,
			projectId,
			input.eventsDir,
		);
		replay(input.db, projectId, events, path);
	});
}
