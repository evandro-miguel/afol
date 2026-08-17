import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { withResourceLocks } from "../../../services/io/session-lock";
import {
	appendMutationRecord,
	assertMutationJournalIntegrity,
	createMutationId,
	type MutationRecord,
	withMutationJournalLock,
} from "../../../services/mutations/journal";
import { resolveProjectPath } from "../../../services/project/root";
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

export function runArchiveMutation(
	args: CommandArgs,
	projectRoot: string,
	runtime: { afterPrepared?: () => void; afterReplaced?: () => void } = {},
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
	return withMutationJournalLock(projectRoot, () => {
		assertMutationJournalIntegrity(projectRoot);
		return withResourceLocks(
			projectRoot,
			[source.path, destination.path],
			() => {
				if (!existsSync(source.path))
					throw new Error(`stale-source:${source.relativePath}`);
				const lockedBytes = readFileBytes(source.path);
				const lockedHash = normalizeHash(lockedBytes);
				if (args.expectedBeforeHash && args.expectedBeforeHash !== lockedHash)
					throw new Error(`stale-before-hash:${source.relativePath}`);
				const record = {
					id: mutationId,
					ts: new Date().toISOString(),
					kind: "archive" as const,
					status: "prepared" as const,
					dryRun: false,
					session: args.session,
					taskId: args.taskId,
					reason: args.reason,
					sourcePath: source.relativePath,
					destinationPath: destination.relativePath,
					beforeHash: lockedHash,
					afterHash: lockedHash,
					backupPath: destination.path,
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

					appendMutationRecord(projectRoot, { ...record, status: "committed" });
				} catch (error) {
					const renameCompleted =
						replacementApplied ||
						(!existsSync(source.path) &&
							fileHasHash(destination.path, record.afterHash));
					if (renameCompleted) {
						mkdirSync(dirname(source.path), { recursive: true });
						renameSync(destination.path, source.path);
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
					before_hash: lockedHash,
					after_hash: lockedHash,
					backup_path: destination.path,
					diff_preview: diffPreview,
				};
			},
		);
	});
}

export function undoArchiveMutation(
	args: CommandArgs,
	mutation: MutationRecord,
	projectRoot: string,
	runtime: { afterPrepared?: () => void; afterReplaced?: () => void } = {},
): CommandResult {
	if (
		mutation.kind !== "archive" ||
		!mutation.sourcePath ||
		!mutation.destinationPath
	) {
		throw new Error(`Expected archive mutation for undo, got ${mutation.kind}`);
	}
	const destinationPath = mutation.destinationPath;

	const reason = args.reason || `undo ${mutation.id}`;
	const source = resolveSafePath(projectRoot, mutation.sourcePath);
	const destinationResult = resolveProjectPath(projectRoot, destinationPath);
	if (!destinationResult.ok) throw new Error(destinationResult.error);
	const destination = destinationResult.value;

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
			destination: destinationPath,
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
	return withResourceLocks(projectRoot, [source.path, destination.path], () => {
		if (existsSync(source.path)) {
			return {
				command: "ud",
				status: "blocked",
				dry_run: false,
				session: args.session,
				task_id: args.taskId,
				reason,
				path: mutation.sourcePath,
				destination: destinationPath,
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
				destination: destinationPath,
				target_mutation_id: mutation.id,
				message: `Undo blocked: destination missing for ${mutation.destinationPath}`,
			};
		}

		const beforeDestinationBytes = readFileBytes(destination.path);
		const beforeDestinationText = textPreview(beforeDestinationBytes);
		const beforeDestinationHash = normalizeHash(beforeDestinationBytes);
		if (beforeDestinationHash !== (mutation.afterHash ?? null)) {
			return {
				command: "ud",
				status: "blocked",
				dry_run: false,
				session: args.session,
				task_id: args.taskId,
				reason,
				path: mutation.sourcePath,
				destination: destinationPath,
				target_mutation_id: mutation.id,
				message: "undo-conflict: current hash differs from mutation afterHash",
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
			reason: `undo ${mutation.id}`,
			targetMutationId: mutation.id,
			sourcePath: mutation.sourcePath,
			destinationPath,
		};
		appendMutationRecord(projectRoot, undoRecord);
		let afterSourceBytes: Buffer = Buffer.alloc(0);
		let afterSourceText: string | undefined;
		let replacementApplied = false;
		try {
			runtime.afterPrepared?.();
			mkdirSync(dirname(source.path), { recursive: true });
			renameSync(destination.path, source.path);
			replacementApplied = true;
			runtime.afterReplaced?.();

			afterSourceBytes = readFileBytes(source.path);
			afterSourceText = textPreview(afterSourceBytes);

			appendMutationRecord(projectRoot, { ...undoRecord, status: "committed" });
		} catch (error) {
			const renameCompleted =
				replacementApplied ||
				(!existsSync(destination.path) &&
					fileHasHash(source.path, mutation.afterHash));
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
			path: mutation.sourcePath,
			destination: destinationPath,
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
	});
}
