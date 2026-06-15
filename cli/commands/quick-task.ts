import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import type { NewWorkstreamMetadata } from "../services/workbench/lifecycle";
import {
	closeSession,
	doneTask,
	newWorkstream,
	recordEvidence,
	startTask,
} from "../services/workbench/lifecycle";
import {
	formatHintLine,
	nextCommandHint,
	repairHintForStep,
} from "./workbench/hints";
import { writeJsonError } from "./workbench/shared";
import { runVerification } from "./workbench/verify";

type ParsedQuickTaskArgs = {
	theme: string;
	json: boolean;
	metadata: NewWorkstreamMetadata;
	command: string;
	result: string;
	artifact?: string;
	note?: string;
};

function parseQuickTaskArgs(args: string[]): ParsedQuickTaskArgs {
	let theme = "";
	let json = false;
	let command = "quick-task";
	let result = "passed";
	let artifact = "";
	let note = "";
	const metadata: NewWorkstreamMetadata = {};
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const value = args[index + 1];
		if (!arg) {
			continue;
		}
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (!theme && !arg.startsWith("-")) {
			theme = arg;
			continue;
		}
		if (arg === "--feature-id") {
			if (!value)
				throw new Error("Missing value for --feature-id in quick-task.");
			metadata.featureId = value;
			index += 1;
			continue;
		}
		if (arg === "--parent-spec") {
			if (!value)
				throw new Error("Missing value for --parent-spec in quick-task.");
			metadata.parentSpec = value;
			index += 1;
			continue;
		}
		if (arg === "--task") {
			if (!value) throw new Error("Missing value for --task in quick-task.");
			metadata.task = value;
			index += 1;
			continue;
		}
		if (arg === "--command") {
			if (!value) throw new Error("Missing value for --command in quick-task.");
			command = value;
			index += 1;
			continue;
		}
		if (arg === "--result") {
			if (!value) throw new Error("Missing value for --result in quick-task.");
			result = value;
			index += 1;
			continue;
		}
		if (arg === "--artifact") {
			if (!value)
				throw new Error("Missing value for --artifact in quick-task.");
			artifact = value;
			index += 1;
			continue;
		}
		if (arg === "--note") {
			if (!value) throw new Error("Missing value for --note in quick-task.");
			note = value;
			index += 1;
			continue;
		}
		throw new Error(`Unknown quick-task argument: ${arg}`);
	}
	if (!theme) {
		throw new Error("Missing theme for quick-task.");
	}
	if (result !== "passed") {
		throw new Error("quick-task requires --result passed.");
	}
	return {
		theme,
		json,
		metadata,
		command,
		result,
		...(artifact ? { artifact } : {}),
		...(note ? { note } : {}),
	};
}

function renderSuccess(message: string, hint: string): string {
	return `${message}\n${formatHintLine(hint)}`;
}

export async function runQuickTaskCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	let parsed: ParsedQuickTaskArgs | null = null;
	let session: string | null = null;
	let failedStep = "parse";
	let exitCode = 2;
	try {
		parsed = parseQuickTaskArgs(args);
		const created = newWorkstream(root, parsed.theme, parsed.metadata);
		session = created.session;
		failedStep = "start";
		const taskId = "T-01";
		startTask(root, { session: created.session, taskId });
		failedStep = "verification";
		const verification = runVerification(root, parsed.command);
		failedStep = "evidence";
		const verificationPassed = verification.exitCode === 0;
		const evidence = recordEvidence(root, {
			session: created.session,
			taskId,
			command: parsed.command,
			result: verificationPassed ? parsed.result : "failed",
			exitCode: verification.exitCode,
			...(parsed.artifact ? { artifact: parsed.artifact } : {}),
			...(parsed.note ? { note: parsed.note } : {}),
		});
		if (!verificationPassed) {
			failedStep = "verification";
			exitCode = 1;
			const details = verification.error
				? `; error: ${verification.error}`
				: verification.signal
					? `; signal: ${verification.signal}`
					: "";
			throw new Error(
				`--command failed with exit code ${verification.exitCode}${details}; --result passed was downgraded to failed`,
			);
		}
		failedStep = "done";
		doneTask(root, { session: created.session, taskId });
		failedStep = "close";
		closeSession(root, created.session);
		const hint = nextCommandHint("quick-task", { session: created.session });
		const payload = {
			session: created.session,
			task: taskId,
			evidence_id: evidence.id,
			status: "closed",
			next_command: hint,
		};
		if (parsed.json) {
			console.log(
				stringifyEnvelope(envelopeOk(payload, { action: "quick-task" })),
			);
		} else {
			console.log(
				renderSuccess(`quick-task complete: ${created.session}`, hint),
			);
		}
		return 0;
	} catch (error) {
		const context = session
			? { session, taskId: "T-01" }
			: parsed
				? { theme: parsed.theme }
				: {};
		const hint = session
			? repairHintForStep("session-show", { session })
			: repairHintForStep("quick-task", context);
		const message = session
			? `session=${session} failed_step=${failedStep} ${(error as Error).message}`
			: (error as Error).message;
		if (args.includes("--json") || args.includes("-j")) {
			writeJsonError("quick-task", new Error(message), exitCode);
		} else {
			console.error(`${message} ${formatHintLine(hint)}`);
		}
		return exitCode;
	}
}
