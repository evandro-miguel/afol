import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type HookEntry,
	HookResolverError,
	resolveHooks,
} from "../catalog/hooks";
import { listSkills, searchSkills } from "../catalog/skills";
import { buildLibraryGraph, searchLibrary } from "../library";
import { recallEntries } from "../memory";
import { resolveProjectPaths } from "../project/paths";
import { getPstrIndex, validatePstrIndex } from "../pstr";
import {
	deriveRuleSelectionContext,
	forgetRecordedRuleInjections,
	RuleInjectionError,
	resolveAndRecordRuleInjection,
	resolveContextRules,
	resolveRuleInjection,
	resolveRuleInjectionShape,
} from "../rules/injection";
import { loadSessionState, validateState } from "../state";
import {
	requireSectionIndexCache,
	SectionIndexTrustError,
} from "./section-index";
import type {
	ContextBundle,
	ContextExpandedSection,
	ContextHookContribution,
	ContextRef,
	ContextRetrievalMode,
	SectionEntry,
} from "./types";

type BuildOptions = {
	session?: string;
	task?: string;
	role?: string;
	surface?: string;
	scope?: string;
	filePath?: string;
	mode?: ContextRetrievalMode;
	trusted?: boolean;
	persistRuleInjection?: boolean;
};

export class ContextTrustError extends Error {
	readonly code = "CTX_TRUST_ERROR";
	readonly reason: string;
	readonly remediation: string | null;

	constructor(
		message: string,
		reason = "untrusted-context",
		remediation: string | null = null,
	) {
		super(message);
		this.name = "ContextTrustError";
		this.reason = reason;
		this.remediation = remediation;
	}
}

type TaskRecord = {
	path: string;
	taskId: string;
	state: string;
	owner: string;
	notes: string;
	featureId: string;
};

const TASK_ROW_RE =
	/^\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|$/;
const MODE_BUDGETS: Record<ContextRetrievalMode, number> = {
	compact: 1000,
	balanced: 2000,
	deep: 4000,
	tokenmax: 8000,
};

function frontmatter(content: string): Record<string, unknown> {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
	if (!match?.[1]) {
		return {};
	}
	try {
		const parsed = Bun.YAML.parse(match[1]);
		return parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function taskFiles(root: string, session: string): string[] {
	const sessionDir = join(resolveProjectPaths(root).abs.wbDir, session);
	if (!existsSync(sessionDir)) {
		return [];
	}
	return readdirSync(sessionDir)
		.filter((name) => name.endsWith(".md") && /_task_\d+\.md$/.test(name))
		.map((name) => join(sessionDir, name))
		.sort((a, b) => a.localeCompare(b));
}

function findTaskRecord(
	root: string,
	session: string,
	taskId: string,
): TaskRecord | null {
	for (const filePath of taskFiles(root, session)) {
		const content = readFileSync(filePath, "utf8");
		const meta = frontmatter(content);
		for (const line of content.split(/\r?\n/)) {
			const match = TASK_ROW_RE.exec(line.trim());
			if (!match?.[1] || match[1] !== taskId) {
				continue;
			}
			return {
				path: filePath,
				taskId,
				state: (match[2] ?? "").trim().toLowerCase(),
				owner: (match[3] ?? "").trim(),
				notes: (match[4] ?? "").trim(),
				featureId:
					typeof meta.feature_id === "string"
						? meta.feature_id.trim()
						: typeof meta.roadmap_feature === "string"
							? meta.roadmap_feature.trim()
							: "",
			};
		}
	}
	return null;
}

function refFromSection(section: SectionEntry): ContextRef {
	return {
		domain: section.ref.startsWith("adr:") ? "adr" : "spec",
		path: section.source_path,
		section: section.ref,
	};
}

function estimateTokens(values: string[]): number {
	return values.reduce(
		(total, value) => total + Math.max(1, Math.ceil(value.length / 4)),
		0,
	);
}

function estimateBundleTokens(bundle: ContextBundle): number {
	return estimateTokens([
		bundle.task_id,
		bundle.role,
		bundle.surface,
		bundle.file_path ?? "",
		bundle.mode,
		...bundle.refs.map(
			(ref) => `${ref.domain}:${ref.path}:${ref.section ?? ""}`,
		),
		...bundle.rules,
		...bundle.hooks,
		...bundle.hook_messages,
		...bundle.hook_contributions.flatMap((hook) => [
			hook.id,
			hook.path,
			...hook.messages,
			...hook.tools,
			...hook.validation_commands,
			...hook.pstr_refs,
			...hook.memory_refs,
			...hook.library_refs,
			...hook.do_not_load,
		]),
		...bundle.skills,
		...bundle.tools,
		...bundle.validation_commands,
		...bundle.pstr_refs,
		...bundle.memory_refs,
		...bundle.library_refs,
		...bundle.gaps,
		...bundle.do_not_load,
		bundle.rule_injection.identity,
		bundle.rule_injection.state_path,
		...bundle.rule_injection.injected.flatMap((rule) => [
			rule.id,
			rule.path,
			rule.content,
		]),
		...bundle.rule_injection.already_injected.flatMap((rule) => [
			rule.id,
			rule.path,
		]),
		...bundle.rule_injection.omitted.flatMap((rule) => [
			rule.id,
			rule.path,
			rule.reason,
		]),
		...(bundle.expanded_sections ?? []).flatMap((section) => [
			section.ref,
			section.title,
			section.source_path,
			section.snippet,
		]),
	]);
}

function selectSections(
	root: string,
	task: TaskRecord | null,
	surface: string,
): {
	sections: SectionEntry[];
	verifiedSources: ReadonlyMap<string, string>;
} {
	let trusted: ReturnType<typeof requireSectionIndexCache>;
	try {
		trusted = requireSectionIndexCache(root);
	} catch (error) {
		if (error instanceof SectionIndexTrustError) {
			throw new ContextTrustError(
				error.message,
				error.status,
				error.remediation,
			);
		}
		throw error;
	}
	const index = trusted.index;
	if (task?.featureId) {
		const needle = `spec:${task.featureId.trim().toLowerCase()}/`;
		const matches = index.sections.filter((section) =>
			section.ref.toLowerCase().startsWith(needle),
		);
		if (matches.length > 0) {
			return {
				sections: matches.slice(0, 3),
				verifiedSources: trusted.verified_sources,
			};
		}
	}
	const surfaceMatches = index.sections
		.filter((section) =>
			section.ref.toLowerCase().includes(surface.toLowerCase()),
		)
		.slice(0, 3);
	return {
		sections: surfaceMatches,
		verifiedSources: trusted.verified_sources,
	};
}

function selectExpandedSections(
	sections: SectionEntry[],
	mode: ContextRetrievalMode,
	verifiedSources: ReadonlyMap<string, string>,
): ContextExpandedSection[] {
	const full = mode === "tokenmax";
	return sections.slice(0, 3).flatMap((section) => {
		const content = verifiedSources.get(section.source_path);
		if (content === undefined) {
			return [];
		}
		const lines = content.split(/\r?\n/);
		const snippetLines = lines.slice(section.line_start - 1, section.line_end);
		const snippet = full
			? snippetLines.join("\n")
			: snippetLines.slice(0, 24).join("\n");
		return [
			{
				...section,
				snippet,
			},
		];
	});
}

function selectRules(
	root: string,
	options: Pick<BuildOptions, "surface" | "scope" | "filePath">,
): string[] {
	const surface = options.surface?.trim() || "general";
	const scope = options.scope?.trim();
	const filePath = options.filePath?.trim();
	return resolveContextRules(root, {
		workType: "delivery",
		surface,
		...(scope ? { scope } : {}),
		...(filePath ? { filePath } : {}),
	})
		.slice(0, 5)
		.map((rule) => rule.id);
}

function selectSkills(root: string, surface: string, role: string): string[] {
	const query = [surface, role].filter(Boolean).join(" ").trim();
	const matches = query ? searchSkills(root, query) : listSkills(root);
	const selected = matches.length > 0 ? matches : listSkills(root);
	return selected.slice(0, 5).map((skill) => skill.name);
}

function selectHooks(
	root: string,
	options: Pick<BuildOptions, "scope" | "filePath"> & {
		role: string;
		surface: string;
	},
): HookEntry[] {
	const context = deriveRuleSelectionContext({
		workType: "delivery",
		surface: options.surface,
		...(options.scope ? { scope: options.scope } : {}),
		...(options.filePath ? { filePath: options.filePath } : {}),
	});
	try {
		return resolveHooks(root, {
			event: "context.bundle",
			roles: [options.role],
			surfaces: context.surfaces,
			workType: context.workType,
			languages: context.languages,
			...(context.scope ? { scope: context.scope } : {}),
			...(context.filePath ? { filePath: context.filePath } : {}),
		}).slice(0, 5);
	} catch (error) {
		if (error instanceof HookResolverError) {
			throw new RuleInjectionError(error.message);
		}
		throw error;
	}
}

function contextHookContribution(hook: HookEntry): ContextHookContribution {
	return {
		id: hook.id,
		path: hook.path,
		messages: hook.contributions.messages,
		tools: hook.contributions.tools,
		validation_commands: hook.contributions.validationCommands,
		pstr_refs: hook.contributions.pstrRefs,
		memory_refs: hook.contributions.memoryRefs,
		library_refs: hook.contributions.libraryRefs,
		do_not_load: hook.contributions.doNotLoad,
	};
}

function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const value of values) {
		if (seen.has(value)) {
			continue;
		}
		seen.add(value);
		unique.push(value);
	}
	return unique;
}

function selectTools(
	session: string | undefined,
	task: string | undefined,
	surface: string,
): string[] {
	const tools = [
		"afol ctx section",
		"afol ctx explain",
		"afol pstr validate",
		"afol state validate",
		"afol validate project --json",
		"bun run typecheck",
		"bun test",
	];
	if (session) {
		tools.splice(2, 0, `afol state validate -S ${session}`);
	}
	if (task) {
		tools.unshift(
			`afol ctx bundle -S ${session ?? "<session>"} -T ${task} --role <role> --surface ${surface}`,
		);
	}
	return tools.slice(0, 10);
}

function selectValidationCommands(
	session: string | undefined,
	task: string | undefined,
): string[] {
	const commands = [
		"bun run typecheck",
		"bun test",
		"afol validate project --json",
	];
	if (session && task) {
		commands.unshift(`afol state validate -S ${session}`);
	}
	return commands.slice(0, 5);
}

function selectPstrRefs(root: string): string[] {
	const index = getPstrIndex(root);
	if (!index) {
		return [];
	}
	return index.maps.slice(0, 5).map((map) => `pstr:${map.id}`);
}

function bundleSearchTerms(
	taskId: string,
	surface: string,
	role: string,
): string[] {
	return [
		...new Set(
			[taskId, surface, role].map((value) => value.trim()).filter(Boolean),
		),
	];
}

function selectMemoryRefs(
	root: string,
	taskId: string,
	surface: string,
	role: string,
): string[] {
	const refs: string[] = [];
	const seen = new Set<string>();
	for (const query of bundleSearchTerms(taskId, surface, role)) {
		for (const entry of recallEntries(root, query, { limit: 3 })) {
			const ref = `memory:${entry.id}`;
			if (seen.has(ref)) {
				continue;
			}
			seen.add(ref);
			refs.push(ref);
			if (refs.length >= 3) {
				return refs;
			}
		}
	}
	return refs;
}

function selectLibraryRefs(
	root: string,
	taskId: string,
	surface: string,
	role: string,
): string[] {
	const queries = bundleSearchTerms(taskId, surface, role);
	if (queries.length === 0) {
		return [];
	}
	const claimRefs: string[] = [];
	const seenClaims = new Set<string>();
	const matchedSlugs = new Set<string>();
	for (const query of queries) {
		for (const result of searchLibrary(root, query)) {
			matchedSlugs.add(result.topic.slug);
			for (const claim of result.matching_claims) {
				const ref = `library:${result.topic.slug}#${claim.id}`;
				if (seenClaims.has(ref)) {
					continue;
				}
				seenClaims.add(ref);
				claimRefs.push(ref);
				if (claimRefs.length >= 3) {
					break;
				}
			}
		}
		if (claimRefs.length >= 3) {
			break;
		}
	}
	const matchedTopics = new Set(
		[...matchedSlugs].map((slug) => `library:${slug}`),
	);
	const graphRefs = buildLibraryGraph(root, { slugs: matchedSlugs })
		.edges.filter((edge) => matchedTopics.has(edge.from))
		.map((edge) => `library-graph:${edge.from}->${edge.to}[${edge.type}]`)
		.filter((ref, index, items) => items.indexOf(ref) === index)
		.slice(0, Math.max(0, 3 - claimRefs.length))
		.map((ref) => ref);
	return [...claimRefs, ...graphRefs].slice(0, 3);
}

function doNotLoadList(): string[] {
	return [
		"full docs/arc/** trees",
		"whole .afol/wb session dumps",
		"raw .afol/state/afol.db",
		"entire .afol/library/** trees",
		"entire .afol/memory/** trees",
	];
}

function assertTrustedContext(root: string, session: string | undefined): void {
	const pstrValidation = validatePstrIndex(root);
	if (!pstrValidation.ok) {
		throw new ContextTrustError(pstrValidation.message);
	}
	if (!session) {
		return;
	}
	const stateValidation = validateState(root, session);
	if (!stateValidation.ok) {
		throw new ContextTrustError(stateValidation.message);
	}
}

function omitLastInjectedRuleForBudget(next: ContextBundle): string | null {
	const removed = next.rule_injection.injected.pop();
	if (!removed) {
		return null;
	}
	next.rule_injection.budget.used_chars = Math.max(
		0,
		next.rule_injection.budget.used_chars - removed.char_count,
	);
	next.rule_injection.omitted.push({
		id: removed.id,
		path: removed.path,
		required: removed.required,
		char_count: removed.char_count,
		reason: `rule injection omitted to keep bundle token budget (${next.budget.total_tokens})`,
	});
	return removed.id;
}

function trimToBudget(
	root: string,
	bundle: ContextBundle,
	options: { persistRuleInjection?: boolean } = {},
): ContextBundle {
	const next = structuredClone(bundle) as ContextBundle;
	const omittedPersistedRuleIds: string[] = [];
	while (estimateBundleTokens(next) > next.budget.total_tokens) {
		if (next.expanded_sections && next.expanded_sections.length > 0) {
			const last = next.expanded_sections[next.expanded_sections.length - 1];
			if (last && last.snippet.length > 160) {
				last.snippet = `${last.snippet.slice(0, Math.max(80, Math.floor(last.snippet.length * 0.7))).trimEnd()}\n…`;
				continue;
			}
			next.expanded_sections.pop();
			continue;
		}
		if (next.library_refs.length > 0) {
			next.library_refs.pop();
			continue;
		}
		if (next.memory_refs.length > 0) {
			next.memory_refs.pop();
			continue;
		}
		if (next.refs.length > 4) {
			next.refs.pop();
			continue;
		}
		if (next.rules.length > 3) {
			next.rules.pop();
			continue;
		}
		if (next.hook_messages.length > 0) {
			const removed = next.hook_messages.pop();
			if (removed) {
				for (const hook of next.hook_contributions) {
					const index = hook.messages.lastIndexOf(removed);
					if (index >= 0) {
						hook.messages.splice(index, 1);
						break;
					}
				}
			}
			continue;
		}
		if (next.hook_contributions.length > 3) {
			next.hook_contributions.pop();
			next.hooks.pop();
			continue;
		}
		if (next.skills.length > 3) {
			next.skills.pop();
			continue;
		}
		if (next.tools.length > 5) {
			next.tools.pop();
			continue;
		}
		if (next.rule_injection.injected.length > 0) {
			const omittedRuleId = omitLastInjectedRuleForBudget(next);
			if (omittedRuleId) {
				omittedPersistedRuleIds.push(omittedRuleId);
			}
			continue;
		}
		break;
	}
	next.budget.used_tokens = estimateBundleTokens(next);
	if (
		options.persistRuleInjection === true &&
		omittedPersistedRuleIds.length > 0
	) {
		forgetRecordedRuleInjections(
			root,
			next.rule_injection.identity,
			omittedPersistedRuleIds,
		);
	}
	return next;
}

export function buildContextBundle(
	root: string,
	opts: BuildOptions,
): ContextBundle {
	const role = (opts.role ?? "worker").trim() || "worker";
	const requestedSurface = opts.surface?.trim();
	const scope = opts.scope?.trim();
	const inferredContext = deriveRuleSelectionContext({
		workType: "delivery",
		...(requestedSurface ? { surface: requestedSurface } : {}),
		...(scope ? { scope } : {}),
		...(opts.filePath ? { filePath: opts.filePath } : {}),
	});
	const filePath = inferredContext.filePath;
	const surface =
		(requestedSurface || inferredContext.surfaces[0] || "general").trim() ||
		"general";
	const mode = opts.mode ?? "balanced";
	const totalTokens = MODE_BUDGETS[mode];
	const session = opts.session?.trim() || "";
	const taskId = opts.task?.trim() || "";
	if (opts.trusted) {
		assertTrustedContext(root, session || undefined);
	}
	const task = session && taskId ? findTaskRecord(root, session, taskId) : null;
	const state = session ? loadSessionState(root, session) : null;
	const selection = selectSections(root, task, surface);
	const sections = selection.sections;
	const compact = mode === "compact";
	const rules = compact
		? []
		: selectRules(root, {
				surface,
				...(scope ? { scope } : {}),
				...(filePath ? { filePath } : {}),
			});
	const ruleInjectionOptions = {
		role,
		surface,
		workType: "delivery",
		...(session ? { session } : {}),
		...(taskId ? { task: taskId } : {}),
		...(scope ? { scope } : {}),
		...(filePath ? { filePath } : {}),
	};
	const ruleInjection = compact
		? resolveRuleInjectionShape(root, ruleInjectionOptions)
		: opts.persistRuleInjection === true
			? resolveAndRecordRuleInjection(root, ruleInjectionOptions)
			: resolveRuleInjection(root, ruleInjectionOptions);
	const hookEntries = compact
		? []
		: selectHooks(root, {
				role,
				surface,
				...(scope ? { scope } : {}),
				...(filePath ? { filePath } : {}),
			});
	const hookContributions = hookEntries.map(contextHookContribution);
	const hookMessages = hookContributions.flatMap((hook) => hook.messages);
	const hookTools = hookContributions.flatMap((hook) => hook.tools);
	const hookValidationCommands = hookContributions.flatMap(
		(hook) => hook.validation_commands,
	);
	const hookPstrRefs = hookContributions.flatMap((hook) => hook.pstr_refs);
	const hookMemoryRefs = hookContributions.flatMap((hook) => hook.memory_refs);
	const hookLibraryRefs = hookContributions.flatMap(
		(hook) => hook.library_refs,
	);
	const hookDoNotLoad = hookContributions.flatMap((hook) => hook.do_not_load);
	const expandedSections =
		mode === "deep" || mode === "tokenmax"
			? selectExpandedSections(sections, mode, selection.verifiedSources)
			: undefined;
	const bundle: ContextBundle = {
		task_id: taskId,
		role,
		surface,
		file_path: filePath,
		mode,
		refs: [
			...(task
				? [{ domain: "task", path: task.path, section: task.taskId }]
				: []),
			...sections.map(refFromSection),
		],
		rules,
		hooks: hookEntries.map((hook) => hook.id),
		hook_messages: hookMessages,
		hook_contributions: hookContributions,
		skills: compact ? [] : selectSkills(root, surface, role),
		tools: compact
			? []
			: uniqueStrings([
					...selectTools(session || undefined, taskId || undefined, surface),
					...hookTools,
				]),
		validation_commands: compact
			? []
			: uniqueStrings([
					...selectValidationCommands(
						session || undefined,
						taskId || undefined,
					),
					...hookValidationCommands,
				]),
		pstr_refs: compact
			? []
			: uniqueStrings([...selectPstrRefs(root), ...hookPstrRefs]),
		memory_refs: compact
			? []
			: uniqueStrings([
					...selectMemoryRefs(root, taskId, surface, role),
					...hookMemoryRefs,
				]),
		library_refs: compact
			? []
			: uniqueStrings([
					...selectLibraryRefs(root, taskId, surface, role),
					...hookLibraryRefs,
				]),
		budget: { total_tokens: totalTokens, used_tokens: 0 },
		gaps: compact
			? []
			: [
					!session ? "missing session" : "",
					!task ? "missing task record" : "",
					sections.length === 0 ? "no matching spec sections" : "",
					state ? "" : "no hydrated session state",
				].filter(Boolean),
		do_not_load: uniqueStrings([...doNotLoadList(), ...hookDoNotLoad]),
		rule_injection: ruleInjection,
		...(expandedSections ? { expanded_sections: expandedSections } : {}),
	};
	return trimToBudget(root, bundle, {
		persistRuleInjection: opts.persistRuleInjection === true && !compact,
	});
}

export { RuleInjectionError };
