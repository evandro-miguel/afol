import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifyWorkbenchTasks } from "../services/workbench/verify";

function mkRoot(name: string): string {
  return mkdtempSync(join(tmpdir(), `wb-verify-${name}-`));
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function seedDoneWorkbenchTask(root: string, session = "260531_1200_verify"): void {
  const sessionDir = join(root, ".agents", "wb", session);
  write(
    join(sessionDir, `${session}_task_01.md`),
    [
      "# Tasks",
      "",
      "## State Board",
      "",
      "| Task | State | Owner | Notes |",
      "|------|-------|-------|-------|",
      "| T-01 | done | worker | complete |",
      "",
    ].join("\n"),
  );
  write(
    join(sessionDir, ".evidence.jsonl"),
    `${JSON.stringify({ task_id: "T-01", command: "bun test", result: "passed" })}\n`,
  );
}

describe("verifyWorkbenchTasks", () => {
  test("strict root verification ignores documentation task examples/templates", () => {
    const root = mkRoot("docs-ignore");
    try {
      seedDoneWorkbenchTask(root);
      write(
        join(root, "docs", "templates", "task.md"),
        [
          "## State Board",
          "",
          "| Task | State | Owner | Notes |",
          "|------|-------|-------|-------|",
          "| T-01 | pending | worker | template example |",
          "",
        ].join("\n"),
      );
      write(
        join(root, "src", "project-template", "docs", "templates", "task.md"),
        [
          "## State Board",
          "",
          "| Task | State | Owner | Notes |",
          "|------|-------|-------|-------|",
          "| T-01 | pending | worker | template example |",
          "",
        ].join("\n"),
      );
      write(
        join(root, "docs", "lessons", "entries", "task-example.md"),
        [
          "# Lesson example",
          "",
          "- [ ] T-02 Example task from docs",
          "",
        ].join("\n"),
      );

      const result = verifyWorkbenchTasks(root, true);

      expect(result.allCompleted).toBe(true);
      expect(result.totalTasks).toBe(1);
      expect(result.openTasks).toHaveLength(0);
      expect(result.issues).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("strict root verification still detects real open workbench tasks", () => {
    const root = mkRoot("wb-detect");
    try {
      const session = "260531_1201_verify";
      const sessionDir = join(root, ".agents", "wb", session);
      write(
        join(sessionDir, `${session}_task_01.md`),
        [
          "# Tasks",
          "",
          "## State Board",
          "",
          "| Task | State | Owner | Notes |",
          "|------|-------|-------|-------|",
          "| T-01 | pending | worker | real workbench task |",
          "",
        ].join("\n"),
      );

      const result = verifyWorkbenchTasks(root, true);

      expect(result.allCompleted).toBe(false);
      expect(result.totalTasks).toBe(1);
      expect(result.openTasks).toHaveLength(1);
      expect(result.openTasks[0]?.file).toContain("/.agents/wb/");
      expect(result.openTasks[0]?.id).toBe("T-01");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("strict verification accepts failed evidence superseded by later success", () => {
    const root = mkRoot("superseded-failure");
    try {
      const session = "260531_1202_verify";
      const sessionDir = join(root, ".agents", "wb", session);
      write(
        join(sessionDir, `${session}_task_01.md`),
        [
          "# Tasks",
          "",
          "## State Board",
          "",
          "| Task | State | Owner | Notes |",
          "|------|-------|-------|-------|",
          "| T-01 | done | worker | fixed after retry |",
          "",
        ].join("\n"),
      );
      write(
        join(sessionDir, ".evidence.jsonl"),
        [
          JSON.stringify({ id: "E-fail", task_id: "T-01", command: "bun test", result: "failed: transient fixture" }),
          JSON.stringify({ id: "E-pass", task_id: "T-01", command: "bun test", result: "passed" }),
          "",
        ].join("\n"),
      );

      const result = verifyWorkbenchTasks(root, true);

      expect(result.allCompleted).toBe(true);
      expect(result.issues).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
