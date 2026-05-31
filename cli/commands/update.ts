import { checkTemplateUpdate, formatUpdateCheck } from "../services/update/check";

type CommandIo = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
  stdout: (message: string) => console.log(message),
  stderr: (message: string) => console.error(message),
};

function normalizeSubcommand(value: string | undefined): "check" | "preview" {
  if (!value || value === "check" || value === "ck") {
    return "check";
  }
  if (value === "preview" || value === "plan") {
    return "preview";
  }
  throw new Error(`Unknown update command: ${value}`);
}

export async function runUpdateCommand(
  args: string[],
  projectRoot: string = process.cwd(),
  io: CommandIo = DEFAULT_IO,
): Promise<number> {
  try {
    const [rawCommand, ...rest] = args;
    const command = normalizeSubcommand(rawCommand);
    let json = false;
    for (const value of rest) {
      if (value === "--json" || value === "-j") {
        json = true;
        continue;
      }
      throw new Error(`Unknown update argument: ${value}`);
    }
    const result = checkTemplateUpdate(projectRoot);
    io.stdout(json ? JSON.stringify(result) : formatUpdateCheck(result, command).trimEnd());
    return result.hasSource ? 0 : 1;
  } catch (error) {
    io.stderr((error as Error).message);
    return 2;
  }
}
