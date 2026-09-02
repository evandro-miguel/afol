import {
	closeSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	ftruncateSync,
	mkdirSync,
	openSync,
	readSync,
	writeSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
	assertSafeSourceFile,
	type BoundedSourceLimits,
	readBoundedSourceFile,
} from "../io/safe-source";
import { withResourceLocks } from "../io/session-lock";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";

const EVENT_LEDGER_LABEL = "project event ledger";
const MAX_REPORTED_ISSUES = 5;
const STRICT_ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const EVENT_LEDGER_LIMITS: BoundedSourceLimits = Object.freeze({
	maxBytes: 16 * 1024 * 1024,
	maxLines: 100_000,
	maxCandidates: 100_000,
});

const WORKBENCH_EVENT_TYPES = new Set([
	"workbench.new",
	"workbench.start_task",
	"workbench.transition_task",
	"workbench.record_evidence",
	"workbench.mark_done",
	"workbench.append_log",
	"workbench.close",
	"workbench.archive",
	"workbench.restore",
]);
const TELEMETRY_EVENT_TYPES = new Set([
	"session_start",
	"session_end",
	"task_start",
	"task_complete",
	"tool_exec",
	"error",
	"blocker",
]);

export type EventLedgerIssueCode =
	| "EVENT_LEDGER_UNREADABLE"
	| "EVENT_LEDGER_LIMIT_EXCEEDED"
	| "EVENT_LEDGER_TRUNCATED_TAIL"
	| "EVENT_LEDGER_MALFORMED_JSON"
	| "EVENT_LEDGER_NON_OBJECT"
	| "EVENT_LEDGER_SCHEMA_INVALID"
	| "EVENT_LEDGER_DUPLICATE_ID"
	| "EVENT_LEDGER_LEGACY_RECORD"
	| "EVENT_LEDGER_UNKNOWN_EVENT_TYPE"
	| "EVENT_LEDGER_MISSING_FINAL_NEWLINE";

export type EventLedgerIssue = {
	code: EventLedgerIssueCode;
	severity: "error" | "warning";
	line?: number;
};

export type EventLedgerValidation = {
	ok: boolean;
	record_count: number;
	error_count: number;
	warning_count: number;
	issues: EventLedgerIssue[];
	omitted_issue_count: number;
};

export type EventLedgerInspection = EventLedgerValidation & {
	records: Record<string, unknown>[];
};

type FilteredRecordCollection = {
	predicate: (record: Record<string, unknown>) => boolean;
	limits: BoundedSourceLimits;
	bytes: number;
	lines: number;
	candidates: number;
	limitExceeded: boolean;
};

export type DurableJsonlIo = {
	afterValidation?: () => void;
	writeBytes?: (fd: number, value: Buffer) => number;
	syncFile?: (fd: number) => void;
	truncateFile?: (fd: number, size: number) => void;
	closeFile?: (fd: number) => void;
	syncDirectory?: (path: string) => void;
};

export class EventLedgerValidationError extends Error {
	readonly validation: EventLedgerValidation;

	constructor(validation: EventLedgerValidation) {
		const sanitized = sanitizeValidation(validation);
		const first =
			sanitized.issues.find((issue) => issue.severity === "error") ??
			sanitized.issues[0];
		const location = first?.line ? ` line=${first.line}` : "";
		super(
			`${first?.code ?? "EVENT_LEDGER_UNREADABLE"}${location}: event ledger is invalid; explicit repair required`,
		);
		this.name = "EventLedgerValidationError";
		this.validation = sanitized;
	}
}

function sanitizeValidation(
	validation: EventLedgerValidation,
): EventLedgerValidation {
	return {
		ok: validation.ok,
		record_count: validation.record_count,
		error_count: validation.error_count,
		warning_count: validation.warning_count,
		issues: validation.issues.map((issue) => ({
			code: issue.code,
			severity: issue.severity,
			...(issue.line === undefined ? {} : { line: issue.line }),
		})),
		omitted_issue_count: validation.omitted_issue_count,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function strictIsoInstant(value: unknown): value is string {
	return (
		nonemptyString(value) &&
		STRICT_ISO_INSTANT.test(value) &&
		Number.isFinite(Date.parse(value)) &&
		new Date(value).toISOString() === value
	);
}

function sameIdentity(
	left: { dev: string | number | bigint; ino: string | number | bigint },
	right: { dev: string | number | bigint; ino: string | number | bigint },
): boolean {
	return (
		String(left.dev) === String(right.dev) &&
		String(left.ino) === String(right.ino)
	);
}

function sameSnapshot(
	left: ReturnType<typeof fstatSync>,
	right: ReturnType<typeof fstatSync>,
): boolean {
	return (
		sameIdentity(left, right) &&
		Number(left.size) === Number(right.size) &&
		Number(left.mtimeMs) === Number(right.mtimeMs) &&
		Number(left.ctimeMs) === Number(right.ctimeMs)
	);
}

function safeOpenFlags(flags: number): number {
	return (
		flags | (process.platform === "win32" ? 0 : (fsConstants.O_NOFOLLOW ?? 0))
	);
}

export function resolveEventLedgerPath(root: string): string {
	const projectRoot = resolve(root);
	const projectPaths = resolveProjectPaths(projectRoot);
	const resolved = resolveProjectWritePath(
		projectRoot,
		projectPaths.eventsFile,
	);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}

function verifyOpenedTarget(
	path: string,
	opened: ReturnType<typeof fstatSync>,
): void {
	if (!opened.isFile() || Number(opened.nlink) !== 1)
		throw new Error("event ledger target must be a private regular file");
	const current = assertSafeSourceFile(path, EVENT_LEDGER_LABEL, false);
	if (!current || !sameIdentity(opened, current))
		throw new Error("event ledger target changed during access");
}

function hasLfTail(fd: number, size: number): boolean {
	if (size === 0) return true;
	const tail = Buffer.allocUnsafe(1);
	return readSync(fd, tail, 0, 1, size - 1) === 1 && tail[0] === 10;
}

function countLfBytes(fd: number, size: number): number {
	const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(size, 1)));
	let offset = 0;
	let lines = 0;
	while (offset < size) {
		const bytesRead = readSync(
			fd,
			chunk,
			0,
			Math.min(chunk.byteLength, size - offset),
			offset,
		);
		if (bytesRead === 0)
			throw new Error("event ledger changed during append preflight");
		for (let index = 0; index < bytesRead; index += 1)
			if (chunk[index] === 10) lines += 1;
		offset += bytesRead;
	}
	return lines;
}

function limitExceededValidation(): EventLedgerValidation {
	return {
		ok: false,
		record_count: 0,
		error_count: 1,
		warning_count: 0,
		issues: [
			{
				code: "EVENT_LEDGER_LIMIT_EXCEEDED",
				severity: "error",
			},
		],
		omitted_issue_count: 0,
	};
}

function assertAppendWithinLimits(
	fd: number,
	originalSize: number,
	payloadSize: number,
	payloadLines: number,
	validatedExistingLines?: number,
): void {
	if (
		!Number.isSafeInteger(originalSize) ||
		originalSize < 0 ||
		payloadSize > EVENT_LEDGER_LIMITS.maxBytes ||
		originalSize > EVENT_LEDGER_LIMITS.maxBytes - payloadSize
	)
		throw new EventLedgerValidationError(limitExceededValidation());
	const existingLines =
		validatedExistingLines ?? countLfBytes(fd, originalSize);
	if (
		payloadLines > EVENT_LEDGER_LIMITS.maxLines ||
		existingLines > EVENT_LEDGER_LIMITS.maxLines - payloadLines ||
		payloadLines > EVENT_LEDGER_LIMITS.maxCandidates ||
		existingLines > EVENT_LEDGER_LIMITS.maxCandidates - payloadLines
	)
		throw new EventLedgerValidationError(limitExceededValidation());
}

function writeAll(
	fd: number,
	value: Buffer,
	writeBytes: NonNullable<DurableJsonlIo["writeBytes"]>,
): void {
	let offset = 0;
	while (offset < value.byteLength) {
		const remaining = value.subarray(offset);
		const written = writeBytes(fd, remaining);
		if (
			!Number.isInteger(written) ||
			written <= 0 ||
			written > remaining.byteLength
		)
			throw new Error("event ledger write was incomplete");
		offset += written;
	}
}

function syncParentDirectory(path: string): void {
	if (process.platform === "win32") return;
	const directoryFd = openSync(
		dirname(path),
		fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0),
	);
	try {
		fsyncSync(directoryFd);
	} finally {
		closeSync(directoryFd);
	}
}

function rollbackAppendedBytes(
	path: string,
	originalSize: number,
	opened: ReturnType<typeof fstatSync>,
	truncateFile: NonNullable<DurableJsonlIo["truncateFile"]>,
	syncFile: NonNullable<DurableJsonlIo["syncFile"]>,
): void {
	// Windows does not permit ftruncate on a descriptor opened with O_APPEND.
	// Open a second descriptor without O_APPEND, then prove it still identifies
	// the append target before mutating it. If that proof fails, leave the
	// primary error intact and report rollback failure instead of truncating a
	// pathname replacement.
	const rollbackFd = openSync(path, safeOpenFlags(fsConstants.O_RDWR));
	try {
		const rollbackOpened = fstatSync(rollbackFd);
		if (!sameIdentity(opened, rollbackOpened))
			throw new Error("event ledger target changed during rollback");
		verifyOpenedTarget(path, rollbackOpened);
		truncateFile(rollbackFd, originalSize);
		syncFile(rollbackFd);
		verifyOpenedTarget(path, fstatSync(rollbackFd));
	} finally {
		closeSync(rollbackFd);
	}
}

/**
 * Append one or more JSON objects plus LF under the global event-file lock.
 * Success is returned only after every byte and the file have been synced.
 * A process crash before the successful sync remains subject to filesystem and
 * device durability guarantees; existing corrupt tails are never auto-repaired.
 */
export function appendEventLedgerRecords<T extends Record<string, unknown>>(
	root: string,
	records: readonly T[],
	io: DurableJsonlIo = {},
	validated?: {
		identity: ReturnType<typeof fstatSync> | null;
		recordCount: number;
	},
): T[] {
	if (records.length === 0) return [];
	const path = resolveEventLedgerPath(root);
	const serialized = records.map((record) => {
		const value = JSON.stringify(record);
		if (value === undefined)
			throw new Error("event ledger record must be a JSON object");
		return value;
	});
	const payload = Buffer.from(`${serialized.join("\n")}\n`, "utf8");

	return withResourceLocks(root, [path], () => {
		if (resolveEventLedgerPath(root) !== path)
			throw new Error("event ledger path changed before append");
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		const before = assertSafeSourceFile(path, EVENT_LEDGER_LABEL);
		if (
			validated &&
			((validated.identity === null && before !== null) ||
				(validated.identity !== null &&
					(before === null || !sameSnapshot(validated.identity, before))))
		) {
			throw new Error("event ledger target changed after validation");
		}
		const fd = openSync(
			path,
			safeOpenFlags(
				fsConstants.O_RDWR | fsConstants.O_APPEND | fsConstants.O_CREAT,
			),
			0o600,
		);
		const writeBytes =
			io.writeBytes ??
			((targetFd: number, value: Buffer) =>
				writeSync(targetFd, value, 0, value.byteLength, null));
		const syncFile = io.syncFile ?? fsyncSync;
		const truncateFile = io.truncateFile ?? ftruncateSync;
		const closeFile = io.closeFile ?? closeSync;
		const syncDirectory = io.syncDirectory ?? syncParentDirectory;
		let originalSize = 0;
		let appendAttempted = false;
		let primaryError: unknown;
		let rollbackError: unknown;
		let closeError: unknown;

		try {
			const opened = fstatSync(fd);
			verifyOpenedTarget(path, opened);
			if (before && !sameIdentity(before, opened))
				throw new Error("event ledger target changed before append");
			if (validated?.identity && !sameSnapshot(validated.identity, opened)) {
				throw new Error("event ledger target changed after validation");
			}
			originalSize = Number(opened.size);
			if (!hasLfTail(fd, originalSize))
				throw new EventLedgerValidationError({
					ok: false,
					record_count: 0,
					error_count: 1,
					warning_count: 0,
					issues: [
						{
							code: "EVENT_LEDGER_TRUNCATED_TAIL",
							severity: "error",
						},
					],
					omitted_issue_count: 0,
				});
			assertAppendWithinLimits(
				fd,
				originalSize,
				payload.byteLength,
				records.length,
				validated?.recordCount,
			);

			appendAttempted = true;
			writeAll(fd, payload, writeBytes);
			const afterWrite = fstatSync(fd);
			if (
				!Number.isSafeInteger(originalSize) ||
				Number(afterWrite.size) !== originalSize + payload.byteLength
			)
				throw new Error("event ledger write size is inconsistent");
			syncFile(fd);
			verifyOpenedTarget(path, afterWrite);
			if (before === null) syncDirectory(path);
			verifyOpenedTarget(path, fstatSync(fd));
		} catch (error) {
			primaryError = error;
			if (appendAttempted) {
				try {
					rollbackAppendedBytes(
						path,
						originalSize,
						fstatSync(fd),
						truncateFile,
						syncFile,
					);
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
			if (rollbackError !== undefined) {
				throw new AggregateError(
					[primaryError, rollbackError],
					"event ledger append and rollback failed",
				);
			}
			throw primaryError;
		}
		if (closeError !== undefined) throw closeError;
		return [...records];
	});
}

/** Append one JSON object with the same atomic durability contract as a batch. */
export function appendEventLedgerRecord<T extends Record<string, unknown>>(
	root: string,
	record: T,
	io: DurableJsonlIo = {},
): T {
	appendEventLedgerRecords(root, [record], io);
	return record;
}

/**
 * Validate the existing ledger and the prospective records under the same
 * canonical resource lock, then durably append the complete batch.
 */
export function appendValidatedEventLedgerRecords<
	T extends Record<string, unknown>,
>(root: string, records: readonly T[], io: DurableJsonlIo = {}): T[] {
	if (records.length === 0) return [];
	const path = resolveEventLedgerPath(root);
	return withResourceLocks(root, [path], () => {
		const validatedIdentity = assertSafeSourceFile(
			path,
			EVENT_LEDGER_LABEL,
			false,
		);
		const existing = readInspectionUnlocked(path, EVENT_LEDGER_LIMITS, true);
		if (!existing.ok) {
			throw new EventLedgerValidationError(existing);
		}
		io.afterValidation?.();
		const currentIdentity = assertSafeSourceFile(
			path,
			EVENT_LEDGER_LABEL,
			false,
		);
		if (
			(validatedIdentity === null && currentIdentity !== null) ||
			(validatedIdentity !== null &&
				(currentIdentity === null ||
					!sameSnapshot(validatedIdentity, currentIdentity)))
		) {
			throw new Error("event ledger target changed after validation");
		}

		const prospectiveText = `${records
			.map((record) => JSON.stringify(record))
			.join("\n")}\n`;
		const prospective = inspectEventLedgerText(prospectiveText);
		if (!prospective.ok) {
			throw new EventLedgerValidationError(prospective);
		}
		const existingIds = new Set(
			existing.records
				.map((record) => record.id)
				.filter((id): id is string => nonemptyString(id)),
		);
		for (const [index, record] of records.entries()) {
			if (nonemptyString(record.id) && existingIds.has(record.id)) {
				throw new EventLedgerValidationError({
					ok: false,
					record_count: existing.record_count,
					error_count: 1,
					warning_count: 0,
					issues: [
						{
							code: "EVENT_LEDGER_DUPLICATE_ID",
							severity: "error",
							line: existing.record_count + index + 1,
						},
					],
					omitted_issue_count: 0,
				});
			}
		}
		return appendEventLedgerRecords(root, records, io, {
			identity: validatedIdentity,
			recordCount: existing.record_count,
		});
	});
}

function addIssue(
	state: {
		errorCount: number;
		warningCount: number;
		issues: EventLedgerIssue[];
		totalIssues: number;
	},
	issue: EventLedgerIssue,
): void {
	state.totalIssues += 1;
	if (issue.severity === "error") state.errorCount += 1;
	else state.warningCount += 1;
	if (state.issues.length < MAX_REPORTED_ISSUES) {
		state.issues.push(issue);
	} else if (
		issue.severity === "error" &&
		!state.issues.some((candidate) => candidate.severity === "error")
	) {
		state.issues[state.issues.length - 1] = issue;
	}
}

function validateRecordShape(
	record: Record<string, unknown>,
	line: number,
	state: Parameters<typeof addIssue>[0],
): boolean {
	const canonicalWorkbench =
		record.source === "cli-workbench" &&
		strictIsoInstant(record.ts) &&
		(record.type !== undefined || record.session !== undefined);
	if (canonicalWorkbench) {
		const valid =
			nonemptyString(record.id) &&
			nonemptyString(record.type) &&
			WORKBENCH_EVENT_TYPES.has(record.type) &&
			nonemptyString(record.session) &&
			record.event_type === undefined &&
			record.session_id === undefined &&
			strictIsoInstant(record.ts) &&
			(record.schema_version === undefined || record.schema_version === "1") &&
			(record.taskId === undefined || typeof record.taskId === "string") &&
			(record.command === undefined || typeof record.command === "string") &&
			(record.result === undefined || typeof record.result === "string") &&
			(record.detail === undefined || isRecord(record.detail));
		if (!valid) {
			addIssue(state, {
				code: "EVENT_LEDGER_SCHEMA_INVALID",
				severity: "error",
				line,
			});
		}
		return valid;
	}

	const canonicalTelemetry =
		record.source === "afol-cli" &&
		record.schema_version === "1" &&
		(record.event_type !== undefined || record.session_id !== undefined);
	if (canonicalTelemetry) {
		const valid =
			nonemptyString(record.id) &&
			nonemptyString(record.event_type) &&
			TELEMETRY_EVENT_TYPES.has(record.event_type) &&
			nonemptyString(record.session_id) &&
			record.type === undefined &&
			record.session === undefined &&
			strictIsoInstant(record.ts) &&
			(record.task_id === undefined || typeof record.task_id === "string") &&
			(record.cmd_type === undefined || typeof record.cmd_type === "string") &&
			(record.note === undefined || typeof record.note === "string") &&
			(record.error_type === undefined ||
				typeof record.error_type === "string") &&
			(record.outcome === undefined ||
				record.outcome === "success" ||
				record.outcome === "failure") &&
			(record.provenance === undefined ||
				record.provenance === "declared" ||
				record.provenance === "observed");
		if (!valid) {
			addIssue(state, {
				code: "EVENT_LEDGER_SCHEMA_INVALID",
				severity: "error",
				line,
			});
		}
		return valid;
	}

	const idValid = nonemptyString(record.id);
	const hasWorkbenchDiscriminant =
		record.type !== undefined || record.session !== undefined;
	const hasTelemetryDiscriminant =
		record.event_type !== undefined || record.session_id !== undefined;
	const workbench =
		hasWorkbenchDiscriminant &&
		nonemptyString(record.type) &&
		nonemptyString(record.session);
	const telemetry =
		hasTelemetryDiscriminant &&
		nonemptyString(record.event_type) &&
		nonemptyString(record.session_id);

	if (
		!idValid ||
		workbench === telemetry ||
		(hasWorkbenchDiscriminant && !workbench) ||
		(hasTelemetryDiscriminant && !telemetry)
	) {
		addIssue(state, {
			code: "EVENT_LEDGER_SCHEMA_INVALID",
			severity: "error",
			line,
		});
		return false;
	}

	const optionalStringFields = workbench
		? ["taskId", "command", "result"]
		: ["task_id", "cmd_type", "note", "error_type"];
	const invalidOptionalString = optionalStringFields.some(
		(field) => record[field] !== undefined && typeof record[field] !== "string",
	);
	const invalidWorkbenchDetail =
		workbench && record.detail !== undefined && !isRecord(record.detail);
	const invalidTelemetryEnum =
		telemetry &&
		((record.outcome !== undefined &&
			record.outcome !== "success" &&
			record.outcome !== "failure") ||
			(record.provenance !== undefined &&
				record.provenance !== "declared" &&
				record.provenance !== "observed"));
	const invalidTimestamp =
		record.ts !== undefined && !strictIsoInstant(record.ts);
	const invalidSource =
		record.source !== undefined && !nonemptyString(record.source);
	const invalidSchema =
		record.schema_version !== undefined && record.schema_version !== "1";
	const invalidDeclaredTelemetryV1 =
		telemetry &&
		record.schema_version === "1" &&
		(record.source !== "afol-cli" || !strictIsoInstant(record.ts));
	if (
		invalidSchema ||
		invalidDeclaredTelemetryV1 ||
		invalidTimestamp ||
		invalidSource ||
		invalidOptionalString ||
		invalidWorkbenchDetail ||
		invalidTelemetryEnum
	) {
		addIssue(state, {
			code: "EVENT_LEDGER_SCHEMA_INVALID",
			severity: "error",
			line,
		});
		return false;
	}

	const eventType = workbench ? String(record.type) : String(record.event_type);
	const knownType = workbench
		? WORKBENCH_EVENT_TYPES.has(eventType)
		: TELEMETRY_EVENT_TYPES.has(eventType);
	const canonicalDeclared = workbench
		? record.source === "cli-workbench"
		: record.schema_version === "1" || record.source === "afol-cli";
	if (!knownType && canonicalDeclared) {
		addIssue(state, {
			code: "EVENT_LEDGER_SCHEMA_INVALID",
			severity: "error",
			line,
		});
		return false;
	}
	if (!knownType)
		addIssue(state, {
			code: "EVENT_LEDGER_UNKNOWN_EVENT_TYPE",
			severity: "warning",
			line,
		});

	const canonical = workbench
		? record.source === "cli-workbench" && nonemptyString(record.ts)
		: record.source === "afol-cli" &&
			record.schema_version === "1" &&
			nonemptyString(record.ts);
	if (!canonical)
		addIssue(state, {
			code: "EVENT_LEDGER_LEGACY_RECORD",
			severity: "warning",
			line,
		});
	return true;
}

function inspectParsedRecord(
	parsed: unknown,
	line: number,
	lineBytes: number,
	state: {
		errorCount: number;
		warningCount: number;
		issues: EventLedgerIssue[];
		totalIssues: number;
		recordCount: number;
	},
	ids: Set<string>,
	records: Record<string, unknown>[],
	collectRecords: boolean,
	filteredCollection?: FilteredRecordCollection,
): boolean {
	if (!isRecord(parsed)) {
		addIssue(state, {
			code: "EVENT_LEDGER_NON_OBJECT",
			severity: "error",
			line,
		});
		return false;
	}
	state.recordCount += 1;
	if (filteredCollection?.predicate(parsed)) {
		filteredCollection.bytes += lineBytes;
		filteredCollection.lines += 1;
		filteredCollection.candidates += 1;
		if (
			filteredCollection.bytes > filteredCollection.limits.maxBytes ||
			filteredCollection.lines > filteredCollection.limits.maxLines ||
			filteredCollection.candidates > filteredCollection.limits.maxCandidates
		) {
			if (!filteredCollection.limitExceeded) {
				addIssue(state, {
					code: "EVENT_LEDGER_LIMIT_EXCEEDED",
					severity: "error",
					line,
				});
				filteredCollection.limitExceeded = true;
			}
		} else {
			records.push(parsed);
		}
	} else if (collectRecords) {
		records.push(parsed);
	}
	const validShape = validateRecordShape(parsed, line, state);
	let duplicate = false;
	if (nonemptyString(parsed.id)) {
		if (ids.has(parsed.id)) {
			duplicate = true;
			addIssue(state, {
				code: "EVENT_LEDGER_DUPLICATE_ID",
				severity: "error",
				line,
			});
		} else ids.add(parsed.id);
	}
	return validShape && !duplicate;
}

function parseJsonLinesFast(text: string): unknown[] | null {
	if (text.length === 0) return [];
	if (!text.endsWith("\n")) return null;
	if (/(?:^|\n)[\t ]*(?:\n|$)/.test(text)) return null;
	try {
		const parsed = Bun.JSONL.parse(text);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function inspectEventLedgerTextInternal(
	text: string,
	collectRecords: boolean,
	filteredCollection?: FilteredRecordCollection,
): EventLedgerInspection {
	const state = {
		errorCount: 0,
		warningCount: 0,
		issues: [] as EventLedgerIssue[],
		totalIssues: 0,
		recordCount: 0,
	};
	const records: Record<string, unknown>[] = [];
	const ids = new Set<string>();
	const missingFinalNewline = text.length > 0 && !text.endsWith("\n");
	let lastNonemptyLineWasValidRecord = false;
	let lastNonemptyLine = 0;
	const fastRecords = parseJsonLinesFast(text);
	if (fastRecords) {
		let fastOffset = 0;
		for (let index = 0; index < fastRecords.length; index += 1) {
			const line = index + 1;
			const record = fastRecords[index];
			const newline = filteredCollection ? text.indexOf("\n", fastOffset) : -1;
			const lineEnd = newline === -1 ? text.length : newline;
			const matchesFilter =
				filteredCollection &&
				isRecord(record) &&
				filteredCollection.predicate(record);
			const lineBytes = matchesFilter
				? Buffer.byteLength(text.slice(fastOffset, lineEnd), "utf8") +
					(newline === -1 ? 0 : 1)
				: 0;
			lastNonemptyLine = line;
			lastNonemptyLineWasValidRecord = inspectParsedRecord(
				record,
				line,
				lineBytes,
				state,
				ids,
				records,
				collectRecords,
				filteredCollection,
			);
			if (filteredCollection && newline !== -1) fastOffset = newline + 1;
		}
		if (
			missingFinalNewline &&
			lastNonemptyLine > 0 &&
			lastNonemptyLineWasValidRecord
		) {
			addIssue(state, {
				code: "EVENT_LEDGER_MISSING_FINAL_NEWLINE",
				severity: "warning",
				line: lastNonemptyLine,
			});
		}
		return {
			ok: state.errorCount === 0,
			record_count: state.recordCount,
			error_count: state.errorCount,
			warning_count: state.warningCount,
			issues: state.issues,
			omitted_issue_count: state.totalIssues - state.issues.length,
			records,
		};
	}
	let offset = 0;
	let line = 1;

	while (offset < text.length) {
		const newline = text.indexOf("\n", offset);
		const lineEnd = newline === -1 ? text.length : newline;
		let lineText = text.slice(offset, lineEnd);
		if (lineText.endsWith("\r")) lineText = lineText.slice(0, -1);
		if (lineText.trim().length === 0) {
			if (newline === -1) break;
			offset = newline + 1;
			line += 1;
			continue;
		}
		lastNonemptyLineWasValidRecord = false;
		lastNonemptyLine = line;
		let parsed: unknown;
		try {
			parsed = JSON.parse(lineText);
		} catch {
			addIssue(state, {
				code:
					missingFinalNewline && newline === -1
						? "EVENT_LEDGER_TRUNCATED_TAIL"
						: "EVENT_LEDGER_MALFORMED_JSON",
				severity: "error",
				line,
			});
			if (newline === -1) break;
			offset = newline + 1;
			line += 1;
			continue;
		}
		lastNonemptyLineWasValidRecord = inspectParsedRecord(
			parsed,
			line,
			Buffer.byteLength(lineText, "utf8") + (newline === -1 ? 0 : 1),
			state,
			ids,
			records,
			collectRecords,
			filteredCollection,
		);
		if (newline === -1) break;
		offset = newline + 1;
		line += 1;
	}

	if (
		missingFinalNewline &&
		lastNonemptyLine > 0 &&
		lastNonemptyLineWasValidRecord
	)
		addIssue(state, {
			code: "EVENT_LEDGER_MISSING_FINAL_NEWLINE",
			severity: "warning",
			line: lastNonemptyLine,
		});

	return {
		ok: state.errorCount === 0,
		record_count: state.recordCount,
		error_count: state.errorCount,
		warning_count: state.warningCount,
		issues: state.issues,
		omitted_issue_count: state.totalIssues - state.issues.length,
		records,
	};
}

export function inspectEventLedgerText(text: string): EventLedgerInspection {
	return inspectEventLedgerTextInternal(text, true);
}

function unreadableInspection(
	code: "EVENT_LEDGER_UNREADABLE" | "EVENT_LEDGER_LIMIT_EXCEEDED",
): EventLedgerInspection {
	return {
		ok: false,
		record_count: 0,
		error_count: 1,
		warning_count: 0,
		issues: [{ code, severity: "error" }],
		omitted_issue_count: 0,
		records: [],
	};
}

function readInspectionUnlocked(
	path: string,
	limits: BoundedSourceLimits,
	collectRecords = true,
	filteredCollection?: FilteredRecordCollection,
): EventLedgerInspection {
	try {
		const text = readBoundedSourceFile(path, EVENT_LEDGER_LABEL, limits);
		return text === null
			? inspectEventLedgerTextInternal("", collectRecords, filteredCollection)
			: inspectEventLedgerTextInternal(
					text,
					collectRecords,
					filteredCollection,
				);
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		return unreadableInspection(
			message.includes("limit")
				? "EVENT_LEDGER_LIMIT_EXCEEDED"
				: "EVENT_LEDGER_UNREADABLE",
		);
	}
}

export function inspectEventLedger(
	root: string,
	limits: BoundedSourceLimits = EVENT_LEDGER_LIMITS,
): EventLedgerInspection {
	return inspectEventLedgerInternal(root, limits, true);
}

function inspectEventLedgerInternal(
	root: string,
	limits: BoundedSourceLimits,
	collectRecords: boolean,
	filteredCollection?: FilteredRecordCollection,
): EventLedgerInspection {
	const path = resolveEventLedgerPath(root);
	return withResourceLocks(root, [path], () => {
		if (resolveEventLedgerPath(root) !== path)
			return unreadableInspection("EVENT_LEDGER_UNREADABLE");
		return readInspectionUnlocked(
			path,
			limits,
			collectRecords,
			filteredCollection,
		);
	});
}

export function validateEventLedger(
	root: string,
	limits: BoundedSourceLimits = EVENT_LEDGER_LIMITS,
): EventLedgerValidation {
	const { records: _records, ...validation } = inspectEventLedgerInternal(
		root,
		limits,
		false,
	);
	return validation;
}

export function assertValidEventLedger(
	root: string,
	limits: BoundedSourceLimits = EVENT_LEDGER_LIMITS,
): EventLedgerValidation {
	const validation = validateEventLedger(root, limits);
	if (!validation.ok) throw new EventLedgerValidationError(validation);
	return validation;
}

export function readEventLedgerRecords(
	root: string,
	limits: BoundedSourceLimits = EVENT_LEDGER_LIMITS,
): Record<string, unknown>[] {
	const inspection = inspectEventLedger(root, limits);
	if (!inspection.ok) throw new EventLedgerValidationError(inspection);
	return inspection.records;
}

export function readEventLedgerRecordsMatching(
	root: string,
	predicate: (record: Record<string, unknown>) => boolean,
	matchLimits: BoundedSourceLimits,
	ledgerLimits: BoundedSourceLimits = EVENT_LEDGER_LIMITS,
): Record<string, unknown>[] {
	const collection: FilteredRecordCollection = {
		predicate,
		limits: matchLimits,
		bytes: 0,
		lines: 0,
		candidates: 0,
		limitExceeded: false,
	};
	const inspection = inspectEventLedgerInternal(
		root,
		ledgerLimits,
		false,
		collection,
	);
	if (!inspection.ok) throw new EventLedgerValidationError(inspection);
	return inspection.records;
}

export function formatEventLedgerValidation(
	validation: EventLedgerValidation,
): string {
	const first =
		validation.issues.find((issue) => issue.severity === "error") ??
		validation.issues[0];
	const location = first?.line ? ` line=${first.line}` : "";
	const prefix = first ? `${first.code}${location}` : "EVENT_LEDGER_OK";
	return `${prefix} records=${validation.record_count} errors=${validation.error_count} warnings=${validation.warning_count} shown=${validation.issues.length} omitted=${validation.omitted_issue_count}`;
}
