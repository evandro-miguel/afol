import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function runKernel(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync("bun", [kernelPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseJsonOutput(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("validation command family", () => {
  test("v emits deterministic selector JSON", () => {
    const proc = runKernel(["v", "--json"]);
    expect(proc.status).toBe(0);
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
    const results = payload.results as Array<Record<string, unknown>>;
    expect(results.length).toBeGreaterThanOrEqual(6);
    const first = results[0];
    expect(typeof first.scenario_id).toBe("string");
    expect(typeof first.duration_ms).toBe("number");
    expect(typeof first.status).toBe("string");
    expect(typeof first.baseline_reference).toBe("string");
    expect(typeof first.threshold_reference).toBe("object");
  });

  test("registry contract has no issues", () => {
    const proc = runKernel(["v", "--json"]);
    expect(proc.status).toBe(0);
    const payload = parseJsonOutput(proc.stdout as string);
    expect(payload.contract_issues).toEqual([]);
  });
});
