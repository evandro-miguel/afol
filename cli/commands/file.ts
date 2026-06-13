import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createPatch } from "diff";
import {
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	appendMutationRecord,
	createMutationId,
	findLatestSupportedMutation,
	findMutationById,
	type MutationRecord,
} from "../services/mutations/journal";
import { resolveProjectPaths } from "../services/project/paths";
import { resolveProjectPath } from "../services/project/root";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

type FileCommand = "pt" | "mv" | "ud" | "ar";
type FileStatus = "noop" | "dry-run" | "write" | "blocked";

type CommandResult = {
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

function fileResultEnvelope(
	result: CommandResult,
): ResultEnvelope<CommandResult> {
	if (result.status !== "blocked") {
		return envelopeOk(result, { action: "file", exitCode: 0 });
	}

	return {
		schema: "afol.result/v1",
		ok: false,
		action: "file",
		exit_code: 4,
		data: result,
	};
}

const FILE_RESULT_LEGACY_KEYS = [
	"command",
	"status",
	"dry_run",
	"session",
	"task_id",
	"reason",
	"path",
	"destination",
	"before_hash",
	"after_hash",
	"mutation_id",
	"target_mutation_id",
	"backup_path",
	"overwritten_backup_path",
	"diff_preview",
	"message",
] as const satisfies readonly (keyof CommandResult)[];

type CommandArgs = {
	command: FileCommand;
	path: string;
	dryRun: boolean;
	json: boolean;
	session: string;
	taskId: string;
	reason: string;
};

type PatchArgs = CommandArgs & {
	appendText: string;
};

type MoveArgs = CommandArgs & {
	destinationPath: string;
};

type UndoArgs = CommandArgs & {
	mutationId?: string | undefined;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

const DEFAULT_PATCH_PATH = ".afol/data/mutations/.file-probe.txt";
const DEFAULT_MOVE_SOURCE = ".afol/data/mutations/move-source.txt";
const DEFAULT_MOVE_DESTINATION = ".afol/data/mutations/move-destination.txt";

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

function requireWriteContext(args: CommandArgs): void {
	if (
		!args.dryRun &&
		(!args.session.trim() || !args.taskId.trim() || !args.reason.trim())
	) {
		throw new Error(
			"Real file mutation requires --session, --task-id, and --reason.",
		);
	}
}

function normalizeHash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function sanitizeForFilename(value: string): string {
	return value
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/\.{2,}/g, "_")
		.replace(/\s+/g, "-")
		.replace(/^$/g, "root");
}

function resolveSafePath(
	projectRoot: string,
	targetPath: string,
): { path: string; relativePath: string } {
	const resolved = resolveProjectPath(projectRoot, targetPath);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	if (isProtectedPath(resolved.value.relativePath)) {
		throw new Error(`protected-path:${targetPath}`);
	}
	return resolved.value;
}

function readTextOrEmpty(path: string): string {
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function looksBinary(buffer: Uint8Array): boolean {
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

function isBinaryPatchTarget(path: string): boolean {
	return existsSync(path) && looksBinary(readFileSync(path));
}

function ensureBackupDir(projectRoot: string): string {
	const backups = resolveProjectPaths(projectRoot).abs.mutationBackupsDir;
	mkdirSync(backups, { recursive: true });
	return backups;
}

function backupPath(
	projectRoot: string,
	mutationId: string,
	relativePath: string,
): string {
	const safe = sanitizeForFilename(relativePath);
	return join(ensureBackupDir(projectRoot), `${mutationId}-${safe}.bak`);
}

function archiveDestination(
	projectRoot: string,
	mutationId: string,
	relativePath: string,
): { path: string; relativePath: string } {
	const safe = sanitizeForFilename(relativePath);
	const relative = join(
		resolveProjectPaths(projectRoot).mutationArchivesDir,
		`${mutationId}-${safe}`,
	);
	return { path: join(projectRoot, relative), relativePath: relative };
}

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

function applyProjectMutationDefaults<T extends CommandArgs>(
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

function makeDiffPreview(
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

function makeMovePreview(source: string, destination: string): string {
	return createPatch(
		"move-path",
		`source:${source}\n`,
		`destination:${destination}\n`,
		"before",
		"after",
	);
}

type ParsedArgs = {
	dryRun: boolean;
	json: boolean;
	session: string;
	taskId: string;
	reason: string;
	positional: string[];
	pathArg: string | undefined;
	destinationArg: string | undefined;
	mutationId: string | undefined;
	appendText: string | undefined;
};

function parseGenericArgs(values: string[]): ParsedArgs {
	let dryRun = false;
	let json = false;
	let session = "";
	let taskId = "";
	let reason = "";
	const positional: string[] = [];
	let pathArg: string | undefined;
	let destinationArg: string | undefined;
	let mutationId: string | undefined;
	let appendText: string | undefined;

	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (!value) {
			continue;
		}
		if (value === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--session") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --session");
			}
			session = next;
			index += 1;
			continue;
		}
		if (value === "--task-id") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --task-id");
			}
			taskId = next;
			index += 1;
			continue;
		}
		if (value === "--reason") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --reason");
			}
			reason = next;
			index += 1;
			continue;
		}
		if (value === "--path") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --path");
			}
			pathArg = next;
			index += 1;
			continue;
		}
		if (value === "--to") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --to");
			}
			destinationArg = next;
			index += 1;
			continue;
		}
		if (value === "--id") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --id");
			}
			mutationId = next;
			index += 1;
			continue;
		}
		if (value === "--append") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --append");
			}
			appendText = `${appendText ?? ""}${next}`;
			index += 1;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown file argument ${value}`);
		}
		positional.push(value);
	}

	return {
		dryRun,
		json,
		session,
		taskId,
		reason,
		positional,
		pathArg: pathArg,
		destinationArg: destinationArg,
		mutationId: mutationId,
		appendText: appendText,
	};
}

function parsePatchArgs(values: string[]): PatchArgs {
	const parsed = parseGenericArgs(values);
	const firstPath = parsed.positional[0];
	const path = parsed.pathArg ?? firstPath ?? DEFAULT_PATCH_PATH;
	const fallbackAppend = parsed.pathArg
		? parsed.positional.join(" ")
		: parsed.positional.slice(1).join(" ");

	return {
		command: "pt",
		path,
		appendText: parsed.appendText ?? fallbackAppend,
		dryRun: parsed.dryRun,
		json: parsed.json,
		session: parsed.session,
		taskId: parsed.taskId,
		reason: parsed.reason,
	};
}

function parseMoveArgs(values: string[]): MoveArgs {
	const parsed = parseGenericArgs(values);
	const path = parsed.pathArg ?? parsed.positional[0] ?? DEFAULT_MOVE_SOURCE;
	const destination =
		parsed.destinationArg ??
		(parsed.pathArg ? parsed.positional[0] : parsed.positional[1]) ??
		DEFAULT_MOVE_DESTINATION;

	return {
		command: "mv",
		path,
		destinationPath: destination,
		dryRun: parsed.dryRun,
		json: parsed.json,
		session: parsed.session,
		taskId: parsed.taskId,
		reason: parsed.reason,
	};
}

function parseUndoArgs(values: string[]): UndoArgs {
	const parsed = parseGenericArgs(values);
	const mutationId = parsed.mutationId ?? parsed.positional[0];
	return {
		command: "ud",
		path: "",
		mutationId,
		dryRun: parsed.dryRun,
		json: parsed.json,
		session: parsed.session,
		taskId: parsed.taskId,
		reason: parsed.reason,
	};
}

function parseArchiveArgs(values: string[]): CommandArgs {
	const parsed = parseGenericArgs(values);
	const path = parsed.pathArg ?? parsed.positional[0] ?? DEFAULT_PATCH_PATH;
	return {
		command: "ar",
		path,
		dryRun: parsed.dryRun,
		json: parsed.json,
		session: parsed.session,
		taskId: parsed.taskId,
		reason: parsed.reason,
	};
}

function runPatchMutation(args: PatchArgs, projectRoot: string): CommandResult {
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

function runMoveMutation(args: MoveArgs, projectRoot: string): CommandResult {
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
		const backupPath = mutation.backupPath ?? "";
		const before = existsSync(target.path) ? readTextOrEmpty(target.path) : "";
		const after =
			backupPath && existsSync(backupPath) ? readTextOrEmpty(backupPath) : "";
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
	const backupPath = mutation.backupPath ?? "";
	const before = existsSync(target.path) ? readTextOrEmpty(target.path) : "";
	const beforeHash = before.length > 0 ? normalizeHash(before) : null;

	if (backupPath && existsSync(backupPath)) {
		cpSync(backupPath, target.path);
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

function runUndoMutation(args: UndoArgs, projectRoot: string): CommandResult {
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

function runArchiveMutation(
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

function formatHumanResult(result: CommandResult): string {
	const lines = [
		`file:${result.command}`,
		`status=${result.status}`,
		`path=${result.path}`,
		`dry_run=${result.dry_run}`,
		result.destination ? `destination=${result.destination}` : "",
		result.mutation_id ? `mutation_id=${result.mutation_id}` : "",
		result.target_mutation_id
			? `target_mutation_id=${result.target_mutation_id}`
			: "",
		result.message || "",
	].filter(Boolean);
	if (result.diff_preview) {
		lines.push("diff=");
		lines.push(result.diff_preview);
	}
	return lines.join("\n");
}

function outputResult(
	result: CommandResult,
	io: CommandIo,
	asJson: boolean,
): void {
	if (asJson) {
		io.stdout(
			`${stringifyEnvelope(
				envelopeWithLegacyKeys(
					fileResultEnvelope(result),
					FILE_RESULT_LEGACY_KEYS,
				),
			)}\n`,
		);
		return;
	}
	io.stdout(formatHumanResult(result));
}

export async function runFileCommand(
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const [rawCommand, ...rest] = args;
		if (!rawCommand) {
			throw new Error("Missing file subcommand: pt|mv|ud|ar");
		}

		let result: CommandResult;
		let asJson = false;

		if (rawCommand === "pt" || rawCommand === "patch") {
			const parsed = applyProjectMutationDefaults(
				parsePatchArgs(rest),
				projectRoot,
			);
			asJson = parsed.json;
			result = runPatchMutation(parsed, projectRoot);
		} else if (rawCommand === "mv" || rawCommand === "move") {
			const parsed = applyProjectMutationDefaults(
				parseMoveArgs(rest),
				projectRoot,
			);
			asJson = parsed.json;
			result = runMoveMutation(parsed, projectRoot);
		} else if (rawCommand === "ud" || rawCommand === "undo") {
			const parsed = parseUndoArgs(rest);
			asJson = parsed.json;
			if (!parsed.dryRun) {
				requireWriteContext(parsed);
			}
			result = runUndoMutation(parsed, projectRoot);
		} else if (rawCommand === "ar" || rawCommand === "archive") {
			const parsed = applyProjectMutationDefaults(
				parseArchiveArgs(rest),
				projectRoot,
			);
			asJson = parsed.json;
			result = runArchiveMutation(parsed, projectRoot);
		} else {
			throw new Error(`Unknown file command: ${rawCommand}`);
		}

		outputResult(result, io, asJson);
		return result.status === "blocked" ? 4 : 0;
	} catch (error) {
		io.stderr(`for file command: ${(error as Error).message}`);
		return 2;
	}
}
