import { createHash, randomUUID } from "node:crypto";
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
	readFileSync,
	readSync,
	writeSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { type WriteBufferSync, writeBufferFullySync } from "../io/full-write";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectWritePath } from "../project/root";
import {
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
} from "./db";

const GENESIS_DIGEST = "GENESIS";
const JOURNAL_LOCK = "__evolution-journal__";
const MAX_EVENT_BYTES = 2_000_000;

export type ExternalImportManifest = {
	import_id: string;
	provider: string;
	adapter_version: string;
	source_format: string;
	source_path?: string | null;
	imported_at: string;
	content_digest: string;
	session_count: number;
	message_count: number;
	redaction_policy_version: string;
	redacted: true;
	raw_stored: false;
	project_detected?: string | null;
	warnings: readonly string[];
	files_ignored: readonly string[];
};

export type ExternalSessionRecord = {
	external_session_id: string;
	provider_session_id: string;
	content_digest: string;
	started_at?: string | null;
	ended_at?: string | null;
	record_count: number;
	normalized_digest: string;
};

export type ExternalSessionLink = {
	external_session_id: string;
	afol_session_id?: string | null;
	link_state: "auto_verified" | "manual_confirmed" | "pending";
	confidence: number;
	evidence: readonly Record<string, string>[];
	verified_commit?: string | null;
	canonical_decision_ref?: string | null;
	confirmation_required: boolean;
	eligible_for_learning: boolean;
};

export type ImportCheckpoint = {
	cursor: string;
	status: "staged" | "accepted" | "complete" | "failed";
	content_digest: string;
};

export type ImportAcceptancePayload = {
	project_id: string;
	manifest: ExternalImportManifest;
	sessions: readonly ExternalSessionRecord[];
	links?: readonly ExternalSessionLink[];
	checkpoint?: ImportCheckpoint;
};

export type ImportAcceptanceEvent = {
	sequence: number;
	event_id: string;
	event_type: "import_acceptance";
	action: "accept";
	authority_kind: "system_observer";
	actor: "afol";
	caller_type: "local_agent";
	trust_level: "imported_untrusted";
	origin_ref: string;
	subject_id: string;
	timestamp: string;
	command: string;
	previous_event_digest: string;
	payload: ImportAcceptancePayload;
	payload_digest: string;
	event_digest: string;
	source_refs: Array<Record<string, string>>;
};

export type ImportJournalContext = {
	root: string;
	projectId: string;
	eventsDir?: string;
};

export type ImportJournalAppendResult = {
	event: ImportAcceptanceEvent;
	path: string;
	previous_size: number;
};

export function stableImportJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableImportJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableImportJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}

export function importDigest(value: unknown): string {
	return createHash("sha256").update(stableImportJson(value)).digest("hex");
}

export function importJournalPath(
	root: string,
	eventsDir = ".afol/data/events/evolution",
): string {
	assertSafeEvolutionProjectRoot(root);
	const resolved = resolveProjectWritePath(root, eventsDir);
	if (!resolved.ok) throw new Error(resolved.error);
	return join(resolved.value.path, "imports.jsonl");
}

function openFlags(flags: number): number {
	return process.platform === "win32"
		? flags
		: flags | (fsConstants.O_NOFOLLOW ?? 0);
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

function validateDigest(value: string, label: string): void {
	if (!/^[a-f0-9]{64}$/.test(value))
		throw new Error(`${label} must be a sha256 digest`);
}

function isExactIsoTimestamp(value: string): boolean {
	const parsed = new Date(value);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

const LINK_EVIDENCE_KINDS = new Set([
	"afol_session_exists",
	"automatic_link_not_verified",
	"commit_resolved",
	"explicit_local_confirmation",
	"project_uuid_exact_match",
	"structural_link_fields_missing",
]);

function validatePayload(
	payload: ImportAcceptancePayload,
	projectId: string,
): void {
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			projectId,
		)
	)
		throw new Error("external import project id must be a UUID");
	if (payload.project_id !== projectId)
		throw new Error("import belongs to another project");
	const manifest = payload.manifest;
	if (!manifest.import_id || !manifest.provider || !manifest.adapter_version)
		throw new Error("import manifest identity is required");
	if (manifest.provider !== "codex" && manifest.provider !== "pi")
		throw new Error("unsupported external import provider");
	if (
		manifest.adapter_version !== "jsonl-v1" ||
		manifest.source_format !== "jsonl-v1"
	)
		throw new Error("unsupported external import format");
	if (
		manifest.source_path !== undefined &&
		manifest.source_path !== null &&
		manifest.source_path !== "<redacted-local-source>"
	)
		throw new Error("external import source path must be redacted");
	if (!isExactIsoTimestamp(manifest.imported_at))
		throw new Error("external import timestamp is invalid");
	if (
		!Number.isInteger(manifest.session_count) ||
		manifest.session_count < 0 ||
		manifest.session_count > 2_000 ||
		!Number.isInteger(manifest.message_count) ||
		manifest.message_count < 0 ||
		manifest.message_count > 100_000
	)
		throw new Error("external import counts exceed supported bounds");
	if (manifest.redaction_policy_version !== "v1")
		throw new Error("unsupported external import redaction policy");
	if (
		manifest.project_detected !== undefined &&
		manifest.project_detected !== null &&
		manifest.project_detected !== projectId
	)
		throw new Error("external import detected another project");
	if (manifest.warnings.length > 0 || manifest.files_ignored.length > 0)
		throw new Error("external import manifest text fields must be empty");
	validateDigest(manifest.content_digest, "import content digest");
	if (
		manifest.import_id !== `IMP-${manifest.provider}-${manifest.content_digest}`
	)
		throw new Error("external import id does not match redacted content");
	if (manifest.session_count !== payload.sessions.length)
		throw new Error("import session count does not match manifest");
	if (manifest.redacted !== true || manifest.raw_stored !== false)
		throw new Error(
			"imports must be redacted and raw material must not be persisted",
		);
	for (const session of payload.sessions) {
		if (!session.external_session_id || !session.provider_session_id)
			throw new Error("external session identity is required");
		if (!/^EXT-[a-f0-9]{32}$/.test(session.external_session_id))
			throw new Error("external session id is invalid");
		if (
			session.provider_session_id !== "unscoped" &&
			!/^SID-[a-f0-9]{32}$/.test(session.provider_session_id)
		)
			throw new Error("provider session id must be redacted");
		if (
			!Number.isInteger(session.record_count) ||
			session.record_count < 1 ||
			session.record_count > 100_000
		)
			throw new Error("external session record count is invalid");
		validateDigest(session.content_digest, "external session content digest");
		validateDigest(
			session.normalized_digest,
			"external session normalized digest",
		);
		for (const timestamp of [session.started_at, session.ended_at])
			if (
				timestamp !== undefined &&
				timestamp !== null &&
				!isExactIsoTimestamp(timestamp)
			)
				throw new Error("external session timestamp is invalid");
	}
	for (const link of payload.links ?? []) {
		if (
			link.link_state !== "auto_verified" &&
			link.link_state !== "manual_confirmed" &&
			link.link_state !== "pending"
		)
			throw new Error("external session link state is invalid");
		if (!/^EXT-[a-f0-9]{32}$/.test(link.external_session_id))
			throw new Error("external session link id is invalid");
		if (
			link.afol_session_id !== undefined &&
			link.afol_session_id !== null &&
			!/^[-A-Za-z0-9._]{1,128}$/.test(link.afol_session_id)
		)
			throw new Error("AFOL session link id is invalid");
		if (
			link.verified_commit !== undefined &&
			link.verified_commit !== null &&
			!/^[a-f0-9]{7,64}$/i.test(link.verified_commit)
		)
			throw new Error("verified commit link is invalid");
		if (
			link.canonical_decision_ref !== undefined &&
			link.canonical_decision_ref !== null &&
			!/^[-A-Za-z0-9._:/]{1,160}$/.test(link.canonical_decision_ref)
		)
			throw new Error("canonical decision reference is invalid");
		if (
			link.evidence.length < 1 ||
			link.evidence.some(
				(item) =>
					Object.keys(item).length !== 1 ||
					!LINK_EVIDENCE_KINDS.has(item.kind ?? ""),
			)
		)
			throw new Error("external session link evidence is invalid");
		if (
			link.link_state === "pending" &&
			(!link.confirmation_required || link.eligible_for_learning)
		)
			throw new Error("pending links require confirmation and stay ineligible");
		if (
			link.link_state !== "pending" &&
			(link.confirmation_required || !link.eligible_for_learning)
		)
			throw new Error("verified links must be eligible without confirmation");
		if (link.confidence < 0 || link.confidence > 1)
			throw new Error("link confidence must be between 0 and 1");
	}
	if (payload.checkpoint) {
		validateDigest(
			payload.checkpoint.content_digest,
			"checkpoint content digest",
		);
		if (payload.checkpoint.content_digest !== manifest.content_digest)
			throw new Error("checkpoint content digest mismatch");
		if (
			payload.checkpoint.status !== "complete" ||
			!/^\d+$/.test(payload.checkpoint.cursor)
		)
			throw new Error("external import checkpoint is invalid");
	}
}

function parseEvent(
	value: unknown,
	index: number,
	previousDigest: string,
	projectId: string,
): ImportAcceptanceEvent {
	if (!value || typeof value !== "object")
		throw new Error(`invalid import journal event at line ${index + 1}`);
	const event = value as ImportAcceptanceEvent;
	if (
		event.sequence !== index + 1 ||
		event.event_type !== "import_acceptance" ||
		event.action !== "accept" ||
		event.authority_kind !== "system_observer" ||
		event.trust_level !== "imported_untrusted" ||
		event.previous_event_digest !== previousDigest ||
		event.payload?.project_id !== projectId
	)
		throw new Error(`invalid import journal event at line ${index + 1}`);
	validatePayload(event.payload, projectId);
	if (
		event.source_refs.length !== 1 ||
		event.source_refs[0]?.kind !== "import" ||
		event.source_refs[0]?.id !== event.payload.manifest.import_id ||
		Object.keys(event.source_refs[0]).length !== 2
	)
		throw new Error(`invalid import journal source refs at line ${index + 1}`);
	if (event.payload_digest !== importDigest(event.payload))
		throw new Error(
			`import journal payload digest mismatch at line ${index + 1}`,
		);
	const { event_digest: _ignored, ...withoutDigest } = event;
	if (event.event_digest !== importDigest(withoutDigest))
		throw new Error(
			`import journal event digest mismatch at line ${index + 1}`,
		);
	return event;
}

export function readImportJournal(
	root: string,
	projectId: string,
	eventsDir?: string,
): ImportAcceptanceEvent[] {
	const path = importJournalPath(root, eventsDir);
	const stat = assertSafeEvolutionTarget(path, "import journal target");
	if (!stat) return [];
	const text = readFileSync(path, "utf8");
	if (text.length > 100 * 1024 * 1024)
		throw new Error("import journal exceeds size limit");
	if (text.length > 0 && !text.endsWith("\n"))
		throw new Error("import journal must end with a newline");
	const lines = text.split("\n").filter((line) => line.length > 0);
	const events: ImportAcceptanceEvent[] = [];
	let previous = GENESIS_DIGEST;
	for (let index = 0; index < lines.length; index++) {
		if (Buffer.byteLength(lines[index] ?? "", "utf8") > MAX_EVENT_BYTES)
			throw new Error(
				`import journal event exceeds size limit at line ${index + 1}`,
			);
		let value: unknown;
		try {
			value = JSON.parse(lines[index] ?? "");
		} catch {
			throw new Error(`invalid import journal JSON at line ${index + 1}`);
		}
		const event = parseEvent(value, index, previous, projectId);
		events.push(event);
		previous = event.event_digest;
	}
	return events;
}

export function withImportMutationLock<T>(root: string, operation: () => T): T {
	return withSessionLock(root, JOURNAL_LOCK, operation);
}

export function appendImportJournalEventUnlocked(
	input: ImportJournalContext & {
		payload: ImportAcceptancePayload;
		eventId?: string;
		now?: Date;
		/** Narrow fault-injection seam for durability tests. */
		io?: {
			write?: WriteBufferSync;
			fsync?: typeof fsyncSync;
			truncate?: typeof ftruncateSync;
			beforeOpen?: () => void;
		};
	},
): ImportJournalAppendResult {
	if (
		input.eventId !== undefined &&
		!/^IMP-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			input.eventId,
		)
	)
		throw new Error("external import event id is invalid");
	validatePayload(input.payload, input.projectId);
	const path = importJournalPath(input.root, input.eventsDir);
	const events = readImportJournal(
		input.root,
		input.projectId,
		input.eventsDir,
	);
	const previousSize = Number(
		assertSafeEvolutionTarget(path, "import journal target")?.size ?? 0,
	);
	const importId = input.payload.manifest.import_id;
	const duplicate = events.find(
		(event) => event.payload.manifest.import_id === importId,
	);
	if (duplicate) {
		if (importDigest(duplicate.payload) !== importDigest(input.payload))
			throw new Error("import id already exists with different content");
		return { event: duplicate, path, previous_size: previousSize };
	}
	const base = {
		sequence: events.length + 1,
		event_id: input.eventId ?? `IMP-${randomUUID()}`,
		event_type: "import_acceptance" as const,
		action: "accept" as const,
		authority_kind: "system_observer" as const,
		actor: "afol",
		caller_type: "local_agent" as const,
		trust_level: "imported_untrusted" as const,
		origin_ref: relative(input.root, path).replaceAll("\\", "/"),
		subject_id: importId,
		timestamp: (input.now ?? new Date()).toISOString(),
		command: "afol evolve import accept",
		previous_event_digest: events.at(-1)?.event_digest ?? GENESIS_DIGEST,
		payload: input.payload,
		payload_digest: importDigest(input.payload),
		source_refs: [{ id: importId, kind: "import" }],
	};
	const event = {
		...base,
		event_digest: importDigest(base),
	} as ImportAcceptanceEvent;
	parseEvent(event, events.length, base.previous_event_digest, input.projectId);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") chmodSync(dirname(path), 0o700);
	input.io?.beforeOpen?.();
	assertSafeEvolutionTarget(path, "import journal target");
	const fd = openSync(
		path,
		openFlags(fsConstants.O_RDWR | fsConstants.O_CREAT),
		0o600,
	);
	try {
		const opened = fstatSync(fd);
		if (!opened.isFile() || opened.nlink !== 1)
			throw new Error("import journal target must be a regular file");
		if (opened.size !== previousSize)
			throw new Error("import journal size changed before append");
		if (opened.size > 0) {
			const tail = Buffer.allocUnsafe(1);
			if (readSync(fd, tail, 0, 1, opened.size - 1) !== 1 || tail[0] !== 0x0a)
				throw new Error("import journal must end with a newline");
		}
		const line = Buffer.from(`${JSON.stringify(event)}\n`, "utf8");
		if (line.byteLength > MAX_EVENT_BYTES)
			throw new Error("import journal event exceeds size limit");
		try {
			writeBufferFullySync(
				fd,
				line,
				input.io?.write ?? writeSync,
				previousSize,
			);
			if (process.platform !== "win32") fchmodSync(fd, 0o600);
			(input.io?.fsync ?? fsyncSync)(fd);
			fsyncDirectory(dirname(path));
		} catch (writeError) {
			try {
				(input.io?.truncate ?? ftruncateSync)(fd, previousSize);
				fsyncSync(fd);
			} catch (rollbackError) {
				throw new AggregateError(
					[writeError, rollbackError],
					"import journal append and rollback both failed",
				);
			}
			throw writeError;
		}
	} finally {
		closeSync(fd);
	}
	return { event, path, previous_size: previousSize };
}

export function truncateImportJournal(path: string, size: number): void {
	const stat = assertSafeEvolutionTarget(path, "import journal target", false);
	if (!stat) throw new Error("import journal target is missing");
	const fd = openSync(path, openFlags(fsConstants.O_WRONLY));
	try {
		ftruncateSync(fd, size);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	fsyncDirectory(dirname(path));
}
