import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REGISTRY_RELATIVE_PATH = ".agents/data/benchmarks/registry.json";
const SCENARIOS_RELATIVE_PATH = ".agents/data/benchmarks/scenarios";
const BASELINES_RELATIVE_PATH = ".agents/data/benchmarks/baselines";
const RESULTS_RELATIVE_PATH = ".agents/data/benchmarks/results";

export const VALIDATION_SCHEMA_VERSION = "1.0.0";
export const BENCHMARK_RESULT_SCHEMA_VERSION = "1.0.0";

export const REQUIRED_PACKS = [
  "cli-kernel-local",
  "routing-accuracy",
  "mutation-safety",
  "update-safety",
  "workbench-parity",
  "mcp-parity",
  "runtime-live-agent",
  "token-economy",
] as const;

export type PackId = (typeof REQUIRED_PACKS)[number];

export type ValidationScope = "default" | "wb" | "tpl" | "update";

export interface Scenario {
  schema_version: string;
  scenario_id: string;
  scenario_version: string;
  pack_id: PackId;
  command: string;
  result_schema: string;
  oracle: string;
  thresholds: Record<string, number>;
  baseline_id: string;
  deterministic_metrics: Record<string, number>;
  implementation_status?: "implemented" | "skipped";
}

interface Baseline {
  baseline_id: string;
  pack_id: PackId;
  schema_version: string;
  timing_p50_ms?: number;
  timing_p95_ms?: number;
}

interface PackMetadata {
  pack_id: PackId;
  min_scenarios: number;
  selector_tags: string[];
}

export interface RegistrySnapshot {
  schema_version: string;
  packs: PackMetadata[];
  scenariosByPack: Record<string, Scenario[]>;
  baselinesByPack: Record<string, Baseline>;
}

interface SelectorInput {
  scope: ValidationScope;
  changedPaths: string[];
}

interface SelectorOutput {
  selected_pack_ids: PackId[];
  reasons: string[];
}

interface BenchmarkResult {
  schema_version: string;
  run_id: string;
  scenario_id: string;
  scenario_version: string;
  pack_id: PackId;
  status: "passed" | "failed" | "skipped" | "baseline-missing";
  baseline_id: string;
  baseline_reference: string;
  threshold_reference: Record<string, number>;
  pass: boolean;
  duration_ms: number;
  timing_p50_ms: number;
  timing_p95_ms: number;
  error_count: number;
  retry_count: number;
  context_tokens: number;
  prompt_tokens: number;
  output_tokens: number;
  context_bytes: number;
  output_bytes: number;
  tool_call_count: number;
  tool_success_rate: number;
  git_commit: string;
  notes: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid or missing string field: ${key}`);
  }
  return value;
}

function asNumberRecord(value: unknown, key: string): Record<string, number> {
  if (!isObject(value)) {
    throw new Error(`Invalid or missing object field: ${key}`);
  }
  const result: Record<string, number> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== "number" || Number.isNaN(entryValue)) {
      throw new Error(`Invalid numeric threshold field: ${key}.${entryKey}`);
    }
    result[entryKey] = entryValue;
  }
  return result;
}

function asOptionalNumber(value: unknown, key: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid numeric field: ${key}`);
  }
  return value;
}

function loadJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    throw new Error(`Missing required file: ${path}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!isObject(parsed)) {
    throw new Error(`Invalid JSON object: ${path}`);
  }
  return parsed;
}

function parsePackId(value: unknown, key: string): PackId {
  const packId = asString(value, key);
  if (!REQUIRED_PACKS.includes(packId as PackId)) {
    throw new Error(`Unknown pack id in ${key}: ${packId}`);
  }
  return packId as PackId;
}

function parseScenario(data: Record<string, unknown>, sourcePath: string): Scenario {
  const scenario: Scenario = {
    schema_version: asString(data.schema_version, `${sourcePath}.schema_version`),
    scenario_id: asString(data.scenario_id, `${sourcePath}.scenario_id`),
    scenario_version: asString(data.scenario_version, `${sourcePath}.scenario_version`),
    pack_id: parsePackId(data.pack_id, `${sourcePath}.pack_id`),
    command: asString(data.command, `${sourcePath}.command`),
    result_schema: asString(data.result_schema, `${sourcePath}.result_schema`),
    oracle: asString(data.oracle, `${sourcePath}.oracle`),
    thresholds: asNumberRecord(data.thresholds, `${sourcePath}.thresholds`),
    baseline_id: asString(data.baseline_id, `${sourcePath}.baseline_id`),
    deterministic_metrics: asNumberRecord(
      data.deterministic_metrics,
      `${sourcePath}.deterministic_metrics`,
    ),
  };
  if (typeof data.implementation_status === "string") {
    if (data.implementation_status === "implemented" || data.implementation_status === "skipped") {
      scenario.implementation_status = data.implementation_status;
    }
  }
  return scenario;
}

function parseBaseline(data: Record<string, unknown>, sourcePath: string): Baseline {
  return {
    baseline_id: asString(data.baseline_id, `${sourcePath}.baseline_id`),
    pack_id: parsePackId(data.pack_id, `${sourcePath}.pack_id`),
    schema_version: asString(data.schema_version, `${sourcePath}.schema_version`),
    timing_p50_ms: asOptionalNumber(data.timing_p50_ms, `${sourcePath}.timing_p50_ms`),
    timing_p95_ms: asOptionalNumber(data.timing_p95_ms, `${sourcePath}.timing_p95_ms`),
  };
}

function getGitCommit(projectRoot: string): string {
  const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return "unknown";
  }
  return (result.stdout || "").trim() || "unknown";
}

function loadPackMetadata(registryPath: string): PackMetadata[] {
  const registry = loadJsonObject(registryPath);
  const schemaVersion = asString(registry.schema_version, "registry.schema_version");
  if (schemaVersion !== VALIDATION_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported registry schema_version: ${schemaVersion} (expected ${VALIDATION_SCHEMA_VERSION})`,
    );
  }
  const packsRaw = registry.packs;
  if (!Array.isArray(packsRaw)) {
    throw new Error("Invalid registry: packs must be an array");
  }
  return packsRaw.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Invalid registry.packs[${index}]`);
    }
    const selectorTags = Array.isArray(entry.selector_tags)
      ? entry.selector_tags.filter((tag): tag is string => typeof tag === "string")
      : [];
    return {
      pack_id: parsePackId(entry.pack_id, `registry.packs[${index}].pack_id`),
      min_scenarios: Number(entry.min_scenarios ?? 0),
      selector_tags: selectorTags,
    };
  });
}

export function loadRegistry(projectRoot: string): RegistrySnapshot {
  const registryPath = join(projectRoot, REGISTRY_RELATIVE_PATH);
  const packs = loadPackMetadata(registryPath);

  const scenariosByPack: Record<string, Scenario[]> = {};
  for (const pack of packs) {
    const packPath = join(projectRoot, SCENARIOS_RELATIVE_PATH, pack.pack_id);
    if (!existsSync(packPath)) {
      scenariosByPack[pack.pack_id] = [];
      continue;
    }
    const scenarios = readdirSync(packPath)
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .map((entry) => {
        const path = join(packPath, entry);
        return parseScenario(loadJsonObject(path), path);
      });
    scenariosByPack[pack.pack_id] = scenarios;
  }

  const baselinesByPack: Record<string, Baseline> = {};
  for (const pack of packs) {
    const baselinePath = join(projectRoot, BASELINES_RELATIVE_PATH, pack.pack_id, "baseline-v1.json");
    if (!existsSync(baselinePath)) {
      continue;
    }
    baselinesByPack[pack.pack_id] = parseBaseline(loadJsonObject(baselinePath), baselinePath);
  }

  return {
    schema_version: VALIDATION_SCHEMA_VERSION,
    packs,
    scenariosByPack,
    baselinesByPack,
  };
}

export function validateRegistryContract(snapshot: RegistrySnapshot): string[] {
  const issues: string[] = [];
  for (const packId of REQUIRED_PACKS) {
    const pack = snapshot.packs.find((entry) => entry.pack_id === packId);
    if (!pack) {
      issues.push(`missing-pack:${packId}`);
      continue;
    }
    const scenarios = snapshot.scenariosByPack[packId] ?? [];
    if (scenarios.length < pack.min_scenarios) {
      issues.push(`insufficient-scenarios:${packId}:${scenarios.length}<${pack.min_scenarios}`);
    }
    for (const scenario of scenarios) {
      if (scenario.pack_id !== packId) {
        issues.push(`scenario-pack-mismatch:${packId}:${scenario.scenario_id}`);
      }
      if (scenario.schema_version !== VALIDATION_SCHEMA_VERSION) {
        issues.push(
          `scenario-schema-version-mismatch:${packId}:${scenario.scenario_id}:${scenario.schema_version}`,
        );
      }
      if (scenario.result_schema !== BENCHMARK_RESULT_SCHEMA_VERSION) {
        issues.push(`scenario-schema-mismatch:${packId}:${scenario.scenario_id}`);
      }
      if (!scenario.oracle || Object.keys(scenario.thresholds).length === 0) {
        issues.push(`scenario-contract-missing:${packId}:${scenario.scenario_id}`);
      }
    }
    const baseline = snapshot.baselinesByPack[packId];
    if (!baseline) {
      issues.push(`missing-baseline:${packId}`);
      continue;
    }
    if (baseline.schema_version !== VALIDATION_SCHEMA_VERSION) {
      issues.push(`baseline-schema-version-mismatch:${packId}:${baseline.schema_version}`);
    }
  }
  return issues;
}

function defaultPackSelection(changedPaths: string[]): SelectorOutput {
  const normalizePath = (value: string): string => value.replace(/\\/g, "/").replace(/^\.\//, "");
  const hasPrefix = (value: string, prefixes: readonly string[]): boolean =>
    prefixes.some((prefix) => value.startsWith(prefix));
  const isPromptContextDoc = (value: string): boolean => {
    if (!value.startsWith("docs/")) {
      return false;
    }
    const lower = value.toLowerCase();
    return lower.includes("prompt") || lower.includes("context");
  };

  if (changedPaths.length === 0) {
    return {
      selected_pack_ids: [
        "cli-kernel-local",
        "routing-accuracy",
        "mutation-safety",
        "update-safety",
        "workbench-parity",
        "mcp-parity",
        "runtime-live-agent",
        "token-economy",
      ],
      reasons: ["default-no-paths"],
    };
  }
  const selected = new Set<PackId>();
  const reasons: string[] = [];
  for (const changedPath of changedPaths) {
    const normalizedPath = normalizePath(changedPath);
    if (hasPrefix(normalizedPath, [".agents/runtime/"])) {
      selected.add("mcp-parity");
      selected.add("runtime-live-agent");
      reasons.push(`runtime-change:${changedPath}`);
      continue;
    }
    if (hasPrefix(normalizedPath, ["cli/mcp/"])) {
      selected.add("mcp-parity");
      reasons.push(`mcp-change:${changedPath}`);
      continue;
    }
    if (hasPrefix(normalizedPath, ["cli/rules/", "cli/skills/"])) {
      selected.add("routing-accuracy");
      reasons.push(`routing-change:${changedPath}`);
      continue;
    }
    if (hasPrefix(normalizedPath, ["cli/update/"])) {
      selected.add("update-safety");
      reasons.push(`update-change:${changedPath}`);
      continue;
    }
    if (hasPrefix(normalizedPath, ["cli/files/"])) {
      selected.add("mutation-safety");
      reasons.push(`mutation-change:${changedPath}`);
      continue;
    }
    if (hasPrefix(normalizedPath, ["cli/"])) {
      selected.add("cli-kernel-local");
      reasons.push(`cli-change:${changedPath}`);
      continue;
    }
    if (hasPrefix(normalizedPath, [".agents/wb/"])) {
      selected.add("workbench-parity");
      reasons.push(`workbench-change:${changedPath}`);
      continue;
    }
    if (isPromptContextDoc(normalizedPath)) {
      selected.add("token-economy");
      reasons.push(`prompt-context-doc-change:${changedPath}`);
      continue;
    }
  }
  if (selected.size === 0) {
    selected.add("cli-kernel-local");
    reasons.push("fallback-default");
  }
  return {
    selected_pack_ids: [...selected].sort() as PackId[],
    reasons,
  };
}

export function selectPacks(input: SelectorInput): SelectorOutput {
  if (input.scope === "wb") {
    return {
      selected_pack_ids: ["workbench-parity"],
      reasons: ["scope-wb"],
    };
  }
  if (input.scope === "tpl") {
    return {
      selected_pack_ids: ["cli-kernel-local"],
      reasons: ["scope-tpl"],
    };
  }
  if (input.scope === "update") {
    return {
      selected_pack_ids: ["cli-kernel-local"],
      reasons: ["scope-update"],
    };
  }
  return defaultPackSelection(input.changedPaths);
}

function buildResult(
  projectRoot: string,
  scenario: Scenario,
  baselinePath: string,
  baseline: Baseline | undefined,
): BenchmarkResult {
  const metrics = scenario.deterministic_metrics;
  const notes: string[] = [];
  for (const [thresholdKey, thresholdValue] of Object.entries(scenario.thresholds)) {
    const metricKey =
      thresholdKey === "max_p95_ms" || thresholdKey === "min_p95_ms"
        ? "timing_p95_ms"
        : thresholdKey === "max_p50_ms" || thresholdKey === "min_p50_ms"
          ? "timing_p50_ms"
          : thresholdKey.startsWith("max_") || thresholdKey.startsWith("min_")
            ? thresholdKey.slice(4)
            : null;
    if (!metricKey) {
      notes.push(`unsupported-threshold:${thresholdKey}`);
      continue;
    }
    const metricValue = metrics[metricKey];
    if (typeof metricValue !== "number" || Number.isNaN(metricValue)) {
      notes.push(`threshold-metric-missing:${thresholdKey}`);
      continue;
    }
    if (thresholdKey.startsWith("max_") && metricValue > thresholdValue) {
      notes.push(`threshold-exceeded:${thresholdKey}:${metricValue}>${thresholdValue}`);
    } else if (thresholdKey.startsWith("min_") && metricValue < thresholdValue) {
      notes.push(`threshold-below-min:${thresholdKey}:${metricValue}<${thresholdValue}`);
    }
  }
  if (baseline) {
    if (
      typeof baseline.timing_p50_ms === "number"
      && typeof metrics.timing_p50_ms === "number"
      && metrics.timing_p50_ms > baseline.timing_p50_ms
    ) {
      notes.push(`baseline-regression:timing_p50_ms:${metrics.timing_p50_ms}>${baseline.timing_p50_ms}`);
    }
    if (
      typeof baseline.timing_p95_ms === "number"
      && typeof metrics.timing_p95_ms === "number"
      && metrics.timing_p95_ms > baseline.timing_p95_ms
    ) {
      notes.push(`baseline-regression:timing_p95_ms:${metrics.timing_p95_ms}>${baseline.timing_p95_ms}`);
    }
  }
  const status: BenchmarkResult["status"] =
    scenario.implementation_status === "skipped"
      ? "skipped"
      : !baseline
        ? "baseline-missing"
        : notes.length > 0
          ? "failed"
          : "passed";
  return {
    schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
    run_id: `det-${scenario.pack_id}-${scenario.scenario_id}-${scenario.scenario_version}`,
    scenario_id: scenario.scenario_id,
    scenario_version: scenario.scenario_version,
    pack_id: scenario.pack_id,
    status,
    baseline_id: scenario.baseline_id,
    baseline_reference: relative(projectRoot, baselinePath).replaceAll("\\", "/"),
    threshold_reference: scenario.thresholds,
    pass: status === "passed",
    duration_ms: metrics.duration_ms ?? 0,
    timing_p50_ms: metrics.timing_p50_ms ?? metrics.duration_ms ?? 0,
    timing_p95_ms: metrics.timing_p95_ms ?? metrics.duration_ms ?? 0,
    error_count: metrics.error_count ?? 0,
    retry_count: metrics.retry_count ?? 0,
    context_tokens: metrics.context_tokens ?? 0,
    prompt_tokens: metrics.prompt_tokens ?? 0,
    output_tokens: metrics.output_tokens ?? 0,
    context_bytes: metrics.context_bytes ?? 0,
    output_bytes: metrics.output_bytes ?? 0,
    tool_call_count: metrics.tool_call_count ?? 1,
    tool_success_rate: metrics.tool_success_rate ?? 1,
    git_commit: getGitCommit(projectRoot),
    notes:
      status === "skipped"
        ? ["not-implemented-live-runner"]
        : status === "baseline-missing"
          ? ["baseline-missing"]
          : notes,
  };
}

function outputJson(payload: Record<string, unknown>): number {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  return 0;
}

function timestampSlug(now: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return [
    String(now.getUTCFullYear()),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
  ].join("")
    + "_"
    + [pad(now.getUTCHours()), pad(now.getUTCMinutes()), pad(now.getUTCSeconds())].join("");
}

function stableResultFileName(selectedPacks: PackId[]): string {
  const packPart = selectedPacks.length === 1
    ? selectedPacks[0]
    : selectedPacks.length > 1
      ? `${selectedPacks[0]}-multi`
      : "benchmark";
  return `${timestampSlug()}_${packPart}.json`;
}

function resolveOutputPath(projectRoot: string, outputPath: string): string {
  return isAbsolute(outputPath) ? outputPath : resolve(projectRoot, outputPath);
}

function saveBenchmarkPayload(
  projectRoot: string,
  payload: Record<string, unknown>,
  selectedPacks: PackId[],
  outputPathArg?: string,
): string {
  const defaultPath = join(projectRoot, RESULTS_RELATIVE_PATH, stableResultFileName(selectedPacks));
  const outputPath = outputPathArg ? resolveOutputPath(projectRoot, outputPathArg) : defaultPath;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return relative(projectRoot, outputPath).replaceAll("\\", "/");
}

function parseArgs(args: string[]): {
  mode: "select" | "bench";
  scope: ValidationScope;
  changedPaths: string[];
  explicitPacks: PackId[];
  save: boolean;
  outputPath?: string;
} {
  let mode: "select" | "bench" = "select";
  let scope: ValidationScope = "default";
  const changedPaths: string[] = [];
  const explicitPacks: PackId[] = [];
  let save = false;
  let outputPath: string | undefined;

  let index = 0;
  if (args[index] === "bench") {
    mode = "bench";
    index += 1;
  } else {
    const scopeArg = args[index];
    if (scopeArg === "wb" || scopeArg === "tpl" || scopeArg === "update") {
      scope = scopeArg;
      index += 1;
    }
  }

  while (index < args.length) {
    const token = args[index];
    if (token === "--changed-path" && args[index + 1]) {
      changedPaths.push(args[index + 1]);
      index += 2;
      continue;
    }
    if (token === "--pack" && args[index + 1]) {
      const pack = args[index + 1];
      if (!REQUIRED_PACKS.includes(pack as PackId)) {
        throw new Error(`Unknown --pack value: ${pack}`);
      }
      explicitPacks.push(pack as PackId);
      index += 2;
      continue;
    }
    if (token === "--json") {
      index += 1;
      continue;
    }
    if (token === "--save") {
      save = true;
      index += 1;
      continue;
    }
    if (token === "--output") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --output");
      }
      outputPath = value;
      index += 2;
      continue;
    }
    throw new Error(`Unknown validation argument: ${token}`);
  }

  return {
    mode,
    scope,
    changedPaths,
    explicitPacks,
    save,
    outputPath,
  };
}

function handleSelect(snapshot: RegistrySnapshot, scope: ValidationScope, changedPaths: string[]): number {
  const selection = selectPacks({ scope, changedPaths });
  return outputJson({
    schema_version: VALIDATION_SCHEMA_VERSION,
    command_family: "validation",
    mode: "select",
    scope,
    selected_pack_ids: selection.selected_pack_ids,
    reasons: selection.reasons,
    registry: snapshot.packs.map((entry) => ({
      pack_id: entry.pack_id,
      min_scenarios: entry.min_scenarios,
      scenario_count: (snapshot.scenariosByPack[entry.pack_id] ?? []).length,
      baseline_present: Boolean(snapshot.baselinesByPack[entry.pack_id]),
    })),
    contract_issues: validateRegistryContract(snapshot),
  });
}

function handleBenchmark(
  projectRoot: string,
  snapshot: RegistrySnapshot,
  scope: ValidationScope,
  changedPaths: string[],
  explicitPacks: PackId[],
  persist: boolean,
  outputPath?: string,
): number {
  const selection = selectPacks({ scope, changedPaths });
  const selectedPacks = explicitPacks.length > 0 ? explicitPacks : selection.selected_pack_ids;
  const results: BenchmarkResult[] = [];
  for (const packId of selectedPacks) {
    const scenarios = snapshot.scenariosByPack[packId] ?? [];
    const baselinePath = join(projectRoot, BASELINES_RELATIVE_PATH, packId, "baseline-v1.json");
    const baseline = snapshot.baselinesByPack[packId];
    for (const scenario of scenarios) {
      results.push(buildResult(projectRoot, scenario, baselinePath, baseline));
    }
  }
  const passed = results.filter((entry) => entry.status === "passed").length;
  const failed = results.filter((entry) => entry.status === "failed").length;
  const skipped = results.filter((entry) => entry.status === "skipped").length;
  const baselineMissing = results.filter((entry) => entry.status === "baseline-missing").length;
  const contractIssues = validateRegistryContract(snapshot);
  const pass = failed === 0 && baselineMissing === 0 && skipped === 0 && contractIssues.length === 0;
  const allSkipped =
    results.length > 0
    && skipped === results.length
    && failed === 0
    && baselineMissing === 0
    && contractIssues.length === 0;
  const status: "passed" | "failed" | "skipped" = pass ? "passed" : allSkipped ? "skipped" : "failed";
  const notes = allSkipped ? ["all-scenarios-skipped:not-implemented-live-runner"] : [];
  const payload: Record<string, unknown> = {
    schema_version: VALIDATION_SCHEMA_VERSION,
    command_family: "validation",
    mode: "benchmark",
    benchmark_result_schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
    status,
    pass,
    selected_pack_ids: selectedPacks,
    selection_reasons: selection.reasons,
    result_count: results.length,
    notes,
    summary: {
      total: results.length,
      passed,
      failed,
      skipped,
      baseline_missing: baselineMissing,
    },
    results,
    contract_issues: contractIssues,
  };
  if (persist || outputPath) {
    const savedResultPath = saveBenchmarkPayload(projectRoot, payload, selectedPacks, outputPath);
    payload.saved_result_path = savedResultPath;
    payload.saved_result_file = basename(savedResultPath);
  }
  return outputJson(payload);
}

export function runValidationCommand(projectRoot: string, args: string[]): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  let snapshot: RegistrySnapshot;
  try {
    snapshot = loadRegistry(projectRoot);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  if (parsed.mode === "bench") {
    return handleBenchmark(
      projectRoot,
      snapshot,
      parsed.scope,
      parsed.changedPaths,
      parsed.explicitPacks,
      parsed.save,
      parsed.outputPath,
    );
  }
  return handleSelect(snapshot, parsed.scope, parsed.changedPaths);
}
