import { type FSWatcher, watch } from "node:fs";
import { relative, resolve } from "node:path";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	buildPstrDiff,
	checkPstrStale,
	detectPstrAreas,
	getPstrIndex,
	getPstrSection,
	rebuildPstrIndex,
	reviewPstrCandidates,
	suggestPstrChanges,
	validatePstrIndex,
} from "../services/pstr/builder";
import { getPstrWatchTargets } from "../services/pstr/watch";
import { type CommandIo, createJsonWriters, DEFAULT_IO } from "./io";

const jsonOutput = createJsonWriters("pstr");

type PstrAction =
	| "rebuild"
	| "show"
	| "validate"
	| "stale"
	| "section"
	| "diff"
	| "watch"
	| "detect"
	| "suggest"
	| "review-candidates";

type ParsedPathArgs = {
	json: boolean;
	paths: string[];
};

type ParsedRebuildArgs = {
	json: boolean;
	verbose: boolean;
};

type ParsedWatchArgs = ParsedPathArgs & {
	once: boolean;
	debounceMs: number;
};

type WatchCycleEvent = "once" | "change" | "resync";

type WatchCycleResult = {
	event: WatchCycleEvent;
	rebuilt: boolean;
	diff: ReturnType<typeof buildPstrDiff>;
	snapshot: ReturnType<typeof rebuildPstrIndex> | null;
};

type PstrRebuildSummary = {
	kind: ReturnType<typeof rebuildPstrIndex>["kind"];
	version: ReturnType<typeof rebuildPstrIndex>["version"];
	generated_at: string;
	source: ReturnType<typeof rebuildPstrIndex>["source"];
	maps: {
		count: number;
		total_files: number;
		ids: string[];
	};
};

function hasJsonFlag(args: string[]): boolean {
	return args.some((value) => value === "--json" || value === "-j");
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
	if (value === "diff") {
		return "diff";
	}
	if (value === "watch") {
		return "watch";
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

function parseRebuildArgs(args: string[]): ParsedRebuildArgs {
	const parsed: ParsedRebuildArgs = { json: false, verbose: false };
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--verbose" || value === "-v") {
			parsed.verbose = true;
			continue;
		}
		throw new Error(`Unknown pstr argument: ${value}`);
	}
	return parsed;
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

function parsePathArgs(args: string[]): ParsedPathArgs {
	let json = false;
	const paths: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--path") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --path.");
			}
			paths.push(next);
			index += 1;
			continue;
		}
		throw new Error(`Unknown pstr argument: ${value}`);
	}
	return { json, paths };
}

function parseWatchArgs(args: string[]): ParsedWatchArgs {
	let json = false;
	const paths: string[] = [];
	let once = false;
	let debounceMs = 250;
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === undefined) {
			continue;
		}
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--once") {
			once = true;
			continue;
		}
		if (value === "--path") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --path.");
			}
			paths.push(next);
			index += 1;
			continue;
		}
		if (value === "--debounce-ms") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --debounce-ms.");
			}
			const parsed = Number.parseInt(next, 10);
			if (!Number.isFinite(parsed) || parsed < 0) {
				throw new Error(`Invalid value for --debounce-ms: ${next}`);
			}
			debounceMs = parsed;
			index += 1;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown pstr argument: ${value}`);
		}
		throw new Error(`Unknown pstr argument: ${value}`);
	}
	return {
		json,
		paths,
		once,
		debounceMs,
	};
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
	if (action === "watch") return true;
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

function summarizePstrSnapshot(
	snapshot: ReturnType<typeof rebuildPstrIndex>,
): PstrRebuildSummary {
	return {
		kind: snapshot.kind,
		version: snapshot.version,
		generated_at: snapshot.generated_at,
		source: snapshot.source,
		maps: {
			count: snapshot.maps.length,
			total_files: snapshot.maps.reduce((sum, map) => sum + map.file_count, 0),
			ids: snapshot.maps.map((map) => map.id),
		},
	};
}

function normalizeRepoRelativePath(root: string, pathValue: string): string {
	if (!pathValue) {
		return "";
	}
	const normalized = pathValue.replace(/\\/g, "/");
	const relativePath = normalized.startsWith("/")
		? relative(root, normalized)
		: normalized.replace(/^\.\//, "");
	return relativePath.replace(/\\/g, "/").replace(/\/+$/g, "");
}

function uniquePaths(root: string, paths: string[]): string[] {
	return [
		...new Set(paths.map((path) => normalizeRepoRelativePath(root, path))),
	]
		.filter(Boolean)
		.sort((left, right) => left.localeCompare(right));
}

function diffCounts(
	diff: ReturnType<typeof buildPstrDiff>,
): Record<string, number> {
	return {
		added: diff.added.length,
		removed: diff.removed.length,
		changed: diff.changed.length,
		missing: diff.missing.length,
		stale: diff.stale.length,
		unchanged: diff.unchanged.length,
	};
}

function hasActionableDiff(diff: ReturnType<typeof buildPstrDiff>): boolean {
	return (
		!diff.snapshot_exists ||
		diff.added.length > 0 ||
		diff.removed.length > 0 ||
		diff.changed.length > 0 ||
		diff.missing.length > 0 ||
		diff.stale.length > 0
	);
}

function normalizeDiffForOutput(
	diff: ReturnType<typeof buildPstrDiff>,
	root: string,
): ReturnType<typeof buildPstrDiff> {
	const normalizeEntry = (
		entry: (typeof diff.added)[number],
	): (typeof diff.added)[number] => ({
		...entry,
		section_path: normalizeRepoRelativePath(root, entry.section_path),
	});
	return {
		...diff,
		added: diff.added.map(normalizeEntry),
		removed: diff.removed.map(normalizeEntry),
		changed: diff.changed.map(normalizeEntry),
		unchanged: diff.unchanged.map(normalizeEntry),
		missing: diff.missing.map(normalizeEntry),
		stale: diff.stale.map(normalizeEntry),
	};
}

function formatAffectedPaths(diff: ReturnType<typeof buildPstrDiff>): string[] {
	if (diff.affected_paths.length === 0) {
		return [];
	}
	return [
		"affected:",
		...diff.affected_paths.map((entry) => {
			const areas =
				entry.area_ids.length > 0 ? entry.area_ids.join(",") : "none";
			return `  ${entry.path} -> ${areas}`;
		}),
	];
}

function formatDiffSummary(
	title: string,
	diff: ReturnType<typeof buildPstrDiff>,
): string {
	const counts = diffCounts(diff);
	return [
		`${title}: ${hasActionableDiff(diff) ? "changes detected" : "no changes"}`,
		`counts: added=${counts.added} removed=${counts.removed} changed=${counts.changed} missing=${counts.missing} stale=${counts.stale} unchanged=${counts.unchanged}`,
		...formatAffectedPaths(diff),
	].join("\n");
}

function runWatchCycle(
	projectRoot: string,
	event: WatchCycleEvent,
	changedPaths: string[],
	forceFullRebuild: boolean,
): WatchCycleResult {
	const normalizedPaths = uniquePaths(projectRoot, changedPaths);
	const diff = normalizeDiffForOutput(
		buildPstrDiff(
			projectRoot,
			normalizedPaths.length > 0 ? { changedPaths: normalizedPaths } : {},
		),
		projectRoot,
	);
	if (!hasActionableDiff(diff)) {
		return {
			event,
			rebuilt: false,
			diff,
			snapshot: null,
		};
	}
	const snapshot = snapshotWithRepoRelativePaths(
		forceFullRebuild || normalizedPaths.length === 0
			? rebuildPstrIndex(projectRoot)
			: rebuildPstrIndex(projectRoot, { changedPaths: normalizedPaths }),
		projectRoot,
	);
	return {
		event,
		rebuilt: true,
		diff,
		snapshot,
	};
}

function emitWatchError(
	io: CommandIo,
	json: boolean,
	projectRoot: string,
	error: unknown,
): void {
	const message = normalizeMessagePath(
		error instanceof Error ? error.message : String(error),
		projectRoot,
	);
	if (json) {
		jsonOutput.err(io, "watch", "pstr.watch.failed", message, 2);
		return;
	}
	io.stderr(message);
}

function emitWatchResult(
	io: CommandIo,
	json: boolean,
	result: WatchCycleResult,
): void {
	if (json) {
		jsonOutput.ok(
			io,
			"watch",
			{
				event: result.event,
				rebuilt: result.rebuilt,
				diff: result.diff,
				snapshot: result.snapshot,
			},
			["event", "rebuilt", "diff", "snapshot"],
		);
		return;
	}
	const status = result.rebuilt ? "rebuild applied" : "no rebuild needed";
	const summary = formatDiffSummary(
		`pstr watch (${result.event}, ${status})`,
		result.diff,
	);
	if (result.snapshot) {
		io.stdout(`${summary}\nmaps: ${result.snapshot.maps.length}`);
		return;
	}
	io.stdout(summary);
}

async function runPstrWatch(
	projectRoot: string,
	parsed: ParsedWatchArgs,
	io: CommandIo,
): Promise<number> {
	if (parsed.once) {
		try {
			emitWatchResult(
				io,
				parsed.json,
				runWatchCycle(projectRoot, "once", parsed.paths, false),
			);
			return 0;
		} catch (error) {
			emitWatchError(io, parsed.json, projectRoot, error);
			return 2;
		}
	}

	const watchTargets = getPstrWatchTargets(projectRoot, parsed.paths);
	if (watchTargets.length === 0) {
		emitWatchError(
			io,
			parsed.json,
			projectRoot,
			new Error("pstr watch: no watchable paths found."),
		);
		return 2;
	}

	if (!parsed.json) {
		io.stdout(
			[
				`pstr watch: watching ${watchTargets.length} roots`,
				`debounce_ms: ${parsed.debounceMs}`,
				...watchTargets.map(
					(target) =>
						`  ${normalizeRepoRelativePath(projectRoot, target) || "."}`,
				),
			].join("\n"),
		);
	}

	return new Promise<number>((resolvePromise) => {
		const watchers: FSWatcher[] = [];
		const pendingPaths = new Set<string>();
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;
		let unknownState = false;
		let settled = false;

		const cleanup = (): void => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			for (const watcherHandle of watchers) {
				watcherHandle.close();
			}
			process.off("SIGINT", stop);
			process.off("SIGTERM", stop);
		};

		const settle = (exitCode: number): void => {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			resolvePromise(exitCode);
		};

		const fail = (error: unknown): void => {
			if (settled) {
				return;
			}
			emitWatchError(io, parsed.json, projectRoot, error);
			settle(2);
		};

		const handleWatchEvent = (target: string) => {
			return (eventType: string, filename: string | Buffer | null): void => {
				if (eventType === "rename" || !filename) {
					unknownState = true;
					scheduleFlush();
					return;
				}
				const relativePath = normalizeRepoRelativePath(
					projectRoot,
					resolve(target, String(filename)),
				);
				if (!relativePath) {
					unknownState = true;
				} else {
					pendingPaths.add(relativePath);
				}
				scheduleFlush();
			};
		};

		const setWatchers = (nextTargets: string[]): void => {
			const nextWatchers: FSWatcher[] = [];
			try {
				for (const target of nextTargets) {
					const watcherHandle = watch(target, handleWatchEvent(target));
					watcherHandle.on("error", fail);
					nextWatchers.push(watcherHandle);
				}
			} catch (error) {
				for (const watcherHandle of nextWatchers) {
					watcherHandle.close();
				}
				throw error;
			}
			for (const watcherHandle of watchers) {
				watcherHandle.close();
			}
			watchers.splice(0, watchers.length, ...nextWatchers);
		};

		const refreshWatchers = (): void => {
			const watchTargets = getPstrWatchTargets(projectRoot, parsed.paths);
			if (watchTargets.length === 0) {
				throw new Error("pstr watch: no watchable paths found.");
			}
			setWatchers(watchTargets);
		};

		const flush = (): void => {
			debounceTimer = null;
			const changedPaths = [...pendingPaths];
			pendingPaths.clear();
			const event: WatchCycleEvent =
				unknownState || changedPaths.length === 0 ? "resync" : "change";
			try {
				const result = runWatchCycle(
					projectRoot,
					event,
					changedPaths,
					unknownState || changedPaths.length === 0,
				);
				unknownState = false;
				if (event !== "change") {
					refreshWatchers();
				}
				emitWatchResult(io, parsed.json, result);
			} catch (error) {
				fail(error);
			}
		};

		const scheduleFlush = (): void => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
			debounceTimer = setTimeout(flush, parsed.debounceMs);
		};

		const stop = (): void => {
			settle(0);
		};

		try {
			refreshWatchers();
			process.on("SIGINT", stop);
			process.on("SIGTERM", stop);
		} catch (error) {
			fail(error);
		}
	});
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
			const parsed = parseRebuildArgs(args);
			const snapshot = snapshotWithRepoRelativePaths(
				rebuildPstrIndex(projectRoot),
				projectRoot,
			);
			if (parsed.json) {
				const summary = summarizePstrSnapshot(snapshot);
				if (parsed.verbose) {
					jsonOutput.ok(
						io,
						pstrAction,
						{
							command: pstrAction,
							summary,
							output: "verbose",
							snapshot,
						},
						["command", "summary", "output", "snapshot"],
					);
				} else {
					jsonOutput.ok(
						io,
						pstrAction,
						{
							command: pstrAction,
							summary,
							output: "compact",
							hint: "Use `afol pstr rebuild --json --verbose` for full index snapshots.",
						},
						["command", "summary", "output", "hint"],
					);
				}
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
					jsonOutput.err(
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
				jsonOutput.ok(
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

		if (pstrAction === "diff") {
			const parsed = parsePathArgs(args);
			const diff = normalizeDiffForOutput(
				buildPstrDiff(
					projectRoot,
					parsed.paths.length > 0 ? { changedPaths: parsed.paths } : {},
				),
				projectRoot,
			);
			if (parsed.json) {
				jsonOutput.ok(io, pstrAction, { diff }, ["diff"]);
			} else {
				io.stdout(formatDiffSummary("pstr diff", diff));
			}
			return 0;
		}

		if (pstrAction === "watch") {
			return runPstrWatch(projectRoot, parseWatchArgs(args), io);
		}

		if (pstrAction === "detect") {
			const json = parseJsonFlag(args);
			const areas = detectPstrAreas(projectRoot);
			if (json) {
				jsonOutput.ok(io, pstrAction, { areas }, ["areas"]);
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
				jsonOutput.ok(io, pstrAction, { suggestions }, ["suggestions"]);
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
						jsonOutput.err(
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
					jsonOutput.ok(io, pstrAction, { applied: candidate, snapshot }, [
						"applied",
						"snapshot",
					]);
				} else {
					io.stdout(`pstr review-candidates apply: ${candidate.id}`);
				}
				return 0;
			}
			if (parsed.json) {
				jsonOutput.ok(io, pstrAction, { candidates }, ["candidates"]);
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
					jsonOutput.ok(io, pstrAction, { ...result, message: msg });
				} else {
					jsonOutput.err(io, pstrAction, "pstr.validate.failed", msg, 1);
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
					jsonOutput.err(
						io,
						pstrAction,
						"pstr.stale.failed",
						normalized.find((result) => result.stale)?.message ??
							"stale areas found",
						1,
					);
				} else {
					jsonOutput.ok(io, pstrAction, { areas: normalized }, ["areas"]);
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
					jsonOutput.err(
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
					jsonOutput.err(io, pstrAction, "pstr.section.failed", msg, 2);
					return 2;
				}
				io.stderr(msg);
				return 2;
			}
			if (parsed.json) {
				jsonOutput.ok(
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
			jsonOutput.err(io, pstrAction, "pstr.action.unhandled", message, 2);
		} else {
			io.stderr(message);
		}
		return 2;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (hasJsonFlag(args)) {
			jsonOutput.err(io, action, "pstr.command.error", message, 2);
		} else {
			io.stderr(message);
		}
		return 2;
	}
}
