import { existsSync } from "node:fs";
import {
	firstToken,
	readBoundedTelemetryEvents,
	type TelemetryEvent,
} from "../events/telemetry";
import { type FeedbackReport, feedbackMode, getFeedback } from "../feedback";
import {
	type BoundedSourceLimits,
	readBoundedSourceFile,
} from "../io/safe-source";
import { readProjectConfig } from "../project/paths";
import type { EvidenceEntry } from "../workbench/lifecycle";
import {
	MAX_SESSION_IDENTIFIER_LENGTH,
	parseEvidenceEntries,
	sessionPaths,
} from "../workbench/session-reader";
import { verifyTaskText } from "../workbench/verify";
import { validateEvolutionIdentity } from "./config";
import { evolutionDbPath, openEvolutionDb } from "./db";
import { appendProductionDayAllocation } from "./journal";
import {
	appendObservationJournalEventWithStatus,
	observationJournalPath,
	readObservationJournal,
} from "./observation-journal";
import {
	normalizeObservationRecord,
	type ObservationInput,
} from "./observation-model";
import {
	type EvidenceObservationSource,
	observationFromEvidence,
	observationFromFeedback,
	observationFromTelemetry,
} from "./observation-sources";
import { resolveEvolutionConfig } from "./runtime-config";

export const OBSERVE_EVIDENCE_LIMITS: BoundedSourceLimits = {
	maxBytes: 1_048_576,
	maxLines: 4_096,
	maxCandidates: 1_024,
};
export const OBSERVE_TASK_LIMITS: BoundedSourceLimits = {
	maxBytes: 1_048_576,
	maxLines: 16_384,
	maxCandidates: 16_384,
};
export const OBSERVE_TELEMETRY_LIMITS: BoundedSourceLimits = {
	maxBytes: 1_048_576,
	maxLines: 4_096,
	maxCandidates: 1_024,
};
export const OBSERVE_JOURNAL_LIMITS: BoundedSourceLimits = {
	maxBytes: 4_194_304,
	maxLines: 16_384,
	maxCandidates: 16_384,
};
const CONTROL_CHARACTER = /\p{Cc}/u;
const MAX_FEEDBACK_IDENTIFIER_LENGTH = 256;

export type IngestObservationsInput = {
	root: string;
	projectId: string;
	session: string;
	feedbackId?: string;
	now?: Date;
};

export type IngestObservationsResult = {
	appended: number;
	duplicates: number;
	skipped: number;
	warnings: string[];
	observation_ids: string[];
};

function hasCompletionSemantics(entry: EvidenceEntry): boolean {
	return (
		entry.purpose === "completion" &&
		(entry.authorization_type === "execution" ||
			entry.authorization_type === "artifact" ||
			entry.authorization_type === "waiver")
	);
}

function isOwnedObservedCompletion(
	entry: EvidenceEntry,
	projectId: string,
	session: string,
): boolean {
	return (
		entry.project_id === projectId &&
		entry.session_id === session &&
		entry.provenance === "observed" &&
		hasCompletionSemantics(entry)
	);
}

/**
 * Deterministic telemetry–evidence equivalence using the strongest shared
 * identifiers and normalized failure semantics.
 *
 * Blockers represent workflow_friction and are never equivalent to any
 * completed-evidence failure — they are always retained.
 *
 * For error events, telemetry WITHOUT error_type is equivalent to evidence
 * for the same task and command type (no additional signal). Telemetry
 * WITH error_type carries distinct information and MUST NOT be suppressed.
 * When schemas cannot prove equivalence, telemetry is retained.
 *
 * occurrence_identity / journal deduplication remains authoritative.
 */
function telemetryMatchesEvidence(
	event: TelemetryEvent,
	entries: readonly EvidenceEntry[],
): boolean {
	if (event.event_type === "blocker") return false;
	if (!event.task_id || !event.cmd_type) return false;
	// Telemetry with an explicit error_type carries distinct failure information
	// that cannot be proven equivalent to any evidence entry.
	if (event.error_type) return false;
	return entries.some(
		(entry) =>
			entry.task_id === event.task_id &&
			firstToken(entry.command) === event.cmd_type,
	);
}

/**
 * Read a named workbench session and derive observations from canonical
 * evidence, telemetry, and an optional explicitly associated feedback report.
 */
export function ingestObservationsForSession(
	input: IngestObservationsInput,
): IngestObservationsResult {
	const { root, projectId, session, feedbackId } = input;
	const now = input.now ?? new Date();
	if (!root.trim() || !projectId.trim() || !session.trim())
		throw new Error(
			"observation ingest requires root, project id, and session",
		);
	if (
		session.length > MAX_SESSION_IDENTIFIER_LENGTH ||
		CONTROL_CHARACTER.test(session)
	)
		throw new Error("session identifier is invalid");
	if (
		feedbackId !== undefined &&
		(!feedbackId.trim() ||
			feedbackId.length > MAX_FEEDBACK_IDENTIFIER_LENGTH ||
			CONTROL_CHARACTER.test(feedbackId))
	)
		throw new Error("feedback id is invalid");
	if (Number.isNaN(now.getTime()))
		throw new Error("observation ingest date is invalid");

	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	const timezone = resolved.timezone ?? "UTC";
	validateEvolutionIdentity({ projectId, timezone });
	if (!resolved.projectId || resolved.projectId !== projectId)
		throw new Error("evolution project identity mismatch");
	const paths = sessionPaths(root, session);
	if (!existsSync(paths.sessionDir))
		throw new Error(`Session folder not found: ${session}`);

	// Complete all source validation before opening the mutable database or
	// allocating a production day. Explicit feedback remains the user's
	// deliberate association and is preserved by observationFromFeedback.
	const taskText = readBoundedSourceFile(
		paths.taskPath,
		"session task file",
		OBSERVE_TASK_LIMITS,
	);
	// Preflight all ledgers before parsing any candidate or opening the mutable DB.
	const evidenceText = readBoundedSourceFile(
		paths.evidencePath,
		"session evidence ledger",
		OBSERVE_EVIDENCE_LIMITS,
	);
	const telemetryEvents = readBoundedTelemetryEvents(
		root,
		OBSERVE_TELEMETRY_LIMITS,
	);
	readBoundedSourceFile(
		observationJournalPath(root),
		"observation journal",
		OBSERVE_JOURNAL_LIMITS,
	);
	const evidenceEntries =
		evidenceText === null ? [] : parseEvidenceEntries(evidenceText);
	const ownershipByEvidenceId = new Map<string, string>();
	for (const entry of evidenceEntries) {
		const ownership = `${entry.project_id ?? ""}/${entry.session_id ?? ""}`;
		const previous = ownershipByEvidenceId.get(entry.id);
		if (previous && previous !== ownership)
			throw new Error("evidence id has conflicting ownership");
		ownershipByEvidenceId.set(entry.id, ownership);
	}

	let feedback: FeedbackReport | null = null;
	if (feedbackId !== undefined) {
		if (feedbackMode() !== "local")
			throw new Error(
				"Feedback mode is not local; cannot resolve feedback report.",
			);
		feedback = getFeedback(feedbackId);
		if (!feedback)
			throw new Error(
				"Feedback report not found; cannot ingest without a valid source association.",
			);
	}

	const sessionComplete =
		taskText !== null && verifyTaskText(taskText, paths.taskPath).allCompleted;
	// Fail-closed: missing task file / State Board is incomplete, and no
	// failed observation or production day may be ingested from incomplete
	// work. Zero-mutation return when the session is not fully complete.
	if (!sessionComplete) {
		return {
			appended: 0,
			duplicates: 0,
			skipped: 0,
			warnings: [],
			observation_ids: [],
		};
	}

	const ownsCompletion = (entry: EvidenceEntry): boolean =>
		isOwnedObservedCompletion(entry, projectId, session);
	const qualifyingEvidence = evidenceEntries.find(
		(entry) =>
			ownsCompletion(entry) &&
			entry.result === "passed" &&
			entry.exit_code === 0,
	);

	const sessionTelemetryEvents = telemetryEvents.filter(
		(event) => event.session_id === session,
	);
	const existingEvents = readObservationJournal(root, projectId);
	const existingOccurrenceIds = new Set<string>();
	for (const event of existingEvents) {
		if (event.event_type !== "observation") continue;
		const identity = String(
			(event.payload.observation as Record<string, unknown>)
				?.occurrence_identity ?? "",
		);
		if (identity) existingOccurrenceIds.add(identity);
	}

	const failedEvidenceEntries = evidenceEntries.filter(
		(entry) =>
			ownsCompletion(entry) &&
			(entry.result === "failed" || (entry.exit_code ?? 0) !== 0),
	);
	const evidenceCandidates: ObservationInput[] = [];
	for (const entry of failedEvidenceEntries) {
		const source: EvidenceObservationSource = {
			id: entry.id,
			created_at: entry.created_at,
			result: entry.result,
			exit_code: entry.exit_code ?? 0,
			command: entry.command,
			...(entry.verification_run_id ? { test: entry.task_id } : {}),
		};
		const observation = observationFromEvidence(source, {
			projectId,
			sessionId: session,
			taskType: entry.task_id,
			productionDaySequence: 0,
		});
		if (observation) evidenceCandidates.push(observation);
	}

	const telemetryCandidates: ObservationInput[] = [];
	for (const event of sessionTelemetryEvents) {
		if (event.event_type !== "error" && event.event_type !== "blocker")
			continue;
		if (telemetryMatchesEvidence(event, failedEvidenceEntries)) continue;
		const observation = observationFromTelemetry(event, {
			projectId,
			sessionId: session,
			taskType: event.task_id || "unknown",
			productionDaySequence: 0,
		});
		if (observation) telemetryCandidates.push(observation);
	}

	const feedbackCandidates: ObservationInput[] = [];
	if (feedback) {
		feedbackCandidates.push(
			observationFromFeedback(feedback, {
				projectId,
				sessionId: session,
				taskType: "feedback",
				productionDaySequence: 0,
			}),
		);
	}

	const allCandidates = [
		...evidenceCandidates,
		...telemetryCandidates,
		...feedbackCandidates,
	];
	// Normalize before any allocation so malformed source data cannot leave a
	// production-day journal behind.
	for (const candidate of allCandidates) normalizeObservationRecord(candidate);

	let duplicates = 0;
	const deduped = new Map<string, ObservationInput>();
	for (const candidate of allCandidates) {
		const key = normalizeObservationRecord(candidate).occurrence_identity;
		if (existingOccurrenceIds.has(key)) {
			duplicates++;
			continue;
		}
		if (deduped.has(key)) {
			duplicates++;
			const existing = deduped.get(key) as ObservationInput;
			const existingKind = existing.observationKind ?? existing.kind ?? "";
			const newKind = candidate.observationKind ?? candidate.kind ?? "";
			if (newKind === "tool_failure" && existingKind !== "tool_failure")
				deduped.set(key, candidate);
			continue;
		}
		deduped.set(key, candidate);
	}

	const warnings: string[] = [];
	const observationIds: string[] = [];
	let appended = 0;
	let skipped = 0;
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		const productionDaySequence = qualifyingEvidence
			? appendProductionDayAllocation({
					root,
					db,
					projectId,
					timezone,
					sessionId: session,
					evidenceId: qualifyingEvidence.id,
					now,
				}).ordinal_sequence
			: 0;
		if (qualifyingEvidence && productionDaySequence <= 0)
			throw new Error("qualifying evidence did not produce a production day");

		for (const candidate of deduped.values()) {
			try {
				const record = normalizeObservationRecord({
					...candidate,
					productionDaySequence,
				});
				const result = appendObservationJournalEventWithStatus({
					root,
					db,
					projectId,
					observation: record,
					now,
				});
				if (result.appended) {
					appended++;
					observationIds.push(record.id);
				} else {
					duplicates++;
				}
			} catch (error) {
				warnings.push(
					`observer failed for candidate ${candidate.id ?? "unknown"}: ${(error as Error).message}`,
				);
				skipped++;
			}
		}
	} finally {
		db.close();
	}

	return {
		appended,
		duplicates,
		skipped,
		warnings,
		observation_ids: observationIds,
	};
}
