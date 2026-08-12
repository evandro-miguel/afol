import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
	firstToken,
	readBoundedSessionTelemetryEvents,
	type TelemetryEvent,
} from "../events/telemetry";
import { type FeedbackReport, feedbackMode, getFeedback } from "../feedback";
import {
	type BoundedSourceLimits,
	readBoundedSourceFile,
} from "../io/safe-source";
import { readProjectConfig } from "../project/paths";
import {
	MAX_SESSION_IDENTIFIER_LENGTH,
	parseEvidenceEntries,
	sessionPaths,
} from "../workbench/session-reader";
import type { EvidenceEntry } from "../workbench/types";
import { verifyTaskText } from "../workbench/verify";
import { validateEvolutionIdentity } from "./config";
import { evolutionDbPath, openEvolutionDb } from "./db";
import {
	appendProductionDayAllocation,
	resolveProductionDayReceipt,
} from "./journal";
import {
	appendObservationJournalEventWithStatus,
	observationJournalPath,
	parseObservationJournalText,
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
	mode?: "full" | "production-day";
	now?: Date;
};

export type IngestObservationsResult = {
	appended: number;
	duplicates: number;
	skipped: number;
	warnings: string[];
	observation_ids: string[];
};

export type ObservationIngestPreview = {
	eligible: boolean;
	mode: "full" | "production-day";
	source_digests: Record<string, string>;
	candidate_count: number;
	candidate_occurrence_identities: string[];
	duplicate_count: number;
	skip_reasons: string[];
};

/**
 * Reusable, bounded journal view for previewing several named sessions.
 * It contains only digests and occurrence identities, never journal payloads.
 */
export type ObservationIngestPreviewContext = {
	readonly root: string;
	readonly projectId: string;
	readonly journalDigest: string;
	readonly occurrenceIdentities: ReadonlySet<string>;
};

type PreparedObservationIngest = {
	preview: ObservationIngestPreview;
	projectId: string;
	session: string;
	timezone: string;
	now: Date;
	qualifyingEvidenceId?: string;
	candidates: ObservationInput[];
};

type ReadObservationJournalSnapshot = () => string | null;

function sourceDigest(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createObservationIngestPreviewContext(
	root: string,
	projectId: string,
	readJournalSnapshot: ReadObservationJournalSnapshot = () =>
		readBoundedSourceFile(
			observationJournalPath(root),
			"observation journal",
			OBSERVE_JOURNAL_LIMITS,
		),
): ObservationIngestPreviewContext {
	const journalText = readJournalSnapshot();
	const occurrenceIdentities = new Set<string>();
	for (const event of parseObservationJournalText(journalText, projectId)) {
		if (event.event_type !== "observation") continue;
		const identity = String(
			(event.payload.observation as Record<string, unknown>)
				?.occurrence_identity ?? "",
		);
		if (identity) occurrenceIdentities.add(identity);
	}
	return {
		root,
		projectId,
		journalDigest: sourceDigest(journalText),
		occurrenceIdentities,
	};
}

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
function prepareObservationIngestForSession(
	input: IngestObservationsInput,
	previewContext?: ObservationIngestPreviewContext,
): PreparedObservationIngest {
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
	if (
		previewContext &&
		(previewContext.root !== root || previewContext.projectId !== projectId)
	)
		throw new Error("observation preview context does not match input");
	const paths = sessionPaths(root, session);
	if (!existsSync(paths.sessionDir))
		throw new Error(`Session folder not found: ${session}`);
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

	// Complete all source validation before opening the mutable database or
	// allocating a production day. Explicit feedback remains the user's
	// deliberate association and is preserved by observationFromFeedback.
	const taskText = readBoundedSourceFile(
		paths.taskPath,
		"session task file",
		OBSERVE_TASK_LIMITS,
	);
	const sessionComplete =
		taskText !== null && verifyTaskText(taskText, paths.taskPath).allCompleted;
	// Missing task state is incomplete. No other source needs to be opened
	// because this path cannot allocate or append anything.
	if (!sessionComplete) {
		return {
			preview: {
				eligible: false,
				mode: input.mode ?? "full",
				source_digests: { task: sourceDigest(taskText) },
				candidate_count: 0,
				candidate_occurrence_identities: [],
				duplicate_count: 0,
				skip_reasons: ["session_incomplete"],
			},
			projectId,
			session,
			timezone,
			now,
			candidates: [],
		};
	}

	const evidenceText = readBoundedSourceFile(
		paths.evidencePath,
		"session evidence ledger",
		OBSERVE_EVIDENCE_LIMITS,
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

	const ownsCompletion = (entry: EvidenceEntry): boolean =>
		isOwnedObservedCompletion(entry, projectId, session);
	const qualifyingEvidence = evidenceEntries.find(
		(entry) =>
			ownsCompletion(entry) &&
			entry.result === "passed" &&
			entry.exit_code === 0,
	);
	if (input.mode === "production-day") {
		return {
			preview: {
				eligible: true,
				mode: "production-day",
				source_digests: {
					task: sourceDigest(taskText),
					evidence: sourceDigest(evidenceText),
				},
				candidate_count: 0,
				candidate_occurrence_identities: [],
				duplicate_count: 0,
				skip_reasons: [],
			},
			projectId,
			session,
			timezone,
			now,
			...(qualifyingEvidence
				? { qualifyingEvidenceId: qualifyingEvidence.id }
				: {}),
			candidates: [],
		};
	}

	const sessionTelemetryEvents = readBoundedSessionTelemetryEvents(
		root,
		session,
		OBSERVE_TELEMETRY_LIMITS,
		{ eventTypes: ["error", "blocker"] },
	);
	const journalText = previewContext
		? null
		: readBoundedSourceFile(
				observationJournalPath(root),
				"observation journal",
				OBSERVE_JOURNAL_LIMITS,
			);
	const journalDigest =
		previewContext?.journalDigest ?? sourceDigest(journalText);
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
	if (allCandidates.length === 0) {
		return {
			preview: {
				eligible: true,
				mode: "full",
				source_digests: {
					task: sourceDigest(taskText),
					evidence: sourceDigest(evidenceText),
					telemetry: sourceDigest(sessionTelemetryEvents),
					journal: journalDigest,
					...(feedback
						? {
								feedback: sourceDigest({
									id: feedback.report_id,
									created_at: feedback.created_at,
									kind: feedback.kind,
								}),
							}
						: {}),
				},
				candidate_count: 0,
				candidate_occurrence_identities: [],
				duplicate_count: 0,
				skip_reasons: ["no_candidates"],
			},
			projectId,
			session,
			timezone,
			now,
			...(qualifyingEvidence
				? { qualifyingEvidenceId: qualifyingEvidence.id }
				: {}),
			candidates: [],
		};
	}

	// The journal digest and duplicate identities must come from the exact
	// bounded snapshot above. Reopening the mutable path here would permit a
	// replacement or growth between its cap check and this derivation.
	const existingOccurrenceIds = previewContext
		? previewContext.occurrenceIdentities
		: new Set(
				parseObservationJournalText(journalText, projectId)
					.filter((event) => event.event_type === "observation")
					.map((event) =>
						String(
							(event.payload.observation as Record<string, unknown>)
								?.occurrence_identity ?? "",
						),
					)
					.filter(Boolean),
			);

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
	return {
		preview: {
			eligible: true,
			mode: "full",
			source_digests: {
				task: sourceDigest(taskText),
				evidence: sourceDigest(evidenceText),
				telemetry: sourceDigest(sessionTelemetryEvents),
				journal: journalDigest,
				...(feedback
					? {
							feedback: sourceDigest({
								id: feedback.report_id,
								created_at: feedback.created_at,
								kind: feedback.kind,
							}),
						}
					: {}),
			},
			candidate_count: deduped.size,
			candidate_occurrence_identities: [...deduped.keys()],
			duplicate_count: duplicates,
			skip_reasons:
				allCandidates.length === 0
					? ["no_candidates"]
					: deduped.size === 0
						? ["all_candidates_duplicate"]
						: [],
		},
		projectId,
		session,
		timezone,
		now,
		...(qualifyingEvidence
			? { qualifyingEvidenceId: qualifyingEvidence.id }
			: {}),
		candidates: [...deduped.values()],
	};
}

/** Read-only bounded preparation for one explicitly named session. */
export function previewObservationIngestForSession(
	input: IngestObservationsInput,
	previewContext?: ObservationIngestPreviewContext,
): ObservationIngestPreview {
	return prepareObservationIngestForSession(input, previewContext).preview;
}

/** Persist the exact candidates established by the shared read-only preparation. */
export function ingestObservationsForSession(
	input: IngestObservationsInput,
): IngestObservationsResult {
	const prepared = prepareObservationIngestForSession(input);
	if (!prepared.preview.eligible) {
		return {
			appended: 0,
			duplicates: 0,
			skipped: 0,
			warnings: [],
			observation_ids: [],
		};
	}
	if (prepared.preview.mode === "production-day") {
		if (prepared.qualifyingEvidenceId) {
			const db = openEvolutionDb(evolutionDbPath(input.root));
			try {
				appendProductionDayAllocation({
					root: input.root,
					db,
					projectId: prepared.projectId,
					timezone: prepared.timezone,
					sessionId: prepared.session,
					evidenceId: prepared.qualifyingEvidenceId,
					now: prepared.now,
				});
			} finally {
				db.close();
			}
		}
		return {
			appended: 0,
			duplicates: 0,
			skipped: 0,
			warnings: [],
			observation_ids: [],
		};
	}
	let productionDaySequence = 0;
	if (prepared.qualifyingEvidenceId) {
		const receipt = resolveProductionDayReceipt({
			root: input.root,
			projectId: prepared.projectId,
			timezone: prepared.timezone,
			evidenceId: prepared.qualifyingEvidenceId,
		});
		if (receipt) productionDaySequence = receipt.ordinal_sequence;
		else {
			const db = openEvolutionDb(evolutionDbPath(input.root));
			try {
				productionDaySequence = appendProductionDayAllocation({
					root: input.root,
					db,
					projectId: prepared.projectId,
					timezone: prepared.timezone,
					sessionId: prepared.session,
					evidenceId: prepared.qualifyingEvidenceId,
					now: prepared.now,
				}).ordinal_sequence;
			} finally {
				db.close();
			}
		}
		if (productionDaySequence <= 0)
			throw new Error("qualifying evidence did not produce a production day");
	}
	if (prepared.candidates.length === 0) {
		return {
			appended: 0,
			duplicates: prepared.preview.duplicate_count,
			skipped: 0,
			warnings: [],
			observation_ids: [],
		};
	}
	let appended = 0;
	let duplicates = prepared.preview.duplicate_count;
	let skipped = 0;
	const warnings: string[] = [];
	const observationIds: string[] = [];
	const db = openEvolutionDb(evolutionDbPath(input.root));
	try {
		for (const candidate of prepared.candidates) {
			try {
				const record = normalizeObservationRecord({
					...candidate,
					productionDaySequence,
				});
				const result = appendObservationJournalEventWithStatus({
					root: input.root,
					db,
					projectId: prepared.projectId,
					observation: record,
					now: prepared.now,
				});
				if (result.appended) {
					appended++;
					observationIds.push(record.id);
				} else duplicates++;
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
