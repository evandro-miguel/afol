import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	buildContextBundle,
	ContextTrustError,
	RuleInjectionError,
} from "../services/context/bundler";
import {
	getSectionIndex,
	rebuildSectionIndex,
	resolveSection,
	SectionIndexTrustError,
} from "../services/context/section-index";
import type { ContextRetrievalMode } from "../services/context/types";
import { checkAreaHealth } from "../services/health/checker";
import { listTopics } from "../services/library/crud";
import { readMemory } from "../services/memory/crud";
import { resolveProjectPaths } from "../services/project/paths";
import { checkPstrStale, validatePstrIndex } from "../services/pstr/builder";
import { type CommandIo, createJsonWriters, DEFAULT_IO } from "./io";
import { resolveSession as resolveVerifySession } from "./workbench/verify";

const jsonOutput = createJsonWriters("ctx");

type ContextAction =
	| "summary"
	| "build"
	| "tools"
	| "bundle"
	| "section"
	| "explain";

type ParsedArgs = {
	json: boolean;
	trusted: boolean;
	full: boolean;
	refsOnly: boolean;
	persistRuleInjection: boolean;
	session?: string;
	task?: string;
	role?: string;
	surface?: string;
	scope?: string;
	filePath?: string;
	mode?: ContextRetrievalMode;
	ref?: string;
	explain: boolean;
	summary: boolean;
};

const MODES: readonly ContextRetrievalMode[] = [
	"compact",
	"balanced",
	"deep",
	"tokenmax",
];

function normalizeAction(value: string | undefined): ContextAction {
	if (!value) {
		return "summary";
	}
	if (value === "build" || value === "b") {
		return "build";
	}
	if (value === "tools" || value === "t") {
		return "tools";
	}
	if (value === "bundle" || value === "bn") {
		return "bundle";
	}
	if (value === "section" || value === "se") {
		return "section";
	}
	if (value === "explain" || value === "ex") {
		return "explain";
	}
	throw new Error(`Unknown ctx action: ${value}`);
}

function formatSummary(root: string): string {
	const sectionCount = getSectionIndex(root)?.sections.length ?? 0;
	return [
		"ctx: choose an action",
		"actions: build, bundle, section, tools, explain",
		`sections: ${sectionCount}`,
		"hint: run afol ctx build to rebuild the section index",
	].join("\n");
}

function parseArgs(args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		json: false,
		trusted: false,
		full: false,
		refsOnly: false,
		persistRuleInjection: false,
		explain: false,
		summary: false,
	};
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--trusted") {
			parsed.trusted = true;
			continue;
		}
		if (value === "--explain") {
			parsed.explain = true;
			continue;
		}
		if (value === "--summary") {
			parsed.summary = true;
			continue;
		}
		if (value === "--refs-only") {
			parsed.refsOnly = true;
			continue;
		}
		if (value === "--full") {
			parsed.full = true;
			continue;
		}
		if (value === "--persist-rule-injection") {
			parsed.persistRuleInjection = true;
			continue;
		}
		if (value === "--session" || value === "-S") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --session.");
			}
			parsed.session = next;
			index += 1;
			continue;
		}
		if (value === "--task" || value === "-T") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --task.");
			}
			parsed.task = next;
			index += 1;
			continue;
		}
		if (value === "--role") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --role.");
			}
			parsed.role = next;
			index += 1;
			continue;
		}
		if (value === "--surface") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --surface.");
			}
			parsed.surface = next;
			index += 1;
			continue;
		}
		if (value === "--scope") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --scope.");
			}
			parsed.scope = next;
			index += 1;
			continue;
		}
		if (value === "--file") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --file.");
			}
			parsed.filePath = next;
			index += 1;
			continue;
		}
		if (value === "--mode") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --mode.");
			}
			if (!MODES.includes(next as ContextRetrievalMode)) {
				throw new Error(`Invalid ctx mode: ${next}`);
			}
			parsed.mode = next as ContextRetrievalMode;
			index += 1;
			continue;
		}
		if (value === "--ref") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --ref.");
			}
			parsed.ref = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown ctx argument: ${value}`);
	}
	return parsed;
}

function resolveBundleSession(
	root: string,
	explicit?: string,
): string | undefined {
	if (explicit) return explicit;
	try {
		return resolveVerifySession(root, "", "ctx bundle");
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith("Missing --session for ctx bundle;")
		) {
			return undefined;
		}
		throw error;
	}
}

function formatBundle(bundle: ReturnType<typeof buildContextBundle>): string {
	const ruleLimitWarnings = bundle.rule_injection.omitted
		.filter((rule) => rule.reason.startsWith("rule exceeds max_"))
		.map((rule) => `${rule.id}: ${rule.reason}`);
	return [
		`task: ${bundle.task_id || "none"}`,
		`role: ${bundle.role}`,
		`surface: ${bundle.surface}`,
		`file: ${bundle.file_path ?? "none"}`,
		`mode: ${bundle.mode}`,
		`refs: ${bundle.refs.length}`,
		`rules: ${bundle.rules.join(",") || "none"}`,
		`rule_injection: first_use=${bundle.rule_injection.first_use ? "yes" : "no"} injected=${bundle.rule_injection.injected.map((rule) => rule.id).join(",") || "none"} already=${bundle.rule_injection.already_injected.map((rule) => rule.id).join(",") || "none"} omitted=${bundle.rule_injection.omitted.map((rule) => rule.id).join(",") || "none"}`,
		...(ruleLimitWarnings.length > 0
			? [`warnings: ${ruleLimitWarnings.join("; ")}`]
			: []),
		`hooks: ${bundle.hooks.join(",") || "none"}`,
		`hook_messages: ${bundle.hook_messages.length}`,
		`skills: ${bundle.skills.join(",") || "none"}`,
		`tools: ${bundle.tools.length}`,
		`pstr_refs: ${bundle.pstr_refs.join(",") || "none"}`,
		`budget: ${bundle.budget.used_tokens}/${bundle.budget.total_tokens}`,
	].join("\n");
}

function memoryFreshness(root: string): "fresh" | "stale" | "missing" {
	const memory = readMemory(root);
	if (!memory) return "missing";
	const updated = Date.parse(memory.updated_at);
	if (!Number.isFinite(updated)) return "stale";
	return Date.now() - updated > 30 * 24 * 60 * 60 * 1000 ? "stale" : "fresh";
}

function pstrFreshness(root: string): "fresh" | "stale" | "missing" {
	const validation = validatePstrIndex(root);
	if (!validation.ok) {
		return existsSync(join(resolveProjectPaths(root).abs.pstrDir, "index.json"))
			? "stale"
			: "missing";
	}
	return checkPstrStale(root).some((entry) => entry.stale) ? "stale" : "fresh";
}

function libraryFreshness(root: string): "fresh" | "stale" | "missing" {
	if (!existsSync(resolveProjectPaths(root).abs.libraryDir)) return "missing";
	return listTopics(root).some((slug) => slug.trim()) ? "fresh" : "missing";
}

function formatExplanation(
	root: string,
	bundle: ReturnType<typeof buildContextBundle>,
	options: { full?: boolean } = {},
) {
	const relevantHealth = (["pstr", "memory", "library", "state"] as const)
		.flatMap((area) => checkAreaHealth(root, area))
		.filter(
			(finding) => finding.severity === "fail" || finding.severity === "warn",
		);
	const evidenceTags = Array.from(
		new Set([
			...bundle.refs.map((ref) => ref.domain),
			...(bundle.pstr_refs.length > 0 ? ["pstr"] : []),
			...(bundle.memory_refs.length > 0 ? ["memory"] : []),
			...(bundle.library_refs.length > 0 ? ["library"] : []),
		]),
	);
	const explanation = {
		ok: true,
		why: {
			included: [
				...bundle.refs.map(
					(ref) =>
						`${ref.domain}:${ref.path}${ref.section ? `#${ref.section}` : ""}`,
				),
				...bundle.memory_refs,
				...bundle.library_refs,
			],
			excluded: bundle.do_not_load,
		},
		gaps: [...bundle.gaps],
		project_health: relevantHealth.map((finding) => {
			const rootPattern = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const msg = finding.message.replace(new RegExp(rootPattern, "g"), ".");
			return `${finding.area}: ${msg}`;
		}),
		freshness: {
			pstr: pstrFreshness(root),
			memory: memoryFreshness(root),
			library: libraryFreshness(root),
			state: bundle.gaps.includes("no hydrated session state")
				? "missing"
				: "fresh",
		},
		budget: bundle.budget,
		bundle_size: {
			mode: bundle.mode,
			refs: bundle.refs.length,
			rules: bundle.rules.length,
			hooks: bundle.hooks.length,
			skills: bundle.skills.length,
			tools: bundle.tools.length,
			pstr_refs: bundle.pstr_refs.length,
			memory_refs: bundle.memory_refs.length,
			library_refs: bundle.library_refs.length,
			expanded_sections: bundle.expanded_sections?.length ?? 0,
			injected_rules: bundle.rule_injection.injected.length,
			omitted_rules: bundle.rule_injection.omitted.length,
		},
		evidence_tags: evidenceTags,
		create_safety_hints: [
			"load only cited refs",
			"avoid whole-tree loads",
			"prefer current memory and library refs",
		],
		do_not_load: bundle.do_not_load,
	};
	return options.full ? { ...explanation, bundle } : explanation;
}

function emitTrustError(
	io: CommandIo,
	action: ContextAction,
	json: boolean,
	error: ContextTrustError,
): void {
	if (json) {
		jsonOutput.err(io, action, "CTX_TRUST_ERROR", error.message, 1);
		return;
	}
	io.stderr(error.message);
}

export async function runContextCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	const ctxArgs = action?.startsWith("-") ? [action, ...args] : args;
	const wantsJson = ctxArgs.some(
		(value) => value === "--json" || value === "-j",
	);
	try {
		const ctxAction =
			action && !action.startsWith("-") ? normalizeAction(action) : "summary";
		const parsed = parseArgs(ctxArgs);
		if (parsed.summary && (ctxAction !== "bundle" || !parsed.json)) {
			throw new Error("--summary is only valid for ctx bundle --json.");
		}
		if (parsed.refsOnly && (ctxAction !== "bundle" || !parsed.json)) {
			throw new Error("--refs-only is only valid for ctx bundle --json.");
		}
		if (parsed.full && ctxAction !== "bundle" && ctxAction !== "explain") {
			throw new Error("--full is only valid for ctx bundle or ctx explain.");
		}

		if (ctxAction === "summary") {
			if (parsed.json) {
				const data = {
					actions: ["build", "bundle", "section", "tools", "explain"],
					sections: getSectionIndex(projectRoot)?.sections.length ?? 0,
					write_actions: ["build"],
					hint: "run afol ctx build to rebuild the section index",
				};
				jsonOutput.ok(io, ctxAction, data, [
					"actions",
					"sections",
					"write_actions",
					"hint",
				]);
			} else {
				io.stdout(formatSummary(projectRoot));
			}
			return 0;
		}

		if (ctxAction === "build") {
			if (requiresApproval(ctx)) {
				const message = "ctx build requires local interactive approval";
				if (parsed.json) {
					jsonOutput.err(io, "build", "approval-required", message, 2);
				} else {
					io.stderr(`err approval-required ${message}`);
				}
				return 2;
			}
			const snapshot = rebuildSectionIndex(projectRoot);
			if (parsed.json) {
				jsonOutput.ok(io, ctxAction, { snapshot }, ["snapshot"]);
			} else {
				io.stdout(`ctx build: ok sections=${snapshot.sections.length}`);
			}
			return 0;
		}

		if (ctxAction === "section") {
			if (!parsed.ref) {
				throw new Error("Missing --ref for ctx section.");
			}
			const section = resolveSection(projectRoot, parsed.ref);
			if (!section) {
				if (parsed.json) {
					jsonOutput.err(
						io,
						ctxAction,
						"CTX_SECTION_NOT_FOUND",
						`Section not found: ${parsed.ref}`,
						1,
					);
				} else {
					io.stderr(`Section not found: ${parsed.ref}`);
				}
				return 1;
			}
			if (parsed.json) {
				jsonOutput.ok(io, ctxAction, { section }, ["section"]);
			} else {
				io.stdout(JSON.stringify(section));
			}
			return 0;
		}

		let bundle: ReturnType<typeof buildContextBundle>;
		try {
			const persistRuleInjection =
				ctxAction === "bundle" &&
				!parsed.explain &&
				!parsed.summary &&
				parsed.persistRuleInjection;
			if (
				parsed.persistRuleInjection &&
				(ctxAction !== "bundle" || parsed.explain || parsed.summary)
			) {
				throw new Error(
					"--persist-rule-injection is only valid for ctx bundle without --explain or --summary.",
				);
			}
			if (persistRuleInjection && parsed.mode === "compact") {
				throw new Error(
					"--persist-rule-injection requires ctx bundle mode balanced, deep, or tokenmax.",
				);
			}
			if (persistRuleInjection && requiresApproval(ctx)) {
				const message =
					"ctx bundle --persist-rule-injection requires local interactive approval";
				if (parsed.json) {
					jsonOutput.err(io, "bundle", "approval-required", message, 2);
				} else {
					io.stderr(`err approval-required ${message}`);
				}
				return 2;
			}
			const bundleSession =
				ctxAction === "bundle"
					? resolveBundleSession(projectRoot, parsed.session)
					: parsed.session;
			bundle = buildContextBundle(projectRoot, {
				...(bundleSession ? { session: bundleSession } : {}),
				...(parsed.task ? { task: parsed.task } : {}),
				...(parsed.role ? { role: parsed.role } : {}),
				...(parsed.surface ? { surface: parsed.surface } : {}),
				...(parsed.scope ? { scope: parsed.scope } : {}),
				...(parsed.filePath ? { filePath: parsed.filePath } : {}),
				...(parsed.mode ? { mode: parsed.mode } : {}),
				...(parsed.trusted ? { trusted: true } : {}),
				...(persistRuleInjection ? { persistRuleInjection: true } : {}),
			});
		} catch (error) {
			if (error instanceof ContextTrustError) {
				emitTrustError(io, ctxAction, parsed.json, error);
				return 1;
			}
			if (error instanceof RuleInjectionError) {
				if (parsed.json) {
					jsonOutput.err(
						io,
						ctxAction,
						"CTX_RULE_INJECTION_ERROR",
						error.message,
						1,
					);
				} else {
					io.stderr(error.message);
				}
				return 1;
			}
			throw error;
		}

		if (ctxAction === "tools") {
			if (parsed.json) {
				jsonOutput.ok(io, ctxAction, { tools: bundle.tools }, ["tools"]);
			} else {
				io.stdout(bundle.tools.join("\n"));
			}
			return 0;
		}

		if (ctxAction === "bundle") {
			if (parsed.explain || parsed.summary) {
				const explanation = formatExplanation(projectRoot, bundle, {
					full: parsed.explain && parsed.full,
				});
				if (parsed.json) {
					jsonOutput.ok(
						io,
						ctxAction,
						explanation,
						Object.keys(explanation) as (keyof typeof explanation)[],
					);
				} else {
					io.stdout(JSON.stringify(explanation, null, 2));
				}
				return 0;
			}
			if (parsed.refsOnly) {
				if (parsed.json) {
					jsonOutput.ok(io, ctxAction, { refs: bundle.refs }, ["refs"]);
				} else {
					io.stdout(JSON.stringify(bundle.refs, null, 2));
				}
				return 0;
			}
			if (parsed.json) {
				if (parsed.full) {
					jsonOutput.ok(
						io,
						ctxAction,
						bundle,
						Object.keys(bundle) as (keyof typeof bundle)[],
					);
				} else {
					const compact = {
						task_id: bundle.task_id,
						role: bundle.role,
						surface: bundle.surface,
						file_path: bundle.file_path,
						mode: bundle.mode,
						refs: bundle.refs.length,
						rules: bundle.rules,
						hooks: bundle.hooks.length,
						hook_messages: bundle.hook_messages.length,
						skills: bundle.skills,
						tools: bundle.tools.length,
						pstr_refs: bundle.pstr_refs,
						memory_refs: bundle.memory_refs,
						library_refs: bundle.library_refs,
						rule_injection: bundle.rule_injection,
						budget: bundle.budget,
						gaps: bundle.gaps,
					};
					jsonOutput.ok(
						io,
						ctxAction,
						compact,
						Object.keys(compact) as (keyof typeof compact)[],
					);
				}
			} else {
				io.stdout(formatBundle(bundle));
			}
			return 0;
		}

		if (ctxAction === "explain") {
			const explanation = formatExplanation(projectRoot, bundle, {
				full: parsed.full,
			});
			if (parsed.json) {
				jsonOutput.ok(
					io,
					ctxAction,
					explanation,
					Object.keys(explanation) as (keyof typeof explanation)[],
				);
			} else {
				io.stdout(JSON.stringify(explanation, null, 2));
			}
			return 0;
		}

		const message = `internal error: unhandled ctx action '${ctxAction}'. This is a bug.`;
		if (parsed.json) {
			jsonOutput.err(io, action, "CTX_ACTION_UNHANDLED", message, 2);
		} else {
			io.stderr(message);
		}
		return 2;
	} catch (error) {
		if (error instanceof SectionIndexTrustError) {
			if (wantsJson) {
				jsonOutput.err(io, action, error.code, error.message, 1);
			} else {
				io.stderr(error.message);
			}
			return 1;
		}
		if (wantsJson && error instanceof Error && error.message) {
			jsonOutput.err(io, action, "CTX_USAGE_ERROR", error.message, 2);
			return 2;
		}
		if (error instanceof Error && error.message) {
			io.stderr(error.message);
			return 2;
		}
		io.stderr("Unknown ctx error");
		return 2;
	}
}
