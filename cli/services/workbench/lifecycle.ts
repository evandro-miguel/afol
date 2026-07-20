import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { OperationContext } from "../../core/operation-context";
import { appendTelemetryEvent, firstToken } from "../events/telemetry";
import { resolveEvolutionConfig } from "../evolution";
import {
	buildGovernanceFrontmatter,
	recordPendingSpecForSession,
} from "../governance/pending-specs";
import { atomicWriteText } from "../io/atomic";
import { withSessionLock } from "../io/session-lock";
import { rebuildFilesIndex } from "../local-state/project-indexes";
import { appendWorkbenchEvent } from "../local-state/workbench-events";
import { rebuildWorkBenchIndex } from "../local-state/workbench-index";
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import { resolveProjectPath } from "../project/root";
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
	verifyWorkbenchTasks,
} from "./verify";

const TASK_ROW_RE =
	/^\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|$/;
const BLOCKING_STATES = new Set([
	"pending",
	"in_progress",
	"implemented_untested",
	"tested_needs_spec_validation",
	"problem",
]);
const SESSION_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
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

export type EvidenceProvenance = "declared" | "observed";

export type EvidenceEntry = {
	id: string;
	task_id: string;
	project_id?: string;
	session_id?: string;
	created_at: string;
	command: string;
	result: string;
	provenance?: EvidenceProvenance;
	exit_code?: number;
	signal?: string;
	artifact?: string;
	note?: string;
	task_state?: TaskState;
	purpose?: "completion";
	authorization_type?: CompletionPolicy;
	artifact_sha256?: string;
	waiver_reason?: string;
	approved_by?: string;
	attempt?: number;
	verification_run_id?: string;
	task_attempt?: number;
	verification_attempt?: number;
	step_index?: number;
	step_count?: number;
	verification_status?: VerificationRunStatus;
	duration_ms?: number;
	command_digest?: string;
	warnings?: string[];
};

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

function sensitiveAssignmentKey(key: string): boolean {
	const normalized = key.toUpperCase();
	return [...SENSITIVE_COMMAND_KEYS].some(
		(classifier) =>
			normalized === classifier || normalized.endsWith(`_${classifier}`),
	);
}

function sensitiveLongOption(option: string): boolean {
	const normalized = option.slice(2).replaceAll("-", "_").toUpperCase();
	return SENSITIVE_COMMAND_KEYS.has(normalized);
}

/** Redact credential-shaped values while preserving command spelling. */
export function sanitizeEvidenceCommand(command: string): string {
	let sanitized = command.replace(
		/(^|\s)([A-Za-z_][A-Za-z0-9_]*)(=)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]*)/g,
		(match, prefix: string, key: string) =>
			sensitiveAssignmentKey(key) ? `${prefix}${key}=[REDACTED]` : match,
	);
	sanitized = sanitized.replace(
		/(^|\s)(--[A-Za-z0-9-]+)(=|\s+)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+)/g,
		(match, prefix: string, option: string, separator: string) =>
			sensitiveLongOption(option)
				? `${prefix}${option}${separator}[REDACTED]`
				: match,
	);
	sanitized = sanitized.replace(
		/(\bAuthorization\s*:\s*(?:Bearer|Basic)\s+)[^\s"']+/gi,
		"$1[REDACTED]",
	);
	sanitized = sanitized.replace(
		/([A-Za-z][A-Za-z0-9+.-]*:\/\/[^:\s/@]+:)([^@\s/]+)(@)/g,
		"$1[REDACTED]$3",
	);
	return sanitized;
}

export type NewWorkstreamMetadata = {
	intent?: string;
	featureId?: string;
	parentSpec?: string;
	noSpecRequiredReason?: string;
	task?: string;
	tasks?: string[];
};

export type CloseSessionOptions = {
	allowNoReport?: boolean;
	reason?: string;
	summary?: string;
};

export type CloseSessionReport = {
	status: "created" | "existing" | "waived" | "missing";
	path: string | null;
	summary_source: "flag" | "log" | "state" | "waiver";
};

export type CloseSessionResult = string[] & {
	report: CloseSessionReport;
};

export type LifecycleAuxiliaryRuntime = {
	beforeAuxiliary?: (label: string) => void;
	fencingCheck?: () => void;
};

type InternalLifecycleAuxiliaryRuntime = LifecycleAuxiliaryRuntime & {
	deferLocalStateRefresh?: boolean;
};

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

export type TaskState =
	| "pending"
	| "in_progress"
	| "implemented_untested"
	| "tested_needs_spec_validation"
	| "problem"
	| "done"
	| "moved";

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

function resolveSafeSessionPath(root: string, session: string): string {
	const normalized = session.trim();
	if (
		!SESSION_NAME_RE.test(normalized) ||
		normalized.includes("..") ||
		normalized.length === 0
	) {
		throw new Error(`Invalid session identifier: ${session}`);
	}

	const projectPaths = resolveProjectPaths(root);
	const result = resolveProjectPath(root, join(projectPaths.wbDir, normalized));
	if (!result.ok) {
		throw new Error(result.error);
	}
	return result.value.path;
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
	const lines = [
		`# Report: ${session}`,
		"",
		"## Summary",
		closeMarkdownText(summary),
		"",
		"## Tasks",
		...taskRows.map(
			(row) =>
				`- ${row.taskId}: ${row.state}${row.notes ? ` — ${closeMarkdownText(row.notes)}` : ""}`,
		),
		"",
		"## Evidence",
		...evidence.map(
			(entry) =>
				`- ${entry.task_id}: ${closeMarkdownText(entry.result)} (${closeMarkdownText(entry.command)}; exit_code=${entry.exit_code ?? "n/a"})`,
		),
	];
	return `${lines.join("\n").replace(/\n+$/g, "")}\n`;
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

export function sessionPaths(
	root: string,
	session: string,
): {
	wbRoot: string;
	sessionDir: string;
	planPath: string;
	taskPath: string;
	logPath: string;
	evidencePath: string;
	activeSessionPath: string;
} {
	const projectPaths = resolveProjectPaths(root);
	const wbRoot = projectPaths.abs.wbDir;
	const sessionDir = resolveSafeSessionPath(root, session);
	return {
		wbRoot,
		sessionDir,
		planPath: join(sessionDir, `${session}_plan_01.md`),
		taskPath: join(sessionDir, `${session}_task_01.md`),
		logPath: join(sessionDir, `${session}_log_01.md`),
		evidencePath: join(sessionDir, ".evidence.jsonl"),
		activeSessionPath: projectPaths.abs.activeSessionFile,
	};
}

function refreshWorkbenchLocalState(root: string, session?: string): void {
	rebuildWorkBenchIndex(root, session);
	rebuildFilesIndex(root);
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
	const match = line.trim().match(TASK_ROW_RE);
	if (!match?.[1] || !match[2]) {
		return null;
	}
	const notes = (match[4] ?? "").trim();
	const attemptMatch = notes.match(/(?:^|\s)attempt=(\d+)(?=\s|$)/);
	return {
		line,
		taskId: match[1],
		state: match[2].trim(),
		owner: (match[3] ?? "").trim(),
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

type TaskDocument =
	| { kind: "legacy"; content: string }
	| {
			kind: "frontmatter";
			lines: string[];
			newline: "\n" | "\r\n";
			suffix: string;
	  };

type TaskLifecycleState =
	| { kind: "open"; document: TaskDocument }
	| { kind: "closed"; closedAt: string; document: TaskDocument };

function parseTaskDocument(content: string, taskPath: string): TaskDocument {
	const opening = content.match(/^---(\r?\n)/);
	if (!opening?.[1]) {
		return { kind: "legacy", content };
	}
	const newline = opening[1] as "\n" | "\r\n";
	const frontmatterStart = opening[0].length;
	const closingMarker = `${newline}---`;
	let closingStart = content.indexOf(closingMarker, frontmatterStart);
	while (closingStart >= 0) {
		const closingEnd = closingStart + closingMarker.length;
		if (
			closingEnd === content.length ||
			content.startsWith(newline, closingEnd)
		) {
			return {
				kind: "frontmatter",
				lines: content.slice(frontmatterStart, closingStart).split(/\r?\n/),
				newline,
				suffix: content.slice(closingEnd),
			};
		}
		closingStart = content.indexOf(closingMarker, closingStart + 1);
	}
	throw new Error(`Task file has malformed canonical frontmatter: ${taskPath}`);
}

function scalarValue(line: string, key: string): string | null | undefined {
	const match = line.match(new RegExp(`^\\s*${key}\\s*:\\s*(.*?)\\s*$`));
	if (!match) {
		return undefined;
	}
	const value = match[1] ?? "";
	if (!value || value === "null" || value === "~") {
		return null;
	}
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1) || null;
	}
	return value;
}

function taskFrontmatterValue(
	document: TaskDocument,
	key: string,
	taskPath: string,
): string | null {
	if (document.kind === "legacy") {
		return null;
	}
	const values = document.lines
		.map((line) => scalarValue(line, key))
		.filter((value) => value !== undefined);
	if (values.length > 1) {
		throw new Error(`Task file has duplicate ${key} frontmatter: ${taskPath}`);
	}
	return values[0] ?? null;
}

function isCanonicalIsoTimestamp(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
		return false;
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return false;
	}
	const rendered = parsed.toISOString();
	return rendered === value || rendered.replace(/\.000Z$/, "Z") === value;
}

function readTaskLifecycleState(
	taskPath: string,
	session: string,
): TaskLifecycleState {
	const document = parseTaskDocument(readFileSync(taskPath, "utf8"), taskPath);
	if (document.kind === "legacy") {
		return { kind: "open", document };
	}
	const docType = taskFrontmatterValue(document, "doc_type", taskPath);
	const id = taskFrontmatterValue(document, "id", taskPath);
	const sessionId = taskFrontmatterValue(document, "session_id", taskPath);
	const status = taskFrontmatterValue(
		document,
		"status",
		taskPath,
	)?.toLowerCase();
	const updatedAt = taskFrontmatterValue(document, "updated_at", taskPath);
	const closedAt = taskFrontmatterValue(document, "closed_at", taskPath);
	const expectedId = `${session}_task_01`;

	if (docType && docType !== "workbench_task" && docType !== "task") {
		throw new Error(
			`Session ${session} has corrupt lifecycle metadata: expected a workbench task document.`,
		);
	}
	if (id && id !== expectedId) {
		throw new Error(
			`Session ${session} has corrupt lifecycle metadata: task id does not match the session.`,
		);
	}
	if (sessionId && sessionId !== session) {
		throw new Error(
			`Session ${session} has corrupt lifecycle metadata: session_id does not match the session.`,
		);
	}

	if (status !== "closed" && closedAt === null) {
		return { kind: "open", document };
	}
	if (
		docType !== "workbench_task" ||
		id !== expectedId ||
		sessionId !== session ||
		status !== "closed" ||
		closedAt === null ||
		updatedAt === null ||
		!isCanonicalIsoTimestamp(closedAt) ||
		!isCanonicalIsoTimestamp(updatedAt) ||
		new Date(updatedAt).getTime() < new Date(closedAt).getTime()
	) {
		throw new Error(
			`Session ${session} has corrupt lifecycle metadata: status, closed_at, and updated_at must form one canonical close record with updated_at at or after closed_at. Repair the task frontmatter before continuing.`,
		);
	}
	return { kind: "closed", closedAt, document };
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
}

export type SessionLifecycleState = "open" | "closed" | "corrupt";

export function sessionLifecycleState(
	root: string,
	session: string,
): SessionLifecycleState {
	const paths = sessionPaths(root, session);
	if (!existsSync(paths.taskPath)) {
		return "corrupt";
	}
	const state = readTaskLifecycleState(paths.taskPath, session);
	return state.kind === "closed" ? "closed" : "open";
}

/** Compatibility predicate. New callers should use sessionLifecycleState. */
export function isSessionClosed(root: string, session: string): boolean {
	return sessionLifecycleState(root, session) === "closed";
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

function closeDiagnosticState(
	root: string,
	session: string,
): { workbench: boolean; telemetry: boolean } {
	const eventPath = resolveProjectPaths(root).abs.eventsFile;
	if (!existsSync(eventPath)) {
		return { workbench: false, telemetry: false };
	}
	let workbench = false;
	let telemetry = false;
	let lines: string[];
	try {
		lines = readFileSync(eventPath, "utf8").split(/\r?\n/);
	} catch {
		return { workbench: false, telemetry: false };
	}
	for (const line of lines) {
		if (!line.trim()) {
			continue;
		}
		try {
			const event = JSON.parse(line) as Record<string, unknown>;
			workbench ||=
				event.type === "workbench.close" && event.session === session;
			telemetry ||=
				event.event_type === "session_end" && event.session_id === session;
		} catch {
			// Malformed diagnostic lines are handled by validation, not close recovery.
		}
	}
	return { workbench, telemetry };
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
): void {
	const lines = readFileSync(taskPath, "utf8").split("\n");
	let changed = false;
	const nextLines = lines.map((line) => {
		const row = parseTaskRow(line);
		if (!row || row.taskId !== taskId) {
			return line;
		}
		if (!isTaskState(row.state)) {
			throw new Error(`Task ${taskId} has invalid state: ${row.state}.`);
		}
		if (!TASK_STATE_TRANSITIONS[row.state].includes(nextState)) {
			throw new Error(
				`Invalid task transition for ${taskId}: ${row.state} -> ${nextState}.`,
			);
		}
		changed = true;
		const nextAttempt =
			nextState === "in_progress" || nextState === "problem"
				? row.attempt + 1
				: row.attempt;
		const baseNotes = row.notes
			.replace(/(?:^|\s)attempt=\d+(?=\s|$)/g, " ")
			.trim();
		const policyNotes = completionPolicy
			? [
					baseNotes
						.replace(
							/(?:^|\s)completion_policy=(?:execution|artifact|waiver)(?=\s|$)/g,
							" ",
						)
						.trim(),
					`completion_policy=${completionPolicy}`,
				]
					.filter(Boolean)
					.join(" ")
			: baseNotes;
		const notes = [policyNotes, `attempt=${nextAttempt}`]
			.filter(Boolean)
			.join(" ");
		return renderTaskRow({
			...row,
			state: nextState,
			notes,
			attempt: nextAttempt,
		});
	});
	if (!changed) {
		throw new Error(`Task ${taskId} not found in ${taskPath}`);
	}
	atomicWriteText(taskPath, `${nextLines.join("\n").replace(/\n*$/g, "")}\n`);
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

function loadEvidenceEntries(evidencePath: string): EvidenceEntry[] {
	if (!existsSync(evidencePath)) {
		return [];
	}
	const rows = readFileSync(evidencePath, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const entries: EvidenceEntry[] = [];
	for (const [index, row] of rows.entries()) {
		try {
			const parsed = JSON.parse(row) as Partial<EvidenceEntry> & {
				taskId?: unknown;
				createdAt?: unknown;
			};
			const taskId =
				typeof parsed.task_id === "string" ? parsed.task_id : parsed.taskId;
			const createdAt =
				typeof parsed.created_at === "string"
					? parsed.created_at
					: parsed.createdAt;
			if (
				typeof parsed.id === "string" &&
				typeof taskId === "string" &&
				typeof createdAt === "string" &&
				typeof parsed.command === "string" &&
				typeof parsed.result === "string"
			) {
				const entry: EvidenceEntry = {
					id: parsed.id,
					task_id: taskId,
					created_at: createdAt,
					command: parsed.command,
					result: parsed.result,
				};
				if (typeof parsed.exit_code === "number") {
					entry.exit_code = parsed.exit_code;
				}
				if (typeof parsed.signal === "string") {
					entry.signal = parsed.signal;
				}
				if (typeof parsed.artifact === "string") {
					entry.artifact = parsed.artifact;
				}
				if (typeof parsed.note === "string") {
					entry.note = parsed.note;
				}
				if (
					parsed.authorization_type === "execution" ||
					parsed.authorization_type === "artifact" ||
					parsed.authorization_type === "waiver"
				)
					entry.authorization_type = parsed.authorization_type;
				if (typeof parsed.artifact_sha256 === "string")
					entry.artifact_sha256 = parsed.artifact_sha256;
				if (typeof parsed.waiver_reason === "string")
					entry.waiver_reason = parsed.waiver_reason;
				if (typeof parsed.approved_by === "string")
					entry.approved_by = parsed.approved_by;
				if (
					typeof parsed.attempt === "number" &&
					Number.isSafeInteger(parsed.attempt) &&
					parsed.attempt >= 0
				)
					entry.attempt = parsed.attempt;
				if (
					parsed.provenance === "declared" ||
					parsed.provenance === "observed"
				) {
					entry.provenance = parsed.provenance;
				}
				if (
					parsed.task_state === "pending" ||
					parsed.task_state === "in_progress" ||
					parsed.task_state === "done"
				) {
					entry.task_state = parsed.task_state;
				}
				if (parsed.purpose === "completion") entry.purpose = parsed.purpose;
				if (typeof parsed.verification_run_id === "string")
					entry.verification_run_id = parsed.verification_run_id;
				for (const key of [
					"task_attempt",
					"verification_attempt",
					"step_index",
					"step_count",
					"duration_ms",
				] as const) {
					const value = parsed[key];
					if (
						typeof value === "number" &&
						Number.isSafeInteger(value) &&
						value >= 0
					) {
						entry[key] = value;
					}
				}
				if (
					parsed.verification_status === "passed" ||
					parsed.verification_status === "failed" ||
					parsed.verification_status === "timed_out" ||
					parsed.verification_status === "output_limit" ||
					parsed.verification_status === "signaled" ||
					parsed.verification_status === "spawn_failed" ||
					parsed.verification_status === "lock_lost" ||
					parsed.verification_status === "superseded"
				) {
					entry.verification_status = parsed.verification_status;
				}
				if (typeof parsed.command_digest === "string")
					entry.command_digest = parsed.command_digest;
				if (
					Array.isArray(parsed.warnings) &&
					parsed.warnings.every((warning) => typeof warning === "string")
				) {
					entry.warnings = parsed.warnings;
				}
				entries.push(entry);
			}
		} catch (error) {
			throw new Error(
				`Malformed evidence ledger ${evidencePath}:${index + 1}: ${(error as Error).message}`,
			);
		}
	}
	return entries;
}

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
		auxiliaryWarning(
			warnings,
			"workbench new event",
			() =>
				appendWorkbenchEvent(root, {
					type: "workbench.new",
					session,
					detail: {
						theme: theme.trim(),
					},
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
	return withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		ensureSessionOpenForMutation(root, input.session);
		transitionTaskState(paths.taskPath, input.taskId, "in_progress");
		const warnings: string[] = [];
		auxiliaryWarning(
			warnings,
			"workbench start event",
			() =>
				appendWorkbenchEvent(root, {
					type: "workbench.start_task",
					session: input.session,
					taskId: input.taskId,
				}),
			runtime,
		);
		auxiliaryWarning(
			warnings,
			"task-start telemetry",
			() =>
				appendTelemetryEvent(root, {
					event_type: "task_start",
					session_id: input.session,
					task_id: input.taskId,
					cmd_type: "start",
					outcome: "success",
				}),
			runtime,
		);
		auxiliaryWarning(
			warnings,
			"local-state refresh",
			() => refreshWorkbenchLocalState(root, input.session),
			runtime,
		);
		return warnings;
	});
}

export function transitionTask(
	root: string,
	input: WorkbenchTaskRef & {
		state: TaskState;
		completionPolicy?: CompletionPolicy;
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
		const from =
			readTaskRows(paths.taskPath).find((row) => row.taskId === input.taskId)
				?.state ?? "unknown";
		runtime.fencingCheck?.();
		transitionTaskState(
			paths.taskPath,
			input.taskId,
			input.state,
			input.completionPolicy,
		);
		auxiliaryWarning(
			warnings,
			"workbench transition event",
			() =>
				appendWorkbenchEvent(root, {
					type: "workbench.transition_task",
					session: input.session,
					taskId: input.taskId,
					detail: {
						from,
						to: input.state,
						...(input.completionPolicy
							? { completion_policy: input.completionPolicy }
							: {}),
					},
				}),
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

export function recordEvidence(
	root: string,
	input: RecordEvidenceInput,
	runtime: InternalLifecycleAuxiliaryRuntime = {},
): EvidenceEntry {
	const entry = withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		ensureSessionOpenForMutation(root, input.session);
		if (!existsSync(paths.sessionDir)) {
			throw new Error(`Session folder not found: ${paths.sessionDir}`);
		}
		ensureTaskExists(paths.taskPath, input.session, input.taskId);
		const now = new Date();
		const sanitizedCommand = sanitizeEvidenceCommand(input.command);
		const provenance: EvidenceProvenance = input.provenance ?? "declared";
		const taskState = readTaskRows(paths.taskPath).find(
			(row) => row.taskId === input.taskId,
		)?.state;
		const taskRow = ensureTaskExists(
			paths.taskPath,
			input.session,
			input.taskId,
		);
		const completionPolicy = completionPolicyFromNotes(taskRow.notes);
		const evidence: EvidenceEntry = {
			id: evidenceId(now),
			task_id: input.taskId,
			created_at: now.toISOString(),
			command: sanitizedCommand,
			result: input.result,
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
			evidence.artifact = relative(root, resolved.value.path).replaceAll(
				"\\",
				"/",
			);
			evidence.artifact_sha256 = createHash("sha256")
				.update(readFileSync(resolved.value.path))
				.digest("hex");
		} else if (input.artifact) {
			evidence.artifact = input.artifact;
		}
		if (input.note) {
			evidence.note = input.note;
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
			if (!input.note?.trim())
				throw new Error(
					"Waiver completion policy requires a nonempty reason in --note.",
				);
			evidence.waiver_reason = input.note.trim();
			evidence.approved_by = "local:interactive";
		}
		runtime.fencingCheck?.();
		if (input.verification) {
			const evidenceFd = openSync(paths.evidencePath, "a");
			try {
				writeFileSync(evidenceFd, `${JSON.stringify(evidence)}\n`, "utf8");
				fsyncSync(evidenceFd);
			} finally {
				closeSync(evidenceFd);
			}
		} else {
			writeFileSync(paths.evidencePath, `${JSON.stringify(evidence)}\n`, {
				encoding: "utf8",
				flag: "a",
			});
		}
		const warnings: string[] = [];
		auxiliaryWarning(
			warnings,
			"workbench evidence event",
			() =>
				appendWorkbenchEvent(root, {
					type: "workbench.record_evidence",
					session: input.session,
					taskId: input.taskId,
					command: sanitizedCommand,
					result: input.result,
					detail: {
						provenance,
						evidence_id: evidence.id,
					},
				}),
			runtime,
		);
		if (provenance === "observed") {
			auxiliaryWarning(
				warnings,
				"tool-exec telemetry",
				() =>
					appendTelemetryEvent(root, {
						event_type: "tool_exec",
						session_id: input.session,
						task_id: input.taskId,
						cmd_type: firstToken(sanitizedCommand),
						provenance,
						outcome:
							evidenceCompletionStatus([evidence]) === "passed"
								? "success"
								: "failure",
					}),
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
	const warnings = advanceTaskAfterObservedTest(root, input, {
		...runtime,
		deferLocalStateRefresh: true,
	});
	const done = doneTask(
		root,
		{ ...input, verificationRunId: run.verification_run_id },
		{ ...runtime, deferLocalStateRefresh: true },
	);
	warnings.push(...(done.warnings ?? []));
	auxiliaryWarning(
		warnings,
		"local-state refresh",
		() => refreshWorkbenchLocalState(root, input.session),
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
			{ ...runtime, deferLocalStateRefresh: true },
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
		ensureSessionOpenForMutation(root, input.session);
		const allEntries = loadEvidenceEntries(paths.evidencePath).filter(
			(entry) => entry.task_id === input.taskId,
		);
		const taskRow = ensureTaskExists(
			paths.taskPath,
			input.session,
			input.taskId,
		);
		const completionPolicy = completionPolicyFromNotes(taskRow.notes);
		const entries = allEntries.filter(
			(entry) => (entry.attempt ?? 0) === taskRow.attempt,
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
					taskRow.attempt,
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
		if (taskRow.state === "done") {
			return { authorizingEvidenceId: authorization.evidenceId };
		}
		runtime.fencingCheck?.();
		transitionTaskState(paths.taskPath, input.taskId, "done");
		const warnings: string[] = [];
		auxiliaryWarning(
			warnings,
			"workbench done event",
			() =>
				appendWorkbenchEvent(root, {
					type: "workbench.mark_done",
					session: input.session,
					taskId: input.taskId,
				}),
			runtime,
		);
		auxiliaryWarning(
			warnings,
			"task-complete telemetry",
			() =>
				appendTelemetryEvent(root, {
					event_type: "task_complete",
					session_id: input.session,
					task_id: input.taskId,
					cmd_type: "done",
					outcome: "success",
				}),
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
		return {
			authorizingEvidenceId: authorization.evidenceId,
			...(warnings.length > 0 ? { warnings } : {}),
		};
	});
}

export type CompleteObservedTaskInput = Omit<
	RecordEvidenceInput,
	"result" | "provenance" | "exitCode"
> & { exitCode: number };

export type CompleteObservedTaskResult = {
	evidence: EvidenceEntry;
	done?: DoneTaskResult;
	warnings: string[];
};

/** Complete an observed test and task under one lock with one state refresh. */
export function completeObservedTask(
	root: string,
	input: CompleteObservedTaskInput,
	runtime: LifecycleAuxiliaryRuntime = {},
): CompleteObservedTaskResult {
	return withSessionLock(root, input.session, () => {
		let evidenceWritten = false;
		let result: CompleteObservedTaskResult | undefined;
		const warnings: string[] = [];
		try {
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
				},
			);
			evidenceWritten = true;
			warnings.push(...(evidence.warnings ?? []));
			if (input.exitCode === 0) {
				warnings.push(
					...advanceTaskAfterObservedTest(root, input, {
						...runtime,
						deferLocalStateRefresh: true,
					}),
				);
				const done = doneTask(root, input, {
					...runtime,
					deferLocalStateRefresh: true,
				});
				warnings.push(...(done.warnings ?? []));
				result = { done, evidence, warnings };
			} else {
				result = { evidence, warnings };
			}
		} finally {
			if (evidenceWritten) {
				auxiliaryWarning(
					warnings,
					"local-state refresh",
					() => refreshWorkbenchLocalState(root, input.session),
					runtime,
				);
			}
		}
		if (!result) {
			throw new Error("Observed task completion did not record evidence.");
		}
		return { ...result, warnings };
	});
}

export function closeSession(
	root: string,
	session: string,
	options: CloseSessionOptions = {},
): CloseSessionResult {
	return withSessionLock(root, session, () => {
		const paths = sessionPaths(root, session);
		if (!existsSync(paths.sessionDir)) {
			throw new Error(`Session folder not found: ${session}`);
		}
		const state = readTaskLifecycleState(paths.taskPath, session);
		const reportPath = join(paths.sessionDir, `${session}_report_01.md`);
		const reportRelativePath = relative(root, reportPath).replaceAll("\\", "/");
		let reportStatus: CloseSessionReport["status"] = existsSync(reportPath)
			? "existing"
			: "missing";
		let summarySource: CloseSessionReport["summary_source"] = "state";
		let summary = options.summary?.trim() ?? "";
		const taskRows = readTaskRows(paths.taskPath);
		const hadLog = existsSync(paths.logPath);
		const originalLog = hadLog
			? readFileSync(paths.logPath, "utf8")
			: "# Log\n";
		const logSummary = readLogSummary(originalLog);
		if (state.kind === "open") {
			const blockingRows = taskRows.filter((row) =>
				BLOCKING_STATES.has(row.state),
			);
			if (blockingRows.length > 0) {
				const labels = blockingRows
					.map((row) => `${row.taskId}:${row.state}`)
					.join(", ");
				throw new Error(`Session ${session} has blocking tasks: ${labels}`);
			}
			const verification = verifyWorkbenchTasks(paths.sessionDir, true);
			if (!verification.allCompleted) {
				const message =
					verification.issues.map((issue) => issue.message).join("; ") ||
					"strict verification failed";
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
			if (summary) {
				summarySource = "flag";
			} else if (reportStatus === "waived") {
				summary = `Report waived: ${options.reason?.trim()}`;
				summarySource = "waiver";
			} else if (logSummary) {
				summary = logSummary;
				summarySource = "log";
			} else {
				summary = `Strict verification passed for ${taskRows.length} task${taskRows.length === 1 ? "" : "s"}.`;
				summarySource = "state";
			}
			const summaryText = closeMarkdownText(summary);
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
							loadEvidenceEntries(paths.evidencePath),
							summaryText,
						),
					);
					reportCreated = !reportWasPresent;
				}
				if (nextLog !== originalLog) {
					atomicWriteText(paths.logPath, nextLog);
					logWritten = true;
				}
				markTaskMetadataClosed(
					paths.taskPath,
					session,
					new Date().toISOString(),
				);
			} catch (error) {
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
				throw error;
			}
		} else if (!summary) {
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

		const warnings =
			reportStatus === "waived" || reportStatus === "missing"
				? evaluateCloseWarnings(session, paths.sessionDir)
				: [];

		const diagnostics = closeDiagnosticState(root, session);
		for (const [alreadyRecorded, label, writeDiagnostic] of [
			[
				diagnostics.workbench,
				"workbench close event",
				() => appendWorkbenchEvent(root, { type: "workbench.close", session }),
			],
			[
				diagnostics.telemetry,
				"session-end telemetry",
				() =>
					appendTelemetryEvent(root, {
						event_type: "session_end",
						session_id: session,
						cmd_type: "close",
						outcome: "success",
					}),
			],
		] as const) {
			if (alreadyRecorded) {
				continue;
			}
			try {
				writeDiagnostic();
			} catch {
				warnings.push(
					`${label} failed after the durable close commit; the durable task metadata remains authoritative.`,
				);
			}
		}

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

		try {
			refreshWorkbenchLocalState(root, session);
		} catch {
			warnings.push(
				"local-state refresh failed after the durable close commit; run afol local-state rebuild.",
			);
		}
		const result = warnings as CloseSessionResult;
		result.report = {
			status: reportStatus,
			path:
				reportStatus === "waived" || reportStatus === "missing"
					? null
					: reportRelativePath,
			summary_source: summarySource,
		};
		return result;
	});
}
