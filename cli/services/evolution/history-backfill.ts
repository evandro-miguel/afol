import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { EventLedgerValidationError } from "../events/ledger";
import { collectSessionIds } from "../local-state/workbench-index";
import { readProjectConfig } from "../project/paths";
import { sessionLifecycleState } from "../workbench/session-lifecycle-state";
import { sessionPaths } from "../workbench/session-reader";
import { verifyTaskText, verifyWorkbenchTasks } from "../workbench/verify";
import { discoverAdoptionCandidates } from "./adoption-candidates";
import {
	createObservationIngestPreviewContext,
	previewObservationIngestForSession,
} from "./observation-ingest";
import { resolveEvolutionConfig } from "./runtime-config";

const MAX_PAGE_LIMIT = 10;
const DEFAULT_PAGE_LIMIT = 5;

export type HistoryBackfillPreview = {
	read_only: true;
	pagination: {
		offset: number;
		limit: number;
		returned: number;
		available: number;
		has_more: boolean;
	};
	coverage: {
		session_dirs: number;
		canonical_closed: number;
		legacy_terminal: number;
		legacy_evidence_unverified: number;
		open: number;
		corrupt: number;
		eligible: number;
	};
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

function closedSessions(root: string): {
	coverage: HistoryBackfillPreview["coverage"];
	eligible: string[];
} {
	const coverage = {
		session_dirs: 0,
		canonical_closed: 0,
		legacy_terminal: 0,
		legacy_evidence_unverified: 0,
		open: 0,
		corrupt: 0,
		eligible: 0,
	};
	const eligible: string[] = [];
	for (const session of collectSessionIds(root)) {
		coverage.session_dirs++;
		try {
			// Validate the name and canonical source paths before lifecycle state.
			sessionPaths(root, session);
			const state = sessionLifecycleState(root, session);
			if (state === "closed") {
				coverage.canonical_closed++;
				eligible.push(session);
			} else if (state === "open") {
				const paths = sessionPaths(root, session);
				if (
					verifyTaskText(readFileSync(paths.taskPath, "utf8"), paths.taskPath)
						.allCompleted
				) {
					coverage.legacy_terminal++;
					if (!verifyWorkbenchTasks(paths.sessionDir, true).allCompleted)
						coverage.legacy_evidence_unverified++;
					eligible.push(session);
				} else coverage.open++;
			} else coverage.corrupt++;
		} catch {
			coverage.corrupt++;
		}
	}
	coverage.eligible = eligible.length;
	return {
		coverage,
		eligible: eligible.sort((left, right) => left.localeCompare(right)),
	};
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

	const { coverage, eligible } = closedSessions(input.root);
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
			observations,
			adoption,
			skip_reasons: skipReasons,
			sources: {
				aggregate_digest: digest(page),
				sessions: page.map((session) => ({
					session_id: session,
					observation: { pending: 0, observed: 0 },
					adoption: "blocked" as const,
					skip_reasons: ["evolution_unconfigured"],
					digest: digest({ session, reason: "evolution_unconfigured" }),
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
		const legacyTerminal =
			sessionLifecycleState(input.root, session) === "open";
		const legacyEvidenceUnverified =
			legacyTerminal &&
			!verifyWorkbenchTasks(sessionPaths(input.root, session).sessionDir, true)
				.allCompleted;
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
					{ root: input.root, projectId: resolved.projectId, session },
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
					session,
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
			session_id: session,
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
		observations,
		adoption,
		skip_reasons: skipReasons,
		sources: { aggregate_digest: digest(sources), sessions: sources },
	};
}
