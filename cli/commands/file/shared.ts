import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createPatch } from "diff";
import { resolveProjectPaths } from "../../services/project/paths";
import {
	resolveProjectPath,
	resolveProjectWritePath,
} from "../../services/project/root";
import {
	DEFAULT_IO as SHARED_DEFAULT_IO,
	type CommandIo as SharedCommandIo,
} from "../io";

export type CommandIo = SharedCommandIo;

type FileCommand = "pt" | "mv" | "ud" | "ar";
type FileStatus = "noop" | "dry-run" | "write" | "blocked";

export type CommandResult = {
	command: FileCommand;
	status: FileStatus;
	dry_run: boolean;
	session: string;
	task_id: string;
	reason: string;
	path: string;
	destination?: string;
	before_hash?: string | null | undefined;
	after_hash?: string | null | undefined;
	mutation_id?: string | undefined;
	target_mutation_id?: string | undefined;
	backup_path?: string | null | undefined;
	overwritten_backup_path?: string | null | undefined;
	diff_preview?: string | undefined;
	message?: string;
};

export type CommandArgs = {
	command: FileCommand;
	path: string;
	dryRun: boolean;
	json: boolean;
	session: string;
	taskId: string;
	reason: string;
};

export type PatchArgs = CommandArgs & {
	appendText: string;
};

export type MoveArgs = CommandArgs & {
	destinationPath: string;
};

export type UndoArgs = CommandArgs & {
	mutationId?: string | undefined;
};

export function makeUnsupportedUndoResult(
	args: Pick<CommandArgs, "dryRun" | "session" | "taskId" | "reason">,
	target: { id: string; sourcePath: string; kind: string },
): CommandResult {
	return {
		command: "ud",
		status: "blocked",
		dry_run: args.dryRun,
		session: args.session,
		task_id: args.taskId,
		reason: args.reason,
		path: target.sourcePath,
		target_mutation_id: target.id,
		message: `Unsupported mutation kind: ${target.kind}`,
	};
}

export const DEFAULT_IO: CommandIo = SHARED_DEFAULT_IO;

export const DEFAULT_PATCH_PATH = ".afol/data/mutations/.file-probe.txt";
export const DEFAULT_MOVE_SOURCE = ".afol/data/mutations/move-source.txt";
export const DEFAULT_MOVE_DESTINATION =
	".afol/data/mutations/move-destination.txt";

const PROTECTED_PREFIXES = Object.freeze([
	".agents/lock.json",
	".agents/config.json",
	".agents/manifest.json",
]);

function isProtectedPath(relativePath: string): boolean {
	const normalized = relativePath.replaceAll("\\", "/");
	return PROTECTED_PREFIXES.some(
		(prefix) => normalized === prefix || normalized.startsWith(prefix),
	);
}

type ResolvedSafePath = { path: string; relativePath: string };

function projectMutationDefaults(projectRoot: string): {
	patchPath: string;
	moveSource: string;
	moveDestination: string;
} {
	const mutationsDir = resolveProjectPaths(projectRoot).mutationsDir;
	return {
		patchPath: join(mutationsDir, ".file-probe.txt"),
		moveSource: join(mutationsDir, "move-source.txt"),
		moveDestination: join(mutationsDir, "move-destination.txt"),
	};
}

export function requireWriteContext(args: CommandArgs): void {
	if (
		!args.dryRun &&
		(!args.session.trim() || !args.taskId.trim() || !args.reason.trim())
	) {
		throw new Error(
			"Real file mutation requires --session, --task-id, and --reason.",
		);
	}
}

export function normalizeHash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function sanitizeForFilename(value: string): string {
	return value
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/\.{2,}/g, "_")
		.replace(/\s+/g, "-")
		.replace(/^$/g, "root");
}

export function resolveSafePath(
	projectRoot: string,
	targetPath: string,
): ResolvedSafePath {
	const resolved = resolveProjectPath(projectRoot, targetPath);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	if (isProtectedPath(resolved.value.relativePath)) {
		throw new Error(`protected-path:${targetPath}`);
	}
	return resolved.value;
}

export function readTextOrEmpty(path: string): string {
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function looksBinary(buffer: Uint8Array): boolean {
	if (buffer.length === 0) {
		return false;
	}
	const sample = buffer.subarray(0, 8000);
	let suspicious = 0;
	for (const byte of sample) {
		if (byte === 0) {
			return true;
		}
		if (byte < 7 || (byte > 14 && byte < 32) || byte === 127) {
			suspicious += 1;
		}
	}
	return suspicious > 0 && suspicious / sample.length > 0.3;
}

export function isBinaryPatchTarget(path: string): boolean {
	return existsSync(path) && looksBinary(readFileSync(path));
}

function ensureBackupDir(projectRoot: string): string {
	const projectPaths = resolveProjectPaths(projectRoot);
	const resolved = resolveProjectWritePath(
		projectRoot,
		projectPaths.mutationBackupsDir,
	);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	const backups = resolved.value.path;
	mkdirSync(backups, { recursive: true });
	return backups;
}

export function backupPath(
	projectRoot: string,
	mutationId: string,
	relativePath: string,
): string {
	const safe = sanitizeForFilename(relativePath);
	return join(ensureBackupDir(projectRoot), `${mutationId}-${safe}.bak`);
}

function pathIsInsideRoot(candidatePath: string, rootPath: string): boolean {
	return (
		candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${sep}`)
	);
}

export function resolveJournalBackupPath(
	projectRoot: string,
	storedPath: string | null | undefined,
): string | null {
	if (!storedPath) {
		return null;
	}

	const projectPaths = resolveProjectPaths(projectRoot);
	const resolvedBackups = resolveProjectWritePath(
		projectRoot,
		projectPaths.mutationBackupsDir,
	);
	if (!resolvedBackups.ok) {
		throw new Error(resolvedBackups.error);
	}
	const backupsDir = resolvedBackups.value.path;
	const lexicalStoredPath = resolve(storedPath);
	const lexicalBackupsDir = resolve(backupsDir);

	if (existsSync(storedPath)) {
		const resolvedStoredPath = realpathSync(storedPath);
		const resolvedBackupsDir = existsSync(backupsDir)
			? realpathSync(backupsDir)
			: lexicalBackupsDir;

		if (!pathIsInsideRoot(resolvedStoredPath, resolvedBackupsDir)) {
			throw new Error(
				`journal backup path escapes mutation backups dir: ${storedPath}`,
			);
		}

		return storedPath;
	}

	if (!pathIsInsideRoot(lexicalStoredPath, lexicalBackupsDir)) {
		throw new Error(
			`journal backup path escapes mutation backups dir: ${storedPath}`,
		);
	}

	return storedPath;
}

export function archiveDestination(
	projectRoot: string,
	mutationId: string,
	relativePath: string,
): { path: string; relativePath: string } {
	const safe = sanitizeForFilename(relativePath);
	const projectPaths = resolveProjectPaths(projectRoot);
	const relative = join(
		projectPaths.mutationArchivesDir,
		`${mutationId}-${safe}`,
	);
	const resolved = resolveProjectWritePath(projectRoot, relative);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	return { path: resolved.value.path, relativePath: relative };
}

function applyProjectMutationDefaultsInternal<T extends CommandArgs>(
	args: T,
	projectRoot: string,
): T {
	const defaults = projectMutationDefaults(projectRoot);
	const next = { ...args };
	if (next.path === DEFAULT_PATCH_PATH || next.path === DEFAULT_MOVE_SOURCE) {
		next.path =
			next.command === "mv" ? defaults.moveSource : defaults.patchPath;
	}
	if (
		next.command === "mv" &&
		"destinationPath" in next &&
		next.destinationPath === DEFAULT_MOVE_DESTINATION
	) {
		next.destinationPath = defaults.moveDestination;
	}
	return next;
}

export function applyProjectMutationDefaults<T extends CommandArgs>(
	args: T,
	projectRoot: string,
): T {
	return applyProjectMutationDefaultsInternal(args, projectRoot);
}

export function makeDiffPreview(
	beforeText: string,
	afterText: string,
	pathName: string,
): string | undefined {
	if (beforeText === afterText) {
		return undefined;
	}
	const patch = createPatch(pathName, beforeText, afterText, "before", "after");
	return patch.length > 0 ? patch : undefined;
}

export function makeMovePreview(source: string, destination: string): string {
	return createPatch(
		"move-path",
		`source:${source}\n`,
		`destination:${destination}\n`,
		"before",
		"after",
	);
}
