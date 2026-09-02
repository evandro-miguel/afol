import { relative, resolve } from "node:path";
import {
	loadMutationJournal,
	type MutationRecord,
	mutationJournalPath,
} from "../mutations/journal";
import { resolveProjectPaths } from "../project/paths";
import {
	collectWorkBenchSnapshot,
	loadWorkBenchIndexSnapshot,
	normalizeWorkbenchSnapshot,
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
	| "missing_file_intent"
	| "missing_owner"
	| "stale_task_context"
	| "stale_coordination_index";

export type CoordinationWarningSeverity = "info" | "warning" | "critical";

export type CoordinationPathSource =
	| WorkbenchIndexFileClaim["source"]
	| "mutation";

export type CoordinationTaskPath = {
	path: string;
	kind: "exact" | "glob";
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
};

export type CoordinationRadarTask = Omit<
	WorkbenchIndexTask,
	"planned_files" | "touched_files"
> & {
	planned_files: CoordinationTaskPath[];
	touched_files: CoordinationTaskPath[];
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
		workbench_status: "fresh" | "missing" | "stale" | "invalid";
	};
	open_tasks: CoordinationRadarTask[];
	warnings: CoordinationWarning[];
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
const GENERIC_OWNER_RE = /^(?:n\/a|none|unknown|unassigned|tbd|-)?$/i;
const GLOB_TOKEN_RE = /[*?[\]{}]/;

function normalizeRelativePath(root: string, raw: string): string {
	const value = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "");
	if (value.length === 0) {
		return value;
	}
	if (GLOB_TOKEN_RE.test(value)) {
		return value;
	}
	const absolute = resolve(root, value);
	const relativePath = relative(root, absolute).replace(/\\/g, "/");
	return relativePath.startsWith("../") ? value : relativePath;
}

function toCoordinationPath(
	root: string,
	claim: WorkbenchIndexFileClaim,
): CoordinationTaskPath {
	const path = normalizeRelativePath(root, claim.path);
	return {
		path,
		kind: claim.kind,
		source: claim.source,
		line: claim.line,
	};
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
			const normalized = normalizeRelativePath(root, rawPath);
			current.paths.push({
				path: normalized,
				kind: GLOB_TOKEN_RE.test(normalized) ? "glob" : "exact",
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

function globToRegExp(pattern: string): RegExp {
	let regex = "^";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index] ?? "";
		const next = pattern[index + 1] ?? "";
		if (char === "*") {
			if (next === "*") {
				regex += ".*";
				index += 1;
			} else {
				regex += "[^/]*";
			}
			continue;
		}
		if (char === "?") {
			regex += "[^/]";
			continue;
		}
		if ("\\^$.+()|{}".includes(char)) {
			regex += `\\${char}`;
			continue;
		}
		if (char === "[") {
			regex += "\\[";
			continue;
		}
		if (char === "]") {
			regex += "\\]";
			continue;
		}
		regex += char;
	}
	regex += "$";
	return new RegExp(regex);
}

function globStem(pattern: string): string {
	return pattern.split(/[*?[\]{}]/, 1)[0]?.replace(/\/+$/, "") ?? "";
}

function pathsOverlap(
	a: CoordinationTaskPath,
	b: CoordinationTaskPath,
): boolean {
	if (a.kind === "exact" && b.kind === "exact") {
		return a.path === b.path;
	}
	if (a.kind === "glob" && b.kind === "exact") {
		return globToRegExp(a.path).test(b.path);
	}
	if (a.kind === "exact" && b.kind === "glob") {
		return globToRegExp(b.path).test(a.path);
	}
	if (a.path === b.path) {
		return true;
	}
	const stemA = globStem(a.path);
	const stemB = globStem(b.path);
	if (stemA.length === 0 || stemB.length === 0) {
		return true;
	}
	return stemA.startsWith(stemB) || stemB.startsWith(stemA);
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
	if (status.message.startsWith("invalid ")) {
		return "invalid";
	}
	return "stale";
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
	},
): void {
	const taskKeys = sortTaskRefs(input.tasks).map(taskKey);
	const key = [
		input.id,
		input.source,
		input.group ?? taskKeys.join("|"),
		sortPaths(input.paths ?? []).join("|"),
	].join("::");
	const existing = accumulator.get(key);
	if (existing) {
		for (const ref of taskKeys) {
			existing.task_keys.add(ref);
		}
		for (const path of input.paths ?? []) {
			existing.path_keys.add(path);
		}
		return;
	}
	accumulator.set(key, {
		id: input.id,
		severity: input.severity,
		reason: input.reason,
		source: input.source,
		recovery_hint: input.recovery_hint,
		task_keys: new Set(taskKeys),
		path_keys: new Set(input.paths ?? []),
	});
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
	const rawWorkbench =
		options.workbench ??
		loadWorkBenchIndexSnapshot(root) ??
		collectWorkBenchSnapshot(root);
	const workbench = normalizeWorkbenchSnapshot(rawWorkbench);
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
			const latestTouched = latestTaskTimestamp(task, mutationData);
			const age_ms = Math.max(0, now.getTime() - latestTouched);
			return {
				...task,
				planned_files,
				touched_files,
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

	if (!workbenchStatus.ok) {
		addWarning(warningAccumulator, {
			id: "stale_coordination_index",
			severity: "warning",
			reason:
				"Workbench coordination data comes from a stale or missing index snapshot.",
			source: "coordination_index",
			recovery_hint:
				"Run afol local-state rebuild before relying on radar output.",
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
					"Open task owner is missing or not specific enough for coordination.",
				source: "workbench",
				recovery_hint: "Assign a concrete owner in the task state board.",
				tasks: [{ session: task.session, task_id: task.task_id }],
			});
		}
		if (
			task.state === "in_progress" &&
			task.planned_files.length === 0 &&
			task.touched_files.length === 0
		) {
			addWarning(warningAccumulator, {
				id: "missing_file_intent",
				severity: "warning",
				reason:
					"In-progress task has no explicit planned files and no recorded touched files.",
				source: "workbench",
				recovery_hint:
					"Add Files planned or Files touched to clarify file ownership.",
				tasks: [{ session: task.session, task_id: task.task_id }],
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
			const tasks = [
				{ session: left.session, task_id: left.task_id },
				{ session: right.session, task_id: right.task_id },
			];

			for (const leftPath of left.planned_files) {
				for (const rightPath of right.planned_files) {
					if (!pathsOverlap(leftPath, rightPath)) {
						continue;
					}
					addWarning(warningAccumulator, {
						id: "path_overlap_planned",
						severity: "warning",
						reason: "Open tasks declare overlapping planned file ownership.",
						source: "workbench",
						recovery_hint:
							"Split file ownership or sequence the tasks before delegation.",
						tasks,
						paths: [leftPath.path, rightPath.path],
						group: `${taskKey(left)}|${taskKey(right)}`,
					});
				}
				for (const rightPath of right.touched_files.filter(
					(path) => path.source !== "mutation",
				)) {
					if (!pathsOverlap(leftPath, rightPath)) {
						continue;
					}
					addWarning(warningAccumulator, {
						id: "path_overlap_touched",
						severity: "critical",
						reason:
							"An open task plans to touch a path another open task already marked as touched.",
						source: "workbench",
						recovery_hint:
							"Review the touched file list before assigning overlapping work.",
						tasks,
						paths: [leftPath.path, rightPath.path],
						group: `${taskKey(left)}|${taskKey(right)}`,
					});
				}
				for (const rightPath of right.touched_files.filter(
					(path) => path.source === "mutation",
				)) {
					if (!pathsOverlap(leftPath, rightPath)) {
						continue;
					}
					addWarning(warningAccumulator, {
						id: "mutation_overlap",
						severity: "critical",
						reason:
							"Mutation journal shows applied file changes under a path another open task still plans to touch.",
						source: "mutation_journal",
						recovery_hint:
							"Inspect the mutation journal or coordinate task ordering before further edits.",
						tasks,
						paths: [leftPath.path, rightPath.path],
						group: `${taskKey(left)}|${taskKey(right)}`,
					});
				}
			}

			for (const rightPath of right.planned_files) {
				for (const leftPath of left.touched_files.filter(
					(path) => path.source !== "mutation",
				)) {
					if (!pathsOverlap(rightPath, leftPath)) {
						continue;
					}
					addWarning(warningAccumulator, {
						id: "path_overlap_touched",
						severity: "critical",
						reason:
							"An open task plans to touch a path another open task already marked as touched.",
						source: "workbench",
						recovery_hint:
							"Review the touched file list before assigning overlapping work.",
						tasks,
						paths: [rightPath.path, leftPath.path],
						group: `${taskKey(left)}|${taskKey(right)}`,
					});
				}
				for (const leftPath of left.touched_files.filter(
					(path) => path.source === "mutation",
				)) {
					if (!pathsOverlap(rightPath, leftPath)) {
						continue;
					}
					addWarning(warningAccumulator, {
						id: "mutation_overlap",
						severity: "critical",
						reason:
							"Mutation journal shows applied file changes under a path another open task still plans to touch.",
						source: "mutation_journal",
						recovery_hint:
							"Inspect the mutation journal or coordinate task ordering before further edits.",
						tasks,
						paths: [rightPath.path, leftPath.path],
						group: `${taskKey(left)}|${taskKey(right)}`,
					});
				}
			}
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
			return {
				id: warning.id,
				severity: warning.severity,
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

	const projectPaths = resolveProjectPaths(root);
	return {
		kind: "coordination_radar_v1",
		generated_at: now.toISOString(),
		source: {
			workbench_index: `${projectPaths.dataIndexDir}/workbench.json`,
			mutation_journal: normalizeRelativePath(root, mutationJournalPath(root)),
			workbench_status: classifyWorkbenchStatus(workbenchStatus),
		},
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
		workbench:
			loadWorkBenchIndexSnapshot(root) ?? collectWorkBenchSnapshot(root),
		workbenchStatus: validateWorkBenchIndex(root),
		mutations: loadMutationJournal(root),
	});
}
