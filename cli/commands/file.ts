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
			asJson = parsed.json;
			result = runPatchMutation(parsed, projectRoot);
		} else if (rawCommand === "mv" || rawCommand === "move") {
			const parsed = applyProjectMutationDefaults(
				parseMoveArgs(rest),
				projectRoot,
			);
			asJson = parsed.json;
			result = runMoveMutation(parsed, projectRoot);
		} else if (rawCommand === "ud" || rawCommand === "undo") {
			const parsed = parseUndoArgs(rest);
			asJson = parsed.json;
			if (!parsed.dryRun) {
				requireWriteContext(parsed);
			}
			result = runUndoMutation(parsed, projectRoot);
		} else if (rawCommand === "ar" || rawCommand === "archive") {
			const parsed = applyProjectMutationDefaults(
				parseArchiveArgs(rest),
				projectRoot,
			);
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
