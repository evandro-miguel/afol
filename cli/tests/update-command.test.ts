import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdateCommand } from "../commands/update";

function mkRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "update-command-"));
  mkdirSync(join(root, ".agents"), { recursive: true });
  mkdirSync(join(root, "src", "project-template", ".agents"), { recursive: true });
  writeFileSync(
    join(root, ".agents", "lock.json"),
    JSON.stringify({ schema_version: 1, revision: "old", locked: true }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(root, ".agents", "manifest.json"),
    JSON.stringify({ version: 1, commands: { status: ["s", "status"] } }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(root, "src", "project-template", ".agents", "lock.json"),
    JSON.stringify({ schema_version: 1, revision: "new", locked: true }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(root, "src", "project-template", ".agents", "manifest.json"),
    JSON.stringify(
      { version: 1, commands: { status: ["s", "status"], validate: ["v", "validate"] } },
      null,
      2,
    ),
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
      expect(output.stdout.join("\n")).toContain("ownership(current):");
      expect(output.stdout.join("\n")).toContain("ownership(source):");
      expect(output.stdout.join("\n")).toContain("diff previews:");
      expect(output.stdout.join("\n")).toContain(".agents/manifest.json [owner=managed] manifest commands changed");
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
      expect(preview.stdout.join("\n")).toContain("diff previews:");
      expect(preview.stdout.join("\n")).toContain(".agents/lock.json [owner=managed] revision changed");
      expect(preview.stdout.join("\n")).toContain("@@");

      const json = capture();
      expect(await runUpdateCommand(["ck", "--json"], root, json.io)).toBe(0);
      const parsed = JSON.parse(json.stdout[0] ?? "{}") as {
        hasSource: boolean;
        currentRevision: string;
        ownershipSource: Record<string, number>;
      };
      expect(parsed).toMatchObject({ hasSource: true, currentRevision: "old" });
      expect(parsed.ownershipSource.managed).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("apply dry-run reflects operations and does not write files", async () => {
    const root = mkRoot();
    try {
      const dryRun = capture();
      expect(await runUpdateCommand(["apply", "--dry-run"], root, dryRun.io)).toBe(0);
      expect(dryRun.stdout.join("\n")).toContain("apply details");
      expect(dryRun.stdout.join("\n")).toContain("update-managed .agents/lock.json revision changed");
      expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).not.toContain("new");
      expect(readFileSync(join(root, ".agents", "manifest.json"), "utf8")).not.toContain("validate");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("apply updates managed files when no conflicts", async () => {
    const root = mkRoot();
    try {
      const output = capture();
      expect(
        await runUpdateCommand(
          ["apply", "--session", "S-01", "--task-id", "T-01", "--reason", "test update apply"],
          root,
          output.io,
        ),
      ).toBe(0);
      const lock = JSON.parse(readFileSync(join(root, ".agents", "lock.json"), "utf8"));
      const manifest = JSON.parse(readFileSync(join(root, ".agents", "manifest.json"), "utf8"));
      expect(lock.revision).toBe("new");
      expect(manifest.commands.validate).toEqual(["v", "validate"]);
      expect(output.stdout.join("\n")).toContain("update apply: changes available");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("apply requires governed context for real writes", async () => {
    const root = mkRoot();
    try {
      const output = capture();
      expect(await runUpdateCommand(["apply"], root, output.io)).toBe(2);
      expect(output.stderr.join("\n")).toContain("Real update apply requires --session, --task-id, and --reason.");
      expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).not.toContain("new");
      expect(readFileSync(join(root, ".agents", "manifest.json"), "utf8")).not.toContain("validate");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("apply blocks conflict on user edits and keeps project-owned files untouched", async () => {
    const root = mkRoot();
    try {
      writeFileSync(
        join(root, ".agents", "manifest.json"),
        JSON.stringify({ version: 2, commands: { status: ["s", "status"], validate: ["changed"] }, custom: "touch" }, null, 2),
        "utf8",
      );
      writeFileSync(
        join(root, "src", "project-template", ".agents", "manifest.json"),
        JSON.stringify(
          {
            version: 1,
            ownership: {
              "project-owned": [".agents/manifest.json"],
            },
            commands: { status: ["s", "status"], validate: ["v", "validate"] },
          },
          null,
          2,
        ),
        "utf8",
      );

      const blocked = capture();
      const code = await runUpdateCommand(["apply"], root, blocked.io);
      expect(code).toBe(4);
      const manifestAfter = JSON.parse(readFileSync(join(root, ".agents", "manifest.json"), "utf8"));
      expect(manifestAfter.commands.validate).toEqual(["changed"]);
      expect(manifestAfter.custom).toBe("touch");
      expect(blocked.stdout.join("\n")).toContain("apply details");
      expect(blocked.stdout.join("\n")).toContain("preserve-project-owned .agents/manifest.json manifest-owner-project-owned");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
