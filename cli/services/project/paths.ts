import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { loadJsonObject, type SchemaObject } from "../../core/schema";

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

function readProjectConfig(root: string): SchemaObject {
	const jsonPath = join(root, ".agents", "config.json");
	if (existsSync(jsonPath)) {
		const loaded = loadJsonObject(jsonPath);
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
	return {
		agentsDir: resolve(root, paths.agentsDir),
		mutableDir: resolve(root, paths.mutableDir),
		admDir: resolve(root, paths.admDir),
		pstrDir: resolve(root, paths.pstrDir),
		stateDb: resolve(root, paths.stateDb),
		libraryDir: resolve(root, paths.libraryDir),
		memoryFile: resolve(root, paths.memoryFile),
		rulesDir: resolve(root, paths.rulesDir),
		hooksDir: resolve(root, paths.hooksDir),
		skillsDir: resolve(root, paths.skillsDir),
		wbDir: resolve(root, paths.wbDir),
		activeSessionFile: resolve(root, paths.activeSessionFile),
		tmpDir: resolve(root, paths.tmpDir),
		dataIndexDir: resolve(root, paths.dataIndexDir),
		eventsFile: resolve(root, paths.eventsFile),
		mutationsDir: resolve(root, paths.mutationsDir),
		mutationBackupsDir: resolve(root, paths.mutationBackupsDir),
		mutationArchivesDir: resolve(root, paths.mutationArchivesDir),
		lockFile: resolve(root, paths.lockFile),
		manifestFile: resolve(root, paths.manifestFile),
	};
}

export function resolveProjectPaths(root: string): ResolvedProjectPaths {
	const config = readProjectConfig(root);
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

	return { ...paths, abs: absolute(root, paths) };
}

export function readJsonObjectIfExists(
	path: string,
): Record<string, unknown> | null {
	if (!existsSync(path)) {
		return null;
	}
	const parsed = JSON.parse(readFileSync(path, "utf8"));
	return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
		? (parsed as Record<string, unknown>)
		: null;
}
