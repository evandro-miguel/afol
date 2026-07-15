import { envelopeErr, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
	resolveCanonicalAction,
} from "../core/operation-context";
import { withExternalPathLock } from "../services/io/session-lock";
import { resolveProjectWritePath } from "../services/project/root";
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
	isProtectedResourcePath,
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

function assertFileOperandAdmission(projectRoot: string, path: string): void {
	const resolved = resolveProjectWritePath(projectRoot, path);
	if (!resolved.ok) {
		if (resolved.error.includes("symlink")) {
			throw new Error(`protected-path:${path}`);
		}
		throw new Error(resolved.error);
	}
	if (isProtectedResourcePath(resolved.value.relativePath)) {
		throw new Error(`protected-path:${path}`);
	}
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
			assertFileOperandAdmission(projectRoot, parsed.path);
			// Restricted callers may inspect dry-run mutation plans, but real writes require local approval.
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file patch requires local interactive approval");
			}
			if (!parsed.dryRun) {
				assertFileRuntime(options);
				requireWriteContext(parsed);
				result = await withExternalPathLock(projectRoot, async () =>
					withTaskInProgressMutation(
						projectRoot,
						parsed.session,
						parsed.taskId,
						() => runPatchMutation(parsed, projectRoot),
						mutationOptions,
					),
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
			assertFileOperandAdmission(projectRoot, parsed.path);
			assertFileOperandAdmission(projectRoot, parsed.destinationPath);
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file move requires local interactive approval");
			}
			if (!parsed.dryRun) {
				assertFileRuntime(options);
				requireWriteContext(parsed);
				result = await withExternalPathLock(projectRoot, async () =>
					withTaskInProgressMutation(
						projectRoot,
						parsed.session,
						parsed.taskId,
						() => runMoveMutation(parsed, projectRoot),
						mutationOptions,
					),
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
				result = await withExternalPathLock(projectRoot, async () =>
					withTaskInProgressMutation(
						projectRoot,
						parsed.session,
						parsed.taskId,
						() => runUndoMutation(parsed, projectRoot),
						mutationOptions,
					),
				);
			} else {
				result = runUndoMutation(parsed, projectRoot);
			}
		} else if (rawCommand === "ar" || rawCommand === "archive") {
			const parsed = applyProjectMutationDefaults(
				parseArchiveArgs(rest),
				projectRoot,
			);
			assertFileOperandAdmission(projectRoot, parsed.path);
			if (!parsed.dryRun && requiresApproval(ctx)) {
				throw new Error("file archive requires local interactive approval");
			}
			if (!parsed.dryRun) {
				assertFileRuntime(options);
				requireWriteContext(parsed);
				result = await withExternalPathLock(projectRoot, async () =>
					withTaskInProgressMutation(
						projectRoot,
						parsed.session,
						parsed.taskId,
						() => runArchiveMutation(parsed, projectRoot),
						mutationOptions,
					),
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
		const errorMessage = (error as Error).message;
		if (requiresApproval(ctx) && errorMessage.startsWith("protected-path:")) {
			const policy = resolveCanonicalAction({ kind: "file", args });
			const action = policy?.action ?? "file";
			const message = `${action} requires local interactive approval`;
			if (args.includes("--json") || args.includes("-j")) {
				io.stdout(
					stringifyEnvelope(
						envelopeErr("approval-required", message, {
							action,
							exitCode: 2,
						}),
					),
				);
			} else io.stderr(`err approval-required ${message}`);
			return 2;
		}
		const message = `for file command: ${errorMessage}`;
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
