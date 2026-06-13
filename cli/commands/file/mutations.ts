import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
	appendMutationRecord,
	createMutationId,
	findLatestSupportedMutation,
	findMutationById,
	type MutationRecord,
} from "../../services/mutations/journal";
import {
	archiveDestination,
	backupPath,
	type CommandArgs,
	type CommandResult,
	isBinaryPatchTarget,
	type MoveArgs,
	makeDiffPreview,
	makeMovePreview,
	normalizeHash,
	type PatchArgs,
	readTextOrEmpty,
	requireWriteContext,
	resolveSafePath,
	type UndoArgs,
} from "./shared";

export function runPatchMutation(
	args: PatchArgs,
	projectRoot: string,
): CommandResult {
	const resolved = resolveSafePath(projectRoot, args.path);
	if (isBinaryPatchTarget(resolved.path)) {
		return {
			command: "pt",
			status: "blocked",
			dry_run: args.dryRun,
			session: args.session,
			task_id: args.taskId,
			reason: args.reason,
			path: resolved.relativePath,
			message: `Patch blocked: binary target: ${resolved.relativePath}`,
		};
	}
	const before = readTextOrEmpty(resolved.path);
	const appendText = args.appendText;
	const after = `${before}${appendText}`;
	const mutationId = createMutationId();
	const beforeHash = normalizeHash(before);
	const afterHash = normalizeHash(after);
	const diffPreview = makeDiffPreview(before, after, resolved.relativePath);

	if (args.dryRun) {
		return {
			command: "pt",
			status: "dry-run",
			dry_run: true,
			session: args.session,
			task_id: args.taskId,
			reason: args.reason,
			path: resolved.relativePath,
			mutation_id: mutationId,
			before_hash: beforeHash,
			after_hash: afterHash,
			diff_preview: diffPreview,
		};
	}

	if (before === after) {
		return {
			command: "pt",
			status: "noop",
			dry_run: false,
			session: args.session,
			task_id: args.taskId,
			reason: args.reason,
			path: resolved.relativePath,
			mutation_id: mutationId,
			before_hash: beforeHash,
			after_hash: afterHash,
		};
	}

	requireWriteContext(args);
	mkdirSync(dirname(resolved.path), { recursive: true });

	let backupPathValue: string | undefined;
	if (existsSync(resolved.path)) {
		backupPathValue = backupPath(
			projectRoot,
			mutationId,
			resolved.relativePath,
		);
		cpSync(resolved.path, backupPathValue);
	}

	writeFileSync(resolved.path, after, "utf8");

	appendMutationRecord(projectRoot, {
		id: mutationId,
		ts: new Date().toISOString(),
		kind: "patch",
		status: "applied",
		dryRun: false,
		session: args.session,
		taskId: args.taskId,
		reason: args.reason,
		sourcePath: resolved.relativePath,
		beforeHash,
		afterHash,
		backupPath: backupPathValue ?? null,
		beforeExisted: before.length > 0,
		...(diffPreview ? { diffPreview } : {}),
	});

	return {
		command: "pt",
		status: "write",
		dry_run: false,
		session: args.session,
		task_id: args.taskId,
		reason: args.reason,
		path: resolved.relativePath,
		mutation_id: mutationId,
		before_hash: beforeHash,
		after_hash: afterHash,
		backup_path: backupPathValue ?? null,
		diff_preview: diffPreview,
	};
}

export function runMoveMutation(
	args: MoveArgs,
	projectRoot: string,
): CommandResult {
	const source = resolveSafePath(projectRoot, args.path);
	const destination = resolveSafePath(projectRoot, args.destinationPath);
	const diffPreview = makeMovePreview(
		source.relativePath,
		destination.relativePath,
	);
	const mutationId = createMutationId();

	if (args.dryRun) {
		return {
			command: "mv",
			status: "dry-run",
			dry_run: true,
			session: args.session,
			task_id: args.taskId,
			reason: args.reason,
			path: source.relativePath,
			destination: destination.relativePath,
			mutation_id: mutationId,
			diff_preview: diffPreview,
		};
	}

	if (source.relativePath === destination.relativePath) {
		return {
			command: "mv",
			status: "noop",
			dry_run: false,
			session: args.session,
			task_id: args.taskId,
			reason: args.reason,
			path: source.relativePath,
			destination: destination.relativePath,
			mutation_id: mutationId,
		};
	}

	if (!existsSync(source.path)) {
		throw new Error(`Source file not found: ${source.relativePath}`);
	}

	requireWriteContext(args);

	const beforeSource = readFileSync(source.path, "utf8");
	const destinationExisted = existsSync(destination.path);
	const beforeHash = normalizeHash(beforeSource);
	let overwrittenBackupPath: string | undefined;
	if (destinationExisted) {
		overwrittenBackupPath = backupPath(
			projectRoot,
			mutationId,
			`${destination.relativePath}.overwritten`,
		);
		cpSync(destination.path, overwrittenBackupPath);
	}

	mkdirSync(dirname(destination.path), { recursive: true });
	renameSync(source.path, destination.path);
	const after = readTextOrEmpty(destination.path);

	appendMutationRecord(projectRoot, {
		id: mutationId,
		ts: new Date().toISOString(),
		kind: "move",
		status: "applied",
		dryRun: false,
		session: args.session,
		taskId: args.taskId,
		reason: args.reason,
		sourcePath: source.relativePath,
		destinationPath: destination.relativePath,
		beforeHash,
		afterHash: normalizeHash(after),
		destinationExisted,
		overwrittenBackupPath: overwrittenBackupPath ?? null,
		diffPreview,
	});

	return {
		command: "mv",
		status: "write",
		dry_run: false,
		session: args.session,
		task_id: args.taskId,
		reason: args.reason,
		path: source.relativePath,
		destination: destination.relativePath,
		mutation_id: mutationId,
		before_hash: beforeHash,
		after_hash: normalizeHash(after),
		overwritten_backup_path: overwrittenBackupPath ?? null,
		diff_preview: diffPreview,
	};
}

function undoPatchMutation(
	args: CommandArgs,
	mutation: MutationRecord,
	projectRoot: string,
): CommandResult {
	if (!mutation.sourcePath || mutation.kind !== "patch") {
		throw new Error(`Expected patch mutation for undo, got ${mutation.kind}`);
	}

	const reason = args.reason || `undo ${mutation.id}`;
	if (args.dryRun) {
		const target = resolveSafePath(projectRoot, mutation.sourcePath);
		const backupPathValue = mutation.backupPath ?? "";
		const before = existsSync(target.path) ? readTextOrEmpty(target.path) : "";
		const after =
			backupPathValue && existsSync(backupPathValue)
				? readTextOrEmpty(backupPathValue)
				: "";
		return {
			command: "ud",
			status: "dry-run",
			dry_run: true,
			session: args.session,
			task_id: args.taskId,
			reason,
			path: mutation.sourcePath,
			destination: mutation.sourcePath,
			target_mutation_id: mutation.id,
			before_hash: before.length > 0 ? normalizeHash(before) : null,
			after_hash: after.length > 0 ? normalizeHash(after) : null,
			backup_path: mutation.backupPath ?? null,
			diff_preview: makeDiffPreview(before, after, target.relativePath),
		};
	}

	const target = resolveSafePath(projectRoot, mutation.sourcePath);
	const backupPathValue = mutation.backupPath ?? "";
	const before = existsSync(target.path) ? readTextOrEmpty(target.path) : "";
	const beforeHash = before.length > 0 ? normalizeHash(before) : null;

	if (backupPathValue && existsSync(backupPathValue)) {
		cpSync(backupPathValue, target.path);
	} else {
		if (existsSync(target.path)) {
			rmSync(target.path);
		}
	}

	const after = existsSync(target.path) ? readTextOrEmpty(target.path) : "";
	const afterHash = after.length > 0 ? normalizeHash(after) : null;
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
		destinationPath: mutation.sourcePath,
	});

	return {
		command: "ud",
		status: "write",
		dry_run: false,
		session: args.session,
		task_id: args.taskId,
		reason,
		path: mutation.sourcePath,
		destination: mutation.sourcePath,
		target_mutation_id: mutation.id,
		before_hash: beforeHash,
		after_hash: afterHash,
		backup_path: mutation.backupPath ?? null,
		diff_preview: makeDiffPreview(before, after, target.relativePath),
	};
}

function undoMoveMutation(
	args: CommandArgs,
	mutation: MutationRecord,
	projectRoot: string,
): CommandResult {
	if (
		mutation.kind !== "move" ||
		!mutation.sourcePath ||
		!mutation.destinationPath
	) {
		throw new Error(`Expected move mutation for undo, got ${mutation.kind}`);
	}

	const reason = args.reason || `undo ${mutation.id}`;
	if (args.dryRun) {
		const source = resolveSafePath(projectRoot, mutation.sourcePath);
		const destination = resolveSafePath(projectRoot, mutation.destinationPath);
		const beforeSource = existsSync(source.path)
			? readTextOrEmpty(source.path)
			: "";
		const beforeDestination = existsSync(destination.path)
			? readTextOrEmpty(destination.path)
			: "";
		const afterSource = existsSync(destination.path)
			? readTextOrEmpty(destination.path)
			: "";
		const afterDestination =
			mutation.overwrittenBackupPath &&
			existsSync(mutation.overwrittenBackupPath)
				? readTextOrEmpty(mutation.overwrittenBackupPath)
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
			before_hash: beforeSource.length > 0 ? normalizeHash(beforeSource) : null,
			after_hash: afterSource.length > 0 ? normalizeHash(afterSource) : null,
			diff_preview: makeDiffPreview(
				beforeDestination,
				afterDestination,
				mutation.destinationPath,
			),
		};
	}

	const source = resolveSafePath(projectRoot, mutation.sourcePath);
	const destination = resolveSafePath(projectRoot, mutation.destinationPath);

	const beforeSource = existsSync(source.path)
		? readTextOrEmpty(source.path)
		: "";
	const beforeDestination = existsSync(destination.path)
		? readTextOrEmpty(destination.path)
		: "";
	const beforeSourceHash =
		beforeSource.length > 0 ? normalizeHash(beforeSource) : null;

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

	if (existsSync(destination.path)) {
		mkdirSync(dirname(source.path), { recursive: true });
		renameSync(destination.path, source.path);
	} else {
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

	if (
		mutation.overwrittenBackupPath &&
		existsSync(mutation.overwrittenBackupPath)
	) {
		mkdirSync(dirname(destination.path), { recursive: true });
		cpSync(mutation.overwrittenBackupPath, destination.path);
	}

	const afterSource = existsSync(source.path)
		? readTextOrEmpty(source.path)
		: "";
	const afterDestination = existsSync(destination.path)
		? readTextOrEmpty(destination.path)
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
		before_hash: beforeSourceHash,
		after_hash: afterSource.length > 0 ? normalizeHash(afterSource) : null,
		diff_preview: makeDiffPreview(
			beforeDestination,
			afterDestination,
			mutation.destinationPath,
		),
	};
}

function undoArchiveMutation(
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
