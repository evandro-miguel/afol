import {
	assertMutationJournalIntegrity,
	findLatestSupportedMutation,
	findMutationById,
	type MutationRecord,
	withMutationJournalLock,
} from "../../../services/mutations/journal";
import {
	type CommandResult,
	makeUnsupportedUndoResult,
	type UndoArgs,
} from "../shared";
import { undoArchiveMutation } from "./archive";
import { undoMoveMutation } from "./move";
import { undoPatchMutation } from "./patch";

export function runUndoMutation(
	args: UndoArgs,
	projectRoot: string,
): CommandResult {
	return withMutationJournalLock(projectRoot, () =>
		runUndoMutationLocked(args, projectRoot),
	);
}

function runUndoMutationLocked(
	args: UndoArgs,
	projectRoot: string,
): CommandResult {
	assertMutationJournalIntegrity(projectRoot);
	let target: MutationRecord | null;
	try {
		target = args.mutationId
			? findMutationById(projectRoot, args.mutationId)
			: findLatestSupportedMutation(projectRoot, args.session, args.taskId);
	} catch (error) {
		if ((error as Error).message.startsWith("already-undone:")) {
			return {
				command: "ud",
				status: "blocked",
				dry_run: args.dryRun,
				session: args.session,
				task_id: args.taskId,
				reason: args.reason,
				path: "",
				target_mutation_id: args.mutationId,
				message: (error as Error).message,
			};
		}
		throw error;
	}

	if (!target) {
		return {
			command: "ud",
			status: "noop",
			dry_run: args.dryRun,
			session: args.session,
			task_id: args.taskId,
			reason: args.reason,
			path: "",
			target_mutation_id: args.mutationId,
			message: args.mutationId
				? `No mutation found for id ${args.mutationId}`
				: "No supported mutation found for session/task",
		};
	}

	if (args.dryRun) {
		if (target.kind === "patch") {
			return undoPatchMutation(args, target, projectRoot);
		}
		if (target.kind === "move") {
			return undoMoveMutation(args, target, projectRoot);
		}
		return makeUnsupportedUndoResult(args, target);
	}

	if (
		args.mutationId &&
		(target.session !== args.session || target.taskId !== args.taskId)
	) {
		throw new Error(
			`Undo target session/task mismatch: expected ${target.session}/${target.taskId}, got ${args.session}/${args.taskId}`,
		);
	}

	if (target.kind === "patch") {
		return undoPatchMutation(args, target, projectRoot);
	}

	if (target.kind === "move") {
		return undoMoveMutation(args, target, projectRoot);
	}

	if (target.kind === "archive") {
		return undoArchiveMutation(args, target, projectRoot);
	}

	return makeUnsupportedUndoResult(args, target);
}
