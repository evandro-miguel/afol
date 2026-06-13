import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import {
	appendMutationRecord,
	createMutationId,
	type MutationRecord,
} from "../../../services/mutations/journal";
import {
	archiveDestination,
	type CommandArgs,
	type CommandResult,
	makeDiffPreview,
	makeMovePreview,
	normalizeHash,
	readTextOrEmpty,
	requireWriteContext,
	resolveSafePath,
} from "../shared";

export function runArchiveMutation(
	args: CommandArgs,
	projectRoot: string,
): CommandResult {
	const source = resolveSafePath(projectRoot, args.path);
	const mutationId = createMutationId();
	const destination = archiveDestination(
		projectRoot,
		mutationId,
		source.relativePath,
	);
	const before = existsSync(source.path) ? readTextOrEmpty(source.path) : "";
	const beforeHash = before.length > 0 ? normalizeHash(before) : null;
	const diffPreview = makeMovePreview(
		source.relativePath,
		destination.relativePath,
	);

	if (args.dryRun) {
		return {
			command: "ar",
			status: "dry-run",
			dry_run: true,
			session: args.session,
			task_id: args.taskId,
			reason: args.reason,
			path: source.relativePath,
			destination: destination.relativePath,
			mutation_id: mutationId,
			before_hash: beforeHash,
			after_hash: beforeHash,
			diff_preview: diffPreview,
		};
	}

	if (!existsSync(source.path)) {
		return {
			command: "ar",
			status: "noop",
			dry_run: false,
			session: args.session,
			task_id: args.taskId,
			reason: args.reason,
			path: source.relativePath,
			destination: destination.relativePath,
			mutation_id: mutationId,
			before_hash: beforeHash,
			after_hash: beforeHash,
		};
	}

	requireWriteContext(args);
	mkdirSync(dirname(destination.path), { recursive: true });
	renameSync(source.path, destination.path);

	appendMutationRecord(projectRoot, {
		id: mutationId,
		ts: new Date().toISOString(),
		kind: "archive",
		status: "applied",
		dryRun: false,
		session: args.session,
		taskId: args.taskId,
		reason: args.reason,
		sourcePath: source.relativePath,
		destinationPath: destination.relativePath,
		beforeHash,
		afterHash: beforeHash,
		backupPath: destination.path,
		diffPreview,
	});

	return {
		command: "ar",
		status: "write",
		dry_run: false,
		session: args.session,
		task_id: args.taskId,
		reason: args.reason,
		path: source.relativePath,
		destination: destination.relativePath,
		mutation_id: mutationId,
		before_hash: beforeHash,
		after_hash: beforeHash,
		backup_path: destination.path,
		diff_preview: diffPreview,
	};
}

export function undoArchiveMutation(
	args: CommandArgs,
	mutation: MutationRecord,
	projectRoot: string,
): CommandResult {
	if (
		mutation.kind !== "archive" ||
		!mutation.sourcePath ||
		!mutation.destinationPath
	) {
		throw new Error(`Expected archive mutation for undo, got ${mutation.kind}`);
	}

	const reason = args.reason || `undo ${mutation.id}`;
	const source = resolveSafePath(projectRoot, mutation.sourcePath);
	const destination = resolveSafePath(projectRoot, mutation.destinationPath);

	if (args.dryRun) {
		const beforeSource = existsSync(source.path)
			? readTextOrEmpty(source.path)
			: "";
		const beforeDestination = existsSync(destination.path)
			? readTextOrEmpty(destination.path)
			: "";

		return {
			command: "ud",
			status: "dry-run",
			dry_run: true,
			session: args.session,
			task_id: args.taskId,
			reason,
			path: mutation.sourcePath,
			destination: mutation.destinationPath,
			target_mutation_id: mutation.id,
			before_hash:
				beforeDestination.length > 0 ? normalizeHash(beforeDestination) : null,
			after_hash: beforeSource.length > 0 ? normalizeHash(beforeSource) : null,
			diff_preview: makeDiffPreview(
				beforeDestination,
				beforeSource,
				mutation.sourcePath,
			),
		};
	}

	if (existsSync(source.path)) {
		return {
			command: "ud",
			status: "blocked",
			dry_run: false,
			session: args.session,
			task_id: args.taskId,
			reason,
			path: mutation.sourcePath,
			destination: mutation.destinationPath,
			target_mutation_id: mutation.id,
			message: `Undo blocked: source already exists: ${mutation.sourcePath}`,
		};
	}

	if (!existsSync(destination.path)) {
		return {
			command: "ud",
			status: "blocked",
			dry_run: false,
			session: args.session,
			task_id: args.taskId,
			reason,
			path: mutation.sourcePath,
			destination: mutation.destinationPath,
			target_mutation_id: mutation.id,
			message: `Undo blocked: destination missing for ${mutation.destinationPath}`,
		};
	}

	const beforeDestination = readTextOrEmpty(destination.path);
	const beforeDestinationHash =
		beforeDestination.length > 0 ? normalizeHash(beforeDestination) : null;

	mkdirSync(dirname(source.path), { recursive: true });
	renameSync(destination.path, source.path);

	const afterSource = existsSync(source.path)
		? readTextOrEmpty(source.path)
		: "";
	const mutationId = createMutationId();

	appendMutationRecord(projectRoot, {
		id: mutationId,
		ts: new Date().toISOString(),
		kind: "undo",
		status: "applied",
		dryRun: false,
		session: args.session,
		taskId: args.taskId,
		reason: `undo ${mutation.id}`,
		targetMutationId: mutation.id,
		sourcePath: mutation.sourcePath,
		destinationPath: mutation.destinationPath,
	});

	return {
		command: "ud",
		status: "write",
		dry_run: false,
		session: args.session,
		task_id: args.taskId,
		reason,
		path: mutation.sourcePath,
		destination: mutation.destinationPath,
		target_mutation_id: mutation.id,
		before_hash: beforeDestinationHash,
		after_hash: afterSource.length > 0 ? normalizeHash(afterSource) : null,
		diff_preview: makeDiffPreview(
			beforeDestination,
			afterSource,
			mutation.sourcePath,
		),
	};
}
