import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { newWorkstream, recordEvidence } from "../services/workbench/lifecycle";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function mkProjectRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `verify-command-${name}-`));
  mkdirSync(join(root, ".agents"), { recursive: true });
  writeFileSync(join(root, ".agents", "config.json"), JSON.stringify({ schema_version: 1 }), "utf8");
  writeFileSync(join(root, ".agents", "lock.json"), JSON.stringify({ schema_version: 1, locked: true }), "utf8");
  return root;
}

function runKernel(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync("bun", [kernelPath, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("verify-tasks command", () => {
  test("fails with open state-board tasks and prints the open task", () => {
    const root = mkProjectRoot("open");
    try {
      const created = newWorkstream(root, "verify-open");

      const proc = runKernel(root, ["verify-tasks", created.sessionDir]);

      expect(proc.status).toBe(1);
      expect(proc.stderr as string).toBe("");
      expect(proc.stdout as string).toContain("Task Verification Report");
      expect(proc.stdout as string).toContain("Pending:");
      expect(proc.stdout as string).toContain("Open Tasks:");
      expect(proc.stdout as string).toContain("T-01");
      expect(proc.stdout as string).toContain("Verification failed.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("passes strict verification when done tasks have passed evidence", () => {
    const root = mkProjectRoot("strict");
    try {
      const created = newWorkstream(root, "verify-strict");
      writeFileSync(
        created.taskPath,
        [
          "# Tasks: verify-strict",
          "",
          "## State Board",
          "",
          "| Task | State | Owner | Notes |",
          "|------|-------|-------|-------|",
          "| T-01 | done | worker | implemented |",
          "",
        ].join("\n"),
        "utf8",
      );
      recordEvidence(root, {
        session: created.session,
        taskId: "T-01",
        command: "bun test",
        result: "passed",
      });

      const proc = runKernel(root, ["verify", "--session", created.session, "--strict"]);

      expect(proc.status).toBe(0);
      expect(proc.stderr as string).toBe("");
      expect(proc.stdout as string).toContain("Mode: STRICT");
      expect(proc.stdout as string).toContain("Completed:");
      expect(proc.stdout as string).toContain("All tasks completed.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("strict verification fails done tasks without ledger evidence", () => {
    const root = mkProjectRoot("missing-evidence");
    try {
      const created = newWorkstream(root, "missing-evidence");
      writeFileSync(
        created.taskPath,
        [
          "# Tasks: missing-evidence",
          "",
          "- [x] T-01 Finished without closure evidence",
          "",
        ].join("\n"),
        "utf8",
      );

      const proc = runKernel(root, ["vf", created.sessionDir, "--strict"]);

      expect(proc.status).toBe(1);
      expect(proc.stdout as string).toContain("missing_evidence");
      expect(proc.stdout as string).toContain("T-01 marked done but lacks passed evidence");
      expect(proc.stdout as string).toContain("Verification failed.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
