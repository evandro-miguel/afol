import { validateProjectStructure } from "../services/project/validate";

type CommandIo = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
  stdout: (message: string) => {
    console.log(message);
  },
  stderr: (message: string) => {
    console.error(message);
  },
};

function parseValidateArgs(args: string[]): { json: boolean; checkDrift: boolean } {
  let json = false;
  let checkDrift = false;
  const values = [...args];
  if (values[0] === "validate") {
    values.shift();
  }

  for (const value of values) {
    if (value === "--json" || value === "-j") {
      json = true;
      continue;
    }
    if (value === "--check-drift") {
      checkDrift = true;
      continue;
    }
    if (value.startsWith("-")) {
      throw new Error(`Unknown validate argument: ${value}`);
    }
    throw new Error(`Unexpected validate argument: ${value}`);
  }

  return { json, checkDrift };
}

function formatReport(report: Awaited<ReturnType<typeof validateProjectStructure>>): string {
  const failed = report.checks.filter((check) => !check.ok);
  return [
    `validate: ${report.ok ? "passed" : "failed"}`,
    `checks: ${report.checks.length}`,
    `failed: ${failed.length}`,
    ...report.checks.map((check) => `${check.ok ? "ok" : "fail"} ${check.id} ${check.message}`),
  ].join("\n");
}

export async function runValidateCommand(
  projectRoot: string,
  args: string[],
  io: CommandIo = DEFAULT_IO,
): Promise<number> {
  let parsed: { json: boolean; checkDrift: boolean };
  try {
    parsed = parseValidateArgs(args);
  } catch (error) {
    io.stderr((error as Error).message);
    return 2;
  }

  const report = await validateProjectStructure(projectRoot, { checkDrift: parsed.checkDrift });

  if (parsed.json) {
    io.stdout(JSON.stringify(report));
  } else {
    io.stdout(formatReport(report));
  }

  return report.ok ? 0 : 2;
}
