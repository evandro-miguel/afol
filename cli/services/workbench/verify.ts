import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { collectSessionIds } from "../local-state/workbench-index";
import { resolveProjectPaths } from "../project/paths";
import { loadProjectRoot } from "../project/root";
import { parseStateBoardTaskRow } from "./state-board";
import {
	readVerificationRunLedgerAtSessionPath,
	verificationRunRecordsAuthorize,
} from "./verification-runs";

const LEGACY_TASK_RE = /^\s*-\s\[( |\/|%|&|!|>|x)\]\s+(T-\d{2,3})\s+(.+?)\s*$/;
const OPEN_CHECKLIST_RE = /^\s*-\s\[( |\/|%|&|!)\]\s+(.+?)\s*$/;

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
]);
const FAILURE_RESULT_RE =
	/\b(?:fail|failed|failure|error|fatal|blocked|exit code [1-9])\b/i;
const NOOP_EXECUTION_COMMANDS = new Set([
	"true",
	"/bin/true",
	"/usr/bin/true",
	":",
]);
const ENV_WRAPPERS = new Set(["env", "/usr/bin/env", "/bin/env"]);
const ENV_FLAGS_WITHOUT_ARGUMENT = new Set([
	"-i",
	"--ignore-environment",
	"-0",
	"--null",
]);
const ENV_FLAGS_WITH_ARGUMENT = new Set(["-C", "--chdir", "-u", "--unset"]);
const COMMAND_WRAPPERS = new Set(["command", "builtin"]);
const EXEC_WRAPPER = "exec";
const SHELL_WRAPPERS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const EVAL_WRAPPER = "eval";
const SHELL_NOOP_EXEMPT = "-n";

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
	completionPolicy: CompletionPolicy;
	attempt: number;
};

export type CompletionPolicy = "execution" | "artifact" | "waiver";

export type VerifyIssue = {
	type:
		| "missing_evidence"
		| "failed_evidence"
		| "invalid_evidence"
		| "invalid_task_state"
		| "open_checklist_item"
		| "missing_session"
		| "missing_tasks"
		| "duplicate_task_id";
	taskId?: string;
	file?: string;
	line?: number;
	message: string;
};

export function isBlockingVerifyIssue(issue: VerifyIssue): boolean {
	return issue.type !== "open_checklist_item";
}

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
	provenance?: unknown;
	authorization_type?: unknown;
	artifact?: unknown;
	artifact_sha256?: unknown;
	waiver_reason?: unknown;
	approved_by?: unknown;
	attempt?: unknown;
	verification_run_id?: unknown;
	task_attempt?: unknown;
};

type EvidenceLedger = {
	byTask: Map<string, EvidenceVerificationEntry[]>;
	issues: VerifyIssue[];
};

function normalizeState(value: string): string {
	const state = value.trim().toLowerCase();
	return LEGACY_STATE_ALIASES[state] ?? state;
}

export function completionPolicyFromNotes(notes: string): CompletionPolicy {
	const match = notes.match(
		/(?:^|\s)completion_policy=(execution|artifact|waiver)(?:\s|$)/,
	);
	return (match?.[1] as CompletionPolicy | undefined) ?? "execution";
}

function attemptFromNotes(notes: string): number {
	const match = notes.match(/(?:^|\s)attempt=(\d+)(?=\s|$)/);
	return Number.parseInt(match?.[1] ?? "0", 10);
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
			const stateBoardRow = parseStateBoardTaskRow(line);
			if (stateBoardRow) {
				const notes = stateBoardRow.notes;
				tasks.push({
					id: stateBoardRow.taskId,
					state: normalizeState(stateBoardRow.state),
					description: notes,
					file,
					line: lineNumber,
					completionPolicy: completionPolicyFromNotes(notes),
					attempt: attemptFromNotes(notes),
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
				completionPolicy: "execution",
				attempt: 0,
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

export function evidenceResultIsFailure(result: unknown): boolean {
	return typeof result === "string" && FAILURE_RESULT_RE.test(result);
}

function evidenceIsFailure(entry: EvidenceVerificationEntry): boolean {
	return (
		evidenceResultIsFailure(entry.result) ||
		(typeof entry.exit_code === "number" && entry.exit_code !== 0)
	);
}

function evidenceEntryIsSuccess(entry: EvidenceVerificationEntry): boolean {
	return (
		evidenceResultIsSuccess(entry.result) &&
		entry.provenance === "observed" &&
		entry.exit_code === 0 &&
		typeof entry.id === "string" &&
		entry.id.trim().length > 0
	);
}

function typedNonExecutionSuccessEvidence(
	entry: EvidenceVerificationEntry,
	policy: CompletionPolicy,
): boolean {
	if (!evidenceResultIsSuccess(entry.result) || typeof entry.id !== "string")
		return false;
	if (policy === "artifact") {
		return (
			entry.authorization_type === "artifact" &&
			typeof entry.artifact === "string" &&
			entry.artifact.length > 0 &&
			typeof entry.artifact_sha256 === "string" &&
			/^[a-f0-9]{64}$/.test(entry.artifact_sha256)
		);
	}
	return (
		policy === "waiver" &&
		entry.authorization_type === "waiver" &&
		typeof entry.waiver_reason === "string" &&
		entry.waiver_reason.trim().length > 0 &&
		typeof entry.approved_by === "string" &&
		entry.approved_by.trim().length > 0
	);
}

function hasRunnableSuccessEvidence(entry: EvidenceVerificationEntry): boolean {
	return (
		evidenceEntryIsSuccess(entry) &&
		typeof entry.command === "string" &&
		entry.command.trim().length > 0 &&
		!isNoopExecutionCommand(entry.command)
	);
}

/** A successful shell no-op is evidence of execution, not task verification. */
export function isNoopExecutionCommand(command: string): boolean {
	const segments = splitSimpleControlChain(stripShellComment(command));
	if (!segments) return true;
	return segments.every(isNoopExecutionSegment);
}

function isNoopExecutionSegment(command: string): boolean {
	const normalized = command.trim();
	if (normalized.length === 0) return true;
	if (/[()<>`$\n]/.test(normalized)) return false;
	const words = shellWords(normalized);
	if (!words) return true;
	let index = 0;
	while (ENV_WRAPPERS.has(words[index] ?? "")) {
		const commandIndex = consumeEnvPrefix(words, index + 1);
		if (commandIndex === null) return true;
		index = commandIndex;
	}
	while (
		COMMAND_WRAPPERS.has(words[index] ?? "") ||
		words[index] === EXEC_WRAPPER
	) {
		const commandIndex =
			words[index] === EXEC_WRAPPER
				? consumeExecPrefix(words, index + 1)
				: consumeCommandPrefix(words, index + 1);
		if (commandIndex === null) return true;
		index = commandIndex;
	}
	if (isShellWrapper(words[index] ?? "")) {
		const script = shellScriptArgument(words, index + 1);
		return script === null
			? true
			: script === undefined
				? false
				: isNoopExecutionCommand(script);
	}
	if (words[index] === EVAL_WRAPPER) {
		const expression = words
			.slice(index + 1)
			.join(" ")
			.trim();
		return expression.length === 0 || isNoopExecutionCommand(expression);
	}
	return NOOP_EXECUTION_COMMANDS.has(words[index] ?? "");
}

function isShellWrapper(command: string): boolean {
	if (SHELL_WRAPPERS.has(command)) return true;
	const match = command.match(/^\/(?:bin|usr\/bin)\/([^/]+)$/);
	return match !== null && SHELL_WRAPPERS.has(match[1] ?? "");
}

function splitSimpleControlChain(command: string): string[] | null {
	const segments: string[] = [];
	let segment = "";
	let quote: "'" | '"' | null = null;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index] ?? "";
		if (quote) {
			if (quote === '"' && character === "\\") {
				if (index + 1 >= command.length) return null;
				segment += character + (command[index + 1] ?? "");
				index += 1;
			} else {
				if (character === quote) quote = null;
				segment += character;
			}
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			segment += character;
			continue;
		}
		if (character === "\\") {
			if (index + 1 >= command.length) return null;
			segment += character + (command[index + 1] ?? "");
			index += 1;
			continue;
		}
		if (";|&".includes(character)) {
			segments.push(segment);
			segment = "";
			if (
				(character === "|" || character === "&") &&
				command[index + 1] === character
			)
				index += 1;
			continue;
		}
		segment += character;
	}
	if (quote) return null;
	segments.push(segment);
	return segments;
}

function shellScriptArgument(
	words: string[],
	index: number,
): string | null | undefined {
	while (index < words.length) {
		const word = words[index] ?? "";
		if (word === "--") return undefined;
		if (word === SHELL_NOOP_EXEMPT) {
			const next = words[index + 1] ?? "";
			if (!next || next === "--" || next === "-" || next.startsWith("-")) {
				return null;
			}
			index += 1;
			continue;
		}
		if (/^-[A-Za-z]*c[A-Za-z]*$/.test(word)) {
			return words[index + 1] ?? null;
		}
		if (word.startsWith("-")) return null;
		return undefined;
	}
	return undefined;
}

function consumeEnvPrefix(words: string[], index: number): number | null {
	while (index < words.length) {
		const word = words[index] ?? "";
		if (word === "--") return index + 1;
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
			index += 1;
			continue;
		}
		if (ENV_FLAGS_WITHOUT_ARGUMENT.has(word)) {
			index += 1;
			continue;
		}
		if (ENV_FLAGS_WITH_ARGUMENT.has(word)) {
			if (index + 1 >= words.length) return null;
			index += 2;
			continue;
		}
		if (/^(?:-C|--chdir|-u|--unset)=/.test(word)) {
			index += 1;
			continue;
		}
		if (word.startsWith("-")) return null;
		return index;
	}
	return index;
}

function consumeCommandPrefix(words: string[], index: number): number | null {
	while (index < words.length) {
		const word = words[index] ?? "";
		if (word === "--") return index + 1;
		if (word === "-p") {
			index += 1;
			continue;
		}
		// Lookup-only forms do not execute their operands.
		if (word === "-v" || word === "-V") return null;
		if (word.startsWith("-")) return null;
		return index;
	}
	return index;
}

function consumeExecPrefix(words: string[], index: number): number | null {
	while (index < words.length) {
		const word = words[index] ?? "";
		if (word === "--") return index + 1;
		if (/^-[cl]+$/.test(word)) {
			index += 1;
			continue;
		}
		if (word === "-a") {
			if (index + 1 >= words.length) return null;
			index += 2;
			continue;
		}
		if (word.startsWith("-")) return null;
		return index;
	}
	return index;
}

function shellWords(command: string): string[] | null {
	const words: string[] = [];
	let word = "";
	let quote: "'" | '"' | null = null;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index] ?? "";
		if (quote) {
			if (quote === '"' && character === "\\") {
				if (index + 1 >= command.length) return null;
				word += command[index + 1];
				index += 1;
			} else if (character === quote) quote = null;
			else word += character;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === "\\") {
			if (index + 1 >= command.length) return null;
			word += command[index + 1];
			index += 1;
			continue;
		}
		if (/\s/.test(character)) {
			if (word) words.push(word);
			word = "";
			continue;
		}
		word += character;
	}
	if (quote) return null;
	if (word) words.push(word);
	return words;
}

function stripShellComment(command: string): string {
	let quote: "'" | '"' | null = null;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (quote) {
			if (quote === '"' && character === "\\") index += 1;
			else if (character === quote) quote = null;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (
			character === "#" &&
			(index === 0 || /\s/.test(command[index - 1] ?? ""))
		)
			return command.slice(0, index);
	}
	return command;
}

export type EvidenceCompletionStatus = "missing" | "passed" | "failed";

export type EvidenceCompletionAuthorization = {
	status: EvidenceCompletionStatus;
	evidenceId?: string;
};

export function evidenceCompletionAuthorization(
	entries: EvidenceVerificationEntry[],
	policy: CompletionPolicy = "execution",
): EvidenceCompletionAuthorization {
	let authorization: EvidenceCompletionAuthorization = { status: "missing" };
	for (const entry of entries) {
		if (evidenceIsFailure(entry)) {
			authorization = { status: "failed" };
			continue;
		}
		if (
			(policy === "execution" && hasRunnableSuccessEvidence(entry)) ||
			typedNonExecutionSuccessEvidence(entry, policy)
		) {
			authorization = { status: "passed", evidenceId: entry.id as string };
		}
	}
	return authorization;
}

export function evidenceCompletionStatus(
	entries: EvidenceVerificationEntry[],
): EvidenceCompletionStatus {
	return evidenceCompletionAuthorization(entries).status;
}

function doneTaskEvidenceIssue(
	task: VerifyTask,
	entries: EvidenceVerificationEntry[],
	evidenceScope: string,
): VerifyIssue | null {
	const attemptEntries = entries.filter(
		(entry) => (entry.attempt ?? 0) === task.attempt,
	);
	const authorization = evidenceCompletionAuthorization(
		attemptEntries,
		task.completionPolicy,
	);
	if (authorization.status === "failed") {
		return {
			type: "failed_evidence",
			taskId: task.id,
			file: task.file,
			line: task.line,
			message: `Task ${task.id} has blocking failed evidence`,
		};
	}
	if (authorization.status === "passed") {
		const authorizingEntry = attemptEntries.find(
			(entry) => entry.id === authorization.evidenceId,
		);
		if (typeof authorizingEntry?.verification_run_id === "string") {
			try {
				const records = readVerificationRunLedgerAtSessionPath(evidenceScope);
				if (
					!verificationRunRecordsAuthorize(
						records,
						task.id,
						task.attempt,
						authorization.evidenceId ?? "",
						authorizingEntry.verification_run_id,
					)
				) {
					return {
						type: "invalid_evidence",
						taskId: task.id,
						file: task.file,
						line: task.line,
						message: `Task ${task.id} has run-tagged evidence without a complete matching verification run`,
					};
				}
			} catch (error) {
				return {
					type: "invalid_evidence",
					taskId: task.id,
					file: task.file,
					line: task.line,
					message: `Task ${task.id} has an invalid verification run ledger: ${(error as Error).message}`,
				};
			}
		}
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

function recordTaskState(
	result: VerifyResult,
	task: VerifyTask,
	seenTaskIds: Map<string, VerifyTask>,
): void {
	const previous = seenTaskIds.get(task.id);
	if (previous) {
		result.issues.push({
			type: "duplicate_task_id",
			taskId: task.id,
			file: task.file,
			line: task.line,
			message: `Duplicate task id ${task.id}; first declared at ${previous.file}:${previous.line}`,
		});
	} else seenTaskIds.set(task.id, task);
	result.totalTasks += 1;
	if (!isCountedTaskState(task.state)) {
		result.issues.push(invalidTaskStateIssue(task));
	}
	incrementState(result, task);
	if (OPEN_STATES.has(task.state)) result.openTasks.push(task);
}

/** Verify one captured task document without touching the filesystem. */
export function verifyTaskText(content: string, file: string): VerifyResult {
	const result = emptyResult(dirname(file), false);
	result.taskFiles = [file];
	const tasks = parseTasks(content, file);
	if (tasks.length === 0) {
		result.issues.push({
			type: "missing_tasks",
			file,
			message: "No task rows found in canonical task file",
		});
		return result;
	}
	const seenTaskIds = new Map<string, VerifyTask>();
	for (const task of tasks) recordTaskState(result, task, seenTaskIds);
	result.allCompleted =
		result.openTasks.length === 0 && !result.issues.some(isBlockingVerifyIssue);
	return result;
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
	const seenTaskIdsByScope = new Map<string, Map<string, VerifyTask>>();

	for (const taskFile of taskFiles) {
		const content = readFileSync(taskFile, "utf8");
		const tasks = parseTasks(content, taskFile);
		if (strict) {
			result.issues.push(...findOpenChecklistItems(content, taskFile));
		}
		let scopedEvidence: EvidenceLedger | undefined;
		const evidenceScope = evidenceScopeFor(taskFile, scanRoot);
		if (strict) {
			scopedEvidence = evidenceByScope.get(evidenceScope);
			if (!scopedEvidence) {
				const ledger = loadEvidence(evidenceScope);
				evidenceByScope.set(evidenceScope, ledger);
				result.issues.push(...ledger.issues);
				scopedEvidence = ledger;
			}
		}

		for (const task of tasks) {
			let seenTaskIds = seenTaskIdsByScope.get(evidenceScope);
			if (!seenTaskIds) {
				seenTaskIds = new Map<string, VerifyTask>();
				seenTaskIdsByScope.set(evidenceScope, seenTaskIds);
			}
			recordTaskState(result, task, seenTaskIds);
			if (strict && task.state === "done") {
				const issue = doneTaskEvidenceIssue(
					task,
					scopedEvidence?.byTask.get(task.id) ?? [],
					evidenceScope,
				);
				if (issue) {
					result.issues.push(issue);
				}
			}
		}
	}

	result.allCompleted =
		result.openTasks.length === 0 && !result.issues.some(isBlockingVerifyIssue);
	return result;
}

export function formatVerifyReport(
	result: VerifyResult,
	verbose = false,
): string {
	const sessionLabel = relative(process.cwd(), result.sessionPath) || ".";
	const lines = [
		"Task Verification Report",
		`Session: ${sessionLabel}`,
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
		const visibleTasks = verbose
			? result.openTasks
			: result.openTasks.slice(0, VERIFY_REPORT_DETAIL_LIMIT);
		lines.push("", `Open Tasks: ${result.openTasks.length}`);
		for (const task of visibleTasks) {
			const file = relative(result.sessionPath, task.file);
			lines.push(
				`  ${task.id} | ${file}:${task.line} | ${task.state} | ${task.description}`,
			);
		}
		appendReportOmission(
			lines,
			result.openTasks.length - visibleTasks.length,
			"open task(s)",
			verbose,
		);
	}

	if (result.issues.length > 0) {
		const counts = new Map<VerifyIssue["type"], number>();
		for (const issue of result.issues) {
			counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1);
		}
		lines.push("", `Issues: ${result.issues.length}`);
		for (const [type, count] of counts) {
			lines.push(`  ${type}: ${count}`);
		}
		const visibleIssues = verbose
			? result.issues
			: result.issues.slice(0, VERIFY_REPORT_DETAIL_LIMIT);
		lines.push("", verbose ? "Issue details:" : "Issue examples:");
		for (const issue of visibleIssues) {
			const location = issue.file
				? ` ${relative(result.sessionPath, issue.file)}:${issue.line}`
				: "";
			lines.push(`  ${issue.type}${location} - ${issue.message}`);
		}
		appendReportOmission(
			lines,
			result.issues.length - visibleIssues.length,
			"issue(s)",
			verbose,
		);
	}

	lines.push(
		"",
		result.allCompleted ? "All tasks completed." : "Verification failed.",
	);
	return `${lines.join("\n")}\n`;
}

const VERIFY_REPORT_DETAIL_LIMIT = 5;

function appendReportOmission(
	lines: string[],
	remaining: number,
	label: string,
	verbose: boolean,
): void {
	if (verbose || remaining <= 0) return;
	lines.push(
		`  ... ${remaining} more ${label} omitted; rerun with --verbose for full details.`,
	);
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
