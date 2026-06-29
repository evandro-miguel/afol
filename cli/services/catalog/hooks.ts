import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadJsonObject, type SchemaObject } from "../../core/schema";
import {
	normalizeProjectRelativePath,
	resolveProjectConfigPath,
	resolveProjectPaths,
} from "../project/paths";

const DEFAULT_MAX_HOOK_MESSAGE_CHARS = 1000;
const DEFAULT_MAX_TOTAL_HOOK_MESSAGE_CHARS = 3000;

type RawHookContributions = {
	messages?: unknown;
	tools?: unknown;
	validation_commands?: unknown;
	pstr_refs?: unknown;
	memory_refs?: unknown;
	library_refs?: unknown;
	do_not_load?: unknown;
};

type RawHook = RawHookContributions & {
	id?: unknown;
	name?: unknown;
	path?: unknown;
	enabled?: unknown;
	scope?: unknown;
	events?: unknown;
	roles?: unknown;
	surfaces?: unknown;
	work_types?: unknown;
	languages?: unknown;
	file_globs?: unknown;
	exact_files?: unknown;
	priority?: unknown;
	contributions?: unknown;
};

export type HookResolverConfig = {
	maxMessageChars: number;
	maxTotalMessageChars: number;
};

export type HookContributions = {
	messages: string[];
	tools: string[];
	validationCommands: string[];
	pstrRefs: string[];
	memoryRefs: string[];
	libraryRefs: string[];
	doNotLoad: string[];
};

export type HookEntry = {
	id: string;
	name: string;
	path: string;
	enabled: boolean;
	scope: string | null;
	events: string[];
	roles: string[];
	surfaces: string[];
	workTypes: string[];
	languages: string[];
	fileGlobs: string[];
	exactFiles: string[];
	priority: number;
	messageCharCount: number;
	contributions: HookContributions;
};

export type ResolveHooksOptions = {
	event: string;
	scope?: string | undefined;
	roles?: string[] | undefined;
	surfaces: string[];
	workType: string;
	languages?: string[] | undefined;
	filePath?: string | undefined;
	maxMessageChars?: number | undefined;
	maxTotalMessageChars?: number | undefined;
	strictIndex?: boolean | undefined;
};

export class HookResolverError extends Error {}

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

function normalizeOrderedTextList(value: unknown): string[] {
	const values =
		typeof value === "string"
			? [value]
			: Array.isArray(value)
				? value.filter((item): item is string => typeof item === "string")
				: [];
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const item of values) {
		const trimmed = item.trim();
		if (!trimmed || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		normalized.push(trimmed);
	}
	return normalized;
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

function normalizeHookPath(
	rawPath: unknown,
	id: string,
	hooksDir: string,
): string {
	const fallback = `${hooksDir}/${id}.md`;
	if (typeof rawPath !== "string" || !rawPath.trim()) {
		return fallback;
	}
	const cleaned = normalizeProjectRelativePath(rawPath, "");
	const candidate = cleaned
		? cleaned.startsWith(`${hooksDir}/`)
			? cleaned
			: `${hooksDir}/${cleaned}`
		: "";
	if (candidate.startsWith(`${hooksDir}/`)) {
		return candidate;
	}
	const safeLeaf = normalizeProjectRelativePath(
		basename(rawPath.trim().replace(/\\/g, "/")),
		"",
	);
	return safeLeaf ? `${hooksDir}/${safeLeaf}` : fallback;
}

function contributionObject(raw: RawHook): RawHookContributions {
	const value = raw.contributions;
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		return value as RawHookContributions;
	}
	return raw;
}

function normalizeContributions(raw: RawHook): HookContributions {
	const contributions = contributionObject(raw);
	return {
		messages: normalizeOrderedTextList(contributions.messages),
		tools: normalizeOrderedTextList(contributions.tools),
		validationCommands: normalizeOrderedTextList(
			contributions.validation_commands,
		),
		pstrRefs: normalizeOrderedTextList(contributions.pstr_refs),
		memoryRefs: normalizeOrderedTextList(contributions.memory_refs),
		libraryRefs: normalizeOrderedTextList(contributions.library_refs),
		doNotLoad: normalizeOrderedTextList(contributions.do_not_load),
	};
}

function messageCharCount(contributions: HookContributions): number {
	return contributions.messages.reduce(
		(total, message) => total + message.length,
		0,
	);
}

function normalizeHook(raw: RawHook, hooksDir: string): HookEntry | null {
	const id = typeof raw.id === "string" ? raw.id.trim().toUpperCase() : "";
	if (!id) {
		return null;
	}
	const contributions = normalizeContributions(raw);
	return {
		id,
		name:
			typeof raw.name === "string" && raw.name.trim()
				? raw.name.trim()
				: id.toLowerCase(),
		path: normalizeHookPath(raw.path, id, hooksDir),
		enabled: raw.enabled !== false,
		scope: normalizeOptionalText(raw.scope),
		events: normalizeTextList(raw.events),
		roles: normalizeTextList(raw.roles),
		surfaces: normalizeTextList(raw.surfaces),
		workTypes: normalizeTextList(raw.work_types),
		languages: normalizeTextList(raw.languages),
		fileGlobs: normalizeTextList(raw.file_globs, false),
		exactFiles: normalizeProjectFileList(raw.exact_files),
		priority: typeof raw.priority === "number" ? raw.priority : 50,
		messageCharCount: messageCharCount(contributions),
		contributions,
	};
}

type ParsedHooksIndex =
	| { ok: true; value: { hooks?: RawHook[] } | RawHook[] }
	| { ok: false; message: string };

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function parseHooksIndex(indexPath: string): ParsedHooksIndex {
	try {
		return {
			ok: true,
			value: JSON.parse(readFileSync(indexPath, "utf8")) as
				| { hooks?: RawHook[] }
				| RawHook[],
		};
	} catch (error) {
		return {
			ok: false,
			message: errorMessage(error),
		};
	}
}

function readHooksConfig(projectRoot: string): SchemaObject {
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

export function getHookResolverConfig(projectRoot: string): HookResolverConfig {
	const config = readHooksConfig(projectRoot);
	const hooks = readObject(config, "hooks");
	const resolver =
		hooks === null ? null : readObject(hooks as SchemaObject, "resolver");
	return {
		maxMessageChars: normalizeLimit(
			resolver?.max_chars_per_message,
			DEFAULT_MAX_HOOK_MESSAGE_CHARS,
		),
		maxTotalMessageChars: normalizeLimit(
			resolver?.max_chars_total,
			DEFAULT_MAX_TOTAL_HOOK_MESSAGE_CHARS,
		),
	};
}

export function listHooks(
	projectRoot: string,
	options: { strictIndex?: boolean | undefined } = {},
): HookEntry[] {
	const projectPaths = resolveProjectPaths(projectRoot);
	const indexPath = join(projectPaths.abs.hooksDir, "index.json");
	if (!existsSync(indexPath)) {
		return [];
	}
	const parsed = parseHooksIndex(indexPath);
	if (!parsed.ok) {
		if (options.strictIndex === true) {
			throw new HookResolverError(
				`Invalid hooks index ${indexPath}: ${parsed.message}`,
			);
		}
		return [];
	}
	const rawHooks = Array.isArray(parsed.value)
		? parsed.value
		: parsed.value.hooks;
	if (!Array.isArray(rawHooks)) {
		if (options.strictIndex === true) {
			throw new HookResolverError(
				`Invalid hooks index ${indexPath}: expected hooks array`,
			);
		}
		return [];
	}
	return rawHooks
		.map((raw) => normalizeHook(raw, projectPaths.hooksDir))
		.filter((entry): entry is HookEntry => entry !== null)
		.sort((a, b) => a.id.localeCompare(b.id));
}

export function findHook(
	projectRoot: string,
	identifier: string,
): HookEntry | null {
	const needle = identifier.trim().toLowerCase();
	if (!needle) {
		return null;
	}
	return (
		listHooks(projectRoot).find(
			(hook) =>
				hook.id.toLowerCase() === needle || hook.name.toLowerCase() === needle,
		) ?? null
	);
}

function matchesListFilter(
	hookValues: string[],
	wantedValues: Set<string>,
): boolean {
	if (wantedValues.size === 0 || hookValues.length === 0) {
		return true;
	}
	return hookValues.some((value) => wantedValues.has(value));
}

function matchesScope(hook: HookEntry, scope: string | null): boolean {
	if (!scope || hook.scope === null) {
		return true;
	}
	return hook.scope === scope;
}

function normalizeOptionalRelativePath(
	value: string | undefined,
): string | null {
	if (!value?.trim()) {
		return null;
	}
	const normalized = normalizeProjectRelativePath(value, "");
	if (!normalized) {
		throw new HookResolverError(`Invalid hook resolve file path: ${value}`);
	}
	return normalized;
}

function matchesFile(hook: HookEntry, filePath: string | null): boolean {
	if (!filePath) {
		return true;
	}
	if (hook.exactFiles.length > 0 && hook.exactFiles.includes(filePath)) {
		return true;
	}
	if (hook.fileGlobs.length === 0 && hook.exactFiles.length === 0) {
		return true;
	}
	return hook.fileGlobs.some((pattern) =>
		new Bun.Glob(pattern).match(filePath),
	);
}

function matchesEvent(hook: HookEntry, event: string): boolean {
	return (
		hook.events.length === 0 ||
		hook.events.includes(event) ||
		hook.events.includes("all")
	);
}

export function resolveHooks(
	projectRoot: string,
	options: ResolveHooksOptions,
): HookEntry[] {
	const defaults = getHookResolverConfig(projectRoot);
	const event = options.event.trim().toLowerCase() || "context.bundle";
	const wantedRoles = new Set(normalizeTextList(options.roles));
	const wantedSurfaces = new Set(normalizeTextList(options.surfaces));
	const wantedLanguages = new Set(normalizeTextList(options.languages));
	const workType = options.workType.trim().toLowerCase() || "delivery";
	const scope = normalizeOptionalText(options.scope);
	const filePath = normalizeOptionalRelativePath(options.filePath);
	const maxMessageChars = normalizeLimit(
		options.maxMessageChars,
		defaults.maxMessageChars,
	);
	const maxTotalMessageChars = normalizeLimit(
		options.maxTotalMessageChars,
		defaults.maxTotalMessageChars,
	);
	let totalMessageChars = 0;
	const matchingHooks = listHooks(projectRoot, {
		strictIndex: options.strictIndex,
	})
		.filter((hook) => {
			if (!hook.enabled || !matchesEvent(hook, event)) {
				return false;
			}
			const workMatch =
				hook.workTypes.length === 0 ||
				hook.workTypes.includes(workType) ||
				hook.workTypes.includes("all");
			if (!workMatch) {
				return false;
			}
			return (
				matchesScope(hook, scope) &&
				matchesListFilter(hook.roles, wantedRoles) &&
				matchesListFilter(hook.surfaces, wantedSurfaces) &&
				matchesListFilter(hook.languages, wantedLanguages) &&
				matchesFile(hook, filePath)
			);
		})
		.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
	const resolved: HookEntry[] = [];
	for (const hook of matchingHooks) {
		if (hook.messageCharCount > maxMessageChars) {
			continue;
		}
		if (totalMessageChars + hook.messageCharCount > maxTotalMessageChars) {
			continue;
		}
		totalMessageChars += hook.messageCharCount;
		resolved.push(hook);
	}
	return resolved;
}
