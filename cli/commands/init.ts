import { resolve } from "node:path";
import { runBootstrapCommand } from "./bootstrap";

type InitArgs = {
  targetRoot: string;
  forwarded: string[];
};

function parseInitArgs(args: string[]): InitArgs {
  let targetRoot = "";
  const forwarded: string[] = [];

  for (const arg of args) {
    if (arg === "--dry-run" || arg === "--force-managed" || arg === "--partial") {
      forwarded.push(arg);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown init argument: ${arg}`);
    }
    if (!targetRoot) {
      targetRoot = arg;
      continue;
    }
    throw new Error(`Unexpected init argument: ${arg}`);
  }

  return {
    targetRoot: resolve(targetRoot || process.cwd()),
    forwarded,
  };
}

export async function runInitCommand(args: string[]): Promise<number> {
  let parsed: InitArgs;
  try {
    parsed = parseInitArgs(args);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  return runBootstrapCommand([parsed.targetRoot, ...parsed.forwarded]);
}
