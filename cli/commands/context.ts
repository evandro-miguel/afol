import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
} from "../core/envelope";
import {
	buildContextBundle,
	rebuildSectionIndex,
	resolveSection,
} from "../services/context";
import { ContextTrustError } from "../services/context/bundler";
import type { ContextRetrievalMode } from "../services/context/types";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type ContextAction = "build" | "tools" | "bundle" | "section" | "explain";

type ParsedArgs = {
	json: boolean;
	trusted: boolean;
	session?: string;
	task?: string;
	role?: string;
	surface?: string;
	mode?: ContextRetrievalMode;
	ref?: string;
	explain: boolean;
};

const MODES: readonly ContextRetrievalMode[] = [
	"compact",
	"balanced",
	"deep",
	"tokenmax",
];

function normalizeAction(value: string | undefined): ContextAction {
	if (!value || value === "build" || value === "b") {
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

function parseArgs(args: string[]): ParsedArgs {
	const parsed: ParsedArgs = { json: false, trusted: false, explain: false };
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

function formatBundle(bundle: ReturnType<typeof buildContextBundle>): string {
	return [
		`task: ${bundle.task_id || "none"}`,
		`role: ${bundle.role}`,
		`surface: ${bundle.surface}`,
		`mode: ${bundle.mode}`,
		`refs: ${bundle.refs.length}`,
		`rules: ${bundle.rules.join(",") || "none"}`,
		`skills: ${bundle.skills.join(",") || "none"}`,
		`tools: ${bundle.tools.length}`,
		`pstr_refs: ${bundle.pstr_refs.join(",") || "none"}`,
		`budget: ${bundle.budget.used_tokens}/${bundle.budget.total_tokens}`,
	].join("\n");
}

function formatExplanation(bundle: ReturnType<typeof buildContextBundle>) {
	const evidenceTags = Array.from(
		new Set([
			...bundle.refs.map((ref) => ref.domain),
			...(bundle.pstr_refs.length > 0 ? ["pstr"] : []),
			...(bundle.memory_refs.length > 0 ? ["memory"] : []),
			...(bundle.library_refs.length > 0 ? ["library"] : []),
		]),
	);
	return {
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
		gaps: bundle.gaps,
		freshness: {
			pstr: bundle.pstr_refs.length > 0 ? "fresh" : "missing",
			memory: bundle.memory_refs.length > 0 ? "fresh" : "missing",
			library: bundle.library_refs.length > 0 ? "fresh" : "missing",
			state: bundle.gaps.includes("no hydrated session state")
				? "missing"
				: "fresh",
		},
		evidence_tags: evidenceTags,
		create_safety_hints: [
			"load only cited refs",
			"avoid whole-tree loads",
			"prefer current memory and library refs",
		],
		do_not_load: bundle.do_not_load,
		bundle,
	};
}

function writeJsonOk<T extends Record<string, unknown>>(
	io: CommandIo,
	action: string,
	data: T,
): void {
	const envelope = envelopeWithLegacyKeys(
		envelopeOk(data, { action: `ctx.${action}` }),
		Object.keys(data) as (keyof T)[],
	);
	io.stdout(stringifyEnvelope(envelope));
}

function writeJsonErr(
	io: CommandIo,
	action: string,
	code: string,
	message: string,
	exitCode: 1 | 2,
): void {
	io.stdout(
		stringifyEnvelope(
			envelopeErr(code, message, { action: `ctx.${action}`, exitCode }),
		),
	);
}

function emitTrustError(
	io: CommandIo,
	action: ContextAction,
	json: boolean,
	error: ContextTrustError,
): void {
	if (json) {
		writeJsonErr(io, action, "CTX_TRUST_ERROR", error.message, 1);
		return;
	}
	io.stderr(error.message);
}

export async function runContextCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	const wantsJson = args.some((value) => value === "--json" || value === "-j");
	try {
		const ctxAction = normalizeAction(action);
		const parsed = parseArgs(args);

		if (ctxAction === "build") {
			const snapshot = rebuildSectionIndex(projectRoot);
			if (parsed.json) {
				writeJsonOk(io, ctxAction, { snapshot });
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
					writeJsonErr(
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
				writeJsonOk(io, ctxAction, { section });
			} else {
				io.stdout(JSON.stringify(section));
			}
			return 0;
		}

		let bundle: ReturnType<typeof buildContextBundle>;
		try {
			bundle = buildContextBundle(projectRoot, {
				...(parsed.session ? { session: parsed.session } : {}),
				...(parsed.task ? { task: parsed.task } : {}),
				...(parsed.role ? { role: parsed.role } : {}),
				...(parsed.surface ? { surface: parsed.surface } : {}),
				...(parsed.mode ? { mode: parsed.mode } : {}),
				...(parsed.trusted ? { trusted: true } : {}),
			});
		} catch (error) {
			if (error instanceof ContextTrustError) {
				emitTrustError(io, ctxAction, parsed.json, error);
				return 1;
			}
			throw error;
		}

		if (ctxAction === "tools") {
			if (parsed.json) {
				writeJsonOk(io, ctxAction, { tools: bundle.tools });
			} else {
				io.stdout(bundle.tools.join("\n"));
			}
			return 0;
		}

		if (ctxAction === "bundle") {
			if (parsed.explain) {
				const explanation = formatExplanation(bundle);
				if (parsed.json) {
					writeJsonOk(io, ctxAction, explanation);
				} else {
					io.stdout(JSON.stringify(explanation, null, 2));
				}
				return 0;
			}
			if (parsed.json) {
				writeJsonOk(io, ctxAction, bundle);
			} else {
				io.stdout(formatBundle(bundle));
			}
			return 0;
		}

		if (ctxAction === "explain") {
			const explanation = formatExplanation(bundle);
			if (parsed.json) {
				writeJsonOk(io, ctxAction, explanation);
			} else {
				io.stdout(JSON.stringify(explanation, null, 2));
			}
			return 0;
		}

		const message = `internal error: unhandled ctx action '${ctxAction}'. This is a bug.`;
		if (parsed.json) {
			writeJsonErr(io, action, "CTX_ACTION_UNHANDLED", message, 2);
		} else {
			io.stderr(message);
		}
		return 2;
	} catch (error) {
		if (wantsJson && error instanceof Error && error.message) {
			writeJsonErr(io, action, "CTX_USAGE_ERROR", error.message, 2);
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
