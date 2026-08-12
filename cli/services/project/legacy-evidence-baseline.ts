import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadJsonObject } from "../../core/schema";
import { atomicWriteText } from "../io/atomic";
import { withSessionLock } from "../io/session-lock";
import { isSessionClosed } from "../workbench/session-lifecycle-state";
import { sessionPaths } from "../workbench/session-reader";
import { type VerifyIssue, verifyWorkbenchTasks } from "../workbench/verify";
import { resolveProjectPaths } from "./paths";

export const LEGACY_EVIDENCE_BASELINE_FILE =
	"evidence-compatibility-baseline-v1.json";
export const DEFAULT_LEGACY_EVIDENCE_BASELINE_ID =
	"legacy-evidence-compatibility-v1";
export const DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID = "260712_0000";

/** Project-global lock for concurrent admit merges into the baseline file. */
export const LEGACY_EVIDENCE_BASELINE_LOCK = "__legacy-evidence-baseline__";

export const LEGACY_EVIDENCE_ISSUE_TYPES = new Set([
	"missing_evidence",
	"failed_evidence",
] as const);

export type LegacyEvidenceIssueType = "missing_evidence" | "failed_evidence";

export type LegacyEvidenceAdmission = {
	session_id: string;
	task_id: string;
	issue_type: LegacyEvidenceIssueType;
	state_board_sha256: string;
	evidence_ledger_sha256: string;
	evidence_ledger_present: boolean;
	cutoff_relation: "pre_cutoff";
	approval: string;
};

export type LegacyEvidenceBaseline = {
	schema_version: 1;
	baseline_id: string;
	cutoff_session_id: string;
	admissions: LegacyEvidenceAdmission[];
};

/**
 * Distinguishes absent baseline files from present-but-invalid ones.
 * Admit --confirm may create only when status is `missing`; never when
 * `present_invalid` (corrupt must hard-fail, not be treated as empty create).
 */
export type LegacyEvidenceBaselineLoadResult =
	| { status: "missing" }
	| { status: "valid"; value: LegacyEvidenceBaseline }
	| { status: "present_invalid"; path: string; detail: string };

export function legacyEvidenceBaselinePath(projectRoot: string): string {
	return join(
		resolveProjectPaths(projectRoot).abs.admDir,
		"source",
		LEGACY_EVIDENCE_BASELINE_FILE,
	);
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function isHash(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function isLegacyEvidenceBaseline(
	value: Record<string, unknown>,
): value is LegacyEvidenceBaseline {
	if (
		value.schema_version !== 1 ||
		typeof value.baseline_id !== "string" ||
		!value.baseline_id ||
		typeof value.cutoff_session_id !== "string" ||
		!/^\d{6}_\d{4}$/.test(value.cutoff_session_id) ||
		!Array.isArray(value.admissions)
	) {
		return false;
	}
	return value.admissions.every((entry) => {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry))
			return false;
		const admission = entry as Record<string, unknown>;
		return (
			typeof admission.session_id === "string" &&
			/^\d{6}_\d{4}_.+/.test(admission.session_id) &&
			typeof admission.task_id === "string" &&
			/^T-\d{2,3}$/.test(admission.task_id) &&
			(admission.issue_type === "missing_evidence" ||
				admission.issue_type === "failed_evidence") &&
			isHash(admission.state_board_sha256) &&
			isHash(admission.evidence_ledger_sha256) &&
			typeof admission.evidence_ledger_present === "boolean" &&
			admission.cutoff_relation === "pre_cutoff" &&
			typeof admission.approval === "string" &&
			admission.approval.trim().length > 0
		);
	});
}

export function loadLegacyEvidenceBaseline(
	projectRoot: string,
): LegacyEvidenceBaselineLoadResult {
	const path = legacyEvidenceBaselinePath(projectRoot);
	if (!existsSync(path)) {
		return { status: "missing" };
	}
	const loaded = loadJsonObject(path);
	if (!loaded.ok) {
		return { status: "present_invalid", path, detail: loaded.error };
	}
	if (!isLegacyEvidenceBaseline(loaded.value)) {
		return {
			status: "present_invalid",
			path,
			detail: "schema validation failed for evidence-compatibility baseline v1",
		};
	}
	return { status: "valid", value: loaded.value };
}

/** Convenience for read-only consumers that only need a valid baseline or none. */
export function validLegacyEvidenceBaseline(
	projectRoot: string,
): LegacyEvidenceBaseline | null {
	const loaded = loadLegacyEvidenceBaseline(projectRoot);
	return loaded.status === "valid" ? loaded.value : null;
}

export function stateBoardHash(taskPath: string): string | null {
	const content = readFileSync(taskPath, "utf8");
	const heading = /^## State Board\s*$/m.exec(content);
	if (heading?.index === undefined) return null;
	const start = content.indexOf("\n", heading.index) + 1;
	if (start === 0) return null;
	const followingSection = content.slice(start).search(/^## /m);
	const board =
		followingSection === -1
			? content.slice(start)
			: content.slice(start, start + followingSection);
	return board.length > 0 ? sha256(board) : null;
}

export function evidenceLedger(
	taskPath: string,
	sessionPath: string,
): {
	present: boolean;
	hash: string;
} {
	let current = dirname(taskPath);
	while (current.startsWith(sessionPath)) {
		const path = join(current, ".evidence.jsonl");
		if (existsSync(path))
			return { present: true, hash: sha256(readFileSync(path, "utf8")) };
		if (current === sessionPath) break;
		current = dirname(current);
	}
	return { present: false, hash: sha256("") };
}

export function admitsLegacyEvidenceIssue(
	baseline: LegacyEvidenceBaseline | null,
	sessionPath: string,
	issue: { type: string; taskId?: string; file?: string },
	hasOpenTasks: boolean,
): boolean {
	if (
		!baseline ||
		hasOpenTasks ||
		!LEGACY_EVIDENCE_ISSUE_TYPES.has(issue.type as LegacyEvidenceIssueType) ||
		!issue.taskId ||
		!issue.file
	) {
		return false;
	}
	const sessionId = sessionPath.split(/[\\/]/).pop() ?? "";
	if (
		!/^\d{6}_\d{4}_/.test(sessionId) ||
		sessionId >= baseline.cutoff_session_id
	)
		return false;
	try {
		const boardHash = stateBoardHash(issue.file);
		if (!boardHash) return false;
		const evidence = evidenceLedger(issue.file, sessionPath);
		return baseline.admissions.some(
			(admission) =>
				admission.session_id === sessionId &&
				admission.task_id === issue.taskId &&
				admission.issue_type === issue.type &&
				admission.state_board_sha256 === boardHash &&
				admission.evidence_ledger_sha256 === evidence.hash &&
				admission.evidence_ledger_present === evidence.present &&
				admission.cutoff_relation === "pre_cutoff" &&
				admission.approval.trim().length > 0,
		);
	} catch {
		return false;
	}
}

export type AdmitLegacyEvidenceInput = {
	sessionId: string;
	taskIds?: readonly string[];
	allMissing?: boolean;
	issueType?: LegacyEvidenceIssueType;
	reason: string;
	issueUrl?: string;
	baselineId?: string;
	cutoffSessionId?: string;
	confirm: boolean;
	/**
	 * Reconcile mode: with allMissing, admit every eligible
	 * missing_evidence AND failed_evidence issue (no default type filter).
	 * Plain evidence admit keeps the existing missing-only default.
	 */
	allIssueTypes?: boolean;
};

export type AdmitLegacyEvidenceResult = {
	dry_run: boolean;
	path: string;
	baseline_id: string;
	cutoff_session_id: string;
	session_id: string;
	created_baseline: boolean;
	written: boolean;
	admissions: LegacyEvidenceAdmission[];
	admissions_total: number;
	replaced: number;
	added: number;
};

function buildApproval(reason: string, issueUrl?: string): string {
	const trimmed = reason.trim();
	if (!trimmed) {
		throw new Error(
			"Missing nonempty --reason (or --approval) for evidence admit.",
		);
	}
	if (!issueUrl) return trimmed;
	const url = issueUrl.trim();
	if (!url) return trimmed;
	return `${trimmed} (issue: ${url})`;
}

function isEligibleIssue(
	issue: VerifyIssue,
	issueTypeFilter?: LegacyEvidenceIssueType,
): issue is VerifyIssue & {
	type: LegacyEvidenceIssueType;
	taskId: string;
	file: string;
} {
	if (issue.type !== "missing_evidence" && issue.type !== "failed_evidence") {
		return false;
	}
	if (issueTypeFilter && issue.type !== issueTypeFilter) return false;
	return Boolean(issue.taskId && issue.file);
}

function admissionKey(
	sessionId: string,
	taskId: string,
	issueType: LegacyEvidenceIssueType,
): string {
	return `${sessionId}\0${taskId}\0${issueType}`;
}

function resolveLoadedBaseline(
	loaded: LegacyEvidenceBaselineLoadResult,
): LegacyEvidenceBaseline | null {
	if (loaded.status === "present_invalid") {
		throw new Error(
			`Legacy evidence baseline is present but invalid at ${loaded.path}: ${loaded.detail}. Refuse admit; fix or remove the file before creating or merging admissions.`,
		);
	}
	return loaded.status === "valid" ? loaded.value : null;
}

function resolveCutoffAndBaselineId(
	existing: LegacyEvidenceBaseline | null,
	input: AdmitLegacyEvidenceInput,
): { cutoffSessionId: string; baselineId: string; createdBaseline: boolean } {
	const createdBaseline = existing === null;
	const requestedCutoff = input.cutoffSessionId?.trim() || "";
	const requestedBaselineId = input.baselineId?.trim() || "";

	if (existing) {
		if (requestedCutoff && requestedCutoff !== existing.cutoff_session_id) {
			throw new Error(
				`--cutoff-session-id ${requestedCutoff} differs from existing baseline cutoff ${existing.cutoff_session_id}; refuse admit (cutoff is create-time only).`,
			);
		}
		if (requestedBaselineId && requestedBaselineId !== existing.baseline_id) {
			throw new Error(
				`--baseline-id ${requestedBaselineId} differs from existing baseline_id ${existing.baseline_id}; refuse admit.`,
			);
		}
		return {
			cutoffSessionId: existing.cutoff_session_id,
			baselineId: existing.baseline_id,
			createdBaseline: false,
		};
	}

	const cutoffSessionId =
		requestedCutoff || DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID;
	if (!/^\d{6}_\d{4}$/.test(cutoffSessionId)) {
		throw new Error(
			`Invalid cutoff session id: ${cutoffSessionId} (expected YYMMDD_HHMM)`,
		);
	}
	if (cutoffSessionId > DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID) {
		throw new Error(
			`create-time --cutoff-session-id ${cutoffSessionId} raises cutoff above default ${DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID}; refuse raised cutoffs.`,
		);
	}

	const baselineId = requestedBaselineId || DEFAULT_LEGACY_EVIDENCE_BASELINE_ID;
	if (!baselineId) {
		throw new Error("Missing baseline id for evidence admit.");
	}

	return { cutoffSessionId, baselineId, createdBaseline };
}

function mergeAdmissions(
	existing: LegacyEvidenceBaseline | null,
	planned: LegacyEvidenceAdmission[],
	baselineId: string,
	cutoffSessionId: string,
): {
	next: LegacyEvidenceBaseline;
	replaced: number;
	added: number;
} {
	const byKey = new Map<string, LegacyEvidenceAdmission>();
	for (const admission of existing?.admissions ?? []) {
		byKey.set(
			admissionKey(
				admission.session_id,
				admission.task_id,
				admission.issue_type,
			),
			admission,
		);
	}

	let replaced = 0;
	let added = 0;
	for (const admission of planned) {
		const key = admissionKey(
			admission.session_id,
			admission.task_id,
			admission.issue_type,
		);
		if (byKey.has(key)) replaced += 1;
		else added += 1;
		byKey.set(key, admission);
	}

	return {
		next: {
			schema_version: 1,
			baseline_id: baselineId,
			cutoff_session_id: cutoffSessionId,
			admissions: Array.from(byKey.values()),
		},
		replaced,
		added,
	};
}

export function admitLegacyEvidenceIssues(
	projectRoot: string,
	input: AdmitLegacyEvidenceInput,
): AdmitLegacyEvidenceResult {
	const sessionId = input.sessionId.trim();
	if (!/^\d{6}_\d{4}_.+/.test(sessionId)) {
		throw new Error(`Invalid session id for evidence admit: ${sessionId}`);
	}

	const paths = sessionPaths(projectRoot, sessionId);
	if (!existsSync(paths.sessionDir)) {
		throw new Error(`Session folder not found: ${paths.sessionDir}`);
	}
	if (!isSessionClosed(projectRoot, sessionId)) {
		throw new Error(
			`Session ${sessionId} is not closed; evidence admit only applies to closed sessions.`,
		);
	}

	return applyLegacyEvidenceAdmissions(projectRoot, input, {
		requireClosed: true,
	});
}

/**
 * Shared eligibility + planning + merge WRITE core for legacy evidence
 * admissions. `requireClosed: true` (the public evidence admit path) enforces
 * the closed-session precondition; the legacy reconcile path passes
 * `requireClosed: false` because it admits the debt and closes the session in
 * the same transaction. The caller is responsible for holding any session
 * lock; the baseline lock is taken inside for confirm writes.
 */
export function applyLegacyEvidenceAdmissions(
	projectRoot: string,
	input: AdmitLegacyEvidenceInput,
	options: { requireClosed: boolean },
): AdmitLegacyEvidenceResult {
	const sessionId = input.sessionId.trim();
	if (!/^\d{6}_\d{4}_.+/.test(sessionId)) {
		throw new Error(`Invalid session id for evidence admit: ${sessionId}`);
	}

	const approval = buildApproval(input.reason, input.issueUrl);
	const taskIds = (input.taskIds ?? []).map((id) => id.trim()).filter(Boolean);
	const allMissing = Boolean(input.allMissing);
	if (!allMissing && taskIds.length === 0) {
		throw new Error("evidence admit requires --task-id <id> or --all-missing.");
	}
	for (const taskId of taskIds) {
		if (!/^T-\d{2,3}$/.test(taskId)) {
			throw new Error(`Invalid task id for evidence admit: ${taskId}`);
		}
	}
	if (
		input.issueType &&
		input.issueType !== "missing_evidence" &&
		input.issueType !== "failed_evidence"
	) {
		throw new Error(
			`Invalid --issue-type ${input.issueType}; use missing_evidence or failed_evidence.`,
		);
	}

	// --all-missing admits only missing_evidence unless --issue-type is set.
	// With --issue-type failed_evidence --all-missing, only failed_evidence.
	// Reconcile mode (allIssueTypes) admits both types across all tasks.
	const issueTypeFilter: LegacyEvidenceIssueType | undefined =
		input.issueType ??
		(input.allIssueTypes
			? undefined
			: allMissing
				? "missing_evidence"
				: undefined);

	const paths = sessionPaths(projectRoot, sessionId);
	if (!existsSync(paths.sessionDir)) {
		throw new Error(`Session folder not found: ${paths.sessionDir}`);
	}
	if (options.requireClosed && !isSessionClosed(projectRoot, sessionId)) {
		throw new Error(
			`Session ${sessionId} is not closed; evidence admit only applies to closed sessions.`,
		);
	}

	const path = legacyEvidenceBaselinePath(projectRoot);

	// Early load for dry-run and create-time prechecks (confirm re-loads under lock).
	const preloaded = loadLegacyEvidenceBaseline(projectRoot);
	const preExisting = resolveLoadedBaseline(preloaded);
	const { cutoffSessionId: preCutoff } = resolveCutoffAndBaselineId(
		preExisting,
		input,
	);

	if (sessionId >= preCutoff) {
		throw new Error(
			`Session ${sessionId} is not pre-cutoff (cutoff ${preCutoff}); refuse admit.`,
		);
	}

	const verify = verifyWorkbenchTasks(paths.sessionDir, true);
	if (verify.openTasks.length > 0) {
		throw new Error(
			`Session ${sessionId} still has ${verify.openTasks.length} open task(s); refuse admit.`,
		);
	}

	const selectedTaskFilter = taskIds.length > 0 ? new Set(taskIds) : null;
	const eligible = verify.issues.filter((issue) => {
		if (!isEligibleIssue(issue, issueTypeFilter)) return false;
		if (selectedTaskFilter && !selectedTaskFilter.has(issue.taskId))
			return false;
		return true;
	});

	if (selectedTaskFilter) {
		for (const taskId of selectedTaskFilter) {
			const taskIssues = verify.issues.filter(
				(issue) => issue.taskId === taskId,
			);
			if (taskIssues.length === 0) {
				throw new Error(
					`Task ${taskId} has no verify issues to admit in session ${sessionId}.`,
				);
			}
			const hasInvalid = taskIssues.some(
				(issue) => issue.type === "invalid_evidence",
			);
			const hasEligible = taskIssues.some((issue) =>
				isEligibleIssue(issue, issueTypeFilter),
			);
			if (!hasEligible) {
				if (hasInvalid) {
					throw new Error(
						`Task ${taskId} has invalid_evidence which cannot be admitted.`,
					);
				}
				throw new Error(
					`Task ${taskId} has no missing_evidence/failed_evidence issues to admit.`,
				);
			}
		}
	}

	if (eligible.length === 0) {
		throw new Error(
			`No admit-able missing_evidence/failed_evidence issues found for session ${sessionId}.`,
		);
	}

	const planned: LegacyEvidenceAdmission[] = [];
	const seen = new Set<string>();
	for (const issue of eligible) {
		if (!isEligibleIssue(issue, issueTypeFilter)) continue;
		const key = admissionKey(sessionId, issue.taskId, issue.type);
		if (seen.has(key)) continue;
		seen.add(key);
		const boardHash = stateBoardHash(issue.file);
		if (!boardHash) {
			throw new Error(
				`Cannot hash State Board for ${issue.taskId} (${issue.file}).`,
			);
		}
		const evidence = evidenceLedger(issue.file, paths.sessionDir);
		planned.push({
			session_id: sessionId,
			task_id: issue.taskId,
			issue_type: issue.type,
			state_board_sha256: boardHash,
			evidence_ledger_sha256: evidence.hash,
			evidence_ledger_present: evidence.present,
			cutoff_relation: "pre_cutoff",
			approval,
		});
	}

	const buildMerge = (
		existing: LegacyEvidenceBaseline | null,
		written: boolean,
	): { result: AdmitLegacyEvidenceResult; next: LegacyEvidenceBaseline } => {
		const { cutoffSessionId, baselineId, createdBaseline } =
			resolveCutoffAndBaselineId(existing, input);
		if (sessionId >= cutoffSessionId) {
			throw new Error(
				`Session ${sessionId} is not pre-cutoff (cutoff ${cutoffSessionId}); refuse admit.`,
			);
		}
		const { next, replaced, added } = mergeAdmissions(
			existing,
			planned,
			baselineId,
			cutoffSessionId,
		);
		return {
			next,
			result: {
				dry_run: !written,
				path,
				baseline_id: baselineId,
				cutoff_session_id: cutoffSessionId,
				session_id: sessionId,
				created_baseline: createdBaseline,
				written,
				admissions: planned,
				admissions_total: next.admissions.length,
				replaced,
				added,
			},
		};
	};

	if (!input.confirm) {
		// Dry-run: use pre-loaded baseline (already rejected present_invalid).
		// Pre-resolution above already validated cutoff/baseline create rules.
		return buildMerge(preExisting, false).result;
	}

	// Confirm: lock, re-load inside lock, re-merge, atomic write.
	return withSessionLock(projectRoot, LEGACY_EVIDENCE_BASELINE_LOCK, () => {
		const reloaded = loadLegacyEvidenceBaseline(projectRoot);
		const existing = resolveLoadedBaseline(reloaded);
		const { result, next } = buildMerge(existing, true);
		atomicWriteText(path, `${JSON.stringify(next, null, 2)}\n`);
		return result;
	});
}
