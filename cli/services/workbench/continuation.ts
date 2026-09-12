import { existsSync } from "node:fs";
import type { NewWorkstreamMetadata, TaskRow } from "./lifecycle";
import {
	readTaskLifecycleState,
	scalarValue,
	type TaskDocument,
} from "./session-lifecycle-state";
import { sessionPaths } from "./session-reader";
import type { TaskState } from "./types";

export function carryOpenMetadata(
	session: string,
	document: TaskDocument,
	taskRows: readonly TaskRow[],
	reason: string,
): { theme: string; metadata: NewWorkstreamMetadata } {
	if (document.kind !== "frontmatter") {
		throw new Error(`Session ${session} must be governed to carry open tasks.`);
	}
	const value = (key: string) =>
		document.lines
			.map((line) => scalarValue(line, key))
			.find((candidate) => candidate !== undefined)
			?.trim() ?? "";
	const featureId = value("feature_id") || value("roadmap_feature");
	const parentSpec = value("parent_spec");
	if (value("governance_status") !== "governed" || !featureId || !parentSpec) {
		throw new Error(`Session ${session} must be governed to carry open tasks.`);
	}
	const theme = value("theme") || "workstream";
	return {
		theme: `${theme} continuation`,
		metadata: {
			continuationOf: session,
			carryOpenTasks: taskRows.map((row) => row.taskId),
			intent: `Carry open from ${session}: ${reason}`,
			featureId,
			parentSpec,
			tasks: taskRows.map((row) =>
				`${row.taskId}: ${row.notes || `Carry open: ${reason}`}`.trim(),
			),
		},
	};
}

export function carryOpenTransitionChain(state: string): readonly TaskState[] {
	if (state === "pending" || state === "problem") return ["moved"];
	if (state === "in_progress") return ["problem", "moved"];
	if (
		state === "implemented_untested" ||
		state === "tested_needs_spec_validation"
	) {
		return ["problem", "moved"];
	}
	throw new Error(`Cannot carry open task in state ${state}.`);
}

function continuationFrontmatterValue(
	document: TaskDocument,
	key: string,
): string | null {
	if (document.kind !== "frontmatter") return null;
	const values = document.lines
		.map((line) => scalarValue(line, key))
		.filter((value): value is string => value !== undefined && value !== null);
	return values.length === 1 ? (values[0]?.trim() ?? null) : null;
}

export function carriedContinuationSession(
	root: string,
	source: TaskDocument,
	taskRows: readonly TaskRow[],
): string | null {
	const carriedRows = taskRows.filter((row) => row.state === "moved");
	if (carriedRows.length === 0) return null;
	const destinations = new Set(
		carriedRows.map(
			(row) => /(?:^|\s)destination=([^\s|]+)/.exec(row.notes)?.[1] ?? "",
		),
	);
	if (destinations.size !== 1 || destinations.has("")) {
		throw new Error(
			"Carry-open recovery has an invalid source destination mapping.",
		);
	}
	const continuation = [...destinations][0];
	if (
		!continuation ||
		!existsSync(sessionPaths(root, continuation).sessionDir)
	) {
		throw new Error("Carry-open recovery continuation is missing.");
	}
	const continuationState = readTaskLifecycleState(
		sessionPaths(root, continuation).taskPath,
		continuation,
	);
	const expectedFeature = continuationFrontmatterValue(source, "feature_id");
	const expectedParentSpec = continuationFrontmatterValue(
		source,
		"parent_spec",
	);
	const sourceSession = continuationFrontmatterValue(source, "session_id");
	const expectedTasks = carriedRows
		.map((row) => row.taskId)
		.sort()
		.join(",");
	if (
		continuationFrontmatterValue(
			continuationState.document,
			"continuation_of",
		) !== sourceSession ||
		continuationFrontmatterValue(continuationState.document, "feature_id") !==
			expectedFeature ||
		continuationFrontmatterValue(continuationState.document, "parent_spec") !==
			expectedParentSpec ||
		continuationFrontmatterValue(
			continuationState.document,
			"governance_status",
		) !== "governed" ||
		continuationFrontmatterValue(
			continuationState.document,
			"carry_open_tasks",
		) !== expectedTasks
	) {
		throw new Error(
			"Carry-open recovery continuation linkage does not match source.",
		);
	}
	return continuation;
}
