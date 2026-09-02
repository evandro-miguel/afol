import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import {
	getRuleResolverConfig,
	type RuleEntry,
	RuleResolverError,
	resolveRules,
	stripRuleFrontmatter,
} from "../catalog/rules";
import { atomicWriteText } from "../io/atomic";
import { withSessionLock } from "../io/session-lock";
import {
	normalizeProjectRelativePath,
	resolveProjectPaths,
} from "../project/paths";

const RULE_INJECTION_STATE_KIND = "rule_injection_state_v1";
const RULE_INJECTION_VERSION = 1;
const RULE_INJECTION_MODE = "always";
const RULE_INJECTION_LOCK_NAME = "rule-injection-state";

const GENERIC_SURFACE_TOKENS = new Set([
	"cli",
	"src",
	"services",
	"commands",
	"project-template",
	"lib",
	"app",
	"apps",
]);

type RuleInjectionRecord = {
	path: string;
	char_count: number;
	content_hash: string;
	injected_at: string;
};

type RuleInjectionIdentityState = {
	session: string;
	task: string;
	role: string;
	surface: string;
	file_path: string | null;
	first_seen_at: string;
	last_seen_at: string;
	rules: Record<string, RuleInjectionRecord>;
};

type RuleInjectionState = {
	kind: typeof RULE_INJECTION_STATE_KIND;
	version: typeof RULE_INJECTION_VERSION;
	identities: Record<string, RuleInjectionIdentityState>;
};

export type RuleInjectionReference = {
	id: string;
	path: string;
	required: boolean;
	char_count: number;
};

export type RuleInjectionPayload = RuleInjectionReference & {
	content: string;
};

export type RuleInjectionOmission = RuleInjectionReference & {
	reason: string;
};

export type RuleSelectionContext = {
	scope: string | null;
	workType: string;
	filePath: string | null;
	domains: string[];
	surfaces: string[];
	languages: string[];
};

export type RuleInjectionResult = {
	identity: string;
	state_path: string;
	first_use: boolean;
	injected: RuleInjectionPayload[];
	already_injected: RuleInjectionReference[];
	omitted: RuleInjectionOmission[];
	budget: {
		max_chars_per_rule: number;
		max_total_chars: number;
		used_chars: number;
	};
};

export type ResolveRuleInjectionOptions = {
	session?: string;
	task?: string;
	role: string;
	surface?: string;
	scope?: string;
	workType?: string;
	filePath?: string;
};

export class RuleInjectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RuleInjectionError";
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function normalizeText(value: string | undefined, fallback: string): string {
	const normalized = value?.trim().toLowerCase() ?? "";
	return normalized || fallback;
}

function normalizeOptionalText(value: string | undefined): string | null {
	const normalized = value?.trim().toLowerCase() ?? "";
	return normalized || null;
}

function normalizeSessionOrTask(value: string | undefined): string {
	return value?.trim() || "none";
}

function normalizeFilePath(value: string | undefined): string | null {
	if (!value?.trim()) {
		return null;
	}
	const normalized = normalizeProjectRelativePath(value, "");
	if (!normalized) {
		throw new RuleInjectionError(`Invalid rule resolve file path: ${value}`);
	}
	return normalized;
}

function normalizeLanguageHints(extension: string): string[] {
	switch (extension) {
		case ".tsx":
			return ["tsx", "ts"];
		case ".ts":
			return ["ts"];
		case ".jsx":
			return ["jsx", "js"];
		case ".js":
			return ["js"];
		case ".py":
			return ["py", "python"];
		case ".md":
			return ["md", "markdown"];
		default:
			return extension ? [extension.slice(1).toLowerCase()] : [];
	}
}

function maybeAddSurfaceToken(target: Set<string>, token: string): void {
	const normalized = token.trim().toLowerCase();
	if (!normalized || GENERIC_SURFACE_TOKENS.has(normalized)) {
		return;
	}
	target.add(normalized);
}

export function deriveRuleSelectionContext(
	options: Pick<
		ResolveRuleInjectionOptions,
		"surface" | "scope" | "workType" | "filePath"
	>,
): RuleSelectionContext {
	const filePath = normalizeFilePath(options.filePath);
	const surfaces = new Set<string>();
	const explicitSurface = normalizeOptionalText(options.surface);
	if (explicitSurface) {
		surfaces.add(explicitSurface);
	}
	const languages = new Set<string>();
	const domains = new Set<string>();

	if (filePath) {
		const segments = filePath.split("/").filter(Boolean);
		const extension = extname(filePath).toLowerCase();
		for (const language of normalizeLanguageHints(extension)) {
			languages.add(language);
		}
		const stem = basename(filePath, extension).toLowerCase();
		const parent = segments.at(-2)?.toLowerCase() ?? "";
		const domain = segments[0]?.toLowerCase() ?? "";
		if (domain) {
			domains.add(domain);
		}
		maybeAddSurfaceToken(surfaces, stem);
		maybeAddSurfaceToken(surfaces, parent);
	}

	if (surfaces.size === 0) {
		surfaces.add(explicitSurface ?? "general");
	}

	return {
		scope: normalizeOptionalText(options.scope),
		workType: normalizeText(options.workType, "delivery"),
		filePath,
		domains: [...domains].sort(),
		surfaces: [...surfaces],
		languages: [...languages].sort(),
	};
}

function statePath(projectRoot: string): {
	absolute: string;
	relative: string;
} {
	const paths = resolveProjectPaths(projectRoot);
	const relativeDataDir = dirname(paths.dataIndexDir);
	const absoluteDataDir = dirname(paths.abs.dataIndexDir);
	return {
		absolute: join(absoluteDataDir, "rules", "injection-state.json"),
		relative: join(relativeDataDir, "rules", "injection-state.json").replace(
			/\\/g,
			"/",
		),
	};
}

function emptyState(): RuleInjectionState {
	return {
		kind: RULE_INJECTION_STATE_KIND,
		version: RULE_INJECTION_VERSION,
		identities: {},
	};
}

function readState(projectRoot: string): RuleInjectionState {
	const path = statePath(projectRoot).absolute;
	if (!existsSync(path)) {
		return emptyState();
	}
	try {
		const parsed = JSON.parse(
			readFileSync(path, "utf8"),
		) as RuleInjectionState | null;
		if (
			parsed?.kind !== RULE_INJECTION_STATE_KIND ||
			parsed.version !== RULE_INJECTION_VERSION ||
			parsed.identities === null ||
			typeof parsed.identities !== "object" ||
			Array.isArray(parsed.identities)
		) {
			throw new RuleInjectionError(
				`Invalid rule injection state ${path}: unexpected schema`,
			);
		}
		return parsed;
	} catch (error) {
		if (error instanceof RuleInjectionError) {
			throw error;
		}
		throw new RuleInjectionError(
			`Invalid rule injection state ${path}: ${errorMessage(error)}`,
		);
	}
}

function writeState(projectRoot: string, state: RuleInjectionState): void {
	const path = statePath(projectRoot).absolute;
	mkdirSync(dirname(path), { recursive: true });
	atomicWriteText(path, `${JSON.stringify(state, null, 2)}\n`);
}

function buildIdentity(options: {
	session?: string;
	task?: string;
	role: string;
	surface: string;
	filePath: string | null;
}): string {
	const parts = [
		`session:${normalizeSessionOrTask(options.session)}`,
		`task:${normalizeSessionOrTask(options.task)}`,
		`role:${normalizeText(options.role, "worker")}`,
		`surface:${normalizeText(options.surface, "general")}`,
	];
	if (options.filePath) {
		parts.push(`file:${options.filePath}`);
	}
	return parts.join("|");
}

function ruleRef(rule: RuleEntry): RuleInjectionReference {
	return {
		id: rule.id,
		path: rule.path,
		required: rule.required,
		char_count: rule.charCount,
	};
}

function readRuleContent(projectRoot: string, path: string): string | null {
	const absolutePath = join(projectRoot, path);
	if (!existsSync(absolutePath)) {
		return null;
	}
	return stripRuleFrontmatter(readFileSync(absolutePath, "utf8"));
}

function contentFingerprint(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function usedCharsForIdentity(
	identityState: RuleInjectionIdentityState | undefined,
): number {
	return Object.values(identityState?.rules ?? {}).reduce(
		(total, record) => total + record.char_count,
		0,
	);
}

function matchingInjectableRules(
	projectRoot: string,
	context: RuleSelectionContext,
): RuleEntry[] {
	try {
		return resolveRules(projectRoot, {
			scope: context.scope ?? undefined,
			domains: context.domains,
			surfaces: context.surfaces,
			workType: context.workType,
			languages: context.languages,
			filePath: context.filePath ?? undefined,
			inject: RULE_INJECTION_MODE,
			maxCharsPerRule: Number.MAX_SAFE_INTEGER,
			maxCharsTotal: Number.MAX_SAFE_INTEGER,
			strictIndex: true,
		});
	} catch (error) {
		if (error instanceof RuleResolverError) {
			throw new RuleInjectionError(error.message);
		}
		throw error;
	}
}

function injectionMetadata(
	projectRoot: string,
	options: ResolveRuleInjectionOptions,
): {
	context: RuleSelectionContext;
	identity: string;
	relativeStatePath: string;
	resolverConfig: ReturnType<typeof getRuleResolverConfig>;
	role: string;
	surface: string;
	session: string;
	task: string;
} {
	const context = deriveRuleSelectionContext(options);
	const resolverConfig = getRuleResolverConfig(projectRoot);
	const { relative } = statePath(projectRoot);
	const surface = normalizeText(
		options.surface,
		context.surfaces[0] ?? "general",
	);
	const role = normalizeText(options.role, "worker");
	const session = normalizeSessionOrTask(options.session);
	const task = normalizeSessionOrTask(options.task);
	const identity = buildIdentity({
		role,
		surface,
		filePath: context.filePath,
		...(session !== "none" ? { session } : {}),
		...(task !== "none" ? { task } : {}),
	});
	return {
		context,
		identity,
		relativeStatePath: relative,
		resolverConfig,
		role,
		surface,
		session,
		task,
	};
}

export function resolveRuleInjectionShape(
	projectRoot: string,
	options: ResolveRuleInjectionOptions,
): RuleInjectionResult {
	const metadata = injectionMetadata(projectRoot, options);
	return {
		identity: metadata.identity,
		state_path: metadata.relativeStatePath,
		first_use: false,
		injected: [],
		already_injected: [],
		omitted: [],
		budget: {
			max_chars_per_rule: metadata.resolverConfig.maxCharsPerRule,
			max_total_chars: metadata.resolverConfig.maxCharsTotal,
			used_chars: 0,
		},
	};
}

export function resolveRuleInjection(
	projectRoot: string,
	options: ResolveRuleInjectionOptions,
): RuleInjectionResult {
	const { context, identity, relativeStatePath, resolverConfig } =
		injectionMetadata(projectRoot, options);
	const state = readState(projectRoot);
	const existing = state.identities[identity];
	const injected: RuleInjectionPayload[] = [];
	const alreadyInjected: RuleInjectionReference[] = [];
	const omitted: RuleInjectionOmission[] = [];
	let usedChars = usedCharsForIdentity(existing);

	for (const rule of matchingInjectableRules(projectRoot, context)) {
		const reference = ruleRef(rule);
		const existingRecord = existing?.rules[rule.id];
		const content = readRuleContent(projectRoot, rule.path);
		if (content === null) {
			if (existingRecord) {
				usedChars = Math.max(0, usedChars - existingRecord.char_count);
			}
			const reason = `rule markdown file missing (${rule.path})`;
			if (rule.required) {
				throw new RuleInjectionError(`${rule.id}: ${reason}`);
			}
			omitted.push({ ...reference, reason });
			continue;
		}
		const charCount = content.length;
		const contentHash = contentFingerprint(content);
		if (
			existingRecord &&
			existingRecord.path === rule.path &&
			existingRecord.char_count === charCount &&
			existingRecord.content_hash === contentHash
		) {
			alreadyInjected.push(reference);
			continue;
		}
		if (existingRecord) {
			usedChars = Math.max(0, usedChars - existingRecord.char_count);
		}
		if (charCount > resolverConfig.maxCharsPerRule) {
			const reason = `rule exceeds max_chars_per_rule (${charCount}/${resolverConfig.maxCharsPerRule})`;
			if (rule.required) {
				throw new RuleInjectionError(`${rule.id}: ${reason}`);
			}
			omitted.push({ ...reference, char_count: charCount, reason });
			continue;
		}
		if (usedChars + charCount > resolverConfig.maxCharsTotal) {
			const reason = `rule exceeds max_total_chars (${usedChars + charCount}/${resolverConfig.maxCharsTotal})`;
			if (rule.required) {
				throw new RuleInjectionError(`${rule.id}: ${reason}`);
			}
			omitted.push({ ...reference, char_count: charCount, reason });
			continue;
		}
		usedChars += charCount;
		injected.push({ ...reference, char_count: charCount, content });
	}

	return {
		identity,
		state_path: relativeStatePath,
		first_use: !existing,
		injected,
		already_injected: alreadyInjected,
		omitted: omitted,
		budget: {
			max_chars_per_rule: resolverConfig.maxCharsPerRule,
			max_total_chars: resolverConfig.maxCharsTotal,
			used_chars: usedChars,
		},
	};
}

export function resolveContextRules(
	projectRoot: string,
	options: Pick<
		ResolveRuleInjectionOptions,
		"surface" | "scope" | "workType" | "filePath"
	>,
): RuleEntry[] {
	const context = deriveRuleSelectionContext(options);
	try {
		return resolveRules(projectRoot, {
			scope: context.scope ?? undefined,
			domains: context.domains,
			surfaces: context.surfaces,
			workType: context.workType,
			languages: context.languages,
			filePath: context.filePath ?? undefined,
			maxCharsPerRule: Number.MAX_SAFE_INTEGER,
			maxCharsTotal: Number.MAX_SAFE_INTEGER,
		});
	} catch (error) {
		if (error instanceof RuleResolverError) {
			throw new RuleInjectionError(error.message);
		}
		throw error;
	}
}

export function resolveAndRecordRuleInjection(
	projectRoot: string,
	options: ResolveRuleInjectionOptions,
): RuleInjectionResult {
	const {
		context,
		identity,
		relativeStatePath,
		resolverConfig,
		role,
		surface,
	} = injectionMetadata(projectRoot, options);
	return withSessionLock(projectRoot, RULE_INJECTION_LOCK_NAME, () => {
		const state = readState(projectRoot);
		const now = new Date().toISOString();
		const existing = state.identities[identity];
		const firstUse = !existing;
		const identityState: RuleInjectionIdentityState = existing ?? {
			session: normalizeSessionOrTask(options.session),
			task: normalizeSessionOrTask(options.task),
			role,
			surface,
			file_path: context.filePath,
			first_seen_at: now,
			last_seen_at: now,
			rules: {},
		};
		const injected: RuleInjectionPayload[] = [];
		const alreadyInjected: RuleInjectionReference[] = [];
		const omitted: RuleInjectionOmission[] = [];
		let usedChars = usedCharsForIdentity(identityState);

		for (const rule of matchingInjectableRules(projectRoot, context)) {
			const reference = ruleRef(rule);
			const existingRecord = identityState.rules[rule.id];
			const content = readRuleContent(projectRoot, rule.path);
			if (content === null) {
				if (existingRecord) {
					usedChars = Math.max(0, usedChars - existingRecord.char_count);
					delete identityState.rules[rule.id];
				}
				const reason = `rule markdown file missing (${rule.path})`;
				if (rule.required) {
					throw new RuleInjectionError(`${rule.id}: ${reason}`);
				}
				omitted.push({ ...reference, reason });
				continue;
			}
			const charCount = content.length;
			const contentHash = contentFingerprint(content);
			if (
				existingRecord &&
				existingRecord.path === rule.path &&
				existingRecord.char_count === charCount &&
				existingRecord.content_hash === contentHash
			) {
				alreadyInjected.push(reference);
				continue;
			}
			if (existingRecord) {
				usedChars = Math.max(0, usedChars - existingRecord.char_count);
			}
			if (charCount > resolverConfig.maxCharsPerRule) {
				const reason = `rule exceeds max_chars_per_rule (${charCount}/${resolverConfig.maxCharsPerRule})`;
				if (rule.required) {
					throw new RuleInjectionError(`${rule.id}: ${reason}`);
				}
				omitted.push({ ...reference, char_count: charCount, reason });
				continue;
			}
			if (usedChars + charCount > resolverConfig.maxCharsTotal) {
				const reason = `rule exceeds max_total_chars (${usedChars + charCount}/${resolverConfig.maxCharsTotal})`;
				if (rule.required) {
					throw new RuleInjectionError(`${rule.id}: ${reason}`);
				}
				omitted.push({ ...reference, char_count: charCount, reason });
				continue;
			}
			identityState.rules[rule.id] = {
				path: rule.path,
				char_count: charCount,
				content_hash: contentHash,
				injected_at: now,
			};
			usedChars += charCount;
			injected.push({ ...reference, char_count: charCount, content });
		}

		identityState.last_seen_at = now;
		state.identities[identity] = identityState;
		writeState(projectRoot, state);

		return {
			identity,
			state_path: relativeStatePath,
			first_use: firstUse,
			injected,
			already_injected: alreadyInjected,
			omitted: omitted,
			budget: {
				max_chars_per_rule: resolverConfig.maxCharsPerRule,
				max_total_chars: resolverConfig.maxCharsTotal,
				used_chars: usedChars,
			},
		};
	});
}

export function forgetRecordedRuleInjections(
	projectRoot: string,
	identity: string,
	ruleIds: readonly string[],
): void {
	if (ruleIds.length === 0) {
		return;
	}
	withSessionLock(projectRoot, RULE_INJECTION_LOCK_NAME, () => {
		const state = readState(projectRoot);
		const identityState = state.identities[identity];
		if (!identityState) {
			return;
		}
		for (const ruleId of ruleIds) {
			delete identityState.rules[ruleId];
		}
		writeState(projectRoot, state);
	});
}
