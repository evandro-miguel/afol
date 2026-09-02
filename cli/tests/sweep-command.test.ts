import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSweepCommand } from "../commands/sweep";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
import { writeMemory as writeProjectMemory } from "../services/memory/crud";
import { rebuildPstrIndex } from "../services/pstr/builder";
import { openDb } from "../services/state/db";

function initGitRepo(root: string): void {
	const git = (args: string[]): void => {
		const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
		if (result.status !== 0) {
			throw new Error(
				result.stderr || result.stdout || `git ${args.join(" ")}`,
			);
		}
	};
	git(["init"]);
	git(["config", "user.email", "afol@example.test"]);
	git(["config", "user.name", "AFOL Test"]);
	git(["add", "."]);
	git(["commit", "--no-gpg-sign", "-m", "init"]);
}

function createHealthyFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "sweep-healthy-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
	mkdirSync(join(root, ".afol", "state"), { recursive: true });
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	mkdirSync(join(root, "cli"), { recursive: true });
	mkdirSync(join(root, "docs"), { recursive: true });
	mkdirSync(join(root, "src", "project-template"), { recursive: true });
	writeFileSync(join(root, ".agents", "config.json"), '{"version":"0.1.0"}');
	writeFileSync(join(root, ".agents", "lock.json"), '{"version":"0.1.0"}');
	writeFileSync(join(root, ".agents", "manifest.json"), '{"commands":[]}');
	writeFileSync(join(root, "cli", "main.ts"), "export const cli = true;\n");
	writeFileSync(
		join(root, "src", "project-template", "index.ts"),
		"export const template = true;\n",
	);
	writeFileSync(join(root, "docs", "readme.md"), "# Docs\n");
	openDb(root).close();
	const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
	writeProjectMemory(root, {
		updated_at: future,
		entries: [
			{
				id: "M-1",
				title: "Healthy memory",
				body: "ok",
				status: "active",
				created_at: future,
				updated_at: future,
				tags: [],
			},
		],
	});
	rebuildPstrIndex(root);
	rebuildWorkBenchIndex(root);
	initGitRepo(root);
	return root;
}

describe("sweep command", () => {
	test("daily sweep returns maintenance actions", async () => {
		const root = mkdtempSync(join(tmpdir(), "sweep-daily-"));
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (_: string) => undefined,
			};
			expect(await runSweepCommand("daily", ["--json"], root, io)).toBe(1);
			const payload = JSON.parse(out[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				checked: number;
				issues: number;
				actions: string[];
				data?: {
					action?: string;
					checked?: number;
					issues?: number;
					actions?: string[];
				};
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.action).toBe("daily");
			expect(payload.checked).toBeGreaterThan(0);
			expect(payload.issues).toBeGreaterThan(0);
			expect(payload.actions.length).toBeGreaterThan(0);
			expect(payload.data?.action).toBe("daily");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("daily sweep returns ok on healthy fixture", async () => {
		const root = createHealthyFixture();
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (_: string) => undefined,
			};
			expect(await runSweepCommand("daily", [], root, io)).toBe(0);
			expect(out[0] ?? "").toContain("sweep daily: ok");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("weekly sweep returns ok on healthy fixture", async () => {
		const root = createHealthyFixture();
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (_: string) => undefined,
			};
			expect(await runSweepCommand("weekly", [], root, io)).toBe(0);
			expect(out[0] ?? "").toContain("sweep weekly: ok");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("monthly sweep returns JSON on healthy fixture", async () => {
		const root = createHealthyFixture();
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (_: string) => undefined,
			};
			expect(await runSweepCommand("monthly", ["--json"], root, io)).toBe(0);
			const payload = JSON.parse(out[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				checked: number;
				issues: number;
				data?: { action?: string; checked?: number; issues?: number };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("monthly");
			expect(payload.data?.action).toBe("monthly");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("sweep rejects invalid args", async () => {
		const root = mkdtempSync(join(tmpdir(), "sweep-invalid-"));
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (value: string) => out.push(value),
			};
			expect(await runSweepCommand("daily", ["--bogus"], root, io)).toBe(2);
			expect(out[0] ?? "").toContain("Unknown sweep argument: --bogus");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
