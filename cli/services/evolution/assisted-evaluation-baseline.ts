import type { ArtifactReferenceV2 } from "../artifacts/types";
import { readProjectConfig } from "../project/paths";
import { scorecardFromObservations } from "./analysis";
import type { ArtifactReference } from "./artifact-inspection";
import { readProductionDayJournal } from "./journal";
import { readObservationJournal } from "./observation-journal";
import {
	OBSERVATION_FINGERPRINT_VERSION,
	type ObservationRecord,
} from "./observation-model";
import { resolveEvolutionConfig } from "./runtime-config";
import {
	buildEvaluationContract,
	type EvaluationContractV1,
	selectEvaluationBaselineObservations,
} from "./suggestion-model";

export type AssistedEvaluationSelector = {
	task_type: string;
	cluster_id: string;
};

export type AssistedEvaluationBaseline = {
	status:
		| "mapped"
		| "no_mapped_baseline"
		| "ambiguous_baseline"
		| "unavailable";
	reason: string;
	contract?: EvaluationContractV1;
};

function observationFromEvent(
	event: ReturnType<typeof readObservationJournal>[number],
): ObservationRecord | null {
	if (event.event_type !== "observation") return null;
	const raw = event.payload.observation;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const observation = raw as Record<string, unknown>;
	const taskType = String(observation.task_type ?? "");
	const fingerprint = String(observation.fingerprint ?? "");
	const sessionId = String(observation.session_id ?? "");
	const productionDay = Number(observation.production_day_sequence ?? 0);
	const journalSequence = Number(event.sequence);
	if (
		!taskType ||
		!fingerprint ||
		!sessionId ||
		!Number.isSafeInteger(productionDay) ||
		productionDay < 1 ||
		!Number.isSafeInteger(journalSequence)
	)
		return null;
	return {
		project_id: String(
			event.payload.project_id ?? observation.project_id ?? "",
		),
		id: String(observation.id ?? ""),
		kind: String(observation.kind ?? "workflow_friction"),
		fingerprint,
		fingerprint_version: Number(
			observation.fingerprint_version ?? OBSERVATION_FINGERPRINT_VERSION,
		),
		occurrence_identity: String(
			observation.occurrence_identity ?? observation.id ?? "",
		),
		session_id: sessionId,
		production_day_sequence: productionDay,
		task_type: taskType,
		impact: String(observation.impact ?? "unknown"),
		normalized_fields: (observation.normalized_fields ??
			{}) as ObservationRecord["normalized_fields"],
		source_refs: (observation.source_refs ??
			event.source_refs ??
			[]) as ObservationRecord["source_refs"],
		created_at: String(observation.created_at ?? event.timestamp),
		journal_sequence: journalSequence,
		journal_event_id: event.event_id,
	};
}

function baselineKey(observation: ObservationRecord): string {
	return JSON.stringify([observation.task_type, observation.fingerprint]);
}

function isV2EvidenceReference(
	ref: ArtifactReference | ArtifactReferenceV2,
): ref is ArtifactReferenceV2 {
	return (ref as ArtifactReferenceV2).schema_version === 2;
}

function readCurrentProductionDay(
	root: string,
	projectId: string,
): number | null {
	const config = resolveEvolutionConfig(readProjectConfig(root));
	const days = readProductionDayJournal(
		root,
		projectId,
		config.timezone,
		config.paths.evolutionEventsDir,
	);
	const dates = new Set<string>();
	for (const event of days) {
		if (event.payload.project_id === projectId)
			dates.add(event.payload.local_date);
	}
	return dates.size;
}

/** Maps referenced session owners to one canonical observation cohort and freezes its existing evaluator contract. */
export function prepareAssistedEvaluationBaseline(input: {
	root: string;
	projectId: string;
	evidenceRefs: readonly (ArtifactReference | ArtifactReferenceV2)[];
	selector?: AssistedEvaluationSelector;
}): AssistedEvaluationBaseline {
	let observations: ObservationRecord[];
	try {
		const config = resolveEvolutionConfig(readProjectConfig(input.root));
		const events = readObservationJournal(
			input.root,
			input.projectId,
			config.paths.evolutionEventsDir,
		);
		observations = events
			.map(observationFromEvent)
			.filter((row): row is ObservationRecord => row !== null);
	} catch {
		return {
			status: "unavailable",
			reason: "canonical observation journal is unavailable or unhealthy",
		};
	}
	const evidenceSessions = new Set(
		input.evidenceRefs.flatMap((ref) => {
			if (isV2EvidenceReference(ref))
				return ref.owner.kind === "session" ? [ref.owner.id] : [];
			return [ref.session_id];
		}),
	);
	const linked = observations.filter((row) =>
		evidenceSessions.has(row.session_id),
	);
	let selected: AssistedEvaluationSelector | undefined;
	if (input.selector) {
		const matching = linked.some(
			(row) =>
				row.task_type === input.selector?.task_type &&
				row.fingerprint === input.selector.cluster_id,
		);
		if (!matching)
			return {
				status: "unavailable",
				reason:
					"selected task_type and cluster_id do not map to an observation in the referenced sessions",
			};
		selected = input.selector;
	} else {
		const keys = new Map(linked.map((row) => [baselineKey(row), row]));
		if (keys.size === 0)
			return {
				status: "no_mapped_baseline",
				reason: "artifact sessions do not map to a canonical observed cohort",
			};
		if (keys.size > 1)
			return {
				status: "ambiguous_baseline",
				reason:
					"artifact sessions map to multiple observed cohorts; select task_type and cluster_id",
			};
		const row = keys.values().next().value as ObservationRecord;
		selected = { task_type: row.task_type, cluster_id: row.fingerprint };
	}

	const cohort = observations.filter(
		(row) =>
			row.task_type === selected?.task_type &&
			row.fingerprint === selected.cluster_id,
	);
	try {
		const baselineObservations = selectEvaluationBaselineObservations({
			candidate: {
				cluster_id: selected.cluster_id,
				task_type: selected.task_type,
			},
			observations: cohort,
		});
		const currentDay = readCurrentProductionDay(input.root, input.projectId);
		if (currentDay === null || currentDay < 1)
			return {
				status: "unavailable",
				reason: "canonical production-day ordinal is unavailable",
			};
		return {
			status: "mapped",
			reason:
				"one canonical observation cohort maps to the referenced artifact sessions",
			contract: buildEvaluationContract({
				candidate: {
					cluster_id: selected.cluster_id,
					task_type: selected.task_type,
				},
				baselineObservations,
				scorecard: scorecardFromObservations(
					baselineObservations,
					new Set(
						baselineObservations.map((row) => row.production_day_sequence),
					).size,
				),
				targetMetrics: {},
			}),
		};
	} catch {
		return {
			status: "unavailable",
			reason: "the selected cohort has no valid production-day baseline",
		};
	}
}
