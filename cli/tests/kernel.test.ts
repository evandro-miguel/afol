import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const kernelPath = `${process.cwd()}/cli/main.ts`;
const templateConfig = JSON.stringify({
  schema_version: 1,
  project: {
    name: "agentic-start-folder-dev-refactor-ts",
  },
});
const templateLock = JSON.stringify({
  schema_version: 1,
  revision: "e178aaf",
  project: "agentic-start-folder-dev-refactor-ts",
  locked: true,
});

function runKernel(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync("bun", [kernelPath, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function mkProjectRoot(name: string, fakeAgentsBody: string): string {
  const root = mkdtempSync(join(tmpdir(), `kernel-${name}-`));
  const agentsDir = join(root, ".agents");
  mkdirSync(agentsDir, { recursive: true });

  writeFileSync(join(agentsDir, "config.json"), templateConfig, "utf8");
  writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");
  writeFileSync(join(agentsDir, "agents"), fakeAgentsBody, "utf8");
  chmodSync(join(agentsDir, "agents"), 0o755);

  return root;
}

describe("kernel front-door", () => {
  test("-h prints compact help", () => {
    const root = mkProjectRoot("help", "#!/usr/bin/env bash\necho legacy status \"$@\"\n");
    try {
      const proc = runKernel(root, ["-h"]);
      expect(proc.status).toBe(0);
      const lines = (proc.stdout as string).trim().split("\n");
      expect(lines.length).toBeLessThanOrEqual(25);
      expect((proc.stdout as string)).toContain("Commands");
      expect((proc.stdout as string)).toContain("status");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("status alias and json shorthands are normalized", () => {
    const script = "#!/usr/bin/env bash\necho ARGS:$*";
    const root = mkProjectRoot("aliases", script);
    try {
      const cases: { args: string[]; expected: string }[] = [
        { args: ["s"], expected: "ARGS:status" },
        { args: ["status"], expected: "ARGS:status" },
        { args: ["-j"], expected: "ARGS:status --json" },
        { args: ["--json"], expected: "ARGS:status --json" },
        { args: ["-j", "s"], expected: "ARGS:status --json" },
        { args: ["s", "-j"], expected: "ARGS:status --json" },
        { args: ["status", "--json"], expected: "ARGS:status --json" },
      ];

      for (const testCase of cases) {
        const proc = runKernel(root, testCase.args);
        expect(proc.status).toBe(0);
        expect(proc.stdout as string).toBe(`${testCase.expected}\n`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("detects project root by walking up directories", () => {
    const root = mkProjectRoot("detection", "#!/usr/bin/env bash\necho ROOT:$(pwd)");
    const nested = join(root, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    try {
      const proc = runKernel(nested, ["s"]);
      expect(proc.status).toBe(0);
      expect((proc.stdout as string).trim()).toContain(`ROOT:${root}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns non-zero when config or lock are missing/invalid", () => {
    const root = mkdtempSync(join(tmpdir(), "kernel-missing-"));
    const agentsDir = join(root, ".agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, "agents"), "#!/usr/bin/env bash\nexit 0\n", "utf8");
    chmodSync(join(agentsDir, "agents"), 0o755);
    writeFileSync(join(agentsDir, "config.json"), "{invalid-json", "utf8");
    writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");

    try {
      const proc = runKernel(root, ["status"]);
      expect(proc.status).toBe(2);
      expect((proc.stderr as string)).toContain("Invalid JSON in");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    const rootMissing = mkdtempSync(join(tmpdir(), "kernel-missing-lock-"));
    const missingAgentsDir = join(rootMissing, ".agents");
    mkdirSync(missingAgentsDir, { recursive: true });
    writeFileSync(join(missingAgentsDir, "agents"), "#!/usr/bin/env bash\nexit 0\n", "utf8");
    chmodSync(join(missingAgentsDir, "agents"), 0o755);
    writeFileSync(join(missingAgentsDir, "config.json"), templateConfig, "utf8");

    try {
      const proc = runKernel(rootMissing, ["status"]);
      expect(proc.status).toBe(2);
      expect((proc.stderr as string)).toContain("Missing required file");
    } finally {
      rmSync(rootMissing, { recursive: true, force: true });
    }
  });

  test("preserves legacy exit code through adapter", () => {
    const root = mkProjectRoot("exit", "#!/usr/bin/env bash\nexit 11\n");
    try {
      const proc = runKernel(root, ["status"]);
      expect(proc.status).toBe(11);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
