#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runValidationCommand } from "./validate/contract";

type RouteKind = "status" | "validate" | "delegate";
type AliasEntry = {
  short?: string;
  long: string;
  route: RouteKind;
};

const KERNEL_ALIAS_CONTRACT = Object.freeze({
  topLevel: Object.freeze<ReadonlyArray<AliasEntry>>([
    { short: "s", long: "status", route: "status" },
    { short: "v", long: "validate", route: "validate" },
    { long: "check", route: "validate" },
    { long: "start", route: "delegate" },
    { long: "done", route: "delegate" },
    { short: "n", long: "new", route: "delegate" },
    { short: "t", long: "task", route: "delegate" },
    { short: "l", long: "log", route: "delegate" },
    { short: "e", long: "evidence", route: "delegate" },
    { short: "r", long: "rule", route: "delegate" },
    { short: "sk", long: "skill", route: "delegate" },
    { short: "q", long: "query", route: "delegate" },
    { short: "f", long: "file", route: "delegate" },
    { short: "c", long: "close", route: "delegate" },
    { short: "u", long: "undo", route: "delegate" },
    { short: "up", long: "update", route: "delegate" },
    { short: "b", long: "bootstrap", route: "delegate" },
    { short: "ix", long: "index", route: "delegate" },
    { short: "ev", long: "event", route: "delegate" },
    { long: "session", route: "delegate" },
    { long: "verify-tasks", route: "delegate" },
    { long: "runtime", route: "delegate" },
    { long: "tools", route: "delegate" },
    { long: "inspect-target", route: "delegate" },
    { long: "adoption-plan", route: "delegate" },
    { long: "implement", route: "delegate" },
    { long: "wb-update", route: "delegate" },
    { long: "knowledge", route: "delegate" },
    { long: "memory", route: "delegate" },
    { long: "skills-sync", route: "delegate" },
    { long: "scaffold-update", route: "delegate" },
    { long: "doctor", route: "delegate" },
    { long: "mcp", route: "delegate" },
    { long: "benchmark", route: "delegate" },
    { long: "patterns", route: "delegate" },
    { long: "review", route: "delegate" },
    { long: "revert", route: "delegate" },
    { long: "repo-map", route: "delegate" },
    { long: "lint-docs", route: "delegate" },
    { long: "local-state", route: "delegate" },
    { long: "tools-smoke", route: "delegate" },
    { long: "fix-symlinks", route: "delegate" },
  ]),
  flags: Object.freeze({
    help: ["-h", "--help"] as const,
    json: ["-j", "--json"] as const,
  }),
});

const HELP_LINES = [
  "Usage: afol [command] [options]",
  "",
  "Commands",
  "  s, status              Show status",
  "  check                  Run validation checks",
  "  start                  Start the next or selected workbench task",
  "  done                   Complete a task with --test evidence",
  "  close                  Close the active workbench session",
  "  bootstrap              Install scaffold into another repo",
  "  validate               Validation contract and benchmark selector",
  "",
  "Flags",
  "  -j, --json             JSON output for status",
  "  -h, --help             Show this compact help",
  "",
  "Aliases",
  "  s/status v/validate n/new t/task c/close",
  "  e/evidence r/rule q/query sk/skill b/bootstrap a=afol",
  "",
  "Examples",
  "  afol status",
  "  afol check",
  "  afol start --session <id> --task-id T-01",
  "  afol done --session <id> --task-id T-01 --test \"just lint\"",
].join("\n");

const JSON_ALIASES: ReadonlySet<string> = new Set(KERNEL_ALIAS_CONTRACT.flags.json);
const HELP_ALIASES: ReadonlySet<string> = new Set(KERNEL_ALIAS_CONTRACT.flags.help);
const PROJECT_CONFIG_CANDIDATES = ["config.json", "agents.config"] as const;
const TOP_LEVEL_ALIAS_TO_CANONICAL = new Map<string, string>();
const DELEGATED_COMMANDS = new Set<string>();
const KNOWN_COMMANDS = new Set<string>();
const KNOWN_CANONICAL_COMMANDS = new Set<string>();

for (const alias of KERNEL_ALIAS_CONTRACT.topLevel) {
  TOP_LEVEL_ALIAS_TO_CANONICAL.set(alias.long, alias.long);
  KNOWN_COMMANDS.add(alias.long);
  KNOWN_CANONICAL_COMMANDS.add(alias.long);
  if (alias.short) {
    TOP_LEVEL_ALIAS_TO_CANONICAL.set(alias.short, alias.long);
    KNOWN_COMMANDS.add(alias.short);
  }
  if (alias.route === "delegate") {
    DELEGATED_COMMANDS.add(alias.long);
  }
}

const exit = (code: number): never => {
  process.exit(code);
};

function isJsonAlias(value: string): boolean {
  return JSON_ALIASES.has(value);
}

function isHelpAlias(value: string): boolean {
  return HELP_ALIASES.has(value);
}

function canonicalizeTopLevelAlias(value: string): string {
  return TOP_LEVEL_ALIAS_TO_CANONICAL.get(value) ?? value;
}

function isStatusAlias(value: string): boolean {
  return canonicalizeTopLevelAlias(value) === "status";
}

function isValidateAlias(value: string): boolean {
  const canonical = canonicalizeTopLevelAlias(value);
  return canonical === "validate" || canonical === "check";
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
    return ["status"];
  }

  if (isHelpAlias(values[0]) && values.length === 1) {
    return ["--help"];
  }

  const first = values[0];

  if (isStatusAlias(first)) {
    return normalizeStatusInvocation(values);
  }

  if (isJsonAlias(first)) {
    if (values.length === 1) {
      return ["status", "--json"];
    }
    if (isStatusAlias(values[1])) {
      return ["status", ...removeJsonAliases(values.slice(2)), "--json"];
    }
  }

  return [canonicalizeTopLevelAlias(first), ...values.slice(1)];
}

function normalizeDoneInvocation(rest: string[]): string[] {
  const normalized = ["implement", "complete"];
  let hasResult = false;

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--test") {
      normalized.push("--command");
      if (index + 1 < rest.length) {
        index += 1;
        normalized.push(rest[index]);
      }
      continue;
    }
    if (value === "--result") {
      hasResult = true;
    }
    normalized.push(value);
  }

  if (!hasResult) {
    normalized.push("--result", "passed");
  }

  return normalized;
}

function normalizeDelegatedInvocation(values: string[]): string[] {
  const [topLevel, ...rest] = values;
  if (topLevel === "start") {
    return ["implement", "start", ...rest];
  }
  if (topLevel === "done") {
    return normalizeDoneInvocation(rest);
  }
  if (topLevel === "close") {
    return ["session", "close", ...rest];
  }
  return values;
}

function suggestionFor(command: string): string | null {
  const normalizedInput = command.toLowerCase();
  for (const candidate of KNOWN_CANONICAL_COMMANDS) {
    const normalizedCandidate = candidate.toLowerCase();
    if (normalizedCandidate.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCandidate)) {
      return candidate;
    }
  }
  for (const candidate of KNOWN_COMMANDS) {
    const normalizedCandidate = candidate.toLowerCase();
    if (normalizedCandidate.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCandidate)) {
      return canonicalizeTopLevelAlias(candidate);
    }
  }
  return null;
}

function formatUnknownCommandHint(command: string): string {
  const suggestion = suggestionFor(command);
  if (suggestion) {
    return `err unknown-command command=${command} hint=\"run afol -h\" did_you_mean=${suggestion}`;
  }
  return `err unknown-command command=${command} hint=\"run afol -h\"`;
}

type CommandResolution =
  | { kind: "help" }
  | { kind: "validate"; args: string[] }
  | { kind: "delegate"; args: string[] }
  | { kind: "unknown"; message: string; exitCode: number };

function resolveCommand(args: string[]): CommandResolution {
  if (args.length === 1 && isHelpAlias(args[0])) {
    return { kind: "help" };
  }

  const normalized = normalizeArguments(args);
  const [topLevel, ...rest] = normalized;

  if (!topLevel) {
    return { kind: "delegate", args: ["status"] };
  }

  if (topLevel === "--help") {
    return { kind: "help" };
  }

  if (isValidateAlias(topLevel)) {
    return { kind: "validate", args: rest };
  }

  if (isStatusAlias(topLevel)) {
    return { kind: "delegate", args: normalizeStatusInvocation(normalized) };
  }

  if (DELEGATED_COMMANDS.has(topLevel)) {
    return { kind: "delegate", args: normalizeDelegatedInvocation(normalized) };
  }

  if (topLevel.startsWith("-")) {
    return {
      kind: "unknown",
      message: `err unknown-flag flag=${topLevel} hint=\"run afol -h\"`,
      exitCode: 2,
    };
  }

  return {
    kind: "unknown",
    message: formatUnknownCommandHint(topLevel),
    exitCode: 2,
  };
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
  const resolution = resolveCommand(args);
  if (resolution.kind === "help") {
    console.log(HELP_LINES);
    return 0;
  }

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

  if (resolution.kind === "unknown") {
    console.error(resolution.message);
    return resolution.exitCode;
  }

  if (resolution.kind === "validate") {
    return runValidationCommand(projectRoot, resolution.args);
  }

  return runLegacyAdapter(projectRoot, resolution.args);
}

if (import.meta.main) {
  exit(main(process.argv));
}
