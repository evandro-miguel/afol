import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkTemplateUpdate, formatUpdateCheck, type UpdateOperation } from "../services/update/check";

type CommandIo = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
  stdout: (message: string) => console.log(message),
  stderr: (message: string) => console.error(message),
};

type UpdateSubcommand = "check" | "preview" | "apply";

type ParsedUpdateArgs = {
  dryRun: boolean;
  json: boolean;
  session: string;
  taskId: string;
  reason: string;
};

function normalizeSubcommand(value: string | undefined): UpdateSubcommand {
  if (!value || value === "check" || value === "ck") {
    return "check";
  }
  if (value === "preview" || value === "plan") {
    return "preview";
  }
  if (value === "apply" || value === "ap") {
    return "apply";
  }
  throw new Error(`Unknown update command: ${value}`);
}

function isWritableOperation(operation: UpdateOperation): boolean {
  return operation.kind === "create" || operation.kind === "update-managed";
}

function parseUpdateArgs(values: string[]): ParsedUpdateArgs {
  const parsed: ParsedUpdateArgs = {
    dryRun: false,
    json: false,
    session: "",
    taskId: "",
    reason: "",
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--json" || value === "-j") {
      parsed.json = true;
      continue;
    }
    if (value === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (value === "--session" || value === "-S") {
      const next = values[index + 1];
      if (!next) {
        throw new Error("Missing value for --session");
      }
      parsed.session = next;
      index += 1;
      continue;
    }
    if (value === "--task-id" || value === "-T") {
      const next = values[index + 1];
      if (!next) {
        throw new Error("Missing value for --task-id");
      }
      parsed.taskId = next;
      index += 1;
      continue;
    }
    if (value === "--reason") {
      const next = values[index + 1];
      if (!next) {
        throw new Error("Missing value for --reason");
      }
      parsed.reason = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown update argument: ${value}`);
  }

  return parsed;
}

function requireApplyContext(args: ParsedUpdateArgs): void {
  if (!args.session.trim() || !args.taskId.trim() || !args.reason.trim()) {
    throw new Error("Real update apply requires --session, --task-id, and --reason.");
  }
}

function applyUpdateOperations(projectRoot: string, operations: UpdateOperation[], dryRun: boolean): void {
  for (const operation of operations.filter(isWritableOperation)) {
    if (!operation.nextContent) {
      continue;
    }
    const absolutePath = join(projectRoot, operation.path);
    const dir = dirname(absolutePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (dryRun) {
      continue;
    }
    writeFileSync(absolutePath, operation.nextContent, "utf8");
  }
}

export async function runUpdateCommand(
  args: string[],
  projectRoot: string = process.cwd(),
  io: CommandIo = DEFAULT_IO,
): Promise<number> {
  try {
    const [rawCommand, ...rest] = args;
    const command = normalizeSubcommand(rawCommand);
    const parsedArgs = parseUpdateArgs(rest);
    const result = checkTemplateUpdate(projectRoot);
    const writableOperations = result.operations.filter(isWritableOperation);
    const blockedCount = result.operations.filter(
      (operation) =>
        operation.kind === "conflict" ||
        (operation.kind === "preserve-project-owned" &&
          (operation.owner === "project-owned" || operation.owner === "ignored")),
    ).length;

    if (command === "apply") {
      if (!result.hasSource) {
        io.stdout(parsedArgs.json ? JSON.stringify(result) : formatUpdateCheck(result, command).trimEnd());
        return 1;
      }
      if (blockedCount > 0) {
        io.stdout(parsedArgs.json ? JSON.stringify(result) : formatUpdateCheck(result, "apply").trimEnd());
        return 4;
      }
      if (parsedArgs.dryRun) {
        io.stdout(parsedArgs.json ? JSON.stringify(result) : formatUpdateCheck(result, "apply").trimEnd());
        return 0;
      }
      if (writableOperations.length > 0) {
        requireApplyContext(parsedArgs);
      }
      applyUpdateOperations(projectRoot, writableOperations, parsedArgs.dryRun);
      io.stdout(parsedArgs.json ? JSON.stringify(result) : formatUpdateCheck(result, command).trimEnd());
      return 0;
    }

    io.stdout(parsedArgs.json ? JSON.stringify(result) : formatUpdateCheck(result, command).trimEnd());
    return result.hasSource ? 0 : 1;
  } catch (error) {
    io.stderr((error as Error).message);
    return 2;
  }
}
