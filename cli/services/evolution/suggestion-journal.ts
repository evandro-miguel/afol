import { Database } from "bun:sqlite";
import {
	createHash,
	createHmac,
	randomBytes,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import {
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
import { dirname, join, relative } from "node:path";
import { withSessionLock } from "../io/session-lock";
import { readProjectConfig } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import { localDateForTimezone } from "./config";
import {
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
} from "./db";
import { applyMigrations } from "./migrations";
import { writeEvolutionProjectionCheckpoint } from "./projection-checkpoint";
import {
	assertProjectionWatermark,
	clearProjectionWatermark,
	readExactTailBytes,
	writeProjectionWatermark,
} from "./projection-watermark";
import { resolveEvolutionConfig } from "./runtime-config";
import {
	assertSuggestionAuthority,
	redactSuggestionReason,
	type SuggestionAuthorityCapability,
	suggestionDecisionForAuthority,
} from "./suggestion-authority";
import type {
	SuggestionReceipt,
	SuggestionReceiptStatus,
} from "./suggestion-receipt";

const GENESIS = "GENESIS";
const LOCK = "__evolution-journal__";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const MAX_REASON = 512;
const MAX_TAIL_BYTES = 65_536;
export const SUGGESTION_JOURNAL_LIMITS = Object.freeze({
	maxBytes: 4_194_304,
	maxLines: 16_384,
	maxLineBytes: 32_768,
});

export type {
	SuggestionReceipt,
	SuggestionReceiptStatus,
} from "./suggestion-receipt";
export type SuggestionReceiptEvent = {
	sequence: number;
	event_id: string;
	event_type: "receipt_claim" | "receipt_shown" | "receipt_decision";
	action: SuggestionReceiptStatus;
	authority_kind: "system_observer" | "explicit_project_user";
	actor: string;
	caller_type: "system" | "project_user";
	trust_level: "local_trusted";
	origin_ref: string;
	subject_id: string;
	timestamp: string;
	command: string;
	previous_event_digest: string;
	payload: Record<string, unknown>;
	payload_digest: string;
	event_digest: string;
};

type Context = { root: string; projectId: string; eventsDir?: string };
type ClaimInput = Context & {
	localDate?: string;
	suggestionId: string;
	claimedBy: string;
	evidenceDigest: string;
	ttlMs?: number;
	now?: Date;
	db?: Database;
	eventId?: string;
	authority?: SuggestionAuthorityCapability;
	writeBytes?: (fd: number, value: Buffer) => number;
	syncFile?: (fd: number) => void;
};
type AckInput = Context & {
	localDate?: string;
	suggestionId: string;
	claimedBy: string;
	claimToken?: string;
	generation: number;
	evidenceDigest: string;
	action: "shown" | "skipped" | "accepted" | "rejected";
	rejectReason?: string;
	now?: Date;
	db?: Database;
	eventId?: string;
	authority?: SuggestionAuthorityCapability;
	writeBytes?: (fd: number, value: Buffer) => number;
	syncFile?: (fd: number) => void;
};

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}
function digest(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}
function tokenDigest(token: string): string {
	return createHmac("sha256", "afol-evolution-receipt-token-v1")
		.update(token)
		.digest("hex");
}
function tokenMatches(token: string, expected: string): boolean {
	const actual = Buffer.from(tokenDigest(token), "hex");
	const target = Buffer.from(expected, "hex");
	return target.length === actual.length && timingSafeEqual(actual, target);
}
function validateId(value: string, label: string): void {
	if (!ID_RE.test(value)) throw new Error(`invalid ${label}`);
}
function validateDigest(value: string, label: string): void {
	if (!DIGEST_RE.test(value)) throw new Error(`invalid ${label}`);
}
function validateReason(value: string | undefined): string | null {
	const redacted = redactSuggestionReason(value);
	if (redacted === undefined) return null;
	if (
		redacted.length === 0 ||
		redacted.length > MAX_REASON ||
		[...redacted].some((char) => {
			const code = char.codePointAt(0) ?? 0;
			return code < 32 || code === 127;
		})
	)
		throw new Error("invalid suggestion rejection reason");
	return redacted;
}
function pathFor(context: Context): string {
	assertSafeEvolutionProjectRoot(context.root);
	const resolved = resolveProjectWritePath(
		context.root,
		join(context.eventsDir ?? ".afol/data/events/evolution", "receipts.jsonl"),
	);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}
function resolvedDate(
	root: string,
	projectId: string,
	supplied: string | undefined,
	now: Date,
): string {
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	if (!resolved.configured || !resolved.enabled || !resolved.projectId)
		throw new Error("suggestion receipts require configured evolution project");
	if (resolved.projectId !== projectId)
		throw new Error(
			"evolution project identity does not match receipt project",
		);
	const localDate = supplied ?? localDateForTimezone(now, resolved.timezone);
	if (!DATE_RE.test(localDate))
		throw new Error("invalid suggestion local date");
	if (supplied && supplied !== localDateForTimezone(now, resolved.timezone))
		throw new Error("suggestion local date does not match configured timezone");
	return localDate;
}
function openFlags(flags: number): number {
	return process.platform === "win32"
		? flags
		: flags | (fsConstants.O_NOFOLLOW ?? 0);
}

function syncParentDirectory(path: string): void {
	if (process.platform === "win32") return;
	const fd = openSync(dirname(path), "r");
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function sameIdentity(
	left: { dev: unknown; ino: unknown },
	right: { dev: unknown; ino: unknown },
): boolean {
	return (
		String(left.dev) === String(right.dev) &&
		String(left.ino) === String(right.ino)
	);
}

function readBoundedText(path: string): string | null {
	const before = assertSafeEvolutionTarget(path, "suggestion journal target");
	if (!before) return null;
	if (Number(before.size) > SUGGESTION_JOURNAL_LIMITS.maxBytes)
		throw new Error("suggestion journal exceeds the byte limit");
	const fd = openSync(path, openFlags(fsConstants.O_RDONLY));
	try {
		const opened = fstatSync(fd);
		if (!opened.isFile() || opened.nlink !== 1 || !sameIdentity(before, opened))
			throw new Error("suggestion journal target changed during read");
		const buffer = Buffer.alloc(SUGGESTION_JOURNAL_LIMITS.maxBytes + 1);
		let offset = 0;
		while (offset < buffer.length) {
			const bytesRead = readSync(
				fd,
				buffer,
				offset,
				buffer.length - offset,
				null,
			);
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		if (offset > SUGGESTION_JOURNAL_LIMITS.maxBytes)
			throw new Error("suggestion journal exceeds the byte limit");
		const after = assertSafeEvolutionTarget(
			path,
			"suggestion journal target",
			false,
		);
		if (!after || !sameIdentity(before, after) || Number(after.size) !== offset)
			throw new Error("suggestion journal changed during read");
		const text = buffer.subarray(0, offset).toString("utf8");
		let lineBytes = 0;
		let lineCount = 0;
		for (const byte of buffer.subarray(0, offset)) {
			lineBytes += 1;
			if (lineBytes > SUGGESTION_JOURNAL_LIMITS.maxLineBytes)
				throw new Error("suggestion journal line exceeds the byte limit");
			if (byte === 10) {
				lineCount += 1;
				lineBytes = 0;
			}
		}
		if (lineBytes > 0) lineCount += 1;
		if (lineCount > SUGGESTION_JOURNAL_LIMITS.maxLines)
			throw new Error("suggestion journal exceeds the line limit");
		return text;
	} finally {
		closeSync(fd);
	}
}

type ReceiptJournalTail = {
	size: number;
	event: SuggestionReceiptEvent;
};

function readJournalTail(path: string): ReceiptJournalTail | null {
	const target = assertSafeEvolutionTarget(path, "suggestion journal target");
	if (!target || target.size <= 0) return null;
	const length = Math.min(Number(target.size), MAX_TAIL_BYTES);
	const buffer = Buffer.alloc(length);
	const fd = openSync(path, openFlags(fsConstants.O_RDONLY));
	try {
		const opened = fstatSync(fd);
		if (
			!opened.isFile() ||
			opened.nlink !== 1 ||
			opened.dev !== target.dev ||
			opened.ino !== target.ino
		)
			throw new Error("suggestion journal target changed during read");
		readExactTailBytes(
			fd,
			buffer,
			Number(opened.size) - length,
			"suggestion journal tail read was incomplete",
		);
		const after = fstatSync(fd);
		if (after.size !== opened.size)
			throw new Error("suggestion journal target changed during read");
	} finally {
		closeSync(fd);
	}
	const lines = buffer.toString("utf8").trimEnd().split(/\r?\n/);
	if (target.size > MAX_TAIL_BYTES && lines.length < 2)
		throw new Error("suggestion journal tail exceeds bounded read");
	let event: SuggestionReceiptEvent;
	try {
		event = JSON.parse(lines.at(-1) ?? "") as SuggestionReceiptEvent;
	} catch {
		throw new Error("invalid suggestion journal tail JSON");
	}
	if (
		!Number.isInteger(event.sequence) ||
		event.sequence < 1 ||
		!DIGEST_RE.test(event.event_digest) ||
		digest((({ event_digest: _, ...rest }) => rest)(event)) !==
			event.event_digest
	)
		throw new Error("invalid suggestion journal tail digest");
	return { size: Number(target.size), event };
}

function receiptFromRow(row: unknown): SuggestionReceipt | null {
	if (!row || typeof row !== "object") return null;
	const value = row as Record<string, unknown>;
	return {
		project_id: String(value.project_id),
		local_date: String(value.local_date),
		suggestion_id: String(value.suggestion_id),
		receipt_status: String(value.receipt_status) as SuggestionReceiptStatus,
		claimed_by: String(value.claimed_by),
		claim_token_digest: String(value.claim_token_digest),
		generation: Number(value.generation),
		claim_expires_at: String(value.claim_expires_at),
		reject_reason:
			typeof value.reject_reason === "string" ? value.reject_reason : null,
		evidence_digest: String(value.evidence_digest),
		journal_sequence: Number(value.journal_sequence),
		journal_event_id: String(value.journal_event_id),
	};
}

function receiptFromEvent(event: SuggestionReceiptEvent): SuggestionReceipt {
	const p = event.payload;
	return {
		project_id: String(p.project_id),
		local_date: String(p.local_date),
		suggestion_id: String(p.suggestion_id),
		receipt_status: event.action,
		claimed_by: String(p.claimed_by),
		claim_token_digest: String(p.claim_token_digest),
		generation: Number(p.generation),
		claim_expires_at: String(p.claim_expires_at),
		reject_reason: typeof p.reject_reason === "string" ? p.reject_reason : null,
		evidence_digest: String(p.evidence_digest),
		journal_sequence: event.sequence,
		journal_event_id: event.event_id,
	};
}

function readProjectedReceipt(
	db: Database,
	projectId: string,
	localDate: string,
): SuggestionReceipt | null {
	return receiptFromRow(
		db
			.query(
				"SELECT * FROM daily_suggestion_receipts WHERE project_id = ? AND local_date = ?",
			)
			.get(projectId, localDate),
	);
}

function readBoundedReceiptEvents(
	path: string,
	projectId: string,
): SuggestionReceiptEvent[] {
	const text = readBoundedText(path);
	if (!text) return [];
	let previous = GENESIS;
	const events: SuggestionReceiptEvent[] = [];
	const projected = new Map<string, SuggestionReceipt>();
	for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
		let event: SuggestionReceiptEvent;
		try {
			event = JSON.parse(line) as SuggestionReceiptEvent;
		} catch {
			throw new Error(`invalid suggestion journal JSON at line ${index + 1}`);
		}
		const key = `${projectId}\u0000${String(event.payload.local_date)}`;
		const prior = projected.get(key);
		validateEvent(event, index, previous, projectId, prior);
		events.push(event);
		projected.set(key, receiptFromEvent(event));
		previous = event.event_digest;
	}
	return events;
}

function hydrateBoundedReceiptProjection(
	db: Database,
	projectId: string,
	path: string,
	events = readBoundedReceiptEvents(path, projectId),
): ReceiptJournalTail | null {
	db.exec("BEGIN IMMEDIATE");
	try {
		db.query("DELETE FROM daily_suggestion_receipts WHERE project_id = ?").run(
			projectId,
		);
		for (const receipt of projectSuggestionReceipts(events).values())
			insertReceipt(db, receipt);
		if (events.length > 0) writeProjectionWatermark(db, "receipt", path);
		db.exec("COMMIT");
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {}
		throw error;
	}
	return readJournalTail(path);
}

function prepareReceiptProjection(
	db: Database,
	projectId: string,
	path: string,
): ReceiptJournalTail | null {
	const events = readBoundedReceiptEvents(path, projectId);
	applyMigrations(db);
	const tail = readJournalTail(path);
	try {
		assertProjectionWatermark(db, "receipt", path, Boolean(tail));
	} catch (error) {
		const missingWatermark =
			error instanceof Error && error.message.endsWith("watermark is missing");
		const count = Number(
			(
				db
					.query(
						"SELECT COUNT(*) AS count FROM daily_suggestion_receipts WHERE project_id = ?",
					)
					.get(projectId) as { count?: unknown } | null
			)?.count ?? 0,
		);
		if (missingWatermark && count === 0 && tail)
			return hydrateBoundedReceiptProjection(db, projectId, path, events);
		throw error;
	}
	if (!tail) return null;
	const maxSequence = Number(
		(
			db
				.query(
					"SELECT MAX(journal_sequence) AS sequence FROM daily_suggestion_receipts WHERE project_id = ?",
				)
				.get(projectId) as { sequence?: unknown } | null
		)?.sequence ?? 0,
	);
	if (maxSequence !== tail.event.sequence)
		throw new Error("suggestion receipt projection is stale; rebuild required");
	return tail;
}

function projectReceiptEvent(
	db: Database,
	event: SuggestionReceiptEvent,
	path: string,
): void {
	applyMigrations(db);
	db.exec("BEGIN IMMEDIATE");
	try {
		const projected = projectSuggestionReceipts([event]).get(
			`${String(event.payload.project_id)}\u0000${String(event.payload.local_date)}`,
		);
		if (!projected) throw new Error("suggestion receipt projection is invalid");
		insertReceipt(db, projected);
		writeProjectionWatermark(db, "receipt", path);
		db.exec("COMMIT");
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {}
		throw error;
	}
}
type ReceiptAppendHandle = {
	fd: number;
	path: string;
	previousSize: number;
	opened: ReturnType<typeof fstatSync>;
	created: boolean;
	closed: boolean;
	syncFile: (fd: number) => void;
};

function writeAll(
	fd: number,
	value: Buffer,
	writeBytes?: (fd: number, value: Buffer) => number,
): void {
	let offset = 0;
	while (offset < value.byteLength) {
		const written = writeBytes
			? writeBytes(fd, value.subarray(offset))
			: writeSync(fd, value, offset, value.byteLength - offset, null);
		if (
			!Number.isInteger(written) ||
			written <= 0 ||
			written > value.byteLength - offset
		)
			throw new Error("suggestion journal write was incomplete");
		offset += written;
	}
}

function verifyAppendHandle(handle: ReceiptAppendHandle): void {
	const opened = fstatSync(handle.fd);
	const current = assertSafeEvolutionTarget(
		handle.path,
		"suggestion journal target",
		false,
	);
	if (
		!opened.isFile() ||
		opened.nlink !== 1 ||
		!current ||
		!sameIdentity(opened, current) ||
		!sameIdentity(handle.opened, opened)
	)
		throw new Error(
			"suggestion journal target changed before destructive action",
		);
}

function closeAppendHandle(handle: ReceiptAppendHandle): void {
	if (!handle.closed) {
		closeSync(handle.fd);
		handle.closed = true;
	}
}

function rollbackAppendHandle(handle: ReceiptAppendHandle): void {
	verifyAppendHandle(handle);
	const truncateFd =
		process.platform === "win32"
			? openSync(handle.path, openFlags(fsConstants.O_WRONLY))
			: handle.fd;
	try {
		if (truncateFd !== handle.fd) {
			const opened = fstatSync(truncateFd);
			const current = assertSafeEvolutionTarget(
				handle.path,
				"suggestion journal target",
				false,
			);
			if (
				!opened.isFile() ||
				opened.nlink !== 1 ||
				!current ||
				!sameIdentity(handle.opened, opened) ||
				!sameIdentity(current, opened)
			)
				throw new Error(
					"suggestion journal target changed before destructive action",
				);
		}
		ftruncateSync(truncateFd, handle.previousSize);
		handle.syncFile(truncateFd);
		syncParentDirectory(handle.path);
	} finally {
		if (truncateFd !== handle.fd) closeSync(truncateFd);
		closeAppendHandle(handle);
	}
}

function appendLine(
	path: string,
	line: string,
	options: {
		writeBytes?: (fd: number, value: Buffer) => number;
		syncFile?: (fd: number) => void;
	} = {},
): ReceiptAppendHandle {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const before = assertSafeEvolutionTarget(path, "suggestion journal target");
	const fd = openSync(
		path,
		openFlags(
			fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT,
		),
		0o600,
	);
	const handle: ReceiptAppendHandle = {
		fd,
		path,
		previousSize: Number(before?.size ?? 0),
		opened: fstatSync(fd),
		created: before === null,
		closed: false,
		syncFile: options.syncFile ?? fsyncSync,
	};
	try {
		if (
			!handle.opened.isFile() ||
			handle.opened.nlink !== 1 ||
			(before && !sameIdentity(before, handle.opened))
		)
			throw new Error("suggestion journal target changed before append");
		fchmodSync(fd, 0o600);
		writeAll(fd, Buffer.from(line, "utf8"), options.writeBytes);
		handle.syncFile(fd);
		verifyAppendHandle(handle);
		if (handle.created) syncParentDirectory(path);
		return handle;
	} catch (error) {
		try {
			rollbackAppendHandle(handle);
		} catch (rollbackError) {
			closeAppendHandle(handle);
			throw new AggregateError(
				[error, rollbackError],
				"suggestion journal append and rollback failed",
			);
		}
		throw error;
	}
}

function preflightAppendBudget(path: string, line: string): void {
	const current = readBoundedText(path) ?? "";
	const candidate = Buffer.concat([
		Buffer.from(current, "utf8"),
		Buffer.from(line, "utf8"),
	]);
	if (candidate.byteLength > SUGGESTION_JOURNAL_LIMITS.maxBytes)
		throw new Error("suggestion journal exceeds the byte limit");
	let lineBytes = 0;
	let lineCount = 0;
	for (const byte of candidate) {
		lineBytes += 1;
		if (lineBytes > SUGGESTION_JOURNAL_LIMITS.maxLineBytes)
			throw new Error("suggestion journal line exceeds the byte limit");
		if (byte === 10) {
			lineCount += 1;
			lineBytes = 0;
		}
	}
	if (lineBytes > 0) lineCount += 1;
	if (lineCount > SUGGESTION_JOURNAL_LIMITS.maxLines)
		throw new Error("suggestion journal exceeds the line limit");
}

export function assertSuggestionReceiptAppendBudget(
	path: string,
	line: string,
): void {
	preflightAppendBudget(path, line);
}

function validateEvent(
	event: SuggestionReceiptEvent,
	index: number,
	previous: string,
	projectId: string,
	prior?: SuggestionReceipt,
): void {
	if (
		event.sequence !== index + 1 ||
		!ID_RE.test(event.event_id) ||
		!ID_RE.test(event.subject_id) ||
		event.previous_event_digest !== previous ||
		event.trust_level !== "local_trusted" ||
		Number.isNaN(Date.parse(event.timestamp))
	)
		throw new Error(`invalid suggestion journal event at line ${index + 1}`);
	if (
		event.payload.project_id !== projectId ||
		event.payload.local_date === undefined
	)
		throw new Error("suggestion receipt belongs to another project");
	if (
		!DATE_RE.test(String(event.payload.local_date)) ||
		!DIGEST_RE.test(String(event.payload.evidence_digest)) ||
		!DIGEST_RE.test(String(event.payload.claim_token_digest)) ||
		!ID_RE.test(String(event.payload.suggestion_id)) ||
		!ID_RE.test(String(event.payload.claimed_by)) ||
		event.subject_id !== event.payload.suggestion_id ||
		event.actor !== event.payload.claimed_by ||
		!Number.isInteger(Number(event.payload.generation)) ||
		Number(event.payload.generation) < 1 ||
		Number.isNaN(Date.parse(String(event.payload.claim_expires_at)))
	)
		throw new Error("suggestion receipt payload is invalid");
	const isClaim =
		event.event_type === "receipt_claim" &&
		event.action === "claimed" &&
		event.authority_kind === "system_observer" &&
		event.caller_type === "system";
	const isShown =
		event.event_type === "receipt_shown" &&
		event.action === "shown" &&
		event.authority_kind === "system_observer" &&
		event.caller_type === "system";
	const isDecision =
		event.event_type === "receipt_decision" &&
		["skipped", "accepted", "rejected"].includes(event.action) &&
		event.authority_kind === "explicit_project_user" &&
		event.caller_type === "project_user";
	if (!isClaim && !isShown && !isDecision)
		throw new Error("suggestion receipt event semantics are invalid");
	if (
		event.action === "rejected" &&
		typeof event.payload.reject_reason !== "string"
	)
		throw new Error("rejected suggestion requires a reason");
	if (isDecision && typeof event.payload.source_decision_ref !== "string")
		throw new Error("suggestion decision authority binding is missing");
	if (isClaim) {
		if (!prior && Number(event.payload.generation) !== 1)
			throw new Error("suggestion receipt generation is invalid");
		if (
			prior &&
			(prior.receipt_status !== "claimed" ||
				Number(event.payload.generation) !== prior.generation + 1 ||
				Date.parse(event.timestamp) < Date.parse(prior.claim_expires_at))
		)
			throw new Error("suggestion receipt reclaim transition is invalid");
	} else {
		if (
			!prior ||
			prior.suggestion_id !== event.payload.suggestion_id ||
			prior.claimed_by !== event.payload.claimed_by ||
			prior.generation !== Number(event.payload.generation) ||
			prior.claim_token_digest !== event.payload.claim_token_digest ||
			prior.evidence_digest !== event.payload.evidence_digest ||
			(isShown && prior.receipt_status !== "claimed") ||
			(isDecision && prior.receipt_status !== "shown")
		)
			throw new Error("suggestion receipt state transition is invalid");
	}
	if (event.payload_digest !== digest(event.payload))
		throw new Error(`suggestion payload digest mismatch at line ${index + 1}`);
	const { event_digest: _, ...rest } = event;
	if (event.event_digest !== digest(rest))
		throw new Error(`suggestion event digest mismatch at line ${index + 1}`);
}

export function suggestionJournalPath(
	root: string,
	eventsDir?: string,
): string {
	return pathFor({
		...(eventsDir ? { eventsDir } : {}),
		root,
		projectId: "unused",
	});
}
export function receiptTokenDigest(token: string): string {
	return tokenDigest(token);
}

export function readSuggestionReceiptJournal(
	root: string,
	projectId: string,
	eventsDir?: string,
): SuggestionReceiptEvent[] {
	const text = readBoundedText(
		pathFor({ ...(eventsDir ? { eventsDir } : {}), root, projectId }),
	);
	if (!text || text.trim() === "") return [];
	let previous = GENESIS;
	const events: SuggestionReceiptEvent[] = [];
	const projected = new Map<string, SuggestionReceipt>();
	for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
		let event: SuggestionReceiptEvent;
		try {
			event = JSON.parse(line) as SuggestionReceiptEvent;
		} catch {
			throw new Error(`invalid suggestion journal JSON at line ${index + 1}`);
		}
		const key = `${projectId}\u0000${String(event.payload.local_date)}`;
		const prior = projected.get(key);
		validateEvent(event, index, previous, projectId, prior);
		events.push(event);
		projected.set(key, receiptFromEvent(event));
		previous = event.event_digest;
	}
	return events;
}

export function projectSuggestionReceipts(
	events: readonly SuggestionReceiptEvent[],
): Map<string, SuggestionReceipt> {
	const projected = new Map<string, SuggestionReceipt>();
	for (const event of events) {
		const p = event.payload;
		const key = `${String(p.project_id)}\u0000${String(p.local_date)}`;
		projected.set(key, receiptFromEvent(event));
	}
	return projected;
}

function insertReceipt(db: Database, receipt: SuggestionReceipt): void {
	db.query(
		`INSERT INTO daily_suggestion_receipts(project_id,local_date,suggestion_id,receipt_status,claimed_by,claim_token_digest,generation,claim_expires_at,reject_reason,evidence_digest,journal_sequence,journal_event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,local_date) DO UPDATE SET suggestion_id=excluded.suggestion_id,receipt_status=excluded.receipt_status,claimed_by=excluded.claimed_by,claim_token_digest=excluded.claim_token_digest,generation=excluded.generation,claim_expires_at=excluded.claim_expires_at,reject_reason=excluded.reject_reason,evidence_digest=excluded.evidence_digest,journal_sequence=excluded.journal_sequence,journal_event_id=excluded.journal_event_id`,
	).run(
		receipt.project_id,
		receipt.local_date,
		receipt.suggestion_id,
		receipt.receipt_status,
		receipt.claimed_by,
		receipt.claim_token_digest,
		receipt.generation,
		receipt.claim_expires_at,
		receipt.reject_reason,
		receipt.evidence_digest,
		receipt.journal_sequence,
		receipt.journal_event_id,
	);
}
function replay(
	db: Database,
	projectId: string,
	events: readonly SuggestionReceiptEvent[],
	path?: string,
): void {
	applyMigrations(db);
	db.exec("BEGIN IMMEDIATE");
	try {
		db.query("DELETE FROM daily_suggestion_receipts WHERE project_id = ?").run(
			projectId,
		);
		for (const receipt of projectSuggestionReceipts(events).values())
			insertReceipt(db, receipt);
		if (path && events.length > 0)
			writeProjectionWatermark(db, "receipt", path);
		else if (path) clearProjectionWatermark(db, "receipt");
		db.exec("COMMIT");
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {}
		throw error;
	}
}

function appendReceipt(
	input: Context & {
		db?: Database;
		event: SuggestionReceiptEvent;
		writeBytes?: (fd: number, value: Buffer) => number;
		syncFile?: (fd: number) => void;
	},
): SuggestionReceiptEvent {
	const path = pathFor(input);
	const priorReceipt = input.db
		? readProjectedReceipt(
				input.db,
				input.projectId,
				String(input.event.payload.local_date),
			)
		: null;
	const line = `${JSON.stringify(input.event)}\n`;
	preflightAppendBudget(path, line);
	const handle = appendLine(path, line, {
		...(input.writeBytes ? { writeBytes: input.writeBytes } : {}),
		...(input.syncFile ? { syncFile: input.syncFile } : {}),
	});
	try {
		if (input.db) {
			projectReceiptEvent(input.db, input.event, path);
			writeEvolutionProjectionCheckpoint({
				root: input.root,
				db: input.db,
				projectId: input.projectId,
				...(input.eventsDir ? { eventsDir: input.eventsDir } : {}),
				now: new Date(input.event.timestamp),
			});
		}
		closeAppendHandle(handle);
		return input.event;
	} catch (error) {
		let rollbackError: unknown;
		try {
			rollbackAppendHandle(handle);
		} catch (error) {
			rollbackError = error;
			closeAppendHandle(handle);
		}
		if (input.db) {
			input.db.exec("BEGIN IMMEDIATE");
			try {
				if (priorReceipt) insertReceipt(input.db, priorReceipt);
				else
					input.db
						.query(
							"DELETE FROM daily_suggestion_receipts WHERE project_id = ? AND local_date = ?",
						)
						.run(input.projectId, String(input.event.payload.local_date));
				if (handle.previousSize > 0)
					writeProjectionWatermark(input.db, "receipt", path);
				else clearProjectionWatermark(input.db, "receipt");
				input.db.exec("COMMIT");
			} catch (restoreError) {
				try {
					input.db.exec("ROLLBACK");
				} catch {}
				rollbackError =
					rollbackError === undefined
						? restoreError
						: new AggregateError([rollbackError, restoreError]);
			}
		}
		if (rollbackError !== undefined)
			throw new AggregateError(
				[error, rollbackError],
				"suggestion receipt append and rollback failed",
			);
		throw error;
	}
}

export function claimDailySuggestion(input: ClaimInput): {
	event: SuggestionReceiptEvent;
	claim_token: string;
	generation: number;
} {
	return withSessionLock(input.root, LOCK, () => {
		validateId(input.suggestionId, "suggestion id");
		validateId(input.claimedBy, "claimed_by");
		validateDigest(input.evidenceDigest, "evidence digest");
		const now = input.now ?? new Date();
		const localDate = resolvedDate(
			input.root,
			input.projectId,
			input.localDate,
			now,
		);
		const path = pathFor(input);
		const events = input.db
			? []
			: readSuggestionReceiptJournal(
					input.root,
					input.projectId,
					input.eventsDir,
				);
		const tail = input.db
			? prepareReceiptProjection(input.db, input.projectId, path)
			: null;
		const current = input.db
			? readProjectedReceipt(input.db, input.projectId, localDate)
			: projectSuggestionReceipts(events).get(
					`${input.projectId}\u0000${localDate}`,
				);
		if (current && current.receipt_status !== "claimed")
			throw new Error("daily suggestion already acknowledged");
		if (current && Date.parse(current.claim_expires_at) > now.getTime())
			throw new Error("daily suggestion claim is active");
		const generation = (current?.generation ?? 0) + 1;
		const token = randomBytes(32).toString("base64url");
		const expires = new Date(
			now.getTime() +
				Math.max(1_000, Math.min(input.ttlMs ?? 120_000, 86_400_000)),
		);
		const payload = {
			project_id: input.projectId,
			local_date: localDate,
			suggestion_id: input.suggestionId,
			claimed_by: input.claimedBy,
			claim_token_digest: tokenDigest(token),
			generation,
			claim_expires_at: expires.toISOString(),
			evidence_digest: input.evidenceDigest,
			reject_reason: null,
		};
		const base = {
			sequence: (tail?.event.sequence ?? events.length) + 1,
			event_id: input.eventId ?? `REC-${randomUUID()}`,
			event_type: "receipt_claim" as const,
			action: "claimed" as const,
			authority_kind: "system_observer" as const,
			actor: input.claimedBy,
			caller_type: "system" as const,
			trust_level: "local_trusted" as const,
			origin_ref: relative(input.root, pathFor(input)).replaceAll("\\", "/"),
			subject_id: input.suggestionId,
			timestamp: now.toISOString(),
			command: "afol evolve suggest claim",
			previous_event_digest:
				tail?.event.event_digest ?? events.at(-1)?.event_digest ?? GENESIS,
			payload,
			payload_digest: digest(payload),
		};
		const event = {
			...base,
			event_digest: digest(base),
		} as SuggestionReceiptEvent;
		validateEvent(
			event,
			event.sequence - 1,
			base.previous_event_digest,
			input.projectId,
			current ?? undefined,
		);
		appendReceipt({ ...input, event });
		return { event, claim_token: token, generation };
	});
}

export function acknowledgeDailySuggestion(
	input: AckInput,
): SuggestionReceiptEvent {
	return withSessionLock(input.root, LOCK, () => {
		validateId(input.suggestionId, "suggestion id");
		validateId(input.claimedBy, "claimed_by");
		validateDigest(input.evidenceDigest, "evidence digest");
		const now = input.now ?? new Date();
		const localDate = resolvedDate(
			input.root,
			input.projectId,
			input.localDate,
			now,
		);
		const reason = validateReason(input.rejectReason);
		const path = pathFor(input);
		const events = input.db
			? []
			: readSuggestionReceiptJournal(
					input.root,
					input.projectId,
					input.eventsDir,
				);
		const tail = input.db
			? prepareReceiptProjection(input.db, input.projectId, path)
			: null;
		if (input.eventId) {
			const retry = input.db
				? tail?.event.event_id === input.eventId
					? tail.event
					: undefined
				: events.find((event) => event.event_id === input.eventId);
			if (retry) {
				if (
					retry.subject_id !== input.suggestionId ||
					retry.action !== input.action
				)
					throw new Error("suggestion journal event id already exists");
				return retry;
			}
		}
		const current = input.db
			? readProjectedReceipt(input.db, input.projectId, localDate)
			: projectSuggestionReceipts(events).get(
					`${input.projectId}\u0000${localDate}`,
				);
		if (
			!current ||
			current.suggestion_id !== input.suggestionId ||
			current.claimed_by !== input.claimedBy ||
			current.generation !== input.generation ||
			current.evidence_digest !== input.evidenceDigest
		)
			throw new Error("suggestion receipt claim fence mismatch");
		const requiresClaimToken =
			input.action === "shown" || current.receipt_status === "claimed";
		if (
			requiresClaimToken &&
			(!input.claimToken ||
				!tokenMatches(input.claimToken, current.claim_token_digest))
		)
			throw new Error("suggestion receipt claim fence mismatch");
		if (
			current.receipt_status === "accepted" ||
			current.receipt_status === "skipped" ||
			current.receipt_status === "rejected" ||
			(current.receipt_status === "shown" && input.action === "shown")
		)
			throw new Error("suggestion receipt already acknowledged");
		if (
			input.db &&
			(!tail ||
				current.journal_sequence !== tail.event.sequence ||
				current.journal_event_id !== tail.event.event_id)
		)
			throw new Error(
				"suggestion receipt projection is stale; rebuild required",
			);
		const claimEvent = input.db
			? tail?.event
			: events.find((event) => event.sequence === current.journal_sequence);
		if (claimEvent && now.getTime() < Date.parse(claimEvent.timestamp))
			throw new Error("suggestion receipt clock moved backwards");
		if (
			current.receipt_status === "claimed" &&
			Date.parse(current.claim_expires_at) < now.getTime()
		)
			throw new Error("suggestion receipt claim expired");
		if (input.action === "rejected" && reason === null)
			throw new Error("rejected suggestion requires a reason");
		let sourceDecisionRef: string | undefined;
		if (input.action !== "shown") {
			if (!input.authority)
				throw new Error("suggestion decision requires project-user authority");
			const decision = suggestionDecisionForAuthority(input.authority);
			sourceDecisionRef = decision.sourceDecisionRef;
			assertSuggestionAuthority(
				input.authority,
				input.projectId,
				"project_user",
				{
					localDate,
					suggestionId: input.suggestionId,
					evidenceDigest: input.evidenceDigest,
					action: input.action,
					sourceDecisionRef,
					...(reason ? { reason } : {}),
				},
			);
		}
		const payload = {
			project_id: input.projectId,
			local_date: localDate,
			suggestion_id: input.suggestionId,
			claimed_by: input.claimedBy,
			claim_token_digest: current.claim_token_digest,
			generation: current.generation,
			claim_expires_at: current.claim_expires_at,
			evidence_digest: input.evidenceDigest,
			reject_reason: reason,
			...(sourceDecisionRef ? { source_decision_ref: sourceDecisionRef } : {}),
		};
		const base = {
			sequence: (tail?.event.sequence ?? events.length) + 1,
			event_id: input.eventId ?? `REC-${randomUUID()}`,
			event_type:
				input.action === "shown"
					? ("receipt_shown" as const)
					: ("receipt_decision" as const),
			action: input.action,
			authority_kind:
				input.action === "shown"
					? ("system_observer" as const)
					: ("explicit_project_user" as const),
			actor: input.claimedBy,
			caller_type:
				input.action === "shown"
					? ("system" as const)
					: ("project_user" as const),
			trust_level: "local_trusted" as const,
			origin_ref: relative(input.root, pathFor(input)).replaceAll("\\", "/"),
			subject_id: input.suggestionId,
			timestamp: now.toISOString(),
			command: `afol evolve suggestion ${input.action}`,
			previous_event_digest:
				tail?.event.event_digest ?? events.at(-1)?.event_digest ?? GENESIS,
			payload,
			payload_digest: digest(payload),
		};
		const event = {
			...base,
			event_digest: digest(base),
		} as SuggestionReceiptEvent;
		validateEvent(
			event,
			event.sequence - 1,
			base.previous_event_digest,
			input.projectId,
			current ?? undefined,
		);
		appendReceipt({ ...input, event });
		return event;
	});
}

export function validateSuggestionReceiptProjection(
	context: Context & { db: Database },
): void {
	const events = readSuggestionReceiptJournal(
		context.root,
		context.projectId,
		context.eventsDir,
	);
	const expected = new Database(":memory:");
	try {
		applyMigrations(expected);
		replay(expected, context.projectId, events);
		const actual = context.db
			.query(
				"SELECT * FROM daily_suggestion_receipts WHERE project_id = ? ORDER BY local_date",
			)
			.all(context.projectId);
		const projected = expected
			.query(
				"SELECT * FROM daily_suggestion_receipts WHERE project_id = ? ORDER BY local_date",
			)
			.all(context.projectId);
		if (digest(actual) !== digest(projected))
			throw new Error(
				"evolution db daily suggestion receipt projection differs from canonical journal",
			);
	} finally {
		expected.close();
	}
}

export function rebuildSuggestionReceiptProjection(
	input: Context & {
		db: Database;
	},
): void {
	withSessionLock(input.root, LOCK, () => {
		const path = pathFor(input);
		const events = readSuggestionReceiptJournal(
			input.root,
			input.projectId,
			input.eventsDir,
		);
		replay(input.db, input.projectId, events, path);
		writeEvolutionProjectionCheckpoint({
			root: input.root,
			db: input.db,
			projectId: input.projectId,
			...(input.eventsDir ? { eventsDir: input.eventsDir } : {}),
		});
	});
}
