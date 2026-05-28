import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

describe("validation command family", () => {
  test("v emits deterministic selector JSON", () => {
    const proc = runKernel(["v", "--json"]);
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

  test("v wb selects workbench pack only", () => {
    const proc = runKernel(["v", "wb", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.scope).toBe("wb");
    expect(payload.selected_pack_ids).toEqual(["workbench-parity"]);
  });

  test("v selects runtime packs when runtime paths change", () => {
    const proc = runKernel(["v", "--changed-path", ".agents/runtime/core.py", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    const selected = payload.selected_pack_ids as string[];
    expect(selected.includes("mcp-parity")).toBe(true);
    expect(selected.includes("runtime-live-agent")).toBe(true);
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

  test("v bench reports skipped as explicit non-pass and separate summary bucket", () => {
    const proc = runKernel(["v", "bench", "--pack", "runtime-live-agent", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.status).toBe("failed");
    expect(payload.pass).toBe(false);
    const results = payload.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(3);
    for (const result of results) {
      expect(result.status).toBe("skipped");
      expect(result.pass).toBe(false);
    }
    expect(payload.summary).toEqual({
      total: 3,
      passed: 0,
      failed: 0,
      skipped: 3,
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

    const selectProc = runKernel(["v", "--json"], fixtureRoot);
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
    const validateProc = runKernel(["validate", "--json"]);
    expect(validateProc.status).toBe(0);
    const validatePayload = parseJsonOutput(validateProc.stdout as string);
    expect(validatePayload.mode).toBe("select");

    const tplProc = runKernel(["v", "tpl", "--json"]);
    expect(tplProc.status).toBe(0);
    const tplPayload = parseJsonOutput(tplProc.stdout as string);
    expect(tplPayload.scope).toBe("tpl");
    expect(tplPayload.selected_pack_ids).toEqual(["cli-kernel-local", "token-economy"]);

    const updateProc = runKernel(["v", "update", "--json"]);
    expect(updateProc.status).toBe(0);
    const updatePayload = parseJsonOutput(updateProc.stdout as string);
    expect(updatePayload.scope).toBe("update");
    expect(updatePayload.selected_pack_ids).toEqual(["token-economy"]);
  });

  test("registry contract has no issues", () => {
    const proc = runKernel(["v", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.contract_issues).toEqual([]);
  });
});
