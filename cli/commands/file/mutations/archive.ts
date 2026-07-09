import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
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
	looksBinary,
	makeDiffPreview,
	makeMovePreview,
	normalizeHash,
	requireWriteContext,
	resolveSafePath,
} from "../shared";

function readFileBytes(path: string): Buffer {
	return existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
}

function textPreview(bytes: Buffer): string | undefined {
	return looksBinary(bytes) ? undefined : bytes.toString("utf8");
}

export function runArchiveMutation(
	args: CommandArgs,
	projectRoot: string,
): CommandResult {
	const source = resolveSafePath(projectRoot, args.path);
	const sourceExists = existsSync(source.path);
	const mutationId = createMutationId();
	const destination = archiveDestination(
		projectRoot,
		mutationId,
		source.relativePath,
	);
	const beforeBytes = readFileBytes(source.path);
	const beforeHash = sourceExists ? normalizeHash(beforeBytes) : null;
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
		const beforeSourceBytes = readFileBytes(source.path);
		const beforeDestinationBytes = readFileBytes(destination.path);
		const sourceExists = existsSync(source.path);
		const destinationExists = existsSync(destination.path);
		const beforeSourceText = textPreview(beforeSourceBytes);
		const beforeDestinationText = textPreview(beforeDestinationBytes);

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
			before_hash: destinationExists
				? normalizeHash(beforeDestinationBytes)
				: null,
			after_hash: sourceExists ? normalizeHash(beforeSourceBytes) : null,
			diff_preview:
				beforeDestinationText !== undefined && beforeSourceText !== undefined
					? makeDiffPreview(
							beforeDestinationText,
							beforeSourceText,
							mutation.sourcePath,
						)
					: undefined,
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

	const beforeDestinationBytes = readFileBytes(destination.path);
	const beforeDestinationText = textPreview(beforeDestinationBytes);
	const beforeDestinationHash = normalizeHash(beforeDestinationBytes);

	mkdirSync(dirname(source.path), { recursive: true });
	renameSync(destination.path, source.path);

	const afterSourceBytes = readFileBytes(source.path);
	const afterSourceText = textPreview(afterSourceBytes);
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
		after_hash: normalizeHash(afterSourceBytes),
		diff_preview:
			beforeDestinationText !== undefined && afterSourceText !== undefined
				? makeDiffPreview(
						beforeDestinationText,
						afterSourceText,
						mutation.sourcePath,
					)
				: undefined,
	};
}
