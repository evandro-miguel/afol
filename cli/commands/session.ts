import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { relative } from "node:path";
import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { atomicWriteText } from "../services/io/atomic";
import { loadCoordinationRadar } from "../services/local-state/coordination-radar";
import { resolveProjectPaths } from "../services/project/paths";
import {
	archiveSessions as archiveWorkbenchSessions,
	listSessionArchiveCandidatePage,
	previewArchiveSessions,
	previewRestoreSessions,
	restoreSessions as restoreWorkbenchSessions,
} from "../services/workbench/archive";
import {
	readActiveSession,
	sessionLifecycleState,
	sessionPaths,
} from "../services/workbench/lifecycle";
import {
	bindSession,
	defaultAllowGlobalFallback,
	inspectImplicitSessionState,
	listBindings,
	removeBinding,
	resolveContextSession,
	resolveSession as resolveEffectiveSession,
	withSessionContextLock,
} from "../services/workbench/session-context";
import { type CommandIo, DEFAULT_IO } from "./io";

type ActionResult = {
	data: Record<string, unknown>;
	lines: string[];
	exitCode: number;
};

type SessionCommandRuntime = {
	beforeSwitchBinding?: (() => void) | undefined;
};

type CoordinationRadarPath = {
	path: string;
	source?: string | null;
	confidence?: string | null;
};

type CoordinationRadarTask = {
	session: string;
	task_id: string;
	state: string;
	owner?: string | null;
	notes?: string | null;
	touched_at?: string | null;
	planned_files?: CoordinationRadarPath[];
	touched_files?: CoordinationRadarPath[];
	warning_ids?: string[];
	archived?: boolean;
};

type CoordinationRadarWarning = {
	id: string;
	severity: "info" | "warning" | "critical" | string;
	message?: string | null;
	reason?: string | null;
	recovery_hint?: string | null;
	affected_tasks?: Array<string | { session: string; task_id: string }>;
	affected_paths?: string[];
};

type CoordinationRadarSession = {
	session: string;
	open_tasks?: number;
	touched_at?: string | null;
	archived?: boolean;
};

type CoordinationRadarSummary = {
	sessions: number;
	open_tasks: number;
	warnings: number;
	critical: number;
	warning: number;
	info: number;
};

type CoordinationRadarReport = {
	generated_at?: string | null;
	freshness?: Record<string, unknown> | null;
	sessions?: CoordinationRadarSession[];
	tasks: CoordinationRadarTask[];
	warnings: CoordinationRadarWarning[];
	summary?: Partial<CoordinationRadarSummary>;
};

type CoordinationRadarSnapshot = {
	generated_at?: string | null;
	source?: Record<string, unknown> | null;
	sessions?: CoordinationRadarSession[];
	open_tasks?: CoordinationRadarTask[];
	warnings?: CoordinationRadarWarning[];
	summary?: Partial<CoordinationRadarSummary>;
};

type CoordinationRadarInput =
	| CoordinationRadarReport
	| CoordinationRadarSnapshot;

type CoordinationRadarReader = (
	projectRoot: string,
) => CoordinationRadarInput | Promise<CoordinationRadarInput>;

const RADAR_TEXT_WARNING_LIMIT = 3;
const RADAR_JSON_TASK_LIMIT = 25;
const RADAR_JSON_WARNING_LIMIT = 10;
const RADAR_JSON_SESSION_LIMIT = 20;
const ARCHIVE_CANDIDATE_PAGE_LIMIT = 10;

let radarReaderOverride: CoordinationRadarReader | null = null;

type ParsedArgs = {
	json: boolean;
	dryRun: boolean;
	debug: boolean;
	strict: boolean;
	branch: string | null;
	actor: string | null;
	reason: string | null;
	olderThanDays: number;
	candidates: boolean;
	archiveOffset: number;
	archiveLimit: number;
	session: string | null;
	positional: string[];
};

function severityWeight(value: string): number {
	if (value === "critical") {
		return 0;
	}
	if (value === "warning") {
		return 1;
	}
	if (value === "info") {
		return 2;
	}
	return 3;
}

function isOpenTask(task: CoordinationRadarTask): boolean {
	return (
		task.archived !== true && task.state !== "done" && task.state !== "moved"
	);
}

function summarizeRadar(
	report: CoordinationRadarReport,
): CoordinationRadarSummary {
	const tasks = report.tasks.filter(isOpenTask);
	const sessions =
		report.sessions?.filter((session) => session.archived !== true).length ??
		new Set(tasks.map((task) => task.session)).size;
	const warnings = report.warnings.length;
	const critical = report.warnings.filter(
		(warning) => warning.severity === "critical",
	).length;
	const warning = report.warnings.filter(
		(entry) => entry.severity === "warning",
	).length;
	const info = report.warnings.filter(
		(entry) => entry.severity === "info",
	).length;
	return {
		sessions: report.summary?.sessions ?? sessions,
		open_tasks: report.summary?.open_tasks ?? tasks.length,
		warnings: report.summary?.warnings ?? warnings,
		critical: report.summary?.critical ?? critical,
		warning: report.summary?.warning ?? warning,
		info: report.summary?.info ?? info,
	};
}

function compactList(values: readonly string[], limit: number): string {
	if (values.length === 0) {
		return "none";
	}
	if (values.length <= limit) {
		return values.join(", ");
	}
	const visible = values.slice(0, limit).join(", ");
	return `${visible} +${values.length - limit} more`;
}

function primaryTaskPath(task: CoordinationRadarTask): string {
	const first =
		task.planned_files?.[0]?.path ??
		task.touched_files?.[0]?.path ??
		task.notes?.trim() ??
		"";
	return first.length > 0 ? first : "(none)";
}

function compactTimestamp(value: string | null | undefined): string {
	if (!value) {
		return "(unknown)";
	}
	return value.replace(".000Z", "Z");
}

function formatRadarWarning(warning: CoordinationRadarWarning): string {
	const summary =
		warning.message?.trim() || warning.reason?.trim() || "context warning";
	return `  - ${warning.severity} ${warning.id}: ${summary}`;
}

function formatRadarTask(task: CoordinationRadarTask): string {
	const warningIds = compactList(task.warning_ids ?? [], 2);
	return [
		`  - ${task.session} ${task.task_id} ${task.state}`,
		`owner=${task.owner?.trim() || "(missing)"}`,
		`planned=${task.planned_files?.length ?? 0}`,
		`touched=${task.touched_files?.length ?? 0}`,
		`warnings=${warningIds}`,
		`path=${primaryTaskPath(task)}`,
		`updated=${compactTimestamp(task.touched_at)}`,
	].join(" ");
}

function boundRadarTask(task: CoordinationRadarTask): CoordinationRadarTask {
	return {
		...task,
		planned_files: (task.planned_files ?? []).slice(0, 4),
		touched_files: (task.touched_files ?? []).slice(0, 4),
		warning_ids: (task.warning_ids ?? []).slice(0, 6),
	};
}

function normalizeRadarReport(
	report: CoordinationRadarInput,
): CoordinationRadarReport {
	const freshness =
		"freshness" in report
			? (report.freshness ?? null)
			: "source" in report
				? (report.source ?? null)
				: null;
	const normalized: CoordinationRadarReport = {
		generated_at: report.generated_at ?? null,
		freshness,
		tasks: "tasks" in report ? report.tasks : (report.open_tasks ?? []),
		warnings: report.warnings ?? [],
	};
	if (report.sessions !== undefined) {
		normalized.sessions = report.sessions;
	}
	if (report.summary !== undefined) {
		normalized.summary = report.summary;
	}
	return normalized;
}

function getCoordinationRadarReader(): CoordinationRadarReader {
	return radarReaderOverride ?? loadCoordinationRadar;
}

async function radarSessions(
	projectRoot: string,
	strict: boolean,
): Promise<ActionResult> {
	const reader = getCoordinationRadarReader();
	const report = await reader(projectRoot);
	return prepareRadarResult(normalizeRadarReport(report), strict);
}

function emitRadarError(
	parsed: ParsedArgs,
	io: CommandIo,
	message: string,
): number {
	if (parsed.json) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr("SESSION_RADAR_UNAVAILABLE", message, {
					action: "session.radar",
					exitCode: 2,
					hint: "check local-state index health and rebuild with afol local-state rebuild",
				}),
			),
		);
	} else {
		io.stderr(`err session-radar-unavailable message="${message}"`);
	}
	return 2;
}

export function setCoordinationRadarReaderForTests(
	reader: CoordinationRadarReader | null,
): void {
	radarReaderOverride = reader;
}

function currentGitBranch(root: string): string | null {
	const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		return null;
	}
	const branch = result.stdout.trim();
	return branch.length > 0 && branch !== "HEAD" ? branch : null;
}

function currentGitWorktree(root: string): string | null {
	const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		return null;
	}
	const worktree = result.stdout.trim();
	return worktree.length > 0 ? worktree : null;
}

function parseArgs(args: string[]): ParsedArgs {
	let json = false;
	let dryRun = false;
	let debug = false;
	let strict = false;
	let branch: string | null = null;
	let actor: string | null = null;
	let reason: string | null = null;
	let olderThanDays = 90;
	let candidates = false;
	let archiveOffset = 0;
	let archiveLimit = ARCHIVE_CANDIDATE_PAGE_LIMIT;
	let session: string | null = null;
	const positional: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--debug") {
			debug = true;
			continue;
		}
		if (arg === "--strict") {
			strict = true;
			continue;
		}
		if (arg === "--session") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --session in session.");
			}
			session = value;
			index += 1;
			continue;
		}
		if (arg === "--branch") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --branch in session.");
			}
			branch = value;
			index += 1;
			continue;
		}
		if (arg === "--actor") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --actor in session.");
			}
			actor = value;
			index += 1;
			continue;
		}
		if (arg === "--reason") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --reason in session.");
			}
			reason = value;
			index += 1;
			continue;
		}
		if (arg === "--older-than-days") {
			const value = args[index + 1];
			const parsed = value === undefined ? Number.NaN : Number(value);
			if (!Number.isFinite(parsed) || parsed < 0) {
				throw new Error("--older-than-days must be a non-negative number.");
			}
			olderThanDays = parsed;
			index += 1;
			continue;
		}
		if (arg === "--candidates") {
			candidates = true;
			continue;
		}
		if (arg === "--offset") {
			const value = args[index + 1];
			const parsed = value === undefined ? Number.NaN : Number(value);
			if (!Number.isInteger(parsed) || parsed < 0) {
				throw new Error("--offset must be a non-negative integer.");
			}
			archiveOffset = parsed;
			index += 1;
			continue;
		}
		if (arg === "--limit") {
			const value = args[index + 1];
			const parsed = value === undefined ? Number.NaN : Number(value);
			if (!Number.isInteger(parsed) || parsed <= 0) {
				throw new Error("--limit must be a positive integer.");
			}
			archiveLimit = parsed;
			index += 1;
			continue;
		}
		positional.push(arg);
	}
	return {
		json,
		dryRun,
		debug,
		strict,
		branch,
		actor,
		reason,
		olderThanDays,
		candidates,
		archiveOffset,
		archiveLimit,
		session,
		positional,
	};
}

function emit(
	result: ActionResult,
	action: string,
	json: boolean,
	io: CommandIo,
): number {
	if (json) {
		const envelope: ResultEnvelope<Record<string, unknown>> = envelopeOk(
			result.data,
			{ action, exitCode: result.exitCode },
		);
		io.stdout(stringifyEnvelope(envelope));
		return result.exitCode;
	}
	for (const line of result.lines) {
		io.stdout(line);
	}
	return result.exitCode;
}

function assertSessionExists(projectRoot: string, session: string): void {
	const paths = sessionPaths(projectRoot, session);
	if (!existsSync(paths.sessionDir)) {
		throw new Error(
			`session not found: ${session} (missing folder ${paths.sessionDir})`,
		);
	}
}

function assertSessionNotArchivedOrClosed(
	projectRoot: string,
	session: string,
): void {
	const lifecycle = sessionLifecycleState(projectRoot, session);
	if (lifecycle === "corrupt") {
		throw new Error(
			`session corrupt: ${session} (missing canonical task file)`,
		);
	}
	if (lifecycle === "closed") {
		throw new Error(
			`session closed: ${session} (durable close metadata present)`,
		);
	}
}

function displayWorktreePath(
	projectRoot: string,
	worktree: string | null,
	debug: boolean,
): string | null {
	if (worktree === null) {
		return null;
	}
	if (debug) {
		return worktree.replaceAll("\\", "/");
	}
	return relative(projectRoot, worktree).replace(/\\/g, "/") || ".";
}

function listSessions(projectRoot: string, debug: boolean): ActionResult {
	const currentBranch = currentGitBranch(projectRoot);
	const currentWorktree = currentGitWorktree(projectRoot);
	const globalActiveSession = readActiveSession(projectRoot);
	const contextSession = resolveContextSession(projectRoot);
	const contextSessionState = contextSession
		? inspectImplicitSessionState(projectRoot, contextSession)
		: null;
	const globalActiveState = globalActiveSession
		? inspectImplicitSessionState(projectRoot, globalActiveSession)
		: null;
	// Listing is diagnostic-only: a corrupt binding must block implicit
	// lifecycle mutation, but it must not prevent operators from seeing a
	// recoverable global selector and the corruption warning below.
	let effective: ReturnType<typeof resolveEffectiveSession>;
	try {
		effective = resolveEffectiveSession(projectRoot, {
			allowGlobalFallback: defaultAllowGlobalFallback(),
		});
	} catch {
		effective =
			globalActiveSession && globalActiveState === "open"
				? { session: globalActiveSession, source: "global" }
				: null;
	}
	const displayedCurrentWorktree = displayWorktreePath(
		projectRoot,
		currentWorktree,
		debug,
	);
	let contextFileState: "ok" | "corrupt" = "ok";
	let rawBindings: ReturnType<typeof listBindings> = [];
	try {
		rawBindings = listBindings(projectRoot);
	} catch {
		contextFileState = "corrupt";
	}
	const bindings = rawBindings.map((binding) => ({
		...binding,
		worktree: displayWorktreePath(projectRoot, binding.worktree, debug),
		matches_context:
			(currentBranch !== null && binding.branch === currentBranch) ||
			(currentWorktree !== null && binding.worktree === currentWorktree),
		is_global_active: globalActiveSession === binding.session,
	}));
	return {
		data: {
			current_branch: currentBranch,
			current_worktree: displayedCurrentWorktree,
			global_active_session: globalActiveSession,
			global_active_state: globalActiveState,
			context_session: contextSession,
			context_session_state: contextSessionState,
			context_session_ignored:
				contextSession && contextSessionState !== "open"
					? contextSessionState
					: null,
			effective_session: effective?.session ?? null,
			effective_source: effective?.source ?? null,
			context_file_state: contextFileState,
			bindings,
		},
		lines: [
			"session list:",
			`  current branch: ${currentBranch ?? "(none)"}`,
			`  current worktree: ${displayedCurrentWorktree ?? "(none)"}`,
			`  global active: ${globalActiveSession ?? "(none)"}${globalActiveState && globalActiveState !== "open" ? ` (ignored: ${globalActiveState})` : ""}`,
			`  context session: ${contextSession ?? "(none)"}${contextSessionState && contextSessionState !== "open" ? ` (ignored: ${contextSessionState})` : ""}`,
			`  effective session: ${effective ? `${effective.session} (${effective.source})` : "(none)"}`,
			...(contextFileState === "corrupt"
				? [
						"  context file: corrupt (bindings unavailable; switch repairs it, and new repairs it in a Git context)",
					]
				: []),
			...(bindings.length > 0
				? bindings.map((binding) => {
						const flags = [
							binding.matches_context ? "context" : "",
							binding.is_global_active ? "global" : "",
						]
							.filter((value) => value.length > 0)
							.join(", ");
						return `  - ${binding.session} branch=${binding.branch ?? "(none)"} worktree=${binding.worktree ?? "(none)"} actor=${binding.actor ?? "(none)"} touched=${binding.last_touched}${flags ? ` [${flags}]` : ""}`;
					})
				: ["  (no bindings)"]),
		],
		exitCode: 0,
	};
}

function prepareRadarResult(
	report: CoordinationRadarReport,
	strict: boolean,
): ActionResult {
	const tasks = report.tasks.filter(isOpenTask);
	const warnings = [...report.warnings].sort(
		(left, right) =>
			severityWeight(left.severity) - severityWeight(right.severity) ||
			left.id.localeCompare(right.id),
	);
	const sessions =
		report.sessions?.filter((session) => session.archived !== true) ??
		Array.from(new Set(tasks.map((task) => task.session))).map((session) => ({
			session,
		}));
	const summary = summarizeRadar({ ...report, tasks, warnings, sessions });
	const topWarnings = warnings.slice(0, RADAR_TEXT_WARNING_LIMIT);
	const exitCode = strict && summary.critical > 0 ? 1 : 0;
	return {
		data: {
			warning_policy: "context-only",
			generated_at: report.generated_at ?? null,
			freshness: report.freshness ?? null,
			summary,
			sessions: sessions.slice(0, RADAR_JSON_SESSION_LIMIT),
			tasks: tasks.slice(0, RADAR_JSON_TASK_LIMIT).map(boundRadarTask),
			warnings: warnings.slice(0, RADAR_JSON_WARNING_LIMIT),
			truncated: {
				sessions: sessions.length > RADAR_JSON_SESSION_LIMIT,
				tasks: tasks.length > RADAR_JSON_TASK_LIMIT,
				warnings: warnings.length > RADAR_JSON_WARNING_LIMIT,
			},
		},
		lines: [
			"session radar: warnings are context only, not locks",
			`summary: sessions=${summary.sessions} open_tasks=${summary.open_tasks} warnings=${summary.warnings} critical=${summary.critical} warning=${summary.warning} info=${summary.info}`,
			...(topWarnings.length > 0
				? ["warnings:", ...topWarnings.map(formatRadarWarning)]
				: ["warnings: none"]),
			"open tasks:",
			...(tasks.length > 0 ? tasks.map(formatRadarTask) : ["  (none)"]),
		],
		exitCode,
	};
}

function bindCurrentSession(
	projectRoot: string,
	parsed: ParsedArgs,
	ctx: OperationContext,
): ActionResult {
	const session = parsed.session ?? parsed.positional[0] ?? "";
	if (!session) {
		throw new Error("Missing --session for session bind.");
	}
	assertSessionExists(projectRoot, session);
	assertSessionNotArchivedOrClosed(projectRoot, session);
	const branch = parsed.branch ?? currentGitBranch(projectRoot);
	const worktree = currentGitWorktree(projectRoot) ?? projectRoot;
	if (parsed.dryRun) {
		return {
			data: {
				action: "bind",
				dry_run: true,
				session,
				binding: { session, branch, worktree, actor: parsed.actor ?? null },
			},
			lines: [
				`session bind ${session}: dry-run`,
				`  branch: ${branch ?? "(none)"}`,
				`  worktree: ${worktree ?? "(none)"}`,
				`  actor: ${parsed.actor ?? "(none)"}`,
			],
			exitCode: 0,
		};
	}
	if (requiresApproval(ctx)) {
		throw new Error("session bind requires local interactive approval");
	}
	const binding = bindSession(projectRoot, {
		session,
		branch,
		worktree,
		actor: parsed.actor,
	});
	return {
		data: { action: "bind", session, binding },
		lines: [
			`session bound: ${session}`,
			`  branch: ${binding.branch ?? "(none)"}`,
			`  worktree: ${binding.worktree ?? "(none)"}`,
			`  actor: ${binding.actor ?? "(none)"}`,
		],
		exitCode: 0,
	};
}

function switchSession(
	projectRoot: string,
	session: string,
	ctx: OperationContext,
	runtime: SessionCommandRuntime,
): ActionResult {
	assertSessionExists(projectRoot, session);
	assertSessionNotArchivedOrClosed(projectRoot, session);
	if (requiresApproval(ctx)) {
		throw new Error("session switch requires local interactive approval");
	}
	const branch = currentGitBranch(projectRoot);
	const worktree = currentGitWorktree(projectRoot) ?? projectRoot;
	const activePath = resolveProjectPaths(projectRoot).abs.activeSessionFile;
	const binding = withSessionContextLock(projectRoot, () => {
		const activeExisted = existsSync(activePath);
		const activeBefore = activeExisted ? readFileSync(activePath, "utf8") : "";
		try {
			atomicWriteText(activePath, `${session}\n`);
			runtime.beforeSwitchBinding?.();
			return bindSession(
				projectRoot,
				{ session, branch, worktree },
				{ resetInvalid: true },
			);
		} catch (error) {
			if (activeExisted) atomicWriteText(activePath, activeBefore);
			else rmSync(activePath, { force: true });
			throw error;
		}
	});
	return {
		data: {
			action: "switch",
			session,
			global_active_session: session,
			binding,
		},
		lines: [
			`session switched: ${session}`,
			`  global active: ${session}`,
			`  branch: ${binding.branch ?? "(none)"}`,
			`  worktree: ${binding.worktree ?? "(none)"}`,
		],
		exitCode: 0,
	};
}

function unbindSession(
	projectRoot: string,
	session: string,
	ctx: OperationContext,
): ActionResult {
	if (requiresApproval(ctx)) {
		throw new Error("session unbind requires local interactive approval");
	}
	const removed = removeBinding(projectRoot, session);
	return {
		data: { action: "unbind", session, removed },
		lines: [
			removed ? `session unbound: ${session}` : `session not bound: ${session}`,
		],
		exitCode: 0,
	};
}

function archiveSessions(
	projectRoot: string,
	parsed: ParsedArgs,
	ctx: OperationContext,
): ActionResult {
	if (parsed.candidates) {
		const page = listSessionArchiveCandidatePage(
			projectRoot,
			parsed.olderThanDays,
			{ offset: parsed.archiveOffset, limit: parsed.archiveLimit },
		);
		return {
			data: {
				action: "archive-candidates",
				read_only: true,
				older_than_days: parsed.olderThanDays,
				...page,
			},
			lines: [
				"session archive candidates:",
				`  candidates (${page.returned_count}/${page.total_count}): ${compactList(
					page.candidates.map((candidate) => candidate.session),
					20,
				)}`,
			],
			exitCode: 0,
		};
	}
	if (!parsed.reason) {
		throw new Error("Missing --reason for session archive.");
	}
	const sessions = [
		...(parsed.session ? [parsed.session] : []),
		...parsed.positional,
	];
	if (sessions.length === 0) {
		throw new Error("Missing session identifier for session archive.");
	}
	if (parsed.dryRun) {
		const candidates = previewArchiveSessions(projectRoot, sessions);
		return {
			data: {
				action: "archive",
				dry_run: true,
				reason: parsed.reason,
				older_than_days: parsed.olderThanDays,
				candidates,
			},
			lines: [
				"session archive: dry-run",
				`  candidates: ${candidates.map((candidate) => candidate.session).join(", ") || "none"}`,
			],
			exitCode: 0,
		};
	}
	if (requiresApproval(ctx)) {
		throw new Error("session archive requires local interactive approval");
	}
	const archived = archiveWorkbenchSessions(
		projectRoot,
		sessions,
		parsed.reason ?? "",
	);
	return {
		data: { action: "archive", reason: parsed.reason, archived },
		lines: archived.map(
			(entry) =>
				`session archived: ${entry.session} (closed_at=${entry.closed_at})`,
		),
		exitCode: 0,
	};
}

function restoreSessions(
	projectRoot: string,
	parsed: ParsedArgs,
	ctx: OperationContext,
): ActionResult {
	if (!parsed.reason) {
		throw new Error("Missing --reason for session restore.");
	}
	if (parsed.candidates) {
		throw new Error("--candidates is supported only by session archive.");
	}
	const sessions = [
		...(parsed.session ? [parsed.session] : []),
		...parsed.positional,
	];
	if (sessions.length === 0) {
		throw new Error("Missing session identifier for session restore.");
	}
	if (parsed.dryRun) {
		const plans = previewRestoreSessions(projectRoot, sessions);
		return {
			data: {
				action: "restore",
				dry_run: true,
				reason: parsed.reason,
				sessions: plans.map((plan) => plan.session),
			},
			lines: [`session restore: dry-run`, `  sessions: ${sessions.join(", ")}`],
			exitCode: 0,
		};
	}
	if (requiresApproval(ctx)) {
		throw new Error("session restore requires local interactive approval");
	}
	const restored = restoreWorkbenchSessions(
		projectRoot,
		sessions,
		parsed.reason ?? "",
	);
	return {
		data: { action: "restore", reason: parsed.reason, restored },
		lines: restored.map((entry) => `session restored: ${entry.session}`),
		exitCode: 0,
	};
}

function writeSessionError(
	error: unknown,
	parsed: ParsedArgs,
	io: CommandIo,
): number {
	const message = (error as Error).message ?? String(error);
	const exitCode = 2;
	let errorCode = "SESSION_ERROR";
	if (
		message.includes("Missing --session") ||
		message.includes("Missing session identifier")
	) {
		errorCode = "SESSION_MISSING_ARG";
	} else if (message.includes("session not found")) {
		errorCode = "SESSION_NOT_FOUND";
	} else if (message.includes("requires local interactive approval")) {
		errorCode = "SESSION_APPROVAL_REQUIRED";
	} else if (message.includes("Missing value for")) {
		errorCode = "SESSION_PARSE_ERROR";
	}
	if (parsed.json) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr(errorCode, message, {
					action: "session",
					exitCode,
				}),
			),
		);
	} else {
		io.stderr(`for session command: ${message}`);
	}
	return exitCode;
}

export async function runSessionCommand(
	action: string,
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
	runtime: SessionCommandRuntime = {},
): Promise<number> {
	let parsed: ParsedArgs;
	try {
		parsed = parseArgs(args);
	} catch (error) {
		return writeSessionError(
			error,
			{
				json: args.includes("--json") || args.includes("-j"),
				dryRun: false,
				debug: false,
				strict: false,
				branch: null,
				actor: null,
				reason: null,
				olderThanDays: 90,
				candidates: false,
				archiveOffset: 0,
				archiveLimit: ARCHIVE_CANDIDATE_PAGE_LIMIT,
				session: null,
				positional: [],
			},
			io,
		);
	}
	try {
		if (action === "" || action === "list") {
			return emit(
				listSessions(projectRoot, parsed.debug),
				"session.list",
				parsed.json,
				io,
			);
		}
		if (action === "bind") {
			return emit(
				bindCurrentSession(projectRoot, parsed, ctx),
				"session.bind",
				parsed.json,
				io,
			);
		}
		if (action === "switch") {
			const session = parsed.positional[0] ?? parsed.session ?? "";
			if (!session) {
				throw new Error("Missing session identifier for session switch.");
			}
			return emit(
				switchSession(projectRoot, session, ctx, runtime),
				"session.switch",
				parsed.json,
				io,
			);
		}
		if (action === "unbind") {
			const session = parsed.session ?? parsed.positional[0] ?? "";
			if (!session) {
				throw new Error("Missing --session for session unbind.");
			}
			return emit(
				unbindSession(projectRoot, session, ctx),
				"session.unbind",
				parsed.json,
				io,
			);
		}
		if (action === "archive") {
			return emit(
				archiveSessions(projectRoot, parsed, ctx),
				"session.archive",
				parsed.json,
				io,
			);
		}
		if (action === "restore") {
			return emit(
				restoreSessions(projectRoot, parsed, ctx),
				"session.restore",
				parsed.json,
				io,
			);
		}
		if (action === "radar") {
			try {
				return emit(
					await radarSessions(projectRoot, parsed.strict),
					"session.radar",
					parsed.json,
					io,
				);
			} catch (error) {
				return emitRadarError(parsed, io, (error as Error).message);
			}
		}

		const message = `afol session: unknown action '${action}'`;
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("SESSION_ACTION_UNKNOWN", message, {
						action: "session",
						exitCode: 2,
						hint: "use list, bind, switch, unbind, archive, restore, or radar",
					}),
				),
			);
		} else {
			io.stderr(
				'err session-action-unknown hint="use list, bind, switch, unbind, archive, restore, or radar"',
			);
		}
		return 2;
	} catch (error) {
		return writeSessionError(error, parsed, io);
	}
}
