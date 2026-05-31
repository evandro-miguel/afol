import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendTimelineEntry,
  closeSession,
  doneTask,
  newWorkstream,
  recordEvidence,
  startTask,
} from "../services/workbench/lifecycle";

function mkRoot(name: string): string {
  return mkdtempSync(join(tmpdir(), `wb-lifecycle-${name}-`));
}

describe("workbench lifecycle service", () => {
  test("newWorkstream creates plan/task/log/evidence and active session pointer", () => {
    const root = mkRoot("new");
    try {
      const created = newWorkstream(root, "cli native command parity");

      expect(created.session).toMatch(/^\d{6}_\d{4}_cli-native-command-parity(?:_\d{2})?$/);
      expect(existsSync(created.sessionDir)).toBe(true);
      expect(existsSync(created.planPath)).toBe(true);
      expect(existsSync(created.taskPath)).toBe(true);
      expect(existsSync(created.logPath)).toBe(true);
      expect(existsSync(created.evidencePath)).toBe(true);
      expect(readFileSync(created.activeSessionPath, "utf8")).toBe(`${created.session}\n`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("startTask marks row in_progress", () => {
    const root = mkRoot("start");
    try {
      const created = newWorkstream(root, "start-task");
      startTask(root, { session: created.session, taskId: "T-01" });

      const taskDoc = readFileSync(created.taskPath, "utf8");
      expect(taskDoc).toContain("| T-01 | in_progress | worker |");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("recordEvidence appends JSONL entry", () => {
    const root = mkRoot("evidence");
    try {
      const created = newWorkstream(root, "record-evidence");
      const entry = recordEvidence(root, {
        session: created.session,
        taskId: "T-01",
        command: "bun test",
        result: "passed",
      });

      expect(entry.id).toMatch(/^E-\d{17}$/);
      const lines = readFileSync(created.evidencePath, "utf8").trim().split("\n");
      expect(lines.length).toBe(1);
      const firstLine = lines[0];
      expect(typeof firstLine).toBe("string");
      const parsed = JSON.parse(firstLine as string) as { task_id: string; command: string; result: string };
      expect(parsed.task_id).toBe("T-01");
      expect(parsed.command).toBe("bun test");
      expect(parsed.result).toBe("passed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("appendTimelineEntry writes to the session log", () => {
    const root = mkRoot("timeline");
    try {
      const created = newWorkstream(root, "timeline");

      const result = appendTimelineEntry(root, created.session, "native timeline event");

      expect(result.logPath).toBe(created.logPath);
      const logDoc = readFileSync(created.logPath, "utf8");
      expect(logDoc).toContain("## Timeline");
      expect(logDoc).toContain("native timeline event");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("doneTask requires passed evidence for task", () => {
    const root = mkRoot("done");
    try {
      const created = newWorkstream(root, "done-task");

      expect(() => doneTask(root, { session: created.session, taskId: "T-01" })).toThrow(
        "requires passed evidence",
      );

      recordEvidence(root, {
        session: created.session,
        taskId: "T-01",
        command: "bun test",
        result: "failed",
      });
      expect(() => doneTask(root, { session: created.session, taskId: "T-01" })).toThrow(
        "requires passed evidence",
      );

      recordEvidence(root, {
        session: created.session,
        taskId: "T-01",
        command: "bun test",
        result: "passed",
      });
      doneTask(root, { session: created.session, taskId: "T-01" });

      const taskDoc = readFileSync(created.taskPath, "utf8");
      expect(taskDoc).toContain("| T-01 | done | worker |");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("closeSession blocks pending/in_progress/problem and clears active pointer on success", () => {
    const root = mkRoot("close");
    try {
      const created = newWorkstream(root, "close-session");

      expect(() => closeSession(root, created.session)).toThrow("blocking tasks");

      startTask(root, { session: created.session, taskId: "T-01" });
      expect(() => closeSession(root, created.session)).toThrow("blocking tasks");

      recordEvidence(root, {
        session: created.session,
        taskId: "T-01",
        command: "bun test",
        result: "passed",
      });
      doneTask(root, { session: created.session, taskId: "T-01" });
      closeSession(root, created.session);
      expect(existsSync(created.activeSessionPath)).toBe(false);

      writeFileSync(
        created.taskPath,
        [
          "# Tasks: close-session",
          "",
          "## State Board",
          "",
          "| Task | State | Owner | Notes |",
          "|------|-------|-------|-------|",
          "| T-01 | problem | worker | blocked |",
          "",
        ].join("\n"),
        "utf8",
      );
      expect(() => closeSession(root, created.session)).toThrow("blocking tasks");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
