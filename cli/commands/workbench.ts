import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	assertNoOpenPendingSpecs,
	formatSessionPendingSpecWarning,
	getSessionPendingSpecNotice,
	resolveGovernance,
} from "../services/governance/pending-specs";
import {
	appendTimelineEntry,
	closeSession,
	doneTask,
	newWorkstream,
	recordEvidence,
	startTask,
} from "../services/workbench/lifecycle";
import {
	type briefingUnavailable,
	briefingUnavailableFor,
	buildStartBriefing,
	formatStartBriefing,
	type StartBriefing,
} from "../services/workbench/start-briefing";
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
		assertNoOpenPendingSpecs(root);
		const governance = resolveGovernance(parsed.metadata);
		const created = newWorkstream(root, parsed.theme, parsed.metadata);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							...created,
							status: "created",
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
				`governance_status: ${governance.governanceStatus}`,
			];
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
): Promise<number> {
	try {
		assertWorkbenchMutationAllowed(ctx, "workbench.start");
		const parsed = parseSessionTaskArgs(args, "start", root, {
			allowAutoTask: true,
		});
		startTask(root, parsed);
		if (parsed.compact && !parsed.brief && !parsed.json) {
			const lines = [`task started: ${parsed.taskId}`];
			appendPendingSpecWarning(lines, root, parsed.session, parsed.taskId);
			console.log(lines.join("\n"));
			return 0;
		}
		if (!parsed.brief) {
			if (!parsed.json) {
				const lines = [`task started: ${parsed.taskId}`];
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
							briefing,
							...pendingSpecFields(root, parsed.session, parsed.taskId),
						},
						{ action: "workbench.start" },
					),
				),
			);
		} else {
			const lines = [`task started: ${parsed.taskId}`];
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
							...pendingSpecFields(root, parsed.session, parsed.taskId),
						},
						{ action: "workbench.evidence" },
					),
				),
			);
		} else {
			const lines = [`evidence recorded: ${record.id}`];
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
		if (parsed.testCommand) {
			const verification = runVerification(root, parsed.testCommand, {
				shell: false,
			});
			recordEvidence(root, {
				session: parsed.session,
				taskId: parsed.taskId,
				command: parsed.testCommand,
				result: verification.exitCode === 0 ? "passed" : "failed",
				exitCode: verification.exitCode,
				provenance: "observed",
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			});
			if (verification.exitCode !== 0) {
				if (parsed.json) {
					writeJsonError(
						"workbench.done",
						new Error(`--test failed with exit code ${verification.exitCode}`),
						1,
					);
				} else {
					console.error(
						`--test failed with exit code ${verification.exitCode}`,
					);
				}
				return 1;
			}
		}
		if (parsed.testShellCommand) {
			const verification = runVerification(root, parsed.testShellCommand, {
				shell: true,
			});
			recordEvidence(root, {
				session: parsed.session,
				taskId: parsed.taskId,
				command: parsed.testShellCommand,
				result: verification.exitCode === 0 ? "passed" : "failed",
				exitCode: verification.exitCode,
				provenance: "observed",
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			});
			if (verification.exitCode !== 0) {
				if (parsed.json) {
					writeJsonError(
						"workbench.done",
						new Error(
							`--test-shell failed with exit code ${verification.exitCode}`,
						),
						1,
					);
				} else {
					console.error(
						`--test-shell failed with exit code ${verification.exitCode}`,
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
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			});
		}
		doneTask(root, parsed);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							task: parsed.taskId,
							status: "done",
							...pendingSpecFields(root, parsed.session, parsed.taskId),
						},
						{ action: "workbench.done" },
					),
				),
			);
		} else {
			const lines = [`task done: ${parsed.taskId}`];
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
		});
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{ session: parsed.session, status: "closed" },
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
