import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
} from "node:fs";
import { dirname } from "node:path";
import {
	appendMutationRecord,
	createMutationId,
	type MutationRecord,
} from "../../../services/mutations/journal";
import {
	backupPath,
	type CommandResult,
	type MoveArgs,
	makeDiffPreview,
	makeMovePreview,
	normalizeHash,
	readTextOrEmpty,
	requireWriteContext,
	resolveJournalBackupPath,
	resolveSafePath,
} from "../shared";

type MoveUndoMutation = MutationRecord & {
	kind: "move";
	sourcePath: string;
	destinationPath: string;
	overwrittenBackupPath?: string | null | undefined;
};

function buildUndoMoveDryRunResult(
	args: { dryRun: boolean; session: string; taskId: string; reason: string },
	mutation: MutationRecord,
	projectRoot: string,
	reason: string,
): CommandResult {
	const moveMutation = mutation as MoveUndoMutation;
	const source = resolveSafePath(projectRoot, moveMutation.sourcePath);
	const destination = resolveSafePath(
		projectRoot,
		moveMutation.destinationPath,
	);
	const beforeSource = existsSync(source.path)
		? readTextOrEmpty(source.path)
		: "";
	const beforeDestination = existsSync(destination.path)
		? readTextOrEmpty(destination.path)
		: "";
	const afterSource = existsSync(destination.path)
		? readTextOrEmpty(destination.path)
		: "";
	const overwrittenBackupPath = resolveJournalBackupPath(
		projectRoot,
		moveMutation.overwrittenBackupPath,
	);
	const afterDestination =
		overwrittenBackupPath && existsSync(overwrittenBackupPath)
			? readTextOrEmpty(overwrittenBackupPath)
			: "";

	return {
		command: "ud",
		status: "dry-run",
		dry_run: true,
		session: args.session,
		task_id: args.taskId,
		reason,
		path: moveMutation.sourcePath,
		destination: moveMutation.destinationPath,
		target_mutation_id: moveMutation.id,
		before_hash: beforeSource.length > 0 ? normalizeHash(beforeSource) : null,
		after_hash: afterSource.length > 0 ? normalizeHash(afterSource) : null,
		diff_preview: makeDiffPreview(
			beforeDestination,
			afterDestination,
			moveMutation.destinationPath,
		),
	};
}

function applyUndoMoveMutation(
	args: { dryRun: boolean; session: string; taskId: string; reason: string },
	mutation: MutationRecord,
	projectRoot: string,
	reason: string,
): CommandResult {
	const moveMutation = mutation as MoveUndoMutation;
	const source = resolveSafePath(projectRoot, moveMutation.sourcePath);
	const destination = resolveSafePath(
		projectRoot,
		moveMutation.destinationPath,
	);

	const beforeSource = existsSync(source.path)
		? readTextOrEmpty(source.path)
		: "";
	const beforeDestination = existsSync(destination.path)
		? readTextOrEmpty(destination.path)
		: "";
	const beforeSourceHash =
		beforeSource.length > 0 ? normalizeHash(beforeSource) : null;
	const overwrittenBackupPath = resolveJournalBackupPath(
		projectRoot,
		moveMutation.overwrittenBackupPath,
	);

	if (existsSync(source.path)) {
		return {
			command: "ud",
			status: "blocked",
			dry_run: false,
			session: args.session,
			task_id: args.taskId,
			reason,
			path: moveMutation.sourcePath,
			destination: moveMutation.destinationPath,
			target_mutation_id: moveMutation.id,
			message: `Undo blocked: source already exists: ${moveMutation.sourcePath}`,
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
			path: moveMutation.sourcePath,
			destination: moveMutation.destinationPath,
			target_mutation_id: moveMutation.id,
			message: `Undo blocked: destination missing for ${moveMutation.destinationPath}`,
		};
	}

	mkdirSync(dirname(source.path), { recursive: true });
	renameSync(destination.path, source.path);

	if (overwrittenBackupPath && existsSync(overwrittenBackupPath)) {
		mkdirSync(dirname(destination.path), { recursive: true });
		cpSync(overwrittenBackupPath, destination.path);
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
		reason: `undo ${moveMutation.id}`,
		targetMutationId: moveMutation.id,
		sourcePath: moveMutation.sourcePath,
		destinationPath: moveMutation.destinationPath,
	});

	return {
		command: "ud",
		status: "write",
		dry_run: false,
		session: args.session,
		task_id: args.taskId,
		reason,
		path: moveMutation.sourcePath,
		destination: moveMutation.destinationPath,
		target_mutation_id: moveMutation.id,
		before_hash: beforeSourceHash,
		after_hash: afterSource.length > 0 ? normalizeHash(afterSource) : null,
		diff_preview: makeDiffPreview(
			beforeDestination,
			afterDestination,
			moveMutation.destinationPath,
		),
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

export function undoMoveMutation(
	args: { dryRun: boolean; session: string; taskId: string; reason: string },
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
		return buildUndoMoveDryRunResult(args, mutation, projectRoot, reason);
	}

	return applyUndoMoveMutation(args, mutation, projectRoot, reason);
}
