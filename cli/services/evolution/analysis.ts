import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { readProjectConfig } from "../project/paths";
import { recurrenceThresholdsFromSettings } from "./config";
import {
	assertSafeEvolutionTarget,
	type EvolutionDbSnapshot,
	evolutionDbPath,
	openEvolutionDbSnapshot,
} from "./db";
import { checkEvolutionDbHealth, type EvolutionDbHealth } from "./health";
import { productionDayJournalPath } from "./journal";
import { observationJournalPath } from "./observation-journal";
import {
	deriveRecurrenceDecision,
	OBSERVATION_FINGERPRINT_VERSION,
	type ObservationRecord,
	observationRecordFromRow,
	type Scorecard,
} from "./observation-model";
import { preferenceJournalPath } from "./preference-journal";
import { resolveEvolutionConfig } from "./runtime-config";
import { suggestionJournalPath } from "./suggestion-journal";
import {
	applyRejectionNegativeEvidence,
	buildEvaluationContract,
	deriveSuggestionCandidates,
	EVALUATION_COMPARATOR_VERSION,
	EVALUATION_CONTRACT_VERSION,
	EVALUATION_MINIMUM_COMPARABLE_SESSIONS,
	EVALUATION_PRODUCTION_DAY_WINDOW,
	type EvaluationContractV1,
	type SuggestionCandidate,
	type SuggestionCluster,
	selectEvaluationBaselineObservations,
	suggestionClusterKey,
	suppressRejectedSuggestion,
} from "./suggestion-model";
import {
	readActiveReceiptProjection,
	readActiveSuggestionProjection,
} from "./suggestion-projection";

export const EVOLUTION_ANALYSIS_VERSION = 1;
export const MAX_EVOLUTION_PROPOSALS = 3;
export const MAX_EVOLUTION_CRITICAL_ALERTS = 3;
export const MAX_EVOLUTION_RANGE_OBSERVATIONS = 1_000;
export const MAX_ANALYSIS_DATABASE_BYTES = 16 * 1024 * 1024;
export const MAX_ANALYSIS_JOURNAL_BYTES = 8 * 1024 * 1024;
export const MAX_ANALYSIS_JOURNAL_LINES = 20_000;
export const MAX_ANALYSIS_SOURCE_REFS_BYTES = 8_192;
export const MAX_ANALYSIS_SOURCE_REF_COUNT = 16;

type AnalysisFileSnapshot = {
	path: string;
	exists: boolean;
	dev: number | null;
	ino: number | null;
	size: number | null;
	mtimeMs: number | null;
};

export type EvolutionAnalysisReadOnlyHooks = {
	beforeOpen?: (dbPath: string) => void;
};

type Finding = { severity: "fail" | "warn" | "info"; message: string };

export type EvolutionAnalysisState = {
	ok: boolean;
	stale?: boolean;
	findings?: readonly Finding[];
};

export type EvolutionAnalysisMode =
	| "analyze"
	| "weekly"
	| "after_merge"
	| "review";

export type EvolutionAnalysisInput = {
	projectId: string;
	state: EvolutionAnalysisState;
	candidates?: readonly SuggestionCandidate[];
	criticalAlerts?: readonly SuggestionCandidate[];
	observations?: readonly ObservationRecord[];
	scorecard?: Scorecard;
	observationCount?: number;
	productionDayCount?: number;
	mode?: EvolutionAnalysisMode;
	base?: string;
	head?: string;
	commitIds?: readonly string[];
	reviewProposalId?: string;
	now?: Date;
};

export type EvolutionAnalysisBaseline = {
	window: "recorded";
	observation_count: number;
	production_day_count: number;
	scorecard: Scorecard;
	minimum_comparable_sessions: 3;
	production_day_window: 5;
};

export type EvolutionAnalysisTarget = {
	minimum_comparable_sessions: 3;
	production_day_window: 5;
	state: "canary";
	metrics: Readonly<Record<string, number | null>>;
};

export type EvolutionProposalTargetKind =
	| "governance"
	| "behavior"
	| "documentation"
	| "code";

export type EvolutionProposalPreview = {
	id: string;
	fingerprint_version: number;
	rank: number;
	cluster_id: string;
	task_type: string;
	contract_version: typeof EVALUATION_CONTRACT_VERSION;
	comparator_version: typeof EVALUATION_COMPARATOR_VERSION;
	evaluation_contract: EvaluationContractV1;
	problem: string;
	recommendation: string;
	risk: string;
	validation: string;
	impact: string;
	score: number;
	confidence: number;
	occurrence_count: number;
	distinct_session_count: number;
	distinct_production_day_count: number;
	related_session_ids: readonly string[];
	related_session_count: number;
	evidence_refs: readonly Record<string, string>[];
	evidence_ref_count: number;
	evidence_digest: string;
	/** General F30 proposal routing; this is never an adoption destination. */
	target_kind: EvolutionProposalTargetKind;
	target_refs: readonly Record<string, string>[];
	provenance_digest: string;
	classification: "classified" | "needs_review";
	approval_required: true;
	execution_surface: "governed_workbench";
	baseline: EvolutionAnalysisBaseline;
	targets: EvolutionAnalysisTarget;
	/** Stable shorthand consumed by the CLI preview envelope. */
	target_metrics: Readonly<Record<string, number | null>>;
};

export type EvolutionCriticalAlert = Pick<
	EvolutionProposalPreview,
	| "cluster_id"
	| "problem"
	| "risk"
	| "validation"
	| "impact"
	| "occurrence_count"
	| "distinct_production_day_count"
	| "evidence_refs"
>;

export type EvolutionAnalysis = {
	version: typeof EVOLUTION_ANALYSIS_VERSION;
	project_id: string;
	mode: EvolutionAnalysisMode;
	scope: { base: string; head: string } | null;
	status: "available" | "blocked" | "empty";
	blocked_reason: string | null;
	generated_at: string;
	scorecard: Scorecard;
	baseline: EvolutionAnalysisBaseline;
	proposals: readonly EvolutionProposalPreview[];
	pending_count: number;
	critical_alerts: readonly EvolutionCriticalAlert[];
	critical_alert_count: number;
	critical_alert_pending_count: number;
	legacy_cluster_count: number;
	digest: string;
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

function number(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metric(value: number, better: "lower" | "higher") {
	return { value: Math.max(0, Math.floor(value)), better } as const;
}

/** Derive the five governed dimensions without collapsing them into one score. */
export function scorecardFromObservations(
	observations: readonly ObservationRecord[],
	productionDayCount = 0,
): Scorecard {
	const count = (kinds: ReadonlySet<string>) =>
		observations.filter((row) => kinds.has(row.kind)).length;
	const fingerprintCounts = new Map<string, number>();
	for (const observation of observations)
		fingerprintCounts.set(
			observation.fingerprint,
			(fingerprintCounts.get(observation.fingerprint) ?? 0) + 1,
		);
	return {
		rework: {
			recurring_issues: metric(
				[...fingerprintCounts.values()].filter((value) => value >= 3).length,
				"lower",
			),
			reopened_or_rollback: metric(
				count(new Set(["rollback", "regression"])),
				"lower",
			),
			repeated_corrections: metric(
				count(
					new Set([
						"user_correction",
						"user-correction",
						"repeated_instruction",
					]),
				),
				"lower",
			),
		},
		regressions: {
			failed_again: metric(
				count(new Set(["regression", "test_failure"])),
				"lower",
			),
			integrity_errors: metric(
				count(new Set(["integrity_error", "data_loss"])),
				"lower",
			),
		},
		user_load: {
			interventions: metric(
				count(
					new Set([
						"unnecessary_user_intervention",
						"user_correction",
						"user-correction",
					]),
				),
				"lower",
			),
			repeated_questions: metric(
				count(new Set(["repeated_instruction"])),
				"lower",
			),
		},
		outcome: {
			observed_results: metric(observations.length, "higher"),
			production_days: metric(productionDayCount, "higher"),
		},
		efficiency: {
			latency_outliers: metric(count(new Set(["latency_outlier"])), "lower"),
			token_outliers: metric(count(new Set(["token_outlier"])), "lower"),
		},
	};
}

function proposalId(projectId: string, candidate: SuggestionCandidate): string {
	return `EVO-${digest({ projectId, cluster: candidate.cluster_id, taskType: candidate.task_type, evidence: candidate.evidence_digest }).slice(0, 32)}`;
}

function targetMetrics(
	candidate: SuggestionCandidate,
): Readonly<Record<string, number | null>> {
	return {
		rework_recurring_issues: Math.max(0, candidate.occurrence_count - 1),
		rework_user_interventions: null,
		regressions: null,
	};
}

function classifyProposalTarget(taskType: string): {
	targetKind: EvolutionProposalTargetKind;
	classification: "classified" | "needs_review";
} {
	const normalized = taskType.trim().toLowerCase();
	if (/governance|policy|rule/.test(normalized))
		return { targetKind: "governance", classification: "classified" };
	if (/documentation|docs|readme/.test(normalized))
		return { targetKind: "documentation", classification: "classified" };
	if (/code|implementation|typescript|javascript|python/.test(normalized))
		return { targetKind: "code", classification: "classified" };
	return { targetKind: "behavior", classification: "needs_review" };
}

function publicSourceRefs(
	refs: ReadonlyArray<Record<string, string>>,
): Array<Record<string, string>> {
	return [...refs]
		.sort((left, right) => stableJson(left).localeCompare(stableJson(right)))
		.map((ref) =>
			Object.fromEntries(
				["id", "kind", "digest", "authority"]
					.map((key) => [key, ref[key]] as const)
					.filter((entry): entry is readonly [string, string] =>
						Boolean(entry[1]),
					),
			),
		)
		.filter((ref) => Boolean(ref.id && ref.kind))
		.slice(0, 4);
}

function publicCriticalAlert(
	candidate: SuggestionCandidate,
): EvolutionCriticalAlert {
	return {
		cluster_id: candidate.cluster_id,
		problem: candidate.problem,
		risk: candidate.risk,
		validation: candidate.validation,
		impact: candidate.impact,
		occurrence_count: candidate.occurrence_count,
		distinct_production_day_count: candidate.distinct_production_day_count,
		evidence_refs: publicSourceRefs(candidate.source_refs),
	};
}

export function analyzeEvolution(
	input: EvolutionAnalysisInput,
): EvolutionAnalysis {
	const now = input.now ?? new Date();
	const mode = input.mode ?? "analyze";
	const commitIds = new Set(input.commitIds ?? []);
	const inCommitScope = (refs: ReadonlyArray<Record<string, string>>) => {
		if (mode !== "after_merge") return true;
		const commitRefs = refs.filter((ref) => ref.kind === "commit");
		return (
			commitRefs.length > 0 &&
			commitRefs.every((ref) => commitIds.has(ref.id ?? ""))
		);
	};
	const candidateInCommitScope = (
		refs: ReadonlyArray<Record<string, string>>,
	) => {
		if (mode !== "after_merge") return true;
		const commitRefs = refs.filter((ref) => ref.kind === "commit");
		return (
			commitRefs.length > 0 &&
			commitRefs.every((ref) => commitIds.has(ref.id ?? ""))
		);
	};
	const scope =
		mode === "after_merge" && input.base && input.head
			? { base: input.base, head: input.head }
			: null;
	const observations = (input.observations ?? []).filter((observation) =>
		inCommitScope(observation.source_refs),
	);
	const productionDayCount =
		mode === "after_merge"
			? new Set(
					observations
						.map((observation) => observation.production_day_sequence)
						.filter((sequence) => sequence > 0),
				).size
			: input.productionDayCount;
	const scorecard =
		mode === "after_merge"
			? scorecardFromObservations(observations, productionDayCount)
			: (input.scorecard ??
				scorecardFromObservations(observations, productionDayCount));
	const baseline: EvolutionAnalysisBaseline = {
		window: "recorded",
		observation_count: Math.max(
			0,
			Math.floor(
				mode === "after_merge"
					? observations.length
					: number(input.observationCount, observations.length),
			),
		),
		production_day_count: Math.max(0, Math.floor(number(productionDayCount))),
		scorecard,
		minimum_comparable_sessions: 3,
		production_day_window: 5,
	};
	const findings = input.state.findings ?? [];
	const blockedReason =
		!input.state.ok || input.state.stale
			? (findings.find((finding) => finding.severity === "fail")?.message ??
				(input.state.stale
					? "evolution derived state is stale"
					: "evolution state is unhealthy"))
			: null;
	const legacyClusterCount = (input.candidates ?? []).filter(
		(candidate) =>
			candidate.fingerprint_version !== OBSERVATION_FINGERPRINT_VERSION,
	).length;
	const candidates = [...(input.candidates ?? [])]
		.filter(
			(candidate) =>
				candidate.fingerprint_version === OBSERVATION_FINGERPRINT_VERSION &&
				!candidate.critical &&
				candidate.state === "available" &&
				candidateInCommitScope(candidate.source_refs),
		)
		.sort(
			(left, right) =>
				right.score - left.score || left.id.localeCompare(right.id),
		);
	const reviewIndex = input.reviewProposalId
		? candidates.findIndex(
				(candidate) =>
					proposalId(input.projectId, candidate) === input.reviewProposalId,
			)
		: -1;
	const selectedCandidates =
		input.reviewProposalId !== undefined
			? reviewIndex >= 0
				? candidates[reviewIndex]
					? [{ candidate: candidates[reviewIndex], index: reviewIndex }]
					: []
				: []
			: candidates
					.slice(0, MAX_EVOLUTION_PROPOSALS)
					.map((candidate, index) => ({ candidate, index }));
	const proposals: EvolutionProposalPreview[] = blockedReason
		? []
		: selectedCandidates.map(({ candidate, index }) => {
				const taskType =
					candidate.task_type ??
					observations.find((observation) =>
						candidate.related_session_ids.includes(observation.session_id),
					)?.task_type;
				if (!taskType)
					throw new Error("evolution proposal requires a task type");
				const metrics = targetMetrics(candidate);
				const proposalTarget = classifyProposalTarget(taskType);
				const baselineObservations = selectEvaluationBaselineObservations({
					candidate: { cluster_id: candidate.cluster_id, task_type: taskType },
					observations,
				});
				const baselineProductionDays = new Set(
					baselineObservations.map(
						(observation) => observation.production_day_sequence,
					),
				).size;
				const evaluationContract = buildEvaluationContract({
					candidate: { cluster_id: candidate.cluster_id, task_type: taskType },
					baselineObservations,
					scorecard: scorecardFromObservations(
						baselineObservations,
						baselineProductionDays,
					),
					targetMetrics: metrics,
				});
				return {
					id: proposalId(input.projectId, candidate),
					fingerprint_version: candidate.fingerprint_version,
					rank: index + 1,
					cluster_id: candidate.cluster_id,
					task_type: taskType,
					contract_version: EVALUATION_CONTRACT_VERSION,
					comparator_version: EVALUATION_COMPARATOR_VERSION,
					evaluation_contract: evaluationContract,
					problem: candidate.problem,
					recommendation: candidate.recommendation,
					risk: candidate.risk,
					validation: candidate.validation,
					impact: candidate.impact,
					score: candidate.score,
					confidence: candidate.confidence,
					occurrence_count: candidate.occurrence_count,
					distinct_session_count: candidate.related_session_ids.length,
					distinct_production_day_count:
						candidate.distinct_production_day_count,
					related_session_ids: [...candidate.related_session_ids]
						.sort()
						.slice(0, 4),
					related_session_count: candidate.related_session_ids.length,
					evidence_refs: publicSourceRefs(candidate.source_refs),
					evidence_ref_count: candidate.source_refs.length,
					evidence_digest: candidate.evidence_digest,
					target_kind: proposalTarget.targetKind,
					target_refs: publicSourceRefs(candidate.source_refs),
					provenance_digest: candidate.evidence_digest,
					classification: proposalTarget.classification,
					approval_required: true,
					execution_surface: "governed_workbench",
					baseline,
					targets: {
						minimum_comparable_sessions: EVALUATION_MINIMUM_COMPARABLE_SESSIONS,
						production_day_window: EVALUATION_PRODUCTION_DAY_WINDOW,
						state: "canary",
						metrics,
					},
					target_metrics: metrics,
				};
			});
	const status = blockedReason
		? "blocked"
		: proposals.length > 0
			? "available"
			: "empty";
	const scopedCriticalAlerts = blockedReason
		? []
		: (input.criticalAlerts ?? []).filter((candidate) =>
				candidateInCommitScope(candidate.source_refs),
			);
	const content: Omit<EvolutionAnalysis, "generated_at" | "digest"> = {
		version: EVOLUTION_ANALYSIS_VERSION,
		project_id: input.projectId,
		mode,
		scope,
		status,
		blocked_reason: blockedReason,
		scorecard,
		baseline,
		proposals,
		pending_count: Math.max(0, candidates.length - proposals.length),
		critical_alerts: scopedCriticalAlerts
			.slice(0, MAX_EVOLUTION_CRITICAL_ALERTS)
			.map(publicCriticalAlert),
		critical_alert_count: scopedCriticalAlerts.length,
		critical_alert_pending_count: Math.max(
			0,
			scopedCriticalAlerts.length - MAX_EVOLUTION_CRITICAL_ALERTS,
		),
		legacy_cluster_count: legacyClusterCount,
	};
	return {
		...content,
		generated_at: now.toISOString(),
		digest: digest(content),
	};
}

function recordedScorecard(
	db: Database,
	projectId: string,
	productionDayCount: number,
): { scorecard: Scorecard; observationCount: number } {
	const rows = db
		.query(
			"SELECT kind,COUNT(*) AS count FROM observations WHERE project_id = ? GROUP BY kind",
		)
		.all(projectId) as Array<{ kind: string; count: number }>;
	const counts = new Map(
		rows.map((row) => [String(row.kind), Number(row.count)]),
	);
	const count = (...kinds: string[]) =>
		kinds.reduce((total, kind) => total + (counts.get(kind) ?? 0), 0);
	const observationCount = [...counts.values()].reduce(
		(total, value) => total + value,
		0,
	);
	const recurringIssues = Number(
		(
			db
				.query(
					"SELECT COUNT(*) AS count FROM issue_clusters WHERE project_id = ? AND state IN ('recurring','reopened','proposal_open','mitigation_canary')",
				)
				.get(projectId) as { count?: unknown } | null
		)?.count ?? 0,
	);
	return {
		observationCount,
		scorecard: {
			rework: {
				recurring_issues: metric(recurringIssues, "lower"),
				reopened_or_rollback: metric(count("rollback", "regression"), "lower"),
				repeated_corrections: metric(
					count("user_correction", "user-correction", "repeated_instruction"),
					"lower",
				),
			},
			regressions: {
				failed_again: metric(count("regression", "test_failure"), "lower"),
				integrity_errors: metric(
					count("integrity_error", "data_loss"),
					"lower",
				),
			},
			user_load: {
				interventions: metric(
					count(
						"unnecessary_user_intervention",
						"user_correction",
						"user-correction",
					),
					"lower",
				),
				repeated_questions: metric(count("repeated_instruction"), "lower"),
			},
			outcome: {
				observed_results: metric(observationCount, "higher"),
				production_days: metric(productionDayCount, "higher"),
			},
			efficiency: {
				latency_outliers: metric(count("latency_outlier"), "lower"),
				token_outliers: metric(count("token_outlier"), "lower"),
			},
		},
	};
}

function analysisFileSnapshot(path: string): AnalysisFileSnapshot {
	try {
		const stat = lstatSync(path);
		if (!stat.isFile())
			throw new Error("analysis state auxiliary is not a file");
		return {
			path,
			exists: true,
			dev: Number(stat.dev),
			ino: Number(stat.ino),
			size: Number(stat.size),
			mtimeMs: stat.mtimeMs,
		};
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT"
		)
			return {
				path,
				exists: false,
				dev: null,
				ino: null,
				size: null,
				mtimeMs: null,
			};
		throw error;
	}
}

function analysisStatePaths(
	root: string,
	resolved: ReturnType<typeof resolveEvolutionConfig>,
	dbPath: string,
): string[] {
	return [
		dbPath,
		`${dbPath}-wal`,
		`${dbPath}-shm`,
		observationJournalPath(root, resolved.paths.evolutionEventsDir),
		productionDayJournalPath(root, resolved.paths.evolutionEventsDir),
		preferenceJournalPath(root, resolved.paths.evolutionEventsDir),
		suggestionJournalPath(root, resolved.paths.evolutionEventsDir),
	];
}

function assertAnalysisStateLimits(
	root: string,
	resolved: ReturnType<typeof resolveEvolutionConfig>,
	dbPath: string,
): AnalysisFileSnapshot[] {
	assertSafeEvolutionTarget(dbPath, "evolution db", false);
	const paths = analysisStatePaths(root, resolved, dbPath);
	for (const path of paths.slice(1))
		assertSafeEvolutionTarget(path, "evolution analysis auxiliary");
	const snapshots = paths.map(analysisFileSnapshot);
	const walSnapshot = snapshots[1];
	const shmSnapshot = snapshots[2];
	if (!walSnapshot || !shmSnapshot)
		throw new Error("evolution analysis auxiliary invariant failed");
	if (!walSnapshot.exists || !shmSnapshot.exists)
		throw new Error(
			"evolution analysis requires stable WAL and SHM auxiliaries",
		);
	const databaseBytes = snapshots
		.slice(0, 3)
		.reduce((total, snapshot) => total + (snapshot.size ?? 0), 0);
	if (databaseBytes > MAX_ANALYSIS_DATABASE_BYTES)
		throw new Error("evolution analysis database state exceeds the size limit");
	let journalBytes = 0;
	let journalLines = 0;
	for (const snapshot of snapshots.slice(3)) {
		if (!snapshot.exists) continue;
		const content = readFileSync(snapshot.path);
		journalBytes += content.byteLength;
		journalLines += content
			.toString("utf8")
			.split(/\r?\n/)
			.filter(Boolean).length;
	}
	if (
		journalBytes > MAX_ANALYSIS_JOURNAL_BYTES ||
		journalLines > MAX_ANALYSIS_JOURNAL_LINES
	)
		throw new Error("evolution analysis journals exceed the size limit");
	return snapshots;
}

function assertAnalysisStateUnchanged(
	before: readonly AnalysisFileSnapshot[],
): void {
	for (const expected of before) {
		const actual = analysisFileSnapshot(expected.path);
		if (
			actual.exists !== expected.exists ||
			actual.dev !== expected.dev ||
			actual.ino !== expected.ino ||
			actual.size !== expected.size ||
			actual.mtimeMs !== expected.mtimeMs
		)
			throw new Error(
				`evolution analysis state changed during read-only analysis: ${expected.path} size=${expected.size}->${actual.size} mtime=${expected.mtimeMs}->${actual.mtimeMs}`,
			);
	}
}

function assertProjectedSourceRefLimits(db: Database, projectId: string): void {
	const invalid = db
		.query(
			`SELECT 1 FROM (
				SELECT source_refs FROM observations WHERE project_id = ?
				UNION ALL
				SELECT source_refs FROM issue_clusters WHERE project_id = ?
			) AS projected_refs
			WHERE json_valid(source_refs) = 0
				OR length(CAST(source_refs AS BLOB)) > ?
				OR CASE WHEN json_valid(source_refs) THEN json_array_length(source_refs) ELSE 0 END > ?
			LIMIT 1`,
		)
		.get(
			projectId,
			projectId,
			MAX_ANALYSIS_SOURCE_REFS_BYTES,
			MAX_ANALYSIS_SOURCE_REF_COUNT,
		);
	if (invalid)
		throw new Error(
			"evolution projected source refs exceed the analysis limit",
		);
}

function readRangeObservations(
	db: Database,
	projectId: string,
	commitIds: readonly string[],
): ObservationRecord[] {
	if (commitIds.length === 0) return [];
	const placeholders = commitIds.map(() => "?").join(",");
	const invalidRow = db
		.query(
			`SELECT 1 FROM observations
			 WHERE project_id = ?
			   AND (
					 json_valid(normalized_fields) = 0
					 OR length(CAST(normalized_fields AS BLOB)) > 4096
					 OR length(CAST(kind AS BLOB)) > 4000
					 OR length(CAST(session_id AS BLOB)) > 4000
					 OR length(CAST(task_type AS BLOB)) > 4000
					 OR length(CAST(impact AS BLOB)) > 4000
				 )
			 LIMIT 1`,
		)
		.get(projectId);
	if (invalidRow)
		throw new Error(
			"evolution after-merge evidence exceeds a structural limit",
		);
	const rows = db
		.query(
			`WITH candidate_observations AS (
				SELECT * FROM observations
				 WHERE project_id = ?
				   AND (${commitIds.map(() => "instr(CAST(source_refs AS TEXT), ?) > 0").join(" OR ")})
				 ORDER BY journal_sequence DESC,id DESC
				 LIMIT ${MAX_EVOLUTION_RANGE_OBSERVATIONS + 1}
			)
			 SELECT DISTINCT candidate_observations.*
			 FROM candidate_observations,json_each(candidate_observations.source_refs) AS source_ref
			 WHERE json_extract(source_ref.value,'$.kind') = 'commit'
			   AND json_extract(source_ref.value,'$.id') IN (${placeholders})
			 ORDER BY candidate_observations.journal_sequence DESC,candidate_observations.id DESC
			 LIMIT ${MAX_EVOLUTION_RANGE_OBSERVATIONS + 1}`,
		)
		.all(projectId, ...commitIds, ...commitIds) as Array<
		Record<string, unknown>
	>;
	if (rows.length > MAX_EVOLUTION_RANGE_OBSERVATIONS)
		throw new Error(
			"evolution after-merge evidence exceeds the analysis limit",
		);
	return rows.map(observationRecordFromRow);
}

function scopedClusters(
	clusters: readonly SuggestionCluster[],
	observations: readonly ObservationRecord[],
	thresholds: ReturnType<typeof recurrenceThresholdsFromSettings>,
) {
	const byFingerprint = new Map<string, ObservationRecord[]>();
	for (const observation of observations) {
		const key = suggestionClusterKey(
			observation.fingerprint_version,
			observation.fingerprint,
		);
		const rows = byFingerprint.get(key) ?? [];
		rows.push(observation);
		byFingerprint.set(key, rows);
	}
	return {
		clusters: clusters
			.filter((cluster) =>
				byFingerprint.has(
					suggestionClusterKey(
						cluster.fingerprint_version,
						cluster.fingerprint,
					),
				),
			)
			.map((cluster) => {
				const rows =
					byFingerprint.get(
						suggestionClusterKey(
							cluster.fingerprint_version,
							cluster.fingerprint,
						),
					) ?? [];
				const recurrence = deriveRecurrenceDecision(rows, false, thresholds);
				return {
					...cluster,
					state: recurrence.state,
					occurrence_count: recurrence.occurrence_count,
					distinct_session_count: recurrence.distinct_session_count,
					distinct_production_day_count:
						recurrence.distinct_production_day_count,
					user_confirmed_recurrence: false,
					source_refs: rows.flatMap((row) => row.source_refs),
				};
			}),
		observationsByFingerprint: byFingerprint,
	};
}

/** Read-only project facade. It never writes the database, journal, or git. */
export function analyzeEvolutionProject(
	root: string,
	options: Omit<
		EvolutionAnalysisInput,
		| "projectId"
		| "state"
		| "candidates"
		| "criticalAlerts"
		| "observations"
		| "scorecard"
		| "observationCount"
		| "productionDayCount"
	> = {},
	hooks: EvolutionAnalysisReadOnlyHooks = {},
): EvolutionAnalysis {
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	const projectId = resolved.projectId ?? "unknown";
	const dbPath = evolutionDbPath(root, resolved.paths.evolutionDb);
	if (!resolved.enabled || !resolved.projectId || !existsSync(dbPath))
		return analyzeEvolution({
			projectId,
			state: {
				ok: false,
				findings: [
					{ severity: "fail", message: "evolution state is unavailable" },
				],
			},
			...options,
		});
	// Reject oversized or unsafe state before any deferred SQLite finalizer can
	// checkpoint WAL content over the file being validated.
	assertAnalysisStateLimits(root, resolved, dbPath);
	// Bun may retain native SQLite statement finalizers after Database.close().
	// Drain prior handles before defining the read-only analysis boundary.
	Bun.gc(true);
	const stateBefore = assertAnalysisStateLimits(root, resolved, dbPath);
	hooks.beforeOpen?.(dbPath);
	assertAnalysisStateUnchanged(stateBefore);
	let snapshot: EvolutionDbSnapshot | undefined;
	try {
		snapshot = openEvolutionDbSnapshot(dbPath);
		const { db } = snapshot;
		const health: EvolutionDbHealth = checkEvolutionDbHealth(
			dbPath,
			projectId,
			{
				root,
				projectId,
				timezone: resolved.timezone,
				evolutionEventsDir: resolved.paths.evolutionEventsDir,
			},
			db,
		);
		assertAnalysisStateUnchanged(stateBefore);
		if (!health.ok)
			return analyzeEvolution({
				projectId,
				state: {
					ok: false,
					stale: health.migration_stale,
					findings: health.findings,
				},
				...options,
			});
		assertProjectedSourceRefLimits(db, projectId);
		const projection = readActiveSuggestionProjection(db, projectId);
		const observationFingerprints = Number(
			(
				db
					.query(
						"SELECT COUNT(DISTINCT fingerprint) AS count FROM observations WHERE project_id = ?",
					)
					.get(projectId) as { count?: unknown } | null
			)?.count ?? 0,
		);
		const clusterFingerprints = Number(
			(
				db
					.query(
						"SELECT COUNT(DISTINCT fingerprint) AS count FROM issue_clusters WHERE project_id = ?",
					)
					.get(projectId) as { count?: unknown } | null
			)?.count ?? 0,
		);
		const rangeMode = options.mode === "after_merge";
		const analysisObservations = rangeMode
			? readRangeObservations(db, projectId, options.commitIds ?? [])
			: projection.observations;
		const rangeProjection = rangeMode
			? scopedClusters(
					projection.clusters,
					analysisObservations,
					recurrenceThresholdsFromSettings(resolved.settings),
				)
			: {
					clusters: projection.clusters,
					observationsByFingerprint: projection.observationsByFingerprint,
				};
		const derivation =
			rangeProjection.clusters.length === 0
				? { suggestions: [], critical_alerts: [] }
				: deriveSuggestionCandidates({
						projectId,
						localDate: "1970-01-01",
						clusters: rangeProjection.clusters,
						observationsByFingerprint:
							rangeProjection.observationsByFingerprint,
					});
		const coarseV2Fingerprints = new Set(
			analysisObservations
				.filter(
					(observation) =>
						observation.fingerprint_version ===
							OBSERVATION_FINGERPRINT_VERSION &&
						/^[^\s]+$/.test(observation.normalized_fields.command),
				)
				.map((observation) => observation.fingerprint),
		);
		const rangeProductionDays = new Set(
			analysisObservations
				.map((observation) => observation.production_day_sequence)
				.filter((sequence) => sequence > 0),
		).size;
		const recorded = rangeMode
			? {
					observationCount: analysisObservations.length,
					scorecard: scorecardFromObservations(
						analysisObservations,
						rangeProductionDays,
					),
				}
			: recordedScorecard(db, projectId, health.production_day_count);
		const receipts = readActiveReceiptProjection(
			db,
			projectId,
			"1970-01-01",
			projection.candidateIds,
		).receipts;
		const globalDerivation = rangeMode
			? deriveSuggestionCandidates({
					projectId,
					localDate: "1970-01-01",
					clusters: projection.clusters,
					observationsByFingerprint: projection.observationsByFingerprint,
				})
			: null;
		const suggestions = derivation.suggestions
			.filter((candidate) => !coarseV2Fingerprints.has(candidate.cluster_id))
			.filter(
				(candidate) =>
					!receipts.some(
						(receipt) =>
							receipt.suggestion_id === candidate.id &&
							(suppressRejectedSuggestion(candidate, receipt) ||
								(rangeMode &&
									globalDerivation?.suggestions.some(
										(globalCandidate) =>
											globalCandidate.id === candidate.id &&
											suppressRejectedSuggestion(globalCandidate, receipt),
									))),
					),
			)
			.map((candidate) => {
				const rejectedCount = receipts.filter(
					(receipt) =>
						receipt.suggestion_id === candidate.id &&
						receipt.receipt_status === "rejected",
				).length;
				const feedback = applyRejectionNegativeEvidence({
					base_score: candidate.score,
					base_confidence: candidate.base_confidence,
					rejected_receipt_count: rejectedCount,
				});
				return {
					...candidate,
					score: feedback.score,
					confidence: feedback.confidence,
					rejected_receipt_count: feedback.rejected_receipt_count,
					confidence_reason: feedback.reason,
				};
			});
		return analyzeEvolution({
			projectId,
			state: {
				ok: true,
				stale:
					observationFingerprints > 0 &&
					observationFingerprints !== clusterFingerprints,
				findings:
					observationFingerprints > 0 &&
					observationFingerprints !== clusterFingerprints
						? [
								{
									severity: "fail",
									message:
										"evolution issue-cluster projection differs from observations",
								},
							]
						: [],
			},
			candidates: suggestions,
			criticalAlerts: derivation.critical_alerts.filter(
				(candidate) => !coarseV2Fingerprints.has(candidate.cluster_id),
			),
			observations: analysisObservations,
			scorecard: recorded.scorecard,
			observationCount: recorded.observationCount,
			productionDayCount: rangeMode
				? rangeProductionDays
				: health.production_day_count,
			...options,
		});
	} finally {
		assertAnalysisStateUnchanged(stateBefore);
		snapshot?.close();
		assertAnalysisStateUnchanged(stateBefore);
	}
}
