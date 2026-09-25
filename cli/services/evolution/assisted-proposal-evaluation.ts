import { createHash } from "node:crypto";
import {
	type AssistedProposalEvent,
	appendAssistedProposalEvent,
	proposalPreparedEvent,
	proposalVersionEvents,
	readAssistedProposalJournal,
} from "./assisted-proposal-journal";
import type { AssistedProposalPreview } from "./assisted-proposal-packet";
import {
	type EvaluationResult,
	previewEvaluationContract,
} from "./evaluation-service";

export type AssistedProposalEvaluation = {
	read_only: boolean;
	proposal_id: string;
	version_digest: string;
	baseline_status: string;
	state: EvaluationResult["state"];
	reason: string;
	production_day_window: EvaluationResult["production_day_window"] | null;
	comparable_sessions: number;
	matching_observations: number;
	scorecard_comparison: EvaluationResult["scorecard_comparison"] | null;
	health: "healthy" | "unknown";
	journal_event_id?: string;
};

function digest(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resultFromEvent(
	event: AssistedProposalEvent,
): AssistedProposalEvaluation {
	const raw = event.payload.result;
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		throw new Error("assisted proposal evaluation receipt is invalid");
	return {
		...(raw as Omit<
			AssistedProposalEvaluation,
			"read_only" | "journal_event_id"
		>),
		read_only: false,
		journal_event_id: event.event_id,
	};
}

export function previewAssistedProposalEvaluation(input: {
	root: string;
	projectId: string;
	proposalId: string;
	versionDigest: string;
}): AssistedProposalEvaluation {
	const events = readAssistedProposalJournal(input.root, input.projectId);
	const prepared = proposalPreparedEvent(
		events,
		input.proposalId,
		input.versionDigest,
	);
	if (!prepared)
		throw new Error("assisted proposal version is missing or stale");
	const versionEvents = proposalVersionEvents(
		events,
		input.proposalId,
		input.versionDigest,
	);
	const applied = versionEvents.findLast(
		(event) => event.event_type === "applied",
	);
	if (!applied)
		throw new Error("proposal evaluation requires an applied version");
	const preview = prepared.payload.preview as AssistedProposalPreview;
	const baseline = preview.evaluation_baseline;
	const base = {
		read_only: true,
		proposal_id: input.proposalId,
		version_digest: input.versionDigest,
		baseline_status: baseline?.status ?? "unavailable",
	};
	if (!baseline?.contract)
		return {
			...base,
			state: "not_evaluable",
			reason: baseline?.reason ?? "prepared version has no evaluation baseline",
			production_day_window: null,
			comparable_sessions: 0,
			matching_observations: 0,
			scorecard_comparison: null,
			health: baseline?.status === "unavailable" ? "unknown" : "healthy",
		};
	const anchor = applied.payload.applied_production_day_sequence;
	if (!Number.isSafeInteger(anchor) || Number(anchor) < 0)
		return {
			...base,
			state: "not_evaluable",
			reason: "application production-day anchor is unavailable",
			production_day_window: null,
			comparable_sessions: 0,
			matching_observations: 0,
			scorecard_comparison: null,
			health: "unknown",
		};
	try {
		const result = previewEvaluationContract({
			root: input.root,
			projectId: input.projectId,
			proposalId: input.proposalId,
			contract: baseline.contract,
			anchorProductionDaySequence: Number(anchor),
		});
		return {
			...base,
			state: result.state,
			reason: result.reason,
			production_day_window: result.production_day_window,
			comparable_sessions: result.comparable_sessions,
			matching_observations: result.matching_observations,
			scorecard_comparison: result.scorecard_comparison,
			health: "healthy",
		};
	} catch {
		return {
			...base,
			state: "not_evaluable",
			reason: "canonical observation or production-day evidence is unavailable",
			production_day_window: null,
			comparable_sessions: 0,
			matching_observations: 0,
			scorecard_comparison: null,
			health: "unknown",
		};
	}
}

export function recordAssistedProposalEvaluation(input: {
	root: string;
	projectId: string;
	proposalId: string;
	versionDigest: string;
	result: AssistedProposalEvaluation;
	session?: string;
	taskId?: string;
	now?: Date;
}): AssistedProposalEvaluation {
	const events = readAssistedProposalJournal(input.root, input.projectId);
	const versionEvents = proposalVersionEvents(
		events,
		input.proposalId,
		input.versionDigest,
	);
	const result = { ...input.result, read_only: false };
	const resultDigest = digest(result);
	const duplicate = versionEvents.find(
		(event) =>
			event.event_type === "evaluation" &&
			event.payload.result_digest === resultDigest,
	);
	if (duplicate) return resultFromEvent(duplicate);
	const preview = proposalPreparedEvent(
		events,
		input.proposalId,
		input.versionDigest,
	);
	if (!preview)
		throw new Error("assisted proposal version is missing or stale");
	const event = appendAssistedProposalEvent({
		root: input.root,
		projectId: input.projectId,
		eventType: "evaluation",
		proposalId: input.proposalId,
		versionDigest: input.versionDigest,
		problemIdentity: preview.problem_identity,
		payload: {
			result_digest: resultDigest,
			result,
			...(input.session ? { session: input.session } : {}),
			...(input.taskId ? { task_id: input.taskId } : {}),
		},
		...(input.now ? { now: input.now } : {}),
	});
	return resultFromEvent(event);
}
