import { spawnSync } from "node:child_process";
import {
	type Dirent,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { listRules, type RuleEntry } from "../catalog/rules";
import { listSkills, type SkillEntry } from "../catalog/skills";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";

type ValidationResult = {
	ok: boolean;
	message: string;
};

type LocalIndexMeta = {
	generated_at: string;
};

type FileSourceIndex = {
	version: 1;
	generated_at: string;
	source: {
		project_root: string;
	};
};

export type RuleIndexEntry = {
	id: string;
	name: string;
	path: string;
	surfaces: string[];
	work_types: string[];
	priority: number;
	touched_at: string;
};

export type RulesIndexSnapshot = LocalIndexMeta & {
	kind: "rules_index_v1";
	version: 1;
	source: {
		rules_dir: string;
	};
	rules: RuleIndexEntry[];
};

export type SkillIndexEntry = {
	name: string;
	path: string;
	description: string;
	touched_at: string;
};

export type SkillsIndexSnapshot = LocalIndexMeta & {
	kind: "skills_index_v1";
	version: 1;
	source: {
		skills_dir: string;
	};
	skills: SkillIndexEntry[];
};

export type SpecIndexEntry = {
	id: string;
	path: string;
	title: string;
	touched_at: string;
	status?: string;
	theme?: string;
};

export type SpecsIndexSnapshot = LocalIndexMeta & {
	kind: "specs_index_v1";
	version: 1;
	source: {
		specs_dir: string;
	};
	specs: SpecIndexEntry[];
};

export type FileIndexEntry = {
	path: string;
	bytes: number;
	touched_at: string;
	extension: string;
};

export type FilesIndexSnapshot = FileSourceIndex & {
	kind: "files_index_v1";
	files: FileIndexEntry[];
};

export type ProjectIndexSnapshot = {
	rules: RulesIndexSnapshot;
	skills: SkillsIndexSnapshot;
	specs: SpecsIndexSnapshot;
	files: FilesIndexSnapshot;
};

const FILE_INDEX_EXCLUDED_DIR_SEGMENTS = new Set([
	".git",
	".gitnexus",
	".codex",
	".coverage-trace",
	".memory",
	".pytest_cache",
	".qwen",
	".ruff_cache",
	".tmp",
	".tools",
	".venv",
	"__pycache__",
	"node_modules",
	"private",
]);

const FILE_INDEX_ROOT_EXCLUDED_DIR_SEGMENTS = new Set([
	"build",
	"coverage",
	"dist",
	"env",
	"logs",
	"tmp",
	"venv",
]);

const FILE_INDEX_EXCLUDED_PATHS = new Set([".git", "cli/generated/version.ts"]);
const GIT_FILES_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

const FILE_INDEX_SENSITIVE_FILE_PATTERNS = [
	/^\.env(?:\.|$)/,
	/(?:^|[-_\s.])chaves?(?:[-_\s.]|$)/,
	/(?:^|[-_\s.])credentials?(?:[-_\s.]|$)/,
	/(?:^|[-_\s.])enderecos?(?:[-_\s.]|$)/,
	/(?:^|[-_\s.])keys?(?:[-_\s.]|$)/,
	/^secrets?(?:\.|$)/,
	/(?:^|[-_\s.])senhas?(?:[-_\s.]|$)/,
];

function isSensitiveFileIndexSegment(segment: string): boolean {
	const normalizedSegment = segment.toLowerCase();
	return FILE_INDEX_SENSITIVE_FILE_PATTERNS.some((pattern) =>
		pattern.test(normalizedSegment),
	);
}

const ZERO_TIME = new Date(0).toISOString();
const FRESHNESS_CLOCK_SKEW_MS = 1_000;

function resolveDataIndexPath(root: string, fileName: string): string {
	return resolve(resolveProjectPaths(root).abs.dataIndexDir, fileName);
}

function formatNow(): string {
	return new Date().toISOString();
}

function parseTouchedAt(path: string): string {
	try {
		return statSync(path).mtime.toISOString();
	} catch {
		return ZERO_TIME;
	}
}

function readJsonFile<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

function writeSnapshot<T>(path: string, snapshot: T): T {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });
	atomicWriteText(path, `${JSON.stringify(snapshot)}\n`);
	return snapshot;
}

function toRelativeProjectPath(projectRoot: string, pathValue: string): string {
	return relative(projectRoot, pathValue).replace(/\\/g, "/");
}

function sortByPath<T extends { path: string }>(entries: T[]): T[] {
	return [...entries].sort((a, b) => a.path.localeCompare(b.path));
}

function sortById<T extends { id: string }>(entries: T[]): T[] {
	return [...entries].sort((a, b) => a.id.localeCompare(b.id));
}

function sortByName<T extends { name: string }>(entries: T[]): T[] {
	return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

function uniqueSorted(items: string[]): string[] {
	return [...new Set(items)].sort();
}

function sourceLatestFromPaths(paths: string[]): number {
	let latest = 0;

	for (const sourcePath of paths) {
		if (!existsSync(sourcePath)) {
			continue;
		}
		try {
			latest = Math.max(latest, statSync(sourcePath).mtimeMs);
		} catch {
			// Ignore paths that disappear during a rebuild.
		}
	}

	return latest;
}

function isDirectoryExcluded(
	projectRoot: string,
	directoryPath: string,
	projectPaths = resolveProjectPaths(projectRoot),
): boolean {
	const normalizedPath = toRelativeProjectPath(
		projectRoot,
		directoryPath,
	).replace(/\\/g, "/");
	const pathMatches = (base: string): boolean =>
		normalizedPath === base || normalizedPath.startsWith(`${base}/`);
	const allowedOperationalRoots = [
		projectPaths.rulesDir,
		projectPaths.skillsDir,
	];

	if (normalizedPath === ".") {
		return false;
	}

	if (
		pathMatches(projectPaths.dataIndexDir) ||
		pathMatches(projectPaths.tmpDir) ||
		pathMatches(projectPaths.wbDir) ||
		pathMatches(projectPaths.mutationsDir) ||
		pathMatches(dirname(projectPaths.eventsFile))
	) {
		return true;
	}

	if (
		pathMatches(projectPaths.agentsDir) &&
		!allowedOperationalRoots.some((root) => pathMatches(root))
	) {
		return true;
	}

	if (
		pathMatches(projectPaths.mutableDir) &&
		!allowedOperationalRoots.some((root) => pathMatches(root))
	) {
		return true;
	}

	const segments = normalizedPath.split("/");
	const rootSegment = segments[0];
	if (
		segments.length === 1 &&
		rootSegment !== undefined &&
		FILE_INDEX_ROOT_EXCLUDED_DIR_SEGMENTS.has(rootSegment)
	) {
		return true;
	}
	return segments.some(
		(segment) =>
			FILE_INDEX_EXCLUDED_DIR_SEGMENTS.has(segment.toLowerCase()) ||
			segment.toLowerCase().endsWith(".egg-info") ||
			isSensitiveFileIndexSegment(segment),
	);
}

function isFileExcluded(projectRoot: string, filePath: string): boolean {
	const normalizedPath = toRelativeProjectPath(projectRoot, filePath);
	const segments = normalizedPath.split("/");
	return (
		FILE_INDEX_EXCLUDED_PATHS.has(normalizedPath) ||
		segments.some((segment) => isSensitiveFileIndexSegment(segment))
	);
}

function collectFilesUnder(
	root: string,
	startPath: string,
	predicate: (entry: Dirent, relativePath: string, fullPath: string) => boolean,
	sorted = true,
): string[] {
	const startRoot = resolve(root, startPath);
	if (!existsSync(startRoot)) {
		return [];
	}

	const out: string[] = [];
	const stack: string[] = [startRoot];
	const projectPaths = resolveProjectPaths(root);

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		const entries = readdirSync(current, { withFileTypes: true });
		if (sorted) {
			entries.sort((a, b) => a.name.localeCompare(b.name));
		}
		for (const entry of entries) {
			const entryPath = resolve(current, entry.name);
			const relativePath = toRelativeProjectPath(root, entryPath);

			if (entry.isDirectory()) {
				if (isDirectoryExcluded(root, entryPath, projectPaths)) {
					continue;
				}
				stack.push(entryPath);
				continue;
			}

			if (
				entry.isFile() &&
				!isFileExcluded(root, entryPath) &&
				predicate(entry, relativePath, entryPath)
			) {
				out.push(entryPath);
			}
		}
	}

	return sorted ? out.sort((a, b) => a.localeCompare(b)) : out;
}

function collectSpecFiles(projectRoot: string): string[] {
	return collectFilesUnder(
		projectRoot,
		join(".afol", "adm", "specs"),
		(_entry, relativePath) => relativePath.endsWith(".md"),
	);
}

function collectFileIndexFiles(projectRoot: string, sorted = true): string[] {
	const files = collectFilesUnder(
		projectRoot,
		".",
		(_entry, _relativePath) => true,
		sorted,
	);
	const gitFiles = listGitFilesForIndex(projectRoot);
	if (!gitFiles) {
		return files;
	}

	return files.filter((filePath) =>
		gitFiles.has(toRelativeProjectPath(projectRoot, filePath)),
	);
}

function listGitFilesForIndex(projectRoot: string): Set<string> | null {
	const rootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
		cwd: projectRoot,
		encoding: "utf8",
	});
	if (
		rootResult.status !== 0 ||
		rootResult.error ||
		!rootResult.stdout.trim()
	) {
		return null;
	}

	const filesResult = spawnSync(
		"git",
		["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
		{
			cwd: projectRoot,
			encoding: "utf8",
			maxBuffer: GIT_FILES_MAX_BUFFER_BYTES,
		},
	);
	if (filesResult.status !== 0 || filesResult.error) {
		return new Set();
	}

	return new Set(
		filesResult.stdout
			.split("\0")
			.filter(Boolean)
			.map((filePath) => filePath.replace(/\\/g, "/")),
	);
}

function frontmatterFrom(content: string): Record<string, string> {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!match?.[1]) {
		return {};
	}

	const raw = match[1] ?? "";
	const out: Record<string, string> = {};

	for (const line of raw.split(/\r?\n/)) {
		const colonIndex = line.indexOf(":");
		if (colonIndex < 0) {
			continue;
		}
		const key = line.slice(0, colonIndex).trim();
		const value = line
			.slice(colonIndex + 1)
			.trim()
			.replace(/^['"]|['"]$/g, "");

		if (!key || !value) {
			continue;
		}

		out[key] = value;
	}

	return out;
}

function collectSourceFiles(paths: string[]): string[] {
	return uniqueSorted(paths.filter((path) => existsSync(path)));
}

function latestRulesSource(root: string): number {
	const rulesRoot = resolveProjectPaths(root).abs.rulesDir;
	const rules = listRules(root);
	const rulePaths = rules.map((rule) => join(root, rule.path));
	const sourcePaths = collectSourceFiles([
		rulesRoot,
		join(rulesRoot, "index.json"),
		...rulePaths,
	]);
	return sourceLatestFromPaths(sourcePaths);
}

function latestSkillsSource(root: string): number {
	const skillsRoot = resolveProjectPaths(root).abs.skillsDir;
	const skills = listSkills(root);
	const skillPaths = skills
		.flatMap((skill: SkillEntry) => [
			join(root, skill.path),
			dirname(join(root, skill.path)),
		])
		.concat(skillsRoot);
	const sourcePaths = collectSourceFiles(skillPaths);
	return sourceLatestFromPaths(sourcePaths);
}

function latestSpecsSource(root: string): number {
	const specsPath = join(root, ".afol", "adm", "specs");
	const specs = collectSpecFiles(root);
	return sourceLatestFromPaths(collectSourceFiles([specsPath, ...specs]));
}

function latestFilesSource(root: string): number {
	const files = collectFileIndexFiles(root, false);
	return sourceLatestFromPaths(collectSourceFiles([...files]));
}

function isIsoDate(value: unknown): boolean {
	return Number.isFinite(Date.parse(value as unknown as string));
}

function validateSnapshot<T extends LocalIndexMeta>(
	snapshot: T | null,
	indexPath: string,
	kind: string,
	sourceLatest: number,
): ValidationResult {
	if (!snapshot || !isIsoDate(snapshot.generated_at)) {
		return { ok: false, message: `invalid ${kind} snapshot: ${indexPath}` };
	}

	const generatedAt = Date.parse(snapshot.generated_at);
	if (generatedAt + FRESHNESS_CLOCK_SKEW_MS < sourceLatest) {
		return { ok: false, message: `stale ${kind} snapshot: ${indexPath}` };
	}

	return { ok: true, message: `ok ${kind} snapshot: ${indexPath}` };
}

export function rebuildRulesIndex(root: string): RulesIndexSnapshot {
	const projectPaths = resolveProjectPaths(root);
	const rules = sortById(
		listRules(root).map((rule: RuleEntry) => ({
			id: rule.id,
			name: rule.name,
			path: rule.path,
			surfaces: [...new Set(rule.surfaces)].sort(),
			work_types: [...new Set(rule.workTypes)].sort(),
			priority: rule.priority,
			touched_at: parseTouchedAt(join(root, rule.path)),
		})),
	);

	const snapshot: RulesIndexSnapshot = {
		kind: "rules_index_v1",
		version: 1,
		generated_at: formatNow(),
		source: {
			rules_dir: projectPaths.rulesDir,
		},
		rules,
	};

	const indexPath = resolveDataIndexPath(root, "rules.json");
	return writeSnapshot(indexPath, snapshot);
}

export function validateRulesIndex(root: string): ValidationResult {
	const indexPath = resolveDataIndexPath(root, "rules.json");
	if (!existsSync(indexPath)) {
		return {
			ok: false,
			message: `missing rules index snapshot: ${indexPath}; run afol local-state rebuild`,
		};
	}

	const snapshot = readJsonFile<RulesIndexSnapshot>(indexPath);
	if (
		snapshot?.kind !== "rules_index_v1" ||
		snapshot.version !== 1 ||
		!Array.isArray(snapshot.rules) ||
		snapshot.rules.some(
			(entry) =>
				typeof entry.id !== "string" ||
				typeof entry.name !== "string" ||
				typeof entry.path !== "string" ||
				!Array.isArray(entry.surfaces) ||
				!Array.isArray(entry.work_types) ||
				typeof entry.priority !== "number" ||
				typeof entry.touched_at !== "string",
		)
	) {
		return { ok: false, message: `invalid rules index snapshot: ${indexPath}` };
	}

	return validateSnapshot(
		snapshot,
		indexPath,
		"rules index",
		latestRulesSource(root),
	);
}

export function rebuildSkillsIndex(root: string): SkillsIndexSnapshot {
	const projectPaths = resolveProjectPaths(root);
	const skills = sortByName(
		listSkills(root).map((skill: SkillEntry) => ({
			name: skill.name,
			path: skill.path,
			description: skill.description,
			touched_at: parseTouchedAt(join(root, skill.path)),
		})),
	);

	const snapshot: SkillsIndexSnapshot = {
		kind: "skills_index_v1",
		version: 1,
		generated_at: formatNow(),
		source: {
			skills_dir: projectPaths.skillsDir,
		},
		skills,
	};

	const indexPath = resolveDataIndexPath(root, "skills.json");
	return writeSnapshot(indexPath, snapshot);
}

export function validateSkillsIndex(root: string): ValidationResult {
	const indexPath = resolveDataIndexPath(root, "skills.json");
	if (!existsSync(indexPath)) {
		return {
			ok: false,
			message: `missing skills index snapshot: ${indexPath}; run afol local-state rebuild`,
		};
	}

	const snapshot = readJsonFile<SkillsIndexSnapshot>(indexPath);
	if (
		snapshot?.kind !== "skills_index_v1" ||
		snapshot.version !== 1 ||
		!Array.isArray(snapshot.skills) ||
		snapshot.skills.some(
			(entry) =>
				typeof entry.name !== "string" ||
				typeof entry.path !== "string" ||
				typeof entry.description !== "string" ||
				typeof entry.touched_at !== "string",
		)
	) {
		return {
			ok: false,
			message: `invalid skills index snapshot: ${indexPath}`,
		};
	}

	return validateSnapshot(
		snapshot,
		indexPath,
		"skills index",
		latestSkillsSource(root),
	);
}

export function rebuildSpecsIndex(root: string): SpecsIndexSnapshot {
	const specs = sortByPath(
		collectSpecFiles(root).map((specPath) => {
			const relativePath = toRelativeProjectPath(root, specPath);
			const content = readFileSync(specPath, "utf8");
			const frontmatter = frontmatterFrom(content);
			const fallbackTitle = basename(relativePath);

			return {
				id: frontmatter.id ?? fallbackTitle,
				path: relativePath,
				title: frontmatter.title ?? fallbackTitle,
				touched_at: parseTouchedAt(specPath),
				...(frontmatter.status ? { status: frontmatter.status } : {}),
				...(frontmatter.theme ? { theme: frontmatter.theme } : {}),
			};
		}),
	);

	const snapshot: SpecsIndexSnapshot = {
		kind: "specs_index_v1",
		version: 1,
		generated_at: formatNow(),
		source: {
			specs_dir: ".afol/adm/specs",
		},
		specs,
	};

	const indexPath = resolveDataIndexPath(root, "specs.json");
	return writeSnapshot(indexPath, snapshot);
}

export function validateSpecsIndex(root: string): ValidationResult {
	const indexPath = resolveDataIndexPath(root, "specs.json");
	if (!existsSync(indexPath)) {
		return {
			ok: false,
			message: `missing specs index snapshot: ${indexPath}; run afol local-state rebuild`,
		};
	}

	const snapshot = readJsonFile<SpecsIndexSnapshot>(indexPath);
	if (
		snapshot?.kind !== "specs_index_v1" ||
		snapshot.version !== 1 ||
		!Array.isArray(snapshot.specs) ||
		snapshot.specs.some(
			(entry) =>
				typeof entry.id !== "string" ||
				typeof entry.path !== "string" ||
				typeof entry.title !== "string" ||
				typeof entry.touched_at !== "string",
		)
	) {
		return { ok: false, message: `invalid specs index snapshot: ${indexPath}` };
	}

	return validateSnapshot(
		snapshot,
		indexPath,
		"specs index",
		latestSpecsSource(root),
	);
}

export function rebuildFilesIndex(root: string): FilesIndexSnapshot {
	const files = sortByPath(
		collectFileIndexFiles(root).map((filePath) => {
			const stats = statSync(filePath);
			return {
				path: toRelativeProjectPath(root, filePath),
				bytes: stats.size,
				touched_at: parseTouchedAt(filePath),
				extension: extname(filePath).replace(/^\./, ""),
			};
		}),
	);

	const snapshot: FilesIndexSnapshot = {
		kind: "files_index_v1",
		version: 1,
		generated_at: formatNow(),
		source: {
			project_root: ".",
		},
		files,
	};

	const indexPath = resolveDataIndexPath(root, "files.json");
	return writeSnapshot(indexPath, snapshot);
}

export function validateFilesIndex(root: string): ValidationResult {
	const indexPath = resolveDataIndexPath(root, "files.json");
	if (!existsSync(indexPath)) {
		return {
			ok: false,
			message: `missing files index snapshot: ${indexPath}; run afol local-state rebuild`,
		};
	}

	const snapshot = readJsonFile<FilesIndexSnapshot>(indexPath);
	if (
		snapshot?.kind !== "files_index_v1" ||
		snapshot.version !== 1 ||
		!Array.isArray(snapshot.files) ||
		snapshot.files.some(
			(entry) =>
				typeof entry.path !== "string" ||
				typeof entry.touched_at !== "string" ||
				typeof entry.extension !== "string" ||
				typeof entry.bytes !== "number",
		)
	) {
		return { ok: false, message: `invalid files index snapshot: ${indexPath}` };
	}

	return validateSnapshot(
		snapshot,
		indexPath,
		"files index",
		latestFilesSource(root),
	);
}

export function rebuildProjectIndexes(root: string): ProjectIndexSnapshot {
	return {
		rules: rebuildRulesIndex(root),
		skills: rebuildSkillsIndex(root),
		specs: rebuildSpecsIndex(root),
		files: rebuildFilesIndex(root),
	};
}
