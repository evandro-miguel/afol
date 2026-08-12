import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
	OBSERVATION_FINGERPRINT_VERSION,
	type ObservationRecord,
	observationRecordFromRow,
} from "./observation-model";
import {
	type SuggestionCluster,
	suggestionClusterKey,
	suggestionId,
} from "./suggestion-model";
import type { SuggestionReceipt } from "./suggestion-receipt";

export const MAX_ACTIVE_CLUSTERS = 256;
export const MAX_OBSERVATIONS_PER_CLUSTER = 8;
export const MAX_FEEDBACK_RECEIPTS_PER_STATUS = 32;

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

function parseRefs(value: unknown): Array<Record<string, string>> {
	try {
		const parsed = JSON.parse(String(value));
		return Array.isArray(parsed)
			? parsed.filter(
					(entry): entry is Record<string, string> =>
						entry !== null &&
						typeof entry === "object" &&
						!Array.isArray(entry) &&
						Object.values(entry).every(
							(item) =>
								typeof item === "string" &&
								/^[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]{1,512}$/.test(item),
						),
				)
			: [];
	} catch {
		return [];
	}
}

export type ActiveSuggestionProjection = {
	clusters: SuggestionCluster[];
	observations: ObservationRecord[];
	observationsByFingerprint: Map<string, ObservationRecord[]>;
	candidateIds: string[];
	digest: string;
};

export function readActiveSuggestionProjection(
	db: Database,
	projectId: string,
): ActiveSuggestionProjection {
	const clusters = (
		db
			.query(
				`SELECT fingerprint_version,fingerprint,state,occurrence_count,distinct_session_count,distinct_production_day_count,priority,user_confirmed_recurrence,source_refs
				 FROM issue_clusters
					 WHERE project_id = ? AND fingerprint_version = ?
					 AND state IN ('observed','candidate','recurring','reopened')
				 ORDER BY priority DESC,occurrence_count DESC,fingerprint
				 LIMIT ${MAX_ACTIVE_CLUSTERS}`,
			)
			.all(projectId, OBSERVATION_FINGERPRINT_VERSION) as Array<
			Record<string, unknown>
		>
	).map((row) => ({
		fingerprint: String(row.fingerprint),
		fingerprint_version: Number(row.fingerprint_version),
		state: String(row.state) as SuggestionCluster["state"],
		occurrence_count: Number(row.occurrence_count),
		distinct_session_count: Number(row.distinct_session_count),
		distinct_production_day_count: Number(row.distinct_production_day_count),
		priority: Number(row.priority),
		user_confirmed_recurrence: Number(row.user_confirmed_recurrence) === 1,
		source_refs: parseRefs(row.source_refs),
	}));
	const clusterPairs = clusters.map((cluster) => ({
		fingerprint: cluster.fingerprint,
		fingerprintVersion:
			cluster.fingerprint_version ?? OBSERVATION_FINGERPRINT_VERSION,
	}));
	const observations =
		clusterPairs.length === 0
			? []
			: (
					db
						.query(
							`WITH ranked AS (
								SELECT observations.*,
									ROW_NUMBER() OVER (
										PARTITION BY fingerprint_version,fingerprint
										ORDER BY journal_sequence DESC,id DESC
									) AS candidate_rank
								FROM observations
								WHERE project_id = ? AND (fingerprint_version,fingerprint) IN (${clusterPairs.map(() => "(?,?)").join(",")})
							)
							SELECT * FROM ranked WHERE candidate_rank <= ${MAX_OBSERVATIONS_PER_CLUSTER}`,
						)
						.all(
							projectId,
							...clusterPairs.flatMap((pair) => [
								pair.fingerprintVersion,
								pair.fingerprint,
							]),
						) as Array<Record<string, unknown>>
				).map(observationRecordFromRow);
	const observationsByFingerprint = new Map<string, ObservationRecord[]>();
	for (const observation of observations) {
		const key = suggestionClusterKey(
			observation.fingerprint_version,
			observation.fingerprint,
		);
		const rows = observationsByFingerprint.get(key) ?? [];
		rows.push(observation);
		observationsByFingerprint.set(key, rows);
	}
	const candidateIds = [
		...new Set(
			clusters.flatMap((cluster) => {
				const taskTypes = new Set(
					(
						observationsByFingerprint.get(
							suggestionClusterKey(
								cluster.fingerprint_version,
								cluster.fingerprint,
							),
						) ?? []
					).map((observation) => observation.task_type),
				);
				return [...taskTypes].map((taskType) =>
					suggestionId(
						projectId,
						cluster.fingerprint_version ?? OBSERVATION_FINGERPRINT_VERSION,
						cluster.fingerprint,
						taskType,
					),
				);
			}),
		),
	].sort();
	return {
		clusters,
		observations,
		observationsByFingerprint,
		candidateIds,
		digest: digest({ clusters, observations }),
	};
}

export function readActiveReceiptProjection(
	db: Database,
	projectId: string,
	localDate: string,
	suggestionIds: readonly string[],
): { receipts: SuggestionReceipt[]; digest: string } {
	const current = db
		.query(
			"SELECT * FROM daily_suggestion_receipts WHERE project_id = ? AND local_date = ?",
		)
		.all(projectId, localDate) as SuggestionReceipt[];
	if (suggestionIds.length === 0)
		return { receipts: current, digest: digest(current) };
	const placeholders = suggestionIds.map(() => "?").join(",");
	const feedback = db
		.query(
			`WITH ranked AS (
				SELECT daily_suggestion_receipts.*,
					ROW_NUMBER() OVER (
						PARTITION BY suggestion_id,receipt_status
						ORDER BY local_date DESC,journal_sequence DESC
					) AS feedback_rank
				FROM daily_suggestion_receipts
				WHERE project_id = ? AND suggestion_id IN (${placeholders})
					AND receipt_status IN ('rejected','skipped')
			)
			SELECT * FROM ranked WHERE feedback_rank <= ${MAX_FEEDBACK_RECEIPTS_PER_STATUS}`,
		)
		.all(projectId, ...suggestionIds) as SuggestionReceipt[];
	const seen = new Set(current.map((receipt) => receipt.journal_event_id));
	const receipts = [
		...current,
		...feedback.filter((receipt) => !seen.has(receipt.journal_event_id)),
	];
	return { receipts, digest: digest(receipts) };
}

export function activeReceiptIntegrityDigest(
	db: Database,
	projectId: string,
	suggestionIds: readonly string[],
): string {
	const latest = db
		.query(
			"SELECT * FROM daily_suggestion_receipts WHERE project_id = ? ORDER BY local_date DESC,journal_sequence DESC LIMIT 1",
		)
		.all(projectId) as SuggestionReceipt[];
	if (suggestionIds.length === 0) return digest(latest);
	const placeholders = suggestionIds.map(() => "?").join(",");
	const feedback = db
		.query(
			`WITH ranked AS (
				SELECT daily_suggestion_receipts.*,
					ROW_NUMBER() OVER (
						PARTITION BY suggestion_id,receipt_status
						ORDER BY local_date DESC,journal_sequence DESC
					) AS feedback_rank
				FROM daily_suggestion_receipts
				WHERE project_id = ? AND suggestion_id IN (${placeholders})
					AND receipt_status IN ('rejected','skipped')
			)
			SELECT * FROM ranked WHERE feedback_rank <= ${MAX_FEEDBACK_RECEIPTS_PER_STATUS}`,
		)
		.all(projectId, ...suggestionIds) as SuggestionReceipt[];
	const seen = new Set(latest.map((receipt) => receipt.journal_event_id));
	return digest([
		...latest,
		...feedback.filter((receipt) => !seen.has(receipt.journal_event_id)),
	]);
}
