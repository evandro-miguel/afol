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

type EventLedgerInspection = EventLedgerValidation & {
	records: Record<string, unknown>[];
};

export type DurableJsonlIo = {
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
): void {
	if (
		!Number.isSafeInteger(originalSize) ||
		originalSize < 0 ||
		payloadSize > EVENT_LEDGER_LIMITS.maxBytes ||
		originalSize > EVENT_LEDGER_LIMITS.maxBytes - payloadSize
	)
		throw new EventLedgerValidationError(limitExceededValidation());
	const existingLines = countLfBytes(fd, originalSize);
	if (
		existingLines >= EVENT_LEDGER_LIMITS.maxLines ||
		existingLines >= EVENT_LEDGER_LIMITS.maxCandidates
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

/**
 * Append exactly one JSON object plus LF under the global event-file lock.
 * Success is returned only after every byte and the file have been synced.
 * A process crash before the successful sync remains subject to filesystem and
 * device durability guarantees; existing corrupt tails are never auto-repaired.
 */
export function appendEventLedgerRecord<T extends Record<string, unknown>>(
	root: string,
	record: T,
	io: DurableJsonlIo = {},
): T {
	const path = resolveEventLedgerPath(root);
	const serialized = JSON.stringify(record);
	if (serialized === undefined)
		throw new Error("event ledger record must be a JSON object");
	const payload = Buffer.from(`${serialized}\n`, "utf8");

	return withResourceLocks(root, [path], () => {
		if (resolveEventLedgerPath(root) !== path)
			throw new Error("event ledger path changed before append");
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		const before = assertSafeSourceFile(path, EVENT_LEDGER_LABEL);
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
			assertAppendWithinLimits(fd, originalSize, payload.byteLength);

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
					verifyOpenedTarget(path, fstatSync(fd));
					truncateFile(fd, originalSize);
					syncFile(fd);
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
		return record;
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

export function inspectEventLedgerText(text: string): EventLedgerInspection {
	const state = {
		errorCount: 0,
		warningCount: 0,
		issues: [] as EventLedgerIssue[],
		totalIssues: 0,
	};
	const records: Record<string, unknown>[] = [];
	const ids = new Set<string>();
	const missingFinalNewline = text.length > 0 && !text.endsWith("\n");
	const lines = text.split("\n");
	let lastNonemptyLineWasValidRecord = false;

	for (let index = 0; index < lines.length; index += 1) {
		let lineText = lines[index] ?? "";
		if (lineText.endsWith("\r")) lineText = lineText.slice(0, -1);
		if (lineText.trim().length === 0) continue;
		lastNonemptyLineWasValidRecord = false;
		const line = index + 1;
		let parsed: unknown;
		try {
			parsed = JSON.parse(lineText);
		} catch {
			addIssue(state, {
				code:
					missingFinalNewline && index === lines.length - 1
						? "EVENT_LEDGER_TRUNCATED_TAIL"
						: "EVENT_LEDGER_MALFORMED_JSON",
				severity: "error",
				line,
			});
			continue;
		}
		if (!isRecord(parsed)) {
			addIssue(state, {
				code: "EVENT_LEDGER_NON_OBJECT",
				severity: "error",
				line,
			});
			continue;
		}
		records.push(parsed);
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
		lastNonemptyLineWasValidRecord = validShape && !duplicate;
	}

	if (
		missingFinalNewline &&
		(lines.at(-1)?.trim().length ?? 0) > 0 &&
		lastNonemptyLineWasValidRecord
	)
		addIssue(state, {
			code: "EVENT_LEDGER_MISSING_FINAL_NEWLINE",
			severity: "warning",
			line: lines.length,
		});

	return {
		ok: state.errorCount === 0,
		record_count: records.length,
		error_count: state.errorCount,
		warning_count: state.warningCount,
		issues: state.issues,
		omitted_issue_count: state.totalIssues - state.issues.length,
		records,
	};
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
): EventLedgerInspection {
	try {
		const text = readBoundedSourceFile(path, EVENT_LEDGER_LABEL, limits);
		return text === null
			? inspectEventLedgerText("")
			: inspectEventLedgerText(text);
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
	const path = resolveEventLedgerPath(root);
	return withResourceLocks(root, [path], () => {
		if (resolveEventLedgerPath(root) !== path)
			return unreadableInspection("EVENT_LEDGER_UNREADABLE");
		return readInspectionUnlocked(path, limits);
	});
}

export function validateEventLedger(
	root: string,
	limits: BoundedSourceLimits = EVENT_LEDGER_LIMITS,
): EventLedgerValidation {
	const { records: _records, ...validation } = inspectEventLedger(root, limits);
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
