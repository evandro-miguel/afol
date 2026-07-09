import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { collectSessionIds } from "../local-state/workbench-index";
import { resolveProjectPaths } from "../project/paths";
import { loadProjectRoot } from "../project/root";

const LEGACY_TASK_RE = /^\s*-\s\[( |\/|%|&|!|>|x)\]\s+(T-\d{2,3})\s+(.+?)\s*$/;
const OPEN_CHECKLIST_RE = /^\s*-\s\[( |\/|%|&|!)\]\s+(.+?)\s*$/;
const STATE_BOARD_TASK_RE =
	/^\s*\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|?\s*$/;

const MARKER_TO_STATE: Record<string, string> = {
	" ": "pending",
	"/": "in_progress",
	"%": "implemented_untested",
	"&": "tested_needs_spec_validation",
	"!": "problem",
	">": "moved",
	x: "done",
};

const LEGACY_STATE_ALIASES: Record<string, string> = {
	blocked: "problem",
	completed: "done",
	ready_for_test: "implemented_untested",
	skipped: "moved",
	testing: "tested_needs_spec_validation",
};

const OPEN_STATES = new Set([
	"pending",
	"in_progress",
	"implemented_untested",
	"tested_needs_spec_validation",
	"problem",
]);
const SUCCESS_RESULTS = new Set([
	"pass",
	"passed",
	"success",
	"successful",
	"ok",
	"green",
	"valid",
	"resolved",
	"n/a",
]);
const FAILURE_RESULT_RE =
	/\b(?:fail|failed|failure|error|fatal|blocked|exit code [1-9])\b/i;

type CountedTaskState =
	| "done"
	| "moved"
	| "pending"
	| "in_progress"
	| "implemented_untested"
	| "tested_needs_spec_validation"
	| "problem";

const RESULT_COUNT_KEY_BY_STATE = {
	done: "completed",
	moved: "moved",
	pending: "pending",
	in_progress: "inProgress",
	implemented_untested: "implementedUntested",
	tested_needs_spec_validation: "testedNeedsSpecValidation",
	problem: "problem",
} as const satisfies Record<CountedTaskState, keyof VerifyResult>;

export type VerifyTask = {
	id: string;
	description: string;
	state: string;
	file: string;
	line: number;
};

export type VerifyIssue = {
	type:
		| "missing_evidence"
		| "failed_evidence"
		| "invalid_evidence"
		| "invalid_task_state"
		| "open_checklist_item"
		| "missing_session"
		| "missing_tasks";
	taskId?: string;
	file?: string;
	line?: number;
	message: string;
};

export type VerifyResult = {
	sessionPath: string;
	strict: boolean;
	allCompleted: boolean;
	totalTasks: number;
	completed: number;
	moved: number;
	pending: number;
	inProgress: number;
	implementedUntested: number;
	testedNeedsSpecValidation: number;
	problem: number;
	taskFiles: string[];
	openTasks: VerifyTask[];
	issues: VerifyIssue[];
};

export type EvidenceVerificationEntry = {
	task_id?: unknown;
	taskId?: unknown;
	command?: unknown;
	result?: unknown;
	exit_code?: unknown;
	id?: unknown;
};

type EvidenceLedger = {
	byTask: Map<string, EvidenceVerificationEntry[]>;
	issues: VerifyIssue[];
};

function normalizeState(value: string): string {
	const state = value.trim().toLowerCase();
	return LEGACY_STATE_ALIASES[state] ?? state;
}

function emptyResult(sessionPath: string, strict: boolean): VerifyResult {
	return {
		sessionPath,
		strict,
		allCompleted: false,
		totalTasks: 0,
		completed: 0,
		moved: 0,
		pending: 0,
		inProgress: 0,
		implementedUntested: 0,
		testedNeedsSpecValidation: 0,
		problem: 0,
		taskFiles: [],
		openTasks: [],
		issues: [],
	};
}

function walkFiles(root: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const absolute = join(root, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "_archive") {
				continue;
			}
			files.push(...walkFiles(absolute));
			continue;
		}
		if (entry.isFile()) {
			files.push(absolute);
		}
	}
	return files;
}

function findTaskFiles(sessionPath: string): string[] {
	if (!existsSync(sessionPath)) {
		return [];
	}
	const absoluteSessionPath = resolve(sessionPath);
	return walkFiles(sessionPath)
		.filter((path) => {
			const relativePath = relative(absoluteSessionPath, path).replaceAll(
				"\\",
				"/",
			);
			if (
				relativePath.startsWith(".afol/tmp/") ||
				relativePath.startsWith("docs/templates/") ||
				relativePath.startsWith("src/project-template/docs/templates/") ||
				relativePath.startsWith("docs/lessons/entries/") ||
				relativePath.startsWith("src/project-template/docs/lessons/entries/") ||
				relativePath.includes("/references/templates/")
			) {
				return false;
			}
			const name = basename(path);
			return /_task_\d+\.md$/.test(name) || /^task.*\.md$/i.test(name);
		})
		.sort();
}

function resolveVerifyScopeRoot(sessionPath: string): string {
	const absoluteSessionPath = resolve(sessionPath);
	const project = loadProjectRoot(absoluteSessionPath);
	if (!project.ok || project.value.root !== absoluteSessionPath) {
		return absoluteSessionPath;
	}
	const wbRoot = resolveProjectPaths(absoluteSessionPath).abs.wbDir;
	return existsSync(wbRoot) ? wbRoot : absoluteSessionPath;
}

function parseTasks(content: string, file: string): VerifyTask[] {
	const tasks: VerifyTask[] = [];
	const lines = content.split(/\r?\n/);
	let inCodeBlock = false;
	let inStateBoard = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		const lineNumber = index + 1;

		if (trimmed.startsWith("```")) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) {
			continue;
		}
		if (/^\|\s*Task\s*\|\s*State\s*\|/i.test(trimmed)) {
			inStateBoard = true;
			continue;
		}
		if (inStateBoard && trimmed === "") {
			inStateBoard = false;
			continue;
		}

		if (inStateBoard) {
			if (/^\|\s*-+/.test(trimmed)) {
				continue;
			}
			const stateMatch = line.match(STATE_BOARD_TASK_RE);
			if (stateMatch?.[1] && stateMatch[2]) {
				tasks.push({
					id: stateMatch[1],
					state: normalizeState(stateMatch[2]),
					description: (stateMatch[4] ?? "").trim(),
					file,
					line: lineNumber,
				});
				continue;
			}
		}

		const legacyMatch = line.match(LEGACY_TASK_RE);
		if (legacyMatch?.[1] && legacyMatch[2]) {
			tasks.push({
				id: legacyMatch[2],
				state: MARKER_TO_STATE[legacyMatch[1]] ?? "pending",
				description: legacyMatch[3] ?? "",
				file,
				line: lineNumber,
			});
		}
	}

	return tasks;
}

function findOpenChecklistItems(content: string, file: string): VerifyIssue[] {
	const issues: VerifyIssue[] = [];
	const lines = content.split(/\r?\n/);
	let inCodeBlock = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		if (trimmed.startsWith("```")) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock || LEGACY_TASK_RE.test(line)) {
			continue;
		}
		const checklistMatch = line.match(OPEN_CHECKLIST_RE);
		if (!checklistMatch?.[2]) {
			continue;
		}
		issues.push({
			type: "open_checklist_item",
			file,
			line: index + 1,
			message: `Open checklist item: ${checklistMatch[2].trim()}`,
		});
	}
	return issues;
}

function evidenceScopeFor(taskFile: string, sessionPath: string): string {
	let current = resolve(taskFile);
	const root = resolve(sessionPath);
	if (!existsSync(current) || !statSync(current).isDirectory()) {
		current = dirname(current);
	}
	while (current.startsWith(root)) {
		if (existsSync(join(current, ".evidence.jsonl"))) {
			return current;
		}
		if (current === root) {
			return root;
		}
		const parent = dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
	return root;
}

function loadEvidence(scope: string): EvidenceLedger {
	const ledgerPath = join(scope, ".evidence.jsonl");
	const byTask = new Map<string, EvidenceVerificationEntry[]>();
	const issues: VerifyIssue[] = [];
	if (!existsSync(ledgerPath)) {
		return { byTask, issues };
	}
	const lines = readFileSync(ledgerPath, "utf8").split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		try {
			const entry = JSON.parse(trimmed) as EvidenceVerificationEntry;
			const taskId =
				typeof entry.task_id === "string" ? entry.task_id : entry.taskId;
			if (typeof taskId !== "string") {
				continue;
			}
			const entries = byTask.get(taskId) ?? [];
			entries.push(entry);
			byTask.set(taskId, entries);
		} catch (error) {
			issues.push({
				type: "invalid_evidence",
				file: ledgerPath,
				line: index + 1,
				message: `Invalid evidence JSONL line: ${(error as Error).message}`,
			});
		}
	}
	return { byTask, issues };
}

export function evidenceResultIsSuccess(result: unknown): boolean {
	return (
		typeof result === "string" &&
		SUCCESS_RESULTS.has(result.trim().toLowerCase())
	);
}

function evidenceIsFailure(entry: EvidenceVerificationEntry): boolean {
	return (
		(typeof entry.result === "string" &&
			FAILURE_RESULT_RE.test(entry.result)) ||
		(typeof entry.exit_code === "number" && entry.exit_code !== 0)
	);
}

function evidenceEntryIsSuccess(entry: EvidenceVerificationEntry): boolean {
	return (
		evidenceResultIsSuccess(entry.result) &&
		(entry.exit_code === undefined || entry.exit_code === 0)
	);
}

function hasRunnableSuccessEvidence(entry: EvidenceVerificationEntry): boolean {
	return (
		evidenceEntryIsSuccess(entry) &&
		typeof entry.command === "string" &&
		entry.command.trim().length > 0
	);
}

export type EvidenceCompletionStatus = "missing" | "passed" | "failed";

export function evidenceCompletionStatus(
	entries: EvidenceVerificationEntry[],
): EvidenceCompletionStatus {
	let status: EvidenceCompletionStatus = "missing";
	for (const entry of entries) {
		if (evidenceIsFailure(entry)) {
			status = "failed";
			continue;
		}
		if (hasRunnableSuccessEvidence(entry)) {
			status = "passed";
		}
	}
	return status;
}

function doneTaskEvidenceIssue(
	task: VerifyTask,
	entries: EvidenceVerificationEntry[],
): VerifyIssue | null {
	const status = evidenceCompletionStatus(entries);
	if (status === "failed") {
		return {
			type: "failed_evidence",
			taskId: task.id,
			file: task.file,
			line: task.line,
			message: `Task ${task.id} has blocking failed evidence`,
		};
	}
	if (status === "passed") {
		return null;
	}
	return {
		type: "missing_evidence",
		taskId: task.id,
		file: task.file,
		line: task.line,
		message: `Task ${task.id} marked done but lacks passed evidence`,
	};
}

function isCountedTaskState(state: string): state is CountedTaskState {
	return state in RESULT_COUNT_KEY_BY_STATE;
}

function invalidTaskStateIssue(task: VerifyTask): VerifyIssue {
	return {
		type: "invalid_task_state",
		taskId: task.id,
		file: task.file,
		line: task.line,
		message: `Task ${task.id} has invalid state: ${task.state}`,
	};
}

function incrementState(result: VerifyResult, task: VerifyTask): void {
	if (!isCountedTaskState(task.state)) {
		return;
	}
	const key = RESULT_COUNT_KEY_BY_STATE[task.state];
	result[key] += 1;
}

export function verifyWorkbenchTasks(
	sessionPath: string,
	strict = false,
): VerifyResult {
	const scanRoot = resolveVerifyScopeRoot(sessionPath);
	const result = emptyResult(scanRoot, strict);

	if (!existsSync(scanRoot)) {
		result.issues.push({
			type: "missing_session",
			message: `Session folder not found: ${scanRoot}`,
		});
		return result;
	}

	const taskFiles = findTaskFiles(scanRoot);
	result.taskFiles = taskFiles;
	if (taskFiles.length === 0) {
		result.allCompleted = !strict;
		result.issues.push({
			type: "missing_tasks",
			message: "No task files found in session",
		});
		return result;
	}

	const evidenceByScope = new Map<string, EvidenceLedger>();

	for (const taskFile of taskFiles) {
		const content = readFileSync(taskFile, "utf8");
		const tasks = parseTasks(content, taskFile);
		if (strict) {
			result.issues.push(...findOpenChecklistItems(content, taskFile));
		}
		let scopedEvidence: EvidenceLedger | undefined;
		if (strict) {
			const evidenceScope = evidenceScopeFor(taskFile, scanRoot);
			scopedEvidence = evidenceByScope.get(evidenceScope);
			if (!scopedEvidence) {
				const ledger = loadEvidence(evidenceScope);
				evidenceByScope.set(evidenceScope, ledger);
				result.issues.push(...ledger.issues);
				scopedEvidence = ledger;
			}
		}

		for (const task of tasks) {
			result.totalTasks += 1;
			if (!isCountedTaskState(task.state)) {
				result.issues.push(invalidTaskStateIssue(task));
			}
			incrementState(result, task);
			if (OPEN_STATES.has(task.state)) {
				result.openTasks.push(task);
			}
			if (strict && task.state === "done") {
				const issue = doneTaskEvidenceIssue(
					task,
					scopedEvidence?.byTask.get(task.id) ?? [],
				);
				if (issue) {
					result.issues.push(issue);
				}
			}
		}
	}

	result.allCompleted =
		result.openTasks.length === 0 && result.issues.length === 0;
	return result;
}

export function formatVerifyReport(result: VerifyResult): string {
	const lines = [
		"Task Verification Report",
		`Session: ${result.sessionPath}`,
		...(result.strict ? ["Mode: STRICT"] : []),
		"",
		"Summary:",
		`  Total tasks:     ${result.totalTasks}`,
		`  Completed:       ${result.completed}`,
	];

	if (result.moved > 0) {
		lines.push(`  Moved:           ${result.moved}`);
	}
	if (result.pending > 0) {
		lines.push(`  Pending:         ${result.pending}`);
	}
	if (result.inProgress > 0) {
		lines.push(`  In Progress:     ${result.inProgress}`);
	}
	if (result.implementedUntested > 0) {
		lines.push(`  Implemented:     ${result.implementedUntested}`);
	}
	if (result.testedNeedsSpecValidation > 0) {
		lines.push(`  Tested/Spec:     ${result.testedNeedsSpecValidation}`);
	}
	if (result.problem > 0) {
		lines.push(`  Problem:         ${result.problem}`);
	}

	if (result.openTasks.length > 0) {
		lines.push("", "Open Tasks:");
		for (const task of result.openTasks) {
			const file = relative(result.sessionPath, task.file);
			lines.push(
				`  ${task.id} | ${file}:${task.line} | ${task.state} | ${task.description}`,
			);
		}
	}

	if (result.issues.length > 0) {
		lines.push("", "Issues:");
		for (const issue of result.issues) {
			const location = issue.file
				? ` ${relative(result.sessionPath, issue.file)}:${issue.line}`
				: "";
			lines.push(`  ${issue.type}${location} - ${issue.message}`);
		}
	}

	lines.push(
		"",
		result.allCompleted ? "All tasks completed." : "Verification failed.",
	);
	return `${lines.join("\n")}\n`;
}

export function verifyAllSessions(
	root: string,
	strict = false,
	sessionFilter?: string[],
): VerifyResult[] {
	const wbRoot = resolveProjectPaths(root).abs.wbDir;
	const allSessionIds = sessionFilter ?? collectSessionIds(root);
	const results: VerifyResult[] = [];

	for (const sessionId of allSessionIds) {
		const sessionPath = resolve(wbRoot, sessionId);
		if (!existsSync(sessionPath)) {
			continue;
		}
		const result = verifyWorkbenchTasks(sessionPath, strict);
		result.sessionPath = sessionPath;
		results.push(result);
	}

	if (results.length === 0) {
		results.push(emptyResult(root, strict));
	}

	return results;
}
