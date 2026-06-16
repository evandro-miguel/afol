import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { computeSourceHash } from "../../core/source-hash";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import type {
	PstrDetectedArea,
	PstrIndexSnapshot,
	PstrMapEntry,
	PstrReviewCandidate,
	PstrSuggestion,
	PstrValidationResult,
} from "./types";

type PstrArea = {
	id: string;
	scope: string;
	sourcePaths: string[];
	tags: string[];
};

const PSTR_AREAS: PstrArea[] = [
	{
		id: "cli",
		scope: "cli",
		sourcePaths: ["cli/"],
		tags: ["pstr", "cli", "typescript"],
	},
	{
		id: "template",
		scope: "template",
		sourcePaths: ["src/project-template/"],
		tags: ["pstr", "template"],
	},
	{ id: "docs", scope: "docs", sourcePaths: ["docs/"], tags: ["pstr", "docs"] },
	{
		id: "config",
		scope: "config",
		sourcePaths: [
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

function buildMapEntry(projectRoot: string, area: PstrArea): PstrMapEntry {
	const files = uniqueSorted(
		area.sourcePaths.flatMap((sourcePath) =>
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

export function buildPstrIndexSnapshot(projectRoot: string): PstrIndexSnapshot {
	const pstrPaths = resolveProjectPaths(projectRoot);
	const maps = PSTR_AREAS.map((area) =>
		buildMapEntry(projectRoot, area),
	).filter((entry) => entry.file_count > 0);

	return {
		kind: "pstr_index_v1",
		version: 1,
		generated_at: formatNow(),
		source: {
			project_root: resolve(projectRoot),
			pstr_dir: pstrPaths.abs.pstrDir,
		},
		maps,
	};
}

export function detectPstrAreas(projectRoot: string): PstrDetectedArea[] {
	return PSTR_AREAS.map((area) => {
		const files = uniqueSorted(
			area.sourcePaths.flatMap((sourcePath) =>
				collectSourceFiles(projectRoot, sourcePath),
			),
		);
		return {
			id: area.id,
			scope: area.scope,
			source_roots: [...area.sourcePaths],
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
			),
	);
}

export function rebuildPstrIndex(projectRoot: string): PstrIndexSnapshot {
	const snapshot = buildPstrIndexSnapshot(projectRoot);

	writeSnapshot(pstrIndexPath(projectRoot), snapshot);
	for (const entry of snapshot.maps) {
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

	const current = new Map(
		PSTR_AREAS.map((area) => [area.id, buildMapEntry(root, area)] as const),
	);
	if (snapshot.maps.length !== PSTR_AREAS.length) {
		return { ok: false, message: `stale pstr index snapshot: ${indexPath}` };
	}
	for (const entry of snapshot.maps) {
		const live = current.get(entry.id);
		if (!live) {
			return { ok: false, message: `unknown pstr map entry: ${entry.id}` };
		}
		if (
			entry.scope !== live.scope ||
			entry.status !== live.status ||
			entry.authority !== live.authority ||
			entry.file_count !== live.file_count ||
			entry.source_hash !== live.source_hash ||
			entry.source_paths.length !== live.source_paths.length ||
			entry.source_paths.some(
				(path, index) => path !== live.source_paths[index],
			)
		) {
			return { ok: false, message: `stale pstr index snapshot: ${indexPath}` };
		}
	}

	return { ok: true, message: `ok pstr index snapshot: ${indexPath}` };
}

export function checkPstrStale(
	root: string,
): { id: string; stale: boolean; message: string }[] {
	const snapshot = getPstrIndex(root);
	if (!snapshot) {
		return PSTR_AREAS.map((area) => ({
			id: area.id,
			stale: true,
			message: `missing pstr index snapshot: ${pstrIndexPath(root)}`,
		}));
	}

	const now = Date.now();
	return PSTR_AREAS.map((area) => {
		const entry = snapshot.maps.find((map) => map.id === area.id);
		if (!entry) {
			return {
				id: area.id,
				stale: true,
				message: `missing pstr map entry: ${area.id}`,
			};
		}
		const stale = Number.isFinite(Date.parse(entry.stale_after))
			? Date.parse(entry.stale_after) <= now
			: true;
		return {
			id: area.id,
			stale,
			message: stale
				? `stale pstr map: ${area.id}`
				: `current pstr map: ${area.id}`,
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
