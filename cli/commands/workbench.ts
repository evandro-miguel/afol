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
import {
	appendTimelineEntry,
	closeSession,
	completeObservedTask,
	doneTask,
	type LifecycleAuxiliaryRuntime,
	newWorkstream,
	recordEvidence,
	startTask,
	type TaskState,
	transitionTask,
} from "../services/workbench/lifecycle";
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
import {
	hasJsonFlag,
	parseCloseArgs,
	parseDoneArgs,
	parseEvidenceArgs,
	parseLogArgs,
	parseNewArgs,
	parseSessionTaskArgs,
	parseVerifyArgs,
} from "./workbench/args";
import { writeJsonError } from "./workbench/shared";
import { resolveRequiredSpecCheck, runVerification } from "./workbench/verify";

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
		const governance = resolveGovernance(parsed.metadata);
		if (
			governance.governanceStatus === "governed" &&
			parsed.metadata.featureId &&
			parsed.metadata.parentSpec
		) {
			const catalog = resolveGovernanceCatalog(
				root,
				parsed.metadata.featureId,
				parsed.metadata.parentSpec,
			);
			parsed.metadata.parentSpec = catalog.specId;
		}
		const created = newWorkstream(root, parsed.theme, parsed.metadata);
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
		const pending = getSessionPendingSpecNotice(
			root,
			parsed.session,
			parsed.taskId,
		);
		if (pending) {
			throw new Error(
				`pending_spec blocks start for session ${parsed.session}; ${pending.resolutionHint.replace("<session>", parsed.session)}`,
			);
		}
		const warnings = startTask(root, parsed, runtime);
		if (parsed.compact && !parsed.brief && !parsed.json) {
			const lines = [
				`task started: ${parsed.taskId}`,
				...warnings.map((warning) => `warning: ${warning}`),
			];
			appendPendingSpecWarning(lines, root, parsed.session, parsed.taskId);
			console.log(lines.join("\n"));
			return 0;
		}
		if (!parsed.brief) {
			if (!parsed.json) {
				const lines = [
					`task started: ${parsed.taskId}`,
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
		const stateIndex = policyArgs.indexOf("--state");
		const state = stateIndex >= 0 ? policyArgs[stateIndex + 1] : undefined;
		if (!state || !TRANSITION_STATES.has(state as TaskState)) {
			throw new Error(
				`Missing or invalid --state for transition: ${state ?? ""}`,
			);
		}
		const sessionArgs = policyArgs.filter(
			(_, index) => index !== stateIndex && index !== stateIndex + 1,
		);
		const parsed = parseSessionTaskArgs(sessionArgs, "transition", root);
		const warnings = transitionTask(
			root,
			{
				...parsed,
				state: state as TaskState,
				...(policy ? { completionPolicy: policy as CompletionPolicy } : {}),
			},
			runtime,
		);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{ session: parsed.session, task: parsed.taskId, state, warnings },
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

export async function runDoneCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.done");
		const parsed = parseDoneArgs(args, root);
		if (parsed.requireSpecCheck) {
			const specCheck = resolveRequiredSpecCheck(
				root,
				parsed.session,
				parsed.taskId,
			);
			if (specCheck.status === "conflict") {
				if (parsed.json) {
					writeJsonError(
						"workbench.done",
						new Error(
							`spec check failed: ${specCheck.spec_id || parsed.taskId}`,
						),
						1,
					);
				} else {
					console.error(
						`spec check failed: ${specCheck.spec_id || parsed.taskId}`,
					);
				}
				return 1;
			}
		}
		let observedCompletion: ReturnType<typeof completeObservedTask> | null =
			null;
		if (parsed.verification || parsed.testCommand || parsed.testShellCommand) {
			const verificationSpec = parsed.verification;
			const verification = verificationSpec
				? runVerification(root, verificationSpec)
				: runVerification(
						root,
						parsed.testShellCommand ?? parsed.testCommand ?? "",
						{ shell: Boolean(parsed.testShellCommand) },
					);
			const verificationCommand =
				parsed.testCommand ??
				parsed.testShellCommand ??
				(verificationSpec?.mode === "argv"
					? [verificationSpec.executable, ...verificationSpec.args].join(" ")
					: (verificationSpec?.command ?? ""));
			observedCompletion = completeObservedTask(root, {
				session: parsed.session,
				taskId: parsed.taskId,
				command: verificationCommand,
				exitCode: verification.exitCode,
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			});
			if (verification.exitCode !== 0) {
				const failureLabel = parsed.testShellCommand
					? "--test-shell"
					: "--test";
				if (parsed.json) {
					writeJsonError(
						"workbench.done",
						new Error(
							`${failureLabel} failed with exit code ${verification.exitCode}`,
						),
						1,
					);
				} else {
					console.error(
						`${failureLabel} failed with exit code ${verification.exitCode}`,
					);
				}
				return 1;
			}
		}
		if (parsed.evidenceCommand && parsed.evidenceResult) {
			recordEvidence(root, {
				session: parsed.session,
				taskId: parsed.taskId,
				command: parsed.evidenceCommand,
				result: parsed.evidenceResult,
				provenance: "declared",
				approvalContext: ctx,
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			});
		}
		const done = observedCompletion?.done ?? doneTask(root, parsed);
		const completionWarnings = [
			...new Set([
				...(observedCompletion?.warnings ?? []),
				...(done.warnings ?? []),
			]),
		];
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							task: parsed.taskId,
							status: completionWarnings.length
								? "committed_with_warnings"
								: "done",
							warnings: completionWarnings,
							authorizing_evidence_id: done.authorizingEvidenceId,
							...pendingSpecFields(root, parsed.session, parsed.taskId),
						},
						{ action: "workbench.done" },
					),
				),
			);
		} else {
			const lines = [
				`task done: ${parsed.taskId}`,
				`authorizing evidence: ${done.authorizingEvidenceId}`,
			];
			lines.push(...completionWarnings.map((warning) => `warning: ${warning}`));
			appendPendingSpecWarning(lines, root, parsed.session, parsed.taskId);
			console.log(lines.join("\n"));
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.done", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
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
			console.log("Usage: afol verify-tasks [session-path] [--strict]");
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
			console.log(formatVerifyReport(result).trimEnd());
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

export async function runCloseCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.close");
		const parsed = parseCloseArgs(args, root);
		const closeWarnings = closeSession(root, parsed.session, {
			allowNoReport: parsed.allowNoReport,
			reason: parsed.reason,
			summary: parsed.summary,
		});
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							status: "closed",
							report: closeWarnings.report,
						},
						{
							action: "workbench.close",
							...(closeWarnings.length > 0 ? { warnings: closeWarnings } : {}),
						},
					),
				),
			);
		} else {
			console.log(`session closed: ${parsed.session}`);
			for (const warning of closeWarnings) {
				console.warn(`warning: ${warning}`);
			}
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.close", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}
