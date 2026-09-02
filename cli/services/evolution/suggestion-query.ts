import { existsSync } from "node:fs";
import { readProjectConfig } from "../project/paths";
import { localDateForTimezone } from "./config";
import {
	assertSafeEvolutionTarget,
	evolutionDbPath,
	withEvolutionDbSnapshot,
} from "./db";
import { getEvolutionStatus } from "./health";
import { EVOLUTION_SCHEMA_VERSION } from "./migrations";
import { assertEvolutionProjectionCheckpoint } from "./projection-checkpoint";
import { resolveEvolutionConfig } from "./runtime-config";
import type { SuggestionReceipt } from "./suggestion-journal";
import {
	applyRejectionNegativeEvidence,
	deriveSuggestionCandidates,
	type SuggestionCandidate,
	type SuggestionDerivation,
	suppressRejectedSuggestion,
} from "./suggestion-model";
import {
	readActiveReceiptProjection,
	readActiveSuggestionProjection,
} from "./suggestion-projection";

export type DailySuggestionStatus =
	| "disabled"
	| "unavailable"
	| "empty"
	| "claimed"
	| "shown"
	| "skipped"
	| "accepted"
	| "rejected"
	| "available";

export type DailySuggestionPreview = {
	daily_status: DailySuggestionStatus;
	suggestion: Record<string, unknown> | null;
	pending_count: number;
	critical_alerts: Array<Record<string, unknown>>;
};

function dailySuggestionSettings(settings: Record<string, unknown>): {
	firstSessionOfDay: boolean;
	remindSkippedNextDay: boolean;
} {
	const value = settings.suggestions;
	const suggestions =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	return {
		firstSessionOfDay: suggestions.first_session_of_day !== false,
		remindSkippedNextDay: suggestions.remind_skipped_next_day !== false,
	};
}

function withoutSecrets(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(withoutSecrets);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([key]) => !/(?:token|digest)/i.test(key))
				.map(([key, item]) => [key, withoutSecrets(item)]),
		);
	}
	return value;
}

function publicCandidate(
	candidate: SuggestionCandidate,
): Record<string, unknown> {
	return withoutSecrets(candidate) as Record<string, unknown>;
}

function currentReceipt(
	receipts: readonly SuggestionReceipt[],
	projectId: string,
	localDate: string,
): SuggestionReceipt | null {
	return (
		receipts.find(
			(receipt) =>
				receipt.project_id === projectId && receipt.local_date === localDate,
		) ?? null
	);
}

function derive(
	root: string,
	projectId: string,
	localDate: string,
): { derivation: SuggestionDerivation; receipts: SuggestionReceipt[] } | null {
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	const dbPath = evolutionDbPath(root, resolved.paths.evolutionDb);
	if (!existsSync(dbPath)) return null;
	assertSafeEvolutionTarget(dbPath, "evolution db", false);
	assertSafeEvolutionTarget(`${dbPath}-wal`, "evolution db WAL");
	assertSafeEvolutionTarget(`${dbPath}-shm`, "evolution db SHM");
	return withEvolutionDbSnapshot(dbPath, (db) => {
		assertSafeEvolutionTarget(dbPath, "evolution db", false);
		const status = getEvolutionStatus(db, projectId);
		if (status.migration_version !== EVOLUTION_SCHEMA_VERSION)
			throw new Error("evolution suggestion projection migration is stale");
		if (
			status.observation_count > 0 ||
			status.daily_suggestion_receipt_count > 0
		)
			assertEvolutionProjectionCheckpoint({
				root,
				db,
				projectId,
				eventsDir: resolved.paths.evolutionEventsDir,
			});
		const active = readActiveSuggestionProjection(db, projectId);
		const derivation = deriveSuggestionCandidates({
			projectId,
			localDate,
			clusters: active.clusters,
			observationsByFingerprint: active.observationsByFingerprint,
		});
		const receiptProjection = readActiveReceiptProjection(
			db,
			projectId,
			localDate,
			active.candidateIds,
		);
		return {
			derivation,
			receipts: receiptProjection.receipts,
		};
	});
}

function rankedAvailableSuggestions(
	result: { derivation: SuggestionDerivation; receipts: SuggestionReceipt[] },
	settings: ReturnType<typeof dailySuggestionSettings>,
): SuggestionCandidate[] {
	return result.derivation.suggestions
		.filter(
			(candidate) =>
				!result.receipts.some(
					(receipt) =>
						receipt.suggestion_id === candidate.id &&
						((receipt.receipt_status === "rejected" &&
							suppressRejectedSuggestion(candidate, receipt)) ||
							(!settings.remindSkippedNextDay &&
								receipt.receipt_status === "skipped")),
				),
		)
		.map((candidate) => {
			const rejectedCount = result.receipts.filter(
				(receipt) =>
					receipt.suggestion_id === candidate.id &&
					receipt.receipt_status === "rejected",
			).length;
			const evidence = applyRejectionNegativeEvidence({
				base_score: candidate.score,
				base_confidence: candidate.base_confidence,
				rejected_receipt_count: rejectedCount,
			});
			return {
				...candidate,
				score: evidence.score,
				confidence: evidence.confidence,
				rejected_receipt_count: evidence.rejected_receipt_count,
				confidence_reason: evidence.reason,
			};
		})
		.sort(
			(left, right) =>
				right.score - left.score || left.id.localeCompare(right.id),
		);
}

type InternalSuggestion = {
	candidate: SuggestionCandidate;
	localDate: string;
	projectId: string;
	eventsDir: string;
	dbPath: string;
	receipt: SuggestionReceipt | null;
};

export function resolveDailySuggestion(
	root: string,
	now = new Date(),
): { preview: DailySuggestionPreview; internal: InternalSuggestion | null } {
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	const settings = dailySuggestionSettings(resolved.settings);
	if (!resolved.configured || !resolved.enabled || !resolved.projectId)
		return {
			preview: {
				daily_status: resolved.configured ? "disabled" : "unavailable",
				suggestion: null,
				pending_count: 0,
				critical_alerts: [],
			},
			internal: null,
		};
	const localDate = localDateForTimezone(now, resolved.timezone);
	const result = derive(root, resolved.projectId, localDate);
	if (!result)
		return {
			preview: {
				daily_status: "unavailable",
				suggestion: null,
				pending_count: 0,
				critical_alerts: [],
			},
			internal: null,
		};
	if (!settings.firstSessionOfDay)
		return {
			preview: {
				daily_status: "disabled",
				suggestion: null,
				pending_count: 0,
				critical_alerts: result.derivation.critical_alerts.map(publicCandidate),
			},
			internal: null,
		};
	const current = currentReceipt(
		result.receipts,
		resolved.projectId,
		localDate,
	);
	const effectiveCurrent =
		current?.receipt_status === "claimed" &&
		Date.parse(current.claim_expires_at) <= now.getTime()
			? null
			: current;
	const available = rankedAvailableSuggestions(result, settings);
	const pending = available.length;
	const rankedSuggestion = available[0] ?? null;
	const visibleSuggestion = effectiveCurrent ? null : rankedSuggestion;
	return {
		preview: {
			daily_status:
				effectiveCurrent?.receipt_status ??
				(rankedSuggestion ? "available" : "empty"),
			suggestion: visibleSuggestion ? publicCandidate(visibleSuggestion) : null,
			pending_count: Math.max(0, pending - (visibleSuggestion ? 1 : 0)),
			critical_alerts: result.derivation.critical_alerts.map(publicCandidate),
		},
		internal:
			effectiveCurrent || !rankedSuggestion
				? null
				: {
						candidate: rankedSuggestion,
						localDate,
						projectId: resolved.projectId,
						eventsDir: resolved.paths.evolutionEventsDir,
						dbPath: evolutionDbPath(root, resolved.paths.evolutionDb),
						receipt: current,
					},
	};
}

export function previewDailySuggestion(
	root: string,
	now = new Date(),
): DailySuggestionPreview {
	return resolveDailySuggestion(root, now).preview;
}

export function suggestionInternalCandidate(
	root: string,
	now = new Date(),
): InternalSuggestion | null {
	return resolveDailySuggestion(root, now).internal;
}
