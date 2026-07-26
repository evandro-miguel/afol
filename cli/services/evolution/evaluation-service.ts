import { readProjectConfig } from "../project/paths";
import {
	assertTaskInProgress,
	readActiveSession,
} from "../workbench/lifecycle";
import { loadEvidenceEntries, sessionPaths } from "../workbench/session-reader";
import { scorecardFromObservations } from "./analysis";
import {
	type ApplyJournalEvent,
	readApplyJournal,
	withApplyLock,
} from "./apply-journal";
import { evolutionDbPath, openEvolutionDb } from "./db";
import {
	appendEvaluationEventUnlocked,
	type EvaluationEventInput,
	type EvaluationJournalEvent,
	evaluationDigest,
	readEvaluationJournal,
	rebuildEvaluationProjection,
	withEvaluationLock,
} from "./evaluation-journal";
import { readProductionDayJournal } from "./journal";
import { readObservationJournal } from "./observation-journal";
import {
	type ComparableCohort,
	compareScorecards,
	type ObservationRecord,
} from "./observation-model";
import { writeEvolutionProjectionCheckpoint } from "./projection-checkpoint";
import { resolveEvolutionConfig } from "./runtime-config";
import {
	assertEvaluationContract,
	EVALUATION_MINIMUM_COMPARABLE_SESSIONS,
	EVALUATION_PRODUCTION_DAY_WINDOW,
	type EvaluationContractV1,
} from "./suggestion-model";

export type EvaluationState =
	| "canary"
	| "stable"
	| "regressed"
	| "needs_more_data"
	| "not_evaluable"
	| "rolled_back"
	| "superseded";

export type EvaluationResult = {
	project_id: string;
	mutation_id: string;
	state: EvaluationState;
	reason: string;
	apply_commit_digest: string | null;
	production_day_window: { start: number; end: number; size: number };
	comparable_sessions: number;
	matching_observations: number;
	scorecard_comparison: Record<string, unknown>;
	journal_event_id?: string;
};

const EVALUATION_EVIDENCE_LIMITS = {
	maxBytes: 1_048_576,
	maxLines: 4_096,
	maxCandidates: 1_024,
} as const;

type EvaluationInput = {
	root: string;
	projectId?: string;
	mutationId: string;
};

type EvaluationProjectionRefresher = (
	root: string,
	projectId: string,
	eventsDir: string,
) => void;

function assertRecordingContext(input: {
	root: string;
	invocationClass: string;
	session: string;
	taskId: string;
}): void {
	if (input.invocationClass !== "explicit_local")
		throw new Error(
			"evolution evaluation recording requires explicit local invocation",
		);
	const active = readActiveSession(input.root);
	if (!active || active !== input.session)
		throw new Error(
			"evolution evaluation recording requires the active workbench session",
		);
	assertTaskInProgress(input.root, input.session, input.taskId);
}

function projectIdFor(root: string, projectId?: string): string {
	const configured = resolveEvolutionConfig(readProjectConfig(root)).projectId;
	const resolved = projectId ?? configured;
	if (!resolved) throw new Error("evolution project id is required");
	if (configured && configured !== resolved)
		throw new Error("evolution evaluation project identity mismatch");
	return resolved;
}

function observationFromEvent(
	event: ReturnType<typeof readObservationJournal>[number],
): ObservationRecord | null {
	if (event.event_type !== "observation") return null;
	const raw = event.payload.observation;
	if (!raw || typeof raw !== "object") return null;
	const observation = raw as Record<string, unknown>;
	return {
		project_id: String(event.payload.project_id ?? observation.project_id),
		id: String(observation.id),
		kind: String(observation.kind ?? "workflow_friction"),
		fingerprint: String(observation.fingerprint ?? ""),
		fingerprint_version: 1,
		occurrence_identity: String(
			observation.occurrence_identity ?? observation.id,
		),
		session_id: String(observation.session_id),
		production_day_sequence: Number(observation.production_day_sequence ?? 0),
		task_type: String(observation.task_type),
		impact: String(observation.impact ?? "unknown"),
		normalized_fields: (observation.normalized_fields ??
			{}) as ObservationRecord["normalized_fields"],
		source_refs: (observation.source_refs ??
			event.source_refs ??
			[]) as ObservationRecord["source_refs"],
		created_at: String(observation.created_at ?? event.timestamp),
		journal_sequence: event.sequence,
		journal_event_id: event.event_id,
	};
}

function committedApply(
	events: readonly ApplyJournalEvent[],
	mutationId: string,
): ApplyJournalEvent | null {
	return (
		events.findLast(
			(event) =>
				event.phase === "commit" && event.binding.mutation_id === mutationId,
		) ?? null
	);
}

function rolledBack(
	events: readonly ApplyJournalEvent[],
	mutationId: string,
): boolean {
	return events.some(
		(event) =>
			event.phase === "rollback" && event.binding.mutation_id === mutationId,
	);
}

function contractFor(
	commit: ApplyJournalEvent | null,
): EvaluationContractV1 | null {
	const contract = commit?.binding.evaluation_contract;
	if (!contract || commit.binding.validator_version !== "lesson-apply-v2")
		return null;
	assertEvaluationContract(contract);
	return contract;
}

function evaluationWindow(
	contract: EvaluationContractV1 | null,
	commit: ApplyJournalEvent | null = null,
): {
	start: number;
	end: number;
	size: number;
} {
	const baselineEnd = contract?.baseline.production_day_range.end ?? 0;
	const end = Math.max(
		baselineEnd,
		commit?.binding.evaluation_anchor_production_day_sequence ?? 0,
	);
	return {
		start: end + 1,
		end: end + EVALUATION_PRODUCTION_DAY_WINDOW,
		size: EVALUATION_PRODUCTION_DAY_WINDOW,
	};
}

function comparisonSummary(
	comparison: ReturnType<typeof compareScorecards>,
	forcedRegressions = 0,
): Record<string, unknown> {
	const countWorsened = (dimension: keyof typeof comparison.deltas): number => {
		const values = comparison.deltas[dimension];
		return Object.values(values).filter(
			(value) => value !== null && Number(value) > 0,
		).length;
	};
	return {
		comparable: comparison.comparable,
		accepted: comparison.accepted,
		reason: comparison.reason,
		deltas: comparison.deltas,
		regressions:
			forcedRegressions ||
			countWorsened("regressions") + countWorsened("rework"),
	};
}

function successfulCompletionOutcomes(input: {
	root: string;
	projectId: string;
	taskType: string;
	productionDays: ReturnType<typeof readProductionDayJournal>;
	window: { start: number; end: number };
}): ObservationRecord[] {
	const daySequences = new Map<string, number>();
	const sessions = new Map<string, ObservationRecord>();
	const completionBySession = new Map<
		string,
		ReturnType<typeof loadEvidenceEntries>[number] | null
	>();
	for (const event of input.productionDays) {
		let daySequence = daySequences.get(event.payload.local_date);
		if (daySequence === undefined) {
			daySequence = daySequences.size + 1;
			daySequences.set(event.payload.local_date, daySequence);
		}
		if (
			daySequence < input.window.start ||
			daySequence > input.window.end ||
			event.payload.project_id !== input.projectId
		)
			continue;
		const sessionId = event.payload.evidence.session_id;
		let evidence = completionBySession.get(sessionId);
		if (evidence === undefined) {
			evidence =
				loadEvidenceEntries(
					sessionPaths(input.root, sessionId).evidencePath,
					EVALUATION_EVIDENCE_LIMITS,
				).find(
					(entry) =>
						entry.project_id === input.projectId &&
						entry.session_id === sessionId &&
						entry.task_id === input.taskType &&
						entry.result === "passed" &&
						entry.exit_code === 0 &&
						entry.provenance === "observed" &&
						entry.purpose === "completion" &&
						new Set(["execution", "artifact", "waiver"]).has(
							entry.authorization_type ?? "",
						),
				) ?? null;
			completionBySession.set(sessionId, evidence);
		}
		if (!evidence) continue;
		const evidenceId = evidence.id;
		sessions.set(sessionId, {
			project_id: input.projectId,
			id: `OUT-${event.event_id}`,
			kind: "successful_completion",
			fingerprint: `completion:${input.taskType}`,
			fingerprint_version: 1,
			occurrence_identity: `completion:${evidenceId}`,
			session_id: sessionId,
			production_day_sequence: daySequence,
			task_type: input.taskType,
			impact: "successful_outcome",
			normalized_fields: {
				kind: "successful_completion",
				error_code: "",
				test: "",
				command: "completion",
				path_module: "",
				operation: "complete",
				workflow_step: "completion",
				stack_digest: "",
				provider: "afol",
			},
			source_refs: [{ id: evidenceId, kind: "evidence" }],
			created_at: evidence.created_at,
			journal_sequence: 0,
			journal_event_id: event.event_id,
		});
	}
	return [...sessions.values()].sort((left, right) =>
		left.session_id.localeCompare(right.session_id),
	);
}

function baseResult(
	input: EvaluationInput,
	state: EvaluationState,
	reason: string,
	commit: ApplyJournalEvent | null,
	contract: EvaluationContractV1 | null,
): EvaluationResult {
	return {
		project_id: projectIdFor(input.root, input.projectId),
		mutation_id: input.mutationId,
		state,
		reason,
		apply_commit_digest: commit?.event_digest ?? null,
		production_day_window: evaluationWindow(contract, commit),
		comparable_sessions: 0,
		matching_observations: 0,
		scorecard_comparison: { comparable: false, accepted: false, reason },
	};
}

function previewProposalEvaluationUnlocked(
	root: string,
	mutationId: string,
	projectId?: string,
): EvaluationResult {
	const resolvedProjectId = projectIdFor(root, projectId);
	const resolvedConfig = resolveEvolutionConfig(readProjectConfig(root));
	const eventsDir = resolvedConfig.paths.evolutionEventsDir;
	const applies = readApplyJournal(root, eventsDir);
	const commit = committedApply(applies, mutationId);
	if (commit && commit.binding.project_id !== resolvedProjectId)
		throw new Error("evolution evaluation apply project identity mismatch");
	const contract = contractFor(commit);
	if (!commit)
		return baseResult(
			{ root, mutationId, projectId: resolvedProjectId },
			"not_evaluable",
			"v1 apply binding or baseline is missing",
			null,
			null,
		);
	if (rolledBack(applies, mutationId))
		return baseResult(
			{ root, mutationId, projectId: resolvedProjectId },
			"rolled_back",
			"apply mutation was rolled back",
			commit,
			contract,
		);
	const priorSupersession = readEvaluationJournal(
		root,
		resolvedProjectId,
		eventsDir,
	).find(
		(event) =>
			event.event_type === "supersession" && event.mutation_id === mutationId,
	);
	if (priorSupersession) return eventResult(priorSupersession);
	if (!contract)
		return baseResult(
			{ root, mutationId, projectId: resolvedProjectId },
			"not_evaluable",
			"v1 apply has no evaluation contract",
			commit,
			null,
		);
	const journalEvents = readObservationJournal(
		root,
		resolvedProjectId,
		eventsDir,
	);
	const all = journalEvents
		.map(observationFromEvent)
		.filter((item): item is ObservationRecord => item !== null);
	const window = evaluationWindow(contract, commit);
	const post = all.filter(
		(observation) =>
			observation.journal_sequence >
				contract.baseline.anchor_journal_sequence &&
			observation.task_type === contract.task_type &&
			observation.production_day_sequence >= window.start &&
			observation.production_day_sequence <= window.end,
	);
	const matching = post.filter(
		(observation) => observation.fingerprint === contract.cluster_id,
	);
	const productionDays = readProductionDayJournal(
		root,
		resolvedProjectId,
		resolvedConfig.timezone,
		resolvedConfig.paths.evolutionEventsDir,
	);
	const successfulOutcomes = successfulCompletionOutcomes({
		root,
		projectId: resolvedProjectId,
		taskType: contract.task_type,
		productionDays,
		window,
	});
	const productionDayCount = new Set(
		productionDays
			.filter((event) => event.payload.project_id === resolvedProjectId)
			.map((event) => event.payload.local_date),
	).size;
	const fullWindow = productionDayCount >= window.end;
	const outcomeObservations = [...post, ...successfulOutcomes];
	const comparableSessions = new Set(
		outcomeObservations.map((observation) => observation.session_id),
	).size;
	const cohort: ComparableCohort = {
		task_type: contract.task_type,
		observations: outcomeObservations,
		minimum_data: EVALUATION_MINIMUM_COMPARABLE_SESSIONS,
		distinct_production_days: new Set(
			outcomeObservations.map(
				(observation) => observation.production_day_sequence,
			),
		).size,
		comparable:
			comparableSessions >= EVALUATION_MINIMUM_COMPARABLE_SESSIONS &&
			fullWindow,
	};
	const currentScorecard = scorecardFromObservations(
		outcomeObservations,
		cohort.distinct_production_days,
	);
	const comparison = compareScorecards(
		contract.baseline.scorecard,
		currentScorecard,
		cohort,
	);
	let state: EvaluationState = "canary";
	let reason = "evaluation window or comparable sessions are incomplete";
	if (matching.length > 0) {
		state = "regressed";
		reason = "matching recurrence has immediate regressed precedence";
	} else if (!fullWindow) {
		state = "canary";
		reason = "evaluation production-day window is incomplete";
	} else if (comparableSessions < EVALUATION_MINIMUM_COMPARABLE_SESSIONS) {
		state = "needs_more_data";
		reason = "fewer than three comparable sessions are available";
	} else if (comparison.accepted) {
		state = "stable";
		reason = comparison.reason;
	} else if (comparison.comparable) {
		state = "needs_more_data";
		reason = comparison.reason;
	}
	return {
		project_id: resolvedProjectId,
		mutation_id: mutationId,
		state,
		reason,
		apply_commit_digest: commit.event_digest,
		production_day_window: window,
		comparable_sessions: comparableSessions,
		matching_observations: matching.length,
		scorecard_comparison: comparisonSummary(
			comparison,
			state === "regressed" ? 1 : 0,
		),
	};
}

export function previewProposalEvaluation(
	root: string,
	mutationId: string,
	projectId?: string,
): EvaluationResult {
	return withEvaluationLock(root, () =>
		previewProposalEvaluationUnlocked(root, mutationId, projectId),
	);
}

function eventResult(event: EvaluationJournalEvent): EvaluationResult {
	return {
		project_id: event.project_id,
		mutation_id: event.mutation_id,
		state: event.state,
		reason: String(event.reason ?? "recorded evaluation"),
		apply_commit_digest: event.apply_commit_digest ?? null,
		production_day_window: {
			start: event.production_day_window?.start ?? 0,
			end: event.production_day_window?.end ?? 0,
			size: event.production_day_window?.size ?? 0,
		},
		comparable_sessions: event.comparable_sessions ?? 0,
		matching_observations: Number(event.matching_observations ?? 0),
		scorecard_comparison: event.scorecard_comparison ?? {},
		journal_event_id: event.event_id,
	};
}

function evaluationIdempotencyDigest(result: EvaluationResult): string {
	return evaluationDigest({
		mutation_id: result.mutation_id,
		apply_commit_digest: result.apply_commit_digest,
		state: result.state,
		production_day_window: result.production_day_window,
		comparable_sessions: result.comparable_sessions,
		matching_observations: result.matching_observations,
		scorecard_comparison: result.scorecard_comparison,
	});
}

function appendAndProjectUnlocked(
	root: string,
	event: EvaluationEventInput,
	eventsDir: string,
	projectionRefresher: EvaluationProjectionRefresher,
): EvaluationJournalEvent {
	const appended = appendEvaluationEventUnlocked(root, event, eventsDir);
	refreshEvaluationProjectionBestEffort(
		root,
		event.project_id,
		eventsDir,
		projectionRefresher,
	);
	return appended;
}

function refreshEvaluationProjectionBestEffort(
	root: string,
	projectId: string,
	eventsDir: string,
	projectionRefresher: EvaluationProjectionRefresher,
): void {
	try {
		projectionRefresher(root, projectId, eventsDir);
	} catch {
		// The journal is canonical. Projection/checkpoint refresh is recoverable
		// on the next idempotent record or through derived-state repair.
	}
}

function projectEvaluationJournalUnlocked(
	root: string,
	projectId: string,
	eventsDir: string,
): void {
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	const db = openEvolutionDb(evolutionDbPath(root, resolved.paths.evolutionDb));
	try {
		rebuildEvaluationProjection({ root, projectId, db, eventsDir });
		writeEvolutionProjectionCheckpoint({
			root,
			db,
			projectId,
			eventsDir,
		});
	} finally {
		db.close();
	}
}

export function recordProposalEvaluation(
	input: EvaluationInput & {
		invocationClass: string;
		session: string;
		taskId: string;
		now?: Date;
		projectionRefresher?: EvaluationProjectionRefresher;
	},
): EvaluationResult {
	assertRecordingContext(input);
	return withApplyLock(input.root, () =>
		withEvaluationLock(input.root, () => {
			const projectId = projectIdFor(input.root, input.projectId);
			const eventsDir = resolveEvolutionConfig(readProjectConfig(input.root))
				.paths.evolutionEventsDir;
			const applies = readApplyJournal(input.root, eventsDir);
			if (!committedApply(applies, input.mutationId))
				return previewProposalEvaluationUnlocked(
					input.root,
					input.mutationId,
					projectId,
				);
			const preview = previewProposalEvaluationUnlocked(
				input.root,
				input.mutationId,
				projectId,
			);
			if (preview.state === "superseded") return preview;
			const idempotencyDigest = evaluationIdempotencyDigest(preview);
			const existing = readEvaluationJournal(
				input.root,
				projectId,
				eventsDir,
			).find(
				(event) =>
					event.event_type === "evaluation" &&
					event.mutation_id === input.mutationId &&
					event.idempotency_digest === idempotencyDigest,
			);
			if (existing) {
				refreshEvaluationProjectionBestEffort(
					input.root,
					projectId,
					eventsDir,
					input.projectionRefresher ?? projectEvaluationJournalUnlocked,
				);
				return eventResult(existing);
			}
			const event: EvaluationEventInput = {
				event_id: `EV-${idempotencyDigest.slice(0, 32)}`,
				event_type: "evaluation",
				project_id: projectId,
				mutation_id: input.mutationId,
				state: preview.state,
				reason: preview.reason,
				created_at: (input.now ?? new Date()).toISOString(),
				session: input.session,
				task_id: input.taskId,
				apply_commit_digest: preview.apply_commit_digest ?? undefined,
				apply_journal_sequence: applies.length,
				comparable_sessions: preview.comparable_sessions,
				production_day_window: preview.production_day_window,
				matching_observations: preview.matching_observations,
				scorecard_comparison: preview.scorecard_comparison,
				idempotency_digest: idempotencyDigest,
			};
			const appended = appendAndProjectUnlocked(
				input.root,
				event,
				eventsDir,
				input.projectionRefresher ?? projectEvaluationJournalUnlocked,
			);
			return { ...preview, journal_event_id: appended.event_id };
		}),
	);
}

export function recordProposalSupersession(input: {
	root: string;
	projectId?: string;
	subjectMutationId: string;
	successorMutationId: string;
	reason: string;
	invocationClass: string;
	session: string;
	taskId: string;
	now?: Date;
	projectionRefresher?: EvaluationProjectionRefresher;
}): EvaluationResult {
	assertRecordingContext(input);
	if (!input.reason.trim()) throw new Error("supersession reason is required");
	if (input.subjectMutationId === input.successorMutationId)
		throw new Error("supersession successor must differ from subject");
	return withApplyLock(input.root, () =>
		withEvaluationLock(input.root, () => {
			const projectId = projectIdFor(input.root, input.projectId);
			const eventsDir = resolveEvolutionConfig(readProjectConfig(input.root))
				.paths.evolutionEventsDir;
			const applies = readApplyJournal(input.root, eventsDir);
			const subject = committedApply(applies, input.subjectMutationId);
			const successor = committedApply(applies, input.successorMutationId);
			if (!subject || !successor)
				throw new Error(
					"supersession requires committed subject and successor mutations",
				);
			if (
				subject.binding.project_id !== projectId ||
				successor.binding.project_id !== projectId
			)
				throw new Error("supersession apply project identity mismatch");
			if (rolledBack(applies, input.subjectMutationId))
				throw new Error("supersession subject was rolled back");
			if (rolledBack(applies, input.successorMutationId))
				throw new Error("supersession successor was rolled back");
			const journal = readEvaluationJournal(input.root, projectId, eventsDir);
			const existing = journal.find(
				(event) =>
					event.event_type === "supersession" &&
					event.mutation_id === input.subjectMutationId,
			);
			if (existing) {
				if (
					existing.successor_mutation_id !== input.successorMutationId ||
					existing.reason !== input.reason ||
					existing.session !== input.session ||
					existing.task_id !== input.taskId
				)
					throw new Error("conflicting supersession already recorded");
				refreshEvaluationProjectionBestEffort(
					input.root,
					projectId,
					eventsDir,
					input.projectionRefresher ?? projectEvaluationJournalUnlocked,
				);
				return eventResult(existing);
			}
			if (successor.sequence <= subject.sequence)
				throw new Error("supersession successor must be a later commit");
			if (
				subject.binding.validator_version !== "lesson-apply-v2" ||
				successor.binding.validator_version !== "lesson-apply-v2"
			)
				throw new Error("supersession requires v2 evaluation contracts");
			if (
				subject.binding.cluster_id !== successor.binding.cluster_id ||
				subject.binding.task_type !== successor.binding.task_type
			)
				throw new Error(
					"supersession successor cluster or task type does not match",
				);
			const idempotencyDigest = evaluationDigest({
				subject_mutation_id: input.subjectMutationId,
				successor_mutation_id: input.successorMutationId,
				subject_apply_commit_digest: subject.event_digest,
				successor_apply_commit_digest: successor.event_digest,
				reason: input.reason,
				session: input.session,
				task_id: input.taskId,
			});
			const event: EvaluationEventInput = {
				event_id: `EV-${idempotencyDigest.slice(0, 32)}`,
				event_type: "supersession",
				project_id: projectId,
				mutation_id: input.subjectMutationId,
				state: "superseded",
				reason: input.reason,
				created_at: (input.now ?? new Date()).toISOString(),
				session: input.session,
				task_id: input.taskId,
				apply_commit_digest: subject.event_digest,
				successor_mutation_id: input.successorMutationId,
				successor_apply_commit_digest: successor.event_digest,
				apply_journal_sequence: applies.at(-1)?.sequence ?? successor.sequence,
				idempotency_digest: idempotencyDigest,
			};
			const appended = appendAndProjectUnlocked(
				input.root,
				event,
				eventsDir,
				input.projectionRefresher ?? projectEvaluationJournalUnlocked,
			);
			return eventResult(appended);
		}),
	);
}
