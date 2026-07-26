import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	mkdirSync,
	openSync,
	readFileSync,
	readSync,
	statSync,
	writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectWritePath } from "../project/root";
import {
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
} from "./db";
import {
	assertEvaluationContract,
	type EvaluationContractV1,
	evaluationContractDigest,
} from "./suggestion-model";

export const APPLY_POLICY_VERSION = "v1";
export const APPLY_VALIDATOR_V1 = "lesson-apply-v1" as const;
export const APPLY_VALIDATOR_VERSION = "lesson-apply-v2" as const;

export type ApplyPhase = "prepare" | "commit" | "abort" | "rollback";
export type ApplyInvocationClass = "explicit_local" | "policy_canary";
export type ApplyTargetKind = "generated" | "lesson";
export type ApplySourceRef = {
	id: string;
	kind: string;
	digest?: string;
	authority?: string;
};
export type ApplyBinding = {
	project_id: string;
	proposal_id: string;
	cluster_id?: string;
	task_type?: string;
	proposal_digest: string;
	evidence_digest: string;
	evidence_refs: ApplySourceRef[];
	baseline: Record<string, unknown>;
	targets: Record<string, unknown>;
	invocation_class: ApplyInvocationClass;
	policy_mode: "canary" | "lessons_memory_only" | "none";
	policy_version: typeof APPLY_POLICY_VERSION;
	validator_version: typeof APPLY_VALIDATOR_V1 | typeof APPLY_VALIDATOR_VERSION;
	contract_version?: 1;
	evaluation_contract?: EvaluationContractV1;
	evaluation_contract_digest?: string;
	evaluation_anchor_production_day_sequence?: number;
	target_kind: ApplyTargetKind;
	target_path: string;
	before_state: "absent";
	before_hash: string;
	after_hash: string;
	content_digest: string;
	changed_files: 1;
	changed_lines: number;
	session: string;
	task_id: string;
	mutation_id: string;
};
export type ApplyJournalEvent = {
	sequence: number;
	event_id: string;
	phase: ApplyPhase;
	timestamp: string;
	command_session: string;
	command_task_id: string;
	previous_event_digest: string;
	binding: ApplyBinding;
	payload_digest: string;
	event_digest: string;
};

const APPLY_LOCK = "__evolution-apply__";
const GENESIS_DIGEST = "GENESIS";
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;
const SHA256_RE = /^[a-f0-9]{64}$/;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_RE =
	/^AE-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stableJson(value: unknown): string {
	if (Array.isArray(value))
		return `[${value.map((item) => stableJson(item)).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "null";
}

export function applyDigest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

function exactIso(value: string): boolean {
	const parsed = new Date(value);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function assertSafeId(value: string, label: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value))
		throw new Error(`invalid evolution apply ${label}`);
}

function assertBinding(binding: ApplyBinding): void {
	if (!UUID_RE.test(binding.project_id))
		throw new Error("invalid evolution apply project id");
	assertSafeId(binding.proposal_id, "proposal id");
	for (const [label, digest] of [
		["proposal digest", binding.proposal_digest],
		["evidence digest", binding.evidence_digest],
		["before hash", binding.before_hash],
		["after hash", binding.after_hash],
		["content digest", binding.content_digest],
	] as const)
		if (!SHA256_RE.test(digest))
			throw new Error(`invalid evolution apply ${label}`);
	if (binding.policy_version !== APPLY_POLICY_VERSION)
		throw new Error("unsupported evolution apply policy or validator");
	if (
		binding.validator_version !== APPLY_VALIDATOR_V1 &&
		binding.validator_version !== APPLY_VALIDATOR_VERSION
	)
		throw new Error("unsupported evolution apply policy or validator");
	if (binding.validator_version === APPLY_VALIDATOR_VERSION) {
		if (
			binding.contract_version !== 1 ||
			!binding.evaluation_contract ||
			binding.cluster_id !== binding.evaluation_contract.cluster_id ||
			binding.task_type !== binding.evaluation_contract.task_type
		)
			throw new Error("invalid evolution apply evaluation contract");
		assertEvaluationContract(binding.evaluation_contract);
		if (
			!binding.evaluation_contract_digest ||
			binding.evaluation_contract_digest !==
				evaluationContractDigest(binding.evaluation_contract)
		)
			throw new Error("evolution apply evaluation contract digest mismatch");
		if (
			binding.evaluation_anchor_production_day_sequence !== undefined &&
			(!Number.isSafeInteger(
				binding.evaluation_anchor_production_day_sequence,
			) ||
				binding.evaluation_anchor_production_day_sequence < 0)
		)
			throw new Error("invalid evolution apply evaluation anchor");
	}
	if (
		!new Set(["none", "canary", "lessons_memory_only"]).has(binding.policy_mode)
	)
		throw new Error("invalid evolution apply policy mode");
	if (
		!new Set(["explicit_local", "policy_canary"]).has(binding.invocation_class)
	)
		throw new Error("invalid evolution apply invocation class");
	if (!new Set(["generated", "lesson"]).has(binding.target_kind))
		throw new Error("invalid evolution apply target kind");
	const lesson =
		/^docs\/lessons\/entries\/[0-9]{8}_[0-9]{4}_[A-Za-z0-9._-]+\.md$/.test(
			binding.target_path,
		);
	const generated =
		/^\.afol\/data\/evolution\/generated\/[A-Za-z0-9._-]+\.md$/.test(
			binding.target_path,
		);
	if (
		(binding.target_kind === "lesson" && !lesson) ||
		(binding.target_kind === "generated" && !generated)
	)
		throw new Error("invalid evolution apply target path");
	if (
		binding.before_state !== "absent" ||
		binding.changed_files !== 1 ||
		!Number.isInteger(binding.changed_lines) ||
		binding.changed_lines < 1 ||
		binding.changed_lines > 80
	)
		throw new Error("invalid evolution apply bounded diff");
	if (!binding.session || !/^[-A-Za-z0-9._]{1,160}$/.test(binding.session))
		throw new Error("invalid evolution apply session");
	if (!/^T-[A-Za-z0-9._-]{1,80}$/.test(binding.task_id))
		throw new Error("invalid evolution apply task id");
	if (!/^M-[0-9T:.+Z-]+-[0-9a-f-]{36}$/i.test(binding.mutation_id))
		throw new Error("invalid evolution apply mutation id");
	if (
		!Array.isArray(binding.evidence_refs) ||
		binding.evidence_refs.length < 1 ||
		binding.evidence_refs.length > 4
	)
		throw new Error("invalid evolution apply evidence refs");
	for (const ref of binding.evidence_refs) {
		assertSafeId(ref.id, "evidence id");
		assertSafeId(ref.kind, "evidence kind");
		if (ref.digest !== undefined && !SHA256_RE.test(ref.digest))
			throw new Error("invalid evolution apply evidence ref digest");
		if (
			ref.authority !== undefined &&
			!/^(canonical|derived|external)$/.test(ref.authority)
		)
			throw new Error("invalid evolution apply evidence authority");
		if (
			Object.keys(ref).some(
				(key) => !["authority", "digest", "id", "kind"].includes(key),
			)
		)
			throw new Error("invalid evolution apply evidence ref field");
	}
	if (
		!binding.baseline ||
		typeof binding.baseline !== "object" ||
		Array.isArray(binding.baseline)
	)
		throw new Error("invalid evolution apply baseline");
	if (
		!binding.targets ||
		typeof binding.targets !== "object" ||
		Array.isArray(binding.targets)
	)
		throw new Error("invalid evolution apply targets");
}

function assertTransition(
	prior: readonly ApplyJournalEvent[],
	phase: ApplyPhase,
	binding: ApplyBinding,
): void {
	const related = prior.filter(
		(event) => event.binding.mutation_id === binding.mutation_id,
	);
	if (phase === "prepare" && related.length > 0)
		throw new Error("evolution apply mutation already journaled");
	if (phase !== "prepare") {
		const prepared = related.find((event) => event.phase === "prepare");
		if (!prepared || prepared.payload_digest !== applyDigest(binding))
			throw new Error("evolution apply terminal event does not match prepare");
	}
	if (
		(phase === "commit" || phase === "abort") &&
		related.some((event) => event.phase !== "prepare")
	)
		throw new Error("evolution apply already terminal");
	if (phase === "rollback") {
		if (!related.some((event) => event.phase === "commit"))
			throw new Error("evolution apply rollback requires commit");
		if (related.some((event) => event.phase === "rollback"))
			throw new Error("evolution apply already rolled back");
	}
}

export function applyJournalPath(
	root: string,
	eventsDir = ".afol/data/events/evolution",
): string {
	assertSafeEvolutionProjectRoot(root);
	const resolved = resolveProjectWritePath(
		root,
		join(eventsDir, "applies.jsonl"),
	);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}

export function withApplyLock<T>(root: string, operation: () => T): T {
	return withSessionLock(root, APPLY_LOCK, operation);
}

export function readApplyJournal(
	root: string,
	eventsDir?: string,
): ApplyJournalEvent[] {
	const path = applyJournalPath(root, eventsDir);
	const stat = assertSafeEvolutionTarget(path, "evolution apply journal");
	if (!stat) return [];
	if (stat.size > MAX_JOURNAL_BYTES)
		throw new Error("evolution apply journal exceeds size limit");
	const content = readFileSync(path, "utf8");
	if (content.length > 0 && !content.endsWith("\n"))
		throw new Error("evolution apply journal has an incomplete final record");
	const rows = content.split("\n").filter(Boolean);
	const events: ApplyJournalEvent[] = [];
	let previous = GENESIS_DIGEST;
	for (const [index, row] of rows.entries()) {
		if (Buffer.byteLength(row, "utf8") > MAX_EVENT_BYTES)
			throw new Error(
				`evolution apply event exceeds size limit at line ${index + 1}`,
			);
		let event: ApplyJournalEvent;
		try {
			event = JSON.parse(row) as ApplyJournalEvent;
		} catch {
			throw new Error(`invalid evolution apply JSON at line ${index + 1}`);
		}
		if (
			!EVENT_ID_RE.test(event.event_id) ||
			!new Set(["prepare", "commit", "abort", "rollback"]).has(event.phase) ||
			!exactIso(event.timestamp) ||
			event.sequence !== index + 1 ||
			event.previous_event_digest !== previous
		)
			throw new Error(`invalid evolution apply event at line ${index + 1}`);
		assertSafeId(event.command_session, "command session");
		if (!/^T-[A-Za-z0-9._-]{1,80}$/.test(event.command_task_id))
			throw new Error(
				`invalid evolution apply command task at line ${index + 1}`,
			);
		assertBinding(event.binding);
		assertTransition(events, event.phase, event.binding);
		if (event.payload_digest !== applyDigest(event.binding))
			throw new Error(
				`evolution apply payload digest mismatch at line ${index + 1}`,
			);
		const { event_digest: _ignored, ...withoutDigest } = event;
		if (event.event_digest !== applyDigest(withoutDigest))
			throw new Error(
				`evolution apply event digest mismatch at line ${index + 1}`,
			);
		events.push(event);
		previous = event.event_digest;
	}
	return events;
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

export type ApplyJournalIo = {
	write: (fd: number, buffer: Buffer, offset: number, length: number) => number;
	fsync: (fd: number) => void;
	truncate: (fd: number, length: number) => void;
};

const APPLY_JOURNAL_IO: ApplyJournalIo = {
	write: writeSync,
	fsync: fsyncSync,
	truncate: ftruncateSync,
};

export function writeApplyJournalLine(
	fd: number,
	line: Buffer,
	previousSize: number,
	io: ApplyJournalIo = APPLY_JOURNAL_IO,
): void {
	let offset = 0;
	try {
		while (offset < line.length) {
			const written = io.write(fd, line, offset, line.length - offset);
			if (written <= 0)
				throw new Error("evolution apply journal write made no progress");
			offset += written;
		}
		io.fsync(fd);
	} catch (error) {
		try {
			io.truncate(fd, previousSize);
			io.fsync(fd);
		} catch (rollbackError) {
			throw new AggregateError(
				[error, rollbackError],
				"evolution apply journal write and durable rollback failed",
			);
		}
		throw error;
	}
}

export function appendApplyEventUnlocked(input: {
	root: string;
	phase: ApplyPhase;
	binding: ApplyBinding;
	commandSession: string;
	commandTaskId: string;
	eventsDir?: string;
	now?: Date;
}): ApplyJournalEvent {
	assertBinding(input.binding);
	assertSafeId(input.commandSession, "command session");
	if (!/^T-[A-Za-z0-9._-]{1,80}$/.test(input.commandTaskId))
		throw new Error("invalid evolution apply command task");
	const path = applyJournalPath(input.root, input.eventsDir);
	const parent = dirname(path);
	mkdirSync(parent, { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") chmodSync(parent, 0o700);
	const prior = readApplyJournal(input.root, input.eventsDir);
	assertTransition(prior, input.phase, input.binding);
	const base = {
		sequence: prior.length + 1,
		event_id: `AE-${randomUUID()}`,
		phase: input.phase,
		timestamp: (input.now ?? new Date()).toISOString(),
		command_session: input.commandSession,
		command_task_id: input.commandTaskId,
		previous_event_digest: prior.at(-1)?.event_digest ?? GENESIS_DIGEST,
		binding: input.binding,
		payload_digest: applyDigest(input.binding),
	};
	const event: ApplyJournalEvent = {
		...base,
		event_digest: applyDigest(base),
	};
	const line = Buffer.from(`${JSON.stringify(event)}\n`, "utf8");
	if (line.length > MAX_EVENT_BYTES)
		throw new Error("evolution apply event exceeds size limit");
	const existing = assertSafeEvolutionTarget(path, "evolution apply journal");
	if (Number(existing?.size ?? 0) + line.length > MAX_JOURNAL_BYTES)
		throw new Error("evolution apply journal exceeds size limit");
	const flags =
		fsConstants.O_RDWR |
		fsConstants.O_APPEND |
		fsConstants.O_CREAT |
		(process.platform === "win32" ? 0 : (fsConstants.O_NOFOLLOW ?? 0));
	const fd = openSync(path, flags, 0o600);
	try {
		const opened = fstatSync(fd);
		if (!opened.isFile() || opened.nlink !== 1)
			throw new Error("evolution apply journal must be a single regular file");
		if (
			opened.size !== Number(existing?.size ?? 0) ||
			(existing && (opened.dev !== existing.dev || opened.ino !== existing.ino))
		)
			throw new Error("evolution apply journal changed during append");
		if (opened.size + line.length > MAX_JOURNAL_BYTES)
			throw new Error("evolution apply journal exceeds size limit");
		if (opened.size > 0) {
			const tail = Buffer.allocUnsafe(1);
			if (readSync(fd, tail, 0, 1, opened.size - 1) !== 1 || tail[0] !== 0x0a)
				throw new Error(
					"evolution apply journal has an incomplete final record",
				);
		}
		writeApplyJournalLine(fd, line, opened.size);
	} finally {
		closeSync(fd);
	}
	if (process.platform !== "win32") chmodSync(path, 0o600);
	if (statSync(path).size > MAX_JOURNAL_BYTES)
		throw new Error(
			"INTEGRITY_ERROR: evolution apply journal exceeded size limit",
		);
	fsyncDirectory(parent);
	return event;
}

export function appendApplyEvent(
	input: Parameters<typeof appendApplyEventUnlocked>[0],
): ApplyJournalEvent {
	return withApplyLock(input.root, () => appendApplyEventUnlocked(input));
}

export function unmatchedApplyPrepares(
	root: string,
	eventsDir?: string,
): ApplyJournalEvent[] {
	const events = readApplyJournal(root, eventsDir);
	const terminalMutationIds = new Set(
		events
			.filter((event) => event.phase !== "prepare")
			.map((event) => event.binding.mutation_id),
	);
	return events.filter(
		(event) =>
			event.phase === "prepare" &&
			!terminalMutationIds.has(event.binding.mutation_id),
	);
}
