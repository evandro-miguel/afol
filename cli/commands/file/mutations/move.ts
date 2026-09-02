import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWriteBytes } from "../../../services/io/atomic";
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
	type CommandResult,
	looksBinary,
	type MoveArgs,
	makeDiffPreview,
	makeMovePreview,
	normalizeHash,
	readJournalBackupBytes,
	requireWriteContext,
	resolveJournalBackupPath,
	resolveSafePath,
} from "../shared";

function readFileBytes(path: string): Buffer {
	return existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
}

function fileHasHash(
	path: string,
	expectedHash: string | null | undefined,
): boolean {
	return (
		expectedHash !== null &&
		expectedHash !== undefined &&
		existsSync(path) &&
		normalizeHash(readFileSync(path)) === expectedHash
	);
}

function textPreview(bytes: Buffer): string | undefined {
	return looksBinary(bytes) ? undefined : bytes.toString("utf8");
}

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
	return withResourceLocks(projectRoot, [source.path, destination.path], () => {
		const sourceExists = existsSync(source.path);
		const destinationExists = existsSync(destination.path);
		const beforeSourceBytes = readFileBytes(source.path);
		const beforeDestinationBytes = readFileBytes(destination.path);
		const afterSourceBytes = readFileBytes(destination.path);
		const overwrittenBackupPath = resolveJournalBackupPath(
			projectRoot,
			moveMutation.overwrittenBackupPath,
		);
		const afterDestinationBytes = overwrittenBackupPath
			? readFileBytes(overwrittenBackupPath)
			: Buffer.alloc(0);
		const beforeDestinationText = textPreview(beforeDestinationBytes);
		const afterDestinationText = textPreview(afterDestinationBytes);

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
			before_hash: sourceExists ? normalizeHash(beforeSourceBytes) : null,
			after_hash: destinationExists ? normalizeHash(afterSourceBytes) : null,
			diff_preview:
				beforeDestinationText !== undefined &&
				afterDestinationText !== undefined
					? makeDiffPreview(
							beforeDestinationText,
							afterDestinationText,
							moveMutation.destinationPath,
						)
					: undefined,
		};
	});
}

function applyUndoMoveMutation(
	args: { dryRun: boolean; session: string; taskId: string; reason: string },
	mutation: MutationRecord,
	projectRoot: string,
	reason: string,
	runtime: { afterPrepared?: () => void; afterReplaced?: () => void } = {},
): CommandResult {
	const moveMutation = mutation as MoveUndoMutation;
	const source = resolveSafePath(projectRoot, moveMutation.sourcePath);
	const destination = resolveSafePath(
		projectRoot,
		moveMutation.destinationPath,
	);
	return withResourceLocks(projectRoot, [source.path, destination.path], () => {
		const sourceExists = existsSync(source.path);
		const beforeSourceBytes = readFileBytes(source.path);
		const beforeDestinationBytes = readFileBytes(destination.path);
		const beforeSourceHash = sourceExists
			? normalizeHash(beforeSourceBytes)
			: null;
		const overwrittenBackupPath = resolveJournalBackupPath(
			projectRoot,
			moveMutation.overwrittenBackupPath,
		);
		const overwrittenBackupBytes = readJournalBackupBytes(
			projectRoot,
			moveMutation.overwrittenBackupPath,
		);

		if (sourceExists) {
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
		const currentDestinationHash = normalizeHash(
			readFileSync(destination.path),
		);
		if (currentDestinationHash !== (moveMutation.afterHash ?? null)) {
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
				message: "undo-conflict: current hash differs from mutation afterHash",
			};
		}
		if (
			moveMutation.destinationExisted &&
			(!overwrittenBackupPath || !existsSync(overwrittenBackupPath))
		) {
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
				message: "Undo blocked: overwritten destination backup is missing",
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
			reason: `undo ${moveMutation.id}`,
			targetMutationId: moveMutation.id,
			sourcePath: moveMutation.sourcePath,
			destinationPath: moveMutation.destinationPath,
		};
		appendMutationRecord(projectRoot, undoRecord);
		let afterSourceBytes: Buffer = Buffer.alloc(0);
		let beforeDestinationText: string | undefined;
		let afterDestinationText: string | undefined;
		let replacementApplied = false;
		try {
			runtime.afterPrepared?.();
			mkdirSync(dirname(source.path), { recursive: true });
			renameSync(destination.path, source.path);
			replacementApplied = true;
			runtime.afterReplaced?.();

			if (overwrittenBackupBytes) {
				mkdirSync(dirname(destination.path), { recursive: true });
				atomicWriteBytes(destination.path, overwrittenBackupBytes);
			}

			afterSourceBytes = readFileBytes(source.path);
			const afterDestinationBytes = readFileBytes(destination.path);
			beforeDestinationText = textPreview(beforeDestinationBytes);
			afterDestinationText = textPreview(afterDestinationBytes);

			appendMutationRecord(projectRoot, { ...undoRecord, status: "committed" });
		} catch (error) {
			const renameCompleted =
				replacementApplied ||
				(!existsSync(destination.path) &&
					fileHasHash(source.path, moveMutation.afterHash));
			if (renameCompleted) {
				mkdirSync(dirname(destination.path), { recursive: true });
				renameSync(source.path, destination.path);
			}
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
			after_hash: normalizeHash(afterSourceBytes),
			diff_preview:
				beforeDestinationText !== undefined &&
				afterDestinationText !== undefined
					? makeDiffPreview(
							beforeDestinationText,
							afterDestinationText,
							moveMutation.destinationPath,
						)
					: undefined,
		};
	});
}

export function runMoveMutation(
	args: MoveArgs,
	projectRoot: string,
	runtime: { afterPrepared?: () => void; afterReplaced?: () => void } = {},
): CommandResult {
	const source = resolveSafePath(projectRoot, args.path);
	const destination = resolveSafePath(projectRoot, args.destinationPath);
	const diffPreview = makeMovePreview(
		source.relativePath,
		destination.relativePath,
	);
	const mutationId = createMutationId();

	if (!existsSync(source.path)) {
		throw new Error(`Source file not found: ${source.relativePath}`);
	}

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

	requireWriteContext(args);
	return withMutationJournalLock(projectRoot, () => {
		assertMutationJournalIntegrity(projectRoot);
		return withResourceLocks(
			projectRoot,
			[source.path, destination.path],
			() => {
				if (!existsSync(source.path))
					throw new Error(`stale-source:${source.relativePath}`);
				const beforeSource = readFileSync(source.path);
				const destinationExisted = existsSync(destination.path);
				const beforeDestinationBytes = readFileBytes(destination.path);
				const beforeHash = normalizeHash(beforeSource);
				if (args.expectedBeforeHash && args.expectedBeforeHash !== beforeHash)
					throw new Error(`stale-before-hash:${source.relativePath}`);
				const destinationHash = destinationExisted
					? normalizeHash(readFileSync(destination.path))
					: null;
				if (
					destinationExisted &&
					(args.expectedDestinationExists !== true ||
						args.expectedDestinationHash === undefined)
				) {
					throw new Error(
						`destination-precondition-required:${destination.relativePath}`,
					);
				}
				if (
					args.expectedDestinationExists !== undefined &&
					args.expectedDestinationExists !== destinationExisted
				)
					throw new Error(
						`stale-destination-existence:${destination.relativePath}`,
					);
				if (
					args.expectedDestinationHash !== undefined &&
					args.expectedDestinationHash !== destinationHash
				)
					throw new Error(`stale-destination-hash:${destination.relativePath}`);
				let overwrittenBackupPath: string | undefined;
				if (destinationExisted) {
					overwrittenBackupPath = backupPath(
						projectRoot,
						mutationId,
						`${destination.relativePath}.overwritten`,
					);
					atomicWriteBytes(overwrittenBackupPath, beforeDestinationBytes);
				}
				const record = {
					id: mutationId,
					ts: new Date().toISOString(),
					kind: "move" as const,
					status: "prepared" as const,
					dryRun: false,
					session: args.session,
					taskId: args.taskId,
					reason: args.reason,
					sourcePath: source.relativePath,
					destinationPath: destination.relativePath,
					beforeHash,
					afterHash: beforeHash,
					destinationExisted,
					overwrittenBackupPath: overwrittenBackupPath ?? null,
					diffPreview,
				};
				appendMutationRecord(projectRoot, record);
				let replacementApplied = false;
				try {
					runtime.afterPrepared?.();
					mkdirSync(dirname(destination.path), { recursive: true });
					renameSync(source.path, destination.path);
					replacementApplied = true;
					runtime.afterReplaced?.();
					const after = readFileSync(destination.path);
					appendMutationRecord(projectRoot, {
						...record,
						afterHash: normalizeHash(after),
						status: "committed",
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
				} catch (error) {
					const renameCompleted =
						replacementApplied ||
						(!existsSync(source.path) &&
							fileHasHash(destination.path, record.afterHash));
					if (renameCompleted) {
						mkdirSync(dirname(source.path), { recursive: true });
						renameSync(destination.path, source.path);
					}
					if (destinationExisted) {
						mkdirSync(dirname(destination.path), { recursive: true });
						atomicWriteBytes(destination.path, beforeDestinationBytes);
					}
					try {
						appendMutationRecord(projectRoot, {
							...record,
							status: "rolled_back",
						});
					} catch (journalError) {
						throw new Error(
							`INTEGRITY_ERROR: mutation ${record.id} rolled back on disk but rollback journal write failed: ${(journalError as Error).message}. Original error: ${(error as Error).message}`,
						);
					}
					throw error;
				}
			},
		);
	});
}

export function undoMoveMutation(
	args: { dryRun: boolean; session: string; taskId: string; reason: string },
	mutation: MutationRecord,
	projectRoot: string,
	runtime: { afterPrepared?: () => void } = {},
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

	return applyUndoMoveMutation(args, mutation, projectRoot, reason, runtime);
}
