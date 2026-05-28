#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const HELP_LINES = [
  "Usage: a [command] [options]",
  "",
  "Commands",
  "  s, status              Show status",
  "  status -j/--json       Status as JSON",
  "  new                    Create workstream/session",
  "  task                   Work on session tasks",
  "  session                Work with session lifecycle",
  "  verify-tasks           Verify task completion",
  "  runtime                Run runtime helpers",
  "  tools                  Use tools helpers",
  "",
  "Flags",
  "  -j, --json             JSON output for status shorthand",
  "  -h, --help             Show this compact help",
  "",
  "Aliases",
  "  status -> s",
  "",
  "Examples",
  "  a s",
  "  a -j s",
  "  a status --json",
].join("\n");

const JSON_ALIASES = new Set(["-j", "--json"]);
const STATUS_ALIASES = new Set(["s", "status"]);
const HELP_ALIASES = new Set(["-h", "--help"]);

const exit = (code: number): never => {
  process.exit(code);
};

function isStatusAlias(value: string): boolean {
  return STATUS_ALIASES.has(value);
}

function isJsonAlias(value: string): boolean {
  return JSON_ALIASES.has(value);
}

function isHelpAlias(value: string): boolean {
  return HELP_ALIASES.has(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function loadJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    throw new Error(`Missing required file: ${path}`);
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${(error as Error).message}`);
  }
  try {
    const value = JSON.parse(raw);
    if (!isObject(value)) {
      throw new Error("Top-level JSON must be an object");
    }
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : `${error}`;
    throw new Error(`Invalid JSON in ${path}: ${message}`);
  }
}

function removeJsonAliases(values: string[]): string[] {
  return values.filter((value) => !isJsonAlias(value));
}

function normalizeStatusInvocation(values: string[]): string[] {
  if (values.length === 0) {
    return [];
  }
  if (!isStatusAlias(values[0])) {
    return values;
  }
  const rest = values.slice(1);
  const hasJson = rest.some(isJsonAlias);
  return ["status", ...removeJsonAliases(rest), ...(hasJson ? ["--json"] : [])];
}

function normalizeArguments(values: string[]): string[] {
  if (values.length === 0) {
    return [];
  }

  if (values[0] && isHelpAlias(values[0])) {
    return [];
  }

  if (isStatusAlias(values[0])) {
    return normalizeStatusInvocation(values);
  }

  if (isJsonAlias(values[0])) {
    if (values.length === 1) {
      return ["status", "--json"];
    }
    if (isStatusAlias(values[1])) {
      return ["status", ...removeJsonAliases(values.slice(2)), "--json"];
    }
  }

  return values;
}

function findProjectRoot(startPath: string): string | null {
  let current = resolve(startPath);
  while (true) {
    const configPath = join(current, ".agents", "config.json");
    if (existsSync(configPath)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function runLegacyAdapter(projectRoot: string, args: string[]): never {
  const agents = join(projectRoot, ".agents", "agents");
  if (!existsSync(agents)) {
    console.error(`❌ Missing executable wrapper: ${agents}`);
    return exit(127);
  }

  const result = spawnSync(agents, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to run ${agents}: ${result.error.message}`);
    return exit(127);
  }

  if (result.signal) {
    console.error(`Command terminated by signal: ${result.signal}`);
    return exit(1);
  }

  return exit(result.status ?? 0);
}

export function main(argv: string[]): number {
  const args = argv.slice(2);
  if (args.some(isHelpAlias)) {
    console.log(HELP_LINES);
    return 0;
  }

  const normalized = normalizeArguments(args);

  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    console.error("❌ Could not detect project root: .agents/config.json not found.");
    return 3;
  }

  try {
    loadJson(join(projectRoot, ".agents", "config.json"));
    loadJson(join(projectRoot, ".agents", "lock.json"));
    const manifestPath = join(projectRoot, ".agents", "manifest.json");
    if (existsSync(manifestPath)) {
      loadJson(manifestPath);
    }
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  const command = normalized.length === 0 ? ["status"] : normalized;
  if (command[0] === "status" && command.includes("--json")) {
    // status is passed through directly with json when requested
  }
  return runLegacyAdapter(projectRoot, command);
}

if (import.meta.main) {
  exit(main(process.argv));
}
