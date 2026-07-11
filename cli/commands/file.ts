import { envelopeErr, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { validateMutationRuntime } from "../services/state/validate";
import { withTaskInProgressMutation } from "../services/workbench/lifecycle";
import {
	parseArchiveArgs,
	parseMoveArgs,
	parsePatchArgs,
	parseUndoArgs,
} from "./file/args";
import {
	runArchiveMutation,
	runMoveMutation,
	runPatchMutation,
	runUndoMutation,
} from "./file/mutations";
import { outputResult } from "./file/output";
import {
	applyProjectMutationDefaults,
	type CommandIo,
	type CommandResult,
	DEFAULT_IO,
	requireWriteContext,
} from "./file/shared";

export type FileCommandOptions = {
	beforeMutation?: () => void;
	cliRoot?: string;
	invocationPath?: string;
};

function assertFileRuntime(options: FileCommandOptions): void {
	const validation = validateMutationRuntime({
		cliRoot: options.cliRoot,
		invocationPath: options.invocationPath,
		operation: "file mutation",
	});
	if (!validation.ok) throw new Error(validation.message);
}

export async function runFileCommand(
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
	options: FileCommandOptions = {},
): Promise<number> {
	try {
		const [rawCommand, ...rest] = args;
		if (!rawCommand) {
			throw new Error("Missing file subcommand: pt|append|mv|ud|ar");
		}

		let asJson = false;
		let result: CommandResult;
		const mutationOptions = options.beforeMutation
			? { beforeMutation: options.beforeMutation }
			: undefined;

		if (
			rawCommand === "pt" ||
			rawCommand === "patch" ||
			rawCommand === "append"
		) {
			const parsed = applyProjectMutationDefaults(
				parsePatchArgs(rest),
				projectRoot,
			);
			// Restricted callers may inspect dry-run mutation plans, but real writes require local approval.
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file patch requires local interactive approval");
			}
			if (!parsed.dryRun) {
				assertFileRuntime(options);
				requireWriteContext(parsed);
				result = withTaskInProgressMutation(
					projectRoot,
					parsed.session,
					parsed.taskId,
					() => runPatchMutation(parsed, projectRoot),
					mutationOptions,
				);
			} else {
				result = runPatchMutation(parsed, projectRoot);
			}
			asJson = parsed.json;
		} else if (rawCommand === "mv" || rawCommand === "move") {
			const parsed = applyProjectMutationDefaults(
				parseMoveArgs(rest),
				projectRoot,
			);
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file move requires local interactive approval");
			}
			if (!parsed.dryRun) {
				assertFileRuntime(options);
				requireWriteContext(parsed);
				result = withTaskInProgressMutation(
					projectRoot,
					parsed.session,
					parsed.taskId,
					() => runMoveMutation(parsed, projectRoot),
					mutationOptions,
				);
			} else {
				result = runMoveMutation(parsed, projectRoot);
			}
			asJson = parsed.json;
		} else if (rawCommand === "ud" || rawCommand === "undo") {
			const parsed = parseUndoArgs(rest);
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file undo requires local interactive approval");
			}
			asJson = parsed.json;
			if (!parsed.dryRun) {
				assertFileRuntime(options);
				requireWriteContext(parsed);
				result = withTaskInProgressMutation(
					projectRoot,
					parsed.session,
					parsed.taskId,
					() => runUndoMutation(parsed, projectRoot),
					mutationOptions,
				);
			} else {
				result = runUndoMutation(parsed, projectRoot);
			}
		} else if (rawCommand === "ar" || rawCommand === "archive") {
			const parsed = applyProjectMutationDefaults(
				parseArchiveArgs(rest),
				projectRoot,
			);
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file archive requires local interactive approval");
			}
			if (!parsed.dryRun) {
				assertFileRuntime(options);
				requireWriteContext(parsed);
				result = withTaskInProgressMutation(
					projectRoot,
					parsed.session,
					parsed.taskId,
					() => runArchiveMutation(parsed, projectRoot),
					mutationOptions,
				);
			} else {
				result = runArchiveMutation(parsed, projectRoot);
			}
			asJson = parsed.json;
		} else {
			throw new Error(`Unknown file command: ${rawCommand}`);
		}

		outputResult(result, io, asJson);
		return result.status === "blocked" ? 4 : 0;
	} catch (error) {
		const message = `for file command: ${(error as Error).message}`;
		if (args.includes("--json") || args.includes("-j")) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("FILE_ERROR", message, { action: "file", exitCode: 2 }),
				),
			);
		} else io.stderr(message);
		return 2;
	}
}
