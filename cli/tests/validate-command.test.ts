import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runValidateCommand } from "../commands/validate";

type CapturedIo = {
  stdout: string[];
  stderr: string[];
  io: {
    stdout: (message: string) => void;
    stderr: (message: string) => void;
  };
};

function captureIo(): CapturedIo {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (message: string) => {
        stdout.push(message);
      },
      stderr: (message: string) => {
        stderr.push(message);
      },
    },
  };
}

function createValidationFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "validate-command-"));
  const agentsDir = join(root, ".agents");

  mkdirSync(join(agentsDir, "rules"), { recursive: true });
  mkdirSync(join(agentsDir, "skills"), { recursive: true });
  mkdirSync(join(agentsDir, "wb"), { recursive: true });
  mkdirSync(join(root, "docs", "arc"), { recursive: true });

  writeFileSync(
    join(agentsDir, "config.json"),
    JSON.stringify({ schema_version: 1, project: { name: "validate-fixture" } }),
    "utf8",
  );
  writeFileSync(
    join(agentsDir, "lock.json"),
    JSON.stringify({ schema_version: 1, revision: "abc123", project: "validate-fixture", locked: true }),
    "utf8",
  );
  writeFileSync(
    join(agentsDir, "manifest.json"),
    JSON.stringify({ schema_version: 1, managed_hashes: {} }),
    "utf8",
  );

  return root;
}

describe("validate command", () => {
  test("passes structural checks in a minimal project fixture", async () => {
    const root = createValidationFixture();
    try {
      const captured = captureIo();
      const code = await runValidateCommand(root, ["--json"], captured.io);
      expect(code).toBe(0);
      expect(captured.stderr).toEqual([]);
      expect(captured.stdout.length).toBe(1);

      const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<string, unknown>;
      expect(payload.ok).toBe(true);
      const checks = payload.checks as Array<Record<string, unknown>>;
      expect(Array.isArray(checks)).toBe(true);
      expect(checks.some((entry) => entry.id === "config" && entry.ok === true)).toBe(true);
      expect(checks.some((entry) => entry.id === "lock" && entry.ok === true)).toBe(true);
      expect(checks.some((entry) => entry.id === "manifest" && entry.ok === true)).toBe(true);
      expect(checks.some((entry) => entry.id === "rules_dir" && entry.ok === true)).toBe(true);
      expect(checks.some((entry) => entry.id === "skills_dir" && entry.ok === true)).toBe(true);
      expect(checks.some((entry) => entry.id === "wb_dir" && entry.ok === true)).toBe(true);
      expect(checks.some((entry) => entry.id === "docs_arc_dir" && entry.ok === true)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails when manifest is missing or invalid", async () => {
    const root = createValidationFixture();
    try {
      writeFileSync(join(root, ".agents", "manifest.json"), "{invalid-json", "utf8");

      const captured = captureIo();
      const code = await runValidateCommand(root, [], captured.io);
      expect(code).toBe(2);
      expect(captured.stderr).toEqual([]);
      expect(captured.stdout.length).toBe(1);
      const output = captured.stdout[0] ?? "";
      expect(output).toContain("validate: failed");
      expect(output).toContain("fail manifest");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("runs template forbidden scan when src/project-template exists", async () => {
    const root = createValidationFixture();
    try {
      mkdirSync(join(root, "src", "project-template", "tests"), { recursive: true });
      writeFileSync(
        join(root, "src", "project-template", "tests", "forbidden.txt"),
        "forbidden\n",
        "utf8",
      );

      const captured = captureIo();
      const code = await runValidateCommand(root, ["--json"], captured.io);
      expect(code).toBe(2);

      const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<string, unknown>;
      const checks = payload.checks as Array<Record<string, unknown>>;
      const templateCheck = checks.find((entry) => entry.id === "template_forbidden");
      expect(templateCheck).toBeDefined();
      expect(templateCheck?.ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
