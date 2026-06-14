import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	appendTimelineEntry,
	closeSession,
	doneTask,
	newWorkstream,
	recordEvidence,
	startTask,
} from "../services/workbench/lifecycle";
import {
	formatVerifyReport,
	verifyWorkbenchTasks,
} from "../services/workbench/verify";
import {
	hasJsonFlag,
	parseDoneArgs,
	parseEvidenceArgs,
	parseLogArgs,
	parseNewArgs,
	parseSessionOnlyArgs,
	parseSessionTaskArgs,
	parseVerifyArgs,
} from "./workbench/args";
import { writeJsonError } from "./workbench/shared";
import { resolveRequiredSpecCheck, runVerification } from "./workbench/verify";

export async function runNewCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		const parsed = parseNewArgs(args);
		const created = newWorkstream(root, parsed.theme, parsed.metadata);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{ ...created, status: "created" },
						{ action: "workbench.new" },
					),
				),
			);
		} else {
			console.log(`session created: ${created.session}`);
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

export async function runStartCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		const parsed = parseSessionTaskArgs(args, "start", root, {
			allowAutoTask: true,
		});
		startTask(root, parsed);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							task: parsed.taskId,
							status: "in_progress",
						},
						{ action: "workbench.start" },
					),
				),
			);
		} else {
			console.log(`task started: ${parsed.taskId}`);
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
): Promise<number> {
	try {
		const record = recordEvidence(root, parseEvidenceArgs(args, root));
		console.log(`evidence recorded: ${record.id}`);
		return 0;
	} catch (error) {
		console.error((error as Error).message);
		return 2;
	}
}

export async function runDoneCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
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
			const verification = runVerification(root, parsed.testCommand);
			recordEvidence(root, {
				session: parsed.session,
				taskId: parsed.taskId,
				command: parsed.testCommand,
				result: verification.exitCode === 0 ? "passed" : "failed",
				exitCode: verification.exitCode,
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
		if (parsed.evidenceCommand && parsed.evidenceResult) {
			recordEvidence(root, {
				session: parsed.session,
				taskId: parsed.taskId,
				command: parsed.evidenceCommand,
				result: parsed.evidenceResult,
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
						},
						{ action: "workbench.done" },
					),
				),
			);
		} else {
			console.log(`task done: ${parsed.taskId}`);
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
): Promise<number> {
	try {
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
): Promise<number> {
	try {
		const parsed = parseSessionOnlyArgs(args, "close", root);
		closeSession(root, parsed.session);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{ session: parsed.session, status: "closed" },
						{ action: "workbench.close" },
					),
				),
			);
		} else {
			console.log(`session closed: ${parsed.session}`);
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
