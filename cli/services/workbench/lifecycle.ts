import { randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { appendTelemetryEvent, firstToken } from "../events/telemetry";
import { atomicWriteText } from "../io/atomic";
import { withSessionLock } from "../io/session-lock";
import { rebuildFilesIndex } from "../local-state/project-indexes";
import { appendWorkbenchEvent } from "../local-state/workbench-events";
import { rebuildWorkBenchIndex } from "../local-state/workbench-index";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectPath } from "../project/root";
import { evidenceResultIsSuccess, verifyWorkbenchTasks } from "./verify";

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
	artifact?: string;
	note?: string;
};

export type EvidenceEntry = {
	id: string;
	task_id: string;
	created_at: string;
	command: string;
	result: string;
	exit_code?: number;
	artifact?: string;
	note?: string;
};

export type NewWorkstreamMetadata = {
	intent?: string;
	featureId?: string;
	parentSpec?: string;
	task?: string;
	tasks?: string[];
};

export type CloseSessionOptions = {
	allowNoReport?: boolean;
	reason?: string;
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
};

type TaskRow = {
	line: string;
	taskId: string;
	state: string;
	owner: string;
	notes: string;
};

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
		const paths = sessionPaths(root, session);
		if (!existsSync(paths.sessionDir)) {
			throw new Error(`Session folder not found: ${paths.sessionDir}`);
		}
		const row = ensureTaskExists(paths.taskPath, session, taskId);
		if (row.state !== "in_progress") {
			throw new Error(`Task ${taskId} is ${row.state}, expected in_progress.`);
		}
	});
}

function parseTaskRow(line: string): TaskRow | null {
	const match = line.trim().match(TASK_ROW_RE);
	if (!match?.[1] || !match[2]) {
		return null;
	}
	return {
		line,
		taskId: match[1],
		state: match[2].trim(),
		owner: (match[3] ?? "").trim(),
		notes: (match[4] ?? "").trim(),
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

export function isSessionClosed(root: string, session: string): boolean {
	const paths = sessionPaths(root, session);
	if (!existsSync(paths.taskPath)) {
		return true;
	}
	const rows = readTaskRows(paths.taskPath);
	if (rows.length === 0) {
		return false;
	}
	return rows.every((row) => !BLOCKING_STATES.has(row.state));
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

function updateTaskState(
	taskPath: string,
	taskId: string,
	state: string,
): void {
	const lines = readFileSync(taskPath, "utf8").split("\n");
	let changed = false;
	const nextLines = lines.map((line) => {
		const row = parseTaskRow(line);
		if (!row || row.taskId !== taskId) {
			return line;
		}
		changed = true;
		return renderTaskRow({ ...row, state });
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
				if (typeof parsed.artifact === "string") {
					entry.artifact = parsed.artifact;
				}
				if (typeof parsed.note === "string") {
					entry.note = parsed.note;
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

		atomicWriteText(
			paths.planPath,
			[
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
		appendWorkbenchEvent(root, {
			type: "workbench.new",
			session,
			detail: {
				theme: theme.trim(),
			},
		});
		appendTelemetryEvent(root, {
			event_type: "session_start",
			session_id: session,
			cmd_type: "new",
			outcome: "success",
		});
		refreshWorkbenchLocalState(root, session);

		return {
			session,
			sessionDir: paths.sessionDir,
			planPath: paths.planPath,
			taskPath: paths.taskPath,
			logPath: paths.logPath,
			evidencePath: paths.evidencePath,
			activeSessionPath: paths.activeSessionPath,
		};
	});
}

export function startTask(root: string, input: WorkbenchTaskRef): void {
	withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		updateTaskState(paths.taskPath, input.taskId, "in_progress");
		appendWorkbenchEvent(root, {
			type: "workbench.start_task",
			session: input.session,
			taskId: input.taskId,
		});
		appendTelemetryEvent(root, {
			event_type: "task_start",
			session_id: input.session,
			task_id: input.taskId,
			cmd_type: "start",
			outcome: "success",
		});
		refreshWorkbenchLocalState(root, input.session);
	});
}

export function recordEvidence(
	root: string,
	input: RecordEvidenceInput,
): EvidenceEntry {
	const entry = withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		if (!existsSync(paths.sessionDir)) {
			throw new Error(`Session folder not found: ${paths.sessionDir}`);
		}
		ensureTaskExists(paths.taskPath, input.session, input.taskId);
		const now = new Date();
		const evidence: EvidenceEntry = {
			id: evidenceId(now),
			task_id: input.taskId,
			created_at: now.toISOString(),
			command: input.command,
			result: input.result,
		};
		if (input.exitCode !== undefined) {
			evidence.exit_code = input.exitCode;
		}
		if (input.artifact) {
			evidence.artifact = input.artifact;
		}
		if (input.note) {
			evidence.note = input.note;
		}
		writeFileSync(paths.evidencePath, `${JSON.stringify(evidence)}\n`, {
			encoding: "utf8",
			flag: "a",
		});
		appendWorkbenchEvent(root, {
			type: "workbench.record_evidence",
			session: input.session,
			taskId: input.taskId,
			command: input.command,
			result: input.result,
		});
		appendTelemetryEvent(root, {
			event_type: "tool_exec",
			session_id: input.session,
			task_id: input.taskId,
			cmd_type: firstToken(input.command),
			outcome: evidenceResultIsSuccess(input.result) ? "success" : "failure",
		});
		refreshWorkbenchLocalState(root, input.session);
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

export function doneTask(root: string, input: WorkbenchTaskRef): void {
	withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		const hasSuccessEvidence = loadEvidenceEntries(paths.evidencePath).some(
			(entry) =>
				entry.task_id === input.taskId && evidenceResultIsSuccess(entry.result),
		);
		if (!hasSuccessEvidence) {
			throw new Error(
				`Task ${input.taskId} requires passed evidence before done.`,
			);
		}
		updateTaskState(paths.taskPath, input.taskId, "done");
		appendWorkbenchEvent(root, {
			type: "workbench.mark_done",
			session: input.session,
			taskId: input.taskId,
		});
		appendTelemetryEvent(root, {
			event_type: "task_complete",
			session_id: input.session,
			task_id: input.taskId,
			cmd_type: "done",
			outcome: "success",
		});
		refreshWorkbenchLocalState(root, input.session);
	});
}

export function closeSession(
	root: string,
	session: string,
	options: CloseSessionOptions = {},
): string[] {
	return withSessionLock(root, session, () => {
		const paths = sessionPaths(root, session);
		if (!existsSync(paths.sessionDir)) {
			throw new Error(`Session folder not found: ${session}`);
		}
		const blockingRows = readTaskRows(paths.taskPath).filter((row) =>
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
		const reportPath = join(paths.sessionDir, `${session}_report_01.md`);
		if (verification.totalTasks > 1 && !existsSync(reportPath)) {
			if (!options.allowNoReport) {
				throw new Error(
					`Session ${session} requires a final report artifact. Rerun close with --allow-no-report --reason <text>.`,
				);
			}
			if (!options.reason?.trim()) {
				throw new Error("Missing --reason for close allow-no-report override.");
			}
		}

		if (existsSync(paths.activeSessionPath)) {
			const active = readFileSync(paths.activeSessionPath, "utf8").trim();
			if (active === session) {
				unlinkSync(paths.activeSessionPath);
			}
		}
		appendWorkbenchEvent(root, {
			type: "workbench.close",
			session,
		});
		appendTelemetryEvent(root, {
			event_type: "session_end",
			session_id: session,
			cmd_type: "close",
			outcome: "success",
		});
		refreshWorkbenchLocalState(root, session);
		return evaluateCloseWarnings(session, paths.sessionDir);
	});
}
