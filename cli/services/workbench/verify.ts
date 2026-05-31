import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const LEGACY_TASK_RE = /^\s*-\s\[( |\/|%|&|!|>|x)\]\s+(T-\d{2,3})\s+(.+?)\s*$/;
const STATE_BOARD_TASK_RE = /^\s*\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|?\s*$/;

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

const OPEN_STATES = new Set(["pending", "in_progress", "implemented_untested", "tested_needs_spec_validation", "problem"]);
const SUCCESS_RESULT_RE = /\b(?:pass|passed|success|successful|ok|green|valid|resolved|n\/a)\b/i;
const FAILURE_RESULT_RE = /\b(?:fail|failed|failure|error|fatal|blocked|exit code [1-9])\b/i;

export type VerifyTask = {
  id: string;
  description: string;
  state: string;
  file: string;
  line: number;
};

export type VerifyIssue = {
  type: "missing_evidence" | "failed_evidence" | "missing_session" | "missing_tasks";
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

type EvidenceEntry = {
  task_id?: unknown;
  taskId?: unknown;
  command?: unknown;
  result?: unknown;
  id?: unknown;
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
  return walkFiles(sessionPath)
    .filter((path) => {
      const name = basename(path);
      return /_task_\d+\.md$/.test(name) || /^task.*\.md$/i.test(name);
    })
    .sort();
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

function loadEvidence(scope: string): Map<string, EvidenceEntry[]> {
  const ledgerPath = join(scope, ".evidence.jsonl");
  const byTask = new Map<string, EvidenceEntry[]>();
  if (!existsSync(ledgerPath)) {
    return byTask;
  }
  for (const line of readFileSync(ledgerPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const entry = JSON.parse(trimmed) as EvidenceEntry;
      const taskId = typeof entry.task_id === "string" ? entry.task_id : entry.taskId;
      if (typeof taskId !== "string") {
        continue;
      }
      const entries = byTask.get(taskId) ?? [];
      entries.push(entry);
      byTask.set(taskId, entries);
    } catch {
      continue;
    }
  }
  return byTask;
}

function evidenceIsSuccess(entry: EvidenceEntry): boolean {
  return typeof entry.result === "string" && SUCCESS_RESULT_RE.test(entry.result);
}

function evidenceIsFailure(entry: EvidenceEntry): boolean {
  return typeof entry.result === "string" && FAILURE_RESULT_RE.test(entry.result);
}

function hasStrictClosureEvidence(entries: EvidenceEntry[]): boolean {
  if (entries.some((entry) => evidenceIsFailure(entry))) {
    return false;
  }
  return entries.some((entry) => evidenceIsSuccess(entry) && typeof entry.command === "string" && entry.command.trim());
}

function incrementState(result: VerifyResult, task: VerifyTask): void {
  if (task.state === "done") {
    result.completed += 1;
    return;
  }
  if (task.state === "moved") {
    result.moved += 1;
    return;
  }
  if (task.state === "pending") {
    result.pending += 1;
    return;
  }
  if (task.state === "in_progress") {
    result.inProgress += 1;
    return;
  }
  if (task.state === "implemented_untested") {
    result.implementedUntested += 1;
    return;
  }
  if (task.state === "tested_needs_spec_validation") {
    result.testedNeedsSpecValidation += 1;
    return;
  }
  if (task.state === "problem") {
    result.problem += 1;
  }
}

export function verifyWorkbenchTasks(sessionPath: string, strict = false): VerifyResult {
  const absoluteSessionPath = resolve(sessionPath);
  const result = emptyResult(absoluteSessionPath, strict);

  if (!existsSync(absoluteSessionPath)) {
    result.issues.push({
      type: "missing_session",
      message: `Session folder not found: ${absoluteSessionPath}`,
    });
    return result;
  }

  const taskFiles = findTaskFiles(absoluteSessionPath);
  result.taskFiles = taskFiles;
  if (taskFiles.length === 0) {
    result.allCompleted = !strict;
    result.issues.push({
      type: "missing_tasks",
      message: "No task files found in session",
    });
    return result;
  }

  const evidenceByScope = new Map<string, Map<string, EvidenceEntry[]>>();

  for (const taskFile of taskFiles) {
    const content = readFileSync(taskFile, "utf8");
    const tasks = parseTasks(content, taskFile);
    const evidenceScope = evidenceScopeFor(taskFile, absoluteSessionPath);
    if (strict && !evidenceByScope.has(evidenceScope)) {
      evidenceByScope.set(evidenceScope, loadEvidence(evidenceScope));
    }
    const scopedEvidence = evidenceByScope.get(evidenceScope);

    for (const task of tasks) {
      result.totalTasks += 1;
      incrementState(result, task);
      if (OPEN_STATES.has(task.state)) {
        result.openTasks.push(task);
      }
      if (strict && task.state === "done") {
        const entries = scopedEvidence?.get(task.id) ?? [];
        if (!hasStrictClosureEvidence(entries)) {
          const hasFailure = entries.some((entry) => evidenceIsFailure(entry));
          result.issues.push({
            type: hasFailure ? "failed_evidence" : "missing_evidence",
            taskId: task.id,
            file: task.file,
            line: task.line,
            message: hasFailure
              ? `Task ${task.id} has blocking failed evidence`
              : `Task ${task.id} marked done but lacks passed evidence`,
          });
        }
      }
    }
  }

  result.allCompleted = result.openTasks.length === 0 && result.issues.length === 0;
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
      lines.push(`  ${task.id} | ${file}:${task.line} | ${task.state} | ${task.description}`);
    }
  }

  if (result.issues.length > 0) {
    lines.push("", "Issues:");
    for (const issue of result.issues) {
      const location = issue.file ? ` ${relative(result.sessionPath, issue.file)}:${issue.line}` : "";
      lines.push(`  ${issue.type}${location} - ${issue.message}`);
    }
  }

  lines.push("", result.allCompleted ? "All tasks completed." : "Verification failed.");
  return `${lines.join("\n")}\n`;
}
