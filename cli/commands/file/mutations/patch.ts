import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
	appendMutationRecord,
	createMutationId,
	type MutationRecord,
} from "../../../services/mutations/journal";
import {
	backupPath,
	type CommandArgs,
	type CommandResult,
	isBinaryPatchTarget,
	makeDiffPreview,
	normalizeHash,
	type PatchArgs,
	readTextOrEmpty,
	requireWriteContext,
	resolveSafePath,
} from "../shared";

type PatchUndoMutation = MutationRecord & {
	kind: "patch";
	backupPath?: string | null | undefined;
};

function buildUndoPatchDryRunResult(
	args: CommandArgs,
	mutation: MutationRecord,
	projectRoot: string,
	reason: string,
): CommandResult {
	const patchMutation = mutation as PatchUndoMutation;
	const target = resolveSafePath(projectRoot, patchMutation.sourcePath);
	const backupPathValue = patchMutation.backupPath ?? "";
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
		path: patchMutation.sourcePath,
		destination: patchMutation.sourcePath,
		target_mutation_id: patchMutation.id,
		before_hash: before.length > 0 ? normalizeHash(before) : null,
		after_hash: after.length > 0 ? normalizeHash(after) : null,
		backup_path: patchMutation.backupPath ?? null,
		diff_preview: makeDiffPreview(before, after, target.relativePath),
	};
}

function applyUndoPatchMutation(
	args: CommandArgs,
	mutation: MutationRecord,
	projectRoot: string,
	reason: string,
): CommandResult {
	const patchMutation = mutation as PatchUndoMutation;
	const target = resolveSafePath(projectRoot, patchMutation.sourcePath);
	const backupPathValue = patchMutation.backupPath ?? "";
	const before = existsSync(target.path) ? readTextOrEmpty(target.path) : "";
	const beforeHash = before.length > 0 ? normalizeHash(before) : null;

	if (backupPathValue && existsSync(backupPathValue)) {
		cpSync(backupPathValue, target.path);
	} else if (existsSync(target.path)) {
		rmSync(target.path);
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
		reason: `undo ${patchMutation.id}`,
		targetMutationId: patchMutation.id,
		sourcePath: patchMutation.sourcePath,
		destinationPath: patchMutation.sourcePath,
	});

	return {
		command: "ud",
		status: "write",
		dry_run: false,
		session: args.session,
		task_id: args.taskId,
		reason,
		path: patchMutation.sourcePath,
		destination: patchMutation.sourcePath,
		target_mutation_id: patchMutation.id,
		before_hash: beforeHash,
		after_hash: afterHash,
		backup_path: patchMutation.backupPath ?? null,
		diff_preview: makeDiffPreview(before, after, target.relativePath),
	};
}

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

export function undoPatchMutation(
	args: CommandArgs,
	mutation: MutationRecord,
	projectRoot: string,
): CommandResult {
	if (!mutation.sourcePath || mutation.kind !== "patch") {
		throw new Error(`Expected patch mutation for undo, got ${mutation.kind}`);
	}

	const reason = args.reason || `undo ${mutation.id}`;
	if (args.dryRun) {
		return buildUndoPatchDryRunResult(args, mutation, projectRoot, reason);
	}

	return applyUndoPatchMutation(args, mutation, projectRoot, reason);
}
