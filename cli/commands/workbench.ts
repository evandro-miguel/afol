import {
  appendTimelineEntry,
  closeSession,
  doneTask,
  newWorkstream,
  readActiveSession,
  recordEvidence,
  startTask,
} from "../services/workbench/lifecycle";
import { formatVerifyReport, verifyWorkbenchTasks } from "../services/workbench/verify";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

type SessionTaskArgs = {
  session: string;
  taskId: string;
};

type EvidenceArgs = SessionTaskArgs & {
  command: string;
  result: string;
};

type DoneArgs = SessionTaskArgs & {
  testCommand: string | null;
};

type LogArgs = {
  session: string;
  message: string;
};

type VerifyArgs = {
  sessionPath: string;
  strict: boolean;
};

function parseNewArgs(args: string[]): { theme: string } {
  const [theme, ...rest] = args;
  if (!theme) {
    throw new Error("Missing theme for new workstream.");
  }
  if (rest.length > 0) {
    throw new Error(`Unexpected new arguments: ${rest.join(" ")}`);
  }
  return { theme };
}

function resolveSession(root: string, session: string, commandName: string): string {
  if (session) {
    return session;
  }
  const active = readActiveSession(root);
  if (active) {
    return active;
  }
  throw new Error(`Missing --session for ${commandName}; no active session found.`);
}

function parseSessionOnlyArgs(args: string[], commandName: string, root: string): { session: string } {
  let session = "";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--session") {
      const value = args[i + 1];
      if (!value) {
        throw new Error(`Missing value for --session in ${commandName}.`);
      }
      session = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown ${commandName} argument: ${arg}`);
  }
  return { session: resolveSession(root, session, commandName) };
}

function parseSessionTaskArgs(args: string[], commandName: string, root: string): SessionTaskArgs {
  let session = "";
  let taskId = "";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--session") {
      const value = args[i + 1];
      if (!value) {
        throw new Error(`Missing value for --session in ${commandName}.`);
      }
      session = value;
      i += 1;
      continue;
    }
    if (arg === "--task-id") {
      const value = args[i + 1];
      if (!value) {
        throw new Error(`Missing value for --task-id in ${commandName}.`);
      }
      taskId = value;
      i += 1;
      continue;
    }
    if (arg && !arg.startsWith("-") && !taskId) {
      taskId = arg;
      continue;
    }
    throw new Error(`Unknown ${commandName} argument: ${arg}`);
  }
  if (!taskId) {
    throw new Error(`Missing --task-id for ${commandName}.`);
  }
  return { session: resolveSession(root, session, commandName), taskId };
}

function parseEvidenceArgs(args: string[], root: string): EvidenceArgs {
  let session = "";
  let taskId = "";
  let command = "";
  let result = "";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg === "--session") {
      if (!value) {
        throw new Error("Missing value for --session in evidence.");
      }
      session = value;
      i += 1;
      continue;
    }
    if (arg === "--task-id") {
      if (!value) {
        throw new Error("Missing value for --task-id in evidence.");
      }
      taskId = value;
      i += 1;
      continue;
    }
    if (arg === "--command") {
      if (!value) {
        throw new Error("Missing value for --command in evidence.");
      }
      command = value;
      i += 1;
      continue;
    }
    if (arg === "--result") {
      if (!value) {
        throw new Error("Missing value for --result in evidence.");
      }
      result = value;
      i += 1;
      continue;
    }
    if (arg && !arg.startsWith("-") && !taskId) {
      taskId = arg;
      continue;
    }
    throw new Error(`Unknown evidence argument: ${arg}`);
  }

  if (!taskId) {
    throw new Error("Missing --task-id for evidence.");
  }
  if (!command) {
    throw new Error("Missing --command for evidence.");
  }
  if (!result) {
    throw new Error("Missing --result for evidence.");
  }

  return { session: resolveSession(root, session, "evidence"), taskId, command, result };
}

function parseDoneArgs(args: string[], root: string): DoneArgs {
  let session = "";
  let taskId = "";
  let testCommand: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg === "--session") {
      if (!value) {
        throw new Error("Missing value for --session in done.");
      }
      session = value;
      i += 1;
      continue;
    }
    if (arg === "--task-id") {
      if (!value) {
        throw new Error("Missing value for --task-id in done.");
      }
      taskId = value;
      i += 1;
      continue;
    }
    if (arg === "--test") {
      if (!value) {
        throw new Error("Missing value for --test in done.");
      }
      testCommand = value;
      i += 1;
      continue;
    }
    if (arg && !arg.startsWith("-") && !taskId) {
      taskId = arg;
      continue;
    }
    throw new Error(`Unknown done argument: ${arg}`);
  }
  if (!taskId) {
    throw new Error("Missing --task-id for done.");
  }
  return { session: resolveSession(root, session, "done"), taskId, testCommand };
}

function parseLogArgs(args: string[], root: string): LogArgs {
  let session = "";
  const messageParts: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg === "--session") {
      if (!value) {
        throw new Error("Missing value for --session in log.");
      }
      session = value;
      i += 1;
      continue;
    }
    if (arg === "--message" || arg === "-m") {
      if (!value) {
        throw new Error("Missing value for --message in log.");
      }
      messageParts.push(value);
      i += 1;
      continue;
    }
    if (arg?.startsWith("-")) {
      throw new Error(`Unknown log argument: ${arg}`);
    }
    if (arg) {
      messageParts.push(arg);
    }
  }
  const message = messageParts.join(" ").trim();
  if (!message) {
    throw new Error("Missing timeline message for log.");
  }
  return { session: resolveSession(root, session, "log"), message };
}

function parseVerifyArgs(args: string[], root: string): VerifyArgs {
  let strict = false;
  let sessionPath = "";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg === "--session") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("Missing value for --session in verify.");
      }
      sessionPath = resolve(root, ".agents", "wb", value);
      i += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      throw new Error("Usage: afol verify-tasks [session-path] [--strict]");
    }
    if (arg?.startsWith("-")) {
      throw new Error(`Unknown verify argument: ${arg}`);
    }
    if (!sessionPath && arg) {
      sessionPath = resolve(root, arg);
      continue;
    }
    throw new Error(`Unexpected verify argument: ${arg}`);
  }

  if (!sessionPath) {
    const active = readActiveSession(root);
    sessionPath = active ? resolve(root, ".agents", "wb", active) : root;
  }

  return { sessionPath, strict };
}

function splitCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;
  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaping) {
    current += "\\";
  }
  if (quote) {
    throw new Error("Unclosed quote in --test command.");
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function runVerification(root: string, command: string): { exitCode: number } {
  const argv = splitCommandLine(command);
  const executable = argv[0];
  if (!executable) {
    throw new Error("Empty --test command.");
  }
  const result = spawnSync(executable, argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 120_000,
  });
  if (result.error) {
    throw new Error(`Failed to run --test command: ${result.error.message}`);
  }
  return { exitCode: result.status ?? 1 };
}

export async function runNewCommand(args: string[], root: string = process.cwd()): Promise<number> {
  try {
    const parsed = parseNewArgs(args);
    const created = newWorkstream(root, parsed.theme);
    console.log(`session created: ${created.session}`);
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
}

export async function runStartCommand(args: string[], root: string = process.cwd()): Promise<number> {
  try {
    const parsed = parseSessionTaskArgs(args, "start", root);
    startTask(root, parsed);
    console.log(`task started: ${parsed.taskId}`);
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
}

export async function runEvidenceCommand(args: string[], root: string = process.cwd()): Promise<number> {
  try {
    const record = recordEvidence(root, parseEvidenceArgs(args, root));
    console.log(`evidence recorded: ${record.id}`);
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
}

export async function runDoneCommand(args: string[], root: string = process.cwd()): Promise<number> {
  try {
    const parsed = parseDoneArgs(args, root);
    if (parsed.testCommand) {
      const verification = runVerification(root, parsed.testCommand);
      recordEvidence(root, {
        session: parsed.session,
        taskId: parsed.taskId,
        command: parsed.testCommand,
        result: verification.exitCode === 0 ? "passed" : "failed",
        exitCode: verification.exitCode,
      });
      if (verification.exitCode !== 0) {
        console.error(`--test failed with exit code ${verification.exitCode}`);
        return 1;
      }
    }
    doneTask(root, parsed);
    console.log(`task done: ${parsed.taskId}`);
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
}

export async function runLogCommand(args: string[], root: string = process.cwd()): Promise<number> {
  try {
    const parsed = parseLogArgs(args, root);
    const result = appendTimelineEntry(root, parsed.session, parsed.message);
    console.log(`log appended: ${result.logPath}`);
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
}

export async function runVerifyTasksCommand(args: string[], root: string = process.cwd()): Promise<number> {
  try {
    if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) {
      console.log("Usage: afol verify-tasks [session-path] [--strict]");
      return 0;
    }
    const parsed = parseVerifyArgs(args, root);
    const result = verifyWorkbenchTasks(parsed.sessionPath, parsed.strict);
    console.log(formatVerifyReport(result).trimEnd());
    return result.allCompleted ? 0 : 1;
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
}

export async function runCloseCommand(args: string[], root: string = process.cwd()): Promise<number> {
  try {
    const parsed = parseSessionOnlyArgs(args, "close", root);
    closeSession(root, parsed.session);
    console.log(`session closed: ${parsed.session}`);
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
}
