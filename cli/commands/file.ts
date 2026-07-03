import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { assertTaskInProgress } from "../services/workbench/lifecycle";
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

export async function runFileCommand(
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		const [rawCommand, ...rest] = args;
		if (!rawCommand) {
			throw new Error("Missing file subcommand: pt|mv|ud|ar");
		}

		let asJson = false;
		let result: CommandResult;

		if (rawCommand === "pt" || rawCommand === "patch") {
			const parsed = applyProjectMutationDefaults(
				parsePatchArgs(rest),
				projectRoot,
			);
			// Restricted callers may inspect dry-run mutation plans, but real writes require local approval.
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file patch requires local interactive approval");
			}
			if (!parsed.dryRun) {
				requireWriteContext(parsed);
				assertTaskInProgress(projectRoot, parsed.session, parsed.taskId);
			}
			asJson = parsed.json;
			result = runPatchMutation(parsed, projectRoot);
		} else if (rawCommand === "mv" || rawCommand === "move") {
			const parsed = applyProjectMutationDefaults(
				parseMoveArgs(rest),
				projectRoot,
			);
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file move requires local interactive approval");
			}
			if (!parsed.dryRun) {
				requireWriteContext(parsed);
				assertTaskInProgress(projectRoot, parsed.session, parsed.taskId);
			}
			asJson = parsed.json;
			result = runMoveMutation(parsed, projectRoot);
		} else if (rawCommand === "ud" || rawCommand === "undo") {
			const parsed = parseUndoArgs(rest);
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file undo requires local interactive approval");
			}
			asJson = parsed.json;
			if (!parsed.dryRun) {
				requireWriteContext(parsed);
				assertTaskInProgress(projectRoot, parsed.session, parsed.taskId);
			}
			result = runUndoMutation(parsed, projectRoot);
		} else if (rawCommand === "ar" || rawCommand === "archive") {
			const parsed = applyProjectMutationDefaults(
				parseArchiveArgs(rest),
				projectRoot,
			);
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file archive requires local interactive approval");
			}
			if (!parsed.dryRun) {
				requireWriteContext(parsed);
				assertTaskInProgress(projectRoot, parsed.session, parsed.taskId);
			}
			asJson = parsed.json;
			result = runArchiveMutation(parsed, projectRoot);
		} else {
			throw new Error(`Unknown file command: ${rawCommand}`);
		}

		outputResult(result, io, asJson);
		return result.status === "blocked" ? 4 : 0;
	} catch (error) {
		io.stderr(`for file command: ${(error as Error).message}`);
		return 2;
	}
}
