import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdateCommand } from "../commands/update";

function mkRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "update-command-"));
  mkdirSync(join(root, ".agents"), { recursive: true });
  mkdirSync(join(root, "src", "project-template", ".agents"), { recursive: true });
  writeFileSync(
    join(root, ".agents", "lock.json"),
    JSON.stringify({ schema_version: 1, revision: "old", locked: true }),
    "utf8",
  );
  writeFileSync(
    join(root, ".agents", "manifest.json"),
    JSON.stringify({ version: 1, commands: { status: ["s", "status"] } }),
    "utf8",
  );
  writeFileSync(
    join(root, "src", "project-template", ".agents", "lock.json"),
    JSON.stringify({ schema_version: 1, revision: "new", locked: true }),
    "utf8",
  );
  writeFileSync(
    join(root, "src", "project-template", ".agents", "manifest.json"),
    JSON.stringify({ version: 1, commands: { status: ["s", "status"], validate: ["v", "validate"] } }),
    "utf8",
  );
  return root;
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    },
  };
}

describe("update command", () => {
  test("check reports source drift without writing files", async () => {
    const root = mkRoot();
    try {
      const output = capture();
      expect(await runUpdateCommand(["check"], root, output.io)).toBe(0);
      expect(output.stdout.join("\n")).toContain("update check: changes available");
      expect(output.stdout.join("\n")).toContain("revision old -> new");
      expect(output.stdout.join("\n")).toContain("add command validate");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("preview prints read-only operations and supports ck alias", async () => {
    const root = mkRoot();
    try {
      const preview = capture();
      expect(await runUpdateCommand(["preview"], root, preview.io)).toBe(0);
      expect(preview.stdout.join("\n")).toContain("preview operations:");

      const json = capture();
      expect(await runUpdateCommand(["ck", "--json"], root, json.io)).toBe(0);
      expect(JSON.parse(json.stdout[0] ?? "{}")).toMatchObject({ hasSource: true, currentRevision: "old" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
