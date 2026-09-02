import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { BoundedSourceLimits } from "../io/safe-source";
import { resolveProjectPaths } from "../project/paths";
import {
	appendEventLedgerRecord,
	EventLedgerValidationError,
	inspectEventLedgerText,
	readEventLedgerRecords,
	readEventLedgerRecordsMatching,
} from "./ledger";

/**
 * AFOL-native telemetry event type.
 * Schema version 1 — append-only writer with read-only query/report/export.
 *
 * Naming convention:
 *   session_start / session_end  — lifecycle boundaries
 *   task_start / task_complete   — task state transitions
 *   tool_exec                    — evidence recording
 *   error / blocker              — failures and blocks
 */

export type TelemetryEventType =
	| "session_start"
	| "session_end"
	| "task_start"
	| "task_complete"
	| "tool_exec"
	| "error"
	| "blocker";

export type TelemetryEvent = {
	/** Schema version for forward compatibility */
	schema_version: "1";
	/** Unique event id (TEL-<timestamp>-<counter>) */
	id: string;
	/** ISO 8601 timestamp */
	ts: string;
	/** Source identifier */
	source: "afol-cli";
	/** Telemetry event type */
	event_type: TelemetryEventType;
	/** Session identifier */
	session_id: string;
	/** Task id (T-NN) when applicable */
	task_id?: string;
	/**
	 * Sanitized command type — first token only.
	 * Never contains full command args or secrets.
	 */
	cmd_type?: string;
	/** Outcome: success / failure */
	outcome?: "success" | "failure";
	/** Human-readable note (no secrets) */
	note?: string;
	/** Evidence provenance for workflow-origin classification */
	provenance?: "declared" | "observed";
	/** Error/blocker type when event_type is error or blocker */
	error_type?: string;
};

export type SessionTelemetryFilter = {
	/** Limit bounded matching to event types relevant to the caller's purpose. */
	eventTypes?: readonly TelemetryEventType[];
	/** Apply an additional purpose-specific predicate after basic telemetry checks. */
	predicate?: (event: TelemetryEvent) => boolean;
};

const TELEMETRY_ID_PREFIX = "TEL-";
function nextTelemetryId(now: Date): string {
	return `${TELEMETRY_ID_PREFIX}${now.getTime()}-${randomUUID()}`;
}

/**
 * Resolve the full path to the shared events.jsonl file.
 */
export function resolveTelemetryEventPath(root: string): string {
	return resolveProjectPaths(resolve(root)).abs.eventsFile;
}

/**
 * Sanitize a command string to its first token only.
 * "bun test --filter foo" → "bun"
 * "afol validate --json" → "afol"
 * "echo hello" → "echo"
 */
export function firstToken(cmd: string): string {
	if (!cmd || typeof cmd !== "string") return "";
	const trimmed = cmd.trim();
	if (!trimmed) return "";
	return trimmed.split(/\s+/)[0] ?? "";
}

/**
 * Append a telemetry event to the shared events.jsonl file.
 * Both standalone and lifecycle callers are serialized by the canonical
 * shared-ledger resource lock.
 *
 * Returns the created TelemetryEvent for test assertions.
 */
export function appendTelemetryEvent(
	root: string,
	event: Omit<TelemetryEvent, "id" | "ts" | "source" | "schema_version">,
	deferredRecords?: Record<string, unknown>[],
): TelemetryEvent {
	const now = new Date();
	const fullEvent: TelemetryEvent = {
		schema_version: "1",
		id: nextTelemetryId(now),
		ts: now.toISOString(),
		source: "afol-cli",
		...event,
	};

	if (deferredRecords) {
		deferredRecords.push(fullEvent as unknown as Record<string, unknown>);
	} else {
		appendEventLedgerRecord(root, fullEvent);
	}
	return fullEvent;
}

/**
 * Read all telemetry events from the events.jsonl file.
 * Used only for testing and diagnostics.
 */
export function readTelemetryEvents(root: string): TelemetryEvent[] {
	return telemetryRecords(readEventLedgerRecords(root));
}

export function parseTelemetryEvents(text: string): TelemetryEvent[] {
	const inspection = inspectEventLedgerText(text);
	if (!inspection.ok) throw new EventLedgerValidationError(inspection);
	return telemetryRecords(inspection.records);
}

export function readBoundedTelemetryEvents(
	root: string,
	limits: BoundedSourceLimits,
): TelemetryEvent[] {
	return telemetryRecords(
		readEventLedgerRecordsMatching(
			root,
			(record) =>
				record.schema_version === "1" &&
				typeof record.event_type === "string" &&
				typeof record.session_id === "string",
			limits,
		),
	);
}

export function readBoundedSessionTelemetryEvents(
	root: string,
	session: string,
	limits: BoundedSourceLimits,
	filter: SessionTelemetryFilter = {},
): TelemetryEvent[] {
	const allowedEventTypes = filter.eventTypes
		? new Set<string>(filter.eventTypes)
		: null;
	return telemetryRecords(
		readEventLedgerRecordsMatching(
			root,
			(record) =>
				record.schema_version === "1" &&
				typeof record.event_type === "string" &&
				record.session_id === session &&
				(!allowedEventTypes || allowedEventTypes.has(record.event_type)) &&
				(!filter.predicate || filter.predicate(record as TelemetryEvent)),
			limits,
		),
	);
}

function telemetryRecords(
	records: Record<string, unknown>[],
): TelemetryEvent[] {
	return records
		.filter(
			(record) =>
				record.schema_version === "1" &&
				typeof record.event_type === "string" &&
				typeof record.session_id === "string",
		)
		.map((record) => record as TelemetryEvent);
}
