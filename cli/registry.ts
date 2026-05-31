export type CommandKind =
  | "status"
  | "validate"
  | "init"
  | "bootstrap"
  | "new"
  | "start"
  | "evidence"
  | "done"
  | "close"
  | "log"
  | "verifyTasks"
  | "rule"
  | "skill"
  | "update"
  | "file"
  | "delegate";
export type CommandSideEffect = "read" | "write" | "append" | "generated";

export type CommandSpec = {
  command: string;
  aliases: readonly string[];
  kind: CommandKind;
  sideEffect: CommandSideEffect;
};

const COMMAND_SPECS: readonly CommandSpec[] = Object.freeze([
  { command: "status", aliases: ["s"], kind: "status", sideEffect: "read" },
  { command: "validate", aliases: ["v", "ck", "check"], kind: "validate", sideEffect: "read" },
  { command: "init", aliases: [], kind: "init", sideEffect: "write" },
  { command: "start", aliases: ["st"], kind: "start", sideEffect: "write" },
  { command: "done", aliases: ["d"], kind: "done", sideEffect: "write" },
  { command: "new", aliases: ["n"], kind: "new", sideEffect: "write" },
  { command: "task", aliases: ["t"], kind: "delegate", sideEffect: "write" },
  { command: "log", aliases: ["l"], kind: "log", sideEffect: "append" },
  { command: "evidence", aliases: ["e"], kind: "evidence", sideEffect: "append" },
  { command: "rule", aliases: ["r"], kind: "rule", sideEffect: "read" },
  { command: "skill", aliases: ["sk"], kind: "skill", sideEffect: "read" },
  { command: "query", aliases: ["q"], kind: "delegate", sideEffect: "read" },
  { command: "close", aliases: ["c"], kind: "close", sideEffect: "write" },
  { command: "file", aliases: ["f"], kind: "file", sideEffect: "write" },
  { command: "undo", aliases: ["u"], kind: "delegate", sideEffect: "write" },
  { command: "update", aliases: ["up"], kind: "update", sideEffect: "read" },
  { command: "bootstrap", aliases: ["b"], kind: "bootstrap", sideEffect: "write" },
  { command: "index", aliases: ["ix"], kind: "delegate", sideEffect: "generated" },
  { command: "event", aliases: ["ev"], kind: "delegate", sideEffect: "append" },
  { command: "session", aliases: [], kind: "delegate", sideEffect: "write" },
  { command: "verify", aliases: ["vf"], kind: "verifyTasks", sideEffect: "read" },
  { command: "verify-tasks", aliases: [], kind: "verifyTasks", sideEffect: "read" },
  { command: "runtime", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "tools", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "inspect-target", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "adoption-plan", aliases: [], kind: "delegate", sideEffect: "write" },
  { command: "implement", aliases: [], kind: "delegate", sideEffect: "write" },
  { command: "wb-update", aliases: [], kind: "delegate", sideEffect: "write" },
  { command: "knowledge", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "memory", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "skills-sync", aliases: [], kind: "delegate", sideEffect: "write" },
  { command: "scaffold-update", aliases: [], kind: "delegate", sideEffect: "write" },
  { command: "doctor", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "mcp", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "benchmark", aliases: [], kind: "delegate", sideEffect: "generated" },
  { command: "patterns", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "review", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "revert", aliases: [], kind: "delegate", sideEffect: "write" },
  { command: "repo-map", aliases: [], kind: "delegate", sideEffect: "generated" },
  { command: "lint-docs", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "local-state", aliases: [], kind: "delegate", sideEffect: "generated" },
  { command: "tools-smoke", aliases: [], kind: "delegate", sideEffect: "read" },
  { command: "fix-symlinks", aliases: [], kind: "delegate", sideEffect: "write" },
]);

const HELP_ALIASES = Object.freeze(["-h", "--help"] as const);
const JSON_ALIASES = Object.freeze(["-j", "--json"] as const);

const aliasToCommand = new Map<string, string>();
const commandToSpec = new Map<string, CommandSpec>();
const knownTokens = new Set<string>();

for (const spec of COMMAND_SPECS) {
  commandToSpec.set(spec.command, spec);
  aliasToCommand.set(spec.command, spec.command);
  knownTokens.add(spec.command);
  for (const alias of spec.aliases) {
    aliasToCommand.set(alias, spec.command);
    knownTokens.add(alias);
  }
}

function canonicalize(token: string): string {
  return aliasToCommand.get(token) ?? token;
}

export const kernelRegistry = {
  commands: COMMAND_SPECS,
  flags: {
    help: HELP_ALIASES,
    json: JSON_ALIASES,
  },
  canonicalize,
  isHelpAlias(value: string): boolean {
    return HELP_ALIASES.includes(value as (typeof HELP_ALIASES)[number]);
  },
  isJsonAlias(value: string): boolean {
    return JSON_ALIASES.includes(value as (typeof JSON_ALIASES)[number]);
  },
  resolveKind(value: string): CommandKind | null {
    const canonical = canonicalize(value);
    const spec = commandToSpec.get(canonical);
    return spec?.kind ?? null;
  },
  knownCanonicalCommands(): readonly string[] {
    return [...commandToSpec.keys()];
  },
  knownTokens(): readonly string[] {
    return [...knownTokens.values()];
  },
};
