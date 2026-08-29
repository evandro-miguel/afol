import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadJsonObject } from "../../core/schema";
import { atomicWriteText } from "../io/atomic";
import { withSessionLock } from "../io/session-lock";
import { isSessionClosed } from "../workbench/session-lifecycle-state";
import { loadEvidenceEntries, sessionPaths } from "../workbench/session-reader";
import {
	evidenceResultIsSuccess,
	isNoopExecutionCommand,
	verifyWorkbenchTasks,
} from "../workbench/verify";
import {
	DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID,
	evidenceLedger,
	isHash,
	stateBoardHash,
} from "./legacy-evidence-baseline";
import { resolveProjectPaths } from "./paths";

export const TRANSITION_ADMISSION_POLICY = "no-op-evidence-v1";
export const TRANSITION_ADMISSION_FILE =
	"evidence-transition-admissions-v1.json";
export const TRANSITION_ADMISSION_LOCK =
	"__evidence-transition-admissions-v1__";

export type EvidenceTransitionAdmission = {
	policy_id: typeof TRANSITION_ADMISSION_POLICY;
	session_id: string;
	task_id: string;
	issue_type: "missing_evidence" | "failed_evidence";
	state_board_sha256: string;
	evidence_ledger_sha256: string;
	evidence_ledger_present: boolean;
	issue: string;
	approval: string;
};

type EvidenceTransitionAdmissions = {
	schema_version: 1;
	policy_id: typeof TRANSITION_ADMISSION_POLICY;
	admissions: EvidenceTransitionAdmission[];
};

export function evidenceTransitionAdmissionPath(root: string): string {
	return join(
		resolveProjectPaths(root).abs.admDir,
		"source",
		TRANSITION_ADMISSION_FILE,
	);
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function valid(
	value: Record<string, unknown>,
): value is EvidenceTransitionAdmissions {
	return (
		value.schema_version === 1 &&
		value.policy_id === TRANSITION_ADMISSION_POLICY &&
		Array.isArray(value.admissions) &&
		value.admissions.every((entry) => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry))
				return false;
			const admission = entry as Record<string, unknown>;
			return (
				admission.policy_id === TRANSITION_ADMISSION_POLICY &&
				typeof admission.session_id === "string" &&
				/^\d{6}_\d{4}_.+/.test(admission.session_id) &&
				typeof admission.task_id === "string" &&
				/^T-\d{2,3}$/.test(admission.task_id) &&
				(admission.issue_type === "missing_evidence" ||
					admission.issue_type === "failed_evidence") &&
				isHash(admission.state_board_sha256) &&
				isHash(admission.evidence_ledger_sha256) &&
				typeof admission.evidence_ledger_present === "boolean" &&
				typeof admission.issue === "string" &&
				admission.issue.trim().length > 0 &&
				typeof admission.approval === "string" &&
				admission.approval.trim().length > 0
			);
		})
	);
}

export function loadEvidenceTransitionAdmissions(
	root: string,
): EvidenceTransitionAdmissions | null {
	const path = evidenceTransitionAdmissionPath(root);
	if (!existsSync(path)) return null;
	const loaded = loadJsonObject(path);
	if (!loaded.ok || !valid(loaded.value)) {
		throw new Error(
			`Evidence transition admissions are invalid at ${path}; refuse to ignore evidence debt.`,
		);
	}
	return loaded.value;
}

export function admitsEvidenceTransitionIssue(
	root: string,
	sessionPath: string,
	issue: { type: string; taskId?: string; file?: string },
	hasOpenTasks: boolean,
): boolean {
	if (
		hasOpenTasks ||
		issue.type !== "missing_evidence" ||
		!issue.taskId ||
		!issue.file
	)
		return false;
	const sessionId = sessionPath.split(/[\\/]/).pop() ?? "";
	if (
		!/^\d{6}_\d{4}_.+/.test(sessionId) ||
		sessionId < DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID
	)
		return false;
	const admissions = loadEvidenceTransitionAdmissions(root);
	if (!admissions) return false;
	try {
		const boardHash = stateBoardHash(issue.file);
		if (!boardHash) return false;
		const ledger = evidenceLedger(issue.file, sessionPath);
		return admissions.admissions.some(
			(admission) =>
				admission.session_id === sessionId &&
				admission.task_id === issue.taskId &&
				admission.issue_type === issue.type &&
				admission.policy_id === TRANSITION_ADMISSION_POLICY &&
				admission.state_board_sha256 === boardHash &&
				admission.evidence_ledger_sha256 === ledger.hash &&
				admission.evidence_ledger_present === ledger.present,
		);
	} catch {
		return false;
	}
}

export type TransitionAdmitInput = {
	sessionId: string;
	taskId: string;
	policy: string;
	issue: string;
	approval: string;
	confirm: boolean;
};
export type TransitionAdmitOptions = {
	/** The combined opt-in route may admit a terminal open session before close. */
	allowOpen?: boolean;
};
export type TransitionAdmitResult = {
	dry_run: boolean;
	written: boolean;
	path: string;
	admission: EvidenceTransitionAdmission;
	admissions_total: number;
};

export function transitionAdmitEvidence(
	root: string,
	input: TransitionAdmitInput,
	options: TransitionAdmitOptions = {},
): TransitionAdmitResult {
	const sessionId = input.sessionId.trim();
	const taskId = input.taskId.trim();
	if (input.policy !== TRANSITION_ADMISSION_POLICY)
		throw new Error(`Unsupported transition policy: ${input.policy}.`);
	if (
		!/^\d{6}_\d{4}_.+/.test(sessionId) ||
		sessionId < DEFAULT_LEGACY_EVIDENCE_CUTOFF_SESSION_ID
	)
		throw new Error(
			`Session ${sessionId} is not post-cutoff; transition-admit is only for post-cutoff debt.`,
		);
	if (!/^T-\d{2,3}$/.test(taskId))
		throw new Error(`Invalid task id for transition-admit: ${taskId}`);
	if (!input.issue.trim() || !input.approval.trim())
		throw new Error(
			"transition-admit requires nonempty --issue and --approval.",
		);
	const paths = sessionPaths(root, sessionId);
	if (!existsSync(paths.sessionDir))
		throw new Error(`Session folder not found: ${paths.sessionDir}`);
	if (!isSessionClosed(root, sessionId) && !options.allowOpen)
		throw new Error(
			`Session ${sessionId} is not closed; transition-admit only applies to closed sessions.`,
		);
	const plan = (): EvidenceTransitionAdmission => {
		const verification = verifyWorkbenchTasks(paths.sessionDir, true);
		if (verification.openTasks.length)
			throw new Error(
				`Session ${sessionId} has open tasks; refuse transition-admit.`,
			);
		const evidenceIssues = verification.issues.filter(
			(issue) => issue.taskId === taskId && issue.type === "missing_evidence",
		);
		if (
			evidenceIssues.length !== 1 ||
			evidenceIssues[0]?.taskId !== taskId ||
			verification.issues.length !== 1
		)
			throw new Error(
				`Task ${taskId} must have exactly one eligible missing evidence issue to admit.`,
			);
		const issue = evidenceIssues[0];
		if (!issue?.file)
			throw new Error(`Task ${taskId} evidence location is unavailable.`);
		const board = stateBoardHash(issue.file);
		if (!board) throw new Error(`Cannot hash State Board for ${taskId}.`);
		const ledger = evidenceLedger(issue.file, paths.sessionDir);
		const observedEntries = loadEvidenceEntries(
			join(paths.sessionDir, ".evidence.jsonl"),
		).filter(
			(entry) => entry.task_id === taskId && entry.provenance === "observed",
		);
		const eligibleNoopEntries = observedEntries.filter(
			(entry) =>
				entry.exit_code === 0 &&
				evidenceResultIsSuccess(entry.result) &&
				typeof entry.command === "string" &&
				isNoopExecutionCommand(entry.command),
		);
		const causedByNoopPolicyTransition =
			ledger.present &&
			observedEntries.length === 1 &&
			eligibleNoopEntries.length === 1;
		if (!causedByNoopPolicyTransition) {
			throw new Error(
				`Task ${taskId} is not debt caused by the registered no-op evidence policy transition.`,
			);
		}
		return {
			policy_id: TRANSITION_ADMISSION_POLICY,
			session_id: sessionId,
			task_id: taskId,
			issue_type: "missing_evidence",
			state_board_sha256: board,
			evidence_ledger_sha256: ledger.hash,
			evidence_ledger_present: ledger.present,
			issue: input.issue.trim(),
			approval: input.approval.trim(),
		};
	};
	const merge = (
		admission: EvidenceTransitionAdmission,
		current: EvidenceTransitionAdmissions | null,
	): EvidenceTransitionAdmissions => {
		const admissions = (current?.admissions ?? []).filter(
			(entry) =>
				!(
					entry.issue_type === "missing_evidence" &&
					entry.session_id === admission.session_id &&
					entry.task_id === admission.task_id
				),
		);
		admissions.push(admission);
		return {
			schema_version: 1,
			policy_id: TRANSITION_ADMISSION_POLICY,
			admissions,
		};
	};
	const path = evidenceTransitionAdmissionPath(root);
	const preview = plan();
	if (!input.confirm)
		return {
			dry_run: true,
			written: false,
			path,
			admission: preview,
			admissions_total: merge(preview, loadEvidenceTransitionAdmissions(root))
				.admissions.length,
		};
	return withSessionLock(root, TRANSITION_ADMISSION_LOCK, () => {
		const admission = plan();
		const next = merge(admission, loadEvidenceTransitionAdmissions(root));
		atomicWriteText(path, `${JSON.stringify(next, null, 2)}\n`);
		return {
			dry_run: false,
			written: true,
			path,
			admission,
			admissions_total: next.admissions.length,
		};
	});
}

/** Exposed for regression fixtures without making the policy a generic debt waiver. */
export function transitionAdmissionContentHash(value: string): string {
	return sha256(value);
}
