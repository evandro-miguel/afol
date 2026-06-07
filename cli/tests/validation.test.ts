import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function runKernel(args: string[], cwd = process.cwd()): ReturnType<typeof spawnSync> {
  return spawnSync("bun", [kernelPath, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseJsonOutput(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function createValidationFixtureRoot(
  mutate?: (root: string) => void,
): string {
  const root = mkdtempSync(join(tmpdir(), "validation-fixture-"));
  mkdirSync(join(root, ".agents", "data"), { recursive: true });
  cpSync(join(process.cwd(), ".agents", "config.json"), join(root, ".agents", "config.json"));
  cpSync(join(process.cwd(), ".agents", "lock.json"), join(root, ".agents", "lock.json"));
  cpSync(
    join(process.cwd(), ".agents", "data", "benchmarks"),
    join(root, ".agents", "data", "benchmarks"),
    { recursive: true },
  );
  mutate?.(root);
  return root;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function getRuntimeLiveArtifactPaths(root: string): { snapshotPath: string; savedResultPath: string } {
  const snapshotPath = join(root, ".agents", "benchmarks", "runtime-flow-live-agent-v4-latest.json");
  const snapshot = readJson(snapshotPath);
  const savedResultPath = join(root, snapshot.saved_result_path as string);
  return { snapshotPath, savedResultPath };
}

describe("validation command family", () => {
  test("v select emits deterministic selector JSON", () => {
    const proc = runKernel(["v", "select", "--json"]);
    expect(proc.status).toBe(0);
    expect((proc.stdout as string).trim().split("\n").length).toBe(1);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.schema_version).toBe("1.0.0");
    expect(payload.command_family).toBe("validation");
    expect(payload.mode).toBe("select");
    expect(Array.isArray(payload.selected_pack_ids)).toBe(true);
    const selected = payload.selected_pack_ids as string[];
    expect(selected.includes("cli-kernel-local")).toBe(true);
  });

  test("v select wb selects workbench pack only", () => {
    const proc = runKernel(["v", "select", "wb", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.scope).toBe("wb");
    expect(payload.selected_pack_ids).toEqual(["workbench-parity"]);
  });

  test("v select selects runtime packs when runtime paths change", () => {
    const proc = runKernel(["v", "select", "--changed-path", ".agents/runtime/core.py", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    const selected = payload.selected_pack_ids as string[];
    expect(selected.includes("mcp-parity")).toBe(true);
    expect(selected.includes("runtime-live-agent")).toBe(true);
  });

  test("v select changed-path routes current services/commands paths to benchmark packs", () => {
    const cliProc = runKernel(["v", "select", "--changed-path", "cli/main.ts", "--json"]);
    expect(cliProc.status).toBe(0);
    const cliPayload = parseJsonOutput(cliProc.stdout as string);
    expect(cliPayload.selected_pack_ids).toEqual(["cli-kernel-local"]);

    const catalogRulesProc = runKernel(["v", "select", "--changed-path", "cli/services/catalog/rules.ts", "--json"]);
    expect(catalogRulesProc.status).toBe(0);
    const catalogRulesPayload = parseJsonOutput(catalogRulesProc.stdout as string);
    expect(catalogRulesPayload.selected_pack_ids).toEqual(["routing-accuracy"]);

    const catalogCommandProc = runKernel(["v", "select", "--changed-path", "cli/commands/catalog.ts", "--json"]);
    expect(catalogCommandProc.status).toBe(0);
    const catalogCommandPayload = parseJsonOutput(catalogCommandProc.stdout as string);
    expect(catalogCommandPayload.selected_pack_ids).toEqual(["routing-accuracy"]);

    const mutationProc = runKernel(["v", "select", "--changed-path", "cli/files/example.ts", "--json"]);
    expect(mutationProc.status).toBe(0);
    const mutationPayload = parseJsonOutput(mutationProc.stdout as string);
    expect(mutationPayload.selected_pack_ids).toEqual(["mutation-safety"]);

    const updateServiceProc = runKernel(["v", "select", "--changed-path", "cli/services/update/check.ts", "--json"]);
    expect(updateServiceProc.status).toBe(0);
    const updateServicePayload = parseJsonOutput(updateServiceProc.stdout as string);
    expect(updateServicePayload.selected_pack_ids).toEqual(["update-safety"]);

    const updateCommandProc = runKernel(["v", "select", "--changed-path", "cli/commands/update.ts", "--json"]);
    expect(updateCommandProc.status).toBe(0);
    const updateCommandPayload = parseJsonOutput(updateCommandProc.stdout as string);
    expect(updateCommandPayload.selected_pack_ids).toEqual(["update-safety"]);

    const wbProc = runKernel(["v", "select", "--changed-path", ".agents/wb/session/task.md", "--json"]);
    expect(wbProc.status).toBe(0);
    const wbPayload = parseJsonOutput(wbProc.stdout as string);
    expect(wbPayload.selected_pack_ids).toEqual(["workbench-parity"]);

    const afolWbProc = runKernel(["v", "select", "--changed-path", ".afol/wb/session/task.md", "--json"]);
    expect(afolWbProc.status).toBe(0);
    const afolWbPayload = parseJsonOutput(afolWbProc.stdout as string);
    expect(afolWbPayload.selected_pack_ids).toEqual(["workbench-parity"]);

    const mcpProc = runKernel(["v", "select", "--changed-path", "cli/mcp/adapter.ts", "--json"]);
    expect(mcpProc.status).toBe(0);
    const mcpPayload = parseJsonOutput(mcpProc.stdout as string);
    expect(mcpPayload.selected_pack_ids).toEqual(["mcp-parity"]);

    const tokenProc = runKernel([
      "v",
      "select",
      "--changed-path",
      "docs/standards/prompt-context-guidelines.md",
      "--json",
    ]);
    expect(tokenProc.status).toBe(0);
    const tokenPayload = parseJsonOutput(tokenProc.stdout as string);
    expect(tokenPayload.selected_pack_ids).toEqual(["token-economy"]);
  });

  test("v select changed-path keeps generic cli fallback on cli-kernel-local", () => {
    const proc = runKernel(["v", "select", "--changed-path", "cli/commands/validate.ts", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.selected_pack_ids).toEqual(["cli-kernel-local"]);
  });

  test("validate changed-path executes selected AFOL-native validation commands", () => {
    const proc = runKernel(["validate", "--changed-path", "cli/commands/validate.ts", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.mode).toBe("run");
    expect(payload.status).toBe("passed");
    expect(payload.pass).toBe(true);
    expect(payload.selected_pack_ids).toEqual(["cli-kernel-local"]);
    const results = payload.command_results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((entry) => entry.pack_id === "cli-kernel-local")).toBe(true);
    expect(results.every((entry) => entry.status === "passed")).toBe(true);
    expect(results.every((entry) => Array.isArray(entry.command))).toBe(true);
    expect(JSON.stringify(results)).not.toContain("just");
    expect(payload.contract_issues).toEqual([]);
  }, 10000);

  test("v select changed-path does not route docs/spec-tests by runtime or mcp substrings", () => {
    const proc = runKernel([
      "v",
      "select",
      "--changed-path",
      "docs/arc/SPECS/F-10/spec-tests/260521_0140_runtime-adapters-and-mcp-parity_spec-test_01.md",
      "--json",
    ]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.selected_pack_ids).toEqual(["cli-kernel-local"]);
    const selected = payload.selected_pack_ids as string[];
    expect(selected.includes("mcp-parity")).toBe(false);
    expect(selected.includes("runtime-live-agent")).toBe(false);
  });

  test("v bench returns benchmark schema with scenario results", () => {
    const proc = runKernel(["v", "bench", "--pack", "cli-kernel-local", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.mode).toBe("benchmark");
    expect(payload.benchmark_result_schema_version).toBe("1.0.0");
    expect(payload.status).toBe("passed");
    expect(payload.pass).toBe(true);
    expect(payload.summary).toEqual({
      total: 6,
      passed: 6,
      failed: 0,
      skipped: 0,
      baseline_missing: 0,
    });
    const results = payload.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThanOrEqual(6);
    const first = results[0];
    if (!first) {
      throw new Error("Expected at least one benchmark result");
    }
    expect(typeof first.scenario_id).toBe("string");
    expect(typeof first.duration_ms).toBe("number");
    expect(typeof first.status).toBe("string");
    expect(typeof first.baseline_reference).toBe("string");
    expect((first.baseline_reference as string).startsWith(".agents/data/benchmarks/baselines/")).toBe(
      true,
    );
    expect((first.baseline_reference as string).startsWith("/")).toBe(false);
    expect(typeof first.threshold_reference).toBe("object");
    expect(first.pass).toBe(true);
  });

  test("v bench runs update-safety pack with complete baseline coverage", () => {
    const proc = runKernel(["v", "bench", "--pack", "update-safety", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.mode).toBe("benchmark");
    expect(payload.result_count).toBe(4);
    expect(payload.summary).toEqual({
      total: 4,
      passed: 4,
      failed: 0,
      skipped: 0,
      baseline_missing: 0,
    });
    const results = payload.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(4);
    expect(results.every((entry) => entry.pack_id === "update-safety")).toBe(true);
    expect(results.some((entry) => entry.status === "baseline-missing")).toBe(false);
  });

  test("v bench runs mutation-safety pack with complete baseline coverage", () => {
    const proc = runKernel(["v", "bench", "--pack", "mutation-safety", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.mode).toBe("benchmark");
    expect(payload.result_count).toBe(5);
    expect(payload.summary).toEqual({
      total: 5,
      passed: 5,
      failed: 0,
      skipped: 0,
      baseline_missing: 0,
    });
    const results = payload.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(5);
    expect(results.every((entry) => entry.pack_id === "mutation-safety")).toBe(true);
    expect(results.some((entry) => entry.status === "baseline-missing")).toBe(false);
  });

  test("v bench --save persists a benchmark result artifact under default results directory", () => {
    const fixtureRoot = createValidationFixtureRoot();
    const proc = runKernel(["v", "bench", "--pack", "cli-kernel-local", "--save", "--json"], fixtureRoot);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(typeof payload.saved_result_path).toBe("string");
    const savedPath = payload.saved_result_path as string;
    expect(savedPath.startsWith(".agents/data/benchmarks/results/")).toBe(true);
    const absoluteSavedPath = join(fixtureRoot, savedPath);
    expect(existsSync(absoluteSavedPath)).toBe(true);
    const savedPayload = readJson(absoluteSavedPath);
    expect(savedPayload.mode).toBe("benchmark");
    const savedResults = savedPayload.results as Array<Record<string, unknown>>;
    expect(savedResults.length).toBeGreaterThan(0);
    const first = savedResults[0];
    if (!first) {
      throw new Error("Expected at least one saved benchmark result");
    }
    expect(typeof first.run_id).toBe("string");
    expect(typeof first.pack_id).toBe("string");
    expect(typeof first.baseline_id).toBe("string");
    expect(typeof first.git_commit).toBe("string");
  });

  test("v bench --output writes to explicit path", () => {
    const fixtureRoot = createValidationFixtureRoot();
    const outputPath = join(fixtureRoot, ".agents", "tmp", "f11", "cli-kernel-local-result.json");
    const proc = runKernel(
      ["v", "bench", "--pack", "cli-kernel-local", "--output", outputPath, "--json"],
      fixtureRoot,
    );
    expect(proc.status).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.saved_result_path).toBe(".agents/tmp/f11/cli-kernel-local-result.json");
    const savedPayload = readJson(outputPath);
    expect(savedPayload.mode).toBe("benchmark");
  });

  test("v bench fails when metrics violate threshold and baseline", () => {
    const fixtureRoot = createValidationFixtureRoot((root) => {
      const scenarioPath = join(
        root,
        ".agents",
        "data",
        "benchmarks",
        "scenarios",
        "cli-kernel-local",
        "cli-help-compact.json",
      );
      const scenario = readJson(scenarioPath);
      const deterministic = scenario.deterministic_metrics as Record<string, unknown>;
      deterministic.duration_ms = 3000;
      deterministic.timing_p95_ms = 3000;
      writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
    });

    const proc = runKernel(["v", "bench", "--pack", "cli-kernel-local", "--json"], fixtureRoot);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.status).toBe("failed");
    expect(payload.pass).toBe(false);
    const results = payload.results as Array<Record<string, unknown>>;
    const target = results.find((entry) => entry.scenario_id === "cli-help-compact");
    expect(target?.status).toBe("failed");
    expect(target?.pass).toBe(false);
    expect(Array.isArray(target?.notes)).toBe(true);
    const notes = target?.notes as string[];
    expect(notes.some((entry) => entry.startsWith("threshold-exceeded:max_duration_ms:"))).toBe(true);
    expect(notes.some((entry) => entry.startsWith("baseline-regression:timing_p95_ms:"))).toBe(true);
    const summary = payload.summary as Record<string, unknown>;
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(0);
  });

  test("v bench runtime-live-agent fails on a partial live snapshot without fallback mapping", () => {
    const fixtureRoot = createValidationFixtureRoot((root) => {
      mkdirSync(join(root, ".agents", "benchmarks"), { recursive: true });
      cpSync(
        join(process.cwd(), ".agents", "benchmarks", "runtime-flow-live-agent-v4-latest.json"),
        join(root, ".agents", "benchmarks", "runtime-flow-live-agent-v4-latest.json"),
      );
      const { savedResultPath } = getRuntimeLiveArtifactPaths(root);
      const savedResult = readJson(savedResultPath);
      savedResult.scenarios = [
        {
          id: "live-implement-start-complete-evidence",
          pass: true,
          duration_ms: 120,
          tool_call_count: 1,
          tool_success_rate: 1,
          error_count: 0,
          retry_count: 0,
          context_bytes: 1024,
          prompt_bytes: 240,
        },
      ];
      writeFileSync(savedResultPath, `${JSON.stringify(savedResult, null, 2)}\n`);
    });

    const proc = runKernel(["v", "bench", "--pack", "runtime-live-agent", "--json"], fixtureRoot);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.status).toBe("failed");
    expect(payload.pass).toBe(false);
    const notes = payload.notes as string[];
    expect(
      notes.some((entry) => entry.startsWith("runtime-live-agent-artifact:.agents/data/benchmarks/results/")),
    ).toBe(true);
    expect(notes).toContain("runtime-live-agent-refresh:./afol benchmark run --save");
    expect(notes.some((entry) => entry.startsWith("runtime-live-artifact-incomplete:"))).toBe(true);
    const results = payload.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(3);
    expect(results.some((result) => result.status === "failed")).toBe(true);
    expect(results.some((result) => result.status === "passed")).toBe(true);
    expect(
      results.some((result) =>
        (result.notes as string[]).some((entry) => entry.startsWith("runtime-live-direct-evidence-missing:"))),
    ).toBe(true);
    expect(
      results.flatMap((result) => result.notes as string[]).some((entry) =>
        entry.startsWith("live-runner-mapping-fallback:")),
    ).toBe(false);
    const summary = payload.summary as Record<string, unknown>;
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.skipped).toBe(0);
    expect(summary.baseline_missing).toBe(0);
  });

  test("v bench runtime-live-agent passes when every scenario has direct live evidence", () => {
    const fixtureRoot = createValidationFixtureRoot((root) => {
      mkdirSync(join(root, ".agents", "benchmarks"), { recursive: true });
      cpSync(
        join(process.cwd(), ".agents", "benchmarks", "runtime-flow-live-agent-v4-latest.json"),
        join(root, ".agents", "benchmarks", "runtime-flow-live-agent-v4-latest.json"),
      );
      const { savedResultPath } = getRuntimeLiveArtifactPaths(root);
      const savedResult = readJson(savedResultPath);
      savedResult.scenarios = [
        {
          id: "live-implement-start-complete-evidence",
          pass: true,
          duration_ms: 120,
          tool_call_count: 1,
          tool_success_rate: 1,
          error_count: 0,
          retry_count: 0,
          context_bytes: 1024,
          prompt_bytes: 240,
        },
        {
          id: "live-tools-benchmark-discovery",
          pass: true,
          duration_ms: 140,
          tool_call_count: 1,
          tool_success_rate: 1,
          error_count: 0,
          retry_count: 0,
          context_bytes: 1024,
          prompt_bytes: 240,
        },
        {
          id: "live-implement-next-governance-preflight",
          pass: true,
          duration_ms: 160,
          tool_call_count: 1,
          tool_success_rate: 1,
          error_count: 0,
          retry_count: 0,
          context_bytes: 1024,
          prompt_bytes: 240,
        },
      ];
      savedResult.pass = true;
      savedResult.duration_ms = 420;
      savedResult.tool_call_count = 3;
      savedResult.error_count = 0;
      savedResult.retry_count = 0;
      savedResult.context_bytes_total = 3072;
      savedResult.prompt_bytes_total = 720;
      writeFileSync(savedResultPath, `${JSON.stringify(savedResult, null, 2)}\n`);
    });

    const proc = runKernel(["v", "bench", "--pack", "runtime-live-agent", "--json"], fixtureRoot);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.status).toBe("passed");
    expect(payload.pass).toBe(true);
    const notes = payload.notes as string[];
    expect(notes.some((entry) => entry.startsWith("runtime-live-artifact-incomplete:"))).toBe(false);
    expect(
      notes.some((entry) => entry.startsWith("runtime-live-agent-artifact:.agents/data/benchmarks/results/")),
    ).toBe(true);
    expect(notes).toContain("runtime-live-agent-refresh:./afol benchmark run --save");
    const results = payload.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(3);
    expect(results.every((result) => result.status === "passed")).toBe(true);
    expect(
      results.flatMap((result) => result.notes as string[]).some((entry) =>
        entry.startsWith("live-runner-mapping-fallback:")),
    ).toBe(false);
    expect(
      results.every((result) => {
        const resultNotes = result.notes as string[];
        return resultNotes.some((entry) => entry.startsWith("live-runner-artifact:.agents/data/benchmarks/results/"));
      }),
    ).toBe(true);
    const summary = payload.summary as Record<string, unknown>;
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.baseline_missing).toBe(0);
  });

  test("v bench runtime-live-agent passes from tracked snapshot when ignored result artifact is absent", () => {
    const fixtureRoot = createValidationFixtureRoot((root) => {
      mkdirSync(join(root, ".agents", "benchmarks"), { recursive: true });
      cpSync(
        join(process.cwd(), ".agents", "benchmarks", "runtime-flow-live-agent-v4-latest.json"),
        join(root, ".agents", "benchmarks", "runtime-flow-live-agent-v4-latest.json"),
      );
      const { savedResultPath } = getRuntimeLiveArtifactPaths(root);
      if (existsSync(savedResultPath)) {
        unlinkSync(savedResultPath);
      }
    });

    const proc = runKernel(["v", "bench", "--pack", "runtime-live-agent", "--json"], fixtureRoot);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.status).toBe("passed");
    expect(payload.pass).toBe(true);
    expect(payload.notes).toContain("runtime-live-agent-evidence-source:snapshot");
    const results = payload.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(3);
    expect(results.every((result) => result.status === "passed")).toBe(true);
    expect(
      results.every((result) => (result.notes as string[]).includes("live-runner-evidence-source:snapshot")),
    ).toBe(true);
  });

  test("v bench runtime-live-agent fails when direct live evidence violates thresholds", () => {
    const fixtureRoot = createValidationFixtureRoot((root) => {
      mkdirSync(join(root, ".agents", "benchmarks"), { recursive: true });
      cpSync(
        join(process.cwd(), ".agents", "benchmarks", "runtime-flow-live-agent-v4-latest.json"),
        join(root, ".agents", "benchmarks", "runtime-flow-live-agent-v4-latest.json"),
      );
      const { savedResultPath } = getRuntimeLiveArtifactPaths(root);
      const savedResult = readJson(savedResultPath);
      savedResult.scenarios = [
        {
          id: "live-implement-start-complete-evidence",
          pass: true,
          duration_ms: 120,
          tool_call_count: 1,
          tool_success_rate: 1,
          error_count: 0,
          retry_count: 0,
          context_bytes: 1024,
          prompt_bytes: 240,
        },
        {
          id: "live-tools-benchmark-discovery",
          pass: true,
          duration_ms: 140,
          tool_call_count: 1,
          tool_success_rate: 1,
          error_count: 0,
          retry_count: 0,
          context_bytes: 1024,
          prompt_bytes: 240,
        },
        {
          id: "live-implement-next-governance-preflight",
          pass: true,
          duration_ms: 160,
          tool_call_count: 4,
          tool_success_rate: 0.75,
          error_count: 1,
          retry_count: 0,
          context_bytes: 1024,
          prompt_bytes: 240,
        },
      ];
      savedResult.pass = true;
      savedResult.duration_ms = 420;
      savedResult.tool_call_count = 6;
      savedResult.error_count = 1;
      savedResult.retry_count = 0;
      savedResult.context_bytes_total = 3072;
      savedResult.prompt_bytes_total = 720;
      writeFileSync(savedResultPath, `${JSON.stringify(savedResult, null, 2)}\n`);
    });

    const proc = runKernel(["v", "bench", "--pack", "runtime-live-agent", "--json"], fixtureRoot);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.status).toBe("failed");
    expect(payload.pass).toBe(false);
    const results = payload.results as Array<Record<string, unknown>>;
    const target = results.find((entry) => entry.scenario_id === "live-status");
    expect(target?.status).toBe("failed");
    expect(target?.pass).toBe(false);
    expect(target?.tool_success_rate).toBe(0.75);
    const notes = target?.notes as string[];
    expect(notes).toContain("threshold-below-min:min_tool_success_rate:0.75<0.98");
    const summary = payload.summary as Record<string, unknown>;
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(0);
  });

  test("v bench runtime-live-agent fails with actionable note when live artifact is missing", () => {
    const fixtureRoot = createValidationFixtureRoot();
    const proc = runKernel(["v", "bench", "--pack", "runtime-live-agent", "--json"], fixtureRoot);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.status).toBe("failed");
    expect(payload.pass).toBe(false);
    const notes = payload.notes as string[];
    expect(notes).toContain(
      "runtime-live-artifact-missing:.agents/benchmarks/runtime-flow-live-agent-v4-latest.json;run:./afol benchmark run --save",
    );
    const results = payload.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(3);
    expect(results.every((entry) => entry.status === "failed")).toBe(true);
    expect(
      results.every((entry) =>
        (entry.notes as string[]).includes(
          "runtime-live-artifact-missing:.agents/benchmarks/runtime-flow-live-agent-v4-latest.json;run:./afol benchmark run --save",
        )),
    ).toBe(true);
    expect(payload.summary).toEqual({
      total: 3,
      passed: 0,
      failed: 3,
      skipped: 0,
      baseline_missing: 0,
    });
  });

  test("invalid scenario or baseline schema_version yields contract issues", () => {
    const fixtureRoot = createValidationFixtureRoot((root) => {
      const scenarioPath = join(
        root,
        ".agents",
        "data",
        "benchmarks",
        "scenarios",
        "cli-kernel-local",
        "cli-help-compact.json",
      );
      const baselinePath = join(
        root,
        ".agents",
        "data",
        "benchmarks",
        "baselines",
        "cli-kernel-local",
        "baseline-v1.json",
      );
      const scenario = readJson(scenarioPath);
      scenario.schema_version = "9.9.9";
      writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
      const baseline = readJson(baselinePath);
      baseline.schema_version = "9.9.9";
      writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    });

    const selectProc = runKernel(["v", "select", "--json"], fixtureRoot);
    expect(selectProc.status).toBe(0);
    const selectPayload = parseJsonOutput(selectProc.stdout as string);
    const selectIssues = selectPayload.contract_issues as string[];
    expect(
      selectIssues.some((entry) => entry.startsWith("scenario-schema-version-mismatch:cli-kernel-local:")),
    ).toBe(true);
    expect(
      selectIssues.some((entry) => entry.startsWith("baseline-schema-version-mismatch:cli-kernel-local:")),
    ).toBe(true);

    const benchProc = runKernel(["v", "bench", "--pack", "cli-kernel-local", "--json"], fixtureRoot);
    expect(benchProc.status).toBe(0);
    const benchPayload = parseJsonOutput(benchProc.stdout as string);
    expect(benchPayload.status).toBe("failed");
    expect(benchPayload.pass).toBe(false);
  });

  test("validate alias and tpl/update scopes keep working", () => {
    const validateProc = runKernel(["validate", "select", "--json"]);
    expect(validateProc.status).toBe(0);
    const validatePayload = parseJsonOutput(validateProc.stdout as string);
    expect(validatePayload.mode).toBe("select");

    const tplProc = runKernel(["v", "select", "tpl", "--json"]);
    expect(tplProc.status).toBe(0);
    const tplPayload = parseJsonOutput(tplProc.stdout as string);
    expect(tplPayload.scope).toBe("tpl");
    expect(tplPayload.selected_pack_ids).toEqual(["cli-kernel-local"]);

    const updateProc = runKernel(["v", "select", "update", "--json"]);
    expect(updateProc.status).toBe(0);
    const updatePayload = parseJsonOutput(updateProc.stdout as string);
    expect(updatePayload.scope).toBe("update");
    expect(updatePayload.selected_pack_ids).toEqual(["cli-kernel-local"]);
  }, 10000);

  test("registry contract remains complete for the eight-pack matrix", () => {
    const proc = runKernel(["v", "select", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    const registry = payload.registry as Array<Record<string, unknown>>;
    expect(registry.map((entry) => entry.pack_id)).toEqual([
      "cli-kernel-local",
      "routing-accuracy",
      "mutation-safety",
      "update-safety",
      "workbench-parity",
      "mcp-parity",
      "runtime-live-agent",
      "token-economy",
    ]);
    expect(
      registry.every((entry) => (entry.scenario_count as number) >= (entry.min_scenarios as number)),
    ).toBe(true);
    expect(registry.every((entry) => entry.baseline_present === true)).toBe(true);
    expect(payload.contract_issues).toEqual([]);
  });
});
