#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runValidationCommand } from "./validate/contract";

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
  "  v, validate            Validation contract and benchmark selector",
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
const VALIDATE_ALIASES = new Set(["v", "validate"]);
const PROJECT_CONFIG_CANDIDATES = ["config.json", "agents.config"] as const;

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

function isValidateAlias(value: string): boolean {
  return VALIDATE_ALIASES.has(value);
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

function loadYaml(path: string): Record<string, unknown> {
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
    const value = Bun.YAML.parse(raw);
    if (!isObject(value)) {
      throw new Error("Top-level YAML must be a mapping");
    }
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : `${error}`;
    throw new Error(`Invalid YAML in ${path}: ${message}`);
  }
}

function loadProjectConfig(path: string): Record<string, unknown> {
  if (path.endsWith("agents.config")) {
    return loadYaml(path);
  }
  return loadJson(path);
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

function signalExitCode(signal: string): number {
  const signalNumber = osConstants.signals[signal as keyof typeof osConstants.signals];
  return typeof signalNumber === "number" ? 128 + signalNumber : 1;
}

function findProjectRoot(startPath: string): { root: string; configPath: string } | null {
  let current = resolve(startPath);
  while (true) {
    for (const configName of PROJECT_CONFIG_CANDIDATES) {
      const configPath = join(current, ".agents", configName);
      if (existsSync(configPath)) {
        return { root: current, configPath };
      }
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
    return exit(signalExitCode(result.signal));
  }

  return exit(result.status ?? 0);
}

export function main(argv: string[]): number {
  const args = argv.slice(2);
  if (args.length === 1 && isHelpAlias(args[0])) {
    console.log(HELP_LINES);
    return 0;
  }

  const normalized = normalizeArguments(args);

  const project = findProjectRoot(process.cwd());
  if (!project) {
    console.error("❌ Could not detect project root: .agents/config.json or .agents/agents.config not found.");
    return 3;
  }
  const projectRoot = project.root;

  try {
    loadProjectConfig(project.configPath);
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
  if (command.length > 0 && isValidateAlias(command[0])) {
    return runValidationCommand(projectRoot, command.slice(1));
  }
  if (command[0] === "status" && command.includes("--json")) {
    // status is passed through directly with json when requested
  }
  return runLegacyAdapter(projectRoot, command);
}

if (import.meta.main) {
  exit(main(process.argv));
}
