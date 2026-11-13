import { posix, relative, resolve } from "node:path";
import {
	loadMutationJournal,
	type MutationRecord,
	mutationJournalPath,
} from "../mutations/journal";
import { resolveProjectPaths } from "../project/paths";
import {
	collectTerminalSessionEvidence,
	collectWorkBenchSnapshot,
	loadWorkBenchIndexSnapshot,
	normalizeWorkbenchSnapshot,
	type TerminalSessionEvidence,
	validateWorkBenchIndex,
	type WorkbenchIndexFileClaim,
	type WorkbenchIndexSnapshot,
	type WorkbenchIndexTask,
} from "./workbench-index";

export const DEFAULT_COORDINATION_STALE_TASK_MS = 24 * 60 * 60 * 1000;

export type CoordinationWarningId =
	| "path_overlap_planned"
	| "path_overlap_touched"
	| "mutation_overlap"
	| "touched_overlap"
	| "unsupported_path_pattern"
	| "missing_file_intent"
	| "contradictory_file_intent"
	| "missing_owner"
	| "stale_task_context"
	| "stale_coordination_index";

export type CoordinationWarningSeverity = "info" | "warning" | "critical";

export type CoordinationPathSource =
	| WorkbenchIndexFileClaim["source"]
	| "mutation";

export type CoordinationPathKind =
	| "exact"
	| "glob"
	| "directory"
	| "unsupported";

/**
 * project: relative to the AFOL project root. external: an absolute path
 * outside it. Relative claims always mean project-relative, so work in another
 * repository must be claimed with absolute paths. A claim naming the project
 * root itself (`.`, `./` or the absolute root) is the directory `./`, which
 * covers every project path.
 */
export type CoordinationPathScope = "project" | "external";

export type CoordinationTaskPath = {
	path: string;
	kind: CoordinationPathKind;
	scope: CoordinationPathScope;
	source: CoordinationPathSource;
	line?: number;
	mutation_id?: string;
};

export type CoordinationTaskRef = {
	session: string;
	task_id: string;
};

export type CoordinationWarning = {
	id: CoordinationWarningId;
	severity: CoordinationWarningSeverity;
	reason: string;
	affected_tasks: CoordinationTaskRef[];
	affected_paths: string[];
	source: "workbench" | "mutation_journal" | "coordination_index";
	recovery_hint: string;
	overlap?: "confirmed" | "possible";
};

export type CoordinationRadarTask = Omit<
	WorkbenchIndexTask,
	"planned_files" | "touched_files" | "read_files"
> & {
	planned_files: CoordinationTaskPath[];
	touched_files: CoordinationTaskPath[];
	/** Declared reads. They never take part in overlap rules. */
	read_files?: CoordinationTaskPath[];
	warning_ids: CoordinationWarningId[];
	age_ms: number;
	is_stale: boolean;
};

export type CoordinationRadarSnapshot = {
	kind: "coordination_radar_v1";
	generated_at: string;
	source: {
		workbench_index: string;
		mutation_journal: string;
		workbench_status: "fresh" | "missing" | "stale" | "invalid" | "degraded";
		workbench_data: "persisted_index" | "live_collection" | "injected";
	};
	coverage: CoordinationCoverage;
	/** Every session named by the workbench data, open or not. */
	known_sessions: string[];
	open_tasks: CoordinationRadarTask[];
	warnings: CoordinationWarning[];
};

/**
 * Radar warnings are advisory. Coverage states which sources were read and why
 * a quiet result can still hide conflicts.
 */
export type CoordinationCoverage = {
	observed_sources: ["afol_workbench_tasks", "afol_mutation_journal"];
	observed_complete: boolean;
	incomplete_reasons: string[];
	unobserved: string[];
	/**
	 * Sessions known only to a non-fresh index that current lifecycle evidence
	 * shows as terminal, so their persisted tasks were not resurrected.
	 */
	terminal_sessions_excluded: {
		session: string;
		evidence: TerminalSessionEvidence;
	}[];
	no_warnings_means: "no_conflict_in_observed_sources_only";
};

type CoordinationBuildOptions = {
	now?: Date;
	staleTaskMs?: number;
	workbench?: WorkbenchIndexSnapshot;
	workbenchStatus?: {
		ok: boolean;
		message: string;
	};
	mutations?: MutationRecord[];
};

type MutationTaskData = {
	paths: CoordinationTaskPath[];
	latestTs: number;
};

type WarningAccumulator = {
	id: CoordinationWarningId;
	severity: CoordinationWarningSeverity;
	overlap?: "confirmed" | "possible";
	reason: string;
	source: CoordinationWarning["source"];
	recovery_hint: string;
	task_keys: Set<string>;
	path_keys: Set<string>;
};

const OPEN_STATES = new Set([
	"pending",
	"in_progress",
	"implemented_untested",
	"tested_needs_spec_validation",
	"problem",
]);
// `worker` and `agent` are lifecycle defaults, not identities.
const GENERIC_OWNER_RE =
	/^(?:n\/a|none|unknown|unassigned|tbd|todo|worker|agent|default|owner|-)?$/i;

/** True for owners the radar reports as missing_owner. */
export function isGenericTaskOwner(owner: string): boolean {
	return GENERIC_OWNER_RE.test(owner.trim());
}
const GLOB_TOKEN_RE = /[*?[\]{}]/;
// Bun.Glob has no extglob; a leading "!" negates instead of claiming a path.
const UNSUPPORTED_PATTERN_RE = /^!|[@!+*?]\(/;
const DRIVE_PATH_RE = /^([A-Za-z]):(?:\/(.*))?$/;
const PROJECT_ROOT_DISPLAY = "./";
// Default WSL automount root; custom automount roots stay plain POSIX paths.
const WSL_MOUNT_PATH_RE = /^\/mnt\/([A-Za-z])(?:\/(.*))?$/;

type ParsedPath = {
	path: string;
	kind: CoordinationPathKind;
	scope: CoordinationPathScope;
};

/**
 * Windows drive paths (`D:/x`, `D:\x`) and their WSL mounts (`/mnt/d/x`) share
 * one identity key. Only drive paths fold case; Linux paths never do.
 */
function driveKey(path: string): string | null {
	const match = path.match(DRIVE_PATH_RE) ?? path.match(WSL_MOUNT_PATH_RE);
	if (!match?.[1]) {
		return null;
	}
	const rest = posix.normalize(`/${match[2] ?? ""}`);
	return `${match[1].toLowerCase()}:${rest}`.toLowerCase().replace(/\/$/, "");
}

function absoluteKey(path: string): string {
	return driveKey(path) ?? posix.normalize(path).replace(/(.)\/$/, "$1");
}

/**
 * Bun.Glob matches nothing, without an error, for unbalanced `[` or `{`, so
 * such claims would read as clear. Classes must close within one segment.
 */
function isMalformedGlob(value: string): boolean {
	let braces = 0;
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char === "[") {
			const close = value.indexOf("]", index + 1);
			const body = close < 0 ? "" : value.slice(index + 1, close);
			if (close < 0 || body.replace(/^[!^]/, "") === "" || body.includes("/")) {
				return true;
			}
			index = close;
		} else if (char === "]") {
			return true;
		} else if (char === "{") {
			braces += 1;
		} else if (char === "}") {
			braces -= 1;
			if (braces < 0) {
				return true;
			}
		}
	}
	return braces !== 0;
}

function parsePath(root: string, raw: string): ParsedPath {
	let value = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "");
	const isDirectory = value.length > 1 && value.endsWith("/");
	value = value.replace(/(.)\/+$/, "$1");
	if (value === "" || value === ".") {
		return { path: PROJECT_ROOT_DISPLAY, kind: "directory", scope: "project" };
	}
	const kind: CoordinationPathKind =
		UNSUPPORTED_PATTERN_RE.test(value) || isMalformedGlob(value)
			? "unsupported"
			: GLOB_TOKEN_RE.test(value)
				? "glob"
				: isDirectory
					? "directory"
					: "exact";
	if (kind === "unsupported") {
		return { path: value, kind, scope: "project" };
	}
	const isAbsolute = value.startsWith("/") || DRIVE_PATH_RE.test(value);
	const absolute = isAbsolute ? value : resolve(root, value);
	const rootKey = absoluteKey(resolve(root));
	const pathKey = absoluteKey(absolute);
	let display = isAbsolute
		? value
		: relative(root, absolute).replace(/\\/g, "/");
	let scope: CoordinationPathScope = "project";
	if (pathKey === rootKey || pathKey.startsWith(`${rootKey}/`)) {
		if (isAbsolute) {
			// Keep the claim's own spelling of the project-relative remainder.
			const segments = pathKey.split("/").length - rootKey.split("/").length;
			const parts = posix
				.normalize(absolute.replace(/^[A-Za-z]:/, ""))
				.split("/");
			display = parts.slice(parts.length - segments).join("/");
		}
		if (display === "" && kind !== "glob") {
			return { path: PROJECT_ROOT_DISPLAY, kind: "directory", scope };
		}
	} else {
		scope = "external";
		display = isAbsolute ? value : absolute;
	}
	if (kind === "directory") {
		display = `${display}/`;
	}
	return { path: display, kind, scope };
}

/** The radar's reading of one claim string, for registration checks. */
export function classifyCoordinationClaim(
	root: string,
	raw: string,
): Pick<CoordinationTaskPath, "path" | "kind" | "scope"> {
	return parsePath(root, raw);
}

function toCoordinationPath(
	root: string,
	claim: WorkbenchIndexFileClaim,
): CoordinationTaskPath {
	const parsed = parsePath(root, claim.path);
	return {
		...parsed,
		source: claim.source,
		line: claim.line,
	};
}

/**
 * Identity, not display: a project on a drive mount (`/mnt/x/...` or `X:/...`)
 * folds case like drive paths do; a Linux project stays case-sensitive. The
 * project root directory has the empty key. Display keeps the claim spelling.
 */
function comparisonKey(path: ParsedPath, foldProjectCase: boolean): string {
	if (path.scope === "project" && path.path === PROJECT_ROOT_DISPLAY) {
		return "";
	}
	const bare = path.kind === "directory" ? path.path.slice(0, -1) : path.path;
	if (path.scope === "external") {
		return absoluteKey(bare);
	}
	return foldProjectCase && path.kind !== "unsupported"
		? bare.toLowerCase()
		: bare;
}

/** Registration and radar share identity; the caller keeps display spelling. */
export function coordinationClaimIdentity(root: string, raw: string): string {
	const parsed = parsePath(root, raw);
	return `${parsed.scope}:${comparisonKey(parsed, driveKey(resolve(root)) !== null)}`;
}

function keySegments(key: string): string[] {
	return key === "" ? [] : key.split("/");
}

function isInsideDirectory(directoryKey: string, otherKey: string): boolean {
	if (directoryKey === "") {
		return otherKey !== "";
	}
	const prefix = directoryKey.endsWith("/") ? directoryKey : `${directoryKey}/`;
	return otherKey.startsWith(prefix);
}

function globSegmentsPrefix(pattern: string): string[] {
	const segments = pattern.split("/");
	const index = segments.findIndex((segment) => GLOB_TOKEN_RE.test(segment));
	return index < 0 ? segments : segments.slice(0, index);
}

function isSegmentPrefix(left: string[], right: string[]): boolean {
	const shorter = left.length <= right.length ? left : right;
	const longer = shorter === left ? right : left;
	return shorter.every((segment, index) => longer[index] === segment);
}

/**
 * Returns how two claims overlap, or null when they cannot. Kinds are
 * classified before text equality: identical globs only describe the same
 * pattern, and unsupported or malformed claims can never prove a collision.
 */
function pathsOverlap(
	a: CoordinationTaskPath,
	b: CoordinationTaskPath,
	foldProjectCase: boolean,
): "confirmed" | "possible" | null {
	if (a.scope !== b.scope) {
		return null;
	}
	const keyA = comparisonKey(a, foldProjectCase);
	const keyB = comparisonKey(b, foldProjectCase);
	if (a.kind === "unsupported" || b.kind === "unsupported") {
		return keyA === keyB ? "possible" : null;
	}
	if (a.kind === "glob" && b.kind === "glob") {
		return keyA === keyB ||
			isSegmentPrefix(globSegmentsPrefix(keyA), globSegmentsPrefix(keyB))
			? "possible"
			: null;
	}
	if (keyA === keyB) {
		return "confirmed";
	}
	if (a.kind === "glob" || b.kind === "glob") {
		const [glob, other] = a.kind === "glob" ? [keyA, b] : [keyB, a];
		const otherKey = other === a ? keyA : keyB;
		if (new Bun.Glob(glob).match(otherKey)) {
			return "confirmed";
		}
		if (other.kind !== "directory") {
			return null;
		}
		const stem = globSegmentsPrefix(glob);
		const directory = keySegments(otherKey);
		if (!isSegmentPrefix(stem, directory)) {
			return null;
		}
		// Every match of a glob rooted inside the directory lies inside it.
		return stem.length >= directory.length ? "confirmed" : "possible";
	}
	if (a.kind === "directory" && isInsideDirectory(keyA, keyB)) {
		return "confirmed";
	}
	if (b.kind === "directory" && isInsideDirectory(keyB, keyA)) {
		return "confirmed";
	}
	return null;
}

/**
 * Pure claim comparison for one project root, with no filesystem access, so
 * drive-mounted roots can be checked without reading or writing the mount.
 */
export function compareCoordinationClaims(
	root: string,
	left: string,
	right: string,
): "confirmed" | "possible" | null {
	const parse = (raw: string): CoordinationTaskPath => ({
		...parsePath(root, raw),
		source: "planned",
	});
	return pathsOverlap(
		parse(left),
		parse(right),
		driveKey(resolve(root)) !== null,
	);
}

function mutationPaths(
	root: string,
	records: MutationRecord[],
): Map<string, MutationTaskData> {
	const mapped = new Map<string, MutationTaskData>();
	for (const record of records) {
		if (
			record.kind === "undo" ||
			record.status !== "applied" ||
			record.dryRun === true
		) {
			continue;
		}
		const key = `${record.session}::${record.taskId}`;
		const current = mapped.get(key) ?? { paths: [], latestTs: 0 };
		for (const rawPath of [record.sourcePath, record.destinationPath]) {
			if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
				continue;
			}
			// Journal paths name real files, so glob characters are literal.
			current.paths.push({
				...parsePath(root, rawPath),
				kind: "exact",
				source: "mutation",
				mutation_id: record.id,
			});
		}
		const recordTs = Date.parse(record.ts);
		if (Number.isFinite(recordTs) && recordTs > current.latestTs) {
			current.latestTs = recordTs;
		}
		mapped.set(key, current);
	}
	return mapped;
}

function sortTaskRefs(
	refs: Iterable<CoordinationTaskRef>,
): CoordinationTaskRef[] {
	return [...refs].sort((a, b) => {
		if (a.session !== b.session) {
			return a.session.localeCompare(b.session);
		}
		return a.task_id.localeCompare(b.task_id);
	});
}

function sortPaths(paths: Iterable<string>): string[] {
	return [...paths].sort((a, b) => a.localeCompare(b));
}

function taskKey(task: CoordinationTaskRef): string {
	return `${task.session}::${task.task_id}`;
}

function claimKey(path: CoordinationTaskPath): string {
	return `${path.source}:${path.kind}:${path.path}:${path.line ?? 0}:${path.mutation_id ?? ""}`;
}

function dedupePaths(paths: CoordinationTaskPath[]): CoordinationTaskPath[] {
	const seen = new Set<string>();
	const deduped: CoordinationTaskPath[] = [];
	for (const path of [...paths].sort((a, b) => {
		if (a.path !== b.path) {
			return a.path.localeCompare(b.path);
		}
		if (a.source !== b.source) {
			return a.source.localeCompare(b.source);
		}
		return (a.line ?? 0) - (b.line ?? 0);
	})) {
		const key = claimKey(path);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(path);
	}
	return deduped;
}

function latestTaskTimestamp(
	task: WorkbenchIndexTask,
	mutationData?: MutationTaskData,
): number {
	let latest = Date.parse(task.touched_at);
	if (
		mutationData &&
		Number.isFinite(mutationData.latestTs) &&
		mutationData.latestTs > latest
	) {
		latest = mutationData.latestTs;
	}
	return Number.isFinite(latest) ? latest : 0;
}

function classifyWorkbenchStatus(
	status: CoordinationBuildOptions["workbenchStatus"],
): CoordinationRadarSnapshot["source"]["workbench_status"] {
	if (!status || status.ok) {
		return "fresh";
	}
	if (status.message.startsWith("missing ")) {
		return "missing";
	}
	if (
		status.message.startsWith("invalid ") ||
		status.message.includes("event ledger invalid")
	) {
		return "invalid";
	}
	if (status.message.startsWith("degraded ")) {
		return "degraded";
	}
	return "stale";
}

type WorkbenchSelection = {
	snapshot: WorkbenchIndexSnapshot;
	data: CoordinationRadarSnapshot["source"]["workbench_data"];
	incompleteReasons: string[];
	terminalExcluded: CoordinationCoverage["terminal_sessions_excluded"];
};

/**
 * Drops persisted sessions whose directory is gone and whose current
 * lifecycle is terminal (archived, or closed in a valid event ledger). This is
 * task lifecycle evidence only; it says nothing about agent liveness.
 */
function withoutTerminalSessions(
	root: string,
	snapshot: Pick<WorkbenchIndexSnapshot, "sessions" | "tasks">,
	candidates: Iterable<string>,
): {
	sessions: WorkbenchIndexSnapshot["sessions"];
	tasks: WorkbenchIndexSnapshot["tasks"];
	excluded: CoordinationCoverage["terminal_sessions_excluded"];
} {
	const evidence = collectTerminalSessionEvidence(root, candidates);
	return {
		sessions: snapshot.sessions.filter((entry) => !evidence.has(entry.session)),
		tasks: snapshot.tasks.filter((task) => !evidence.has(task.session)),
		excluded: [...evidence]
			.map(([session, kind]) => ({ session, evidence: kind }))
			.sort((a, b) => a.session.localeCompare(b.session)),
	};
}

/**
 * A non-fresh persisted index can omit newly registered scope, so the radar
 * reads session task files directly instead. It never rewrites the index.
 * Sessions known only to the persisted index are kept, so the fallback can
 * add warnings but never drop scope, unless current lifecycle evidence shows
 * them archived or closed.
 */
function selectWorkbench(
	root: string,
	status: { ok: boolean; message: string },
): WorkbenchSelection {
	const persisted = loadWorkBenchIndexSnapshot(root);
	if (status.ok && persisted) {
		return {
			snapshot: persisted,
			data: "persisted_index",
			incompleteReasons: [],
			terminalExcluded: [],
		};
	}
	try {
		const live = collectWorkBenchSnapshot(root);
		const liveSessions = new Set(live.sessions.map((entry) => entry.session));
		for (const task of live.tasks) {
			liveSessions.add(task.session);
		}
		const extras = withoutTerminalSessions(
			root,
			{
				sessions: (persisted?.sessions ?? []).filter(
					(entry) => !liveSessions.has(entry.session),
				),
				tasks: (persisted?.tasks ?? []).filter(
					(task) => !liveSessions.has(task.session),
				),
			},
			[
				...(persisted?.sessions ?? []).map((entry) => entry.session),
				...(persisted?.tasks ?? []).map((task) => task.session),
			].filter((session) => !liveSessions.has(session)),
		);
		const extraSessions = extras.sessions;
		const extraTasks = extras.tasks;
		const extraNames = [
			...new Set([
				...extraSessions.map((entry) => entry.session),
				...extraTasks.map((task) => task.session),
			]),
		].sort();
		return {
			snapshot: {
				...live,
				sessions: [...live.sessions, ...extraSessions],
				tasks: [...live.tasks, ...extraTasks],
			},
			data: "live_collection",
			incompleteReasons:
				extraNames.length > 0
					? [
							`persisted index lists sessions without readable task files and no terminal lifecycle evidence, kept from the index: ${extraNames.join(", ")}`,
						]
					: [],
			terminalExcluded: extras.excluded,
		};
	} catch (error) {
		if (!persisted) {
			throw error;
		}
		const kept = withoutTerminalSessions(root, persisted, [
			...persisted.sessions.map((entry) => entry.session),
			...persisted.tasks.map((task) => task.session),
		]);
		return {
			snapshot: { ...persisted, sessions: kept.sessions, tasks: kept.tasks },
			data: "persisted_index",
			incompleteReasons: [
				`live workbench collection failed (${(error as Error).message}); fell back to a non-fresh persisted index that may omit tasks or claims`,
			],
			terminalExcluded: kept.excluded,
		};
	}
}

function addWarning(
	accumulator: Map<string, WarningAccumulator>,
	input: {
		id: CoordinationWarningId;
		severity: CoordinationWarningSeverity;
		reason: string;
		source: CoordinationWarning["source"];
		recovery_hint: string;
		tasks: CoordinationTaskRef[];
		paths?: string[];
		group?: string;
		aggregatePaths?: boolean;
		overlap?: "confirmed" | "possible";
	},
): void {
	const taskKeys = sortTaskRefs(input.tasks).map(taskKey);
	const key = [
		input.id,
		input.source,
		input.group ?? taskKeys.join("|"),
		input.aggregatePaths ? "" : sortPaths(input.paths ?? []).join("|"),
	].join("::");
	const existing = accumulator.get(key);
	if (existing) {
		for (const ref of taskKeys) {
			existing.task_keys.add(ref);
		}
		for (const path of input.paths ?? []) {
			existing.path_keys.add(path);
		}
		if (input.overlap === "confirmed") {
			existing.overlap = "confirmed";
		}
		return;
	}
	accumulator.set(key, {
		id: input.id,
		severity: input.severity,
		...(input.overlap ? { overlap: input.overlap } : {}),
		reason: input.reason,
		source: input.source,
		recovery_hint: input.recovery_hint,
		task_keys: new Set(taskKeys),
		path_keys: new Set(input.paths ?? []),
	});
}

type OverlapRule = {
	id: CoordinationWarningId;
	severity: CoordinationWarningSeverity;
	reason: string;
	source: CoordinationWarning["source"];
	recovery_hint: string;
};

const PLANNED_OVERLAP: OverlapRule = {
	id: "path_overlap_planned",
	severity: "warning",
	reason: "Open tasks declare overlapping planned file ownership.",
	source: "workbench",
	recovery_hint:
		"Split file ownership or sequence the tasks before delegation.",
};

const PLANNED_TOUCHED_OVERLAP: OverlapRule = {
	id: "path_overlap_touched",
	severity: "critical",
	reason:
		"An open task plans to touch a path another open task already marked as touched.",
	source: "workbench",
	recovery_hint:
		"Review the touched file list before assigning overlapping work.",
};

const PLANNED_MUTATION_OVERLAP: OverlapRule = {
	id: "mutation_overlap",
	severity: "critical",
	reason:
		"Mutation journal shows applied file changes under a path another open task still plans to touch.",
	source: "mutation_journal",
	recovery_hint:
		"Inspect the mutation journal or coordinate task ordering before further edits.",
};

/**
 * Critical even when one touch is old: both tasks are still open and each
 * records edits to the path, so closing either can carry or overwrite the
 * other's change. Task lifecycle evidence, not proof of simultaneous editing.
 */
function touchedOverlapRule(
	left: CoordinationTaskPath,
	right: CoordinationTaskPath,
): OverlapRule {
	return {
		id: "touched_overlap",
		severity: "critical",
		reason:
			"Two open tasks both record touching the same path; this is task lifecycle evidence, not proof of simultaneous editing.",
		source:
			left.source === "mutation" || right.source === "mutation"
				? "mutation_journal"
				: "workbench",
		recovery_hint:
			"Reconcile both tasks' edits to the shared path before either closes or more work lands on it.",
	};
}

function plannedVersusTouchedRule(touched: CoordinationTaskPath): OverlapRule {
	return touched.source === "mutation"
		? PLANNED_MUTATION_OVERLAP
		: PLANNED_TOUCHED_OVERLAP;
}

export function buildCoordinationRadar(
	root: string,
	options: CoordinationBuildOptions = {},
): CoordinationRadarSnapshot {
	const now = options.now ?? new Date();
	const staleTaskMs =
		options.staleTaskMs === undefined
			? DEFAULT_COORDINATION_STALE_TASK_MS
			: options.staleTaskMs;
	const workbenchStatus =
		options.workbenchStatus ?? validateWorkBenchIndex(root);
	const selection: WorkbenchSelection = options.workbench
		? {
				snapshot: options.workbench,
				data: "injected",
				incompleteReasons: [],
				terminalExcluded: [],
			}
		: selectWorkbench(root, workbenchStatus);
	const foldProjectCase = driveKey(resolve(root)) !== null;
	const workbench = normalizeWorkbenchSnapshot(selection.snapshot);
	const mutations = options.mutations ?? loadMutationJournal(root);
	const mutationByTask = mutationPaths(root, mutations);
	const archivedSessions = new Set(
		workbench.sessions
			.filter((session) => session.archived === true)
			.map((session) => session.session),
	);
	const warningAccumulator = new Map<string, WarningAccumulator>();
	const taskWarningIds = new Map<string, Set<CoordinationWarningId>>();

	const openTasks: CoordinationRadarTask[] = workbench.tasks
		.filter(
			(task) =>
				!archivedSessions.has(task.session) && OPEN_STATES.has(task.state),
		)
		.map((task) => {
			const key = `${task.session}::${task.task_id}`;
			const mutationData = mutationByTask.get(key);
			const planned_files = dedupePaths(
				task.planned_files.map((claim) => toCoordinationPath(root, claim)),
			);
			const touched_files = dedupePaths([
				...task.touched_files.map((claim) => toCoordinationPath(root, claim)),
				...(mutationData?.paths ?? []),
			]);
			const { read_files: readClaims, ...indexTask } = task;
			const read_files = dedupePaths(
				(readClaims ?? []).map((claim) => toCoordinationPath(root, claim)),
			);
			const latestTouched = latestTaskTimestamp(task, mutationData);
			const age_ms = Math.max(0, now.getTime() - latestTouched);
			return {
				...indexTask,
				planned_files,
				touched_files,
				...(read_files.length > 0 ? { read_files } : {}),
				warning_ids: [],
				age_ms,
				is_stale: age_ms > staleTaskMs,
			};
		})
		.sort((a, b) => {
			if (a.session !== b.session) {
				return a.session.localeCompare(b.session);
			}
			return a.task_id.localeCompare(b.task_id);
		});

	const incompleteReasons = [...selection.incompleteReasons];
	const degradedSessions = workbench.sessions
		.filter((session) => session.degraded === true)
		.map((session) => session.session);
	if (degradedSessions.length > 0) {
		incompleteReasons.push(
			`degraded session task sources may hide tasks or claims: ${degradedSessions.join(", ")}`,
		);
	}
	if (workbenchStatus.message.includes("event ledger invalid")) {
		incompleteReasons.push(
			"event ledger is invalid; archive and lifecycle state may be wrong",
		);
	}
	if (!workbenchStatus.ok) {
		addWarning(warningAccumulator, {
			id: "stale_coordination_index",
			severity: "warning",
			reason:
				selection.data === "live_collection"
					? `Persisted workbench index is not fresh (${workbenchStatus.message}); radar read session task files directly.`
					: `Workbench coordination data comes from a non-fresh index (${workbenchStatus.message}).`,
			source: "coordination_index",
			recovery_hint:
				"Radar output stays advisory; the index owner can run afol local-state rebuild after repairing any named source.",
			tasks: [],
			group: workbenchStatus.message,
		});
	}

	for (const task of openTasks) {
		const key = taskKey(task);
		if (!taskWarningIds.has(key)) {
			taskWarningIds.set(key, new Set());
		}
		if (GENERIC_OWNER_RE.test(task.owner.trim())) {
			addWarning(warningAccumulator, {
				id: "missing_owner",
				severity: "warning",
				reason:
					"Open task owner is missing or a generic default, so overlap cannot be attributed to a concrete agent.",
				source: "workbench",
				recovery_hint:
					"Confirm the owner from the session brief before delegating; do not hand-edit State Board rows.",
				tasks: [{ session: task.session, task_id: task.task_id }],
				group: "generic_owner",
			});
		}
		const unsupported = [...task.planned_files, ...task.touched_files]
			.filter((path) => path.kind === "unsupported")
			.map((path) => path.path);
		if (unsupported.length > 0) {
			addWarning(warningAccumulator, {
				id: "unsupported_path_pattern",
				severity: "info",
				reason:
					"Claim uses a pattern the radar cannot parse or match (extglob, leading !, or unbalanced [ ] or { }); it never proves an overlap and identical text is only a possible overlap.",
				source: "workbench",
				recovery_hint:
					"Use exact paths, directories ending in /, or balanced *, **, ?, [...] and {a,b} globs.",
				tasks: [{ session: task.session, task_id: task.task_id }],
				paths: unsupported,
				group: "unsupported_path_pattern",
				aggregatePaths: true,
			});
		}
		const writes = task.planned_files.length + task.touched_files.length;
		if (
			task.state === "in_progress" &&
			writes === 0 &&
			task.file_intent !== "read_only"
		) {
			addWarning(warningAccumulator, {
				id: "missing_file_intent",
				severity: "warning",
				reason:
					"In-progress task has no explicit planned files and no recorded touched files.",
				source: "workbench",
				recovery_hint:
					"Register write paths or read-only intent with afol session intent, or add Files planned or Files touched.",
				tasks: [{ session: task.session, task_id: task.task_id }],
			});
		}
		// Write claims still take part in overlap rules: a contradiction is
		// resolved toward writing, never toward silence.
		if (task.file_intent === "read_only" && writes > 0) {
			addWarning(warningAccumulator, {
				id: "contradictory_file_intent",
				severity: "warning",
				reason:
					"Task is declared read-only but has planned, touched or journaled writes; the radar treats it as a writer.",
				source: "workbench",
				recovery_hint:
					"Treat the task as a writer until the read-only declaration or the write claims are removed; afol session intent changes only its own managed block.",
				tasks: [{ session: task.session, task_id: task.task_id }],
				paths: [...task.planned_files, ...task.touched_files].map(
					(path) => path.path,
				),
			});
		}
		if (task.is_stale) {
			addWarning(warningAccumulator, {
				id: "stale_task_context",
				severity: "warning",
				reason:
					"Open task context is stale and may need a refresh before new delegation.",
				source: "workbench",
				recovery_hint:
					"Refresh the task notes or reopen the session context before assigning more work.",
				tasks: [{ session: task.session, task_id: task.task_id }],
			});
		}
	}

	const comparePaths = (
		left: CoordinationRadarTask,
		right: CoordinationRadarTask,
		leftPaths: CoordinationTaskPath[],
		rightPaths: CoordinationTaskPath[],
		rule: (
			leftPath: CoordinationTaskPath,
			rightPath: CoordinationTaskPath,
		) => OverlapRule,
	): void => {
		for (const leftPath of leftPaths) {
			for (const rightPath of rightPaths) {
				const overlap = pathsOverlap(leftPath, rightPath, foldProjectCase);
				if (!overlap) {
					continue;
				}
				const tasks = sortTaskRefs([
					{ session: left.session, task_id: left.task_id },
					{ session: right.session, task_id: right.task_id },
				]);
				addWarning(warningAccumulator, {
					...rule(leftPath, rightPath),
					tasks,
					paths: [leftPath.path, rightPath.path],
					group: tasks.map(taskKey).join("|"),
					overlap,
				});
			}
		}
	};

	for (let index = 0; index < openTasks.length; index += 1) {
		const left = openTasks[index];
		if (!left) {
			continue;
		}
		for (
			let nextIndex = index + 1;
			nextIndex < openTasks.length;
			nextIndex += 1
		) {
			const right = openTasks[nextIndex];
			if (!right) {
				continue;
			}
			comparePaths(
				left,
				right,
				left.planned_files,
				right.planned_files,
				() => PLANNED_OVERLAP,
			);
			comparePaths(
				left,
				right,
				left.planned_files,
				right.touched_files,
				(_planned, touched) => plannedVersusTouchedRule(touched),
			);
			comparePaths(
				right,
				left,
				right.planned_files,
				left.touched_files,
				(_planned, touched) => plannedVersusTouchedRule(touched),
			);
			comparePaths(
				left,
				right,
				left.touched_files,
				right.touched_files,
				touchedOverlapRule,
			);
		}
	}

	const warnings = [...warningAccumulator.values()]
		.map((warning) => {
			const affected_tasks = sortTaskRefs(
				[...warning.task_keys].map((value) => {
					const [session, task_id] = value.split("::");
					return { session: session ?? "", task_id: task_id ?? "" };
				}),
			);
			for (const task of affected_tasks) {
				const key = taskKey(task);
				const ids = taskWarningIds.get(key) ?? new Set<CoordinationWarningId>();
				ids.add(warning.id);
				taskWarningIds.set(key, ids);
			}
			// A possible (glob versus glob) overlap never escalates to critical.
			const severity =
				warning.overlap === "possible" && warning.severity === "critical"
					? "warning"
					: warning.severity;
			return {
				id: warning.id,
				severity,
				...(warning.overlap ? { overlap: warning.overlap } : {}),
				reason: warning.reason,
				affected_tasks,
				affected_paths: sortPaths(warning.path_keys),
				source: warning.source,
				recovery_hint: warning.recovery_hint,
			} satisfies CoordinationWarning;
		})
		.sort((a, b) => {
			if (a.id !== b.id) {
				return a.id.localeCompare(b.id);
			}
			const left = a.affected_tasks[0];
			const right = b.affected_tasks[0];
			if (!left || !right) {
				return a.reason.localeCompare(b.reason);
			}
			if (left.session !== right.session) {
				return left.session.localeCompare(right.session);
			}
			return left.task_id.localeCompare(right.task_id);
		});

	const unsupportedClaims = openTasks.reduce(
		(count, task) =>
			count +
			[...task.planned_files, ...task.touched_files].filter(
				(path) => path.kind === "unsupported",
			).length,
		0,
	);
	if (unsupportedClaims > 0) {
		incompleteReasons.push(
			`${unsupportedClaims} open-task claims use unsupported or malformed patterns that cannot be matched; see unsupported_path_pattern`,
		);
	}
	const knownSessions = [
		...new Set([
			...workbench.sessions.map((entry) => entry.session),
			...workbench.tasks.map((task) => task.session),
			...selection.terminalExcluded.map((entry) => entry.session),
		]),
	].sort();

	const projectPaths = resolveProjectPaths(root);
	return {
		kind: "coordination_radar_v1",
		generated_at: now.toISOString(),
		source: {
			workbench_index: `${projectPaths.dataIndexDir}/workbench.json`,
			mutation_journal: parsePath(root, mutationJournalPath(root)).path,
			workbench_status: classifyWorkbenchStatus(workbenchStatus),
			workbench_data: selection.data,
		},
		coverage: {
			observed_sources: ["afol_workbench_tasks", "afol_mutation_journal"],
			observed_complete: incompleteReasons.length === 0,
			incomplete_reasons: incompleteReasons,
			unobserved: [
				"work outside AFOL sessions, such as harness threads or ad hoc edits",
				"edits not recorded as Files touched or in the mutation journal",
				"files read without a declared claim",
				"path aliases other than drive letters and /mnt/<drive> mounts, such as custom automount roots, UNC and \\\\wsl$ paths",
				"the agent actually executing a task; owners are task metadata, not verified identities",
			],
			terminal_sessions_excluded: selection.terminalExcluded,
			no_warnings_means: "no_conflict_in_observed_sources_only",
		},
		known_sessions: knownSessions,
		open_tasks: openTasks.map((task) => ({
			...task,
			warning_ids: sortPaths(taskWarningIds.get(taskKey(task)) ?? []).filter(
				(value): value is CoordinationWarningId => value.length > 0,
			),
		})),
		warnings,
	};
}

export function loadCoordinationRadar(
	root: string,
	options: Omit<
		CoordinationBuildOptions,
		"workbench" | "workbenchStatus" | "mutations"
	> = {},
): CoordinationRadarSnapshot {
	return buildCoordinationRadar(root, {
		...options,
		workbenchStatus: validateWorkBenchIndex(root),
		mutations: loadMutationJournal(root),
	});
}
