import { cpSync, existsSync, rmSync } from "node:fs";
import { atomicWriteText } from "../../../services/io/atomic";
import { withResourceLocks } from "../../../services/io/session-lock";
import {
	appendMutationRecord,
	assertMutationJournalIntegrity,
	createMutationId,
	type MutationRecord,
	withMutationJournalLock,
} from "../../../services/mutations/journal";
import {
	backupPath,
	type CommandArgs,
	type CommandResult,
	isBinaryPatchTarget,
	makeDiffPreview,
	normalizeHash,
	type PatchArgs,
	readJournalBackupBytes,
	readTextOrEmpty,
	requireWriteContext,
	resolveJournalBackupPath,
	resolveSafePath,
} from "../shared";

type PatchUndoMutation = MutationRecord & {
	kind: "patch";
	backupPath?: string | null | undefined;
};

function patchUndoStateIsProvable(
	mutation: PatchUndoMutation,
	backupPathValue: string | null,
): boolean {
	return (
		mutation.beforeExisted === false ||
		(mutation.beforeExisted === true &&
			backupPathValue !== null &&
			existsSync(backupPathValue))
	);
}

function buildUndoPatchDryRunResult(
	args: CommandArgs,
	mutation: MutationRecord,
	projectRoot: string,
	reason: string,
): CommandResult {
	const patchMutation = mutation as PatchUndoMutation;
	const target = resolveSafePath(projectRoot, patchMutation.sourcePath);
	const backupPathValue = resolveJournalBackupPath(
		projectRoot,
		patchMutation.backupPath,
	);
	const before = existsSync(target.path) ? readTextOrEmpty(target.path) : "";
	if (!patchUndoStateIsProvable(patchMutation, backupPathValue)) {
		return {
			command: "ud",
			status: "blocked",
			dry_run: true,
			session: args.session,
			task_id: args.taskId,
			reason,
			path: patchMutation.sourcePath,
			destination: patchMutation.sourcePath,
			target_mutation_id: patchMutation.id,
			message: "Undo blocked: original patch state is unprovable",
		};
	}
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
	runtime: { afterPrepared?: () => void } = {},
): CommandResult {
	const patchMutation = mutation as PatchUndoMutation;
	const target = resolveSafePath(projectRoot, patchMutation.sourcePath);
	const backupPathValue = resolveJournalBackupPath(
		projectRoot,
		patchMutation.backupPath,
	);
	return withResourceLocks(projectRoot, [target.path], () => {
		const targetExists = existsSync(target.path);
		const before = targetExists ? readTextOrEmpty(target.path) : "";
		const beforeHash = targetExists ? normalizeHash(before) : null;
		const backupBytes = readJournalBackupBytes(
			projectRoot,
			patchMutation.backupPath,
		);
		const backupBefore = backupBytes?.toString("utf8") ?? null;
		if (beforeHash !== (patchMutation.afterHash ?? null)) {
			return {
				command: "ud",
				status: "blocked",
				dry_run: false,
				session: args.session,
				task_id: args.taskId,
				reason,
				path: patchMutation.sourcePath,
				destination: patchMutation.sourcePath,
				target_mutation_id: patchMutation.id,
				message: "undo-conflict: current hash differs from mutation afterHash",
			};
		}
		if (!patchUndoStateIsProvable(patchMutation, backupPathValue)) {
			return {
				command: "ud",
				status: "blocked",
				dry_run: false,
				session: args.session,
				task_id: args.taskId,
				reason,
				path: patchMutation.sourcePath,
				destination: patchMutation.sourcePath,
				target_mutation_id: patchMutation.id,
				message: "Undo blocked: original patch state is unprovable",
			};
		}
		const mutationId = createMutationId();
		const undoRecord = {
			id: mutationId,
			ts: new Date().toISOString(),
			kind: "undo" as const,
			status: "prepared" as const,
			dryRun: false,
			session: args.session,
			taskId: args.taskId,
			reason: `undo ${patchMutation.id}`,
			targetMutationId: patchMutation.id,
			sourcePath: patchMutation.sourcePath,
			destinationPath: patchMutation.sourcePath,
		};
		appendMutationRecord(projectRoot, undoRecord);
		try {
			runtime.afterPrepared?.();
			if (backupBefore !== null) atomicWriteText(target.path, backupBefore);
			else if (targetExists && patchMutation.beforeExisted === false)
				rmSync(target.path);

			const after = existsSync(target.path) ? readTextOrEmpty(target.path) : "";
			const afterHash = existsSync(target.path) ? normalizeHash(after) : null;
			appendMutationRecord(projectRoot, { ...undoRecord, status: "committed" });
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
		} catch (error) {
			if (targetExists) atomicWriteText(target.path, before);
			else rmSync(target.path, { force: true });
			try {
				appendMutationRecord(projectRoot, {
					...undoRecord,
					status: "rolled_back",
				});
			} catch (journalError) {
				throw new Error(
					`INTEGRITY_ERROR: undo ${undoRecord.id} rolled back on disk but rollback journal write failed: ${(journalError as Error).message}. Original error: ${(error as Error).message}`,
				);
			}
			throw error;
		}
	});
}

export function runPatchMutation(
	args: PatchArgs,
	projectRoot: string,
	runtime: {
		afterInitialRead?: () => void;
		afterPrepared?: () => void;
		beforePrepared?: (mutationId: string) => void;
	} = {},
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
	const fileExisted = existsSync(resolved.path);
	const before = fileExisted ? readTextOrEmpty(resolved.path) : "";
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
	runtime.afterInitialRead?.();
	return withMutationJournalLock(projectRoot, () => {
		assertMutationJournalIntegrity(projectRoot);
		return withResourceLocks(projectRoot, [resolved.path], () => {
			if (isBinaryPatchTarget(resolved.path)) {
				return {
					command: "pt",
					status: "blocked",
					dry_run: false,
					session: args.session,
					task_id: args.taskId,
					reason: args.reason,
					path: resolved.relativePath,
					message: `Patch blocked: binary target: ${resolved.relativePath}`,
				};
			}
			const lockedExisted = existsSync(resolved.path);
			const lockedBefore = lockedExisted ? readTextOrEmpty(resolved.path) : "";
			const lockedBeforeHash = normalizeHash(lockedBefore);
			if (
				args.expectedBeforeExisted !== undefined &&
				args.expectedBeforeExisted !== lockedExisted
			)
				throw new Error(`stale-before-existence:${resolved.relativePath}`);
			if (
				args.expectedBeforeHash &&
				args.expectedBeforeHash !== lockedBeforeHash
			) {
				throw new Error(`stale-before-hash:${resolved.relativePath}`);
			}
			const lockedAfter = `${lockedBefore}${appendText}`;
			const lockedDiffPreview = makeDiffPreview(
				lockedBefore,
				lockedAfter,
				resolved.relativePath,
			);
			let backupPathValue: string | undefined;
			if (lockedExisted) {
				backupPathValue = backupPath(
					projectRoot,
					mutationId,
					resolved.relativePath,
				);
				cpSync(resolved.path, backupPathValue);
			}
			const record = {
				id: mutationId,
				ts: new Date().toISOString(),
				kind: "patch" as const,
				status: "prepared" as const,
				dryRun: false,
				session: args.session,
				taskId: args.taskId,
				reason: args.reason,
				sourcePath: resolved.relativePath,
				beforeHash: lockedBeforeHash,
				afterHash: normalizeHash(lockedAfter),
				backupPath: backupPathValue ?? null,
				beforeExisted: lockedExisted,
				...(lockedDiffPreview ? { diffPreview: lockedDiffPreview } : {}),
			};
			runtime.beforePrepared?.(mutationId);
			appendMutationRecord(projectRoot, record);
			try {
				runtime.afterPrepared?.();
				atomicWriteText(resolved.path, lockedAfter);
				appendMutationRecord(projectRoot, { ...record, status: "committed" });
			} catch (error) {
				let rollbackError: Error | null = null;
				try {
					if (lockedExisted) atomicWriteText(resolved.path, lockedBefore);
					else rmSync(resolved.path, { force: true });
					if (!lockedExisted && existsSync(resolved.path))
						throw new Error(
							`mutation ${record.id} failed to restore target absence`,
						);
				} catch (rollbackFailure) {
					rollbackError = rollbackFailure as Error;
				}
				if (rollbackError)
					throw new AggregateError(
						[error, rollbackError],
						`INTEGRITY_ERROR: mutation ${record.id} rollback postcondition failed`,
					);
				try {
					appendMutationRecord(projectRoot, {
						...record,
						status: "rolled_back",
					});
				} catch (journalError) {
					throw new AggregateError(
						[error, journalError],
						`INTEGRITY_ERROR: mutation ${record.id} rolled back on disk but rollback journal write failed: ${(journalError as Error).message}. Original error: ${(error as Error).message}`,
					);
				}
				throw error;
			}
			return {
				command: "pt",
				status: "write",
				dry_run: false,
				session: args.session,
				task_id: args.taskId,
				reason: args.reason,
				path: resolved.relativePath,
				mutation_id: mutationId,
				before_hash: lockedBeforeHash,
				after_hash: normalizeHash(lockedAfter),
				backup_path: backupPathValue ?? null,
				diff_preview: lockedDiffPreview,
			};
		});
	});
}

export function undoPatchMutation(
	args: CommandArgs,
	mutation: MutationRecord,
	projectRoot: string,
	runtime: { afterPrepared?: () => void } = {},
): CommandResult {
	if (!mutation.sourcePath || mutation.kind !== "patch") {
		throw new Error(`Expected patch mutation for undo, got ${mutation.kind}`);
	}

	const reason = args.reason || `undo ${mutation.id}`;
	if (args.dryRun) {
		return buildUndoPatchDryRunResult(args, mutation, projectRoot, reason);
	}

	return applyUndoPatchMutation(args, mutation, projectRoot, reason, runtime);
}
