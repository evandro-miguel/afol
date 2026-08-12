import type { DurableJsonlIo } from "../events/ledger";
import { readEventLedgerRecords } from "../events/ledger";
import {
	type LearningReviewStatus,
	learningReviewStatus,
} from "../evolution/adoption-candidates";
import { withSessionLock } from "../io/session-lock";
import {
	appendWorkbenchEvent,
	hasEventLog,
} from "../local-state/workbench-events";
import {
	appendEventsAndRebuildWorkBenchIndex,
	collectSessionIds,
} from "../local-state/workbench-index";
import {
	readActiveSession,
	sessionLifecycleState,
	sessionPaths,
} from "./lifecycle";
import {
	type ArchivedSessionState,
	archiveStatesFromRecords,
	readArchivedSessionState,
} from "./session-archive-state";
import { listBindings } from "./session-context";
import { readTaskLifecycleState } from "./session-lifecycle-state";

export type { ArchivedSessionState } from "./session-archive-state";
export { readArchivedSessionState } from "./session-archive-state";

export type SessionArchiveCandidate = {
	session: string;
	closed_at: string;
	age_days: number;
	learning_review_state:
		| "no_candidate"
		| "candidate_available"
		| "reviewed"
		| "blocked";
};

export type SessionArchiveLearningReview =
	| "no_candidate"
	| {
			candidates: Array<{ id: string; fingerprint: string }>;
	  };

type ArchivePlan = {
	session: string;
	closed_at: string;
	learning_review: SessionArchiveLearningReview;
};

type RestorePlan = {
	session: string;
};

export type ArchiveRestoreBatchIo = {
	ledgerIo?: DurableJsonlIo;
	beforeIndexRebuild?: () => void;
};

export type SessionArchiveCandidatePage = {
	candidates: SessionArchiveCandidate[];
	offset: number;
	limit: number;
	total_count: number;
	returned_count: number;
	has_more: boolean;
};

export type SessionArchiveCandidatePageOptions = {
	offset?: number;
	limit?: number;
};

const LEARNING_REVIEW_CANDIDATE_LIMIT = 10;
const DEFAULT_SESSION_ARCHIVE_CANDIDATE_PAGE_LIMIT = 10;
const MAX_SESSION_ARCHIVE_CANDIDATE_PAGE_LIMIT = 100;

function closedAtForSession(root: string, session: string): string {
	const paths = sessionPaths(root, session);
	const lifecycle = sessionLifecycleState(root, session);
	if (lifecycle === "corrupt") {
		throw new Error(
			`session corrupt: ${session} (missing canonical task file)`,
		);
	}
	if (lifecycle !== "closed") {
		throw new Error(`session open: ${session} (close it before archiving)`);
	}
	const parsed = readTaskLifecycleState(paths.taskPath, session);
	if (parsed.kind !== "closed") {
		throw new Error(`session corrupt: ${session} (invalid close metadata)`);
	}
	return parsed.closedAt;
}

function assertNotActiveOrBound(root: string, session: string): void {
	if (readActiveSession(root) === session) {
		throw new Error(
			`session active: ${session} (switch or clear it before archiving)`,
		);
	}
	if (listBindings(root).some((binding) => binding.session === session)) {
		throw new Error(`session bound: ${session} (unbind it before archiving)`);
	}
}

function learningReviewState(
	status: LearningReviewStatus,
): SessionArchiveCandidate["learning_review_state"] {
	if (status.terminal) {
		return status.required.length === 0 ? "no_candidate" : "reviewed";
	}
	return status.required.length > 0 ? "candidate_available" : "blocked";
}

export function learningReviewEvidence(
	status: LearningReviewStatus,
): SessionArchiveLearningReview {
	return status.required.length === 0
		? "no_candidate"
		: { candidates: status.required.slice(0, LEARNING_REVIEW_CANDIDATE_LIMIT) };
}

export function requireTerminalLearningReview(
	root: string,
	session: string,
): LearningReviewStatus {
	const status = learningReviewStatus(root, session);
	if (!status.terminal) {
		throw new Error(
			`session learning review required: ${session} (review all candidates before archiving)`,
		);
	}
	return status;
}

function validatePageOptions(options: SessionArchiveCandidatePageOptions): {
	offset: number;
	limit: number;
} {
	const offset = options.offset ?? 0;
	if (!Number.isInteger(offset) || offset < 0) {
		throw new Error("--offset must be a non-negative integer");
	}
	const limit = options.limit ?? DEFAULT_SESSION_ARCHIVE_CANDIDATE_PAGE_LIMIT;
	if (!Number.isInteger(limit) || limit <= 0) {
		throw new Error("--limit must be a positive integer");
	}
	if (limit > MAX_SESSION_ARCHIVE_CANDIDATE_PAGE_LIMIT) {
		throw new Error(
			`--limit must not exceed ${MAX_SESSION_ARCHIVE_CANDIDATE_PAGE_LIMIT}`,
		);
	}
	return { offset, limit };
}

function readArchiveStatesForListing(
	root: string,
): Map<string, ArchivedSessionState> | null {
	if (!hasEventLog(root)) {
		return new Map();
	}
	try {
		return archiveStatesFromRecords(readEventLedgerRecords(root));
	} catch {
		// Candidate discovery has always failed closed for an unreadable ledger.
		return null;
	}
}

export function listSessionArchiveCandidatePage(
	root: string,
	olderThanDays: number,
	options: SessionArchiveCandidatePageOptions = {},
	now = new Date(),
): SessionArchiveCandidatePage {
	if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
		throw new Error("--older-than-days must be a non-negative number");
	}
	const { offset, limit } = validatePageOptions(options);
	const archiveStates = readArchiveStatesForListing(root);
	if (!archiveStates) {
		return {
			candidates: [],
			offset,
			limit,
			total_count: 0,
			returned_count: 0,
			has_more: false,
		};
	}
	const activeSession = readActiveSession(root);
	const boundSessions = new Set(
		listBindings(root).map((binding) => binding.session),
	);
	const candidates = collectSessionIds(root).flatMap((session) => {
		try {
			if (
				session === activeSession ||
				boundSessions.has(session) ||
				archiveStates.get(session)?.archived === true
			) {
				return [];
			}
			const closedAt = closedAtForSession(root, session);
			const ageDays = (now.getTime() - Date.parse(closedAt)) / 86_400_000;
			let reviewState: SessionArchiveCandidate["learning_review_state"];
			try {
				reviewState = learningReviewState(learningReviewStatus(root, session));
			} catch {
				reviewState = "blocked";
			}
			return ageDays >= olderThanDays
				? [
						{
							session,
							closed_at: closedAt,
							age_days: Math.floor(ageDays),
							learning_review_state: reviewState,
						},
					]
				: [];
		} catch {
			return [];
		}
	});
	const page = candidates.slice(offset, offset + limit);
	return {
		candidates: page,
		offset,
		limit,
		total_count: candidates.length,
		returned_count: page.length,
		has_more: offset + page.length < candidates.length,
	};
}

export function listSessionArchiveCandidates(
	root: string,
	olderThanDays: number,
	now = new Date(),
): SessionArchiveCandidate[] {
	return listSessionArchiveCandidatePage(root, olderThanDays, {}, now)
		.candidates;
}

export function archiveSession(
	root: string,
	session: string,
	reason: string,
): {
	session: string;
	closed_at: string;
	archived_at: string;
	learning_review: SessionArchiveLearningReview;
} {
	return archiveSessions(root, [session], reason)[0] as {
		session: string;
		closed_at: string;
		archived_at: string;
		learning_review: SessionArchiveLearningReview;
	};
}

function withSessionLocks<T>(
	root: string,
	sessions: readonly string[],
	action: () => T,
): T {
	const duplicate = sessions.find(
		(session, index) => sessions.indexOf(session) !== index,
	);
	if (duplicate !== undefined) {
		throw new Error(`duplicate session identifier: ${duplicate}`);
	}
	const ordered = [...sessions].sort((left, right) =>
		left.localeCompare(right),
	);
	const acquire = (index: number): T =>
		index >= ordered.length
			? action()
			: withSessionLock(root, ordered[index] as string, () =>
					acquire(index + 1),
				);
	return acquire(0);
}

function preflightArchive(root: string, session: string): ArchivePlan {
	const closedAt = closedAtForSession(root, session);
	assertNotActiveOrBound(root, session);
	if (readArchivedSessionState(root, session).archived) {
		throw new Error(`session already archived: ${session}`);
	}
	return {
		session,
		closed_at: closedAt,
		learning_review: learningReviewEvidence(
			requireTerminalLearningReview(root, session),
		),
	};
}

function preflightRestore(root: string, session: string): RestorePlan {
	closedAtForSession(root, session);
	assertNotActiveOrBound(root, session);
	if (!readArchivedSessionState(root, session).archived) {
		throw new Error(`session not archived: ${session}`);
	}
	return { session };
}

/** Validate archive targets without appending events. Uses the same checks as apply. */
export function previewArchiveSessions(
	root: string,
	sessions: readonly string[],
): ArchivePlan[] {
	return withSessionLocks(root, sessions, () =>
		sessions.map((session) => preflightArchive(root, session)),
	);
}

/** Validate restore targets without appending events. Uses the same checks as apply. */
export function previewRestoreSessions(
	root: string,
	sessions: readonly string[],
): RestorePlan[] {
	return withSessionLocks(root, sessions, () =>
		sessions.map((session) => preflightRestore(root, session)),
	);
}

export function archiveSessions(
	root: string,
	sessions: readonly string[],
	reason: string,
	io: ArchiveRestoreBatchIo = {},
): Array<{
	session: string;
	closed_at: string;
	archived_at: string;
	learning_review: SessionArchiveLearningReview;
}> {
	if (!reason.trim()) throw new Error("Missing --reason for session archive.");
	if (sessions.length === 0) return [];
	return withSessionLocks(root, sessions, () => {
		const plans = sessions.map((session) => preflightArchive(root, session));
		const records: Record<string, unknown>[] = [];
		const events = plans.map((plan) =>
			appendWorkbenchEvent(
				root,
				{
					type: "workbench.archive",
					session: plan.session,
					detail: {
						reason: reason.trim(),
						closed_at: plan.closed_at,
						learning_review: plan.learning_review,
					},
				},
				records,
			),
		);
		appendEventsAndRebuildWorkBenchIndex(root, undefined, records, io);
		return plans.map((plan, index) => ({
			session: plan.session,
			closed_at: plan.closed_at,
			archived_at: (events[index] as { ts: string }).ts,
			learning_review: plan.learning_review,
		}));
	});
}

export function restoreSession(
	root: string,
	session: string,
	reason: string,
): { session: string; restored_at: string } {
	return restoreSessions(root, [session], reason)[0] as {
		session: string;
		restored_at: string;
	};
}

export function restoreSessions(
	root: string,
	sessions: readonly string[],
	reason: string,
	io: ArchiveRestoreBatchIo = {},
): Array<{ session: string; restored_at: string }> {
	if (!reason.trim()) throw new Error("Missing --reason for session restore.");
	if (sessions.length === 0) return [];
	return withSessionLocks(root, sessions, () => {
		const plans = sessions.map((session) => preflightRestore(root, session));
		const records: Record<string, unknown>[] = [];
		const events = plans.map((plan) =>
			appendWorkbenchEvent(
				root,
				{
					type: "workbench.restore",
					session: plan.session,
					detail: { reason: reason.trim() },
				},
				records,
			),
		);
		appendEventsAndRebuildWorkBenchIndex(root, undefined, records, io);
		return plans.map((plan, index) => ({
			session: plan.session,
			restored_at: (events[index] as { ts: string }).ts,
		}));
	});
}
