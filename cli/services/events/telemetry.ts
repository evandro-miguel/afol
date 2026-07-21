import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	type BoundedSourceLimits,
	readBoundedSourceFile,
} from "../io/safe-source";
import { resolveProjectPaths } from "../project/paths";

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
 * This writer does not acquire its own session lock. Callers that write next to
 * workbench lifecycle events must invoke it from inside the existing
 * withSessionLock flow so workbench and telemetry event ordering stays stable.
 * Standalone callers may still rely on append-only writes for line integrity,
 * but not for ordering relative to workbench events.
 *
 * Returns the created TelemetryEvent for test assertions.
 */
export function appendTelemetryEvent(
	root: string,
	event: Omit<TelemetryEvent, "id" | "ts" | "source" | "schema_version">,
): TelemetryEvent {
	const now = new Date();
	const eventPath = resolveTelemetryEventPath(root);
	const fullEvent: TelemetryEvent = {
		schema_version: "1",
		id: nextTelemetryId(now),
		ts: now.toISOString(),
		source: "afol-cli",
		...event,
	};

	mkdirSync(resolve(eventPath, ".."), { recursive: true });
	writeFileSync(eventPath, `${JSON.stringify(fullEvent)}\n`, {
		encoding: "utf8",
		flag: "a",
	});
	return fullEvent;
}

/**
 * Read all telemetry events from the events.jsonl file.
 * Used only for testing and diagnostics.
 */
export function readTelemetryEvents(root: string): TelemetryEvent[] {
	const eventPath = resolveTelemetryEventPath(root);
	if (!existsSync(eventPath)) {
		return [];
	}
	return readFileSync(eventPath, "utf8")
		.split(/\r?\n/)
		.map((line: string) => line.trim())
		.filter((line: string) => line.length > 0)
		.map((line: string) => JSON.parse(line) as TelemetryEvent)
		.filter((e: TelemetryEvent) => e.schema_version === "1");
}

export function parseTelemetryEvents(text: string): TelemetryEvent[] {
	return text
		.split(/\r?\n/)
		.map((line: string) => line.trim())
		.filter((line: string) => line.length > 0)
		.map((line: string) => JSON.parse(line) as TelemetryEvent)
		.filter((e: TelemetryEvent) => e.schema_version === "1");
}

export function readBoundedTelemetryEvents(
	root: string,
	limits: BoundedSourceLimits,
): TelemetryEvent[] {
	const text = readBoundedSourceFile(
		resolveTelemetryEventPath(root),
		"project telemetry ledger",
		limits,
	);
	return text === null ? [] : parseTelemetryEvents(text);
}

import { randomUUID } from "node:crypto";
