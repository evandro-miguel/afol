import { relative } from "node:path";
import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
} from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	checkPstrStale,
	detectPstrAreas,
	getPstrIndex,
	getPstrSection,
	rebuildPstrIndex,
	reviewPstrCandidates,
	suggestPstrChanges,
	validatePstrIndex,
} from "../services/pstr";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type PstrAction =
	| "rebuild"
	| "show"
	| "validate"
	| "stale"
	| "section"
	| "detect"
	| "suggest"
	| "review-candidates";

function hasJsonFlag(args: string[]): boolean {
	return args.some((value) => value === "--json" || value === "-j");
}

function writeJsonOk<T extends Record<string, unknown>>(
	io: CommandIo,
	action: PstrAction,
	data: T,
	legacyKeys: readonly (keyof T)[] = [],
): void {
	const envelope = envelopeWithLegacyKeys(
		envelopeOk(data, { action: `pstr.${action}` }),
		legacyKeys,
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
			envelopeErr(code, message, { action: `pstr.${action}`, exitCode }),
		),
	);
}

function normalizeAction(value: string | undefined): PstrAction {
	if (!value || value === "show" || value === "sh") {
		return "show";
	}
	if (value === "rebuild" || value === "rb") {
		return "rebuild";
	}
	if (value === "validate" || value === "v") {
		return "validate";
	}
	if (value === "stale" || value === "st") {
		return "stale";
	}
	if (value === "section" || value === "sec") {
		return "section";
	}
	if (value === "detect" || value === "det") {
		return "detect";
	}
	if (value === "suggest" || value === "sug") {
		return "suggest";
	}
	if (value === "review-candidates" || value === "review" || value === "rc") {
		return "review-candidates";
	}
	throw new Error(`Unknown pstr action: ${value}`);
}

function parseJsonFlag(args: string[]): boolean {
	let json = false;
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		throw new Error(`Unknown pstr argument: ${value}`);
	}
	return json;
}

function parseSectionArgs(args: string[]): { json: boolean; id: string } {
	let json = false;
	let id = "";
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown pstr argument: ${value}`);
		}
		if (id) {
			throw new Error("Usage: afol pstr section <id> [--json]");
		}
		id = value;
	}
	if (!id) {
		throw new Error("Usage: afol pstr section <id> [--json]");
	}
	return { json, id };
}

function parseReviewArgs(args: string[]): { json: boolean; apply?: string } {
	let json = false;
	let apply = "";
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--apply") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --apply.");
			}
			apply = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown pstr argument: ${value}`);
	}
	return { json, ...(apply ? { apply } : {}) };
}

function isPstrMutation(action: PstrAction, rawArgs: string[]): boolean {
	if (action === "rebuild") return true;
	if (action === "review-candidates") {
		return rawArgs.includes("--apply");
	}
	return false;
}

function assertMutationAllowed(
	action: PstrAction,
	rawArgs: string[],
	ctx: OperationContext,
): void {
	if (isPstrMutation(action, rawArgs) && requiresApproval(ctx)) {
		throw new Error(`pstr ${action} requires local interactive approval`);
	}
}

/** Replace absolute `root` paths with `.` in a string for display output. */
function normalizeMessagePath(message: string, root: string): string {
	if (!root) return message;
	const rootPattern = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return message.replace(new RegExp(rootPattern, "g"), ".");
}

/** Normalise absolute paths in a snapshot to repo-relative for display output. */
function snapshotWithRepoRelativePaths(
	snapshot: ReturnType<typeof rebuildPstrIndex>,
	root: string,
): ReturnType<typeof rebuildPstrIndex> {
	if (!root) return snapshot;
	return {
		...snapshot,
		source: {
			project_root: relative(root, snapshot.source.project_root) || ".",
			pstr_dir: relative(root, snapshot.source.pstr_dir) || ".",
		},
	};
}

export async function runPstrCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		const pstrAction = normalizeAction(action);
		assertMutationAllowed(pstrAction, args, ctx);

		if (pstrAction === "rebuild") {
			const json = parseJsonFlag(args);
			const snapshot = rebuildPstrIndex(projectRoot);
			if (json) {
				writeJsonOk(
					io,
					pstrAction,
					{
						snapshot: snapshotWithRepoRelativePaths(snapshot, projectRoot),
					},
					["snapshot"],
				);
			} else {
				io.stdout(
					[
						"pstr rebuild: ok",
						`maps: ${snapshot.maps.length}`,
						...snapshot.maps.map(
							(map) =>
								`  ${map.id}: ${map.file_count} files, hash=${map.source_hash.slice(0, 12)}...`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (pstrAction === "show") {
			const json = parseJsonFlag(args);
			const index = getPstrIndex(projectRoot);
			if (!index) {
				if (json) {
					writeJsonErr(
						io,
						pstrAction,
						"pstr.show.missing_index",
						"pstr show: no index found. Run `afol pstr rebuild` first.",
						1,
					);
					return 1;
				}
				io.stderr("pstr show: no index found. Run `afol pstr rebuild` first.");
				return 1;
			}
			if (json) {
				writeJsonOk(
					io,
					pstrAction,
					{ snapshot: snapshotWithRepoRelativePaths(index, projectRoot) },
					["snapshot"],
				);
			} else {
				io.stdout(
					[
						"pstr show:",
						`maps: ${index.maps.length}`,
						`generated: ${index.generated_at}`,
						...index.maps.map(
							(map) =>
								`  ${map.id} [${map.status}]: ${map.scope}, ${map.file_count} files`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (pstrAction === "detect") {
			const json = parseJsonFlag(args);
			const areas = detectPstrAreas(projectRoot);
			if (json) {
				writeJsonOk(io, pstrAction, { areas }, ["areas"]);
			} else {
				io.stdout(
					[
						`pstr detect: ${areas.length} areas`,
						...areas.map(
							(area) =>
								`  ${area.id}: ${area.file_count} files (${area.source_roots.join(", ")})`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (pstrAction === "suggest") {
			const json = parseJsonFlag(args);
			const suggestions = suggestPstrChanges(projectRoot);
			if (json) {
				writeJsonOk(io, pstrAction, { suggestions }, ["suggestions"]);
			} else {
				io.stdout(
					[
						`pstr suggest: ${suggestions.length}`,
						...suggestions.map(
							(suggestion) =>
								`  ${suggestion.severity.toUpperCase()} ${suggestion.id}: ${suggestion.message} -> ${suggestion.action}`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (pstrAction === "review-candidates") {
			const parsed = parseReviewArgs(args);
			const candidates = reviewPstrCandidates(projectRoot);
			if (parsed.apply) {
				const candidate = candidates.find((entry) => entry.id === parsed.apply);
				if (!candidate) {
					const available =
						candidates.map((entry) => entry.id).join(", ") || "none";
					const message = `pstr review-candidates: candidate not found: ${parsed.apply}; available: ${available}`;
					if (parsed.json) {
						writeJsonErr(
							io,
							pstrAction,
							"pstr.review_candidate.not_found",
							message,
							1,
						);
					} else {
						io.stderr(message);
					}
					return 1;
				}
				const snapshot = snapshotWithRepoRelativePaths(
					rebuildPstrIndex(projectRoot),
					projectRoot,
				);
				if (parsed.json) {
					writeJsonOk(io, pstrAction, { applied: candidate, snapshot }, [
						"applied",
						"snapshot",
					]);
				} else {
					io.stdout(`pstr review-candidates apply: ${candidate.id}`);
				}
				return 0;
			}
			if (parsed.json) {
				writeJsonOk(io, pstrAction, { candidates }, ["candidates"]);
			} else {
				io.stdout(
					[
						`pstr review-candidates: ${candidates.length}`,
						...candidates.map(
							(candidate) =>
								`  ${candidate.id}: ${candidate.title} (${candidate.reason})`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (pstrAction === "validate") {
			const json = parseJsonFlag(args);
			const result = validatePstrIndex(projectRoot);
			const msg = normalizeMessagePath(result.message, projectRoot);
			if (json) {
				if (result.ok) {
					writeJsonOk(io, pstrAction, { ...result, message: msg });
				} else {
					writeJsonErr(io, pstrAction, "pstr.validate.failed", msg, 1);
				}
			} else {
				io.stdout(`pstr validate: ${result.ok ? "ok" : "fail"} ${msg}`);
			}
			return result.ok ? 0 : 1;
		}

		if (pstrAction === "stale") {
			const json = parseJsonFlag(args);
			const staleResults = checkPstrStale(projectRoot);
			const normalized = staleResults.map((entry) => ({
				...entry,
				message: normalizeMessagePath(entry.message, projectRoot),
			}));
			const anyStale = normalized.some((result) => result.stale);
			if (json) {
				if (anyStale) {
					writeJsonErr(
						io,
						pstrAction,
						"pstr.stale.failed",
						normalized.find((result) => result.stale)?.message ??
							"stale areas found",
						1,
					);
				} else {
					writeJsonOk(io, pstrAction, { areas: normalized }, ["areas"]);
				}
			} else {
				io.stdout(
					[
						`pstr stale: ${anyStale ? "stale areas found" : "all current"}`,
						...normalized.map(
							(result) =>
								`  ${result.stale ? "STALE" : "ok"} ${result.id}: ${result.message}`,
						),
					].join("\n"),
				);
			}
			return anyStale ? 1 : 0;
		}

		if (pstrAction === "section") {
			const parsed = parseSectionArgs(args);
			const section = getPstrSection(projectRoot, parsed.id);
			if (!section) {
				if (parsed.json) {
					writeJsonErr(
						io,
						pstrAction,
						"pstr.section.not_found",
						`pstr section: not found: ${parsed.id}`,
						1,
					);
					return 1;
				}
				io.stderr(`pstr section: not found: ${parsed.id}`);
				return 1;
			}
			if (!section.ok) {
				const msg = normalizeMessagePath(section.message, projectRoot);
				if (parsed.json) {
					writeJsonErr(io, pstrAction, "pstr.section.failed", msg, 2);
					return 2;
				}
				io.stderr(msg);
				return 2;
			}
			if (parsed.json) {
				writeJsonOk(
					io,
					pstrAction,
					{ entry: section.entry, content: section.content },
					["entry", "content"],
				);
			} else {
				io.stdout(section.content);
			}
			return 0;
		}

		const message = `internal error: unhandled pstr action '${pstrAction}'. This is a bug.`;
		if (hasJsonFlag(args)) {
			writeJsonErr(io, pstrAction, "pstr.action.unhandled", message, 2);
		} else {
			io.stderr(message);
		}
		return 2;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (hasJsonFlag(args)) {
			writeJsonErr(io, action, "pstr.command.error", message, 2);
		} else {
			io.stderr(message);
		}
		return 2;
	}
}
