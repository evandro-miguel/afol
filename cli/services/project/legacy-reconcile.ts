import { existsSync } from "node:fs";
import { withSessionLock } from "../io/session-lock";
import { closeSession, isSessionClosed } from "../workbench/lifecycle";
import { sessionPaths } from "../workbench/session-reader";
import { verifyWorkbenchTasks } from "../workbench/verify";
import {
	type AdmitLegacyEvidenceInput,
	admitsLegacyEvidenceIssue,
	applyLegacyEvidenceAdmissions,
	DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID,
	type LegacyEvidenceAdmission,
	type LegacyEvidenceBaseline,
	legacyEvidenceBaselinePath,
} from "./legacy-evidence-baseline";

export type LegacyReconcileInput = {
	sessionId: string;
	/** Required explicit confirmation reason (nonempty). */
	reason: string;
	/** Required issue URL/id this admission is anchored to (nonempty). */
	issue: string;
	/** Admit every eligible missing/failed issue (default true-like). */
	allMissing?: boolean;
	/** Optional restriction to specific task ids. */
	taskIds?: readonly string[];
	/** Preview by default; --confirm writes baseline admissions AND closes. */
	confirm: boolean;
	/** Optional close summary forwarded to closeSession. */
	summary?: string;
};

export type LegacyReconcileCloseDetail = {
	status: "reconciled" | "baseline_written_close_failed";
	warnings: string[];
	report?: {
		status: string;
		summary_source: string;
		path: string | null;
	};
	error?: string;
};

export type LegacyReconcileResult = {
	session_id: string;
	dry_run: boolean;
	written: boolean;
	status: "preview" | "reconciled" | "baseline_written_close_failed";
	admissions: LegacyEvidenceAdmission[];
	baseline_path: string;
	projected_close: { all_issues_admitted: boolean };
	close?: LegacyReconcileCloseDetail;
};

function assertSessionShape(root: string, sessionId: string): void {
	if (!/^\d{6}_\d{4}_.+/.test(sessionId)) {
		throw new Error(`Invalid session id for legacy reconcile: ${sessionId}`);
	}
	const paths = sessionPaths(root, sessionId);
	if (!existsSync(paths.sessionDir)) {
		throw new Error(`Session folder not found: ${paths.sessionDir}`);
	}
}

function assertReconcileInput(input: LegacyReconcileInput): void {
	if (!input.reason?.trim()) {
		throw new Error("Missing nonempty --reason for legacy reconcile.");
	}
	if (!input.issue?.trim()) {
		throw new Error("Missing nonempty --issue for legacy reconcile.");
	}
}

/**
 * Eligibility gates shared by the preview and confirm paths. Runs read-only
 * verify; returns the strict verification result.
 */
function assertEligible(
	root: string,
	sessionId: string,
	verify = verifyWorkbenchTasks(sessionPaths(root, sessionId).sessionDir, true),
): typeof verify {
	if (isSessionClosed(root, sessionId)) {
		throw new Error(
			`Session ${sessionId} is already closed; legacy reconcile only applies to open sessions.`,
		);
	}
	if (sessionId >= DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID) {
		throw new Error(
			`Session ${sessionId} is not pre-cutoff (cutoff ${DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID}); refuse legacy reconcile.`,
		);
	}
	if (verify.openTasks.length > 0) {
		throw new Error(
			`Session ${sessionId} still has ${verify.openTasks.length} open task(s); refuse legacy reconcile.`,
		);
	}
	const invalid = verify.issues.find(
		(issue) =>
			issue.type === "invalid_evidence" || issue.type === "invalid_task_state",
	);
	if (invalid) {
		throw new Error(
			`Session ${sessionId} has ${invalid.type} which cannot be admitted; fix it before legacy reconcile.`,
		);
	}
	if (
		!verify.issues.some(
			(issue) =>
				issue.type === "missing_evidence" || issue.type === "failed_evidence",
		)
	) {
		throw new Error(
			`No missing_evidence/failed_evidence issues found for session ${sessionId}; nothing to reconcile.`,
		);
	}
	return verify;
}

function admitInputFor(
	input: LegacyReconcileInput,
	confirm: boolean,
): AdmitLegacyEvidenceInput {
	return {
		sessionId: input.sessionId.trim(),
		...(input.taskIds ? { taskIds: input.taskIds } : {}),
		allMissing: input.allMissing !== false,
		allIssueTypes: true,
		reason: input.reason.trim(),
		issueUrl: input.issue.trim(),
		confirm,
	};
}

/** Project whether close would pass once the planned admissions exist. */
function projectClose(
	root: string,
	sessionId: string,
	verify: ReturnType<typeof verifyWorkbenchTasks>,
	planned: LegacyEvidenceAdmission[],
	baselineId: string,
	cutoffSessionId: string,
): { all_issues_admitted: boolean } {
	if (planned.length === 0) {
		return { all_issues_admitted: verify.issues.length === 0 };
	}
	const synthetic: LegacyEvidenceBaseline = {
		schema_version: 1,
		baseline_id: baselineId,
		cutoff_session_id: cutoffSessionId,
		admissions: planned,
	};
	const sessionPath = sessionPaths(root, sessionId).sessionDir;
	const remaining = verify.issues.filter(
		(issue) => !admitsLegacyEvidenceIssue(synthetic, sessionPath, issue, false),
	);
	return { all_issues_admitted: remaining.length === 0 };
}

/**
 * Reconcile a pre-cutoff session whose tasks are all done but whose evidence
 * cannot be recovered: admit the legacy evidence debt AND close the session in
 * one transaction. Lock ordering is deterministic: session lock OUTER, legacy
 * baseline lock INNER. Never fabricates proof; the admission keeps the
 * `pre_cutoff` compatibility audit shape.
 */
export function legacyReconcileSession(
	root: string,
	input: LegacyReconcileInput,
): LegacyReconcileResult {
	const sessionId = input.sessionId.trim();
	assertSessionShape(root, sessionId);
	assertReconcileInput(input);

	const baselinePath = legacyEvidenceBaselinePath(root);
	const verify = assertEligible(root, sessionId);

	if (!input.confirm) {
		const preview = applyLegacyEvidenceAdmissions(
			root,
			admitInputFor(input, false),
			{
				requireClosed: false,
			},
		);
		return {
			session_id: sessionId,
			dry_run: true,
			written: false,
			status: "preview",
			admissions: preview.admissions,
			baseline_path: baselinePath,
			projected_close: projectClose(
				root,
				sessionId,
				verify,
				preview.admissions,
				preview.baseline_id,
				preview.cutoff_session_id,
			),
		};
	}

	// Confirm: single transaction under the session lock; the baseline write
	// takes the baseline lock inside (session outer, baseline inner).
	return withSessionLock(root, sessionId, () => {
		assertEligible(root, sessionId);
		const admitResult = applyLegacyEvidenceAdmissions(
			root,
			admitInputFor(input, true),
			{ requireClosed: false },
		);
		try {
			const closeResult = closeSession(root, sessionId, {
				admitLegacyBaseline: true,
				...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
				...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
			});
			return {
				session_id: sessionId,
				dry_run: false,
				written: true,
				status: "reconciled" as const,
				admissions: admitResult.admissions,
				baseline_path: baselinePath,
				projected_close: { all_issues_admitted: true },
				close: {
					status: "reconciled" as const,
					warnings: [...closeResult],
					report: {
						status: closeResult.report.status,
						summary_source: closeResult.report.summary_source,
						path: closeResult.report.path,
					},
				},
			};
		} catch (error) {
			// The baseline was written; the close failed after that commit. Do
			// not leave the operator guessing: report the committed-with-issue
			// state and the baseline path so a retry close now succeeds.
			return {
				session_id: sessionId,
				dry_run: false,
				written: true,
				status: "baseline_written_close_failed" as const,
				admissions: admitResult.admissions,
				baseline_path: baselinePath,
				projected_close: { all_issues_admitted: true },
				close: {
					status: "baseline_written_close_failed" as const,
					warnings: [],
					error: (error as Error).message,
				},
			};
		}
	});
}
