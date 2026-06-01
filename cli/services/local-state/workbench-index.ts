import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveWorkbenchEventLogPath } from "./workbench-events";

export type WorkbenchIndexTask = {
  session: string;
  task_id: string;
  state: string;
  owner: string;
  notes: string;
  file: string;
  line: number;
  touched_at: string;
};

export type WorkbenchIndexSession = {
  session: string;
  task_count: number;
  completed: number;
  open: number;
  problem: number;
  touched_at: string;
};

export type WorkbenchIndexSnapshot = {
  kind: "workbench_index_v1";
  version: 1;
  generated_at: string;
  source: {
    wb_dir: string;
    event_log: string;
  };
  sessions: WorkbenchIndexSession[];
  tasks: WorkbenchIndexTask[];
};

const WORKBENCH_INDEX_PATH = [".agents", "data", "index", "workbench.json"];
const TASK_FILE_RE = /^.+_task_\d+\.md$/;
const STATE_BOARD_HEADER_RE = /^\s*\|\s*Task\s*\|\s*State\s*\|\s*Owner\s*\|\s*Notes\s*\|?\s*$/i;
const TASK_ROW_RE = /^\s*\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|?\s*$/;
const TASK_TABLE_SEPARATOR_RE = /^\s*\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|?\s*$/;

const ZERO_TIME = new Date(0).toISOString();

function resolveWorkbenchRoot(root: string): string {
  return resolve(root, ".agents", "wb");
}

function resolveWorkbenchIndexPath(root: string): string {
  return resolve(root, ...WORKBENCH_INDEX_PATH);
}

function formatNow(): string {
  return new Date().toISOString();
}

function parseTouchedAt(path: string): string {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return ZERO_TIME;
  }
}

function collectSessionIds(root: string): string[] {
  const wbRoot = resolveWorkbenchRoot(root);
  if (!existsSync(wbRoot)) {
    return [];
  }
  return readdirSync(wbRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

function sessionTaskFiles(sessionDir: string): string[] {
  try {
    return readdirSync(sessionDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && TASK_FILE_RE.test(entry.name))
      .map((entry) => resolve(sessionDir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

function parseTaskRows(session: string, file: string): WorkbenchIndexTask[] {
  try {
    const lines = readFileSync(file, "utf8").split("\n");
    const tasks: WorkbenchIndexTask[] = [];
    let stateBoard = false;
    let insideCodeBlock = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const trimmed = line.trim();
      if (!trimmed) {
        if (stateBoard) {
          stateBoard = false;
        }
        continue;
      }

      if (trimmed.startsWith("```")) {
        insideCodeBlock = !insideCodeBlock;
        continue;
      }
      if (insideCodeBlock) {
        continue;
      }

      if (!stateBoard && STATE_BOARD_HEADER_RE.test(trimmed)) {
        stateBoard = true;
        continue;
      }
      if (!stateBoard) {
        continue;
      }
      if (TASK_TABLE_SEPARATOR_RE.test(trimmed)) {
        continue;
      }
      if (!trimmed.startsWith("|")) {
        continue;
      }

      const match = trimmed.match(TASK_ROW_RE);
      if (!match?.[1]) {
        continue;
      }

      tasks.push({
        session,
        task_id: match[1],
        state: (match[2] ?? "").trim().toLowerCase(),
        owner: (match[3] ?? "").trim(),
        notes: (match[4] ?? "").trim(),
        file,
        line: index + 1,
        touched_at: parseTouchedAt(file),
      });
    }

    return tasks;
  } catch {
    return [];
  }
}

function summarizeSession(session: string, tasks: WorkbenchIndexTask[]): WorkbenchIndexSession {
  const completed = tasks.filter((task) => task.state === "done").length;
  const problem = tasks.filter((task) => task.state === "problem").length;
  const open = tasks.filter((task) => task.state !== "done" && task.state !== "moved").length;
  return {
    session,
    task_count: tasks.length,
    completed,
    open,
    problem,
    touched_at: tasks.length > 0 ? tasks.at(-1)?.touched_at ?? ZERO_TIME : ZERO_TIME,
  };
}

function sortSessions(a: WorkbenchIndexSession, b: WorkbenchIndexSession): number {
  return a.session.localeCompare(b.session);
}

function sortTasks(a: WorkbenchIndexTask, b: WorkbenchIndexTask): number {
  if (a.session !== b.session) {
    return a.session.localeCompare(b.session);
  }
  if (a.task_id !== b.task_id) {
    return a.task_id.localeCompare(b.task_id);
  }
  return a.line - b.line;
}

function buildSessionsSnapshot(root: string, sessions: Iterable<string>): {
  sessions: WorkbenchIndexSession[];
  tasks: WorkbenchIndexTask[];
} {
  const wbRoot = resolveWorkbenchRoot(root);
  const allTasks: WorkbenchIndexTask[] = [];
  const snapshotSessions: WorkbenchIndexSession[] = [];

  for (const session of sessions) {
    const sessionDir = resolve(wbRoot, session);
    if (!existsSync(sessionDir)) {
      continue;
    }
    const sessionTasks: WorkbenchIndexTask[] = [];

    for (const file of sessionTaskFiles(sessionDir)) {
      sessionTasks.push(...parseTaskRows(session, file));
    }

    snapshotSessions.push(summarizeSession(session, sessionTasks));
    allTasks.push(...sessionTasks);
  }

  return {
    sessions: snapshotSessions.sort(sortSessions),
    tasks: allTasks.sort(sortTasks),
  };
}

function allSessionsSnapshot(root: string): {
  sessions: WorkbenchIndexSession[];
  tasks: WorkbenchIndexTask[];
} {
  return buildSessionsSnapshot(root, collectSessionIds(root));
}

function emptySnapshot(): WorkbenchIndexSnapshot {
  return {
    kind: "workbench_index_v1",
    version: 1,
    generated_at: formatNow(),
    source: {
      wb_dir: ".agents/wb",
      event_log: ".agents/data/events/events.jsonl",
    },
    sessions: [],
    tasks: [],
  };
}

function writeSnapshot(root: string, snapshot: WorkbenchIndexSnapshot): WorkbenchIndexSnapshot {
  const indexPath = resolveWorkbenchIndexPath(root);
  mkdirSync(resolve(indexPath, ".."), { recursive: true });
  writeFileSync(indexPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  return snapshot;
}

function loadSnapshot(root: string): WorkbenchIndexSnapshot | null {
  const indexPath = resolveWorkbenchIndexPath(root);
  if (!existsSync(indexPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as Partial<WorkbenchIndexSnapshot>;
    if (
      parsed.kind !== "workbench_index_v1" ||
      parsed.version !== 1 ||
      typeof parsed.generated_at !== "string" ||
      !Array.isArray(parsed.sessions) ||
      !Array.isArray(parsed.tasks) ||
      typeof parsed.source !== "object" ||
      parsed.source === null
    ) {
      return null;
    }
    return parsed as WorkbenchIndexSnapshot;
  } catch {
    return null;
  }
}

function sessionSourceLatestTime(root: string, session: string): number {
  const wbRoot = resolveWorkbenchRoot(root);
  const sessionDir = resolve(wbRoot, session);
  if (!existsSync(sessionDir)) {
    return 0;
  }
  let latest = 0;
  try {
    latest = Math.max(latest, statSync(sessionDir).mtimeMs);
  } catch {
    latest = 0;
  }

  for (const file of sessionTaskFiles(sessionDir)) {
    try {
      latest = Math.max(latest, statSync(file).mtimeMs);
    } catch {}
  }
  return latest;
}

function latestSourceMtime(root: string): number {
  const wbRoot = resolveWorkbenchRoot(root);
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

  for (const session of collectSessionIds(root)) {
    latest = Math.max(latest, sessionSourceLatestTime(root, session));
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

export function rebuildWorkBenchIndex(root: string, sessionScope?: string): WorkbenchIndexSnapshot {
  const current = loadSnapshot(root);

  if (sessionScope) {
    const targetSnapshot = buildSessionsSnapshot(root, [sessionScope]);
    const allSessions = collectSessionIds(root);
    const hasSession = allSessions.includes(sessionScope);

    const existingTasks = current?.tasks ?? [];
    const existingSessions = current?.sessions ?? [];

    if (!hasSession) {
      const filtered = {
      ...(current ?? emptySnapshot()),
        generated_at: formatNow(),
        sessions: existingSessions.filter((entry) => entry.session !== sessionScope),
        tasks: existingTasks.filter((task) => task.session !== sessionScope),
      };
      return writeSnapshot(root, filtered);
    }

    const next: WorkbenchIndexSnapshot = {
      kind: "workbench_index_v1",
      version: 1,
      generated_at: formatNow(),
      source: {
        wb_dir: ".agents/wb",
        event_log: ".agents/data/events/events.jsonl",
      },
      sessions: [
        ...existingSessions.filter((entry) => entry.session !== sessionScope),
        ...targetSnapshot.sessions,
      ].sort(sortSessions),
      tasks: [...existingTasks.filter((task) => task.session !== sessionScope), ...targetSnapshot.tasks].sort(sortTasks),
    };
    return writeSnapshot(root, next);
  }

  const snapshot = allSessionsSnapshot(root);
  const full: WorkbenchIndexSnapshot = {
    kind: "workbench_index_v1",
    version: 1,
    generated_at: formatNow(),
    source: {
      wb_dir: ".agents/wb",
      event_log: ".agents/data/events/events.jsonl",
    },
    sessions: snapshot.sessions,
    tasks: snapshot.tasks,
  };
  return writeSnapshot(root, full);
}

export function validateWorkBenchIndex(root: string): { ok: boolean; message: string } {
  const indexPath = resolveWorkbenchIndexPath(root);
  if (!existsSync(indexPath)) {
    return {
      ok: true,
      message: `skipped workbench index: no snapshot at ${indexPath}`,
    };
  }

  const snapshot = loadSnapshot(root);
  if (!snapshot) {
    return {
      ok: false,
      message: `invalid workbench index snapshot: ${indexPath}`,
    };
  }

  const generatedAt = Date.parse(snapshot.generated_at);
  const sourceLatest = latestSourceMtime(root);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(sourceLatest)) {
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
