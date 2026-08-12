import { createHash } from "node:crypto";
import type { TelemetryEvent } from "../events/telemetry";
import type { FeedbackReport } from "../feedback";
import {
	type ObservationInput,
	redactSensitiveText,
} from "./observation-model";

export type ObservationSourceContext = {
	projectId: string;
	sessionId: string;
	productionDaySequence: number;
	taskType: string;
	provider?: string;
};

export type EvidenceObservationSource = {
	id: string;
	created_at: string;
	result?: string;
	exit_code?: number;
	command?: string;
	test?: string;
	error_code?: string;
	path?: string;
	operation?: string;
	workflow_step?: string;
	stack_digest?: string;
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

/** Bounded, redacted command identity for recurrence; not a shell replay string. */
export function commandSignature(value: string | undefined): string {
	const tokens = (value?.trim().split(/\s+/) ?? [])
		.filter((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token))
		.slice(0, 6)
		.map((token) =>
			token
				.replace(/(?:^|=)\d{4,}(?:$|\b)/g, "<n>")
				.replace(/[a-f0-9]{16,}/gi, "<id>"),
		);
	return redactSensitiveText(tokens.join(" "), { redactPaths: true }).slice(
		0,
		256,
	);
}

function observationId(kind: string, source: unknown): string {
	return `O-${kind}-${digest(source).slice(0, 24)}`;
}

function baseInput(
	context: ObservationSourceContext,
	kind: string,
	impact: string,
	sourceKind: string,
	sourceId: string,
	source: unknown,
	createdAt: string,
): ObservationInput {
	const id = observationId(kind, source);
	return {
		projectId: context.projectId,
		id,
		kind,
		sessionId: context.sessionId,
		productionDaySequence: context.productionDaySequence,
		taskType: context.taskType,
		impact,
		createdAt,
		journalEventId: `OBS-${id}`,
		sourceRefs: [{ id: sourceId, kind: sourceKind, digest: digest(source) }],
		provider: context.provider ?? "afol",
	};
}

export function observationFromTelemetry(
	event: TelemetryEvent,
	context: ObservationSourceContext,
): ObservationInput | null {
	if (event.session_id !== context.sessionId) return null;
	const failedTool =
		event.event_type === "tool_exec" && event.outcome === "failure";
	if (
		!failedTool &&
		event.event_type !== "error" &&
		event.event_type !== "blocker"
	)
		return null;
	const kind =
		event.event_type === "blocker" ? "workflow_friction" : "tool_failure";
	const sourceIdentity = {
		id: event.id,
		ts: event.ts,
		event_type: event.event_type,
		session_id: event.session_id,
		outcome: event.outcome ?? null,
	};
	return {
		...baseInput(
			context,
			kind,
			event.event_type === "blocker" ? "blocked workflow" : "failed operation",
			"telemetry",
			event.id,
			sourceIdentity,
			event.ts,
		),
		...(event.error_type ? { errorCode: event.error_type } : {}),
		...(event.cmd_type ? { command: event.cmd_type } : {}),
		operation: event.event_type,
		...(event.task_id ? { workflowStep: event.task_id } : {}),
		provider: event.source,
	};
}

export function observationFromEvidence(
	evidence: EvidenceObservationSource,
	context: ObservationSourceContext,
): ObservationInput | null {
	const failed =
		evidence.result === "failed" || Number(evidence.exit_code ?? 0) !== 0;
	if (!failed) return null;
	const kind = evidence.test ? "test_failure" : "tool_failure";
	const sourceIdentity = {
		id: evidence.id,
		created_at: evidence.created_at,
		result: evidence.result ?? null,
		exit_code: evidence.exit_code ?? null,
		command: commandSignature(evidence.command),
	};
	return {
		...baseInput(
			context,
			kind,
			evidence.test ? "test failed" : "evidence command failed",
			"evidence",
			evidence.id,
			sourceIdentity,
			evidence.created_at,
		),
		...(evidence.error_code ? { errorCode: evidence.error_code } : {}),
		...(evidence.test ? { test: evidence.test } : {}),
		command: commandSignature(evidence.command),
		...(evidence.path ? { pathModule: evidence.path } : {}),
		operation: evidence.operation ?? "verify",
		workflowStep: evidence.workflow_step ?? "evidence",
		...(evidence.stack_digest ? { stackDigest: evidence.stack_digest } : {}),
	};
}

export function observationFromFeedback(
	report: FeedbackReport,
	context: ObservationSourceContext,
): ObservationInput {
	const sourceIdentity = {
		report_id: report.report_id,
		created_at: report.created_at,
		kind: report.kind,
	};
	return {
		...baseInput(
			context,
			"user_correction",
			"user correction required",
			"feedback",
			report.report_id,
			sourceIdentity,
			report.created_at,
		),
		...(report.error_code ? { errorCode: report.error_code } : {}),
		operation: report.kind,
		workflowStep: "feedback",
		...(report.stack_digest ? { stackDigest: report.stack_digest } : {}),
	};
}
