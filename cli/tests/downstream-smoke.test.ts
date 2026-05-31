import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const kernelPath = join(repoRoot, "cli", "main.ts");

function runBun(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): ReturnType<typeof spawnSync> {
  return spawnSync("bun", args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  const walk = (currentAbs: string, currentRel: string): void => {
    const entries = readdirSync(currentAbs, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name;
      const absPath = join(currentAbs, entry.name);
      out.push(relPath);
      if (entry.isDirectory()) {
        walk(absPath, relPath);
      }
    }
  };
  walk(root, "");
  return out;
}

function assertOk(proc: ReturnType<typeof spawnSync>, label: string): void {
  if (proc.status !== 0) {
    throw new Error(
      [
        `${label} failed`,
        `status=${proc.status}`,
        `stdout=${(proc.stdout as string).trim()}`,
        `stderr=${(proc.stderr as string).trim()}`,
      ].join("\n"),
    );
  }
}

describe("downstream bootstrap smoke", () => {
  test("bootstrap clean target and run wrapper lifecycle commands", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "downstream-smoke-"));
    const target = join(sandbox, "target");

    try {
      const bootstrap = runBun(sandbox, [kernelPath, "bootstrap", target]);
      assertOk(bootstrap, "bootstrap");

      const targetEnv: NodeJS.ProcessEnv = {
        ...process.env,
        AGENTIC_CLI_PATH: kernelPath,
      };

      const commands: Array<{ args: string[]; label: string }> = [
        { args: ["-h"], label: "./a -h" },
        { args: ["status"], label: "./a status" },
        { args: ["validate"], label: "./a validate" },
        { args: ["new", "smoke"], label: "./a new smoke" },
        { args: ["start", "--task-id", "T-01"], label: "./a start --task-id T-01" },
        {
          args: ["evidence", "T-01", "--command", "smoke", "--result", "passed"],
          label: "./a evidence T-01 --command smoke --result passed",
        },
        { args: ["done", "--task-id", "T-01"], label: "./a done --task-id T-01" },
        { args: ["close"], label: "./a close" },
      ];

      for (const command of commands) {
        const proc = spawnSync("./a", command.args, {
          cwd: target,
          env: targetEnv,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        assertOk(proc, command.label);
      }

      const allPaths = listFilesRecursive(target);
      const pyPaths = allPaths.filter((path) => path.endsWith(".py"));
      expect(pyPaths).toEqual([]);

      const forbiddenSegment = allPaths.filter((path) =>
        /(^|\/)(scripts|runtime|uv)(\/|$)/.test(path),
      );
      expect(forbiddenSegment).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
