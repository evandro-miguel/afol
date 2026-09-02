import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	formatSessionPendingSpecWarning,
	getSessionPendingSpecNotice,
	resolveGovernance,
	resolveGovernanceCatalog,
} from "../services/governance/pending-specs";
import { beginHotPathMeasurement } from "../services/hot-path/instrumentation";
import { withSessionLock } from "../services/io/session-lock";
import {
	TRANSITION_ADMISSION_POLICY,
	transitionAdmitEvidence,
} from "../services/project/evidence-transition-admission";
import { admitLegacyEvidenceIssues } from "../services/project/legacy-evidence-baseline";
import {
	TaskCompletionBusyError,
	type TaskCompletionLease,
	withTaskCompletionLock,
} from "../services/workbench/completion-lock";
import {
	appendTimelineEntry,
	assertClosedTaskReverificationEligible,
	assertObservedBatchTasksReady,
	closeSession,
	completeObservedTask,
	completeObservedTasks,
	completeVerificationRun,
	doneTask,
	failVerificationRun,
	type LifecycleAuxiliaryRuntime,
	newWorkstream,
	prepareVerificationRun,
	recordClosedTaskReverification,
	recordEvidence,
	recordVerificationRunStep,
	sanitizeEvidenceText,
	startTask,
	startTasks,
	type TaskState,
	taskAttemptSnapshot,
	transitionTask,
	VerificationRunConflictError,
} from "../services/workbench/lifecycle";
import { bindCurrentContextSession } from "../services/workbench/session-context";
import {
	type briefingUnavailable,
	briefingUnavailableFor,
	buildStartBriefing,
	formatStartBriefing,
	type StartBriefing,
} from "../services/workbench/start-briefing";
import type { CompletionPolicy } from "../services/workbench/verify";
import {
	formatVerifyReport,
	verifyWorkbenchTasks,
} from "../services/workbench/verify";
import { type FlagDef, parseFlagSpec } from "./flag-spec";
import {
	DoneArgumentError,
	hasJsonFlag,
	parseDoneArgs,
	parseEvidenceArgs,
	parseLogArgs,
	parseNewArgs,
	parseSessionTaskArgs,
	parseVerifyArgs,
} from "./workbench/args";
import { repairHintForStep } from "./workbench/hints";
import { writeJsonError } from "./workbench/shared";
import type { DoneArgs, VerificationSpec } from "./workbench/types";
import {
	type ObservedVerificationStatus,
	resolveRequiredSpecCheck,
	resolveSession,
	runVerificationAsync,
} from "./workbench/verify";

function assertWorkbenchMutationAllowed(
	ctx: OperationContext,
	action: string,
): void {
	if (!requiresApproval(ctx)) return;
	throw new Error(
		`${action} denied for ${ctx.callerType} callers; rerun from a trusted local context`,
	);
}

function pendingSpecFields(
	root: string,
	session: string,
	taskId?: string,
): Record<string, unknown> {
	const notice = getSessionPendingSpecNotice(root, session, taskId);
	if (!notice) {
		return { pending_spec: false };
	}
	return {
		pending_spec: true,
		pending_spec_missing: notice.missing,
		pending_spec_resolution_hint: notice.resolutionHint.replace(
			"<session>",
			notice.session,
		),
	};
}

function appendPendingSpecWarning(
	lines: string[],
	root: string,
	session: string,
	taskId?: string,
): void {
	lines.push(
		...formatSessionPendingSpecWarning(
			getSessionPendingSpecNotice(root, session, taskId),
		),
	);
}

export async function runNewCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.new");
		const parsed = parseNewArgs(args);
		let governance = resolveGovernance(parsed.metadata);
		if (
			governance.governanceStatus === "governed" &&
			parsed.metadata.featureId &&
			parsed.metadata.parentSpec
		) {
			try {
				const catalog = resolveGovernanceCatalog(
					root,
					parsed.metadata.featureId,
					parsed.metadata.parentSpec,
				);
				parsed.metadata.parentSpec = catalog.specId;
			} catch (error) {
				parsed.metadata.pendingSpecReason = `catalog resolution deferred: ${error instanceof Error ? error.message : String(error)}`;
			}
		}
		governance = resolveGovernance(parsed.metadata);
		const created = newWorkstream(root, parsed.theme, parsed.metadata, {
			afterActiveSessionWrite: (session) => {
				bindCurrentContextSession(root, session);
			},
		});
		const envSession = process.env.AFOL_SESSION?.trim() ?? "";
		if (envSession && envSession !== created.session) {
			created.warnings.push(
				`AFOL_SESSION still selects ${envSession}; unset it or pass -S ${created.session} for the new session.`,
			);
		}
		const creationStatus =
			created.warnings.length > 0 ? "created_with_warnings" : "created";
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							...created,
							status: creationStatus,
							governance_status: governance.governanceStatus,
							pending_spec: governance.pendingSpec,
							pending_spec_missing: governance.missing,
							pending_spec_resolution_hint: governance.pendingSpec
								? governance.resolutionHint
								: "",
						},
						{ action: "workbench.new" },
					),
				),
			);
		} else {
			const lines = [
				`session created: ${created.session}`,
				`status: ${creationStatus}`,
				`governance_status: ${governance.governanceStatus}`,
			];
			lines.push(...created.warnings.map((warning) => `warning: ${warning}`));
			if (governance.pendingSpec) {
				lines.push(
					`warning: pending_spec missing=${governance.missing.join(",")}`,
					`hint: ${governance.resolutionHint.replace("<session>", created.session)}`,
				);
			}
			console.log(lines.join("\n"));
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.new", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

function isStartBriefingUnavailable(
	briefing: StartBriefing | ReturnType<typeof briefingUnavailable>,
): briefing is ReturnType<typeof briefingUnavailable> {
	return "status" in briefing && briefing.status === "briefing_unavailable";
}

function formatTaskSelection(taskIds: readonly string[]): string {
	if (taskIds.length === 1) return taskIds[0] ?? "";
	const numeric = taskIds.map((taskId) =>
		Number.parseInt(taskId.slice("T-".length), 10),
	);
	const contiguous = numeric.every(
		(value, index) => index === 0 || value === (numeric[index - 1] ?? 0) + 1,
	);
	if (contiguous) {
		return `${taskIds[0]}..${taskIds.at(-1)}`;
	}
	return taskIds.join(",");
}

export async function runStartCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
	runtime: LifecycleAuxiliaryRuntime = {},
): Promise<number> {
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.start");
		const parsed = parseSessionTaskArgs(args, "start", root, {
			allowAutoTask: true,
		});
		if (parsed.taskIds.length > 1 && parsed.brief) {
			throw new Error("Batch start does not support --brief.");
		}
		const warnings =
			parsed.taskIds.length === 1
				? startTask(root, parsed, runtime)
				: startTasks(
						root,
						{ session: parsed.session, taskIds: parsed.taskIds },
						runtime,
					);
		const startedLabel =
			parsed.taskIds.length === 1
				? `task started: ${parsed.taskId}`
				: `tasks started: ${parsed.taskIds.length} (${formatTaskSelection(parsed.taskIds)})`;
		if (parsed.compact && !parsed.brief && !parsed.json) {
			const lines = [
				startedLabel,
				...warnings.map((warning) => `warning: ${warning}`),
			];
			appendPendingSpecWarning(lines, root, parsed.session, parsed.taskId);
			console.log(lines.join("\n"));
			return 0;
		}
		if (!parsed.brief) {
			if (!parsed.json) {
				const lines = [
					startedLabel,
					...warnings.map((warning) => `warning: ${warning}`),
				];
				appendPendingSpecWarning(lines, root, parsed.session, parsed.taskId);
				console.log(lines.join("\n"));
			}
			if (parsed.json) {
				console.log(
					stringifyEnvelope(
						envelopeOk(
							{
								session: parsed.session,
								task: parsed.taskId,
								tasks: parsed.taskIds,
								status: "in_progress",
								warnings,
								...pendingSpecFields(root, parsed.session, parsed.taskId),
							},
							{ action: "workbench.start" },
						),
					),
				);
			}
			return 0;
		}

		let briefing:
			| ReturnType<typeof buildStartBriefing>
			| ReturnType<typeof briefingUnavailable>;
		try {
			briefing = buildStartBriefing(root, parsed);
		} catch (error) {
			briefing = briefingUnavailableFor(error);
		}
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							task: parsed.taskId,
							status: "in_progress",
							warnings,
							briefing,
							...pendingSpecFields(root, parsed.session, parsed.taskId),
						},
						{ action: "workbench.start" },
					),
				),
			);
		} else {
			const lines = [
				`task started: ${parsed.taskId}`,
				...warnings.map((warning) => `warning: ${warning}`),
			];
			appendPendingSpecWarning(lines, root, parsed.session, parsed.taskId);
			if (isStartBriefingUnavailable(briefing)) {
				lines.push(`briefing: briefing_unavailable reason=${briefing.reason}`);
			} else if (parsed.briefMode === "full") {
				lines.push(JSON.stringify(briefing, null, 2));
			} else {
				lines.push(...formatStartBriefing(briefing));
			}
			console.log(lines.join("\n"));
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.start", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

export async function runEvidenceCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	if (args[0] === "admit") {
		return runEvidenceAdmitCommand(args.slice(1), root, ctx);
	}
	if (args[0] === "reverify")
		return runEvidenceReverifyCommand(args.slice(1), root, ctx);
	if (args[0] === "transition-admit")
		return runEvidenceTransitionAdmitCommand(args.slice(1), root, ctx);
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.evidence");
		const parsed = parseEvidenceArgs(args, root);
		const record = recordEvidence(root, {
			...parsed,
			provenance: "declared",
			approvalContext: ctx,
		});
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							evidence_id: record.id,
							session: parsed.session,
							task: parsed.taskId,
							result: record.result,
							status: record.warnings?.length
								? "committed_with_warnings"
								: "committed",
							warnings: record.warnings ?? [],
							...pendingSpecFields(root, parsed.session, parsed.taskId),
						},
						{ action: "workbench.evidence" },
					),
				),
			);
		} else {
			const lines = [`evidence recorded: ${record.id}`];
			lines.push(
				...(record.warnings ?? []).map((warning) => `warning: ${warning}`),
			);
			appendPendingSpecWarning(lines, root, parsed.session, parsed.taskId);
			console.log(lines.join("\n"));
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.evidence", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

function requiredEvidenceOption(
	args: string[],
	name: string,
	short?: string,
): string {
	const index = args.findIndex((arg) => arg === name || arg === short);
	const value = index < 0 ? "" : (args[index + 1] ?? "");
	if (!value || value.startsWith("-"))
		throw new Error(`Missing value for ${name}.`);
	return value;
}

export async function runEvidenceReverifyCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.evidence.reverify");
		const session = resolveSession(
			root,
			requiredEvidenceOption(args, "--session", "-S"),
			"evidence reverify",
		);
		const taskId = requiredEvidenceOption(args, "--task-id", "-T");
		const command = requiredEvidenceOption(args, "--execute", "-x");
		const allowed = new Set([
			"--session",
			"-S",
			"--task-id",
			"-T",
			"--execute",
			"-x",
			"--json",
			"-j",
		]);
		for (let i = 0; i < args.length; i += 1) {
			if (allowed.has(args[i] ?? "")) {
				if (
					["--session", "-S", "--task-id", "-T", "--execute", "-x"].includes(
						args[i] ?? "",
					)
				)
					i += 1;
				continue;
			}
			throw new Error(`Unknown evidence reverify argument: ${args[i]}`);
		}
		assertClosedTaskReverificationEligible(root, { session, taskId, command });
		const observed = await runVerificationAsync(root, {
			mode: "shell",
			command,
		});
		const evidence = recordClosedTaskReverification(root, {
			session,
			taskId,
			command,
			result: observed.exitCode === 0 ? "passed" : "failed",
			exitCode: observed.exitCode,
			...(observed.signal ? { signal: observed.signal } : {}),
			approvalContext: ctx,
		});
		if (hasJsonFlag(args))
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session,
							task: taskId,
							evidence_id: evidence.id,
							provenance: "observed",
							status: observed.status,
						},
						{ action: "workbench.evidence.reverify" },
					),
				),
			);
		else console.log(`evidence reverified: ${evidence.id}`);
		return observed.status === "passed" ? 0 : 1;
	} catch (error) {
		if (hasJsonFlag(args)) writeJsonError("workbench.evidence.reverify", error);
		else console.error((error as Error).message);
		return 2;
	}
}

export async function runEvidenceTransitionAdmitCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		const session = resolveSession(
			root,
			requiredEvidenceOption(args, "--session", "-S"),
			"evidence transition-admit",
		);
		const taskId = requiredEvidenceOption(args, "--task-id", "-T");
		const policy =
			requiredEvidenceOption(args, "--policy") || TRANSITION_ADMISSION_POLICY;
		const issue = requiredEvidenceOption(args, "--issue");
		const approval = requiredEvidenceOption(args, "--approval");
		const confirm = args.includes("--confirm") && !args.includes("--dry-run");
		const known = new Set([
			"--session",
			"-S",
			"--task-id",
			"-T",
			"--policy",
			"--issue",
			"--approval",
			"--confirm",
			"--dry-run",
			"--json",
			"-j",
		]);
		for (let i = 0; i < args.length; i += 1) {
			const arg = args[i] ?? "";
			if (!known.has(arg))
				throw new Error(`Unknown evidence transition-admit argument: ${arg}`);
			if (
				[
					"--session",
					"-S",
					"--task-id",
					"-T",
					"--policy",
					"--issue",
					"--approval",
				].includes(arg)
			)
				i += 1;
		}
		if (confirm)
			assertWorkbenchMutationAllowed(
				ctx,
				"workbench.evidence.transition_admit",
			);
		if (
			confirm &&
			(ctx.callerType !== "local" ||
				!ctx.interactive ||
				ctx.trustLevel !== "trusted")
		) {
			throw new Error(
				"transition-admit --confirm requires a trusted interactive local context.",
			);
		}
		const execute = () => {
			const admission = transitionAdmitEvidence(
				root,
				{
					sessionId: session,
					taskId,
					policy,
					issue,
					approval,
					confirm,
				},
				{ allowOpen: true },
			);
			if (!confirm) return admission;
			const close = closeSession(root, session, {
				admitTransitionAdmission: true,
			});
			return {
				...admission,
				close: {
					status: "closed" as const,
					warnings: [...close],
					report: close.report,
				},
			};
		};
		const result = confirm
			? withSessionLock(root, session, execute)
			: execute();
		if (hasJsonFlag(args))
			console.log(
				stringifyEnvelope(
					envelopeOk(result, {
						action: result.written
							? "workbench.evidence.transition_admit"
							: "workbench.evidence.transition_admit.preview",
					}),
				),
			);
		else
			console.log(
				`evidence transition-admit ${result.written ? "admitted" : "preview (dry-run)"}: ${taskId}`,
			);
		return 0;
	} catch (error) {
		if (hasJsonFlag(args))
			writeJsonError("workbench.evidence.transition_admit", error);
		else console.error((error as Error).message);
		return 2;
	}
}

type EvidenceAdmitIssueType = "missing_evidence" | "failed_evidence";

type EvidenceAdmitArgs = {
	session: string;
	taskIds: string[];
	allMissing: boolean;
	issueType?: EvidenceAdmitIssueType;
	reason: string;
	issueUrl?: string;
	baselineId?: string;
	cutoffSessionId?: string;
	confirm: boolean;
	json: boolean;
};

type EvidenceAdmitFlagState = {
	session: string;
	taskIds: string[];
	allMissing: boolean;
	issueType: EvidenceAdmitIssueType | undefined;
	reason: string;
	issueUrl: string;
	baselineId: string;
	cutoffSessionId: string;
	confirm: boolean;
	dryRun: boolean;
	json: boolean;
};

const EVIDENCE_ADMIT_FLAG_SPECS: FlagDef<EvidenceAdmitFlagState>[] = [
	{ names: ["--json", "-j"], kind: "flag", key: "json" },
	{ names: ["--confirm"], kind: "flag", key: "confirm" },
	{ names: ["--dry-run"], kind: "flag", key: "dryRun" },
	{ names: ["--all-missing"], kind: "flag", key: "allMissing" },
	{
		names: ["--session", "-S"],
		kind: "value",
		key: "session",
		rejectDashValue: true,
	},
	{
		names: ["--task-id", "-T"],
		kind: "multi",
		key: "taskIds",
		rejectDashValue: true,
	},
	{
		names: ["--issue-type"],
		kind: "value",
		key: "issueType",
		rejectDashValue: true,
		validate: (_state, raw) => {
			if (raw !== "missing_evidence" && raw !== "failed_evidence") {
				throw new Error(
					`Invalid --issue-type ${raw}; use missing_evidence or failed_evidence.`,
				);
			}
		},
	},
	{
		names: ["--reason", "-r", "--approval"],
		kind: "value",
		key: "reason",
		rejectDashValue: true,
		useMatchedNameInError: true,
	},
	{ names: ["--issue"], kind: "value", key: "issueUrl", rejectDashValue: true },
	{
		names: ["--baseline-id"],
		kind: "value",
		key: "baselineId",
		rejectDashValue: true,
	},
	{
		names: ["--cutoff-session-id"],
		kind: "value",
		key: "cutoffSessionId",
		rejectDashValue: true,
	},
];

function parseEvidenceAdmitArgs(
	args: string[],
	root: string,
): EvidenceAdmitArgs {
	const initialState: EvidenceAdmitFlagState = {
		session: "",
		taskIds: [],
		allMissing: false,
		issueType: undefined,
		reason: "",
		issueUrl: "",
		baselineId: "",
		cutoffSessionId: "",
		confirm: false,
		dryRun: false,
		json: false,
	};
	const parsed = parseFlagSpec(
		args,
		{ flags: EVIDENCE_ADMIT_FLAG_SPECS, context: "evidence admit" },
		initialState,
	);

	if (!parsed.reason.trim()) {
		throw new Error(
			"Missing nonempty --reason (or --approval) for evidence admit.",
		);
	}
	if (!parsed.allMissing && parsed.taskIds.length === 0) {
		throw new Error("evidence admit requires --task-id <id> or --all-missing.");
	}

	return {
		session: resolveSession(root, parsed.session, "evidence admit"),
		taskIds: parsed.taskIds,
		allMissing: parsed.allMissing,
		...(parsed.issueType ? { issueType: parsed.issueType } : {}),
		reason: parsed.reason,
		...(parsed.issueUrl ? { issueUrl: parsed.issueUrl } : {}),
		...(parsed.baselineId ? { baselineId: parsed.baselineId } : {}),
		...(parsed.cutoffSessionId
			? { cutoffSessionId: parsed.cutoffSessionId }
			: {}),
		confirm: parsed.confirm && !parsed.dryRun,
		json: parsed.json,
	};
}

export async function runEvidenceAdmitCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		const parsed = parseEvidenceAdmitArgs(args, root);
		if (parsed.confirm) {
			assertWorkbenchMutationAllowed(ctx, "workbench.evidence.admit");
		}
		const result = admitLegacyEvidenceIssues(root, {
			sessionId: parsed.session,
			taskIds: parsed.taskIds,
			allMissing: parsed.allMissing,
			...(parsed.issueType ? { issueType: parsed.issueType } : {}),
			reason: parsed.reason,
			...(parsed.issueUrl ? { issueUrl: parsed.issueUrl } : {}),
			...(parsed.baselineId ? { baselineId: parsed.baselineId } : {}),
			...(parsed.cutoffSessionId
				? { cutoffSessionId: parsed.cutoffSessionId }
				: {}),
			confirm: parsed.confirm,
		});
		const action = result.dry_run
			? "workbench.evidence.admit.preview"
			: "workbench.evidence.admit";
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							status: result.written ? "admitted" : "preview",
							session: result.session_id,
							path: result.path,
							baseline_id: result.baseline_id,
							cutoff_session_id: result.cutoff_session_id,
							created_baseline: result.created_baseline,
							written: result.written,
							dry_run: result.dry_run,
							admissions: result.admissions,
							admissions_total: result.admissions_total,
							replaced: result.replaced,
							added: result.added,
						},
						{ action },
					),
				),
			);
		} else {
			const mode = result.written ? "admitted" : "preview (dry-run)";
			const lines = [
				`evidence admit ${mode}: ${result.admissions.length} issue(s) for ${result.session_id}`,
				`baseline: ${result.baseline_id} cutoff=${result.cutoff_session_id}`,
				`path: ${result.path}`,
			];
			for (const admission of result.admissions) {
				lines.push(
					`  ${admission.task_id} ${admission.issue_type} board=${admission.state_board_sha256.slice(0, 12)}… ledger=${admission.evidence_ledger_present ? "present" : "absent"}`,
				);
			}
			if (result.dry_run) {
				lines.push("re-run with --confirm to write the baseline admission(s).");
			} else {
				lines.push(
					`wrote ${result.added} new, replaced ${result.replaced}; total admissions=${result.admissions_total}`,
				);
			}
			console.log(lines.join("\n"));
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.evidence.admit", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

const TRANSITION_STATES = new Set<TaskState>([
	"in_progress",
	"implemented_untested",
	"tested_needs_spec_validation",
	"problem",
	"moved",
]);

export async function runTransitionCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
	runtime: LifecycleAuxiliaryRuntime = {},
): Promise<number> {
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.transition");
		const policyIndex = args.indexOf("--completion-policy");
		const policy = policyIndex >= 0 ? args[policyIndex + 1] : undefined;
		if (policyIndex >= 0 && (!policy || policy.startsWith("--"))) {
			throw new Error("Missing value for --completion-policy");
		}
		if (policy && !["execution", "artifact", "waiver"].includes(policy)) {
			throw new Error(`Invalid --completion-policy: ${policy}`);
		}
		const policyArgs =
			policyIndex >= 0
				? args.filter(
						(_, index) => index !== policyIndex && index !== policyIndex + 1,
					)
				: args;
		const reasonIndex = policyArgs.indexOf("--reason");
		const reason = reasonIndex >= 0 ? policyArgs[reasonIndex + 1] : undefined;
		if (reasonIndex >= 0 && (!reason || reason.startsWith("--"))) {
			throw new Error("Missing value for --reason");
		}
		const reasonArgs =
			reasonIndex >= 0
				? policyArgs.filter(
						(_, index) => index !== reasonIndex && index !== reasonIndex + 1,
					)
				: policyArgs;
		const stateIndex = reasonArgs.indexOf("--state");
		const state = reasonArgs[stateIndex + 1];
		if (!state || !TRANSITION_STATES.has(state as TaskState)) {
			throw new Error(
				`Missing or invalid --state for transition: ${state ?? ""}`,
			);
		}
		if (state === "problem" && !reason?.trim()) {
			throw new Error("Transition to problem requires --reason.");
		}
		if (state !== "problem" && reason) {
			throw new Error("--reason is only valid when transitioning to problem.");
		}
		const sessionArgs = reasonArgs.filter(
			(_, index) => index !== stateIndex && index !== stateIndex + 1,
		);
		const parsed = parseSessionTaskArgs(sessionArgs, "transition", root);
		if (parsed.taskIds.length > 1) {
			throw new Error(
				"Transition accepts exactly one task; batch selectors are not supported.",
			);
		}
		const warnings = transitionTask(
			root,
			{
				...parsed,
				state: state as TaskState,
				...(policy ? { completionPolicy: policy as CompletionPolicy } : {}),
				...(reason ? { reason } : {}),
			},
			runtime,
		);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							task: parsed.taskId,
							state,
							...(reason ? { reason } : {}),
							warnings,
						},
						{ action: "workbench.transition" },
					),
				),
			);
		} else {
			console.log(
				[
					`task transitioned: ${parsed.taskId} -> ${state}`,
					...warnings.map((warning) => `warning: ${warning}`),
				].join("\n"),
			);
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) writeJsonError("workbench.transition", error);
		else console.error((error as Error).message);
		return 2;
	}
}

function formatArgvToken(value: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

function formatVerificationCommand(spec: VerificationSpec): string {
	return spec.mode === "argv"
		? [spec.executable, ...spec.args].map(formatArgvToken).join(" ")
		: spec.command;
}

type DoneLockedSuccess = {
	ok: true;
	done: ReturnType<typeof doneTask>;
	warnings: string[];
	runId?: string;
	evidenceIds?: string[];
	stepCount?: number;
};

type DoneLockedFailure = {
	ok: false;
	message: string;
	status:
		| ObservedVerificationStatus
		| "spec_conflict"
		| "persistence_failed"
		| "stale_conflict";
	exitCode: number;
	runId?: string;
	stepIndex?: number;
	stepCount?: number;
	evidenceIds?: string[];
	warnings?: string[];
};

type DoneLockedResult = DoneLockedSuccess | DoneLockedFailure;

class DoneLockLostError extends Error {
	readonly result: DoneLockedFailure;

	constructor(result: DoneLockedFailure) {
		super(result.message);
		this.name = "DoneLockLostError";
		this.result = result;
	}
}

type DoneOutput = {
	stdout: (value: string) => void;
	stderr: (value: string) => void;
};

type DoneRecoveryData = {
	session: string | null;
	task_id: string | null;
	task_ids: string[];
	failed_step: string;
	status: string;
	evidence_ids: string[];
	next_command: string;
};

const DONE_DIAGNOSTIC_MAX_BYTES = 512;
const DONE_DIAGNOSTIC_CONTROL = /\p{Cc}/gu;

function boundDoneDiagnostic(value: unknown): string {
	const message = value instanceof Error ? value.message : String(value);
	const sanitized = sanitizeEvidenceText(message)
		.replace(DONE_DIAGNOSTIC_CONTROL, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (Buffer.byteLength(sanitized, "utf8") <= DONE_DIAGNOSTIC_MAX_BYTES) {
		return sanitized || "Done command failed.";
	}
	let bounded = "";
	for (const character of sanitized) {
		const candidate = `${bounded}${character}`;
		if (Buffer.byteLength(candidate, "utf8") > DONE_DIAGNOSTIC_MAX_BYTES - 3)
			break;
		bounded = candidate;
	}
	return `${bounded}...`;
}

function doneRecoveryData(
	parsed: DoneArgs | undefined,
	options: {
		failedStep: string;
		status: string;
		evidenceIds?: string[];
	},
): DoneRecoveryData {
	const taskIds = parsed?.taskIds ?? [];
	const taskId = parsed?.taskId ?? taskIds[0] ?? null;
	return {
		session: parsed?.session ?? null,
		task_id: taskId,
		task_ids: taskIds,
		failed_step: options.failedStep,
		status: options.status,
		evidence_ids: options.evidenceIds ?? [],
		next_command: repairHintForStep("done", {
			...(parsed?.session ? { session: parsed.session } : {}),
			...(taskId ? { taskId } : {}),
		}),
	};
}

function stringifyDoneJsonError(
	error: unknown,
	exitCode: number,
	data: DoneRecoveryData,
	options: { code?: string; message?: string } = {},
): string {
	return stringifyEnvelope({
		...envelopeErr(
			options.code ?? "workbench.completion_failed",
			options.message ?? boundDoneDiagnostic(error),
			{
				action: "workbench.done",
				exitCode,
			},
		),
		data,
	});
}

async function executeDoneLocked(
	root: string,
	parsed: DoneArgs,
	ctx: OperationContext,
	lease: TaskCompletionLease,
): Promise<DoneLockedResult> {
	if (parsed.requireSpecCheck) {
		const specCheck = resolveRequiredSpecCheck(
			root,
			parsed.session,
			parsed.taskId,
		);
		if (specCheck.status === "conflict") {
			return {
				ok: false,
				message: `spec check failed: ${specCheck.spec_id || parsed.taskId}`,
				status: "spec_conflict",
				exitCode: 1,
			};
		}
	}

	if (parsed.testCommands.length >= 2) {
		const snapshot = taskAttemptSnapshot(root, parsed);
		const commands = parsed.verifications.map(
			(spec, index) =>
				parsed.testCommands[index] ?? formatVerificationCommand(spec),
		);
		const prepared = prepareVerificationRun(
			root,
			{
				session: parsed.session,
				taskId: parsed.taskId,
				taskAttemptSnapshot: snapshot,
				commands,
			},
			{ fencingCheck: lease.assertOwned },
		);
		if (prepared.kind === "recovered") {
			return {
				ok: true,
				done: prepared.completion.done,
				warnings: prepared.completion.warnings,
				runId: prepared.completion.runId,
				evidenceIds: prepared.completion.evidenceIds,
				stepCount: prepared.completion.evidenceIds.length,
			};
		}
		const evidenceIds: string[] = [];
		for (const [index, verificationSpec] of parsed.verifications.entries()) {
			const verification = await runVerificationAsync(root, verificationSpec, {
				signal: lease.signal,
				timeoutMs: parsed.verificationTimeoutMs,
			});
			try {
				lease.assertOwned();
			} catch {
				throw new DoneLockLostError({
					ok: false,
					message: `verification lock ownership was lost at step ${index + 1}/${prepared.run.step_count}`,
					status: "lock_lost",
					exitCode: 1,
					runId: prepared.run.verification_run_id,
					stepIndex: index + 1,
					stepCount: prepared.run.step_count,
					evidenceIds,
				});
			}
			let evidence: ReturnType<typeof recordVerificationRunStep>;
			try {
				evidence = recordVerificationRunStep(
					root,
					{
						session: parsed.session,
						taskId: parsed.taskId,
						run: prepared.run,
						stepIndex: index + 1,
						command: commands[index] ?? "",
						status: verification.status,
						exitCode: verification.exitCode,
						...(verification.signal ? { signal: verification.signal } : {}),
						durationMs: verification.durationMs,
						...(parsed.artifact ? { artifact: parsed.artifact } : {}),
						...(parsed.note ? { note: parsed.note } : {}),
					},
					{ fencingCheck: lease.assertOwned },
				);
			} catch (error) {
				const interrupted = failVerificationRun(
					root,
					{
						session: parsed.session,
						taskId: parsed.taskId,
						run: prepared.run,
						terminalStatus: "interrupted",
					},
					{ fencingCheck: lease.assertOwned },
				);
				return {
					ok: false,
					message:
						error instanceof VerificationRunConflictError
							? `verification became stale at step ${index + 1}/${prepared.run.step_count}`
							: `verification evidence commit failed at step ${index + 1}/${prepared.run.step_count}`,
					status:
						error instanceof VerificationRunConflictError
							? "stale_conflict"
							: "persistence_failed",
					exitCode: 1,
					runId: prepared.run.verification_run_id,
					stepIndex: index + 1,
					stepCount: prepared.run.step_count,
					evidenceIds: interrupted.evidenceIds,
					warnings: interrupted.warnings,
				};
			}
			evidenceIds.push(evidence.id);
			if (verification.status !== "passed") {
				const failedRun = failVerificationRun(
					root,
					{ session: parsed.session, taskId: parsed.taskId, run: prepared.run },
					{ fencingCheck: lease.assertOwned },
				);
				return {
					ok: false,
					message: `--test failed at step ${index + 1}/${prepared.run.step_count} (${verification.status})`,
					status: verification.status,
					exitCode: 1,
					runId: prepared.run.verification_run_id,
					stepIndex: index + 1,
					stepCount: prepared.run.step_count,
					evidenceIds: failedRun.evidenceIds,
					warnings: failedRun.warnings,
				};
			}
		}
		const completion = completeVerificationRun(
			root,
			{ session: parsed.session, taskId: parsed.taskId, run: prepared.run },
			{ fencingCheck: lease.assertOwned },
		);
		return {
			ok: true,
			done: completion.done,
			warnings: completion.warnings,
			runId: completion.runId,
			evidenceIds: completion.evidenceIds,
			stepCount: prepared.run.step_count,
		};
	}

	let observedCompletion: ReturnType<typeof completeObservedTask> | null = null;
	if (parsed.verifications.length === 1) {
		const snapshot = taskAttemptSnapshot(root, parsed);
		const verificationSpec = parsed.verifications[0] as VerificationSpec;
		const command =
			parsed.testCommands[0] ?? formatVerificationCommand(verificationSpec);
		const verification = await runVerificationAsync(root, verificationSpec, {
			signal: lease.signal,
			timeoutMs: parsed.verificationTimeoutMs,
		});
		lease.assertOwned();
		observedCompletion = completeObservedTask(
			root,
			{
				session: parsed.session,
				taskId: parsed.taskId,
				taskAttemptSnapshot: snapshot,
				command,
				exitCode: verification.exitCode,
				...(verification.signal ? { signal: verification.signal } : {}),
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			},
			{ fencingCheck: lease.assertOwned },
		);
		if (verification.status !== "passed") {
			return {
				ok: false,
				message: `--test failed with exit code ${verification.exitCode}`,
				status: verification.status,
				exitCode: 1,
				evidenceIds: [observedCompletion.evidence.id],
				warnings: observedCompletion.warnings,
			};
		}
	}
	if (parsed.testShellCommand) {
		const snapshot = taskAttemptSnapshot(root, parsed);
		const verification = await runVerificationAsync(
			root,
			{ mode: "shell", command: parsed.testShellCommand },
			{
				signal: lease.signal,
				timeoutMs: parsed.verificationTimeoutMs,
			},
		);
		lease.assertOwned();
		observedCompletion = completeObservedTask(
			root,
			{
				session: parsed.session,
				taskId: parsed.taskId,
				taskAttemptSnapshot: snapshot,
				command: parsed.testShellCommand,
				exitCode: verification.exitCode,
				...(verification.signal ? { signal: verification.signal } : {}),
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			},
			{ fencingCheck: lease.assertOwned },
		);
		if (verification.status !== "passed") {
			return {
				ok: false,
				message: `--test-shell failed with exit code ${verification.exitCode}`,
				status: verification.status,
				exitCode: 1,
				evidenceIds: [observedCompletion.evidence.id],
			};
		}
	}
	if (parsed.evidenceCommand && parsed.evidenceResult) {
		recordEvidence(
			root,
			{
				session: parsed.session,
				taskId: parsed.taskId,
				command: parsed.evidenceCommand,
				result: parsed.evidenceResult,
				provenance: "declared",
				approvalContext: ctx,
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			},
			{ fencingCheck: lease.assertOwned },
		);
	}
	lease.assertOwned();
	const done =
		observedCompletion?.done ??
		doneTask(root, parsed, { fencingCheck: lease.assertOwned });
	const warnings = [
		...new Set([
			...(observedCompletion?.warnings ?? []),
			...(done.warnings ?? []),
		]),
	];
	return { ok: true, done, warnings };
}

async function withTaskCompletionLocks<T>(
	root: string,
	session: string,
	taskIds: readonly string[],
	action: (leases: readonly TaskCompletionLease[]) => Promise<T>,
): Promise<T> {
	const sortedTaskIds = [...new Set(taskIds)].sort();
	const leases: TaskCompletionLease[] = [];
	const acquire = async (index: number): Promise<T> => {
		const taskId = sortedTaskIds[index];
		if (!taskId) return action(leases);
		return withTaskCompletionLock(root, session, taskId, async (lease) => {
			leases.push(lease);
			try {
				return await acquire(index + 1);
			} finally {
				leases.pop();
			}
		});
	};
	return acquire(0);
}

async function runDoneBatch(
	root: string,
	parsed: DoneArgs,
	ctx: OperationContext,
	output: DoneOutput,
): Promise<number> {
	if (parsed.evidenceCommand || parsed.evidenceResult) {
		throw new Error(
			"Batch done requires one observed --test, --test-shell, or positional verification.",
		);
	}
	if (parsed.testCommands.length > 1) {
		throw new Error("Batch done supports exactly one shared verification.");
	}
	const verification: VerificationSpec | undefined = parsed.testShellCommand
		? { mode: "shell", command: parsed.testShellCommand }
		: parsed.verifications[0];
	if (!verification) {
		throw new Error(
			"Batch done requires one observed --test, --test-shell, or positional verification.",
		);
	}
	if (parsed.requireSpecCheck) {
		for (const taskId of parsed.taskIds) {
			const specCheck = resolveRequiredSpecCheck(root, parsed.session, taskId);
			if (specCheck.status === "conflict") {
				throw new Error(`spec check failed: ${specCheck.spec_id || taskId}`);
			}
		}
	}

	return withTaskCompletionLocks(
		root,
		parsed.session,
		parsed.taskIds,
		async (leases) => {
			const assertOwned = () => {
				for (const lease of leases) lease.assertOwned();
			};
			assertOwned();
			const taskAttemptSnapshots = assertObservedBatchTasksReady(root, {
				session: parsed.session,
				taskIds: parsed.taskIds,
			});
			const signals = leases.map((lease) => lease.signal);
			const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
			const observed = signal
				? await runVerificationAsync(root, verification, {
						signal,
						timeoutMs: parsed.verificationTimeoutMs,
					})
				: await runVerificationAsync(root, verification, {
						timeoutMs: parsed.verificationTimeoutMs,
					});
			assertOwned();
			const command =
				parsed.testShellCommand ??
				parsed.testCommands[0] ??
				formatVerificationCommand(verification);
			const completion = completeObservedTasks(
				root,
				{
					session: parsed.session,
					taskIds: parsed.taskIds,
					taskAttemptSnapshots,
					command,
					exitCode: observed.exitCode,
					approvalContext: ctx,
					...(observed.signal ? { signal: observed.signal } : {}),
					...(parsed.artifact ? { artifact: parsed.artifact } : {}),
					...(parsed.note ? { note: parsed.note } : {}),
				},
				{ fencingCheck: assertOwned },
			);
			const evidenceIds = completion.evidence.map((entry) => entry.id);
			const warnings = completion.warnings;
			if (observed.status !== "passed") {
				if (parsed.json) {
					output.stdout(
						stringifyEnvelope({
							...envelopeErr(
								"workbench.verification_failed",
								`shared verification failed with exit code ${observed.exitCode}`,
								{ action: "workbench.done", exitCode: 1 },
							),
							data: {
								session: parsed.session,
								tasks: parsed.taskIds,
								status: observed.status,
								failed_step: "verification",
								task_id: parsed.taskId,
								task_ids: parsed.taskIds,
								evidence_ids: evidenceIds,
								evidence_count: evidenceIds.length,
								warnings,
								next_command: repairHintForStep("done", {
									session: parsed.session,
									taskId: parsed.taskId,
								}),
							},
						}),
					);
				} else {
					output.stderr(
						`shared verification failed: ${formatTaskSelection(parsed.taskIds)} (exit=${observed.exitCode})`,
					);
				}
				return 1;
			}
			if (parsed.json) {
				output.stdout(
					stringifyEnvelope(
						envelopeOk(
							{
								session: parsed.session,
								tasks: parsed.taskIds,
								status: warnings.length ? "committed_with_warnings" : "done",
								evidence_ids: evidenceIds,
								evidence_count: evidenceIds.length,
								warnings,
							},
							{ action: "workbench.done" },
						),
					),
				);
			} else {
				output.stdout(
					[
						`tasks done: ${parsed.taskIds.length} (${formatTaskSelection(parsed.taskIds)})`,
						`authorizing evidence: ${evidenceIds.length}`,
						...warnings.map((warning) => `warning: ${warning}`),
					].join("\n"),
				);
			}
			return 0;
		},
	);
}

export async function runDoneCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	const finishMeasurement = beginHotPathMeasurement("done");
	const emitted: string[] = [];
	const output: DoneOutput = {
		stdout: (value) => {
			emitted.push(value);
			console.log(value);
		},
		stderr: (value) => {
			emitted.push(value);
			console.error(value);
		},
	};
	let parsed: DoneArgs | undefined;
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.done");
		const doneArgs = parseDoneArgs(args, root);
		parsed = doneArgs;
		if (doneArgs.taskIds.length > 1) {
			return await runDoneBatch(root, doneArgs, ctx, output);
		}
		let result: DoneLockedResult;
		try {
			result = await withTaskCompletionLock(
				root,
				doneArgs.session,
				doneArgs.taskId,
				(lease) => executeDoneLocked(root, doneArgs, ctx, lease),
			);
		} catch (error) {
			if (!(error instanceof DoneLockLostError)) throw error;
			result = error.result;
		}
		if (!result.ok) {
			if (doneArgs.json) {
				const data = {
					...doneRecoveryData(doneArgs, {
						failedStep: "verification",
						status: result.status,
						...(result.evidenceIds ? { evidenceIds: result.evidenceIds } : {}),
					}),
					...(result.runId ? { verification_run_id: result.runId } : {}),
					...(result.stepIndex ? { step_index: result.stepIndex } : {}),
					...(result.stepCount ? { step_count: result.stepCount } : {}),
					evidence_count: result.evidenceIds?.length ?? 0,
					warnings: result.warnings ?? [],
				};
				output.stdout(
					stringifyDoneJsonError(
						new Error(result.message),
						result.exitCode,
						data,
						{
							code: "workbench.verification_failed",
							message: boundDoneDiagnostic(result.message),
						},
					),
				);
			} else {
				output.stderr(result.message);
			}
			return result.exitCode;
		}
		const completionWarnings = result.warnings;
		if (doneArgs.json) {
			output.stdout(
				stringifyEnvelope(
					envelopeOk(
						{
							session: doneArgs.session,
							task: doneArgs.taskId,
							status: completionWarnings.length
								? "committed_with_warnings"
								: "done",
							warnings: completionWarnings,
							authorizing_evidence_id: result.done.authorizingEvidenceId,
							...(result.runId
								? {
										verification_run_id: result.runId,
										step_count: result.stepCount ?? 0,
										evidence_ids: result.evidenceIds ?? [],
										evidence_count: result.evidenceIds?.length ?? 0,
									}
								: {}),
							...pendingSpecFields(root, doneArgs.session, doneArgs.taskId),
						},
						{ action: "workbench.done" },
					),
				),
			);
		} else {
			const lines = [
				`task done: ${doneArgs.taskId}`,
				`authorizing evidence: ${result.done.authorizingEvidenceId}`,
			];
			if (result.runId) {
				lines.push(
					`verification: ${result.stepCount ?? 0}/${result.stepCount ?? 0} passed`,
				);
			}
			lines.push(...completionWarnings.map((warning) => `warning: ${warning}`));
			appendPendingSpecWarning(lines, root, doneArgs.session, doneArgs.taskId);
			output.stdout(lines.join("\n"));
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			const data = doneRecoveryData(parsed, {
				failedStep: parsed === undefined ? "parse" : "completion",
				status: "failed",
			});
			if (error instanceof TaskCompletionBusyError) {
				output.stdout(
					stringifyEnvelope({
						...envelopeErr("workbench.completion_busy", error.message, {
							action: "workbench.done",
							exitCode: 2,
						}),
						data: { ...data, status: "busy", failed_step: "lock" },
					}),
				);
			} else if (error instanceof VerificationRunConflictError) {
				output.stdout(
					stringifyEnvelope({
						...envelopeErr("workbench.stale_conflict", error.message, {
							action: "workbench.done",
							exitCode: 2,
						}),
						data: {
							...data,
							status: "stale_conflict",
							failed_step: "verification",
						},
					}),
				);
			} else if (parsed === undefined) {
				output.stdout(
					stringifyDoneJsonError(error, 2, data, {
						code:
							error instanceof DoneArgumentError
								? error.code
								: "workbench.invalid_arguments",
						message:
							error instanceof DoneArgumentError
								? error.message
								: "Invalid done arguments.",
					}),
				);
			} else {
				output.stdout(stringifyDoneJsonError(error, 2, data));
			}
		} else {
			output.stderr((error as Error).message);
		}
		return 2;
	} finally {
		finishMeasurement(emitted.join("\n"));
	}
}

export async function runLogCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.log");
		const parsed = parseLogArgs(args, root);
		const result = appendTimelineEntry(root, parsed.session, parsed.message);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							status: "logged",
							logPath: result.logPath,
							message: result.message,
						},
						{ action: "workbench.log" },
					),
				),
			);
		} else {
			console.log(`log appended: ${result.logPath}`);
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.log", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

export async function runVerifyTasksCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) {
			console.log(
				"Usage: afol verify-tasks [session-path] [--strict] [--verbose]",
			);
			return 0;
		}
		const parsed = parseVerifyArgs(args, root);
		const result = verifyWorkbenchTasks(parsed.sessionPath, parsed.strict);
		if (parsed.json) {
			if (result.allCompleted) {
				console.log(
					stringifyEnvelope(
						envelopeOk(
							{
								...result,
								status: "passed",
							},
							{ action: "workbench.verify" },
						),
					),
				);
			} else {
				console.log(
					stringifyEnvelope(
						envelopeErr("workbench.error", "Verification failed.", {
							action: "workbench.verify",
							exitCode: 1,
							hint: `open_tasks=${result.openTasks.length}; issues=${result.issues.length}`,
						}),
					),
				);
			}
		} else {
			console.log(formatVerifyReport(result, parsed.verbose).trimEnd());
		}
		return result.allCompleted ? 0 : 1;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.verify", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

export { runCloseCommand } from "./close";
