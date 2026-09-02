import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { toPosixPath } from "../../core/file-paths";
import type { Result } from "../../core/result";
import { err, ok } from "../../core/result";
import { loadJsonObject, type SchemaObject } from "../../core/schema";
import {
	PROJECT_CONFIG_PATHS,
	type ProjectConfigSource,
	resolveProjectConfigPath,
	resolveProjectPaths,
} from "./paths";

export type LoadedProjectRoot = {
	root: string;
	configPath: string;
	configRelativePath: string;
	configSource: ProjectConfigSource;
	config: SchemaObject;
	lock: SchemaObject;
	manifest?: SchemaObject;
};

export type ProjectPath = {
	path: string;
	relativePath: string;
};

function pathIsInsideRoot(root: string, target: string): boolean {
	const relativePath = relative(root, target);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
}

function findEnclosingGitWorkTreeRoot(startPath: string): string | null {
	let current = resolve(startPath);
	while (true) {
		if (existsSync(join(current, ".git"))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

function findProjectRoot(
	startPath: string,
): { root: string; configPath: string } | null {
	const resolvedStart = resolve(startPath);
	const gitWorkTreeRoot = findEnclosingGitWorkTreeRoot(resolvedStart);
	let current = resolvedStart;
	while (true) {
		for (const candidate of PROJECT_CONFIG_PATHS) {
			const configPath = join(current, candidate.relativePath);
			if (existsSync(configPath)) {
				return { root: current, configPath };
			}
		}
		if (gitWorkTreeRoot !== null && current === gitWorkTreeRoot) {
			return null;
		}
		const parent = dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

export function loadProjectRoot(
	startPath: string,
): Result<LoadedProjectRoot, { code: number; message: string }> {
	const found = findProjectRoot(startPath);
	if (!found) {
		return err({
			code: 3,
			message:
				"❌ Could not detect project root: .afol/config.json or .agents/config.json not found. next: run afol init",
		});
	}
	let projectRoot: string;
	try {
		projectRoot = realpathSync(found.root);
	} catch (error) {
		return err({
			code: 2,
			message: `Cannot resolve project root: ${(error as Error).message}`,
		});
	}

	let configResolution: ReturnType<typeof resolveProjectConfigPath>;
	try {
		configResolution = resolveProjectConfigPath(projectRoot);
	} catch (error) {
		return err({ code: 2, message: (error as Error).message });
	}
	if (!configResolution) {
		return err({
			code: 3,
			message:
				"❌ Could not detect project root: .afol/config.json or .agents/config.json not found. next: run afol init",
		});
	}

	const configPathResult = resolveProjectPath(
		projectRoot,
		configResolution.relativePath,
	);
	if (!configPathResult.ok) {
		return err({ code: 2, message: configPathResult.error });
	}
	const configPath = configPathResult.value.path;
	const configResult = loadJsonObject(configPath);
	if (!configResult.ok) {
		return err({ code: 2, message: configResult.error });
	}

	let projectPaths: ReturnType<typeof resolveProjectPaths>;
	try {
		projectPaths = resolveProjectPaths(projectRoot);
	} catch (error) {
		return err({ code: 2, message: (error as Error).message });
	}

	const lockPathResult = resolveProjectPath(projectRoot, projectPaths.lockFile);
	if (!lockPathResult.ok) {
		return err({ code: 2, message: lockPathResult.error });
	}
	const lockPath = lockPathResult.value.path;
	const lockResult = loadJsonObject(lockPath);
	if (!lockResult.ok) {
		return err({ code: 2, message: lockResult.error });
	}

	const manifestPathResult = resolveProjectPath(
		projectRoot,
		projectPaths.manifestFile,
	);
	if (!manifestPathResult.ok) {
		return err({ code: 2, message: manifestPathResult.error });
	}
	const manifestPath = manifestPathResult.value.path;
	let manifest: SchemaObject | undefined;
	if (existsSync(manifestPath)) {
		const manifestResult = loadJsonObject(manifestPath);
		if (!manifestResult.ok) {
			return err({ code: 2, message: manifestResult.error });
		}
		manifest = manifestResult.value;
	}

	const loaded = {
		root: projectRoot,
		configPath,
		configRelativePath: configResolution.relativePath,
		configSource: configResolution.source,
		config: configResult.value,
		lock: lockResult.value,
	};

	return ok(manifest === undefined ? loaded : { ...loaded, manifest });
}

export function resolveProjectPath(
	projectRoot: string,
	targetPath: string,
): Result<ProjectPath, string> {
	const root = realpathSync(projectRoot);

	if (isAbsolute(targetPath)) {
		return err(`Path escapes project root: ${targetPath}`);
	}

	let candidate = root;
	for (const rawPart of targetPath
		.split(/[\\/]+/)
		.filter((part) => part.length > 0)) {
		if (rawPart === ".") {
			continue;
		}
		if (rawPart === "..") {
			candidate = dirname(candidate);
			if (!pathIsInsideRoot(root, candidate)) {
				return err(`Path escapes project root: ${targetPath}`);
			}
			continue;
		}

		const next = join(candidate, rawPart);
		try {
			const realNext = realpathSync(next);
			if (!pathIsInsideRoot(root, realNext)) {
				return err(`Path crosses symlink outside project root: ${targetPath}`);
			}
		} catch (error) {
			if (!isMissingPathError(error))
				return err(`Path cannot be inspected: ${targetPath}`);
		}
		candidate = next;
	}

	candidate = resolve(root, targetPath);
	if (!pathIsInsideRoot(root, candidate)) {
		return err(`Path escapes project root: ${targetPath}`);
	}

	return ok({
		path: candidate,
		relativePath: toPosixPath(relative(root, candidate)),
	});
}

export function resolveProjectWritePath(
	projectRoot: string,
	targetPath: string,
): Result<ProjectPath, string> {
	const resolved = resolveProjectPath(projectRoot, targetPath);
	if (!resolved.ok) {
		return resolved;
	}

	const root = realpathSync(projectRoot);
	let candidate = root;
	for (const rawPart of resolved.value.relativePath
		.split("/")
		.filter((part) => part.length > 0)) {
		const next = join(candidate, rawPart);
		try {
			if (lstatSync(next).isSymbolicLink()) {
				return err(`Path crosses symlink: ${targetPath}`);
			}
		} catch (error) {
			if (!isMissingPathError(error)) {
				return err(`Path cannot be inspected: ${targetPath}`);
			}
		}
		candidate = next;
	}

	return resolved;
}

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}
