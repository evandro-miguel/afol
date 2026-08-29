import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { OperationContext } from "../../core/operation-context";
import {
	appendEventLedgerRecords,
	appendValidatedEventLedgerRecords,
	assertValidEventLedger,
	readEventLedgerRecords,
} from "../events/ledger";
import { appendTelemetryEvent, firstToken } from "../events/telemetry";
import { ingestObservationsForSession } from "../evolution/observation-ingest";
import { resolveEvolutionConfig } from "../evolution/runtime-config";
import {
	buildGovernanceFrontmatter,
	recordPendingSpecForSession,
} from "../governance/pending-specs";
import {
	beginHotPathMeasurement,
	countHotPathOperation,
} from "../hot-path/instrumentation";
import { atomicWriteText } from "../io/atomic";
import { withSessionLock } from "../io/session-lock";
import { appendWorkbenchEvent } from "../local-state/workbench-events";
import {
	appendEventsAndRebuildWorkBenchIndex,
	rebuildWorkBenchIndex,
} from "../local-state/workbench-index";
import { admitsEvidenceTransitionIssue } from "../project/evidence-transition-admission";
import {
	admitsLegacyEvidenceIssue,
	validLegacyEvidenceBaseline,
} from "../project/legacy-evidence-baseline";
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import { resolveProjectPath } from "../project/root";
import { readArchivedSessionState } from "./session-archive-state";
import {
	isSessionClosed,
	parseTaskDocument,
	readTaskLifecycleState,
	scalarValue,
} from "./session-lifecycle-state";
import { loadEvidenceEntries, sessionPaths } from "./session-reader";
import { parseStateBoardTaskRow } from "./state-board";
import type { EvidenceEntry, EvidenceProvenance, TaskState } from "./types";

export type { SessionLifecycleState } from "./session-lifecycle-state";
export { sessionLifecycleState } from "./session-lifecycle-state";
export { isSessionClosed };

import {
	appendVerificationRunStart,
	appendVerificationRunStep,
	appendVerificationRunTerminal,
	latestRunForTask,
	nextVerificationAttempt,
	readVerificationRunLedger,
	reconcileVerificationEvidenceOrphans,
	runHasCompletePassedSteps,
	stepsForRun,
	terminalForRun,
	type VerificationRunStartRecord,
	type VerificationRunStatus,
	verificationCommandDigest,
	verificationRunAuthorizes,
} from "./verification-runs";
import {
	type CompletionPolicy,
	completionPolicyFromNotes,
	evidenceCompletionAuthorization,
	evidenceCompletionStatus,
	evidenceResultIsFailure,
	isBlockingVerifyIssue,
	isNoopExecutionCommand,
	type VerifyIssue,
	verifyWorkbenchTasks,
} from "./verify";

const BLOCKING_STATES = new Set([
	"pending",
	"in_progress",
	"implemented_untested",
	"tested_needs_spec_validation",
	"problem",
]);
const NEW_SESSION_LOCK_SESSION = "__workbench-new-session__";

export type WorkbenchTaskRef = {
	session: string;
	taskId: string;
};

export type RecordEvidenceInput = WorkbenchTaskRef & {
	command: string;
	result: string;
	exitCode?: number;
	signal?: string;
	artifact?: string;
	note?: string;
	provenance?: EvidenceProvenance;
	approvalContext?: OperationContext;
	verification?: {
		runId: string;
		taskAttempt: number;
		verificationAttempt: number;
		stepIndex: number;
		stepCount: number;
		status: VerificationRunStatus;
		durationMs: number;
	};
};

export type { EvidenceEntry, EvidenceProvenance, TaskState } from "./types";

const SENSITIVE_COMMAND_KEYS = new Set([
	"TOKEN",
	"PASSWORD",
	"PASSWD",
	"SECRET",
	"API_KEY",
	"ACCESS_KEY",
	"PRIVATE_KEY",
	"DATABASE_URL",
	"DB_URL",
	"REDIS_URL",
	"MONGO_URL",
	"MONGODB_URI",
	"CONNECTION_STRING",
	"DSN",
	"AUTHORIZATION",
]);
const GITHUB_TOKEN_PREFIXES = [
	"ghp_",
	"gho_",
	"ghu_",
	"ghs_",
	"ghr_",
	"github_pat_",
] as const;
const GITHUB_TOKEN_RE = new RegExp(
	`\\b(?:${GITHUB_TOKEN_PREFIXES.map(
		(prefix) => `${prefix}[A-Za-z0-9_]{20,}`,
	).join("|")})\\b`,
	"g",
);

function sensitiveAssignmentKey(key: string): boolean {
	const normalized = key
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replaceAll("-", "_")
		.toUpperCase();
	return [...SENSITIVE_COMMAND_KEYS].some(
		(classifier) =>
			normalized === classifier || normalized.endsWith(`_${classifier}`),
	);
}

function sensitiveLongOption(option: string): boolean {
	const normalized = option.slice(2).replaceAll("-", "_").toUpperCase();
	return SENSITIVE_COMMAND_KEYS.has(normalized);
}

/** Redact credential-shaped values before any evidence field is persisted. */
export function sanitizeEvidenceText(value: string): string {
	let sanitized = value.replace(
		/(^|\s)([A-Za-z_][A-Za-z0-9_]*)(=)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]*)/g,
		(match, prefix: string, key: string) =>
			sensitiveAssignmentKey(key) ? `${prefix}${key}=[REDACTED]` : match,
	);
	sanitized = sanitized.replace(
		/"(Authorization\s*:\s*[A-Za-z][A-Za-z0-9_-]*\s+)(?:\\.|[^"\\])*"/gi,
		(_match: string, header: string) => `"${header}[REDACTED]"`,
	);
	sanitized = sanitized.replace(
		/'(Authorization\s*:\s*[A-Za-z][A-Za-z0-9_-]*\s+)(?:\\.|[^'\\])*'/gi,
		(_match: string, header: string) => `'${header}[REDACTED]'`,
	);
	sanitized = sanitized.replace(
		/(\bAuthorization\s*:\s*(?:[A-Za-z][A-Za-z0-9_-]*\s+)?)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi,
		"$1[REDACTED]",
	);
	sanitized = sanitized.replace(
		/(^|[\s{,;])(?:(['"])([A-Za-z_][A-Za-z0-9_-]*)\2|([A-Za-z_][A-Za-z0-9_-]*))(\s*:\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}\]]+)/g,
		(
			match: string,
			prefix: string,
			quote: string | undefined,
			quotedKey: string | undefined,
			unquotedKey: string | undefined,
			separator: string,
		) => {
			const key = quotedKey ?? unquotedKey;
			if (!key || !sensitiveAssignmentKey(key)) return match;
			const keyQuote = quote ?? "";
			return `${prefix}${keyQuote}${key}${keyQuote}${separator}[REDACTED]`;
		},
	);
	sanitized = sanitized.replace(/\bcurl\b[^\r\n;|&]*/g, (curlCommand) =>
		curlCommand
			.replace(
				/(^|[ \t])(-u)(=|[ \t]+)?("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+)/g,
				(_match, prefix: string, option: string, separator = "") =>
					`${prefix}${option}${separator}[REDACTED]`,
			)
			.replace(
				/(^|[ \t])(--user)(=|[ \t]+)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+)/g,
				(_match, prefix: string, option: string, separator: string) =>
					`${prefix}${option}${separator}[REDACTED]`,
			),
	);
	sanitized = sanitized.replace(
		/(^|\s)(--[A-Za-z0-9-]+)(=|\s+)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+)/g,
		(match, prefix: string, option: string, separator: string) =>
			sensitiveLongOption(option)
				? `${prefix}${option}${separator}[REDACTED]`
				: match,
	);
	sanitized = sanitized.replace(
		/((?:api[_ -]?key|access[_ -]?token|authorization|password|secret|token)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi,
		(
			match: string,
			prefix: string,
			_value: string,
			offset: number,
			whole: string,
		) => {
			const key = prefix
				.replace(/\s*[:=]\s*$/, "")
				.trim()
				.toLowerCase();
			if (
				key === "authorization" &&
				/^\s+\[REDACTED\]/.test(whole.slice(offset + match.length))
			) {
				return match;
			}
			return `${prefix}[REDACTED]`;
		},
	);
	sanitized = sanitized.replace(
		/(\b(?:bearer|basic|digest)\s+)[^\s,;}"']+/gi,
		"$1[REDACTED]",
	);
	sanitized = sanitized.replace(
		/([?&](?:api[_-]?key|access[_-]?token|authorization|password|secret|token)=)[^&#\s]+/gi,
		"$1[REDACTED]",
	);
	sanitized = sanitized.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]");
	sanitized = sanitized.replace(GITHUB_TOKEN_RE, "[REDACTED]");
	sanitized = sanitized.replace(
		/([A-Za-z][A-Za-z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s/]+)(@)/g,
		"$1[REDACTED]$3",
	);
	return sanitized;
}

/** Compatibility name for command-only callers. */
export function sanitizeEvidenceCommand(command: string): string {
	return sanitizeEvidenceText(command);
}

export type NewWorkstreamMetadata = {
	continuationOf?: string;
	carryOpenTasks?: string[];
	intent?: string;
	featureId?: string;
	parentSpec?: string;
	noSpecRequiredReason?: string;
	pendingSpecReason?: string;
	task?: string;
	tasks?: string[];
};

export type CloseSessionOptions = {
	allowNoReport?: boolean;
	carryOpen?: boolean;
	onContinuationCreated?: (session: string) => void;
	onContinuationRollback?: () => void;
	reason?: string;
	summary?: string;
	/**
	 * When set, strict verification waives issues that are admitted by the
	 * legacy evidence compatibility baseline (pre-cutoff sessions whose
	 * evidence debt was explicitly admitted). Only consulted for open
	 * sessions; the strict path is unchanged when the option is absent.
	 */
	admitLegacyBaseline?: boolean;
	/**
	 * Dedicated transition-admit route: waive only the current hash-bound
	 * post-cutoff no-op debt while closing. Normal close never sets this.
	 */
	admitTransitionAdmission?: boolean;
};

export type CloseSessionReport = {
	status: "created" | "existing" | "waived" | "missing";
	path: string | null;
	summary_source: "flag" | "log" | "state" | "waiver";
};

export type CloseSessionResult = string[] & {
	report: CloseSessionReport;
	continuation?: string;
};

export type LifecycleAuxiliaryRuntime = {
	beforeAuxiliary?: (label: string) => void;
	fencingCheck?: () => void;
	afterActiveSessionWrite?: (session: string) => void;
	deferNewSessionAuxiliary?: boolean;
	/**
	 * Inject a deterministic observer seam for testing.
	 * When set, the observer calls this function instead of running
	 * ingestObservationsForSession.  The seam must return a result
	 * with the same shape as IngestObservationsResult or throw.
	 */
	observerSeam?: (input: {
		root: string;
		projectId: string;
		session: string;
		mode: "full" | "production-day";
	}) => {
		appended: number;
		duplicates: number;
		skipped: number;
		warnings: string[];
		observation_ids: string[];
	};
};

type InternalLifecycleAuxiliaryRuntime = LifecycleAuxiliaryRuntime & {
	deferLocalStateRefresh?: boolean;
	skipDefaultTelemetry?: boolean;
	deferredEventRecords?: Record<string, unknown>[];
	completeObservedTransitionChain?: boolean;
	sessionMutationValidated?: boolean;
	authorizingEvidence?: EvidenceEntry;
};

function observeCompletedSession(
	root: string,
	session: string,
	runtime: LifecycleAuxiliaryRuntime = {},
	mode: "full" | "production-day" = "full",
): string[] {
	try {
		const config = resolveEvolutionConfig(readProjectConfig(root));
		const autonomy = config.settings.autonomy;
		const autoObserve =
			autonomy !== null &&
			typeof autonomy === "object" &&
			!Array.isArray(autonomy) &&
			(autonomy as Record<string, unknown>).auto_observe === true;
		if (
			!config.configured ||
			!config.enabled ||
			!config.projectId ||
			!autoObserve
		) {
			return [];
		}
		const result = runtime.observerSeam
			? runtime.observerSeam({
					root,
					projectId: config.projectId,
					session,
					mode,
				})
			: ingestObservationsForSession({
					root,
					projectId: config.projectId,
					session,
					mode,
				});
		return result.warnings;
	} catch (error) {
		return [
			`observer ${mode === "production-day" ? "production-day allocation" : "observation ingest"} failed after durable commit: ${(error as Error).message}`,
		];
	}
}

export type TimelineEntryResult = {
	logPath: string;
	message: string;
};

export type NewWorkstreamResult = {
	session: string;
	sessionDir: string;
	planPath: string;
	taskPath: string;
	logPath: string;
	evidencePath: string;
	activeSessionPath: string;
	warnings: string[];
};

type TaskRow = {
	line: string;
	taskId: string;
	state: string;
	owner: string;
	notes: string;
	attempt: number;
};

const TASK_STATE_TRANSITIONS: Readonly<
	Record<TaskState, readonly TaskState[]>
> = {
	pending: ["in_progress", "moved"],
	in_progress: ["implemented_untested", "problem", "moved"],
	implemented_untested: ["tested_needs_spec_validation", "problem"],
	tested_needs_spec_validation: ["done", "problem"],
	problem: ["in_progress", "moved"],
	done: [],
	moved: [],
};

function isTaskState(value: string): value is TaskState {
	return value in TASK_STATE_TRANSITIONS;
}

function sanitizeTheme(theme: string): string {
	const cleaned = theme
		.trim()
		.toLowerCase()
		.replaceAll("_", "-")
		.replaceAll(" ", "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	if (!cleaned) {
		throw new Error(
			"Theme is empty after sanitization. Use letters or numbers.",
		);
	}
	return cleaned.slice(0, 80).replace(/-$/g, "");
}

function twoDigits(value: number): string {
	return value.toString().padStart(2, "0");
}

function auxiliaryWarning(
	warnings: string[],
	label: string,
	action: () => void,
	runtime: LifecycleAuxiliaryRuntime = {},
): void {
	try {
		runtime.beforeAuxiliary?.(label);
		action();
	} catch (error) {
		warnings.push(
			`${label} failed after durable commit: ${(error as Error).message}`,
		);
	}
}

function shortSessionSuffix(): string {
	return randomBytes(2).toString("hex");
}

function buildSessionPrefix(now: Date): string {
	const year = now.getFullYear() % 100;
	const month = now.getMonth() + 1;
	const day = now.getDate();
	const hour = now.getHours();
	const minute = now.getMinutes();
	return `${twoDigits(year)}${twoDigits(month)}${twoDigits(day)}_${twoDigits(hour)}${twoDigits(minute)}`;
}

function uniqueSessionId(wbRoot: string, base: string): string {
	if (!existsSync(join(wbRoot, base))) {
		return base;
	}
	for (let i = 0; i < 32; i += 1) {
		const candidate = `${base}_${shortSessionSuffix()}`;
		if (!existsSync(join(wbRoot, candidate))) {
			return candidate;
		}
	}

	let counter = 2;
	while (true) {
		const candidate = `${base}_${twoDigits(counter)}`;
		if (!existsSync(join(wbRoot, candidate))) {
			return candidate;
		}
		counter += 1;
	}
}

function pushChecklistCloseWarnings(
	target: string[],
	verification: { issues: VerifyIssue[] },
): void {
	const open = verification.issues.filter(
		(issue) => !isBlockingVerifyIssue(issue),
	);
	if (open.length > 0) {
		target.push(
			`${open.length} open checklist item(s): ${open
				.map((issue) => issue.message)
				.join("; ")}`,
		);
	}
}

function evaluateCloseWarnings(session: string, sessionDir: string): string[] {
	const warnings: string[] = [];
	const reportPath = join(sessionDir, `${session}_report_01.md`);
	const logPath = join(sessionDir, `${session}_log_01.md`);
	if (!existsSync(reportPath)) {
		warnings.push("final report artifact is missing");
	}
	if (!existsSync(logPath)) {
		warnings.push("log artifact is missing");
		return warnings;
	}
	const logContent = readFileSync(logPath, "utf8");
	if (!/^##\s*Summary/m.test(logContent)) {
		warnings.push("log summary section is missing");
	}
	return warnings;
}

function readLogSummary(content: string): string | null {
	const lines = content.split(/\r?\n/);
	const start = lines.findIndex((line) => /^##\s+Summary\s*$/.test(line));
	if (start < 0) {
		return null;
	}
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => /^##\s+/.test(line));
	const summary = rest
		.slice(0, end < 0 ? undefined : end)
		.join("\n")
		.trim();
	return summary || null;
}

function closeMarkdownText(value: string): string {
	return value.replace(/\r?\n/g, " ").replace(/^##\s+/gm, "### ");
}

function canonicalizeLogSummary(content: string, summary: string): string {
	const lines = content.split(/\r?\n/);
	const output: string[] = [];
	let found = false;
	let skipping = false;
	for (const line of lines) {
		if (/^##\s+Summary\s*$/.test(line)) {
			if (!found) {
				while (output.at(-1) === "") {
					output.pop();
				}
				output.push("## Summary", "", summary);
				found = true;
			}
			skipping = true;
			continue;
		}
		if (skipping) {
			if (!/^##\s+/.test(line)) {
				continue;
			}
			skipping = false;
			if (output.at(-1) !== "") {
				output.push("");
			}
		}
		output.push(line);
	}
	if (!found) {
		while (output.at(-1) === "") {
			output.pop();
		}
		output.push("", "## Summary", "", summary);
	}
	return `${output.join("\n").replace(/\n+$/g, "")}\n`;
}

function renderCloseReport(
	session: string,
	taskRows: TaskRow[],
	evidence: EvidenceEntry[],
	summary: string,
): string {
	const authorizingEvidenceIds = new Set<string>();
	for (const row of taskRows) {
		const authorization = evidenceCompletionAuthorization(
			evidence.filter(
				(entry) =>
					entry.task_id === row.taskId && (entry.attempt ?? 0) === row.attempt,
			),
			completionPolicyFromNotes(row.notes),
		);
		if (authorization.status === "passed" && authorization.evidenceId) {
			authorizingEvidenceIds.add(authorization.evidenceId);
		}
	}
	const lines = [
		`# Report: ${session}`,
		"",
		"## Summary",
		closeMarkdownText(summary),
		"",
		"## Tasks",
		...taskRows.map((row) => `- ${row.taskId}: ${row.state}`),
		"",
		"## Evidence",
		...evidence.map(
			(entry) =>
				`- ${entry.task_id} attempt=${entry.attempt ?? 0} evidence_id=${entry.id}${authorizingEvidenceIds.has(entry.id) ? " authorizing" : ""}: ${entry.provenance === "observed" ? "" : "declared "}${closeMarkdownText(entry.result)} (${closeMarkdownText(entry.command)}; exit_code=${entry.exit_code ?? "n/a"})`,
		),
	];
	return `${lines.join("\n").replace(/\n+$/g, "")}\n`;
}

function isDuplicateDeclaredEvidence(
	existing: EvidenceEntry,
	candidate: EvidenceEntry,
): boolean {
	return (
		existing.provenance === "declared" &&
		candidate.provenance === "declared" &&
		existing.task_id === candidate.task_id &&
		existing.attempt === candidate.attempt &&
		existing.command === candidate.command &&
		existing.result === candidate.result &&
		existing.exit_code === candidate.exit_code &&
		existing.signal === candidate.signal &&
		existing.artifact === candidate.artifact &&
		existing.artifact_sha256 === candidate.artifact_sha256 &&
		existing.note === candidate.note &&
		existing.authorization_type === candidate.authorization_type &&
		existing.waiver_reason === candidate.waiver_reason &&
		existing.approved_by === candidate.approved_by &&
		existing.verification_run_id === candidate.verification_run_id &&
		existing.task_attempt === candidate.task_attempt &&
		existing.verification_attempt === candidate.verification_attempt &&
		existing.step_index === candidate.step_index &&
		existing.step_count === candidate.step_count &&
		existing.verification_status === candidate.verification_status &&
		existing.duration_ms === candidate.duration_ms &&
		existing.command_digest === candidate.command_digest
	);
}

function factualCloseSummary(
	taskRows: TaskRow[],
	evidence: EvidenceEntry[],
): string {
	let observed = 0;
	let failed = 0;
	for (const entry of evidence) {
		if (entry.provenance === "observed") observed += 1;
		if (
			evidenceResultIsFailure(entry.result) ||
			(typeof entry.exit_code === "number" && entry.exit_code !== 0)
		) {
			failed += 1;
		}
	}
	return `closed: ${taskRows.length} task${taskRows.length === 1 ? "" : "s"}; evidence: ${observed} observed, ${failed} failed`;
}

function explicitTaskSummaries(metadata?: NewWorkstreamMetadata): string[] {
	const taskList =
		metadata?.tasks
			?.map((task) => task.trim())
			.filter((task) => task.length > 0) ?? [];
	if (taskList.length > 0) {
		return taskList;
	}
	const task = metadata?.task?.trim();
	return task ? [task] : [];
}

function taskSummariesFromMetadata(metadata?: NewWorkstreamMetadata): string[] {
	const taskList = explicitTaskSummaries(metadata);
	if (taskList.length > 0) {
		return taskList;
	}
	return ["Execute requested lifecycle work."];
}

function escapeTaskNote(task: string): string {
	return task.replace(/\|/g, "/");
}

// Re-exported from session-reader for backward compat
export { sessionPaths } from "./session-reader";

function refreshWorkbenchLocalState(
	root: string,
	session?: string,
	deferredEventRecords: readonly Record<string, unknown>[] = [],
): void {
	if (session && deferredEventRecords.length > 0) {
		appendEventsAndRebuildWorkBenchIndex(root, session, deferredEventRecords);
		return;
	}
	if (session) {
		// A lifecycle mutation only changes one session. Keep its materialized
		// projection current without charging the close hot path for a global
		// derived-state refresh.
		rebuildWorkBenchIndex(root, session);
		return;
	}
	countHotPathOperation("workbench.local_state_refresh");
	rebuildWorkBenchIndex(root, session);
}

function commitDeferredEventRecords(
	root: string,
	records: readonly Record<string, unknown>[],
): void {
	if (records.length > 0) {
		appendValidatedEventLedgerRecords(root, records);
	}
}

const EVENT_COMMIT_RECOVERY_WARNING =
	"workbench event commit failed after durable commit; repair the event ledger, then run afol local-state rebuild.";

function commitDeferredEventRecordsWithWarning(
	warnings: string[],
	root: string,
	records: readonly Record<string, unknown>[],
	runtime: LifecycleAuxiliaryRuntime,
): void {
	try {
		runtime.beforeAuxiliary?.("workbench event commit");
		commitDeferredEventRecords(root, records);
	} catch {
		warnings.push(EVENT_COMMIT_RECOVERY_WARNING);
	}
}

export function readActiveSession(root: string): string | null {
	const activeSessionPath = resolveProjectPaths(root).abs.activeSessionFile;
	if (!existsSync(activeSessionPath)) {
		return null;
	}
	const active = readFileSync(activeSessionPath, "utf8").trim();
	return active.length > 0 ? active : null;
}

export function assertTaskInProgress(
	root: string,
	session: string,
	taskId: string,
): void {
	withSessionLock(root, session, () => {
		assertTaskInProgressLocked(root, session, taskId);
	});
}

type TaskMutationOptions = {
	beforeMutation?: () => void;
};

export function withTaskInProgressMutation<T>(
	root: string,
	session: string,
	taskId: string,
	mutation: () => T,
	options?: TaskMutationOptions,
): T {
	return withSessionLock(root, session, () => {
		assertTaskInProgressLocked(root, session, taskId);
		options?.beforeMutation?.();
		assertTaskInProgressLocked(root, session, taskId);
		return mutation();
	});
}

function assertTaskInProgressLocked(
	root: string,
	session: string,
	taskId: string,
): void {
	const paths = sessionPaths(root, session);
	if (!existsSync(paths.sessionDir)) {
		throw new Error(`Session folder not found: ${paths.sessionDir}`);
	}
	const row = ensureTaskExists(paths.taskPath, session, taskId);
	if (row.state !== "in_progress") {
		throw new Error(`Task ${taskId} is ${row.state}, expected in_progress.`);
	}
}

function parseTaskRow(line: string): TaskRow | null {
	const parsed = parseStateBoardTaskRow(line);
	if (!parsed) {
		return null;
	}
	const notes = parsed.notes;
	const attemptMatch = notes.match(/(?:^|\s)attempt=(\d+)(?=\s|$)/);
	return {
		line,
		taskId: parsed.taskId,
		state: parsed.state,
		owner: parsed.owner,
		notes,
		attempt: Number.parseInt(attemptMatch?.[1] ?? "0", 10),
	};
}

function renderTaskRow(row: Omit<TaskRow, "line">): string {
	return `| ${row.taskId} | ${row.state} | ${row.owner} | ${row.notes} |`;
}

function readTaskRows(taskPath: string): TaskRow[] {
	if (!existsSync(taskPath)) {
		throw new Error(`Task file not found: ${taskPath}`);
	}
	const lines = readFileSync(taskPath, "utf8").split("\n");
	const rows: TaskRow[] = [];
	for (const line of lines) {
		const row = parseTaskRow(line);
		if (row) {
			rows.push(row);
		}
	}
	return rows;
}

function setFrontmatterValue(
	lines: string[],
	key: string,
	value: string,
): void {
	const index = lines.findIndex((line) => scalarValue(line, key) !== undefined);
	const rendered = `${key}: ${JSON.stringify(value)}`;
	if (index >= 0) {
		lines[index] = rendered;
		return;
	}
	lines.push(rendered);
}

function markTaskMetadataClosed(
	taskPath: string,
	session: string,
	closedAt: string,
): void {
	const state = readTaskLifecycleState(taskPath, session);
	if (state.kind === "closed") {
		return;
	}
	const document = state.document;
	const lines =
		document.kind === "frontmatter"
			? [...document.lines]
			: [
					'doc_type: "workbench_task"',
					`id: ${JSON.stringify(`${session}_task_01`)}`,
					`session_id: ${JSON.stringify(session)}`,
					`created_at: ${JSON.stringify(closedAt)}`,
				];
	setFrontmatterValue(lines, "doc_type", "workbench_task");
	setFrontmatterValue(lines, "id", `${session}_task_01`);
	setFrontmatterValue(lines, "session_id", session);
	setFrontmatterValue(lines, "status", "closed");
	setFrontmatterValue(lines, "updated_at", closedAt);
	setFrontmatterValue(lines, "closed_at", closedAt);

	const newline = document.kind === "frontmatter" ? document.newline : "\n";
	const suffix =
		document.kind === "frontmatter"
			? document.suffix
			: `${newline}${document.content}`;
	atomicWriteText(
		taskPath,
		`---${newline}${lines.join(newline)}${newline}---${suffix}`,
	);
	countHotPathOperation("workbench.canonical_write");
}

function markPlanMetadataClosed(
	planPath: string,
	session: string,
	closedAt: string,
): void {
	if (!existsSync(planPath)) return;
	const content = readFileSync(planPath, "utf8");
	const document = parseTaskDocument(content, planPath);
	const lines =
		document.kind === "frontmatter"
			? [...document.lines]
			: [
					'doc_type: "workbench_plan"',
					`id: ${JSON.stringify(`${session}_plan_01`)}`,
					`session_id: ${JSON.stringify(session)}`,
					`created_at: ${JSON.stringify(closedAt)}`,
				];
	setFrontmatterValue(lines, "doc_type", "workbench_plan");
	setFrontmatterValue(lines, "id", `${session}_plan_01`);
	setFrontmatterValue(lines, "session_id", session);
	setFrontmatterValue(lines, "status", "closed");
	setFrontmatterValue(lines, "updated_at", closedAt);
	setFrontmatterValue(lines, "closed_at", closedAt);

	const newline = document.kind === "frontmatter" ? document.newline : "\n";
	const suffix =
		document.kind === "frontmatter"
			? document.suffix
			: `${newline}${document.content}`;
	atomicWriteText(
		planPath,
		`---${newline}${lines.join(newline)}${newline}---${suffix}`,
	);
	countHotPathOperation("workbench.canonical_write");
}

function carryOpenMetadata(
	session: string,
	document: ReturnType<typeof readTaskLifecycleState>["document"],
	taskRows: readonly TaskRow[],
	reason: string,
): { theme: string; metadata: NewWorkstreamMetadata } {
	if (document.kind !== "frontmatter") {
		throw new Error(`Session ${session} must be governed to carry open tasks.`);
	}
	const value = (key: string) =>
		document.lines
			.map((line) => scalarValue(line, key))
			.find((candidate) => candidate !== undefined)
			?.trim() ?? "";
	const featureId = value("feature_id") || value("roadmap_feature");
	const parentSpec = value("parent_spec");
	if (value("governance_status") !== "governed" || !featureId || !parentSpec) {
		throw new Error(`Session ${session} must be governed to carry open tasks.`);
	}
	const theme = value("theme") || "workstream";
	return {
		theme: `${theme} continuation`,
		metadata: {
			continuationOf: session,
			carryOpenTasks: taskRows.map((row) => row.taskId),
			intent: `Carry open from ${session}: ${reason}`,
			featureId,
			parentSpec,
			tasks: taskRows.map((row) =>
				`${row.taskId}: ${row.notes || `Carry open: ${reason}`}`.trim(),
			),
		},
	};
}

function sanitizeCarryOpenReason(reason: string): string {
	return sanitizeEvidenceText(reason)
		.replaceAll("|", "/")
		.replace(/\s+/g, " ")
		.trim();
}

function carryOpenTransitionChain(state: string): readonly TaskState[] {
	if (state === "pending" || state === "problem") return ["moved"];
	if (state === "in_progress") return ["problem", "moved"];
	if (
		state === "implemented_untested" ||
		state === "tested_needs_spec_validation"
	) {
		return ["problem", "moved"];
	}
	throw new Error(`Cannot carry open task in state ${state}.`);
}

function continuationFrontmatterValue(
	document: ReturnType<typeof readTaskLifecycleState>["document"],
	key: string,
): string | null {
	if (document.kind !== "frontmatter") return null;
	const values = document.lines
		.map((line) => scalarValue(line, key))
		.filter((value): value is string => value !== undefined && value !== null);
	return values.length === 1 ? (values[0]?.trim() ?? null) : null;
}

function carriedContinuationSession(
	root: string,
	source: ReturnType<typeof readTaskLifecycleState>["document"],
	taskRows: readonly TaskRow[],
): string | null {
	const carriedRows = taskRows.filter((row) => row.state === "moved");
	if (carriedRows.length === 0) return null;
	const destinations = new Set(
		carriedRows.map(
			(row) => /(?:^|\s)destination=([^\s|]+)/.exec(row.notes)?.[1] ?? "",
		),
	);
	if (destinations.size !== 1 || destinations.has("")) {
		throw new Error(
			"Carry-open recovery has an invalid source destination mapping.",
		);
	}
	const continuation = [...destinations][0];
	if (
		!continuation ||
		!existsSync(sessionPaths(root, continuation).sessionDir)
	) {
		throw new Error("Carry-open recovery continuation is missing.");
	}
	const continuationState = readTaskLifecycleState(
		sessionPaths(root, continuation).taskPath,
		continuation,
	);
	const expectedFeature = continuationFrontmatterValue(source, "feature_id");
	const expectedParentSpec = continuationFrontmatterValue(
		source,
		"parent_spec",
	);
	const sourceSession = continuationFrontmatterValue(source, "session_id");
	const expectedTasks = carriedRows
		.map((row) => row.taskId)
		.sort()
		.join(",");
	if (
		continuationFrontmatterValue(
			continuationState.document,
			"continuation_of",
		) !== sourceSession ||
		continuationFrontmatterValue(continuationState.document, "feature_id") !==
			expectedFeature ||
		continuationFrontmatterValue(continuationState.document, "parent_spec") !==
			expectedParentSpec ||
		continuationFrontmatterValue(
			continuationState.document,
			"governance_status",
		) !== "governed" ||
		continuationFrontmatterValue(
			continuationState.document,
			"carry_open_tasks",
		) !== expectedTasks
	) {
		throw new Error(
			"Carry-open recovery continuation linkage does not match source.",
		);
	}
	return continuation;
}

function ensureSessionOpenForMutation(root: string, session: string): void {
	const paths = sessionPaths(root, session);
	if (!existsSync(paths.sessionDir)) {
		throw new Error(`Session folder not found: ${paths.sessionDir}`);
	}
	if (!existsSync(paths.taskPath)) {
		throw new Error(
			`Session ${session} is missing its canonical task file: ${paths.taskPath}`,
		);
	}
	if (readTaskLifecycleState(paths.taskPath, session).kind === "closed") {
		throw new Error(`Session ${session} is closed.`);
	}
}

function closeDiagnosticState(root: string, session: string): boolean {
	let workbench = false;
	for (const event of readEventLedgerRecords(root)) {
		workbench ||= event.type === "workbench.close" && event.session === session;
	}
	return workbench;
}

function ensureTaskExists(
	taskPath: string,
	session: string,
	taskId: string,
): TaskRow {
	const row = readTaskRows(taskPath).find((entry) => entry.taskId === taskId);
	if (!row) {
		throw new Error(`Task ${taskId} not found in ${session}.`);
	}
	return row;
}

function transitionTaskState(
	taskPath: string,
	taskId: string,
	nextState: TaskState,
	completionPolicy?: CompletionPolicy,
	notesSuffix?: string,
): void {
	transitionTaskStateChain(
		taskPath,
		taskId,
		[nextState],
		completionPolicy,
		notesSuffix,
	);
}

function transitionTaskStateChain(
	taskPath: string,
	taskId: string,
	nextStates: readonly TaskState[],
	completionPolicy?: CompletionPolicy,
	notesSuffix?: string,
): void {
	transitionTaskStateChains(taskPath, [
		{
			taskId,
			nextStates,
			...(completionPolicy ? { completionPolicy } : {}),
			...(notesSuffix ? { notesSuffix } : {}),
		},
	]);
}

function encodeTaskReason(reason: string): string {
	return encodeURIComponent(
		sanitizeEvidenceText(reason).replace(/\s+/g, " ").trim(),
	);
}

function transitionTaskStateChains(
	taskPath: string,
	changes: readonly {
		taskId: string;
		nextStates: readonly TaskState[];
		completionPolicy?: CompletionPolicy;
		notesSuffix?: string;
	}[],
): void {
	const pending = new Map(
		changes
			.filter((change) => change.nextStates.length > 0)
			.map((change) => [change.taskId, change]),
	);
	if (pending.size === 0) return;
	const lines = readFileSync(taskPath, "utf8").split("\n");
	const found = new Set<string>();
	const nextLines = lines.map((line) => {
		const parsedRow = parseTaskRow(line);
		const change = parsedRow ? pending.get(parsedRow.taskId) : undefined;
		if (!parsedRow || !change) {
			return line;
		}
		found.add(parsedRow.taskId);
		let row = parsedRow;
		for (const nextState of change.nextStates) {
			if (!isTaskState(row.state)) {
				throw new Error(
					`Task ${parsedRow.taskId} has invalid state: ${row.state}.`,
				);
			}
			if (!TASK_STATE_TRANSITIONS[row.state].includes(nextState)) {
				throw new Error(
					`Invalid task transition for ${parsedRow.taskId}: ${row.state} -> ${nextState}.`,
				);
			}
			const nextAttempt =
				nextState === "in_progress" || nextState === "problem"
					? row.attempt + 1
					: row.attempt;
			let baseNotes = row.notes
				.replace(/(?:^|\s)attempt=\d+(?=\s|$)/g, " ")
				.trim();
			if (nextState === "in_progress") {
				baseNotes = baseNotes
					.replace(/(?:^|\s)reason=[^\s]+(?=\s|$)/g, " ")
					.trim();
			}
			const policyNotes = change.completionPolicy
				? [
						baseNotes
							.replace(
								/(?:^|\s)completion_policy=(?:execution|artifact|waiver)(?=\s|$)/g,
								" ",
							)
							.trim(),
						`completion_policy=${change.completionPolicy}`,
					]
						.filter(Boolean)
						.join(" ")
				: baseNotes;
			const notes = [policyNotes, `attempt=${nextAttempt}`]
				.filter(Boolean)
				.join(" ");
			row = {
				...row,
				state: nextState,
				notes,
				attempt: nextAttempt,
			};
		}
		if (change.notesSuffix) {
			row = {
				...row,
				notes: [row.notes, change.notesSuffix].filter(Boolean).join(" "),
			};
		}
		return renderTaskRow(row);
	});
	const missing = [...pending.keys()].filter((taskId) => !found.has(taskId));
	if (missing.length > 0) {
		throw new Error(`Task ${missing.join(", ")} not found in ${taskPath}`);
	}
	atomicWriteText(taskPath, `${nextLines.join("\n").replace(/\n*$/g, "")}\n`);
	countHotPathOperation("workbench.canonical_write");
}

function evidenceId(now: Date): string {
	const yyyy = now.getFullYear().toString();
	const mm = twoDigits(now.getMonth() + 1);
	const dd = twoDigits(now.getDate());
	const hh = twoDigits(now.getHours());
	const mi = twoDigits(now.getMinutes());
	const ss = twoDigits(now.getSeconds());
	const msec = now.getMilliseconds().toString().padStart(3, "0");
	return `E-${yyyy}${mm}${dd}${hh}${mi}${ss}${msec}-${randomBytes(3).toString("hex")}`;
}

// Re-exported from session-reader for backward compat
export { loadEvidenceEntries } from "./session-reader";

export function selectSingleOpenTask(root: string, session: string): string {
	const paths = sessionPaths(root, session);
	const openRows = readTaskRows(paths.taskPath).filter(
		(row) => row.state === "pending",
	);
	if (openRows.length === 1) {
		return openRows[0]?.taskId ?? "";
	}
	if (openRows.length === 0) {
		throw new Error(
			`Missing --task-id for start; no pending tasks found in ${session}.`,
		);
	}
	const labels = openRows.map((row) => row.taskId).join(", ");
	throw new Error(
		`Missing --task-id for start; multiple pending tasks found in ${session}: ${labels}.`,
	);
}

function currentTimelineStamp(now = new Date()): string {
	return now.toISOString();
}

function insertTimelineEntry(
	content: string,
	message: string,
	now = new Date(),
): string {
	const lines = content.split("\n");
	const timelineIndex = lines.findIndex(
		(line) => line.trim() === "## Timeline",
	);

	if (timelineIndex < 0) {
		const trimmed = content.replace(/\n*$/g, "");
		return `${trimmed}${trimmed ? "\n\n" : ""}## Timeline\n\n- ${currentTimelineStamp(now)} - ${message}\n`;
	}

	let insertIndex = lines.length;
	for (let index = timelineIndex + 1; index < lines.length; index += 1) {
		if (lines[index]?.startsWith("## ")) {
			insertIndex = index;
			break;
		}
	}

	while (insertIndex > timelineIndex + 1 && lines[insertIndex - 1] === "") {
		insertIndex -= 1;
	}

	lines.splice(insertIndex, 0, `- ${currentTimelineStamp(now)} - ${message}`);
	return `${lines.join("\n").replace(/\n*$/g, "")}\n`;
}

export function newWorkstream(
	root: string,
	theme: string,
	metadata?: NewWorkstreamMetadata,
	runtime: LifecycleAuxiliaryRuntime = {},
): NewWorkstreamResult {
	return withSessionLock(root, NEW_SESSION_LOCK_SESSION, () => {
		const wbRoot = resolveProjectPaths(root).abs.wbDir;
		mkdirSync(wbRoot, { recursive: true });

		const baseSession = `${buildSessionPrefix(new Date())}_${sanitizeTheme(
			theme,
		)}`;
		const session = uniqueSessionId(wbRoot, baseSession);
		const paths = sessionPaths(root, session);
		mkdirSync(paths.sessionDir, { recursive: true });

		const metadataLines: string[] = [];
		if (metadata?.intent) {
			metadataLines.push(`- intent: ${metadata.intent}`);
		}
		if (metadata?.featureId) {
			metadataLines.push(`- feature_id: ${metadata.featureId}`);
		}
		if (metadata?.parentSpec) {
			metadataLines.push(`- parent_spec: ${metadata.parentSpec}`);
		}
		if (metadata?.continuationOf) {
			metadataLines.push(`- continuation_of: ${metadata.continuationOf}`);
		}
		if (metadata?.carryOpenTasks?.length) {
			metadataLines.push(
				`- carry_open_tasks: ${metadata.carryOpenTasks.join(",")}`,
			);
		}
		if (metadata?.noSpecRequiredReason) {
			metadataLines.push(
				`- no_spec_required_reason: ${metadata.noSpecRequiredReason}`,
			);
		}
		for (const task of explicitTaskSummaries(metadata)) {
			metadataLines.push(`- task: ${task}`);
		}
		const metadataSection =
			metadataLines.length > 0
				? ["", "## Native command metadata", ...metadataLines]
				: [];
		const taskSummaries = taskSummariesFromMetadata(metadata);
		const planTaskLines = taskSummaries.map(
			(task, index) => `- T-${twoDigits(index + 1)}: ${task}`,
		);
		const stateBoardRows = taskSummaries.map(
			(task, index) =>
				`| T-${twoDigits(index + 1)} | pending | worker | ${escapeTaskNote(task)} |`,
		);
		const taskIds = taskSummaries.map(
			(_task, index) => `T-${twoDigits(index + 1)}`,
		);
		const createdAt = new Date().toISOString();
		const planFrontmatter = buildGovernanceFrontmatter({
			docType: "workbench_plan",
			id: `${session}_plan_01`,
			session,
			theme,
			taskIds,
			createdAt,
			...(metadata ? { metadata } : {}),
		});
		const taskFrontmatter = buildGovernanceFrontmatter({
			docType: "workbench_task",
			id: `${session}_task_01`,
			session,
			theme,
			taskIds,
			createdAt,
			...(metadata ? { metadata } : {}),
		});
		if (metadata?.continuationOf) {
			planFrontmatter.continuation_of = metadata.continuationOf;
			taskFrontmatter.continuation_of = metadata.continuationOf;
		}
		if (metadata?.carryOpenTasks?.length) {
			const carryOpenTasks = [...metadata.carryOpenTasks].sort();
			planFrontmatter.carry_open_tasks = carryOpenTasks;
			taskFrontmatter.carry_open_tasks = carryOpenTasks;
		}

		atomicWriteText(
			paths.planPath,
			[
				"---",
				...Object.entries(planFrontmatter).map(([key, value]) =>
					Array.isArray(value)
						? `${key}: ${JSON.stringify(value.join(","))}`
						: typeof value === "boolean"
							? `${key}: ${value ? "true" : "false"}`
							: `${key}: ${JSON.stringify(String(value ?? ""))}`,
				),
				"---",
				"",
				`# Plan: ${theme.trim()}`,
				"",
				"- Created by native CLI workbench lifecycle.",
				...metadataSection,
				"",
				"## Execution Plan",
				"",
				...planTaskLines,
				"- Keep edits scoped to the task and repository rules.",
				"- Record evidence before marking the task done.",
				"",
				"## Validation",
				"",
				"- Run the command named in the task or governing brief.",
				"- Capture the validation result in the evidence ledger.",
				"",
				"## Closure Criteria",
				"",
				"- Every task is marked done only after passed evidence exists.",
				"- Delivery notes identify the changed files and verification result.",
				"",
			].join("\n"),
		);
		atomicWriteText(
			paths.taskPath,
			[
				"---",
				...Object.entries(taskFrontmatter).map(([key, value]) =>
					Array.isArray(value)
						? `${key}: ${JSON.stringify(value.join(","))}`
						: typeof value === "boolean"
							? `${key}: ${value ? "true" : "false"}`
							: `${key}: ${JSON.stringify(String(value ?? ""))}`,
				),
				"---",
				"",
				`# Tasks: ${theme.trim()}`,
				"",
				"## State Board",
				"",
				"| Task | State | Owner | Notes |",
				"|------|-------|-------|-------|",
				...stateBoardRows,
				"",
			].join("\n"),
		);
		atomicWriteText(
			paths.logPath,
			[
				"# Log",
				"",
				"## Timeline",
				"",
				`- ${new Date().toISOString()} - session created ${session}`,
				"",
			].join("\n"),
		);
		atomicWriteText(paths.evidencePath, "");
		mkdirSync(dirname(paths.activeSessionPath), { recursive: true });
		atomicWriteText(paths.activeSessionPath, `${session}\n`);
		const warnings: string[] = [];
		if (!runtime.deferNewSessionAuxiliary && runtime.afterActiveSessionWrite) {
			try {
				runtime.afterActiveSessionWrite(session);
			} catch {
				warnings.push(
					`session context binding failed after durable creation; run afol ss switch ${session} before using the implicit lifecycle path.`,
				);
			}
		}
		if (!runtime.deferNewSessionAuxiliary) {
			auxiliaryWarning(
				warnings,
				"workbench new event",
				() =>
					appendWorkbenchEvent(root, {
						type: "workbench.new",
						session,
						detail: { theme: theme.trim() },
					}),
				runtime,
			);
			auxiliaryWarning(
				warnings,
				"session-start telemetry",
				() =>
					appendTelemetryEvent(root, {
						event_type: "session_start",
						session_id: session,
						cmd_type: "new",
						outcome: "success",
					}),
				runtime,
			);
			auxiliaryWarning(
				warnings,
				"pending-spec registration",
				() =>
					recordPendingSpecForSession(root, {
						session,
						theme,
						taskIds,
						createdAt,
						...(metadata ? { metadata } : {}),
					}),
				runtime,
			);
			auxiliaryWarning(
				warnings,
				"local-state refresh",
				() => refreshWorkbenchLocalState(root, session),
				runtime,
			);
		}

		return {
			session,
			sessionDir: paths.sessionDir,
			planPath: paths.planPath,
			taskPath: paths.taskPath,
			logPath: paths.logPath,
			evidencePath: paths.evidencePath,
			activeSessionPath: paths.activeSessionPath,
			warnings,
		};
	});
}

export function startTask(
	root: string,
	input: WorkbenchTaskRef,
	runtime: LifecycleAuxiliaryRuntime = {},
): string[] {
	return startTasks(
		root,
		{ session: input.session, taskIds: [input.taskId] },
		runtime,
	);
}

export function startTasks(
	root: string,
	input: { session: string; taskIds: readonly string[] },
	runtime: LifecycleAuxiliaryRuntime = {},
): string[] {
	const finishMeasurement = beginHotPathMeasurement("start");
	const warnings = withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		ensureSessionOpenForMutation(root, input.session);
		const taskIds = [...new Set(input.taskIds)];
		if (taskIds.length === 0) {
			throw new Error("start requires at least one task.");
		}
		transitionTaskStateChains(
			paths.taskPath,
			taskIds.map((taskId) => ({
				taskId,
				nextStates: ["in_progress"],
			})),
		);
		const warnings: string[] = [];
		for (const taskId of taskIds) {
			auxiliaryWarning(
				warnings,
				"workbench start event",
				() =>
					appendWorkbenchEvent(root, {
						type: "workbench.start_task",
						session: input.session,
						taskId,
					}),
				runtime,
			);
		}
		return warnings;
	});
	finishMeasurement(warnings.join("\n"));
	return warnings;
}

export function transitionTask(
	root: string,
	input: WorkbenchTaskRef & {
		state: TaskState;
		completionPolicy?: CompletionPolicy;
		reason?: string;
	},
	runtime: InternalLifecycleAuxiliaryRuntime = {},
): string[] {
	if (input.state === "done") {
		throw new Error(
			"Use done to enter the done state with evidence authorization.",
		);
	}
	return withSessionLock(root, input.session, () => {
		const warnings: string[] = [];
		const paths = sessionPaths(root, input.session);
		ensureSessionOpenForMutation(root, input.session);
		const reason = input.reason
			? sanitizeEvidenceText(input.reason)
			: undefined;
		const from =
			readTaskRows(paths.taskPath).find((row) => row.taskId === input.taskId)
				?.state ?? "unknown";
		runtime.fencingCheck?.();
		transitionTaskState(
			paths.taskPath,
			input.taskId,
			input.state,
			input.completionPolicy,
			reason ? `reason=${encodeTaskReason(reason)}` : undefined,
		);
		auxiliaryWarning(
			warnings,
			"workbench transition event",
			() =>
				appendWorkbenchEvent(
					root,
					{
						type: "workbench.transition_task",
						session: input.session,
						taskId: input.taskId,
						detail: {
							from,
							to: input.state,
							...(input.completionPolicy
								? { completion_policy: input.completionPolicy }
								: {}),
							...(reason ? { reason } : {}),
						},
					},
					runtime.deferredEventRecords,
				),
			runtime,
		);
		if (!runtime.deferLocalStateRefresh) {
			auxiliaryWarning(
				warnings,
				"local-state refresh",
				() => refreshWorkbenchLocalState(root, input.session),
				runtime,
			);
		}
		return warnings;
	});
}

export function advanceTaskAfterObservedTest(
	root: string,
	input: WorkbenchTaskRef,
	runtime: InternalLifecycleAuxiliaryRuntime = {},
): string[] {
	const paths = sessionPaths(root, input.session);
	ensureSessionOpenForMutation(root, input.session);
	const state = ensureTaskExists(
		paths.taskPath,
		input.session,
		input.taskId,
	).state;
	if (state === "in_progress") {
		return [
			...transitionTask(
				root,
				{ ...input, state: "implemented_untested" },
				runtime,
			),
			...transitionTask(
				root,
				{ ...input, state: "tested_needs_spec_validation" },
				runtime,
			),
		];
	}
	if (state === "implemented_untested") {
		return transitionTask(
			root,
			{ ...input, state: "tested_needs_spec_validation" },
			runtime,
		);
	}
	if (state === "tested_needs_spec_validation" || state === "done") return [];
	throw new Error(
		`Observed test cannot advance ${input.taskId} from ${state}; start or recover the task first.`,
	);
}

function observedCompletionTransitionChain(
	state: string,
	taskId: string,
): TaskState[] {
	if (state === "in_progress") {
		return ["implemented_untested", "tested_needs_spec_validation", "done"];
	}
	if (state === "implemented_untested") {
		return ["tested_needs_spec_validation", "done"];
	}
	if (state === "tested_needs_spec_validation") return ["done"];
	if (state === "done") return [];
	throw new Error(
		`Observed test cannot advance ${taskId} from ${state}; start or recover the task first.`,
	);
}

export function recordEvidence(
	root: string,
	input: RecordEvidenceInput,
	runtime: InternalLifecycleAuxiliaryRuntime = {},
): EvidenceEntry {
	const entry = withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		if (!runtime.sessionMutationValidated) {
			ensureSessionOpenForMutation(root, input.session);
		}
		if (!existsSync(paths.sessionDir)) {
			throw new Error(`Session folder not found: ${paths.sessionDir}`);
		}
		const now = new Date();
		const sanitizedCommand = sanitizeEvidenceText(input.command);
		const sanitizedResult = sanitizeEvidenceText(input.result);
		const sanitizedNote = input.note
			? sanitizeEvidenceText(input.note)
			: undefined;
		const provenance: EvidenceProvenance = input.provenance ?? "declared";
		const taskRow = ensureTaskExists(
			paths.taskPath,
			input.session,
			input.taskId,
		);
		const taskState = taskRow.state;
		const completionPolicy = completionPolicyFromNotes(taskRow.notes);
		const evidence: EvidenceEntry = {
			id: evidenceId(now),
			task_id: input.taskId,
			created_at: now.toISOString(),
			command: sanitizedCommand,
			result: sanitizedResult,
			provenance,
			...(isTaskState(taskState ?? "")
				? { task_state: taskState as TaskState }
				: {}),
			purpose: "completion",
			authorization_type: completionPolicy,
			attempt: taskRow.attempt,
			...(input.verification
				? {
						verification_run_id: input.verification.runId,
						task_attempt: input.verification.taskAttempt,
						verification_attempt: input.verification.verificationAttempt,
						step_index: input.verification.stepIndex,
						step_count: input.verification.stepCount,
						verification_status: input.verification.status,
						duration_ms: input.verification.durationMs,
						command_digest: verificationCommandDigest(sanitizedCommand),
					}
				: {}),
		};
		if (provenance === "observed") {
			const evolution = resolveEvolutionConfig(readProjectConfig(root));
			if (evolution.configured) {
				if (!evolution.projectId)
					throw new Error(
						"configured evolution project is missing a stable project UUID",
					);
				evidence.project_id = evolution.projectId;
				evidence.session_id = input.session;
			}
		}
		if (input.exitCode !== undefined) {
			evidence.exit_code = input.exitCode;
		}
		if (input.signal) {
			evidence.signal = input.signal;
		}
		if (completionPolicy === "artifact") {
			if (!input.artifact?.trim())
				throw new Error("Artifact completion policy requires --artifact.");
			const resolved = resolveProjectPath(root, input.artifact);
			if (!resolved.ok || !existsSync(resolved.value.path)) {
				throw new Error(
					`Artifact must be an existing repo-safe file: ${input.artifact}`,
				);
			}
			const artifact = relative(root, resolved.value.path).replaceAll(
				"\\",
				"/",
			);
			const sanitizedArtifact = sanitizeEvidenceText(artifact);
			if (sanitizedArtifact !== artifact) {
				throw new Error("Artifact path contains redacted sensitive material.");
			}
			evidence.artifact = sanitizedArtifact;
			evidence.artifact_sha256 = createHash("sha256")
				.update(readFileSync(resolved.value.path))
				.digest("hex");
		} else if (input.artifact) {
			evidence.artifact = sanitizeEvidenceText(input.artifact);
		}
		if (sanitizedNote) {
			evidence.note = sanitizedNote;
		}
		if (completionPolicy === "waiver") {
			const approval = input.approvalContext;
			if (
				approval?.callerType !== "local" ||
				!approval.interactive ||
				approval.trustLevel !== "trusted"
			)
				throw new Error(
					"Waiver completion policy requires a trusted local context.",
				);
			if (!sanitizedNote?.trim())
				throw new Error(
					"Waiver completion policy requires a nonempty reason in --note.",
				);
			evidence.waiver_reason = sanitizedNote.trim();
			evidence.approved_by = "local:interactive";
		}
		runtime.fencingCheck?.();
		if (provenance === "declared") {
			const existing = loadEvidenceEntries(paths.evidencePath).find((entry) =>
				isDuplicateDeclaredEvidence(entry, evidence),
			);
			if (existing) return existing;
		}
		const evidenceFd = openSync(paths.evidencePath, "a");
		let primaryError: unknown;
		let closeError: unknown;
		try {
			writeFileSync(evidenceFd, `${JSON.stringify(evidence)}\n`, "utf8");
			fsyncSync(evidenceFd);
		} catch (error) {
			primaryError = error;
		}
		try {
			closeSync(evidenceFd);
		} catch (error) {
			closeError = error;
		}
		if (primaryError !== undefined) throw primaryError;
		if (closeError !== undefined) throw closeError;
		countHotPathOperation("workbench.canonical_write");
		const warnings: string[] = [];
		auxiliaryWarning(
			warnings,
			"workbench evidence event",
			() =>
				appendWorkbenchEvent(
					root,
					{
						type: "workbench.record_evidence",
						session: input.session,
						taskId: input.taskId,
						command: sanitizedCommand,
						result: sanitizedResult,
						detail: {
							provenance,
							evidence_id: evidence.id,
						},
					},
					runtime.deferredEventRecords,
				),
			runtime,
		);
		if (provenance === "observed" && !runtime.skipDefaultTelemetry) {
			auxiliaryWarning(
				warnings,
				"tool-exec telemetry",
				() =>
					(() => {
						countHotPathOperation("workbench.telemetry");
						return appendTelemetryEvent(
							root,
							{
								event_type: "tool_exec",
								session_id: input.session,
								task_id: input.taskId,
								cmd_type: firstToken(sanitizedCommand),
								provenance,
								outcome:
									evidenceCompletionStatus([evidence]) === "passed"
										? "success"
										: "failure",
							},
							runtime.deferredEventRecords,
						);
					})(),
				runtime,
			);
		}
		if (!runtime.deferLocalStateRefresh) {
			auxiliaryWarning(
				warnings,
				"local-state refresh",
				() => refreshWorkbenchLocalState(root, input.session),
				runtime,
			);
		}
		evidence.warnings = warnings;
		return evidence;
	});
	return entry;
}

/**
 * Append observed evidence for a terminal task without reopening or otherwise
 * mutating its lifecycle. This deliberately remains append-only: it repairs
 * the evidence ledger, never the State Board or closed-session status.
 */
export function assertClosedTaskReverificationEligible(
	root: string,
	input: Pick<RecordEvidenceInput, "session" | "taskId" | "command">,
): void {
	if (isNoopExecutionCommand(input.command)) {
		throw new Error(
			"Reverification command is a shell no-op and cannot authorize evidence.",
		);
	}
	if (!isSessionClosed(root, input.session)) {
		throw new Error(
			`Session ${input.session} is not closed; reverify is only for closed tasks.`,
		);
	}
	if (readArchivedSessionState(root, input.session).archived) {
		throw new Error(
			`Session ${input.session} is archived; restore it before reverify.`,
		);
	}
	const paths = sessionPaths(root, input.session);
	const task = ensureTaskExists(paths.taskPath, input.session, input.taskId);
	if (task.state !== "done") {
		throw new Error(
			`Task ${input.taskId} is ${task.state}; reverify only accepts closed done tasks.`,
		);
	}
}

export function recordClosedTaskReverification(
	root: string,
	input: RecordEvidenceInput,
): EvidenceEntry {
	return withSessionLock(root, input.session, () => {
		assertClosedTaskReverificationEligible(root, input);
		return recordEvidence(
			root,
			{ ...input, provenance: "observed" },
			{
				sessionMutationValidated: true,
			},
		);
	});
}

export function appendTimelineEntry(
	root: string,
	session: string,
	message: string,
): TimelineEntryResult {
	return withSessionLock(root, session, () => {
		const paths = sessionPaths(root, session);
		ensureSessionOpenForMutation(root, session);
		if (!existsSync(paths.sessionDir)) {
			throw new Error(`Session folder not found: ${paths.sessionDir}`);
		}
		if (!existsSync(paths.logPath)) {
			throw new Error(`Log file not found: ${paths.logPath}`);
		}
		const trimmed = message.trim();
		if (!trimmed) {
			throw new Error("Timeline message cannot be empty.");
		}
		const current = readFileSync(paths.logPath, "utf8");
		atomicWriteText(paths.logPath, insertTimelineEntry(current, trimmed));
		appendWorkbenchEvent(root, {
			type: "workbench.append_log",
			session,
			command: trimmed,
		});
		refreshWorkbenchLocalState(root, session);
		return { logPath: paths.logPath, message: trimmed };
	});
}

export type VerificationRunRuntime = InternalLifecycleAuxiliaryRuntime & {
	fencingCheck: () => void;
};

export class VerificationRunConflictError extends Error {
	readonly code = "stale_conflict";

	constructor(message: string) {
		super(message);
		this.name = "VerificationRunConflictError";
	}
}

export type PreparedVerificationRun =
	| { kind: "new"; run: VerificationRunStartRecord }
	| { kind: "recovered"; completion: VerificationRunCompletion };

export type VerificationRunCompletion = {
	runId: string;
	evidenceIds: string[];
	done: DoneTaskResult;
	warnings: string[];
};

export function taskAttemptSnapshot(
	root: string,
	input: WorkbenchTaskRef,
): number {
	return withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		ensureSessionOpenForMutation(root, input.session);
		return ensureTaskExists(paths.taskPath, input.session, input.taskId)
			.attempt;
	});
}

function finalizeRecoveredRun(
	root: string,
	input: WorkbenchTaskRef,
	run: VerificationRunStartRecord,
	runtime: VerificationRunRuntime,
): VerificationRunCompletion {
	const records = readVerificationRunLedger(root, input.session);
	const paths = sessionPaths(root, input.session);
	const task = ensureTaskExists(paths.taskPath, input.session, input.taskId);
	const existingTerminal = terminalForRun(records, run.verification_run_id);
	if (task.attempt !== run.task_attempt) {
		throw new VerificationRunConflictError(
			`Task ${input.taskId} attempt changed before verification finalization.`,
		);
	}
	if (
		task.state !== "in_progress" &&
		task.state !== "implemented_untested" &&
		task.state !== "tested_needs_spec_validation" &&
		!(task.state === "done" && existingTerminal?.status === "passed")
	) {
		throw new VerificationRunConflictError(
			`Task ${input.taskId} became ineligible before verification finalization: ${task.state}.`,
		);
	}
	if (!runHasCompletePassedSteps(records, run)) {
		throw new Error(
			`Verification run is incomplete: ${run.verification_run_id}`,
		);
	}
	const steps = stepsForRun(records, run.verification_run_id);
	const evidenceIds = steps.map((step) => step.evidence_id);
	const authorizingEvidenceId = evidenceIds.at(-1);
	if (!authorizingEvidenceId) {
		throw new Error(
			`Verification run has no evidence: ${run.verification_run_id}`,
		);
	}
	appendVerificationRunTerminal(
		root,
		input.session,
		{
			record_type: "terminal",
			verification_run_id: run.verification_run_id,
			task_id: input.taskId,
			task_attempt: run.task_attempt,
			verification_attempt: run.verification_attempt,
			status: "passed",
			evidence_ids: evidenceIds,
			evidence_count: evidenceIds.length,
			authorizing_evidence_id: authorizingEvidenceId,
			created_at: new Date().toISOString(),
		},
		runtime.fencingCheck,
	);
	const deferredEventRecords: Record<string, unknown>[] = [];
	const done = doneTask(
		root,
		{ ...input, verificationRunId: run.verification_run_id },
		{
			...runtime,
			deferLocalStateRefresh: true,
			deferredEventRecords,
			completeObservedTransitionChain: true,
		},
	);
	const warnings = [...(done.warnings ?? [])];
	auxiliaryWarning(
		warnings,
		"local-state refresh",
		() => refreshWorkbenchLocalState(root, input.session, deferredEventRecords),
		runtime,
	);
	return { runId: run.verification_run_id, evidenceIds, done, warnings };
}

export function prepareVerificationRun(
	root: string,
	input: WorkbenchTaskRef & {
		taskAttemptSnapshot: number;
		commands: string[];
	},
	runtime: VerificationRunRuntime,
): PreparedVerificationRun {
	return withSessionLock(root, input.session, () => {
		runtime.fencingCheck();
		const paths = sessionPaths(root, input.session);
		ensureSessionOpenForMutation(root, input.session);
		const task = ensureTaskExists(paths.taskPath, input.session, input.taskId);
		if (task.attempt !== input.taskAttemptSnapshot) {
			throw new VerificationRunConflictError(
				`Task ${input.taskId} attempt changed before verification started.`,
			);
		}
		if (
			task.state !== "in_progress" &&
			task.state !== "implemented_untested" &&
			task.state !== "tested_needs_spec_validation" &&
			task.state !== "done"
		) {
			throw new VerificationRunConflictError(
				`Task ${input.taskId} is not eligible for verification from ${task.state}.`,
			);
		}

		let records = readVerificationRunLedger(root, input.session);
		const latest = latestRunForTask(records, input.taskId);
		if (latest && latest.task_attempt !== task.attempt) {
			reconcileVerificationEvidenceOrphans(
				root,
				input.session,
				latest,
				runtime.fencingCheck,
			);
			records = readVerificationRunLedger(root, input.session);
			if (!terminalForRun(records, latest.verification_run_id)) {
				const steps = stepsForRun(records, latest.verification_run_id);
				appendVerificationRunTerminal(
					root,
					input.session,
					{
						record_type: "terminal",
						verification_run_id: latest.verification_run_id,
						task_id: input.taskId,
						task_attempt: latest.task_attempt,
						verification_attempt: latest.verification_attempt,
						status: "superseded",
						evidence_ids: steps.map((step) => step.evidence_id),
						evidence_count: steps.length,
						created_at: new Date().toISOString(),
					},
					runtime.fencingCheck,
				);
			}
		} else if (latest) {
			reconcileVerificationEvidenceOrphans(
				root,
				input.session,
				latest,
				runtime.fencingCheck,
			);
			records = readVerificationRunLedger(root, input.session);
			const terminal = terminalForRun(records, latest.verification_run_id);
			if (
				terminal?.status === "passed" &&
				runHasCompletePassedSteps(records, latest)
			) {
				return {
					kind: "recovered",
					completion: finalizeRecoveredRun(root, input, latest, runtime),
				};
			}
			if (!terminal) {
				if (runHasCompletePassedSteps(records, latest)) {
					return {
						kind: "recovered",
						completion: finalizeRecoveredRun(root, input, latest, runtime),
					};
				}
				const steps = stepsForRun(records, latest.verification_run_id);
				appendVerificationRunTerminal(
					root,
					input.session,
					{
						record_type: "terminal",
						verification_run_id: latest.verification_run_id,
						task_id: input.taskId,
						task_attempt: latest.task_attempt,
						verification_attempt: latest.verification_attempt,
						status: "superseded",
						evidence_ids: steps.map((step) => step.evidence_id),
						evidence_count: steps.length,
						created_at: new Date().toISOString(),
					},
					runtime.fencingCheck,
				);
			}
		}
		if (task.state === "done") {
			throw new VerificationRunConflictError(
				`Task ${input.taskId} is already done and has no recoverable verification run.`,
			);
		}

		records = readVerificationRunLedger(root, input.session);
		const run: VerificationRunStartRecord = {
			record_type: "start",
			verification_run_id: `VR-${randomUUID()}`,
			task_id: input.taskId,
			task_attempt: task.attempt,
			verification_attempt: nextVerificationAttempt(records, input.taskId),
			step_count: input.commands.length,
			commands: input.commands.map((command, index) => ({
				step_index: index + 1,
				command_digest: verificationCommandDigest(
					sanitizeEvidenceCommand(command),
				),
			})),
			created_at: new Date().toISOString(),
		};
		appendVerificationRunStart(root, input.session, run, runtime.fencingCheck);
		return { kind: "new", run };
	});
}

export function recordVerificationRunStep(
	root: string,
	input: WorkbenchTaskRef & {
		run: VerificationRunStartRecord;
		stepIndex: number;
		command: string;
		status: VerificationRunStatus;
		exitCode: number;
		durationMs: number;
		signal?: string;
		artifact?: string;
		note?: string;
	},
	runtime: VerificationRunRuntime,
): EvidenceEntry {
	return withSessionLock(root, input.session, () => {
		runtime.fencingCheck();
		const paths = sessionPaths(root, input.session);
		ensureSessionOpenForMutation(root, input.session);
		const task = ensureTaskExists(paths.taskPath, input.session, input.taskId);
		if (task.attempt !== input.run.task_attempt) {
			throw new VerificationRunConflictError(
				`Task ${input.taskId} attempt changed during verification.`,
			);
		}
		if (
			task.state !== "in_progress" &&
			task.state !== "implemented_untested" &&
			task.state !== "tested_needs_spec_validation"
		) {
			throw new VerificationRunConflictError(
				`Task ${input.taskId} became ineligible during verification: ${task.state}.`,
			);
		}
		const records = readVerificationRunLedger(root, input.session);
		const latest = latestRunForTask(records, input.taskId);
		if (
			latest?.verification_run_id !== input.run.verification_run_id ||
			latest.task_attempt !== input.run.task_attempt ||
			latest.verification_attempt !== input.run.verification_attempt
		) {
			throw new VerificationRunConflictError(
				`Verification run is no longer current for ${input.taskId}.`,
			);
		}
		if (terminalForRun(records, input.run.verification_run_id)) {
			throw new VerificationRunConflictError(
				`Verification run is already terminal: ${input.run.verification_run_id}`,
			);
		}
		const sanitizedCommand = sanitizeEvidenceCommand(input.command);
		const commandDigest = verificationCommandDigest(sanitizedCommand);
		if (
			input.run.commands[input.stepIndex - 1]?.command_digest !== commandDigest
		) {
			throw new Error(
				`Verification command changed for step ${input.stepIndex}/${input.run.step_count}.`,
			);
		}
		const deferredEventRecords: Record<string, unknown>[] = [];
		const evidence = recordEvidence(
			root,
			{
				session: input.session,
				taskId: input.taskId,
				command: sanitizedCommand,
				result: input.status === "passed" ? "passed" : "failed",
				exitCode: input.exitCode,
				...(input.signal ? { signal: input.signal } : {}),
				provenance: "observed",
				verification: {
					runId: input.run.verification_run_id,
					taskAttempt: input.run.task_attempt,
					verificationAttempt: input.run.verification_attempt,
					stepIndex: input.stepIndex,
					stepCount: input.run.step_count,
					status: input.status,
					durationMs: input.durationMs,
				},
				...(input.artifact ? { artifact: input.artifact } : {}),
				...(input.note ? { note: input.note } : {}),
			},
			{
				...runtime,
				deferLocalStateRefresh: true,
				deferredEventRecords,
				sessionMutationValidated: true,
			},
		);
		appendVerificationRunStep(
			root,
			input.session,
			{
				record_type: "step",
				verification_run_id: input.run.verification_run_id,
				task_id: input.taskId,
				task_attempt: input.run.task_attempt,
				verification_attempt: input.run.verification_attempt,
				step_index: input.stepIndex,
				step_count: input.run.step_count,
				command_digest: commandDigest,
				evidence_id: evidence.id,
				status: input.status,
				exit_code: input.exitCode,
				...(input.signal ? { signal: input.signal } : {}),
				duration_ms: input.durationMs,
				created_at: new Date().toISOString(),
			},
			runtime.fencingCheck,
		);
		const warnings = evidence.warnings ?? [];
		if (deferredEventRecords.length > 0) {
			auxiliaryWarning(
				warnings,
				"event ledger batch",
				() => appendEventLedgerRecords(root, deferredEventRecords),
				runtime,
			);
		}
		evidence.warnings = warnings;
		return evidence;
	});
}

export function failVerificationRun(
	root: string,
	input: WorkbenchTaskRef & {
		run: VerificationRunStartRecord;
		terminalStatus?: "failed" | "interrupted";
	},
	runtime: VerificationRunRuntime,
): { evidenceIds: string[]; warnings: string[] } {
	return withSessionLock(root, input.session, () => {
		runtime.fencingCheck();
		reconcileVerificationEvidenceOrphans(
			root,
			input.session,
			input.run,
			runtime.fencingCheck,
		);
		const records = readVerificationRunLedger(root, input.session);
		const steps = stepsForRun(records, input.run.verification_run_id);
		const failed = steps.find((step) => step.status !== "passed");
		appendVerificationRunTerminal(
			root,
			input.session,
			{
				record_type: "terminal",
				verification_run_id: input.run.verification_run_id,
				task_id: input.taskId,
				task_attempt: input.run.task_attempt,
				verification_attempt: input.run.verification_attempt,
				status: input.terminalStatus ?? "failed",
				evidence_ids: steps.map((step) => step.evidence_id),
				evidence_count: steps.length,
				...(failed ? { failed_step: failed.step_index } : {}),
				created_at: new Date().toISOString(),
			},
			runtime.fencingCheck,
		);
		const warnings: string[] = [];
		auxiliaryWarning(
			warnings,
			"local-state refresh",
			() => refreshWorkbenchLocalState(root, input.session),
			runtime,
		);
		return {
			evidenceIds: steps.map((step) => step.evidence_id),
			warnings,
		};
	});
}

export function completeVerificationRun(
	root: string,
	input: WorkbenchTaskRef & { run: VerificationRunStartRecord },
	runtime: VerificationRunRuntime,
): VerificationRunCompletion {
	return withSessionLock(root, input.session, () => {
		runtime.fencingCheck();
		return finalizeRecoveredRun(root, input, input.run, runtime);
	});
}

export type DoneTaskResult = {
	authorizingEvidenceId: string;
	warnings?: string[];
};

export function doneTask(
	root: string,
	input: WorkbenchTaskRef & { verificationRunId?: string },
	runtime: InternalLifecycleAuxiliaryRuntime = {},
): DoneTaskResult {
	return withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		if (!runtime.sessionMutationValidated) {
			ensureSessionOpenForMutation(root, input.session);
		}
		const allEntries = (
			runtime.authorizingEvidence
				? [runtime.authorizingEvidence]
				: loadEvidenceEntries(paths.evidencePath)
		).filter((entry) => entry.task_id === input.taskId);
		const evidenceSnapshot = runtime.authorizingEvidence;
		const canReuseEvidenceSnapshot =
			evidenceSnapshot?.task_id === input.taskId &&
			isTaskState(evidenceSnapshot.task_state ?? "") &&
			typeof evidenceSnapshot.attempt === "number" &&
			evidenceSnapshot.authorization_type !== undefined;
		const taskRow = canReuseEvidenceSnapshot
			? null
			: ensureTaskExists(paths.taskPath, input.session, input.taskId);
		const taskState = canReuseEvidenceSnapshot
			? (evidenceSnapshot.task_state as TaskState)
			: (taskRow?.state ?? "unknown");
		const taskAttempt = canReuseEvidenceSnapshot
			? (evidenceSnapshot.attempt as number)
			: (taskRow?.attempt ?? 0);
		const completionPolicy = canReuseEvidenceSnapshot
			? (evidenceSnapshot.authorization_type as CompletionPolicy)
			: completionPolicyFromNotes(taskRow?.notes ?? "");
		const entries = allEntries.filter(
			(entry) => (entry.attempt ?? 0) === taskAttempt,
		);
		const authorization = evidenceCompletionAuthorization(
			entries,
			completionPolicy,
		);
		if (authorization.status !== "passed" || !authorization.evidenceId) {
			if (allEntries.length > entries.length) {
				throw new Error(
					`Task ${input.taskId} requires evidence recorded after the latest problem/restart transition.`,
				);
			}
			throw new Error(
				`Task ${input.taskId} requires passed evidence; authorization must be observed with exit_code 0.`,
			);
		}
		const authorizingEntry = entries.find(
			(entry) => entry.id === authorization.evidenceId,
		);
		if (authorizingEntry?.verification_run_id) {
			if (
				input.verificationRunId &&
				input.verificationRunId !== authorizingEntry.verification_run_id
			) {
				throw new Error(
					`Authorizing evidence belongs to a different verification run: ${authorizingEntry.verification_run_id}`,
				);
			}
			if (
				!verificationRunAuthorizes(
					root,
					input.session,
					input.taskId,
					taskAttempt,
					authorization.evidenceId,
					authorizingEntry.verification_run_id,
				)
			) {
				throw new Error(
					`Task ${input.taskId} requires a complete matching verification run.`,
				);
			}
		}
		if (
			completionPolicy === "artifact" &&
			authorizingEntry?.artifact &&
			authorizingEntry.artifact_sha256
		) {
			const resolved = resolveProjectPath(root, authorizingEntry.artifact);
			if (!resolved.ok || !existsSync(resolved.value.path))
				throw new Error(
					`Authorizing artifact is missing: ${authorizingEntry.artifact}`,
				);
			const currentHash = createHash("sha256")
				.update(readFileSync(resolved.value.path))
				.digest("hex");
			if (currentHash !== authorizingEntry.artifact_sha256)
				throw new Error(
					`Authorizing artifact changed after evidence: ${authorizingEntry.artifact}`,
				);
		}
		if (taskState === "done") {
			return { authorizingEvidenceId: authorization.evidenceId };
		}
		const completionTransitions = runtime.completeObservedTransitionChain
			? observedCompletionTransitionChain(taskState, input.taskId)
			: (["done"] as const);
		runtime.fencingCheck?.();
		transitionTaskStateChain(
			paths.taskPath,
			input.taskId,
			completionTransitions,
		);
		const warnings: string[] = [];
		if (runtime.completeObservedTransitionChain) {
			let from = taskState;
			for (const to of completionTransitions.slice(0, -1)) {
				auxiliaryWarning(
					warnings,
					"workbench transition event",
					() =>
						appendWorkbenchEvent(
							root,
							{
								type: "workbench.transition_task",
								session: input.session,
								taskId: input.taskId,
								detail: { from, to },
							},
							runtime.deferredEventRecords,
						),
					runtime,
				);
				from = to;
			}
		}
		auxiliaryWarning(
			warnings,
			"workbench done event",
			() =>
				appendWorkbenchEvent(
					root,
					{
						type: "workbench.mark_done",
						session: input.session,
						taskId: input.taskId,
					},
					runtime.deferredEventRecords,
				),
			runtime,
		);
		return {
			authorizingEvidenceId: authorization.evidenceId,
			...(warnings.length > 0 ? { warnings } : {}),
		};
	});
}

export type CompleteObservedTaskInput = Omit<
	RecordEvidenceInput,
	"result" | "provenance" | "exitCode"
> & { exitCode: number; taskAttemptSnapshot?: number };

export type CompleteObservedTaskResult = {
	evidence: EvidenceEntry;
	done?: DoneTaskResult;
	warnings: string[];
};

export type CompleteObservedTasksInput = Omit<
	CompleteObservedTaskInput,
	"taskId"
> & {
	taskIds: readonly string[];
	taskAttemptSnapshots?: Readonly<Record<string, number>>;
};

export type CompleteObservedTasksResult = {
	evidence: EvidenceEntry[];
	done: DoneTaskResult[];
	warnings: string[];
};

function assertObservedBatchTaskRows(
	root: string,
	session: string,
	taskIds: readonly string[],
	expectedAttempts?: Readonly<Record<string, number>>,
): Record<string, number> {
	ensureSessionOpenForMutation(root, session);
	const paths = sessionPaths(root, session);
	const rows = readTaskRows(paths.taskPath);
	const attempts: Record<string, number> = {};
	for (const taskId of taskIds) {
		const row = rows.find((entry) => entry.taskId === taskId);
		if (!row) {
			throw new Error(`Task ${taskId} not found in ${session}.`);
		}
		observedCompletionTransitionChain(row.state, taskId);
		if (completionPolicyFromNotes(row.notes) !== "execution") {
			throw new Error(
				`Batch done supports execution-policy tasks only: ${taskId}.`,
			);
		}
		if (expectedAttempts && row.attempt !== expectedAttempts[taskId]) {
			throw new Error(
				`Task ${taskId} attempt changed during shared verification.`,
			);
		}
		attempts[taskId] = row.attempt;
	}
	return attempts;
}

function assertObservedBatchTaskAttempts(
	root: string,
	session: string,
	taskIds: readonly string[],
	expectedAttempts: Readonly<Record<string, number>>,
): void {
	const rows = readTaskRows(sessionPaths(root, session).taskPath);
	for (const taskId of taskIds) {
		const row = rows.find((entry) => entry.taskId === taskId);
		if (!row) {
			throw new Error(`Task ${taskId} not found in ${session}.`);
		}
		if (row.attempt !== expectedAttempts[taskId]) {
			throw new Error(
				`Task ${taskId} attempt changed during shared verification.`,
			);
		}
	}
}

export function assertObservedBatchTasksReady(
	root: string,
	input: { session: string; taskIds: readonly string[] },
): Record<string, number> {
	return withSessionLock(root, input.session, () => {
		return assertObservedBatchTaskRows(root, input.session, input.taskIds);
	});
}

/** Complete an observed test and task under one lock without derived refreshes. */
export function completeObservedTask(
	root: string,
	input: CompleteObservedTaskInput,
	runtime: LifecycleAuxiliaryRuntime = {},
): CompleteObservedTaskResult {
	return withSessionLock(root, input.session, () => {
		ensureSessionOpenForMutation(root, input.session);
		if (input.taskAttemptSnapshot !== undefined) {
			const task = ensureTaskExists(
				sessionPaths(root, input.session).taskPath,
				input.session,
				input.taskId,
			);
			if (task.attempt !== input.taskAttemptSnapshot) {
				throw new VerificationRunConflictError(
					`Task ${input.taskId} attempt changed during verification.`,
				);
			}
		}
		const warnings: string[] = [];
		const deferredEventRecords: Record<string, unknown>[] = [];
		const evidence = recordEvidence(
			root,
			{
				...input,
				result: input.exitCode === 0 ? "passed" : "failed",
				provenance: "observed",
			},
			{
				...runtime,
				deferLocalStateRefresh: true,
				skipDefaultTelemetry: true,
				deferredEventRecords,
				sessionMutationValidated: true,
			},
		);
		warnings.push(...(evidence.warnings ?? []));
		if (input.exitCode !== 0) {
			commitDeferredEventRecordsWithWarning(
				warnings,
				root,
				deferredEventRecords,
				runtime,
			);
			return { evidence, warnings };
		}
		const done = doneTask(root, input, {
			...runtime,
			deferLocalStateRefresh: true,
			deferredEventRecords,
			completeObservedTransitionChain: true,
			sessionMutationValidated: true,
			authorizingEvidence: evidence,
		});
		warnings.push(...(done.warnings ?? []));
		commitDeferredEventRecordsWithWarning(
			warnings,
			root,
			deferredEventRecords,
			runtime,
		);
		return { done, evidence, warnings };
	});
}

/** Apply one observed verification result to multiple tasks under one lock. */
export function completeObservedTasks(
	root: string,
	input: CompleteObservedTasksInput,
	runtime: LifecycleAuxiliaryRuntime = {},
): CompleteObservedTasksResult {
	return withSessionLock(root, input.session, () => {
		ensureSessionOpenForMutation(root, input.session);
		const taskIds = [...new Set(input.taskIds)];
		if (taskIds.length < 2) {
			throw new Error("Batch completion requires at least two tasks.");
		}
		runtime.fencingCheck?.();
		if (input.taskAttemptSnapshots) {
			assertObservedBatchTaskAttempts(
				root,
				input.session,
				taskIds,
				input.taskAttemptSnapshots,
			);
		}
		if (input.exitCode === 0) {
			assertObservedBatchTaskRows(
				root,
				input.session,
				taskIds,
				input.taskAttemptSnapshots,
			);
		}

		const evidence: EvidenceEntry[] = [];
		const done: DoneTaskResult[] = [];
		const warnings: string[] = [];
		const deferredEventRecords: Record<string, unknown>[] = [];
		const { fencingCheck: _fencingCheck, ...commitRuntime } = runtime;
		const paths = sessionPaths(root, input.session);
		const originalTask = readFileSync(paths.taskPath, "utf8");
		const hadEvidence = existsSync(paths.evidencePath);
		const originalEvidence = hadEvidence
			? readFileSync(paths.evidencePath, "utf8")
			: "";
		try {
			// Persist every observed result before any State Board transition so a
			// partial batch can never mark a task done without its evidence.
			for (const taskId of taskIds) {
				const entry = recordEvidence(
					root,
					{
						...input,
						taskId,
						result: input.exitCode === 0 ? "passed" : "failed",
						provenance: "observed",
					},
					{
						...commitRuntime,
						deferLocalStateRefresh: true,
						skipDefaultTelemetry: true,
						deferredEventRecords,
						sessionMutationValidated: true,
					},
				);
				evidence.push(entry);
				warnings.push(...(entry.warnings ?? []));
			}
			if (input.exitCode === 0) {
				for (const taskId of taskIds) {
					const entry = evidence.find(
						(candidate) => candidate.task_id === taskId,
					);
					if (!entry) {
						throw new Error(`Observed batch evidence missing for ${taskId}.`);
					}
					const completion = doneTask(
						root,
						{ session: input.session, taskId },
						{
							...commitRuntime,
							deferLocalStateRefresh: true,
							deferredEventRecords,
							completeObservedTransitionChain: true,
							sessionMutationValidated: true,
							authorizingEvidence: entry,
						},
					);
					done.push(completion);
					warnings.push(...(completion.warnings ?? []));
				}
			}
		} catch (error) {
			atomicWriteText(paths.taskPath, originalTask);
			if (hadEvidence) {
				atomicWriteText(paths.evidencePath, originalEvidence);
			} else if (existsSync(paths.evidencePath)) {
				unlinkSync(paths.evidencePath);
			}
			throw error;
		}
		commitDeferredEventRecordsWithWarning(
			warnings,
			root,
			deferredEventRecords,
			runtime,
		);
		return {
			evidence,
			done,
			warnings: [...new Set(warnings)],
		};
	});
}

export function closeSession(
	root: string,
	session: string,
	options: CloseSessionOptions = {},
	runtime: LifecycleAuxiliaryRuntime = {},
): CloseSessionResult {
	const finishMeasurement = beginHotPathMeasurement("close");
	const result = withSessionLock(root, session, () => {
		const paths = sessionPaths(root, session);
		if (!existsSync(paths.sessionDir)) {
			throw new Error(`Session folder not found: ${session}`);
		}
		const state = readTaskLifecycleState(paths.taskPath, session);
		let closeEventRecorded: boolean;
		if (state.kind === "closed") {
			markPlanMetadataClosed(paths.planPath, session, state.closedAt);
		}
		if (state.kind === "open") {
			assertValidEventLedger(root);
			closeEventRecorded = false;
		} else {
			closeEventRecorded = closeDiagnosticState(root, session);
		}
		const reportPath = join(paths.sessionDir, `${session}_report_01.md`);
		const reportRelativePath = relative(root, reportPath).replaceAll("\\", "/");
		let reportStatus: CloseSessionReport["status"] = existsSync(reportPath)
			? "existing"
			: "missing";
		let summarySource: CloseSessionReport["summary_source"] = "state";
		let summary = options.summary?.trim() ?? "";
		let taskRows = readTaskRows(paths.taskPath);
		const originalTask = readFileSync(paths.taskPath, "utf8");
		const originalPlan = existsSync(paths.planPath)
			? readFileSync(paths.planPath, "utf8")
			: undefined;
		const originalActiveSession = existsSync(paths.activeSessionPath)
			? readFileSync(paths.activeSessionPath, "utf8")
			: undefined;
		const hadLog = existsSync(paths.logPath);
		const originalLog = hadLog
			? readFileSync(paths.logPath, "utf8")
			: "# Log\n";
		const logSummary = readLogSummary(originalLog);
		let continuation: NewWorkstreamResult | undefined;
		let recoveredContinuation: string | undefined;
		let continuationTheme = "";
		const rollbackContinuation = () => {
			if (!continuation) return;
			try {
				options.onContinuationRollback?.();
			} catch {
				// The original close failure remains the actionable error.
			}
			atomicWriteText(paths.taskPath, originalTask);
			rmSync(continuation.sessionDir, { recursive: true, force: true });
			if (originalActiveSession !== undefined) {
				atomicWriteText(paths.activeSessionPath, originalActiveSession);
			} else if (existsSync(paths.activeSessionPath)) {
				unlinkSync(paths.activeSessionPath);
			}
			try {
				refreshWorkbenchLocalState(root);
			} catch {
				// The original close failure remains the actionable error.
			}
			continuation = undefined;
		};
		const checklistCloseWarnings: string[] = [];
		if (state.kind === "open") {
			const blockingRows = taskRows.filter((row) =>
				BLOCKING_STATES.has(row.state),
			);
			if (blockingRows.length > 0) {
				if (options.carryOpen) {
					const reason = options.reason?.trim();
					if (!reason)
						throw new Error("Missing --reason for close carry-open.");
					const carryReason = sanitizeCarryOpenReason(reason);
					if (!carryReason)
						throw new Error("Missing --reason for close carry-open.");
					const carry = carryOpenMetadata(
						session,
						state.document,
						blockingRows,
						carryReason,
					);
					continuation = newWorkstream(root, carry.theme, carry.metadata, {
						deferNewSessionAuxiliary: true,
					});
					const continuationSession = continuation.session;
					continuationTheme = carry.theme;
					try {
						options.onContinuationCreated?.(continuationSession);
						transitionTaskStateChains(
							paths.taskPath,
							blockingRows.map((row) => ({
								taskId: row.taskId,
								nextStates: carryOpenTransitionChain(row.state),
								notesSuffix: `destination=${continuationSession} reason=${carryReason}`,
							})),
						);
						taskRows = readTaskRows(paths.taskPath);
					} catch (error) {
						rollbackContinuation();
						throw error;
					}
				} else {
					const labels = blockingRows
						.map((row) => `${row.taskId}:${row.state}`)
						.join(", ");
					throw new Error(`Session ${session} has blocking tasks: ${labels}`);
				}
			} else if (options.carryOpen) {
				recoveredContinuation =
					carriedContinuationSession(root, state.document, taskRows) ??
					undefined;
				if (!recoveredContinuation) {
					throw new Error(`Session ${session} has no open tasks to carry.`);
				}
			}
			const verification = verifyWorkbenchTasks(paths.sessionDir, true);
			if (options.admitLegacyBaseline) {
				const baseline = validLegacyEvidenceBaseline(root);
				verification.issues = verification.issues.filter(
					(issue) =>
						!admitsLegacyEvidenceIssue(
							baseline,
							paths.sessionDir,
							issue,
							false,
						),
				);
				verification.allCompleted =
					verification.openTasks.length === 0 &&
					!verification.issues.some(isBlockingVerifyIssue);
			}
			if (options.admitTransitionAdmission) {
				verification.issues = verification.issues.filter(
					(issue) =>
						!admitsEvidenceTransitionIssue(
							root,
							paths.sessionDir,
							issue,
							verification.openTasks.length > 0,
						),
				);
				verification.allCompleted =
					verification.openTasks.length === 0 &&
					!verification.issues.some(isBlockingVerifyIssue);
			}
			pushChecklistCloseWarnings(checklistCloseWarnings, verification);
			if (!verification.allCompleted) {
				const message =
					verification.issues.map((issue) => issue.message).join("; ") ||
					"strict verification failed";
				rollbackContinuation();
				throw new Error(
					`Session ${session} failed strict verification: ${message}`,
				);
			}
			if (reportStatus === "missing") {
				if (!options.allowNoReport) {
					reportStatus = "created";
				} else {
					reportStatus = "waived";
				}
				if (options.allowNoReport && !options.reason?.trim()) {
					throw new Error(
						"Missing --reason for close allow-no-report override.",
					);
				}
			}
			let reportEvidence: EvidenceEntry[] | undefined;
			const getReportEvidence = () => {
				reportEvidence ??= loadEvidenceEntries(paths.evidencePath);
				return reportEvidence;
			};
			if (summary) {
				summarySource = "flag";
			} else if (reportStatus === "waived") {
				summary = `Report waived: ${options.reason?.trim()}`;
				summarySource = "waiver";
			} else if (logSummary) {
				summary = logSummary;
				summarySource = "log";
			} else {
				summary = factualCloseSummary(taskRows, getReportEvidence());
				summarySource = "state";
			}
			const summaryText = closeMarkdownText(summary);
			const reportSummary =
				summarySource === "flag" || summarySource === "log"
					? `declared: ${summaryText}`
					: summaryText;
			const nextLog = canonicalizeLogSummary(originalLog, summaryText);
			const reportWasPresent = existsSync(reportPath);
			let reportCreated = false;
			let logWritten = false;
			try {
				if (reportStatus === "created") {
					atomicWriteText(
						reportPath,
						renderCloseReport(
							session,
							taskRows,
							getReportEvidence(),
							reportSummary,
						),
						{ syncDirectory: false },
					);
					countHotPathOperation("workbench.canonical_write");
					reportCreated = !reportWasPresent;
				}
				if (nextLog !== originalLog) {
					atomicWriteText(paths.logPath, nextLog, {
						syncDirectory: false,
					});
					countHotPathOperation("workbench.canonical_write");
					logWritten = true;
				}
				const closedAt = new Date().toISOString();
				markTaskMetadataClosed(paths.taskPath, session, closedAt);
				markPlanMetadataClosed(paths.planPath, session, closedAt);
			} catch (error) {
				atomicWriteText(paths.taskPath, originalTask);
				if (originalPlan !== undefined) {
					atomicWriteText(paths.planPath, originalPlan);
				}
				if (reportCreated) {
					unlinkSync(reportPath);
				}
				if (logWritten) {
					if (hadLog) {
						atomicWriteText(paths.logPath, originalLog);
					} else if (existsSync(paths.logPath)) {
						unlinkSync(paths.logPath);
					}
				}
				rollbackContinuation();
				throw error;
			}
		} else {
			// An omitted close event can be recovered after an interrupted auxiliary
			// write, but only if the durable close is strictly terminally coherent.
			if (!closeEventRecorded) {
				const verification = verifyWorkbenchTasks(paths.sessionDir, true);
				if (options.admitTransitionAdmission) {
					verification.issues = verification.issues.filter(
						(issue) =>
							!admitsEvidenceTransitionIssue(
								root,
								paths.sessionDir,
								issue,
								verification.openTasks.length > 0,
							),
					);
					verification.allCompleted =
						verification.openTasks.length === 0 &&
						!verification.issues.some(isBlockingVerifyIssue);
				}
				pushChecklistCloseWarnings(checklistCloseWarnings, verification);
				if (!verification.allCompleted) {
					const message =
						verification.issues.map((issue) => issue.message).join("; ") ||
						"strict verification failed";
					throw new Error(
						`Session ${session} has incoherent durable close state: ${message}`,
					);
				}
			}
			if (!summary) {
				if (logSummary?.startsWith("Report waived:")) {
					if (reportStatus === "missing") {
						reportStatus = "waived";
					}
					summarySource = "waiver";
				} else if (logSummary) {
					summarySource = "log";
				} else if (reportStatus === "existing") {
					summarySource = "state";
				}
			}
		}

		const warnings =
			reportStatus === "waived" || reportStatus === "missing"
				? evaluateCloseWarnings(session, paths.sessionDir)
				: [];
		warnings.push(...checklistCloseWarnings);
		if (continuation) {
			const continuationSession = continuation.session;
			auxiliaryWarning(
				warnings,
				"workbench new event",
				() =>
					appendWorkbenchEvent(root, {
						type: "workbench.new",
						session: continuationSession,
						detail: { theme: continuationTheme },
					}),
				runtime,
			);
			auxiliaryWarning(
				warnings,
				"session-start telemetry",
				() =>
					appendTelemetryEvent(root, {
						event_type: "session_start",
						session_id: continuationSession,
						cmd_type: "new",
						outcome: "success",
					}),
				runtime,
			);
			auxiliaryWarning(
				warnings,
				"continuation local-state refresh",
				() => refreshWorkbenchLocalState(root, continuationSession),
				runtime,
			);
		}

		const deferredEventRecords: Record<string, unknown>[] = [];
		for (const [alreadyRecorded, writeDiagnostic] of [
			[
				closeEventRecorded,
				() =>
					appendWorkbenchEvent(
						root,
						{ type: "workbench.close", session },
						deferredEventRecords,
					),
			],
		] as const) {
			if (alreadyRecorded) {
				continue;
			}
			try {
				writeDiagnostic();
			} catch {
				warnings.push(
					"close diagnostic preparation failed after the durable close commit; the durable task metadata remains authoritative.",
				);
			}
		}
		commitDeferredEventRecordsWithWarning(
			warnings,
			root,
			deferredEventRecords,
			runtime,
		);
		if (existsSync(paths.activeSessionPath)) {
			try {
				const active = readFileSync(paths.activeSessionPath, "utf8").trim();
				if (active === session) {
					unlinkSync(paths.activeSessionPath);
				}
			} catch {
				warnings.push(
					`active session cleanup failed after the durable close commit; rerun close for ${session}.`,
				);
			}
		}

		if (state.kind === "open") {
			warnings.push(...observeCompletedSession(root, session, runtime));
		}
		auxiliaryWarning(
			warnings,
			"local-state refresh",
			() => refreshWorkbenchLocalState(root, session),
			runtime,
		);
		const result = warnings as CloseSessionResult;
		result.report = {
			status: reportStatus,
			path:
				reportStatus === "waived" || reportStatus === "missing"
					? null
					: reportRelativePath,
			summary_source: summarySource,
		};
		if (continuation) result.continuation = continuation.session;
		else if (recoveredContinuation) result.continuation = recoveredContinuation;
		return result;
	});
	finishMeasurement(result.join("\n"));
	return result;
}
