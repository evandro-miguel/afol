import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
	EventLedgerValidationError,
	readValidatedEventLedgerText,
} from "../events/ledger";
import type { TelemetryEvent } from "../events/telemetry";
import {
	type BoundedSourceLimits,
	readBoundedSourceFile,
} from "../io/safe-source";
import { readProjectConfig } from "../project/paths";
import { sessionLifecycleState } from "../workbench/session-lifecycle-state";
import {
	parseEvidenceEntries,
	type SessionLocation,
	sessionPaths,
} from "../workbench/session-reader";
import type { EvidenceEntry } from "../workbench/types";
import { verifyTaskText, verifyWorkbenchTasks } from "../workbench/verify";
import { discoverAdoptionCandidates } from "./adoption-candidates";
import { openEvolutionDb } from "./db";
import {
	type HistoryBackfillCursorRow,
	readHistoryBackfillCursor,
	writeHistoryBackfillCursor,
} from "./history-cursor";
import {
	type EvolutionHistorySession,
	enumerateEvolutionHistorySessions,
} from "./history-sessions";
import {
	createObservationIngestPreviewContext,
	evidenceObservationCandidates,
	ingestObservationsForSession,
	OBSERVE_EVIDENCE_LIMITS,
	OBSERVE_TASK_LIMITS,
	OBSERVE_TELEMETRY_LIMITS,
	ownedFailedEvidenceEntries,
	previewObservationIngestForSession,
	telemetryObservationCandidates,
} from "./observation-ingest";
import { appendObservationJournalEventWithStatus } from "./observation-journal";
import {
	normalizeObservationRecord,
	type ObservationInput,
} from "./observation-model";
import {
	type ResolvedEvolutionRuntime,
	resolveEvolutionConfig,
	resolveEvolutionRuntime,
} from "./runtime-config";

const MAX_PAGE_LIMIT = 10;
const DEFAULT_PAGE_LIMIT = 5;

/**
 * Durable extractor identity for the history backfill cursor. Bump this when
 * derivation logic changes so completed cursors reprocess once.
 */
export const HISTORY_BACKFILL_EXTRACTOR_VERSION = "history-backfill/1";

export type HistoryBackfillCoverage = {
	session_dirs: number;
	archived: number;
	conflicts: number;
	canonical_closed: number;
	legacy_terminal: number;
	legacy_evidence_unverified: number;
	open: number;
	corrupt: number;
	eligible: number;
};

export type HistoryBackfillPreview = {
	read_only: true;
	pagination: {
		offset: number;
		limit: number;
		returned: number;
		available: number;
		has_more: boolean;
	};
	coverage: HistoryBackfillCoverage;
	conflicts: string[];
	observations: {
		derived_total: number;
		already_observed: number;
		pending_backfill: number;
	};
	adoption: {
		candidate_available: number;
		reviewed: number;
		no_candidate: number;
		blocked: number;
	};
	skip_reasons: Record<string, number>;
	sources: {
		aggregate_digest: string;
		sessions: Array<{
			session_id: string;
			observation: { pending: number; observed: number };
			adoption: "candidate_available" | "reviewed" | "no_candidate" | "blocked";
			skip_reasons: string[];
			digest: string;
		}>;
	};
};

export type HistoryBackfillSessionOutcome =
	| "ingested"
	| "unchanged"
	| "pending"
	| "skipped"
	| "error";

export type HistoryBackfillSessionRun = {
	session_id: string;
	location: SessionLocation;
	outcome: HistoryBackfillSessionOutcome;
	appended: number;
	duplicates: number;
	reason?: string;
	cursor: { status: "pending" | "complete"; byte_offset: number } | null;
};

export type HistoryBackfillRunResult = {
	pagination: HistoryBackfillPreview["pagination"];
	coverage: HistoryBackfillCoverage;
	conflicts: string[];
	sessions: HistoryBackfillSessionRun[];
	totals: {
		appended: number;
		duplicates: number;
		unchanged: number;
		pending: number;
		failed: number;
	};
};

function digest(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function increment(counts: Record<string, number>, reason: string): void {
	counts[reason] = (counts[reason] ?? 0) + 1;
}

function previewFailureReason(
	error: unknown,
): "telemetry_limit_exceeded" | "preview_unavailable" {
	if (
		error instanceof EventLedgerValidationError &&
		error.validation.issues.some(
			(issue) => issue.code === "EVENT_LEDGER_LIMIT_EXCEEDED",
		)
	)
		return "telemetry_limit_exceeded";
	return "preview_unavailable";
}

function previewContextFailureReason(): "observation_journal_unavailable" {
	return "observation_journal_unavailable";
}

type ClassifiedHistorySession = EvolutionHistorySession & {
	state: "canonical_closed" | "legacy_terminal" | "open" | "corrupt";
	legacyEvidenceUnverified: boolean;
};

function classifyHistorySession(
	root: string,
	session: EvolutionHistorySession,
): ClassifiedHistorySession {
	try {
		// Validate the name and canonical source paths before lifecycle state.
		const paths = sessionPaths(root, session.session_id, session.location);
		const state = sessionLifecycleState(
			root,
			session.session_id,
			session.location,
		);
		if (state === "closed")
			return {
				...session,
				state: "canonical_closed",
				legacyEvidenceUnverified: false,
			};
		if (state === "open") {
			if (
				verifyTaskText(readFileSync(paths.taskPath, "utf8"), paths.taskPath)
					.allCompleted
			)
				return {
					...session,
					state: "legacy_terminal",
					legacyEvidenceUnverified: !verifyWorkbenchTasks(
						paths.sessionDir,
						true,
					).allCompleted,
				};
			return { ...session, state: "open", legacyEvidenceUnverified: false };
		}
		return { ...session, state: "corrupt", legacyEvidenceUnverified: false };
	} catch {
		return { ...session, state: "corrupt", legacyEvidenceUnverified: false };
	}
}

function classifiedHistorySessions(root: string): {
	coverage: HistoryBackfillCoverage;
	eligible: ClassifiedHistorySession[];
	conflicts: string[];
} {
	const enumeration = enumerateEvolutionHistorySessions(root);
	const coverage: HistoryBackfillCoverage = {
		session_dirs: 0,
		archived: 0,
		conflicts: enumeration.conflicts.length,
		canonical_closed: 0,
		legacy_terminal: 0,
		legacy_evidence_unverified: 0,
		open: 0,
		corrupt: 0,
		eligible: 0,
	};
	const eligible: ClassifiedHistorySession[] = [];
	for (const session of enumeration.sessions) {
		coverage.session_dirs++;
		if (session.location === "archived") coverage.archived++;
		const classified = classifyHistorySession(root, session);
		if (classified.state === "canonical_closed") coverage.canonical_closed++;
		else if (classified.state === "legacy_terminal") {
			coverage.legacy_terminal++;
			if (classified.legacyEvidenceUnverified)
				coverage.legacy_evidence_unverified++;
		} else if (classified.state === "open") coverage.open++;
		else coverage.corrupt++;
		if (
			classified.state === "canonical_closed" ||
			classified.state === "legacy_terminal"
		)
			eligible.push(classified);
	}
	coverage.eligible = eligible.length;
	eligible.sort((left, right) =>
		left.session_id.localeCompare(right.session_id),
	);
	return { coverage, eligible, conflicts: enumeration.conflicts };
}

/**
 * Read-only, journal-canonical preview for a stable page of closed sessions.
 * It deliberately does not open the derived evolution database.
 */
export function previewHistoryBackfill(input: {
	root: string;
	offset?: number;
	limit?: number;
}): HistoryBackfillPreview {
	const offset = input.offset ?? 0;
	const limit = input.limit ?? DEFAULT_PAGE_LIMIT;
	if (!Number.isInteger(offset) || offset < 0)
		throw new Error("evolve backfill --offset must be a non-negative integer");
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT)
		throw new Error("evolve backfill --limit must be an integer from 1 to 10");

	const { coverage, eligible, conflicts } = classifiedHistorySessions(
		input.root,
	);
	const page = eligible.slice(offset, offset + limit);
	const observations = {
		derived_total: 0,
		already_observed: 0,
		pending_backfill: 0,
	};
	const adoption = {
		candidate_available: 0,
		reviewed: 0,
		no_candidate: 0,
		blocked: 0,
	};
	const skipReasons: Record<string, number> = {};
	const sources: HistoryBackfillPreview["sources"]["sessions"] = [];
	const resolved = resolveEvolutionConfig(readProjectConfig(input.root));
	if (!resolved.configured || !resolved.enabled || !resolved.projectId) {
		increment(skipReasons, "evolution_unconfigured");
		return {
			read_only: true,
			pagination: {
				offset,
				limit,
				returned: page.length,
				available: eligible.length,
				has_more: offset + page.length < eligible.length,
			},
			coverage,
			conflicts,
			observations,
			adoption,
			skip_reasons: skipReasons,
			sources: {
				aggregate_digest: digest(page),
				sessions: page.map((session) => ({
					session_id: session.session_id,
					observation: { pending: 0, observed: 0 },
					adoption: "blocked" as const,
					skip_reasons: ["evolution_unconfigured"],
					digest: digest({
						session: session.session_id,
						reason: "evolution_unconfigured",
					}),
				})),
			},
		};
	}
	let context:
		| ReturnType<typeof createObservationIngestPreviewContext>
		| undefined;
	let contextFailure: "observation_journal_unavailable" | undefined;
	try {
		context = createObservationIngestPreviewContext(
			input.root,
			resolved.projectId,
		);
	} catch {
		contextFailure = previewContextFailureReason();
	}
	for (const session of page) {
		const legacyTerminal = session.state === "legacy_terminal";
		const legacyEvidenceUnverified =
			legacyTerminal && session.legacyEvidenceUnverified;
		let preview:
			| ReturnType<typeof previewObservationIngestForSession>
			| undefined;
		let previewFailure:
			| "telemetry_limit_exceeded"
			| "preview_unavailable"
			| "observation_journal_unavailable"
			| undefined;
		if (contextFailure) {
			previewFailure = contextFailure;
			increment(skipReasons, previewFailure);
		} else
			try {
				preview = previewObservationIngestForSession(
					{
						root: input.root,
						projectId: resolved.projectId,
						session: session.session_id,
						...(session.location === "archived"
							? { location: session.location }
							: {}),
					},
					context,
				);
				observations.derived_total +=
					preview.candidate_count + preview.duplicate_count;
				observations.already_observed += preview.duplicate_count;
				observations.pending_backfill += preview.candidate_count;
				for (const reason of preview.skip_reasons)
					increment(skipReasons, reason);
			} catch (error) {
				previewFailure = previewFailureReason(error);
				increment(skipReasons, previewFailure);
			}
		let adoptionState: HistoryBackfillPreview["sources"]["sessions"][number]["adoption"] =
			"blocked";
		if (legacyTerminal) {
			if (legacyEvidenceUnverified)
				increment(skipReasons, "legacy_evidence_unverified");
			adoption.blocked++;
		} else
			try {
				const candidate = discoverAdoptionCandidates({
					root: input.root,
					session: session.session_id,
					limit: 1,
				});
				if (candidate.review_state === "candidate_available") {
					adoptionState = "candidate_available";
					adoption.candidate_available++;
				} else if (candidate.review_state === "blocked_missing_evidence") {
					adoption.blocked++;
				} else if (candidate.review_state === "no_candidate") {
					adoptionState = "no_candidate";
					adoption.no_candidate++;
				} else {
					adoptionState = "reviewed";
					adoption.reviewed++;
				}
			} catch {
				increment(skipReasons, "adoption_preview_unavailable");
				adoption.blocked++;
			}
		const sessionSkipReasons = [
			...(preview?.skip_reasons ?? []),
			...(previewFailure ? [previewFailure] : []),
			...(legacyEvidenceUnverified ? ["legacy_evidence_unverified"] : []),
			...(adoptionState === "blocked" ? ["adoption_blocked"] : []),
		];
		sources.push({
			session_id: session.session_id,
			observation: {
				pending: preview?.candidate_count ?? 0,
				observed: preview?.duplicate_count ?? 0,
			},
			adoption: adoptionState,
			skip_reasons: sessionSkipReasons,
			digest: digest({
				...(preview
					? { source_digests: preview.source_digests }
					: { preview_failure: previewFailure }),
				adoption: adoptionState,
			}),
		});
	}
	return {
		read_only: true,
		pagination: {
			offset,
			limit,
			returned: page.length,
			available: eligible.length,
			has_more: offset + page.length < eligible.length,
		},
		coverage,
		conflicts,
		observations,
		adoption,
		skip_reasons: skipReasons,
		sources: { aggregate_digest: digest(sources), sessions: sources },
	};
}

type SessionTelemetryMatch = {
	start: number;
	end: number;
	lineBytes: number;
	event: TelemetryEvent;
};

type SessionTelemetryScan = {
	matches: SessionTelemetryMatch[];
	matchedBytes: number;
	digest: string;
};

/**
 * Scan the shared telemetry ledger for one session's error/blocker events with
 * byte offsets, under the ledger-level limits. Per-session telemetry limits
 * are not applied here; the executor pages them instead of dropping the
 * session. Digest covers the matched line bytes in file order.
 */
function scanSessionTelemetrySource(
	root: string,
	session: string,
): SessionTelemetryScan {
	const text = readValidatedEventLedgerText(root);
	const hash = createHash("sha256");
	if (text === null)
		return { matches: [], matchedBytes: 0, digest: hash.digest("hex") };
	const buffer = Buffer.from(text, "utf8");
	const matches: SessionTelemetryMatch[] = [];
	let matchedBytes = 0;
	let offset = 0;
	while (offset < buffer.length) {
		const newline = buffer.indexOf(10, offset);
		const lineEnd = newline === -1 ? buffer.length : newline;
		let line = buffer.subarray(offset, lineEnd);
		if (line.length > 0 && line[line.length - 1] === 13)
			line = line.subarray(0, -1);
		const lineBytes = line.length + (newline === -1 ? 0 : 1);
		const raw = line.toString("utf8");
		if (raw.trim().length > 0) {
			try {
				const parsed = JSON.parse(raw) as Record<string, unknown>;
				if (
					parsed !== null &&
					typeof parsed === "object" &&
					!Array.isArray(parsed) &&
					parsed.schema_version === "1" &&
					(parsed.event_type === "error" || parsed.event_type === "blocker") &&
					parsed.session_id === session
				) {
					hash.update(line);
					matches.push({
						start: offset,
						end: newline === -1 ? lineEnd : lineEnd + 1,
						lineBytes,
						event: parsed as TelemetryEvent,
					});
					matchedBytes += lineBytes;
				}
			} catch {
				// The validated ledger read already rejects malformed lines.
				throw new Error(
					"history backfill telemetry scan found an unparsable validated line",
				);
			}
		}
		offset = newline === -1 ? lineEnd : lineEnd + 1;
	}
	return { matches, matchedBytes, digest: hash.digest("hex") };
}

function telemetrySourceExceedsLimits(
	scan: SessionTelemetryScan,
	limits: BoundedSourceLimits,
): boolean {
	return (
		scan.matchedBytes > limits.maxBytes ||
		scan.matches.length > limits.maxLines ||
		scan.matches.length > limits.maxCandidates
	);
}

type TelemetryPage = {
	events: TelemetryEvent[];
	nextOffset: number;
	remaining: number;
};

/** One bounded page of matched telemetry events resuming after byteOffset. */
function telemetryPageFrom(
	scan: SessionTelemetryScan,
	byteOffset: number,
	limits: BoundedSourceLimits,
): TelemetryPage {
	let index = scan.matches.length;
	for (let candidate = 0; candidate < scan.matches.length; candidate++) {
		if (
			(scan.matches[candidate] as SessionTelemetryMatch).start >= byteOffset
		) {
			index = candidate;
			break;
		}
	}
	const events: TelemetryEvent[] = [];
	let bytes = 0;
	let consumed = index;
	while (consumed < scan.matches.length) {
		const match = scan.matches[consumed] as SessionTelemetryMatch;
		if (match.lineBytes > limits.maxBytes)
			throw new Error(
				"history backfill telemetry line exceeds the bounded page limit",
			);
		if (
			events.length > 0 &&
			(bytes + match.lineBytes > limits.maxBytes ||
				events.length + 1 > limits.maxLines ||
				events.length + 1 > limits.maxCandidates)
		)
			break;
		events.push(match.event);
		bytes += match.lineBytes;
		consumed++;
	}
	return {
		events,
		nextOffset:
			consumed > index
				? (scan.matches[consumed - 1] as SessionTelemetryMatch).end
				: byteOffset,
		remaining: scan.matches.length - consumed,
	};
}

function sessionSourceHash(input: {
	taskText: string | null;
	evidenceText: string | null;
	telemetry: SessionTelemetryScan;
}): string {
	return digest({
		task: input.taskText === null ? null : digest(input.taskText),
		evidence: input.evidenceText === null ? null : digest(input.evidenceText),
		telemetry: input.telemetry.digest,
	});
}

/**
 * Append one page of observation candidates. Observed failures may come from
 * an open or incomplete session; declared evidence and successful runs never
 * become observations because the shared candidate derivation keeps that
 * invariant. Journal occurrence-identity dedup makes page resume idempotent.
 */
function appendTelemetryPage(input: {
	root: string;
	projectId: string;
	session: string;
	runtime: ResolvedEvolutionRuntime;
	db: Database;
	now: Date;
	events: TelemetryEvent[];
	failedEvidence: readonly EvidenceEntry[];
}): { appended: number; duplicates: number } {
	const candidates: ObservationInput[] = [
		...evidenceObservationCandidates(
			input.failedEvidence,
			input.projectId,
			input.session,
		),
		...telemetryObservationCandidates(
			input.events,
			input.failedEvidence,
			input.projectId,
			input.session,
		),
	];
	const deduped = new Map<string, ObservationInput>();
	for (const candidate of candidates) {
		const key = normalizeObservationRecord(candidate).occurrence_identity;
		const existing = deduped.get(key);
		if (!existing) {
			deduped.set(key, candidate);
			continue;
		}
		const existingKind = existing.observationKind ?? existing.kind ?? "";
		const newKind = candidate.observationKind ?? candidate.kind ?? "";
		if (newKind === "tool_failure" && existingKind !== "tool_failure")
			deduped.set(key, candidate);
	}
	let appended = 0;
	let duplicates = 0;
	for (const candidate of deduped.values()) {
		const result = appendObservationJournalEventWithStatus({
			root: input.root,
			db: input.db,
			projectId: input.projectId,
			timezone: input.runtime.timezone,
			evolutionEventsDir: input.runtime.eventsDir,
			observation: normalizeObservationRecord(candidate),
			now: input.now,
		});
		if (result.appended) appended++;
		else duplicates++;
	}
	return { appended, duplicates };
}

function processHistorySession(input: {
	root: string;
	session: ClassifiedHistorySession;
	projectId: string;
	runtime: ResolvedEvolutionRuntime;
	db: Database;
	now: Date;
}): HistoryBackfillSessionRun {
	const { root, session, projectId, runtime, db, now } = input;
	const paths = sessionPaths(root, session.session_id, session.location);
	let scan: SessionTelemetryScan;
	let taskText: string | null;
	let evidenceText: string | null;
	try {
		scan = scanSessionTelemetrySource(root, session.session_id);
		taskText = readBoundedSourceFile(
			paths.taskPath,
			"session task file",
			OBSERVE_TASK_LIMITS,
		);
		evidenceText = readBoundedSourceFile(
			paths.evidencePath,
			"session evidence ledger",
			OBSERVE_EVIDENCE_LIMITS,
		);
	} catch (error) {
		return {
			session_id: session.session_id,
			location: session.location,
			outcome: "error",
			appended: 0,
			duplicates: 0,
			reason: (error as Error).message,
			cursor: null,
		};
	}
	const sourceHash = sessionSourceHash({
		taskText,
		evidenceText,
		telemetry: scan,
	});
	const cursor = readHistoryBackfillCursor(
		db,
		projectId,
		session.session_id,
		HISTORY_BACKFILL_EXTRACTOR_VERSION,
	);
	const cursorView = cursor
		? { status: cursor.status, byte_offset: cursor.byte_offset }
		: null;
	// A complete cursor whose source hash and extractor version still match
	// means nothing changed; write nothing at all.
	if (
		cursor &&
		cursor.status === "complete" &&
		cursor.source_hash === sourceHash
	)
		return {
			session_id: session.session_id,
			location: session.location,
			outcome: "unchanged",
			appended: 0,
			duplicates: 0,
			cursor: cursorView,
		};
	// A pending offset is only trustworthy while the source is unchanged.
	const byteOffset =
		cursor && cursor.status === "pending" && cursor.source_hash === sourceHash
			? cursor.byte_offset
			: 0;
	const oversized = telemetrySourceExceedsLimits(
		scan,
		OBSERVE_TELEMETRY_LIMITS,
	);
	if (!oversized) {
		try {
			const result = ingestObservationsForSession({
				root,
				projectId,
				session: session.session_id,
				...(session.location === "archived" ? { location: "archived" } : {}),
				now,
			});
			const endOffset = scan.matches.at(-1)?.end ?? 0;
			writeHistoryBackfillCursor(db, {
				project_id: projectId,
				session_id: session.session_id,
				extractor_version: HISTORY_BACKFILL_EXTRACTOR_VERSION,
				source_hash: sourceHash,
				status: "complete",
				byte_offset: endOffset,
				updated_at: now.toISOString(),
			});
			return {
				session_id: session.session_id,
				location: session.location,
				outcome: "ingested",
				appended: result.appended,
				duplicates: result.duplicates,
				cursor: { status: "complete", byte_offset: endOffset },
			};
		} catch (error) {
			return {
				session_id: session.session_id,
				location: session.location,
				outcome: "error",
				appended: 0,
				duplicates: 0,
				reason: (error as Error).message,
				cursor: cursorView,
			};
		}
	}
	// Oversized telemetry sources page under the unchanged per-read limits.
	// A page stops at the limit and stays pending; the next call resumes after
	// the cursor so the source never vanishes from coverage.
	let page: TelemetryPage;
	try {
		page = telemetryPageFrom(scan, byteOffset, OBSERVE_TELEMETRY_LIMITS);
		const failedEvidence = ownedFailedEvidenceEntries(
			evidenceText === null ? [] : parseEvidenceEntries(evidenceText),
			projectId,
			session.session_id,
		);
		const counts = appendTelemetryPage({
			root,
			projectId,
			session: session.session_id,
			runtime,
			db,
			now,
			events: page.events,
			failedEvidence,
		});
		const complete = page.remaining === 0;
		const row: HistoryBackfillCursorRow = {
			project_id: projectId,
			session_id: session.session_id,
			extractor_version: HISTORY_BACKFILL_EXTRACTOR_VERSION,
			source_hash: sourceHash,
			status: complete ? "complete" : "pending",
			byte_offset: page.nextOffset,
			updated_at: now.toISOString(),
		};
		writeHistoryBackfillCursor(db, row);
		return {
			session_id: session.session_id,
			location: session.location,
			outcome: complete ? "ingested" : "pending",
			appended: counts.appended,
			duplicates: counts.duplicates,
			cursor: { status: row.status, byte_offset: row.byte_offset },
		};
	} catch (error) {
		// Keep the prior cursor so a failed page resumes from the same offset.
		return {
			session_id: session.session_id,
			location: session.location,
			outcome: "error",
			appended: 0,
			duplicates: 0,
			reason: (error as Error).message,
			cursor: cursorView,
		};
	}
}

/**
 * Execute one bounded page of the history backfill with the durable cursor.
 * Only new, changed, or pending sessions write. An unchanged complete cursor
 * writes nothing, and an oversized telemetry source advances one page per
 * call and stays pending until drained.
 */
export function runHistoryBackfill(input: {
	root: string;
	offset?: number;
	limit?: number;
	now?: Date;
}): HistoryBackfillRunResult {
	const offset = input.offset ?? 0;
	const limit = input.limit ?? DEFAULT_PAGE_LIMIT;
	if (!Number.isInteger(offset) || offset < 0)
		throw new Error("evolve backfill --offset must be a non-negative integer");
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT)
		throw new Error("evolve backfill --limit must be an integer from 1 to 10");
	const { coverage, eligible, conflicts } = classifiedHistorySessions(
		input.root,
	);
	const page = eligible.slice(offset, offset + limit);
	const pagination = {
		offset,
		limit,
		returned: page.length,
		available: eligible.length,
		has_more: offset + page.length < eligible.length,
	};
	const resolved = resolveEvolutionConfig(readProjectConfig(input.root));
	if (
		!resolved.configured ||
		!resolved.enabled ||
		!resolved.projectId ||
		page.length === 0
	)
		return {
			pagination,
			coverage,
			conflicts,
			sessions: page.map((session) => ({
				session_id: session.session_id,
				location: session.location,
				outcome: "skipped" as const,
				appended: 0,
				duplicates: 0,
				reason: "evolution_unconfigured",
				cursor: null,
			})),
			totals: {
				appended: 0,
				duplicates: 0,
				unchanged: 0,
				pending: 0,
				failed: 0,
			},
		};
	const runtime = resolveEvolutionRuntime(input.root);
	const now = input.now ?? new Date();
	const sessions: HistoryBackfillSessionRun[] = [];
	const db = openEvolutionDb(runtime.dbPath);
	try {
		for (const session of page)
			sessions.push(
				processHistorySession({
					root: input.root,
					session,
					projectId: resolved.projectId,
					runtime,
					db,
					now,
				}),
			);
	} finally {
		db.close();
	}
	const totals = {
		appended: sessions.reduce((sum, session) => sum + session.appended, 0),
		duplicates: sessions.reduce((sum, session) => sum + session.duplicates, 0),
		unchanged: sessions.filter((session) => session.outcome === "unchanged")
			.length,
		pending: sessions.filter(
			(session) =>
				session.outcome === "pending" || session.outcome === "skipped",
		).length,
		failed: sessions.filter((session) => session.outcome === "error").length,
	};
	return { pagination, coverage, conflicts, sessions, totals };
}
