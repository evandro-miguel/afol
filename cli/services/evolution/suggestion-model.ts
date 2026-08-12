import { createHash } from "node:crypto";
import {
	OBSERVATION_FINGERPRINT_VERSION,
	type ObservationRecord,
	type Scorecard,
} from "./observation-model";

export const EVALUATION_CONTRACT_VERSION = 1 as const;
export const EVALUATION_COMPARATOR_VERSION = "scorecard-v1" as const;
export const EVALUATION_MINIMUM_COMPARABLE_SESSIONS = 3 as const;
export const EVALUATION_PRODUCTION_DAY_WINDOW = 5 as const;

export type EvaluationContractV1 = {
	contract_version: typeof EVALUATION_CONTRACT_VERSION;
	comparator_version: typeof EVALUATION_COMPARATOR_VERSION;
	task_type: string;
	cluster_id: string;
	baseline: {
		window: "recorded";
		production_day_range: { start: number; end: number };
		observation_ids: string[];
		session_ids: string[];
		observation_digest: string;
		anchor_journal_sequence: number;
		observation_count: number;
		production_day_count: number;
		scorecard: Scorecard;
	};
	targets: {
		minimum_comparable_sessions: typeof EVALUATION_MINIMUM_COMPARABLE_SESSIONS;
		production_day_window: typeof EVALUATION_PRODUCTION_DAY_WINDOW;
		state: "canary";
		metrics: Readonly<Record<string, number | null>>;
	};
};

export type SuggestionCluster = {
	fingerprint: string;
	fingerprint_version?: number;
	state:
		| "observed"
		| "candidate"
		| "recurring"
		| "proposal_open"
		| "mitigation_canary"
		| "resolved"
		| "reopened"
		| "dismissed";
	occurrence_count: number;
	distinct_session_count: number;
	distinct_production_day_count: number;
	priority: number;
	user_confirmed_recurrence?: boolean | number;
	source_refs?: Array<Record<string, string>>;
};

/** Keep otherwise identical legacy and current fingerprints in separate cohorts. */
export function suggestionClusterKey(
	fingerprintVersion: number | undefined,
	fingerprint: string,
): string {
	return `${fingerprintVersion ?? 2}:${fingerprint}`;
}

export type SuggestionCandidate = {
	id: string;
	project_id: string;
	local_date: string;
	cluster_id: string;
	task_type: string;
	fingerprint_version: number;
	problem: string;
	risk: string;
	validation: string;
	recommendation: string;
	related_session_ids: string[];
	occurrence_count: number;
	distinct_production_day_count: number;
	impact: string;
	evidence_digest: string;
	base_confidence: number;
	confidence: number;
	rejected_receipt_count: number;
	confidence_reason: string;
	score: number;
	pending_count: number;
	critical: boolean;
	state: "available" | "suppressed" | "resolved";
	source_refs: Array<Record<string, string>>;
};

export type SuggestionDerivation = {
	suggestions: SuggestionCandidate[];
	critical_alerts: SuggestionCandidate[];
};

export type RejectionNegativeEvidence = {
	base_score: number;
	base_confidence: number;
	rejected_receipt_count: number;
	penalty_per_rejection?: number;
};

export type RejectionNegativeEvidenceResult = {
	base_score: number;
	base_confidence: number;
	rejected_receipt_count: number;
	penalty_per_rejection: number;
	score_penalty: number;
	confidence_penalty: number;
	score: number;
	confidence: number;
	reason: string;
};

const CRITICAL_KINDS = new Set([
	"integrity_error",
	"security_error",
	"secret_exposure",
	"data_loss",
]);

const SUGGESTION_OBSERVATION_KINDS = new Set([
	"data_loss",
	"failure",
	"integrity_error",
	"latency_outlier",
	"missing_artifact",
	"regression",
	"repeated_instruction",
	"rollback",
	"secret_exposure",
	"security_error",
	"test_failure",
	"token_outlier",
	"tool_failure",
	"unnecessary_user_intervention",
	"user-correction",
	"user_correction",
	"workflow_friction",
]);

const DEFAULT_REJECTION_PENALTY = 0.1;

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

export function evaluationContractDigest(
	contract: EvaluationContractV1,
): string {
	return digest(contract);
}

export function assertEvaluationContract(contract: EvaluationContractV1): void {
	if (
		contract.contract_version !== EVALUATION_CONTRACT_VERSION ||
		contract.comparator_version !== EVALUATION_COMPARATOR_VERSION
	)
		throw new Error("unsupported evolution evaluation contract");
	if (!contract.task_type || !contract.cluster_id)
		throw new Error("invalid evolution evaluation contract identity");
	const range = contract.baseline?.production_day_range;
	if (
		!range ||
		!Number.isInteger(range.start) ||
		!Number.isInteger(range.end) ||
		range.start < 1 ||
		range.end < range.start ||
		range.end - range.start >= EVALUATION_PRODUCTION_DAY_WINDOW
	)
		throw new Error("invalid evolution evaluation production-day range");
	if (
		!Array.isArray(contract.baseline.observation_ids) ||
		!Array.isArray(contract.baseline.session_ids) ||
		!contract.baseline.observation_digest ||
		!Number.isInteger(contract.baseline.anchor_journal_sequence) ||
		contract.baseline.anchor_journal_sequence < 0
	)
		throw new Error("invalid evolution evaluation baseline anchors");
	if (
		contract.targets?.minimum_comparable_sessions !==
			EVALUATION_MINIMUM_COMPARABLE_SESSIONS ||
		contract.targets.production_day_window !== EVALUATION_PRODUCTION_DAY_WINDOW
	)
		throw new Error("invalid evolution evaluation targets");
}

function uniqueRefs(
	refs: ReadonlyArray<Record<string, string>>,
): Array<Record<string, string>> {
	const seen = new Map<string, Record<string, string>>();
	for (const ref of refs) seen.set(stableJson(ref), { ...ref });
	return [...seen.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, ref]) => ref);
}

function observationKind(observation: ObservationRecord): string {
	const kind = String(
		observation.kind ?? observation.normalized_fields.kind ?? "",
	);
	return SUGGESTION_OBSERVATION_KINDS.has(kind) ? kind : "workflow_friction";
}

export function suggestionEvidenceDigest(input: {
	cluster: SuggestionCluster;
	observations: readonly ObservationRecord[];
}): string {
	return digest({
		fingerprint_version: input.cluster.fingerprint_version ?? 2,
		fingerprint: input.cluster.fingerprint,
		state: input.cluster.state,
		occurrences: input.observations
			.map((observation) => ({
				id: observation.id,
				occurrence_identity: observation.occurrence_identity,
				session_id: observation.session_id,
				production_day_sequence: observation.production_day_sequence,
				task_type: observation.task_type,
				impact: observation.impact,
				kind: observationKind(observation),
				source_refs: observation.source_refs,
			}))
			.sort((left, right) => left.id.localeCompare(right.id)),
	});
}

export function suggestionId(
	projectId: string,
	fingerprintVersion: number,
	clusterId: string,
	taskType?: string,
): string {
	const identity =
		taskType === undefined
			? { projectId, fingerprintVersion, clusterId }
			: { projectId, fingerprintVersion, clusterId, taskType };
	return `SUG-${digest(identity).slice(0, 32)}`;
}

export function isCriticalSuggestion(
	observations: readonly ObservationRecord[],
): boolean {
	return observations.some((observation) =>
		CRITICAL_KINDS.has(observationKind(observation)),
	);
}

/**
 * Apply rejection evidence to a derived ranking without mutating receipts,
 * clusters, or any other canonical state. The returned audit fields make the
 * penalty explainable and replayable from the same inputs.
 */
export function applyRejectionNegativeEvidence(
	input: RejectionNegativeEvidence,
): RejectionNegativeEvidenceResult {
	const baseScore = Number.isFinite(input.base_score)
		? Math.max(0, input.base_score)
		: 0;
	const baseConfidence = Number.isFinite(input.base_confidence)
		? Math.max(0, Math.min(1, input.base_confidence))
		: 0;
	const rejectedReceiptCount = Number.isFinite(input.rejected_receipt_count)
		? Math.max(0, Math.floor(input.rejected_receipt_count))
		: 0;
	const penaltyPerRejection = Number.isFinite(input.penalty_per_rejection)
		? Math.max(0, Math.min(1, input.penalty_per_rejection ?? 0))
		: DEFAULT_REJECTION_PENALTY;
	const confidencePenalty = Math.min(
		baseConfidence,
		rejectedReceiptCount * penaltyPerRejection,
	);
	const scorePenalty = Math.min(
		baseScore,
		baseScore * rejectedReceiptCount * penaltyPerRejection,
	);
	return {
		base_score: baseScore,
		base_confidence: baseConfidence,
		rejected_receipt_count: rejectedReceiptCount,
		penalty_per_rejection: penaltyPerRejection,
		score_penalty: scorePenalty,
		confidence_penalty: confidencePenalty,
		score: baseScore - scorePenalty,
		confidence: baseConfidence - confidencePenalty,
		reason:
			rejectedReceiptCount > 0
				? `${rejectedReceiptCount} rejected receipt(s) reduced derived confidence and score`
				: "no rejected receipts; derived confidence and score unchanged",
	};
}

export function buildSuggestionCandidate(input: {
	projectId: string;
	localDate: string;
	cluster: SuggestionCluster;
	observations: readonly ObservationRecord[];
	pendingCount?: number;
}): SuggestionCandidate {
	if (
		input.cluster.fingerprint_version !== undefined &&
		input.cluster.fingerprint_version !== 1 &&
		input.cluster.fingerprint_version !== 2
	)
		throw new Error("unsupported suggestion fingerprint version");
	if (input.observations.length === 0)
		throw new Error("suggestion requires at least one observation");
	const taskTypes = new Set(
		input.observations.map((observation) => observation.task_type),
	);
	if (taskTypes.size !== 1)
		throw new Error("suggestion cluster contains mixed task types");
	const taskType = [...taskTypes][0];
	if (!taskType) throw new Error("suggestion cluster requires a task type");
	const critical = isCriticalSuggestion(input.observations);
	const evidenceDigest = suggestionEvidenceDigest(input);
	const refs = uniqueRefs([
		...(input.cluster.source_refs ?? []),
		...input.observations.flatMap((observation) => observation.source_refs),
	]);
	const score = Math.max(
		0,
		input.cluster.priority * 100 +
			input.cluster.occurrence_count * 10 +
			input.cluster.distinct_session_count * 5 +
			input.cluster.distinct_production_day_count * 5 +
			(input.cluster.user_confirmed_recurrence ? 50 : 0),
	);
	const baseConfidence = Math.min(
		1,
		0.5 +
			input.cluster.occurrence_count * 0.05 +
			input.cluster.distinct_session_count * 0.05 +
			(input.cluster.user_confirmed_recurrence ? 0.15 : 0),
	);
	return {
		id: suggestionId(
			input.projectId,
			input.cluster.fingerprint_version ?? OBSERVATION_FINGERPRINT_VERSION,
			input.cluster.fingerprint,
			taskType,
		),
		project_id: input.projectId,
		local_date: input.localDate,
		cluster_id: input.cluster.fingerprint,
		task_type: taskType,
		fingerprint_version: input.cluster.fingerprint_version ?? 2,
		problem: `${observationKind(input.observations[0] as ObservationRecord) || "workflow friction"} recurred across ${input.cluster.distinct_session_count} sessions`,
		risk: critical ? "critical alert; no automatic suggestion" : "low",
		validation: `Compare recurrence and user-intervention metrics for ${taskType} over the next 3 comparable sessions`,
		recommendation: `Add a bounded check to the ${taskType} workflow step where this recurrence is observed`,
		related_session_ids: [
			...new Set(
				input.observations.map((observation) => observation.session_id),
			),
		].sort(),
		occurrence_count: input.cluster.occurrence_count,
		distinct_production_day_count: input.cluster.distinct_production_day_count,
		impact:
			input.observations
				.map((observation) => observation.impact)
				.sort()
				.at(-1) ?? "unknown",
		evidence_digest: evidenceDigest,
		base_confidence: baseConfidence,
		confidence: baseConfidence,
		rejected_receipt_count: 0,
		confidence_reason:
			"no rejected receipts; derived confidence and score unchanged",
		score,
		pending_count: Math.max(0, input.pendingCount ?? 0),
		critical,
		state: "available",
		source_refs: refs,
	};
}

export function selectEvaluationBaselineObservations(input: {
	candidate: Pick<SuggestionCandidate, "cluster_id" | "task_type">;
	observations: readonly ObservationRecord[];
}): ObservationRecord[] {
	const taskType = input.candidate.task_type;
	if (!taskType) throw new Error("evolution proposal requires a task type");
	const taskObservations = input.observations.filter(
		(observation) => observation.task_type === taskType,
	);
	const days = taskObservations
		.map((observation) => observation.production_day_sequence)
		.filter((day) => Number.isInteger(day) && day > 0);
	const end = days.length > 0 ? Math.max(...days) : 0;
	if (end < 1)
		throw new Error("evolution proposal requires a production-day baseline");
	const start = Math.max(1, end - EVALUATION_PRODUCTION_DAY_WINDOW + 1);
	return taskObservations
		.filter(
			(observation) =>
				observation.production_day_sequence >= start &&
				observation.production_day_sequence <= end,
		)
		.sort(
			(left, right) =>
				left.journal_sequence - right.journal_sequence ||
				left.id.localeCompare(right.id),
		);
}

/** Build the immutable, task-type-scoped baseline carried by a proposal. */
export function buildEvaluationContract(input: {
	candidate: Pick<SuggestionCandidate, "cluster_id" | "task_type">;
	baselineObservations: readonly ObservationRecord[];
	scorecard: Scorecard;
	targetMetrics: Readonly<Record<string, number | null>>;
}): EvaluationContractV1 {
	const taskType = input.candidate.task_type;
	if (!taskType) throw new Error("evolution proposal requires a task type");
	const baselineObservations = [...input.baselineObservations];
	const days = baselineObservations.map(
		(observation) => observation.production_day_sequence,
	);
	const end = Math.max(...days);
	const start = Math.max(1, end - EVALUATION_PRODUCTION_DAY_WINDOW + 1);
	const observationIds = baselineObservations.map(
		(observation) => observation.id,
	);
	const sessionIds = [
		...new Set(
			baselineObservations.map((observation) => observation.session_id),
		),
	].sort();
	return {
		contract_version: EVALUATION_CONTRACT_VERSION,
		comparator_version: EVALUATION_COMPARATOR_VERSION,
		task_type: taskType,
		cluster_id: input.candidate.cluster_id,
		baseline: {
			window: "recorded",
			production_day_range: { start, end },
			observation_ids: observationIds,
			session_ids: sessionIds,
			observation_digest: digest(
				baselineObservations.map((observation) => ({
					id: observation.id,
					journal_sequence: observation.journal_sequence,
					session_id: observation.session_id,
					production_day_sequence: observation.production_day_sequence,
				})),
			),
			anchor_journal_sequence: baselineObservations.reduce(
				(max, observation) => Math.max(max, observation.journal_sequence),
				0,
			),
			observation_count: baselineObservations.length,
			production_day_count: new Set(
				baselineObservations.map(
					(observation) => observation.production_day_sequence,
				),
			).size,
			scorecard: input.scorecard,
		},
		targets: {
			minimum_comparable_sessions: EVALUATION_MINIMUM_COMPARABLE_SESSIONS,
			production_day_window: EVALUATION_PRODUCTION_DAY_WINDOW,
			state: "canary",
			metrics: input.targetMetrics,
		},
	};
}

export function deriveSuggestionCandidates(input: {
	projectId: string;
	localDate: string;
	clusters: readonly SuggestionCluster[];
	observationsByFingerprint: ReadonlyMap<string, readonly ObservationRecord[]>;
	pendingCount?: number;
}): SuggestionDerivation {
	const candidates = input.clusters
		.flatMap((cluster) => {
			const observations =
				input.observationsByFingerprint.get(
					suggestionClusterKey(
						cluster.fingerprint_version,
						cluster.fingerprint,
					),
				) ?? [];
			if (observations.length === 0) return [];
			const cohorts = new Map<string, ObservationRecord[]>();
			for (const observation of observations) {
				const cohort = cohorts.get(observation.task_type) ?? [];
				cohort.push(observation);
				cohorts.set(observation.task_type, cohort);
			}
			const mixed = cohorts.size > 1;
			return [...cohorts.entries()]
				.sort(([left], [right]) => left.localeCompare(right))
				.flatMap(([taskType, cohort]) => {
					if (!taskType || cohort.length === 0) return [];
					const critical = isCriticalSuggestion(cohort);
					const alertEligible = [
						"observed",
						"candidate",
						"recurring",
						"reopened",
					].includes(cluster.state);
					const normalEligible = ["recurring", "reopened"].includes(
						cluster.state,
					);
					if ((!critical || !alertEligible) && (!normalEligible || critical))
						return [];
					const scopedCluster: SuggestionCluster = {
						...cluster,
						occurrence_count: cohort.length,
						distinct_session_count: new Set(
							cohort.map((observation) => observation.session_id),
						).size,
						distinct_production_day_count: new Set(
							cohort.map((observation) => observation.production_day_sequence),
						).size,
						...(mixed ? { source_refs: [] } : {}),
					};
					return [
						buildSuggestionCandidate({
							projectId: input.projectId,
							localDate: input.localDate,
							cluster: scopedCluster,
							observations: cohort,
							...(input.pendingCount === undefined
								? {}
								: { pendingCount: input.pendingCount }),
						}),
					];
				});
		})
		.sort(
			(left, right) =>
				right.score - left.score || left.id.localeCompare(right.id),
		);
	const normal = candidates.filter((candidate) => !candidate.critical);
	for (const candidate of normal)
		candidate.pending_count = Math.max(0, normal.length - 1);
	return {
		suggestions: normal,
		critical_alerts: candidates.filter((candidate) => candidate.critical),
	};
}

export function isMateriallyNewEvidence(
	candidate: Pick<SuggestionCandidate, "evidence_digest">,
	prior: { evidence_digest?: string } | null | undefined,
): boolean {
	return !prior || prior.evidence_digest !== candidate.evidence_digest;
}

export function suppressRejectedSuggestion(
	candidate: Pick<SuggestionCandidate, "evidence_digest">,
	receipt:
		| { receipt_status?: string; evidence_digest?: string }
		| null
		| undefined,
): boolean {
	return (
		receipt?.receipt_status === "rejected" &&
		receipt.evidence_digest === candidate.evidence_digest
	);
}
