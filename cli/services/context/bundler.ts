import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveRules } from "../catalog/rules";
import { listSkills, searchSkills } from "../catalog/skills";
import { buildLibraryGraph, searchLibrary } from "../library";
import { recallEntries } from "../memory";
import { resolveProjectPaths } from "../project/paths";
import { getPstrIndex, validatePstrIndex } from "../pstr";
import { loadSessionState, validateState } from "../state";
import { getSectionIndex, rebuildSectionIndex } from "./section-index";
import type {
	ContextBundle,
	ContextExpandedSection,
	ContextRef,
	ContextRetrievalMode,
	SectionEntry,
} from "./types";

type BuildOptions = {
	session?: string;
	task?: string;
	role?: string;
	surface?: string;
	mode?: ContextRetrievalMode;
	trusted?: boolean;
};

export class ContextTrustError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ContextTrustError";
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
		bundle.mode,
		...bundle.refs.map(
			(ref) => `${ref.domain}:${ref.path}:${ref.section ?? ""}`,
		),
		...bundle.rules,
		...bundle.skills,
		...bundle.tools,
		...bundle.validation_commands,
		...bundle.pstr_refs,
		...bundle.memory_refs,
		...bundle.library_refs,
		...bundle.gaps,
		...bundle.do_not_load,
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
): SectionEntry[] {
	const index = getSectionIndex(root) ?? rebuildSectionIndex(root);
	if (task?.featureId) {
		const needle = `spec:${task.featureId.trim().toLowerCase()}`;
		const matches = index.sections.filter((section) =>
			section.ref.toLowerCase().startsWith(needle),
		);
		if (matches.length > 0) {
			return matches.slice(0, 3);
		}
	}
	const surfaceMatches = index.sections
		.filter((section) =>
			section.ref.toLowerCase().includes(surface.toLowerCase()),
		)
		.slice(0, 3);
	return surfaceMatches.length > 0
		? surfaceMatches
		: index.sections.slice(0, 3);
}

function selectExpandedSections(
	root: string,
	sections: SectionEntry[],
	mode: ContextRetrievalMode,
): ContextExpandedSection[] {
	const full = mode === "tokenmax";
	return sections.slice(0, 3).flatMap((section) => {
		const filePath = join(root, section.source_path);
		if (!existsSync(filePath)) {
			return [];
		}
		const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
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

function selectRules(root: string, surface: string): string[] {
	return resolveRules(root, { surfaces: [surface], workType: "delivery" })
		.slice(0, 5)
		.map((rule) => rule.id);
}

function selectSkills(root: string, surface: string, role: string): string[] {
	const query = [surface, role].filter(Boolean).join(" ").trim();
	const matches = query ? searchSkills(root, query) : listSkills(root);
	const selected = matches.length > 0 ? matches : listSkills(root);
	return selected.slice(0, 5).map((skill) => skill.name);
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

function bundleSearchQuery(
	taskId: string,
	surface: string,
	role: string,
): string {
	const queryParts = taskId ? [taskId, surface, role] : [surface, role];
	return queryParts.filter(Boolean).join(" ").trim();
}

function selectMemoryRefs(
	root: string,
	taskId: string,
	surface: string,
	role: string,
): string[] {
	const query = bundleSearchQuery(taskId, surface, role);
	if (!query) {
		return [];
	}
	return recallEntries(root, query, { limit: 3 }).map(
		(entry) => `memory:${entry.id}`,
	);
}

function selectLibraryRefs(
	root: string,
	taskId: string,
	surface: string,
	role: string,
): string[] {
	const query = bundleSearchQuery(taskId, surface, role);
	if (!query) {
		return [];
	}
	const matches = searchLibrary(root, query);
	const claimRefs = matches
		.flatMap((result) =>
			result.matching_claims.map(
				(claim) => `library:${result.topic.slug}#${claim.id}`,
			),
		)
		.slice(0, 3);
	const matchedSlugs = new Set(matches.map((result) => result.topic.slug));
	const matchedTopics = new Set(
		matches.map((result) => `library:${result.topic.slug}`),
	);
	const graphRefs = buildLibraryGraph(root, { slugs: matchedSlugs })
		.edges.filter((edge) => matchedTopics.has(edge.from))
		.slice(0, Math.max(0, 3 - claimRefs.length))
		.map((edge) => `library-graph:${edge.from}->${edge.to}[${edge.type}]`);
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

function trimToBudget(bundle: ContextBundle): ContextBundle {
	const next = structuredClone(bundle) as ContextBundle;
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
		if (next.skills.length > 3) {
			next.skills.pop();
			continue;
		}
		if (next.tools.length > 5) {
			next.tools.pop();
			continue;
		}
		break;
	}
	next.budget.used_tokens = estimateBundleTokens(next);
	return next;
}

export function buildContextBundle(
	root: string,
	opts: BuildOptions,
): ContextBundle {
	const role = (opts.role ?? "worker").trim() || "worker";
	const surface = (opts.surface ?? "general").trim() || "general";
	const mode = opts.mode ?? "balanced";
	const totalTokens = MODE_BUDGETS[mode];
	const session = opts.session?.trim() || "";
	const taskId = opts.task?.trim() || "";
	if (opts.trusted) {
		assertTrustedContext(root, session || undefined);
	}
	const task = session && taskId ? findTaskRecord(root, session, taskId) : null;
	const state = session ? loadSessionState(root, session) : null;
	const sections = selectSections(root, task, surface);
	const compact = mode === "compact";
	const expandedSections =
		mode === "deep" || mode === "tokenmax"
			? selectExpandedSections(root, sections, mode)
			: undefined;
	const bundle: ContextBundle = {
		task_id: taskId,
		role,
		surface,
		mode,
		refs: [
			...(task
				? [{ domain: "task", path: task.path, section: task.taskId }]
				: []),
			...sections.map(refFromSection),
		],
		rules: compact ? [] : selectRules(root, surface),
		skills: compact ? [] : selectSkills(root, surface, role),
		tools: compact
			? []
			: selectTools(session || undefined, taskId || undefined, surface),
		validation_commands: compact
			? []
			: selectValidationCommands(session || undefined, taskId || undefined),
		pstr_refs: compact ? [] : selectPstrRefs(root),
		memory_refs: compact ? [] : selectMemoryRefs(root, taskId, surface, role),
		library_refs: compact ? [] : selectLibraryRefs(root, taskId, surface, role),
		budget: { total_tokens: totalTokens, used_tokens: 0 },
		gaps: compact
			? []
			: [
					!session ? "missing session" : "",
					!task ? "missing task record" : "",
					sections.length === 0 ? "no matching spec sections" : "",
					state ? "" : "no hydrated session state",
				].filter(Boolean),
		do_not_load: doNotLoadList(),
		...(expandedSections ? { expanded_sections: expandedSections } : {}),
	};
	return trimToBudget(bundle);
}
