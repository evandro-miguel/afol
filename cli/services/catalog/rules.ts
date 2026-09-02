import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadJsonObject, type SchemaObject } from "../../core/schema";
import {
	normalizeProjectRelativePath,
	type ResolvedProjectPaths,
	resolveProjectConfigPath,
	resolveProjectPaths,
} from "../project/paths";

const DEFAULT_MAX_RULE_CHARS = 2000;
const DEFAULT_MAX_TOTAL_RULE_CHARS = 4000;

export function stripRuleFrontmatter(content: string): string {
	const opening = content.match(/^\uFEFF?---[ \t]*\r?\n/);
	if (!opening) {
		return content;
	}
	let cursor = opening[0].length;
	while (cursor < content.length) {
		const lineEnd = content.indexOf("\n", cursor);
		const rawLine =
			lineEnd === -1 ? content.slice(cursor) : content.slice(cursor, lineEnd);
		const line = rawLine.replace(/\r$/, "");
		const nextCursor = lineEnd === -1 ? content.length : lineEnd + 1;
		if (line === "---" || line === "...") {
			const body = content.slice(nextCursor);
			return body.replace(/^\r?\n/, "");
		}
		cursor = nextCursor;
	}
	return content;
}

type RawRule = {
	id?: unknown;
	name?: unknown;
	path?: unknown;
	scope?: unknown;
	required?: unknown;
	domains?: unknown;
	surfaces?: unknown;
	work_types?: unknown;
	languages?: unknown;
	file_globs?: unknown;
	exact_files?: unknown;
	inject?: unknown;
	priority?: unknown;
};

export type RuleResolverConfig = {
	maxCharsPerRule: number;
	maxCharsTotal: number;
};

export type RuleEntry = {
	id: string;
	name: string;
	path: string;
	scope: string | null;
	required: boolean;
	domains: string[];
	surfaces: string[];
	workTypes: string[];
	languages: string[];
	fileGlobs: string[];
	exactFiles: string[];
	inject: string | null;
	priority: number;
	charCount: number;
};

export type ResolveRulesOptions = {
	scope?: string | undefined;
	required?: boolean | undefined;
	domains?: string[] | undefined;
	surfaces: string[];
	workType: string;
	languages?: string[] | undefined;
	filePath?: string | undefined;
	inject?: string | undefined;
	maxCharsPerRule?: number | undefined;
	maxCharsTotal?: number | undefined;
	strictIndex?: boolean | undefined;
};

export type RuleResolutionWarning = {
	id: string;
	path: string;
	reason: string;
};

export type ResolveRulesResult = {
	rules: RuleEntry[];
	warnings: RuleResolutionWarning[];
};

export class RuleResolverError extends Error {}

function normalizeTextList(value: unknown, lowercase = true): string[] {
	if (typeof value === "string") {
		const normalized = lowercase ? value.trim().toLowerCase() : value.trim();
		return normalized ? [normalized] : [];
	}
	if (!Array.isArray(value)) {
		return [];
	}
	return [
		...new Set(
			value
				.filter((item): item is string => typeof item === "string")
				.map((item) => (lowercase ? item.trim().toLowerCase() : item.trim()))
				.filter(Boolean),
		),
	].sort();
}

function normalizeOptionalText(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim().toLowerCase();
	return normalized || null;
}

function normalizeProjectFileList(value: unknown): string[] {
	return normalizeTextList(value, false)
		.map((item) => normalizeProjectRelativePath(item, ""))
		.filter(Boolean)
		.sort();
}

function normalizeRulePath(
	rawPath: unknown,
	id: string,
	rulesDir: string,
): string {
	const fallback = `${rulesDir}/${id}.md`;
	if (typeof rawPath !== "string" || !rawPath.trim()) {
		return fallback;
	}
	const cleaned = normalizeProjectRelativePath(rawPath, "");
	const candidate = cleaned
		? cleaned.startsWith(`${rulesDir}/`)
			? cleaned
			: `${rulesDir}/${cleaned}`
		: "";
	if (candidate.startsWith(`${rulesDir}/`)) {
		return candidate;
	}
	const safeLeaf = normalizeProjectRelativePath(
		basename(rawPath.trim().replace(/\\/g, "/")),
		"",
	);
	return safeLeaf ? `${rulesDir}/${safeLeaf}` : fallback;
}

function ruleCharCount(projectRoot: string, path: string): number {
	const absolutePath = join(projectRoot, path);
	if (!existsSync(absolutePath)) {
		return 0;
	}
	return stripRuleFrontmatter(readFileSync(absolutePath, "utf8")).length;
}

function normalizeRule(
	raw: RawRule,
	projectRoot: string,
	rulesDir: string,
): RuleEntry | null {
	const id = typeof raw.id === "string" ? raw.id.trim().toUpperCase() : "";
	if (!id) {
		return null;
	}
	const path = normalizeRulePath(raw.path, id, rulesDir);
	return {
		id,
		name:
			typeof raw.name === "string" && raw.name.trim()
				? raw.name.trim()
				: id.toLowerCase(),
		path,
		scope: normalizeOptionalText(raw.scope),
		required: raw.required === true,
		domains: normalizeTextList(raw.domains),
		surfaces: normalizeTextList(raw.surfaces),
		workTypes: normalizeTextList(raw.work_types),
		languages: normalizeTextList(raw.languages),
		fileGlobs: normalizeTextList(raw.file_globs, false),
		exactFiles: normalizeProjectFileList(raw.exact_files),
		inject: normalizeOptionalText(raw.inject),
		priority: typeof raw.priority === "number" ? raw.priority : 50,
		charCount: ruleCharCount(projectRoot, path),
	};
}

function fallbackRules(projectPaths: ResolvedProjectPaths): RuleEntry[] {
	const rulesRoot = projectPaths.abs.rulesDir;
	if (!existsSync(rulesRoot)) {
		return [];
	}
	return readdirSync(rulesRoot)
		.filter((name) => /^RULE-\d+.*\.md$/.test(name))
		.sort()
		.map((name) => {
			const id =
				name.match(/^(RULE-\d+)/)?.[1] ??
				name.replace(/\.md$/, "").toUpperCase();
			return {
				id,
				name: name.replace(/\.md$/, "").toLowerCase(),
				path: `${projectPaths.rulesDir}/${name}`,
				scope: null,
				required: false,
				domains: [],
				surfaces: [],
				workTypes: [],
				languages: [],
				fileGlobs: [],
				exactFiles: [],
				inject: null,
				priority: 50,
				charCount: stripRuleFrontmatter(
					readFileSync(join(rulesRoot, name), "utf8"),
				).length,
			};
		});
}

type ParsedRulesIndex =
	| { ok: true; value: { rules?: RawRule[] } | RawRule[] }
	| { ok: false; message: string };

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function parseRulesIndex(indexPath: string): ParsedRulesIndex {
	try {
		return {
			ok: true,
			value: JSON.parse(readFileSync(indexPath, "utf8")) as
				| { rules?: RawRule[] }
				| RawRule[],
		};
	} catch (error) {
		return {
			ok: false,
			message: errorMessage(error),
		};
	}
}

function readRulesConfig(projectRoot: string): SchemaObject {
	const resolved = resolveProjectConfigPath(projectRoot);
	if (!resolved) {
		return {};
	}
	const loaded = loadJsonObject(resolved.absolutePath);
	return loaded.ok ? loaded.value : {};
}

function readObject(
	record: SchemaObject,
	key: string,
): Record<string, unknown> | null {
	const value = record[key];
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function normalizeLimit(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	const normalized = Math.floor(value);
	return normalized > 0 ? normalized : fallback;
}

export function getRuleResolverConfig(projectRoot: string): RuleResolverConfig {
	const config = readRulesConfig(projectRoot);
	const rules = readObject(config, "rules");
	const resolver =
		rules === null ? null : readObject(rules as SchemaObject, "resolver");
	return {
		maxCharsPerRule: normalizeLimit(
			resolver?.max_chars_per_rule,
			DEFAULT_MAX_RULE_CHARS,
		),
		maxCharsTotal: normalizeLimit(
			resolver?.max_chars_total,
			DEFAULT_MAX_TOTAL_RULE_CHARS,
		),
	};
}

export function listRules(
	projectRoot: string,
	options: { strictIndex?: boolean | undefined } = {},
): RuleEntry[] {
	const projectPaths = resolveProjectPaths(projectRoot);
	const indexPath = join(projectPaths.abs.rulesDir, "index.json");
	if (!existsSync(indexPath)) {
		return fallbackRules(projectPaths);
	}
	const parsed = parseRulesIndex(indexPath);
	if (!parsed.ok) {
		if (options.strictIndex === true) {
			throw new RuleResolverError(
				`Invalid rules index ${indexPath}: ${parsed.message}`,
			);
		}
		return fallbackRules(projectPaths);
	}
	const rawRules = Array.isArray(parsed.value)
		? parsed.value
		: parsed.value.rules;
	if (!Array.isArray(rawRules)) {
		if (options.strictIndex === true) {
			throw new RuleResolverError(
				`Invalid rules index ${indexPath}: expected rules array`,
			);
		}
		return fallbackRules(projectPaths);
	}
	return rawRules
		.map((raw) => normalizeRule(raw, projectRoot, projectPaths.rulesDir))
		.filter((entry): entry is RuleEntry => entry !== null)
		.sort((a, b) => a.id.localeCompare(b.id));
}

export function findRule(
	projectRoot: string,
	identifier: string,
): RuleEntry | null {
	const needle = identifier.trim().toLowerCase();
	if (!needle) {
		return null;
	}
	return (
		listRules(projectRoot).find(
			(rule) =>
				rule.id.toLowerCase() === needle || rule.name.toLowerCase() === needle,
		) ?? null
	);
}

function matchesListFilter(
	ruleValues: string[],
	wantedValues: Set<string>,
): boolean {
	if (wantedValues.size === 0 || ruleValues.length === 0) {
		return true;
	}
	return ruleValues.some((value) => wantedValues.has(value));
}

function matchesScope(rule: RuleEntry, scope: string | null): boolean {
	if (!scope || rule.scope === null) {
		return true;
	}
	return rule.scope === scope;
}

function normalizeOptionalRelativePath(
	value: string | undefined,
): string | null {
	if (!value?.trim()) {
		return null;
	}
	const normalized = normalizeProjectRelativePath(value, "");
	if (!normalized) {
		throw new RuleResolverError(`Invalid rule resolve file path: ${value}`);
	}
	return normalized;
}

function matchesFile(
	rule: RuleEntry,
	filePath: string | null,
	globs: Map<string, Bun.Glob>,
): boolean {
	if (!filePath) {
		return true;
	}
	if (rule.exactFiles.length > 0 && rule.exactFiles.includes(filePath)) {
		return true;
	}
	if (rule.fileGlobs.length === 0 && rule.exactFiles.length === 0) {
		return true;
	}
	return rule.fileGlobs.some((pattern) => {
		const glob = globs.get(pattern) ?? new Bun.Glob(pattern);
		globs.set(pattern, glob);
		return glob.match(filePath);
	});
}

function matchesInject(rule: RuleEntry, inject: string | null): boolean {
	if (!inject || rule.inject === null) {
		return true;
	}
	return rule.inject === inject;
}

export function resolveRules(
	projectRoot: string,
	options: ResolveRulesOptions,
): RuleEntry[] {
	return resolveRulesWithDiagnostics(projectRoot, options).rules;
}

export function resolveRulesWithDiagnostics(
	projectRoot: string,
	options: ResolveRulesOptions,
): ResolveRulesResult {
	const defaults = getRuleResolverConfig(projectRoot);
	const wantedDomains = new Set(normalizeTextList(options.domains));
	const wantedSurfaces = new Set(normalizeTextList(options.surfaces));
	const wantedLanguages = new Set(normalizeTextList(options.languages));
	const workType = options.workType.trim().toLowerCase() || "delivery";
	const scope = normalizeOptionalText(options.scope);
	const inject = normalizeOptionalText(options.inject);
	const filePath = normalizeOptionalRelativePath(options.filePath);
	const maxCharsPerRule = normalizeLimit(
		options.maxCharsPerRule,
		defaults.maxCharsPerRule,
	);
	const maxCharsTotal = normalizeLimit(
		options.maxCharsTotal,
		defaults.maxCharsTotal,
	);
	const globs = new Map<string, Bun.Glob>();
	let totalChars = 0;
	const matchingRules = listRules(projectRoot, {
		strictIndex: options.strictIndex,
	})
		.filter((rule) => {
			const workMatch =
				rule.workTypes.length === 0 ||
				rule.workTypes.includes(workType) ||
				rule.workTypes.includes("all");
			if (!workMatch) {
				return false;
			}
			if (options.required === true && !rule.required) {
				return false;
			}
			return (
				matchesScope(rule, scope) &&
				matchesInject(rule, inject) &&
				matchesListFilter(rule.domains, wantedDomains) &&
				matchesListFilter(rule.surfaces, wantedSurfaces) &&
				matchesListFilter(rule.languages, wantedLanguages) &&
				matchesFile(rule, filePath, globs)
			);
		})
		.sort((a, b) => {
			if (a.required !== b.required) {
				return a.required ? -1 : 1;
			}
			return b.priority - a.priority || a.id.localeCompare(b.id);
		});
	const resolved: RuleEntry[] = [];
	const warnings: RuleResolutionWarning[] = [];
	for (const rule of matchingRules) {
		if (rule.charCount > maxCharsPerRule) {
			const reason = `rule exceeds max_chars_per_rule (${rule.charCount}/${maxCharsPerRule})`;
			if (rule.required) {
				throw new RuleResolverError(
					`Required rule ${rule.id} cannot be resolved: ${reason}`,
				);
			}
			warnings.push({ id: rule.id, path: rule.path, reason });
			continue;
		}
		if (totalChars + rule.charCount > maxCharsTotal) {
			const reason = `rule exceeds max_total_chars (${totalChars + rule.charCount}/${maxCharsTotal})`;
			if (rule.required) {
				throw new RuleResolverError(
					`Required rule ${rule.id} cannot be resolved: ${reason}`,
				);
			}
			warnings.push({ id: rule.id, path: rule.path, reason });
			continue;
		}
		totalChars += rule.charCount;
		resolved.push(rule);
	}
	return { rules: resolved, warnings };
}
