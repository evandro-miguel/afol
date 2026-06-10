import { randomBytes } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
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
const BLOCKING_STATES = new Set(["pending", "in_progress", "problem"]);
const SESSION_NAME_RE = /^[A-Za-z0-9._-]+$/;

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
	if (!SESSION_NAME_RE.test(normalized) || normalized.length === 0) {
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
	let counter = 2;
	while (true) {
		const candidate = `${base}_${twoDigits(counter)}`;
		if (!existsSync(join(wbRoot, candidate))) {
			return candidate;
		}
		counter += 1;
	}
}

function taskNoteFromMetadata(metadata?: NewWorkstreamMetadata): string {
	const task = metadata?.task?.trim();
	const note =
		task && task.length > 0 ? task : "Execute requested lifecycle work.";
	return note.replace(/\|/g, "/");
}

function planTaskFromMetadata(metadata?: NewWorkstreamMetadata): string {
	return metadata?.task?.trim() || "Execute requested lifecycle work.";
}

function sessionPaths(
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

function readTaskRows(
	taskPath: string,
): Array<{ line: string; taskId: string; state: string }> {
	if (!existsSync(taskPath)) {
		throw new Error(`Task file not found: ${taskPath}`);
	}
	const lines = readFileSync(taskPath, "utf8").split("\n");
	const rows: Array<{ line: string; taskId: string; state: string }> = [];
	for (const line of lines) {
		const match = line.trim().match(TASK_ROW_RE);
		if (!match) {
			continue;
		}
		const taskId = match[1];
		const state = match[2];
		if (!taskId || !state) {
			continue;
		}
		rows.push({ line, taskId, state: state.trim() });
	}
	return rows;
}

function updateTaskState(
	taskPath: string,
	taskId: string,
	state: string,
): void {
	const lines = readFileSync(taskPath, "utf8").split("\n");
	let changed = false;
	const nextLines = lines.map((line) => {
		const match = line.trim().match(TASK_ROW_RE);
		if (!match || match[1] !== taskId) {
			return line;
		}
		changed = true;
		const owner = (match[3] ?? "").trim();
		const notes = (match[4] ?? "").trim();
		return `| ${taskId} | ${state} | ${owner} | ${notes} |`;
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
	for (const row of rows) {
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
		} catch {}
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
	const wbRoot = resolveProjectPaths(root).abs.wbDir;
	mkdirSync(wbRoot, { recursive: true });

	const baseSession = `${buildSessionPrefix(new Date())}_${sanitizeTheme(theme)}`;
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
	if (metadata?.task) {
		metadataLines.push(`- task: ${metadata.task}`);
	}
	const metadataSection =
		metadataLines.length > 0
			? ["", "## Native command metadata", ...metadataLines]
			: [];
	const planTask = planTaskFromMetadata(metadata);

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
			`- T-01: ${planTask}`,
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
			"- T-01 is marked done only after passed evidence exists.",
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
			`| T-01 | pending | worker | ${taskNoteFromMetadata(metadata)} |`,
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
		refreshWorkbenchLocalState(root, input.session);
	});
}

export function recordEvidence(
	root: string,
	input: RecordEvidenceInput,
): EvidenceEntry {
	return withSessionLock(root, input.session, () => {
		const paths = sessionPaths(root, input.session);
		if (!existsSync(paths.sessionDir)) {
			throw new Error(`Session folder not found: ${paths.sessionDir}`);
		}
		const now = new Date();
		const entry: EvidenceEntry = {
			id: evidenceId(now),
			task_id: input.taskId,
			created_at: now.toISOString(),
			command: input.command,
			result: input.result,
		};
		if (input.exitCode !== undefined) {
			entry.exit_code = input.exitCode;
		}
		if (input.artifact) {
			entry.artifact = input.artifact;
		}
		if (input.note) {
			entry.note = input.note;
		}
		writeFileSync(paths.evidencePath, `${JSON.stringify(entry)}\n`, {
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
		refreshWorkbenchLocalState(root, input.session);
		return entry;
	});
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
		refreshWorkbenchLocalState(root, input.session);
	});
}

export function closeSession(root: string, session: string): void {
	withSessionLock(root, session, () => {
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
		refreshWorkbenchLocalState(root, session);
	});
}
