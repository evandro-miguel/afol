import { describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function runKernel(cwd: string, args: string[]) {
  return spawnSync("bun", [kernelPath, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseJsonOutput(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function mkProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "mutation-safety-"));
  const agentsDir = join(root, ".agents");
  mkdirSync(agentsDir, { recursive: true });
  cpSync(join(process.cwd(), ".agents", "config.json"), join(agentsDir, "config.json"));
  cpSync(join(process.cwd(), ".agents", "lock.json"), join(agentsDir, "lock.json"));
  return root;
}

function readMutationJournal(root: string): Array<Record<string, unknown>> {
  const path = join(root, ".agents", "data", "mutations", "mutations.jsonl");
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map((row) => JSON.parse(row) as Record<string, unknown>);
}

describe("mutation safety command family", () => {
  test("pt dry-run shows diff and hashes without mutating", () => {
    const root = mkProjectRoot();
    try {
      const target = join(root, "notes", "doc.txt");
      mkdirSync(join(root, "notes"), { recursive: true });
      writeFileSync(target, "alpha", "utf8");

      const proc = runKernel(root, [
        "f",
        "pt",
        "--session",
        "S-01",
        "--task-id",
        "T-01",
        "--reason",
        "append baseline",
        "--path",
        "notes/doc.txt",
        "--append",
        "\nbeta",
        "--dry-run",
        "--json",
      ]);

      expect(proc.status).toBe(0);
      const result = parseJsonOutput(proc.stdout as string);
      expect(result.command).toBe("pt");
      expect(result.status).toBe("dry-run");
      expect(result.path).toBe("notes/doc.txt");
      expect(typeof result.before_hash).toBe("string");
      expect(typeof result.after_hash).toBe("string");
      expect(typeof result.diff_preview).toBe("string");
      expect(result.dry_run).toBe(true);
      expect(result.path).toBe("notes/doc.txt");
      expect(readFileSync(target, "utf8")).toBe("alpha");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("pt write stores backup and records mutation", () => {
    const root = mkProjectRoot();
    try {
      const target = join(root, "notes", "with-backup.txt");
      mkdirSync(join(root, "notes"), { recursive: true });
      writeFileSync(target, "v1", "utf8");

      const proc = runKernel(root, [
        "f",
        "pt",
        "--session",
        "S-02",
        "--task-id",
        "T-02",
        "--reason",
        "append backup",
        "--path",
        "notes/with-backup.txt",
        "--append",
        "+v2",
        "--json",
      ]);
      expect(proc.status).toBe(0);
      const result = parseJsonOutput(proc.stdout as string);
      expect(result.status).toBe("write");
      expect(result.path).toBe("notes/with-backup.txt");
      expect(result.backup_path).toBeTruthy();

      const backupPath = result.backup_path as string;
      expect(existsSync(backupPath)).toBe(true);
      expect(readFileSync(backupPath, "utf8")).toBe("v1");
      expect(readFileSync(target, "utf8")).toBe("v1+v2");

      const journal = readMutationJournal(root);
      expect(journal.length).toBe(1);
      expect(journal[0]?.kind).toBe("patch");
      expect(journal[0]?.status).toBe("applied");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("mv write plus undo restores source and destination backup", () => {
    const root = mkProjectRoot();
    try {
      const source = join(root, "mut", "source.txt");
      const destination = join(root, "mut", "destination.txt");
      mkdirSync(join(root, "mut"), { recursive: true });
      writeFileSync(source, "from", "utf8");
      writeFileSync(destination, "existing", "utf8");

      const moveProc = runKernel(root, [
        "f",
        "mv",
        "--session",
        "S-03",
        "--task-id",
        "T-03",
        "--reason",
        "move with overwrite",
        "--path",
        "mut/source.txt",
        "--to",
        "mut/destination.txt",
        "--json",
      ]);
      expect(moveProc.status).toBe(0);
      const moveResult = parseJsonOutput(moveProc.stdout as string);
      expect(moveResult.status).toBe("write");
      expect(typeof moveResult.overwritten_backup_path).toBe("string");

      expect(existsSync(source)).toBe(false);
      expect(readFileSync(destination, "utf8")).toBe("from");

      const undoProc = runKernel(root, [
        "f",
        "ud",
        "--session",
        "S-03",
        "--task-id",
        "T-03",
        "--reason",
        "undo move",
        "--json",
      ]);
      expect(undoProc.status).toBe(0);
      const undoResult = parseJsonOutput(undoProc.stdout as string);
      expect(undoResult.status).toBe("write");
      expect(readFileSync(source, "utf8")).toBe("from");
      expect(readFileSync(destination, "utf8")).toBe("existing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("protected paths are blocked", () => {
    const root = mkProjectRoot();
    try {
      const proc = runKernel(root, [
        "f",
        "pt",
        "--session",
        "S-04",
        "--task-id",
        "T-04",
        "--reason",
        "blocked target",
        "--path",
        ".agents/runtime/core.py",
        "--append",
        "danger",
        "--dry-run",
        "--json",
      ]);

      expect(proc.status).toBe(2);
      expect((proc.stderr as string)).toContain("protected-path");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("undo dry-run does not mutate or append journal", () => {
    const root = mkProjectRoot();
    try {
      const target = join(root, "notes", "guard.txt");
      mkdirSync(join(root, "notes"), { recursive: true });
      writeFileSync(target, "orig", "utf8");

      const writeProc = runKernel(root, [
        "f",
        "pt",
        "--session",
        "S-05",
        "--task-id",
        "T-05",
        "--reason",
        "write then undo-preview",
        "--path",
        "notes/guard.txt",
        "--append",
        "/updated",
        "--json",
      ]);
      expect(writeProc.status).toBe(0);
      const beforeUndoJournal = readMutationJournal(root);
      expect(beforeUndoJournal.length).toBe(1);

      const dryRunUndo = runKernel(root, [
        "f",
        "ud",
        "--session",
        "S-05",
        "--task-id",
        "T-05",
        "--reason",
        "preview undo",
        "--dry-run",
        "--json",
      ]);
      expect(dryRunUndo.status).toBe(0);
      const dryRunUndoResult = parseJsonOutput(dryRunUndo.stdout as string);
      expect(dryRunUndoResult.status).toBe("dry-run");
      expect(readFileSync(target, "utf8")).toBe("orig/updated");

      const afterUndoJournal = readMutationJournal(root);
      expect(afterUndoJournal.length).toBe(beforeUndoJournal.length);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
