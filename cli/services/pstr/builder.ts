import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { loadJsonObject } from "../../core/schema";
import { computeSourceHash } from "../../core/source-hash";
import { atomicWriteText } from "../io/atomic";
import {
	resolveProjectConfigPath,
	resolveProjectPaths,
} from "../project/paths";
import type {
	PstrAffectedArea,
	PstrAreaRegistryEntry,
	PstrDetectedArea,
	PstrDiffEntry,
	PstrDiffResult,
	PstrIndexSnapshot,
	PstrMapEntry,
	PstrRebuildOptions,
	PstrReviewCandidate,
	PstrSnapshotManifest,
	PstrSnapshotManifestEntry,
	PstrSuggestion,
	PstrValidationResult,
} from "./types";

export const PSTR_AREAS: readonly PstrAreaRegistryEntry[] = [
	{
		id: "cli",
		scope: "cli",
		source_roots: ["cli/"],
		tags: ["pstr", "cli", "typescript"],
	},
	{
		id: "template",
		scope: "template",
		source_roots: ["src/project-template/"],
		tags: ["pstr", "template"],
	},
	{
		id: "docs",
		scope: "docs",
		source_roots: ["docs/"],
		tags: ["pstr", "docs"],
	},
	{
		id: "config",
		scope: "config",
		source_roots: [
			".afol/config.json",
			".agents/config.json",
			".agents/lock.json",
			".agents/manifest.json",
		],
		tags: ["pstr", "config"],
	},
];

const SAFE_AREA_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isSafeAreaToken(value: unknown): value is string {
	return typeof value === "string" && SAFE_AREA_TOKEN.test(value);
}

function configPstrAreas(projectRoot: string): unknown {
	const configPath = resolveProjectConfigPath(projectRoot);
	if (!configPath) {
		return undefined;
	}
	const loaded = loadJsonObject(configPath.absolutePath);
	if (!loaded.ok) {
		throw new Error(loaded.error);
	}
	const config = loaded.value;
	if (!Object.hasOwn(config, "pstr")) {
		return undefined;
	}
	if (
		config.pstr === null ||
		typeof config.pstr !== "object" ||
		Array.isArray(config.pstr)
	) {
		throw new Error("Invalid pstr: expected an object with areas");
	}
	const pstr = config.pstr as Record<string, unknown>;
	if (!Object.hasOwn(pstr, "areas")) {
		throw new Error("Invalid pstr.areas: expected an array");
	}
	return pstr.areas;
}

function pathIsInside(root: string, target: string): boolean {
	const child = relative(root, target);
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function assertConfiguredRootSafe(
	projectRoot: string,
	rootValue: string,
): string {
	const raw = rootValue.trim().replace(/\\/g, "/");
	if (!raw || isAbsolute(raw) || /^[A-Za-z]:\//.test(raw)) {
		throw new Error(`Invalid pstr source root: ${rootValue}`);
	}
	const normalized = raw.replace(/^\.\//, "").replace(/\/+/g, "/");
	const explicitDirectory = normalized.endsWith("/");
	const parts = normalized.split("/").filter((part) => part && part !== ".");
	if (parts.some((part) => part === ".." || part.toLowerCase() === ".afol")) {
		throw new Error(`Invalid pstr source root: ${rootValue}`);
	}
	const relativeRoot = parts.join("/") || ".";
	const realProjectRoot = realpathSync(projectRoot);
	const candidate = resolve(realProjectRoot, relativeRoot);
	let probe = candidate;
	while (
		!existsSync(probe) &&
		probe !== realProjectRoot &&
		probe !== dirnamePath(probe)
	) {
		probe = dirnamePath(probe);
	}
	const realProbe = realpathSync(probe);
	if (!pathIsInside(realProjectRoot, realProbe)) {
		throw new Error(`Pstr source root escapes project root: ${rootValue}`);
	}
	if (
		existsSync(candidate) &&
		!pathIsInside(realProjectRoot, realpathSync(candidate))
	) {
		throw new Error(
			`Pstr source root crosses symlink outside project root: ${rootValue}`,
		);
	}
	const isDirectory =
		existsSync(candidate) && statSync(candidate).isDirectory();
	return `${relativeRoot}${explicitDirectory || isDirectory ? "/" : ""}`;
}

function dirnamePath(pathValue: string): string {
	const index = pathValue.lastIndexOf(sep);
	return index <= 0 ? sep : pathValue.slice(0, index);
}

function validateAreaToken(kind: string, value: unknown): string {
	if (typeof value !== "string" || !SAFE_AREA_TOKEN.test(value.trim())) {
		throw new Error(`Invalid pstr ${kind}: ${String(value)}`);
	}
	return value.trim();
}

export function resolvePstrAreas(
	projectRoot: string,
): readonly PstrAreaRegistryEntry[] {
	const configured = configPstrAreas(projectRoot);
	if (configured === undefined) {
		return PSTR_AREAS;
	}
	if (!Array.isArray(configured)) {
		throw new Error("Invalid pstr.areas: expected an array");
	}

	const defaultsById = new Set(PSTR_AREAS.map((area) => area.id));
	const defaultsByScope = new Set(PSTR_AREAS.map((area) => area.scope));
	const seenIds = new Set(defaultsById);
	const seenScopes = new Set(defaultsByScope);
	const areas = configured.map((raw, index): PstrAreaRegistryEntry => {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			throw new Error(`Invalid pstr.areas[${index}]: expected an object`);
		}
		const value = raw as Record<string, unknown>;
		const id = validateAreaToken("area id", value.id);
		const scope = validateAreaToken("area scope", value.scope);
		if (seenIds.has(id)) throw new Error(`Duplicate pstr area id: ${id}`);
		if (seenScopes.has(scope))
			throw new Error(`Duplicate pstr area scope: ${scope}`);
		if (!Array.isArray(value.source_roots) || value.source_roots.length === 0) {
			throw new Error(`Invalid pstr area source_roots: ${id}`);
		}
		if (!Array.isArray(value.tags) || value.tags.length === 0) {
			throw new Error(`Invalid pstr area tags: ${id}`);
		}
		const sourceRoots = [
			...new Set(
				value.source_roots.map((root) => {
					if (typeof root !== "string")
						throw new Error(`Invalid pstr source root: ${String(root)}`);
					return assertConfiguredRootSafe(projectRoot, root);
				}),
			),
		].sort((left, right) => left.localeCompare(right));
		const tags = [
			...new Set(value.tags.map((tag) => validateAreaToken("tag", tag))),
		].sort((left, right) => left.localeCompare(right));
		seenIds.add(id);
		seenScopes.add(scope);
		return { id, scope, source_roots: sourceRoots, tags };
	});

	return [
		...PSTR_AREAS,
		...areas.sort((left, right) => left.id.localeCompare(right.id)),
	];
}

const STALE_AFTER_DAYS = 30;
const EXCLUDED_DIR_SEGMENTS = new Set([
	"node_modules",
	".git",
	"dist",
	".afol",
	".gitnexus",
	".ruff_cache",
	"coverage",
	".worktree",
	"__pycache__",
]);

function formatNow(): string {
	return new Date().toISOString();
}

function normalizeRelativePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+$/g, "");
}

function normalizeChangedPath(projectRoot: string, pathValue: string): string {
	const trimmed = pathValue.trim();
	if (!trimmed) {
		return "";
	}

	const normalized = trimmed.replace(/\\/g, "/");
	const relativePath = isAbsolute(normalized)
		? toRelativeProjectPath(projectRoot, normalized)
		: normalized.replace(/^\.\//, "");
	return normalizeRelativePath(relativePath);
}

function toRelativeProjectPath(projectRoot: string, pathValue: string): string {
	return relative(projectRoot, pathValue).replace(/\\/g, "/");
}

function uniqueSorted(items: string[]): string[] {
	return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

function isExcludedDirectory(
	projectRoot: string,
	directoryPath: string,
): boolean {
	const normalizedPath = toRelativeProjectPath(projectRoot, directoryPath);
	if (normalizedPath === ".") {
		return false;
	}
	return normalizedPath
		.split("/")
		.some((segment) => EXCLUDED_DIR_SEGMENTS.has(segment));
}

function collectFilesUnder(root: string, startPath: string): string[] {
	const startRoot = resolve(root, startPath);
	if (!existsSync(startRoot)) {
		return [];
	}

	const sourceStat = statSync(startRoot);
	if (sourceStat.isFile()) {
		return [toRelativeProjectPath(root, startRoot)];
	}

	const out: string[] = [];
	const stack: string[] = [startRoot];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		for (const entry of entries) {
			const entryPath = resolve(current, entry.name);
			const relativePath = toRelativeProjectPath(root, entryPath);
			if (entry.isSymbolicLink()) {
				continue;
			}

			if (entry.isDirectory()) {
				if (isExcludedDirectory(root, entryPath)) {
					continue;
				}
				stack.push(entryPath);
				continue;
			}

			if (entry.isFile()) {
				out.push(relativePath);
			}
		}
	}

	return uniqueSorted(out);
}

function collectSourceFiles(projectRoot: string, sourcePath: string): string[] {
	const normalizedSourcePath = normalizeRelativePath(sourcePath);
	const collected = collectFilesUnder(projectRoot, normalizedSourcePath);
	if (normalizedSourcePath === "cli") {
		return collected.filter((path) => !path.startsWith("cli/tests/"));
	}
	return collected;
}

function computeAggregateHash(projectRoot: string, files: string[]): string {
	const sortedFiles = uniqueSorted(files);
	const payload: string[] = [];

	for (const file of sortedFiles) {
		const absPath = resolve(projectRoot, file);
		if (!existsSync(absPath)) {
			continue;
		}
		const content = readFileSync(absPath, "utf8");
		payload.push(`${file}\0${computeSourceHash(content).hash}`);
	}

	return computeSourceHash(payload.join("\n")).hash;
}

function staleAfter(updatedAt: string): string {
	const updatedTime = Date.parse(updatedAt);
	return new Date(
		updatedTime + STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();
}

function buildMapEntry(
	projectRoot: string,
	area: PstrAreaRegistryEntry,
): PstrMapEntry {
	const files = uniqueSorted(
		area.source_roots.flatMap((sourcePath) =>
			collectSourceFiles(projectRoot, sourcePath),
		),
	);
	const updatedAt = formatNow();

	return {
		id: area.id,
		scope: area.scope,
		status: "current",
		authority: "observed",
		source_paths: files,
		source_hash: computeAggregateHash(projectRoot, files),
		file_count: files.length,
		updated_at: updatedAt,
		stale_after: staleAfter(updatedAt),
		tags: uniqueSorted(area.tags),
	};
}

function buildLiveMapEntries(
	projectRoot: string,
	areaIds?: Iterable<string>,
	areas: readonly PstrAreaRegistryEntry[] = resolvePstrAreas(projectRoot),
): PstrMapEntry[] {
	const allowedIds = areaIds ? new Set(areaIds) : null;
	return areas
		.filter((area) => !allowedIds || allowedIds.has(area.id))
		.map((area) => buildMapEntry(projectRoot, area))
		.filter((entry) => entry.file_count > 0);
}

function mergePstrMapEntries(
	previousMaps: PstrMapEntry[],
	affectedAreaIds: string[],
	replacementEntries: PstrMapEntry[],
	areas: readonly PstrAreaRegistryEntry[],
): PstrMapEntry[] {
	const affectedIdSet = new Set(affectedAreaIds);
	const previousById = new Map(previousMaps.map((entry) => [entry.id, entry]));
	const replacementById = new Map(
		replacementEntries.map((entry) => [entry.id, entry]),
	);

	return areas
		.map((area) =>
			affectedIdSet.has(area.id)
				? replacementById.get(area.id)
				: previousById.get(area.id),
		)
		.filter((entry): entry is PstrMapEntry => Boolean(entry));
}

function buildPstrSnapshot(
	projectRoot: string,
	maps: PstrMapEntry[],
	areas: readonly PstrAreaRegistryEntry[],
): PstrIndexSnapshot {
	const pstrPaths = resolveProjectPaths(projectRoot);
	const snapshot: PstrIndexSnapshot = {
		kind: "pstr_index_v1",
		version: 1,
		generated_at: formatNow(),
		source: {
			project_root: resolve(projectRoot),
			pstr_dir: pstrPaths.abs.pstrDir,
		},
		maps,
	};
	return {
		...snapshot,
		manifest: buildPstrSnapshotManifest(snapshot, projectRoot, areas),
	};
}

function sourceRootMatchesPath(path: string, sourceRoot: string): boolean {
	const normalizedSourceRoot = normalizeRelativePath(sourceRoot);
	if (sourceRoot.endsWith("/")) {
		if (normalizedSourceRoot === ".") {
			return true;
		}
		return (
			path === normalizedSourceRoot ||
			path.startsWith(`${normalizedSourceRoot}/`)
		);
	}
	return path === normalizedSourceRoot;
}

function getAreaById(
	projectRoot: string,
	id: string,
	areas: readonly PstrAreaRegistryEntry[] = resolvePstrAreas(projectRoot),
): PstrAreaRegistryEntry | undefined {
	return areas.find((area) => area.id === id);
}

function compareStringArrays(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function mapEntriesMatch(left: PstrMapEntry, right: PstrMapEntry): boolean {
	return (
		left.id === right.id &&
		left.scope === right.scope &&
		left.status === right.status &&
		left.authority === right.authority &&
		left.source_hash === right.source_hash &&
		left.file_count === right.file_count &&
		compareStringArrays(left.source_paths, right.source_paths) &&
		compareStringArrays(left.tags, right.tags)
	);
}

function snapshotBelongsToRoot(
	root: string,
	snapshot: PstrIndexSnapshot | null,
): snapshot is PstrIndexSnapshot {
	if (!snapshot) {
		return false;
	}

	const paths = resolveProjectPaths(root);
	return (
		snapshot.source.project_root === resolve(root) &&
		snapshot.source.pstr_dir === paths.abs.pstrDir
	);
}

function loadValidPstrIndex(root: string): PstrIndexSnapshot | null {
	const indexPath = pstrIndexPath(root);
	if (!existsSync(indexPath)) {
		return null;
	}

	const snapshot = readJsonFile<PstrIndexSnapshot>(indexPath);
	return snapshotShapeIsValid(snapshot) ? snapshot : null;
}

function buildDiffEntry(
	root: string,
	id: string,
	reason: string,
	snapshot: PstrMapEntry | null,
	live: PstrMapEntry | null,
): PstrDiffEntry {
	const area = getAreaById(root, id);
	return {
		id,
		scope: live?.scope ?? snapshot?.scope ?? area?.scope ?? id,
		source_roots: area ? [...area.source_roots] : [],
		section_path: pstrAreaPath(root, id),
		reason,
		snapshot,
		live,
	};
}

function snapshotEntryIsStale(root: string, entry: PstrMapEntry): boolean {
	if (!Number.isFinite(Date.parse(entry.stale_after))) {
		return true;
	}
	if (Date.parse(entry.stale_after) <= Date.now()) {
		return true;
	}
	return !existsSync(pstrAreaPath(root, entry.id));
}

function manifestEntriesMatch(
	left: PstrSnapshotManifestEntry,
	right: PstrSnapshotManifestEntry,
): boolean {
	return (
		left.id === right.id &&
		left.scope === right.scope &&
		left.status === right.status &&
		left.source_hash === right.source_hash &&
		left.file_count === right.file_count &&
		left.updated_at === right.updated_at &&
		left.stale_after === right.stale_after &&
		compareStringArrays(left.source_roots, right.source_roots) &&
		compareStringArrays(left.source_paths, right.source_paths) &&
		compareStringArrays(left.tags, right.tags)
	);
}

function manifestMatchesSnapshot(
	manifest: PstrSnapshotManifest,
	snapshot: PstrIndexSnapshot,
): boolean {
	const expected = buildPstrSnapshotManifest(
		snapshot,
		snapshot.source.project_root,
	);
	if (!compareStringArrays(manifest.area_order, expected.area_order)) {
		return false;
	}

	const expectedIds = Object.keys(expected.areas).sort((a, b) =>
		a.localeCompare(b),
	);
	const actualIds = Object.keys(manifest.areas).sort((a, b) =>
		a.localeCompare(b),
	);
	if (!compareStringArrays(actualIds, expectedIds)) {
		return false;
	}

	return expectedIds.every((id) => {
		const actualEntry = manifest.areas[id];
		const expectedEntry = expected.areas[id];
		return Boolean(
			actualEntry &&
				expectedEntry &&
				manifestEntriesMatch(actualEntry, expectedEntry),
		);
	});
}

export function buildPstrSnapshotManifest(
	input: Pick<PstrIndexSnapshot, "maps">,
	projectRoot?: string,
	areaRegistry?: readonly PstrAreaRegistryEntry[],
): PstrSnapshotManifest {
	const resolvedAreas =
		areaRegistry ?? (projectRoot ? resolvePstrAreas(projectRoot) : PSTR_AREAS);
	const areaEntries = Object.fromEntries(
		input.maps.map((entry) => {
			const area = resolvedAreas.find((candidate) => candidate.id === entry.id);
			return [
				entry.id,
				{
					id: entry.id,
					scope: entry.scope,
					status: entry.status,
					source_roots: area ? [...area.source_roots] : [],
					source_paths: [...entry.source_paths],
					source_hash: entry.source_hash,
					file_count: entry.file_count,
					updated_at: entry.updated_at,
					stale_after: entry.stale_after,
					tags: [...entry.tags],
				} satisfies PstrSnapshotManifestEntry,
			];
		}),
	);

	return {
		area_order: input.maps.map((entry) => entry.id),
		areas: areaEntries,
	};
}

export function getPstrAffectedAreas(
	projectRoot: string,
	changedPaths: string[],
): PstrAffectedArea[] {
	const areas = resolvePstrAreas(projectRoot);
	return uniqueSorted(
		changedPaths
			.map((pathValue) => normalizeChangedPath(projectRoot, pathValue))
			.filter((pathValue) => pathValue.length > 0),
	).map((pathValue) => {
		const affected = areas.filter((area) =>
			area.source_roots.some((sourceRoot) =>
				sourceRootMatchesPath(pathValue, sourceRoot),
			),
		);
		return {
			path: pathValue,
			area_ids: affected.map((area) => area.id),
			scopes: affected.map((area) => area.scope),
		};
	});
}

function getAffectedAreaIds(
	projectRoot: string,
	changedPaths: string[],
): string[] {
	return uniqueSorted(
		getPstrAffectedAreas(projectRoot, changedPaths).flatMap(
			(entry) => entry.area_ids,
		),
	);
}

export function buildPstrIndexSnapshot(projectRoot: string): PstrIndexSnapshot {
	const areas = resolvePstrAreas(projectRoot);
	return buildPstrSnapshot(
		projectRoot,
		buildLiveMapEntries(projectRoot, undefined, areas),
		areas,
	);
}

export function buildPstrDiff(
	root: string,
	options: PstrRebuildOptions = {},
): PstrDiffResult {
	const areas = resolvePstrAreas(root);
	const liveMaps = new Map(
		buildLiveMapEntries(root, undefined, areas).map(
			(entry) => [entry.id, entry] as const,
		),
	);
	const snapshot = loadValidPstrIndex(root);
	const snapshotMaps = new Map(
		(snapshot?.maps ?? []).map((entry) => [entry.id, entry] as const),
	);
	const allIds = uniqueSorted([
		...areas.map((area) => area.id),
		...snapshotMaps.keys(),
		...liveMaps.keys(),
	]);
	const diff: PstrDiffResult = {
		snapshot_exists: existsSync(pstrIndexPath(root)),
		affected_paths: getPstrAffectedAreas(root, options.changedPaths ?? []),
		added: [],
		removed: [],
		changed: [],
		unchanged: [],
		missing: [],
		stale: [],
	};

	for (const id of allIds) {
		const live = liveMaps.get(id) ?? null;
		const saved = snapshotMaps.get(id) ?? null;
		if (!saved && !live) {
			continue;
		}
		if (!saved && live) {
			diff.added.push(
				buildDiffEntry(root, id, "snapshot missing live area", null, live),
			);
			continue;
		}
		if (saved && !live) {
			diff.removed.push(
				buildDiffEntry(
					root,
					id,
					"live area no longer has source files",
					saved,
					null,
				),
			);
			continue;
		}
		if (!saved || !live) {
			continue;
		}
		if (!existsSync(pstrAreaPath(root, id))) {
			diff.missing.push(
				buildDiffEntry(root, id, "missing pstr section file", saved, live),
			);
			continue;
		}
		if (
			!snapshotBelongsToRoot(root, snapshot) ||
			snapshotEntryIsStale(root, saved)
		) {
			diff.stale.push(
				buildDiffEntry(root, id, "snapshot entry is stale", saved, live),
			);
			continue;
		}
		if (!mapEntriesMatch(saved, live)) {
			diff.changed.push(
				buildDiffEntry(
					root,
					id,
					"live area differs from snapshot",
					saved,
					live,
				),
			);
			continue;
		}
		diff.unchanged.push(
			buildDiffEntry(root, id, "snapshot matches live area", saved, live),
		);
	}

	return diff;
}

export function detectPstrAreas(projectRoot: string): PstrDetectedArea[] {
	return resolvePstrAreas(projectRoot)
		.map((area) => {
			const files = uniqueSorted(
				area.source_roots.flatMap((sourcePath) =>
					collectSourceFiles(projectRoot, sourcePath),
				),
			);
			return {
				id: area.id,
				scope: area.scope,
				source_roots: [...area.source_roots],
				file_count: files.length,
				tags: uniqueSorted(area.tags),
			};
		})
		.filter((area) => area.file_count > 0);
}

export function suggestPstrChanges(root: string): PstrSuggestion[] {
	const suggestions: PstrSuggestion[] = [];
	const validation = validatePstrIndex(root);
	if (!validation.ok) {
		suggestions.push({
			id: "rebuild-all",
			severity: "fail",
			message: validation.message,
			action: "run afol pstr rebuild",
		});
	}

	for (const stale of checkPstrStale(root)) {
		if (!stale.stale) {
			continue;
		}
		suggestions.push({
			id: `rebuild-${stale.id}`,
			severity: "warn",
			message: stale.message,
			action: `run afol pstr rebuild for ${stale.id}`,
		});
	}

	return suggestions.length > 0
		? suggestions
		: [
				{
					id: "current",
					severity: "info",
					message: "pstr index is current",
					action: "none",
				},
			];
}

export function reviewPstrCandidates(root: string): PstrReviewCandidate[] {
	const suggestions = suggestPstrChanges(root).filter(
		(suggestion) => suggestion.id !== "current",
	);
	if (suggestions.length === 0) {
		return [];
	}
	return [
		{
			id: "rebuild-all",
			title: "Rebuild every PSTR map",
			action: "rebuild-all",
			reason: suggestions.map((suggestion) => suggestion.message).join("; "),
		},
	];
}

function readJsonFile<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

function pstrIndexPath(root: string): string {
	return join(resolveProjectPaths(root).abs.pstrDir, "index.json");
}

function pstrAreaPath(root: string, areaId: string): string {
	if (!isSafeAreaToken(areaId)) {
		throw new Error(`Invalid pstr section id: ${areaId}`);
	}
	return join(resolveProjectPaths(root).abs.pstrDir, `${areaId}.md`);
}

function writeSnapshot<T>(path: string, snapshot: T): T {
	mkdirSync(resolve(path, ".."), { recursive: true });
	atomicWriteText(path, `${JSON.stringify(snapshot)}\n`);
	return snapshot;
}

function writeAreaMarkdown(root: string, entry: PstrMapEntry): void {
	const frontmatter = [
		"---",
		"doc_type: pstr_map",
		`id: ${entry.id}`,
		`status: ${entry.status}`,
		"authority: observed",
		`scope: ${entry.scope}`,
		"source:",
		"  generated_by: afol pstr rebuild",
		"  source_paths:",
		...(entry.source_paths.length > 0
			? entry.source_paths.map((path) => `  - ${path}`)
			: ["  - "]),
		`  source_hash: "${entry.source_hash}"`,
		`  file_count: ${entry.file_count}`,
		`updated_at: ${entry.updated_at}`,
		`stale_after: ${entry.stale_after}`,
		"tags:",
		...entry.tags.map((tag) => `  - ${tag}`),
		"---",
		"",
		`# PSTR: ${entry.scope}`,
		"",
		"## Files",
		"",
		...(entry.source_paths.length > 0
			? entry.source_paths.map((path) => `- ${path}`)
			: ["- (none)"]),
		"",
		"> This map is generated. Do not edit by hand. Run `afol pstr rebuild` to refresh.",
		"",
	].join("\n");

	atomicWriteText(pstrAreaPath(root, entry.id), `${frontmatter}`);
}

function manifestShapeIsValid(
	manifest: unknown,
): manifest is PstrSnapshotManifest {
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		return false;
	}

	const candidate = manifest as PstrSnapshotManifest;
	if (!Array.isArray(candidate.area_order)) {
		return false;
	}
	if (
		!candidate.area_order.every((id) => typeof id === "string") ||
		!candidate.areas ||
		typeof candidate.areas !== "object" ||
		Array.isArray(candidate.areas)
	) {
		return false;
	}

	return Object.values(candidate.areas).every(
		(entry) =>
			entry &&
			typeof entry === "object" &&
			isSafeAreaToken(entry.id) &&
			isSafeAreaToken(entry.scope) &&
			(entry.status === "current" ||
				entry.status === "stale" ||
				entry.status === "partial" ||
				entry.status === "missing") &&
			Array.isArray(entry.source_roots) &&
			entry.source_roots.every((path) => typeof path === "string") &&
			Array.isArray(entry.source_paths) &&
			entry.source_paths.every((path) => typeof path === "string") &&
			typeof entry.source_hash === "string" &&
			typeof entry.file_count === "number" &&
			typeof entry.updated_at === "string" &&
			typeof entry.stale_after === "string" &&
			Array.isArray(entry.tags) &&
			entry.tags.every((tag) => typeof tag === "string"),
	);
}

function snapshotShapeIsValid(
	snapshot: PstrIndexSnapshot | null,
): snapshot is PstrIndexSnapshot {
	return Boolean(
		snapshot &&
			snapshot.kind === "pstr_index_v1" &&
			snapshot.version === 1 &&
			typeof snapshot.generated_at === "string" &&
			snapshot.source !== null &&
			typeof snapshot.source === "object" &&
			!Array.isArray(snapshot.source) &&
			typeof snapshot.source.project_root === "string" &&
			typeof snapshot.source.pstr_dir === "string" &&
			Array.isArray(snapshot.maps) &&
			snapshot.maps.every(
				(entry) =>
					isSafeAreaToken(entry.id) &&
					isSafeAreaToken(entry.scope) &&
					(entry.status === "current" ||
						entry.status === "stale" ||
						entry.status === "partial" ||
						entry.status === "missing") &&
					entry.authority === "observed" &&
					Array.isArray(entry.source_paths) &&
					entry.source_paths.every((path) => typeof path === "string") &&
					typeof entry.source_hash === "string" &&
					typeof entry.file_count === "number" &&
					typeof entry.updated_at === "string" &&
					typeof entry.stale_after === "string" &&
					Array.isArray(entry.tags) &&
					entry.tags.every((tag) => typeof tag === "string"),
			) &&
			(snapshot.manifest === undefined ||
				manifestShapeIsValid(snapshot.manifest)),
	);
}

export function rebuildPstrIndex(
	projectRoot: string,
	options: PstrRebuildOptions = {},
): PstrIndexSnapshot {
	const areas = resolvePstrAreas(projectRoot);
	const rawPreviousSnapshot = loadValidPstrIndex(projectRoot);
	const previousSnapshot = snapshotBelongsToRoot(
		projectRoot,
		rawPreviousSnapshot,
	)
		? rawPreviousSnapshot
		: null;
	const registryConfigChanged = options.changedPaths?.some((pathValue) => {
		const normalized = normalizeChangedPath(projectRoot, pathValue);
		return (
			normalized === ".afol/config.json" || normalized === ".agents/config.json"
		);
	});
	const affectedAreaIds =
		!registryConfigChanged &&
		options.changedPaths &&
		options.changedPaths.length > 0
			? getAffectedAreaIds(projectRoot, options.changedPaths)
			: null;
	let snapshot: PstrIndexSnapshot;
	let rewrittenAreaIds: string[] | null = null;

	if (previousSnapshot && affectedAreaIds) {
		snapshot = buildPstrSnapshot(
			projectRoot,
			mergePstrMapEntries(
				previousSnapshot.maps,
				affectedAreaIds,
				affectedAreaIds.length > 0
					? buildLiveMapEntries(projectRoot, affectedAreaIds, areas)
					: [],
				areas,
			),
			areas,
		);
		rewrittenAreaIds = affectedAreaIds;
	} else {
		snapshot = buildPstrIndexSnapshot(projectRoot);
	}

	writeSnapshot(pstrIndexPath(projectRoot), snapshot);
	const previousAreaIds = new Set(
		previousSnapshot?.maps.map((entry) => entry.id) ?? [],
	);
	const nextAreaIds = new Set(snapshot.maps.map((entry) => entry.id));
	for (const previousAreaId of previousAreaIds) {
		if (!nextAreaIds.has(previousAreaId)) {
			rmSync(pstrAreaPath(projectRoot, previousAreaId), { force: true });
		}
	}

	const rewrittenAreaIdSet =
		rewrittenAreaIds === null ? null : new Set(rewrittenAreaIds);
	const entriesToWrite =
		rewrittenAreaIdSet === null
			? snapshot.maps
			: snapshot.maps.filter((entry) => rewrittenAreaIdSet.has(entry.id));
	for (const entry of entriesToWrite) {
		writeAreaMarkdown(projectRoot, entry);
	}
	return snapshot;
}

export function validatePstrIndex(root: string): PstrValidationResult {
	const indexPath = pstrIndexPath(root);
	if (!existsSync(indexPath)) {
		return { ok: false, message: `missing pstr index snapshot: ${indexPath}` };
	}

	const snapshot = readJsonFile<PstrIndexSnapshot>(indexPath);
	if (!snapshotShapeIsValid(snapshot)) {
		return { ok: false, message: `invalid pstr index snapshot: ${indexPath}` };
	}
	try {
		resolvePstrAreas(root);
	} catch (error) {
		return {
			ok: false,
			message: `invalid pstr area configuration: ${(error as Error).message}`,
		};
	}

	const paths = resolveProjectPaths(root);
	if (
		snapshot.source.project_root !== resolve(root) ||
		snapshot.source.pstr_dir !== paths.abs.pstrDir
	) {
		return { ok: false, message: `stale pstr index snapshot: ${indexPath}` };
	}
	if (
		snapshot.manifest &&
		!manifestMatchesSnapshot(snapshot.manifest, snapshot)
	) {
		return { ok: false, message: `stale pstr index snapshot: ${indexPath}` };
	}

	const current = new Map(
		buildLiveMapEntries(root).map((entry) => [entry.id, entry] as const),
	);
	if (snapshot.maps.length !== current.size) {
		return { ok: false, message: `stale pstr index snapshot: ${indexPath}` };
	}
	for (const entry of snapshot.maps) {
		const live = current.get(entry.id);
		if (!live) {
			return { ok: false, message: `unknown pstr map entry: ${entry.id}` };
		}
		if (!mapEntriesMatch(entry, live)) {
			return { ok: false, message: `stale pstr index snapshot: ${indexPath}` };
		}
	}

	return { ok: true, message: `ok pstr index snapshot: ${indexPath}` };
}

export function checkPstrStale(
	root: string,
): { id: string; stale: boolean; message: string }[] {
	const rawSnapshot = loadValidPstrIndex(root);
	const snapshot = snapshotBelongsToRoot(root, rawSnapshot)
		? rawSnapshot
		: null;
	const liveEntries = buildLiveMapEntries(root);
	if (!snapshot) {
		return liveEntries.map((entry) => ({
			id: entry.id,
			stale: true,
			message: `missing pstr index snapshot: ${pstrIndexPath(root)}`,
		}));
	}

	const liveById = new Map(liveEntries.map((entry) => [entry.id, entry]));
	return snapshot.maps.map((entry) => {
		const liveEntry = liveById.get(entry.id);
		const stale =
			snapshotEntryIsStale(root, entry) ||
			!liveEntry ||
			!mapEntriesMatch(entry, liveEntry);
		return {
			id: entry.id,
			stale,
			message: stale
				? `stale pstr map: ${entry.id}`
				: `current pstr map: ${entry.id}`,
		};
	});
}

export function getPstrIndex(root: string): PstrIndexSnapshot | null {
	resolvePstrAreas(root);
	const indexPath = pstrIndexPath(root);
	if (!existsSync(indexPath)) {
		return null;
	}
	return readJsonFile<PstrIndexSnapshot>(indexPath);
}

export function getPstrSection(
	root: string,
	idOrScope: string,
):
	| { ok: true; entry: PstrMapEntry; content: string }
	| { ok: false; message: string }
	| null {
	const index = getPstrIndex(root);
	if (!index) {
		return {
			ok: false,
			message: `missing pstr index snapshot: ${pstrIndexPath(root)}`,
		};
	}
	const areas = resolvePstrAreas(root);

	const needle = idOrScope.trim().toLowerCase();
	if (!needle) {
		return null;
	}

	const entry = index.maps.find((map) => {
		const area = areas.find((candidate) => candidate.id === map.id);
		return Boolean(
			area &&
				(map.id.toLowerCase() === needle || map.scope.toLowerCase() === needle),
		);
	});
	if (!entry) {
		return null;
	}
	if (
		entry.id.includes("/") ||
		entry.id.includes("\\") ||
		entry.id.includes("..")
	) {
		return { ok: false, message: `invalid pstr section id: ${entry.id}` };
	}

	const path = pstrAreaPath(root, entry.id);
	if (!existsSync(path)) {
		return { ok: false, message: `missing pstr section file: ${path}` };
	}

	try {
		return { ok: true, entry, content: readFileSync(path, "utf8") };
	} catch {
		return { ok: false, message: `failed to read pstr section file: ${path}` };
	}
}
