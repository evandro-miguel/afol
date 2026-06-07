import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { formatVerifyReport, verifyWorkbenchTasks } from "../services/workbench/verify";

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

  test("reports missing sessions and strict missing task sessions", () => {
    const root = mkRoot("missing");
    try {
      const missing = verifyWorkbenchTasks(join(root, "missing-session"), true);
      expect(missing.allCompleted).toBe(false);
      expect(missing.totalTasks).toBe(0);
      expect(missing.issues[0]?.type).toBe("missing_session");

      const emptySession = join(root, "empty-session");
      mkdirSync(emptySession, { recursive: true });

      const relaxed = verifyWorkbenchTasks(emptySession, false);
      expect(relaxed.allCompleted).toBe(true);
      expect(relaxed.issues[0]?.type).toBe("missing_tasks");

      const strict = verifyWorkbenchTasks(emptySession, true);
      expect(strict.allCompleted).toBe(false);
      expect(strict.issues[0]?.type).toBe("missing_tasks");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("parses legacy markers and formats open-task report", () => {
    const root = mkRoot("legacy-markers");
    try {
      write(
        join(root, "task-list.md"),
        [
          "# Legacy tasks",
          "",
          "- [ ] T-01 pending task",
          "- [/] T-02 progress task",
          "- [%] T-03 implemented task",
          "- [&] T-04 tested task",
          "- [!] T-05 problem task",
          "- [>] T-06 moved task",
          "- [x] T-07 done task",
          "",
        ].join("\n"),
      );

      const result = verifyWorkbenchTasks(root, false);
      const report = formatVerifyReport(result);

      expect(result.totalTasks).toBe(7);
      expect(result.pending).toBe(1);
      expect(result.inProgress).toBe(1);
      expect(result.implementedUntested).toBe(1);
      expect(result.testedNeedsSpecValidation).toBe(1);
      expect(result.problem).toBe(1);
      expect(result.moved).toBe(1);
      expect(result.completed).toBe(1);
      expect(result.openTasks).toHaveLength(5);
      expect(report).toContain("Pending:");
      expect(report).toContain("In Progress:");
      expect(report).toContain("Implemented:");
      expect(report).toContain("Tested/Spec:");
      expect(report).toContain("Problem:");
      expect(report).toContain("Moved:");
      expect(report).toContain("Open Tasks:");
      expect(report).toContain("Verification failed.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("strict verification rejects unresolved failed evidence for done tasks", () => {
    const root = mkRoot("failed-evidence");
    try {
      const session = "260531_1203_verify";
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
          "| T-01 | done | worker | failed closure |",
          "",
        ].join("\n"),
      );
      write(
        join(sessionDir, ".evidence.jsonl"),
        `${JSON.stringify({ id: "E-fail", taskId: "T-01", command: "bun test", result: "failed" })}\n`,
      );

      const result = verifyWorkbenchTasks(root, true);
      const report = formatVerifyReport(result);

      expect(result.allCompleted).toBe(false);
      expect(result.issues[0]?.type).toBe("failed_evidence");
      expect(report).toContain("Mode: STRICT");
      expect(report).toContain("failed_evidence");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
