import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { loadJsonObject, type SchemaObject } from "../../core/schema";

export const CANONICAL_PROJECT_CONFIG_PATH = ".afol/config.json";
export const LEGACY_PROJECT_CONFIG_PATH = ".agents/config.json";

export type ProjectConfigSource = "canonical" | "legacy";

export type ProjectConfigResolution = {
	source: ProjectConfigSource;
	relativePath: string;
	absolutePath: string;
};

export const PROJECT_CONFIG_PATHS: readonly {
	source: ProjectConfigSource;
	relativePath: string;
}[] = [
	{ source: "canonical", relativePath: CANONICAL_PROJECT_CONFIG_PATH },
	{ source: "legacy", relativePath: LEGACY_PROJECT_CONFIG_PATH },
] as const;

type ProjectPathConfig = {
	agentsDir: string;
	mutableDir: string;
	admDir: string;
	pstrDir: string;
	stateDb: string;
	libraryDir: string;
	memoryFile: string;
	rulesDir: string;
	hooksDir: string;
	skillsDir: string;
	wbDir: string;
	activeSessionFile: string;
	tmpDir: string;
	dataIndexDir: string;
	eventsFile: string;
	mutationsDir: string;
	mutationBackupsDir: string;
	mutationArchivesDir: string;
	lockFile: string;
	manifestFile: string;
};

export type ResolvedProjectPaths = ProjectPathConfig & {
	abs: ProjectPathConfig;
};

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

function assertNoExistingSymlinkComponent(root: string, path: string): void {
	if (isAbsolute(path)) {
		throw new Error(`Path escapes project root: ${path}`);
	}
	let candidate = realpathSync(root);
	for (const rawPart of path
		.split(/[\\/]+/)
		.filter((part) => part.length > 0 && part !== ".")) {
		if (rawPart === "..") {
			throw new Error(`Path escapes project root: ${path}`);
		}
		const next = join(candidate, rawPart);
		try {
			if (lstatSync(next).isSymbolicLink()) {
				throw new Error(`Path crosses symlink: ${path}`);
			}
		} catch (error) {
			if (isMissingPathError(error)) {
				return;
			}
			throw error;
		}
		candidate = next;
	}
}

function assertProjectPathsSafe(root: string, paths: ProjectPathConfig): void {
	for (const path of Object.values(paths)) {
		assertNoExistingSymlinkComponent(root, path);
	}
}

export function resolveProjectConfigPath(
	root: string,
): ProjectConfigResolution | null {
	const projectRoot = realpathSync(root);
	for (const candidate of PROJECT_CONFIG_PATHS) {
		const jsonPath = join(projectRoot, candidate.relativePath);
		if (!existsSync(jsonPath)) {
			continue;
		}
		assertNoExistingSymlinkComponent(projectRoot, candidate.relativePath);
		return {
			source: candidate.source,
			relativePath: candidate.relativePath,
			absolutePath: jsonPath,
		};
	}

	return null;
}

export function readProjectConfig(root: string): SchemaObject {
	const resolved = resolveProjectConfigPath(root);
	if (resolved) {
		const loaded = loadJsonObject(resolved.absolutePath);
		return loaded.ok ? loaded.value : {};
	}
	return {};
}

function objectAt(value: unknown, key: string): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const next = (value as Record<string, unknown>)[key];
	return next !== null && typeof next === "object" && !Array.isArray(next)
		? (next as Record<string, unknown>)
		: null;
}

function stringAt(config: SchemaObject, path: string[]): string | null {
	let current: unknown = config;
	for (let index = 0; index < path.length; index += 1) {
		const key = path[index];
		if (!key) {
			return null;
		}
		if (index === path.length - 1) {
			if (
				current === null ||
				typeof current !== "object" ||
				Array.isArray(current)
			) {
				return null;
			}
			const value = (current as Record<string, unknown>)[key];
			return typeof value === "string" && value.trim() ? value.trim() : null;
		}
		current = objectAt(current, key);
		if (current === null) {
			return null;
		}
	}
	return null;
}

export function normalizeProjectRelativePath(
	path: string,
	fallback: string,
): string {
	const cleaned = path
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/\/+/g, "/");
	if (!cleaned || isAbsolute(cleaned)) {
		return fallback;
	}
	if (cleaned.split("/").some((part) => part === "..")) {
		return fallback;
	}
	return cleaned.replace(/\/$/g, "") || fallback;
}

function fromConfig(
	config: SchemaObject,
	path: string[],
	fallback: string,
): string {
	return normalizeProjectRelativePath(
		stringAt(config, path) ?? fallback,
		fallback,
	);
}

function absolute(root: string, paths: ProjectPathConfig): ProjectPathConfig {
	const projectRoot = realpathSync(root);
	return {
		agentsDir: resolve(projectRoot, paths.agentsDir),
		mutableDir: resolve(projectRoot, paths.mutableDir),
		admDir: resolve(projectRoot, paths.admDir),
		pstrDir: resolve(projectRoot, paths.pstrDir),
		stateDb: resolve(projectRoot, paths.stateDb),
		libraryDir: resolve(projectRoot, paths.libraryDir),
		memoryFile: resolve(projectRoot, paths.memoryFile),
		rulesDir: resolve(projectRoot, paths.rulesDir),
		hooksDir: resolve(projectRoot, paths.hooksDir),
		skillsDir: resolve(projectRoot, paths.skillsDir),
		wbDir: resolve(projectRoot, paths.wbDir),
		activeSessionFile: resolve(projectRoot, paths.activeSessionFile),
		tmpDir: resolve(projectRoot, paths.tmpDir),
		dataIndexDir: resolve(projectRoot, paths.dataIndexDir),
		eventsFile: resolve(projectRoot, paths.eventsFile),
		mutationsDir: resolve(projectRoot, paths.mutationsDir),
		mutationBackupsDir: resolve(projectRoot, paths.mutationBackupsDir),
		mutationArchivesDir: resolve(projectRoot, paths.mutationArchivesDir),
		lockFile: resolve(projectRoot, paths.lockFile),
		manifestFile: resolve(projectRoot, paths.manifestFile),
	};
}

export function resolveProjectPaths(root: string): ResolvedProjectPaths {
	const projectRoot = realpathSync(root);
	const config = readProjectConfig(projectRoot);
	const agentsDir = fromConfig(config, ["paths", "agents_dir"], ".agents");
	const mutableDir = fromConfig(config, ["paths", "mutable_dir"], ".afol");
	const dataDir = fromConfig(
		config,
		["paths", "data_dir"],
		`${mutableDir}/data`,
	);
	const mutationsDir = fromConfig(
		config,
		["paths", "mutations_dir"],
		`${dataDir}/mutations`,
	);
	const wbDir = fromConfig(config, ["paths", "wb_dir"], ".afol/wb");
	const admDir = fromConfig(config, ["paths", "adm_dir"], `${mutableDir}/adm`);

	const paths: ProjectPathConfig = {
		agentsDir,
		mutableDir,
		admDir,
		pstrDir: fromConfig(config, ["paths", "pstr_dir"], `${mutableDir}/pstr`),
		stateDb: fromConfig(
			config,
			["paths", "state_db"],
			`${mutableDir}/state/afol.db`,
		),
		libraryDir: fromConfig(
			config,
			["paths", "library_dir"],
			`${mutableDir}/library`,
		),
		memoryFile: fromConfig(
			config,
			["paths", "memory_file"],
			`${mutableDir}/memory/memory.md`,
		),
		rulesDir: fromConfig(config, ["paths", "rules_dir"], `${admDir}/rules`),
		hooksDir: fromConfig(config, ["paths", "hooks_dir"], `${admDir}/hooks`),
		skillsDir: normalizeProjectRelativePath(
			stringAt(config, ["paths", "skills_dir"]) ??
				stringAt(config, ["skills_sync", "project_dir"]) ??
				`${agentsDir}/skills`,
			`${agentsDir}/skills`,
		),
		wbDir,
		activeSessionFile: fromConfig(
			config,
			["paths", "active_session_file"],
			".afol/wb/.active_session",
		),
		tmpDir: fromConfig(config, ["paths", "tmp_dir"], `${mutableDir}/tmp`),
		dataIndexDir: fromConfig(
			config,
			["paths", "data_index_dir"],
			`${dataDir}/index`,
		),
		eventsFile: fromConfig(
			config,
			["paths", "events_file"],
			`${dataDir}/events/events.jsonl`,
		),
		mutationsDir,
		mutationBackupsDir: fromConfig(
			config,
			["paths", "mutation_backups_dir"],
			`${mutationsDir}/backups`,
		),
		mutationArchivesDir: fromConfig(
			config,
			["paths", "mutation_archives_dir"],
			`${mutationsDir}/archives`,
		),
		lockFile: fromConfig(
			config,
			["paths", "lock_file"],
			`${agentsDir}/lock.json`,
		),
		manifestFile: fromConfig(
			config,
			["paths", "manifest_file"],
			`${agentsDir}/manifest.json`,
		),
	};

	assertProjectPathsSafe(projectRoot, paths);
	return { ...paths, abs: absolute(projectRoot, paths) };
}
