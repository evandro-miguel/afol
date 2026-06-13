import {
	findLatestSupportedMutation,
	findMutationById,
} from "../../../services/mutations/journal";
import type { CommandResult, UndoArgs } from "../shared";
import { undoArchiveMutation } from "./archive";
import { undoMoveMutation } from "./move";
import { undoPatchMutation } from "./patch";

export function runUndoMutation(
	args: UndoArgs,
	projectRoot: string,
): CommandResult {
	const target = args.mutationId
		? findMutationById(projectRoot, args.mutationId)
		: findLatestSupportedMutation(projectRoot, args.session, args.taskId);

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
		return {
			command: "ud",
			status: "blocked",
			dry_run: true,
			session: args.session,
			task_id: args.taskId,
			reason: args.reason,
			path: target.sourcePath,
			target_mutation_id: target.id,
			message: `Unsupported mutation kind: ${target.kind}`,
		};
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

	return {
		command: "ud",
		status: "blocked",
		dry_run: false,
		session: args.session,
		task_id: args.taskId,
		reason: args.reason,
		path: target.sourcePath,
		target_mutation_id: target.id,
		message: `Unsupported mutation kind: ${target.kind}`,
	};
}
