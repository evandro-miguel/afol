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
	completeObservedTask,
	completeObservedTasks,
	newWorkstream,
	startTasks,
} from "../services/workbench/lifecycle";
import { type FlagDef, parseFlagSpec } from "./flag-spec";
import {
	formatHintLine,
	nextCommandHint,
	repairHintForStep,
} from "./workbench/hints";
import { writeJsonError } from "./workbench/shared";
import { runVerification } from "./workbench/verify";

/** Match batch start / task-selector cap in workbench args. */
const QUICK_TASK_MAX_TASKS = 100;

/** Failed steps that leave the session open with unfinished tasks. */
const OPEN_TASK_FAILED_STEPS = new Set(["start", "verification", "evidence"]);

function sessionOpenRecoveryLines(taskId: string): string[] {
	return [
		"session left open",
		`next: afol tr ${taskId} --state problem -r "<reason>"   (mark blocker)`,
		`  or: afol d ${taskId} -x "<corrected command>"         (retry and close)`,
	];
}

export type ParsedQuickTaskArgs = {
	theme: string;
	json: boolean;
	metadata: NewWorkstreamMetadata;
	command: string;
	artifact?: string;
	note?: string;
};

function formatTaskId(index: number): string {
	return `T-${String(index).padStart(2, "0")}`;
}

/** Task ids T-01..T-n matching newWorkstream summary order. */
export function deriveQuickTaskIds(metadata: NewWorkstreamMetadata): string[] {
	const fromList =
		metadata.tasks
			?.map((task) => task.trim())
			.filter((task) => task.length > 0) ?? [];
	const count = fromList.length > 0 ? fromList.length : 1;
	return Array.from({ length: count }, (_, index) => formatTaskId(index + 1));
}

type QuickTaskFlagState = {
	theme: string;
	json: boolean;
	command: string;
	artifact: string;
	note: string;
	noSpecRequired: boolean;
	metadata: NewWorkstreamMetadata;
};

const QUICK_TASK_FLAG_SPECS: FlagDef<QuickTaskFlagState>[] = [
	{ names: ["--json", "-j"], kind: "flag", key: "json" },
	{
		names: ["--feature-id"],
		kind: "value",
		apply: (state, raw) => {
			state.metadata.featureId = raw;
		},
	},
	{
		names: ["--parent-spec"],
		kind: "value",
		apply: (state, raw) => {
			state.metadata.parentSpec = raw;
		},
	},
	{ names: ["--no-spec-required"], kind: "flag", key: "noSpecRequired" },
	{
		names: ["--reason"],
		kind: "value",
		apply: (state, raw) => {
			state.metadata.noSpecRequiredReason = raw;
		},
	},
	{
		names: ["--task"],
		kind: "multi",
		apply: (state, raw) => {
			state.metadata.task ??= raw;
			state.metadata.tasks ??= [];
			state.metadata.tasks.push(raw);
			if (state.metadata.tasks.length > QUICK_TASK_MAX_TASKS) {
				throw new Error(
					`quick-task supports at most ${QUICK_TASK_MAX_TASKS} tasks.`,
				);
			}
		},
	},
	{ names: ["--command"], kind: "value", key: "command" },
	{ names: ["--artifact"], kind: "value", key: "artifact" },
	{ names: ["--note"], kind: "value", key: "note" },
];

export function parseQuickTaskArgs(args: string[]): ParsedQuickTaskArgs {
	const initialState: QuickTaskFlagState = {
		theme: "",
		json: false,
		command: "",
		artifact: "",
		note: "",
		noSpecRequired: false,
		metadata: {},
	};
	const parsed = parseFlagSpec(
		args,
		{
			flags: QUICK_TASK_FLAG_SPECS,
			context: "quick-task",
			skipFalsyArgs: true,
			positional: (state, arg) => {
				if (!arg || state.theme || arg.startsWith("-")) return false;
				state.theme = arg;
				return true;
			},
		},
		initialState,
	);
	if (!parsed.theme) {
		throw new Error("Missing theme for quick-task.");
	}
	if (!parsed.command.trim()) throw new Error("quick-task requires --command.");
	if (parsed.metadata.noSpecRequiredReason && !parsed.noSpecRequired) {
		throw new Error("Missing --no-spec-required for quick-task reason.");
	}
	if (parsed.noSpecRequired && !parsed.metadata.noSpecRequiredReason?.trim()) {
		throw new Error("Missing --reason for --no-spec-required in quick-task.");
	}
	const hasBinding = Boolean(
		parsed.metadata.featureId?.trim() && parsed.metadata.parentSpec?.trim(),
	);
	if (hasBinding && parsed.noSpecRequired)
		throw new Error(
			"quick-task governance binding and waiver are mutually exclusive.",
		);
	return {
		theme: parsed.theme,
		json: parsed.json,
		metadata: parsed.metadata,
		command: parsed.command,
		...(parsed.artifact ? { artifact: parsed.artifact } : {}),
		...(parsed.note ? { note: parsed.note } : {}),
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
	let taskIds: string[] = [];
	let evidenceIds: string[] = [];
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
		const governance = resolveGovernance(parsed.metadata);
		const created = newWorkstream(root, parsed.theme, parsed.metadata);
		session = created.session;
		taskIds = deriveQuickTaskIds(parsed.metadata);
		failedStep = "start";
		startTasks(root, { session: created.session, taskIds });
		failedStep = "verification";
		const verification = runVerification(root, parsed.command);
		failedStep = "evidence";
		const verificationPassed = verification.exitCode === 0;
		const observedInput = {
			session: created.session,
			command: parsed.command,
			exitCode: verification.exitCode,
			...(parsed.artifact ? { artifact: parsed.artifact } : {}),
			...(parsed.note ? { note: parsed.note } : {}),
		};
		if (taskIds.length === 1) {
			const completion = completeObservedTask(root, {
				...observedInput,
				taskId: taskIds[0] as string,
			});
			evidenceIds = [completion.evidence.id];
		} else {
			const completion = completeObservedTasks(root, {
				...observedInput,
				taskIds,
			});
			evidenceIds = completion.evidence.map((entry) => entry.id);
		}
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
		failedStep = "close";
		closeSession(root, created.session);
		const primaryTaskId = taskIds[0] as string;
		const hint = nextCommandHint("quick-task", { session: created.session });
		const pendingNotice = getSessionPendingSpecNotice(
			root,
			created.session,
			primaryTaskId,
		);
		const payload = {
			session: created.session,
			task: primaryTaskId,
			tasks: taskIds,
			task_ids: taskIds,
			evidence_id: evidenceIds[0],
			evidence_ids: evidenceIds,
			status: "closed",
			governance_status: governance.governanceStatus,
			pending_spec: Boolean(pendingNotice) || governance.pendingSpec,
			...(pendingNotice
				? {
						pending_spec_missing: pendingNotice.missing,
						pending_spec_question: pendingNotice.question,
						pending_spec_resolution_hint: pendingNotice.resolutionHint.replace(
							"<session>",
							pendingNotice.session,
						),
					}
				: {}),
			next_command: pendingNotice?.nextStep ?? hint,
		};
		if (parsed.json) {
			console.log(
				stringifyEnvelope(envelopeOk(payload, { action: "quick-task" })),
			);
		} else {
			if (pendingNotice) {
				console.log(
					[
						`quick-task complete: ${created.session}`,
						...formatSessionPendingSpecWarning(pendingNotice),
					].join("\n"),
				);
			} else {
				console.log(
					renderSuccess(`quick-task complete: ${created.session}`, hint),
				);
			}
		}
		return 0;
	} catch (error) {
		const context = session
			? { session, taskId: taskIds[0] ?? "T-01" }
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
			writeJsonError("quick-task", new Error(message), exitCode, {
				session,
				task_id: taskIds[0] ?? null,
				task_ids: taskIds,
				failed_step: failedStep,
				status: "failed",
				evidence_ids: evidenceIds,
				next_command: hint,
			});
		} else {
			console.error(
				[
					`${message} ${formatHintLine(hint)}`,
					...(session && OPEN_TASK_FAILED_STEPS.has(failedStep)
						? sessionOpenRecoveryLines(taskIds[0] ?? "T-01")
						: []),
				].join("\n"),
			);
		}
		return exitCode;
	}
}
