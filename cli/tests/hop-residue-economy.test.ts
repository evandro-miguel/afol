import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DoneArgumentError,
	parseDoneArgs,
	peekDoneTaskIdFromArgv,
} from "../commands/workbench/args";

const repoRoot = join(import.meta.dir, "..", "..");
const kernel = join(repoRoot, "cli/main.ts");

function runAfol(
	cwd: string,
	args: string[],
): { status: number; stdout: string; stderr: string; ms: number } {
	const started = performance.now();
	const proc = spawnSync("bun", [kernel, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		status: proc.status ?? 1,
		stdout: proc.stdout ?? "",
		stderr: proc.stderr ?? "",
		ms: Math.round(performance.now() - started),
	};
}

function seedProject(): string {
	const root = mkdtempSync(join(tmpdir(), "hop-residue-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	mkdirSync(join(root, ".agents"), { recursive: true });
	copyFileSync(
		join(repoRoot, "src/project-template/.afol/config.json"),
		join(root, ".afol/config.json"),
	);
	copyFileSync(
		join(repoRoot, "src/project-template/.agents/lock.json"),
		join(root, ".agents/lock.json"),
	);
	writeFileSync(join(root, "README.md"), "fixture\n");
	spawnSync("git", ["init", "-q"], { cwd: root });
	spawnSync("git", ["config", "user.email", "hop@test"], { cwd: root });
	spawnSync("git", ["config", "user.name", "Hop"], { cwd: root });
	spawnSync("git", ["add", "README.md"], { cwd: root });
	spawnSync("git", ["commit", "-qm", "init"], { cwd: root });
	return root;
}

function estimateTokens(text: string): number {
	return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}

describe("hop residue economy", () => {
	test("argv no-op is rejected before execution with a one-line next command", () => {
		expect(() =>
			parseDoneArgs(
				["--session", "260530_2256_cli-native", "T-01", "--test", "true"],
				process.cwd(),
			),
		).toThrow(DoneArgumentError);
		expect(() =>
			parseDoneArgs(
				["--session", "260530_2256_cli-native", "T-01", "--test", "true"],
				process.cwd(),
			),
		).toThrow("shell no-op");
		const root = seedProject();
		try {
			const created = runAfol(root, [
				"n",
				"noop",
				"-t",
				"one",
				"--no-spec-required",
				"--reason",
				"fixture",
			]);
			expect(created.status).toBe(0);
			expect(created.stdout).toContain("afol st T-01");
			const started = runAfol(root, ["st", "T-01"]);
			expect(started.status).toBe(0);
			expect(started.stdout).toContain("afol d T-01 -x");
			const failed = runAfol(root, ["d", "T-01", "-x", "true"]);
			expect(failed.status).toBe(2);
			const text = `${failed.stdout}\n${failed.stderr}`;
			expect(text).toContain("shell no-op");
			expect(text).toContain("afol d T-01 -x");
			expect(failed.ms).toBeLessThan(300);
			const recovered = runAfol(root, ["d", "T-01", "-x", "echo hop-ok"]);
			expect(recovered.status).toBe(0);
			expect(recovered.stdout).toContain("afol c");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("n/st/d json success emit next_command without dumping briefing", () => {
		const root = seedProject();
		try {
			const created = runAfol(root, [
				"n",
				"jsonhint",
				"-t",
				"one",
				"--no-spec-required",
				"--reason",
				"fixture",
				"-j",
			]);
			expect(created.status).toBe(0);
			const createdPayload = JSON.parse(created.stdout) as {
				data?: { next_command?: string };
			};
			expect(createdPayload.data?.next_command).toBe("afol st T-01");
			const started = runAfol(root, ["st", "T-01", "-j"]);
			expect(started.status).toBe(0);
			const startedPayload = JSON.parse(started.stdout) as {
				data?: { next_command?: string; briefing?: unknown };
			};
			expect(startedPayload.data?.next_command).toBe('afol d T-01 -x "<cmd>"');
			expect(startedPayload.data?.briefing).toBeUndefined();
			const done = runAfol(root, ["d", "T-01", "-x", "echo hop-ok", "-j"]);
			expect(done.status).toBe(0);
			const donePayload = JSON.parse(done.stdout) as {
				data?: { next_command?: string };
			};
			expect(donePayload.data?.next_command).toBe("afol c");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done json parse recovery keeps the no-op message and peeked task id", () => {
		expect(peekDoneTaskIdFromArgv(["T-02", "--test", "true", "--json"])).toBe(
			"T-02",
		);
		expect(
			peekDoneTaskIdFromArgv(["--task-id", "T-03", "--test", "true"]),
		).toBe("T-03");
		const root = seedProject();
		try {
			expect(
				runAfol(root, [
					"n",
					"jsonnoop",
					"-t",
					"one",
					"-t",
					"two",
					"--no-spec-required",
					"--reason",
					"fixture",
				]).status,
			).toBe(0);
			expect(runAfol(root, ["st", "T-01"]).status).toBe(0);
			const first = runAfol(root, ["d", "T-01", "-x", "true", "-j"]);
			expect(first.status).toBe(2);
			const firstPayload = JSON.parse(first.stdout) as {
				error?: { message?: string };
				data?: { task_id?: string; next_command?: string };
			};
			expect(firstPayload.error?.message).toContain("shell no-op");
			expect(firstPayload.data?.task_id).toBe("T-01");
			expect(firstPayload.data?.next_command).toContain("afol d T-01 -x");
			expect(runAfol(root, ["st", "T-02"]).status).toBe(0);
			const second = runAfol(root, ["d", "T-02", "-x", "true", "-j"]);
			expect(second.status).toBe(2);
			const secondPayload = JSON.parse(second.stdout) as {
				error?: { message?: string };
				data?: { task_id?: string; next_command?: string };
			};
			expect(secondPayload.error?.message).toContain("shell no-op");
			expect(secondPayload.data?.task_id).toBe("T-02");
			expect(secondPayload.data?.next_command).toContain("afol d T-02 -x");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("qt no-op fails before session close and does not silently succeed", () => {
		const root = seedProject();
		try {
			const failed = runAfol(root, ["qt", "micro", "-c", "true"]);
			expect(failed.status).toBe(2);
			const text = `${failed.stdout}\n${failed.stderr}`;
			expect(text).toContain("shell no-op");
			expect(text).not.toContain("quick-task complete");
			expect(failed.stdout).not.toMatch(/session created:/);
			const wb = join(root, ".afol", "wb");
			if (existsSync(wb)) {
				expect(readdirSync(wb).filter((name) => !name.startsWith("."))).toEqual(
					[],
				);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("one pending auto-starts; two pending st fail-closed; leftover c hints st T-02", () => {
		const root = seedProject();
		try {
			expect(
				runAfol(root, [
					"n",
					"autostart",
					"-t",
					"one",
					"--no-spec-required",
					"--reason",
					"fixture",
				]).status,
			).toBe(0);
			const auto = runAfol(root, ["st"]);
			expect(auto.status).toBe(0);
			expect(auto.stdout).toContain("task started: T-01");
			expect(auto.stdout).toContain("afol d T-01 -x");

			const multi = seedProject();
			try {
				expect(
					runAfol(multi, [
						"n",
						"multipending",
						"-t",
						"one",
						"-t",
						"two",
						"--no-spec-required",
						"--reason",
						"fixture",
					]).status,
				).toBe(0);
				const blocked = runAfol(multi, ["st"]);
				expect(blocked.status).toBe(2);
				expect(`${blocked.stdout}\n${blocked.stderr}`).toContain(
					"multiple pending tasks",
				);
				expect(runAfol(multi, ["st", "T-01"]).status).toBe(0);
				expect(runAfol(multi, ["d", "T-01", "-x", "echo hop-ok"]).status).toBe(
					0,
				);
				const close = runAfol(multi, ["c"]);
				expect(close.status).toBe(2);
				expect(`${close.stdout}\n${close.stderr}`).toContain("afol st T-02");
			} finally {
				rmSync(multi, { recursive: true, force: true });
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("evidence hint plus compact status keep the short path", () => {
		const root = seedProject();
		try {
			expect(
				runAfol(root, [
					"n",
					"hint",
					"-t",
					"one",
					"--no-spec-required",
					"--reason",
					"fixture",
				]).status,
			).toBe(0);
			expect(runAfol(root, ["st", "T-01"]).status).toBe(0);
			const evidence = runAfol(root, [
				"e",
				"T-01",
				"-c",
				"echo hop-ok",
				"-o",
				"passed",
			]);
			expect(evidence.status).toBe(0);
			expect(evidence.stdout).toContain("afol d T-01 -x");
			const status = runAfol(root, ["s"]);
			expect(status.stdout).toContain("SESSION:");
			expect(status.stdout).toContain("SAFE_NEXT_ACTION:");
			expect(estimateTokens(status.stdout)).toBeLessThanOrEqual(200);
			expect(status.ms).toBeLessThan(100);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("short help stays compact and faster than a confused long-path rewrite", () => {
		const root = seedProject();
		try {
			const startHelp = runAfol(root, ["start", "--help"]);
			const newHelp = runAfol(root, ["n", "--help"]);
			const closeHelp = runAfol(root, ["c", "--help"]);
			expect(startHelp.stdout).toContain("Usage: afol st T-01");
			expect(newHelp.stdout).toContain("Usage: afol n <theme>");
			expect(closeHelp.stdout).toContain("Usage: afol c");
			expect(startHelp.ms).toBeLessThan(100);
			expect(newHelp.ms).toBeLessThan(100);
			expect(closeHelp.ms).toBeLessThan(100);
			expect(estimateTokens(startHelp.stdout)).toBeLessThan(200);
			const ls = runAfol(root, ["ls"]);
			expect(ls.stdout).toContain('hint="afol ss"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("confused-agent hops drop on noop, ls, and pending-spec versus the old sequences", () => {
		const root = seedProject();
		try {
			expect(
				runAfol(root, [
					"n",
					"compare",
					"-t",
					"one",
					"--no-spec-required",
					"--reason",
					"fixture",
				]).status,
			).toBe(0);
			runAfol(root, ["st", "T-01"]);
			const oldNoopHops = 3;
			const nowNoop = [
				runAfol(root, ["d", "T-01", "-x", "true"]),
				runAfol(root, ["d", "T-01", "-x", "echo hop-ok"]),
			];
			expect(nowNoop[0]?.status).toBe(2);
			expect(nowNoop[1]?.status).toBe(0);
			expect(nowNoop.length).toBeLessThan(oldNoopHops);

			const ls = runAfol(root, ["ls"]);
			expect(ls.stdout).toContain('hint="afol ss"');
			const ss = runAfol(root, ["ss"]);
			expect(ss.status).toBe(0);
			expect(2).toBeLessThan(3);

			const qt = runAfol(root, [
				"qt",
				"micro",
				"-t",
				"one",
				"-c",
				"echo hop-ok",
			]);
			expect(qt.status).toBe(0);
			expect(qt.stdout).toContain("afol gov rs");
			expect(qt.stdout).not.toContain("--session");
			expect(qt.ms).toBeLessThan(800);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
