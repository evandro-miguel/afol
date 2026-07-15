import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { computeSourceHash } from "../../core/source-hash";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
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
	if (sourceStat.isFile() || extname(startPath) !== "") {
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
): PstrMapEntry[] {
	const allowedIds = areaIds ? new Set(areaIds) : null;
	return PSTR_AREAS.filter((area) => !allowedIds || allowedIds.has(area.id))
		.map((area) => buildMapEntry(projectRoot, area))
		.filter((entry) => entry.file_count > 0);
}

function mergePstrMapEntries(
	previousMaps: PstrMapEntry[],
	affectedAreaIds: string[],
	replacementEntries: PstrMapEntry[],
): PstrMapEntry[] {
	const affectedIdSet = new Set(affectedAreaIds);
	const previousById = new Map(previousMaps.map((entry) => [entry.id, entry]));
	const replacementById = new Map(
		replacementEntries.map((entry) => [entry.id, entry]),
	);

	return PSTR_AREAS.map((area) =>
		affectedIdSet.has(area.id)
			? replacementById.get(area.id)
			: previousById.get(area.id),
	).filter((entry): entry is PstrMapEntry => Boolean(entry));
}

function buildPstrSnapshot(
	projectRoot: string,
	maps: PstrMapEntry[],
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
		manifest: buildPstrSnapshotManifest(snapshot),
	};
}

function sourceRootMatchesPath(path: string, sourceRoot: string): boolean {
	const normalizedSourceRoot = normalizeRelativePath(sourceRoot);
	if (sourceRoot.endsWith("/")) {
		return (
			path === normalizedSourceRoot ||
			path.startsWith(`${normalizedSourceRoot}/`)
		);
	}
	return path === normalizedSourceRoot;
}

function getAreaById(id: string): PstrAreaRegistryEntry | undefined {
	return PSTR_AREAS.find((area) => area.id === id);
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
	const area = getAreaById(id);
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
	const expected = buildPstrSnapshotManifest(snapshot);
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
): PstrSnapshotManifest {
	const areas = Object.fromEntries(
		input.maps.map((entry) => {
			const area = getAreaById(entry.id);
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
		areas,
	};
}

export function getPstrAffectedAreas(
	projectRoot: string,
	changedPaths: string[],
): PstrAffectedArea[] {
	return uniqueSorted(
		changedPaths
			.map((pathValue) => normalizeChangedPath(projectRoot, pathValue))
			.filter((pathValue) => pathValue.length > 0),
	).map((pathValue) => {
		const affected = PSTR_AREAS.filter((area) =>
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
	return buildPstrSnapshot(projectRoot, buildLiveMapEntries(projectRoot));
}

export function buildPstrDiff(
	root: string,
	options: PstrRebuildOptions = {},
): PstrDiffResult {
	const liveMaps = new Map(
		buildLiveMapEntries(root).map((entry) => [entry.id, entry] as const),
	);
	const snapshot = loadValidPstrIndex(root);
	const snapshotMaps = new Map(
		(snapshot?.maps ?? []).map((entry) => [entry.id, entry] as const),
	);
	const allIds = uniqueSorted([
		...PSTR_AREAS.map((area) => area.id),
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
	return PSTR_AREAS.map((area) => {
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
	}).filter((area) => area.file_count > 0);
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
			typeof entry.id === "string" &&
			typeof entry.scope === "string" &&
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
					typeof entry.id === "string" &&
					typeof entry.scope === "string" &&
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
	const rawPreviousSnapshot = loadValidPstrIndex(projectRoot);
	const previousSnapshot = snapshotBelongsToRoot(
		projectRoot,
		rawPreviousSnapshot,
	)
		? rawPreviousSnapshot
		: null;
	const affectedAreaIds =
		options.changedPaths && options.changedPaths.length > 0
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
					? buildLiveMapEntries(projectRoot, affectedAreaIds)
					: [],
			),
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

	const now = Date.now();
	return snapshot.maps.map((entry) => {
		const stale = Number.isFinite(Date.parse(entry.stale_after))
			? Date.parse(entry.stale_after) <= now
			: true;
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

	const needle = idOrScope.trim().toLowerCase();
	if (!needle) {
		return null;
	}

	const entry = index.maps.find(
		(map) =>
			map.id.toLowerCase() === needle || map.scope.toLowerCase() === needle,
	);
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
