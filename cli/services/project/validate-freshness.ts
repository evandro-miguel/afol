import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { EventLedgerInspection } from "../events/ledger";
import { inspectEventLedger } from "../events/ledger";
// AUTHORITY: the workbench branch below mirrors
// cli/services/local-state/workbench-index.ts validateWorkBenchIndex /
// isSessionSnapshotFresh and cli/services/local-state/freshness.ts
// collectFreshnessReport. When changing freshness semantics there, apply the
// same change here (and vice versa); a contract test in validation suites
// guards parity on this repository's real state.
import type {
	FreshnessCheck,
	FreshnessOptions,
	FreshnessReport,
	FreshnessState,
} from "../local-state/freshness";
import {
	validateFilesIndex,
	validateRulesIndex,
	validateSkillsIndex,
	validateSpecsIndex,
} from "../local-state/project-indexes";
import { resolveWorkbenchEventLogPath } from "../local-state/workbench-events";
import {
	collectSessionIds,
	collectWorkBenchSnapshot,
	loadWorkBenchIndexSnapshot,
	type WorkbenchIndexSession,
	type WorkbenchIndexTask,
} from "../local-state/workbench-index";
import { checkPstrStale, validatePstrIndex } from "../pstr/builder";
import { resolveProjectPaths } from "./paths";

// Fast-path mirror of cli/services/local-state/freshness.ts. The only
// behavioral difference is HOW the workbench index is validated: instead of
// letting validateWorkBenchIndex rebuild the live snapshot once per session
// (which re-reads and re-parses the full event ledger for every workbench
// session), we build the live snapshot once via collectWorkBenchSnapshot and
// replicate isSessionSnapshotFresh's comparisons against per-session slices.
// Every ok/message output matches the canonical implementation.

export type {
	FreshnessCheck,
	FreshnessOptions,
	FreshnessReport,
} from "../local-state/freshness";

type ValidationResult = {
	ok: boolean;
	message: string;
};

type LocalStateCheck = {
	name: string;
	validate: (root: string, options: FreshnessOptions) => ValidationResult;
};

function nowIso(): string {
	return new Date().toISOString();
}

function classifyMessage(message: string): FreshnessState {
	const normalized = message.toLowerCase();
	if (normalized.includes("missing")) {
		return "missing";
	}
	if (
		normalized.includes("invalid") ||
		normalized.includes("degraded") ||
		normalized.includes("unreadable")
	) {
		return "invalid";
	}
	if (
		normalized.includes("stale") ||
		normalized.includes("drift") ||
		normalized.includes("need rebuild")
	) {
		return "stale";
	}
	return "invalid";
}

function localStateRemediation(message: string): string {
	return message.includes("explicit repair required")
		? "repair the event ledger, then run afol local-state rebuild"
		: "run afol local-state rebuild";
}

function localStateCheck(
	name: string,
	result: ValidationResult,
): FreshnessCheck {
	const state = result.ok ? "current" : classifyMessage(result.message);
	return {
		id: `local-state:${name}`,
		surface: "local-state",
		state,
		ok: result.ok,
		message: result.message,
		remediation: localStateRemediation(result.message),
	};
}

function pstrCheck(
	id: string,
	result: ValidationResult,
	stateOverride?: FreshnessState,
): FreshnessCheck {
	const state = result.ok
		? "current"
		: (stateOverride ?? classifyMessage(result.message));
	return {
		id,
		surface: "pstr",
		state,
		ok: result.ok,
		message: result.message,
		remediation: "run afol pstr rebuild",
	};
}

// ---------------------------------------------------------------------------
// Fast workbench index validation (mirrors validateWorkBenchIndex +
// isSessionSnapshotFresh + latestAuxiliarySourceMtime).
// ---------------------------------------------------------------------------

const TASK_FILE_RE = /^.+_task_\d+\.md$/;
const ZERO_TIME = new Date(0).toISOString();

function wbIsIsoDate(value: unknown): boolean {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function wbNormalizedMtime(path: string): number | null {
	try {
		const timestamp = statSync(path).mtime.toISOString();
		const parsed = Date.parse(timestamp);
		return Number.isFinite(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function wbReadSessionTaskFiles(sessionDir: string): {
	files: string[];
	readFailed: boolean;
} {
	try {
		return {
			files: readdirSync(sessionDir, { withFileTypes: true })
				.filter((entry) => entry.isFile() && TASK_FILE_RE.test(entry.name))
				.map((entry) => resolve(sessionDir, entry.name))
				.sort(),
			readFailed: false,
		};
	} catch {
		return { files: [], readFailed: true };
	}
}

function wbSortTasks(a: WorkbenchIndexTask, b: WorkbenchIndexTask): number {
	if (a.session !== b.session) {
		return a.session.localeCompare(b.session);
	}
	if (a.task_id !== b.task_id) {
		return a.task_id.localeCompare(b.task_id);
	}
	return a.line - b.line;
}

function wbLatestAuxiliarySourceMtime(root: string): number {
	const wbRoot = resolveProjectPaths(root).abs.wbDir;
	if (!existsSync(wbRoot)) {
		return 0;
	}

	let latest = 0;
	try {
		latest = Math.max(latest, statSync(wbRoot).mtimeMs);
	} catch {
		latest = 0;
	}

	const activeSessionPath = resolve(wbRoot, ".active_session");
	if (existsSync(activeSessionPath)) {
		try {
			latest = Math.max(latest, statSync(activeSessionPath).mtimeMs);
		} catch {
			// no-op
		}
	}

	const eventLog = resolveWorkbenchEventLogPath(root);
	if (existsSync(eventLog)) {
		try {
			latest = Math.max(latest, statSync(eventLog).mtimeMs);
		} catch {
			// no-op
		}
	}
	return latest;
}

type WbLiveIndex = {
	sessionsById: Map<string, WorkbenchIndexSession>;
	tasksBySession: Map<string, WorkbenchIndexTask[]>;
};

function wbLoadLiveIndex(root: string): WbLiveIndex {
	const live = collectWorkBenchSnapshot(root);
	const sessionsById = new Map(
		live.sessions.map((session) => [session.session, session]),
	);
	const tasksBySession = new Map<string, WorkbenchIndexTask[]>();
	for (const task of live.tasks) {
		const bucket = tasksBySession.get(task.session) ?? [];
		bucket.push(task);
		tasksBySession.set(task.session, bucket);
	}
	return { sessionsById, tasksBySession };
}

function wbSessionSnapshotFresh(params: {
	sessionDir: string;
	session: string;
	persistedSession: WorkbenchIndexSession | undefined;
	persistedTasks: readonly WorkbenchIndexTask[];
	generatedAt: number;
	live: WbLiveIndex;
}): boolean {
	const { persistedSession, persistedTasks, generatedAt, live } = params;
	if (!persistedSession) {
		return false;
	}
	if (persistedSession.task_count !== persistedTasks.length) {
		return false;
	}
	const currentSession = live.sessionsById.get(params.session);
	const currentTasks = live.tasksBySession.get(params.session) ?? [];
	// stringify equality assumes both sides serialize identical key order;
	// both shapes come from buildSessionsSnapshot/buildWorkBenchSnapshot. If a
	// new optional field is added to one shape only, replace this check with
	// an explicit comparator.
	if (
		!currentSession ||
		JSON.stringify(currentSession) !== JSON.stringify(persistedSession) ||
		JSON.stringify(currentTasks) !==
			JSON.stringify([...persistedTasks].sort(wbSortTasks))
	) {
		return false;
	}

	const taskFileRead = wbReadSessionTaskFiles(params.sessionDir);
	if (taskFileRead.readFailed) {
		return false;
	}
	const taskFiles = taskFileRead.files;

	if (persistedTasks.length === 0) {
		if (persistedSession.touched_at !== ZERO_TIME) {
			return false;
		}
		const sourceTimes = [
			wbNormalizedMtime(params.sessionDir),
			...taskFiles.map(wbNormalizedMtime),
		];
		return sourceTimes.every(
			(timestamp) => timestamp !== null && timestamp <= generatedAt,
		);
	}

	const persistedByFile = new Map<string, number[]>();
	for (const task of persistedTasks) {
		const touchedAt = Date.parse(task.touched_at);
		if (!Number.isFinite(touchedAt)) {
			return false;
		}
		const timestamps = persistedByFile.get(task.file) ?? [];
		timestamps.push(touchedAt);
		persistedByFile.set(task.file, timestamps);
	}

	const currentFiles = new Set(taskFiles);
	if (
		currentFiles.size !== persistedByFile.size ||
		[...currentFiles].some((file) => !persistedByFile.has(file)) ||
		[...persistedByFile.keys()].some((file) => !currentFiles.has(file))
	) {
		return false;
	}

	let latestTaskMtime = 0;
	for (const file of taskFiles) {
		const currentMtime = wbNormalizedMtime(file);
		const persistedMtimes = persistedByFile.get(file);
		if (currentMtime === null || !persistedMtimes) {
			return false;
		}
		latestTaskMtime = Math.max(latestTaskMtime, currentMtime);
		if (persistedMtimes.some((timestamp) => timestamp !== currentMtime)) {
			return false;
		}
	}

	return Date.parse(persistedSession.touched_at) === latestTaskMtime;
}

function fastValidateWorkBenchIndex(
	root: string,
	eventLedger?: EventLedgerInspection,
): ValidationResult {
	const ledger = eventLedger ?? inspectEventLedger(root);
	if (!ledger.ok) {
		const first = ledger.issues.find((issue) => issue.severity === "error");
		const location = first?.line ? ` line=${first.line}` : "";
		return {
			ok: false,
			message: `${first?.code ?? "EVENT_LEDGER_UNREADABLE"}${location}: event ledger invalid; explicit repair required`,
		};
	}
	const indexPath = resolve(
		resolveProjectPaths(root).abs.dataIndexDir,
		"workbench.json",
	);
	if (!existsSync(indexPath)) {
		return {
			ok: false,
			message: `missing workbench index snapshot: ${indexPath}; run afol local-state rebuild`,
		};
	}

	const snapshot = loadWorkBenchIndexSnapshot(root);
	if (!snapshot) {
		return {
			ok: false,
			message: `invalid workbench index snapshot: ${indexPath}`,
		};
	}
	if (!wbIsIsoDate(snapshot.generated_at)) {
		return {
			ok: false,
			message: `invalid workbench index snapshot: ${indexPath}`,
		};
	}

	const degradedSessions = snapshot.sessions.filter((s) => s.degraded);
	if (degradedSessions.length > 0) {
		const degradedNames = degradedSessions.map((s) => s.session).join(", ");
		return {
			ok: false,
			message: `degraded sessions in workbench index: ${degradedNames}. Task sources may be unreadable, have malformed or empty State Boards, or contain duplicate task IDs. Repair the named session task source, then run afol local-state rebuild.`,
		};
	}

	const diskSessions = collectSessionIds(root);
	const snapshotSessions = new Set(
		snapshot.sessions.map((session) => session.session),
	);
	const sessionById = new Map(
		snapshot.sessions.map((entry) => [entry.session, entry]),
	);
	const tasksBySession = new Map<string, WorkbenchIndexTask[]>();
	for (const task of snapshot.tasks) {
		const tasks = tasksBySession.get(task.session) ?? [];
		tasks.push(task);
		tasksBySession.set(task.session, tasks);
	}
	const generatedAt = Date.parse(snapshot.generated_at);
	const wbRoot = resolveProjectPaths(root).abs.wbDir;

	// Built lazily but at most once: one ledger read + one pass over task files.
	let live: WbLiveIndex | null = null;
	const stale =
		diskSessions.length !== snapshotSessions.size ||
		diskSessions.some((session) => !snapshotSessions.has(session)) ||
		diskSessions.some((session) => {
			if (snapshotSessions.has(session)) {
				live ??= wbLoadLiveIndex(root);
				return !wbSessionSnapshotFresh({
					sessionDir: resolve(wbRoot, session),
					session,
					persistedSession: sessionById.get(session),
					persistedTasks: tasksBySession.get(session) ?? [],
					generatedAt,
					live,
				});
			}
			return true;
		});
	if (stale) {
		return {
			ok: false,
			message: `stale workbench index snapshot: ${indexPath}`,
		};
	}

	const sourceLatest = wbLatestAuxiliarySourceMtime(root);
	if (!Number.isFinite(sourceLatest)) {
		// Parity note: canonical path falls through to `generatedAt < NaN`,
		// which also yields ok:true; this guard makes that outcome explicit
		// (canonical branch: workbench-index.ts validateWorkBenchIndex).
		return { ok: true, message: `ok workbench index: ${indexPath}` };
	}
	if (generatedAt < sourceLatest) {
		return {
			ok: false,
			message: `stale workbench index snapshot: ${indexPath}`,
		};
	}

	return { ok: true, message: `ok workbench index snapshot: ${indexPath}` };
}

// ---------------------------------------------------------------------------
// Freshness report assembly (mirrors collectFreshnessReport).
// ---------------------------------------------------------------------------

const LOCAL_STATE_CHECKS: readonly LocalStateCheck[] = [
	{ name: "rules", validate: (root) => validateRulesIndex(root) },
	{ name: "skills", validate: (root) => validateSkillsIndex(root) },
	{ name: "specs", validate: (root) => validateSpecsIndex(root) },
	{ name: "files", validate: (root) => validateFilesIndex(root) },
	{
		name: "workbench",
		validate: (root, options) =>
			fastValidateWorkBenchIndex(
				root,
				options.eventLedger ? options.eventLedger : undefined,
			),
	},
];

function collectLocalStateChecks(
	root: string,
	options: FreshnessOptions,
): FreshnessCheck[] {
	return LOCAL_STATE_CHECKS.map(({ name, validate }) =>
		localStateCheck(name, validate(root, options)),
	);
}

function collectPstrChecks(root: string): FreshnessCheck[] {
	const validation = validatePstrIndex(root);
	const checks: FreshnessCheck[] = [pstrCheck("pstr:index", validation)];
	if (!validation.ok && checks[0]?.state === "invalid") {
		return checks;
	}
	let staleEntries: ReturnType<typeof checkPstrStale> = [];
	try {
		staleEntries = checkPstrStale(root);
	} catch {
		// validatePstrIndex carries the actionable configuration finding.
	}

	for (const entry of [...staleEntries].sort((a, b) =>
		a.id.localeCompare(b.id),
	)) {
		checks.push(
			pstrCheck(
				`pstr:map:${entry.id}`,
				{
					ok: !entry.stale,
					message: entry.message,
				},
				entry.stale ? classifyMessage(entry.message) : undefined,
			),
		);
	}
	return checks;
}

/**
 * Drop-in replacement for `collectFreshnessReport` with identical outputs and
 * a batched workbench index validation hot path.
 */
export function collectFreshnessReportFast(
	root: string,
	options: FreshnessOptions = {},
): FreshnessReport {
	const checks = [
		...(options.localState === false
			? []
			: collectLocalStateChecks(root, options)),
		...(options.pstr === false ? [] : collectPstrChecks(root)),
	];
	const findings = checks.filter((check) => !check.ok);
	return {
		ok: findings.length === 0,
		checked_at: nowIso(),
		checks,
		findings,
	};
}
