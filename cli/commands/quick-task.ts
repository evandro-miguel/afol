import { envelopeOk, stringifyEnvelope } from "../core/envelope";
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
import type { NewWorkstreamMetadata } from "../services/workbench/lifecycle";
import {
	closeSession,
	doneTask,
	newWorkstream,
	recordEvidence,
	startTask,
	transitionTask,
} from "../services/workbench/lifecycle";
import {
	formatHintLine,
	nextCommandHint,
	repairHintForStep,
} from "./workbench/hints";
import { writeJsonError } from "./workbench/shared";
import { runVerification } from "./workbench/verify";

export type ParsedQuickTaskArgs = {
	theme: string;
	json: boolean;
	metadata: NewWorkstreamMetadata;
	command: string;
	artifact?: string;
	note?: string;
};

export function parseQuickTaskArgs(args: string[]): ParsedQuickTaskArgs {
	let theme = "";
	let json = false;
	let command = "";
	let artifact = "";
	let note = "";
	const metadata: NewWorkstreamMetadata = {};
	let noSpecRequired = false;
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
		if (arg === "--no-spec-required") {
			noSpecRequired = true;
			continue;
		}
		if (arg === "--reason") {
			if (!value) throw new Error("Missing value for --reason in quick-task.");
			metadata.noSpecRequiredReason = value;
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
	if (!command.trim()) throw new Error("quick-task requires --command.");
	if (metadata.noSpecRequiredReason && !noSpecRequired) {
		throw new Error("Missing --no-spec-required for quick-task reason.");
	}
	if (noSpecRequired && !metadata.noSpecRequiredReason?.trim()) {
		throw new Error("Missing --reason for --no-spec-required in quick-task.");
	}
	const hasBinding = Boolean(
		metadata.featureId?.trim() && metadata.parentSpec?.trim(),
	);
	if (!hasBinding && !metadata.noSpecRequiredReason?.trim()) {
		throw new Error(
			"quick-task requires --feature-id and --parent-spec or --no-spec-required --reason.",
		);
	}
	if (hasBinding && noSpecRequired)
		throw new Error(
			"quick-task governance binding and waiver are mutually exclusive.",
		);
	return {
		theme,
		json,
		metadata,
		command,
		...(artifact ? { artifact } : {}),
		...(note ? { note } : {}),
	};
}

function renderSuccess(
	message: string,
	hint: string,
	warnings: string[] = [],
): string {
	return [message, ...warnings, formatHintLine(hint)].join("\n");
}

export async function runQuickTaskCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	let parsed: ParsedQuickTaskArgs | null = null;
	let session: string | null = null;
	let failedStep = "parse";
	let exitCode = 2;
	try {
		if (requiresApproval(ctx)) {
			throw new Error(
				`quick-task denied for ${ctx.callerType} callers; rerun from a trusted local context`,
			);
		}
		parsed = parseQuickTaskArgs(args);
		if (parsed.metadata.featureId && parsed.metadata.parentSpec) {
			resolveGovernanceCatalog(
				root,
				parsed.metadata.featureId,
				parsed.metadata.parentSpec,
			);
		}
		const governance = resolveGovernance(parsed.metadata);
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
			result: verificationPassed ? "passed" : "failed",
			exitCode: verification.exitCode,
			provenance: "observed",
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
				`--command failed with exit code ${verification.exitCode}${details}`,
			);
		}
		failedStep = "done";
		transitionTask(root, {
			session: created.session,
			taskId,
			state: "implemented_untested",
		});
		transitionTask(root, {
			session: created.session,
			taskId,
			state: "tested_needs_spec_validation",
		});
		doneTask(root, { session: created.session, taskId });
		failedStep = "close";
		closeSession(root, created.session);
		const hint = nextCommandHint("quick-task", { session: created.session });
		const pendingNotice = getSessionPendingSpecNotice(
			root,
			created.session,
			taskId,
		);
		const payload = {
			session: created.session,
			task: taskId,
			evidence_id: evidence.id,
			status: "closed",
			governance_status: governance.governanceStatus,
			pending_spec: Boolean(pendingNotice) || governance.pendingSpec,
			...(pendingNotice
				? {
						pending_spec_missing: pendingNotice.missing,
						pending_spec_resolution_hint: pendingNotice.resolutionHint.replace(
							"<session>",
							pendingNotice.session,
						),
					}
				: {}),
			next_command: hint,
		};
		if (parsed.json) {
			console.log(
				stringifyEnvelope(envelopeOk(payload, { action: "quick-task" })),
			);
		} else {
			console.log(
				renderSuccess(
					`quick-task complete: ${created.session}`,
					hint,
					formatSessionPendingSpecWarning(pendingNotice),
				),
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
