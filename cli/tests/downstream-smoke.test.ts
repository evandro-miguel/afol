import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const kernelPath = join(repoRoot, "cli", "main.ts");

function runBun(
	cwd: string,
	args: string[],
	env: NodeJS.ProcessEnv = process.env,
): ReturnType<typeof spawnSync> {
	return spawnSync("bun", args, {
		cwd,
		env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function runAfol(
	cwd: string,
	args: string[],
	env: NodeJS.ProcessEnv = process.env,
): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [kernelPath, ...args], {
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

function sessionFrom(stdout: string): string {
	const match = /session created:\s*(\S+)/.exec(stdout);
	if (!match) {
		throw new Error(`Could not parse session id from stdout=${stdout.trim()}`);
	}
	const session = match[1];
	if (!session) {
		throw new Error(`Parsed empty session id from stdout=${stdout.trim()}`);
	}
	return session;
}

describe("downstream bootstrap smoke", () => {
	test("bootstrap clean target and run native lifecycle commands", () => {
		const sandbox = mkdtempSync(join(tmpdir(), "downstream-smoke-"));
		const target = join(sandbox, "target");

		try {
			const help = runBun(repoRoot, [kernelPath, "--help"]);
			assertOk(help, "afol --help");

			const version = runBun(repoRoot, [kernelPath, "--version"]);
			assertOk(version, "afol --version");

			const bootstrap = runBun(sandbox, [kernelPath, "bootstrap", target]);
			assertOk(bootstrap, "bootstrap");

			const statusBefore = runAfol(target, ["status"]);
			assertOk(statusBefore, "status before new");
			expect(statusBefore.stdout as string).toContain("STATUS: none");
			expect(statusBefore.stdout as string).toContain("SESSIONS: 0");

			const rebuild = runAfol(target, ["local-state", "rebuild"]);
			assertOk(rebuild, "local-state rebuild");

			const validateCheckDrift = runAfol(target, [
				"validate",
				"project",
				"--check-drift",
				"--json",
			]);
			assertOk(validateCheckDrift, "validate project --check-drift");
			const validatePayload = JSON.parse(
				validateCheckDrift.stdout as string,
			) as { ok: boolean };
			expect(validatePayload.ok).toBe(true);

			const created = runAfol(target, [
				"new",
				"smoke",
				"--task",
				"Dist smoke proof",
				"--no-spec-required",
				"--reason",
				"downstream smoke fixture",
			]);
			assertOk(created, "new");
			const session = sessionFrom(created.stdout as string);

			const statusAfterNew = runAfol(target, ["status"]);
			assertOk(statusAfterNew, "status after new");
			expect(statusAfterNew.stdout as string).toContain("STATUS: pending");
			expect(statusAfterNew.stdout as string).toContain("TASK: T-01");
			expect(statusAfterNew.stdout as string).toContain("SESSIONS: 1");

			const render = runAfol(target, ["render", "--json"]);
			assertOk(render, "render");
			const renderPayload = JSON.parse(render.stdout as string) as {
				action: string;
				ok: boolean;
			};
			expect(renderPayload.ok).toBe(true);
			expect(renderPayload.action).toBe("memory.render");

			const pbList = runAfol(target, ["pb", "list", "--json"]);
			assertOk(pbList, "pb list");
			const pbListPayload = JSON.parse(pbList.stdout as string) as {
				action: string;
				ok: boolean;
				data: { projects: unknown[] };
			};
			expect(pbListPayload.ok).toBe(true);
			expect(pbListPayload.action).toBe("project-benchmark.list");
			expect(pbListPayload.data.projects.length).toBeGreaterThan(0);

			const pbValidate = runAfol(target, [
				"project-benchmark",
				"validate",
				"--json",
			]);
			assertOk(pbValidate, "project-benchmark validate");
			const pbValidatePayload = JSON.parse(pbValidate.stdout as string) as {
				action: string;
				ok: boolean;
			};
			expect(pbValidatePayload.ok).toBe(true);
			expect(pbValidatePayload.action).toBe("project-benchmark.validate");

			const start = runAfol(target, ["start", "--task-id", "T-01"]);
			assertOk(start, "start");

			const done = runAfol(target, [
				"done",
				"--task-id",
				"T-01",
				"--test",
				"test -d .afol",
			]);
			assertOk(done, "done");

			const taskDoc = readFileSync(
				join(target, ".afol", "wb", session, `${session}_task_01.md`),
				"utf8",
			);
			expect(taskDoc).toContain(
				"| T-01 | done | worker | Dist smoke proof attempt=1 |",
			);

			const evidenceDoc = readFileSync(
				join(target, ".afol", "wb", session, ".evidence.jsonl"),
				"utf8",
			).trim();
			expect(evidenceDoc).toContain('"task_id":"T-01"');
			expect(evidenceDoc).toContain('"command":"test -d .afol"');
			expect(evidenceDoc).toContain('"result":"passed"');

			const close = runAfol(target, ["close"]);
			assertOk(close, "close");

			const allPaths = listFilesRecursive(target);
			expect(existsSync(join(target, "afol"))).toBe(false);
			expect(existsSync(join(target, "a"))).toBe(false);
			expect(existsSync(join(target, "Justfile"))).toBe(false);
			expect(existsSync(join(target, ".afol", "wb", ".active_session"))).toBe(
				false,
			);

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
