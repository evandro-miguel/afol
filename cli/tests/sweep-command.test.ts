import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSweepCommand } from "../commands/sweep";
import { writeMemory as writeProjectMemory } from "../services/memory";
import { openDb } from "../services/state";

function createHealthyFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "sweep-healthy-"));
	mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
	mkdirSync(join(root, ".afol", "state"), { recursive: true });
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	openDb(root).close();
	const now = new Date().toISOString();
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
	writeFileSync(
		join(root, ".afol", "pstr", "index.json"),
		`${JSON.stringify({
			kind: "pstr_index_v1",
			version: 1,
			generated_at: now,
			source: { project_root: root, pstr_dir: join(root, ".afol", "pstr") },
			maps: [
				{
					id: "cli",
					scope: "cli",
					status: "current",
					authority: "observed",
					source_paths: ["cli/main.ts"],
					source_hash: "hash-1",
					file_count: 1,
					updated_at: now,
					stale_after: future,
					tags: ["pstr"],
				},
				{
					id: "template",
					scope: "template",
					status: "current",
					authority: "observed",
					source_paths: ["src/project-template/index.ts"],
					source_hash: "hash-2",
					file_count: 1,
					updated_at: now,
					stale_after: future,
					tags: ["pstr"],
				},
				{
					id: "docs",
					scope: "docs",
					status: "current",
					authority: "observed",
					source_paths: ["docs/readme.md"],
					source_hash: "hash-3",
					file_count: 1,
					updated_at: now,
					stale_after: future,
					tags: ["pstr"],
				},
				{
					id: "config",
					scope: "config",
					status: "current",
					authority: "observed",
					source_paths: [".agents/config.json"],
					source_hash: "hash-4",
					file_count: 1,
					updated_at: now,
					stale_after: future,
					tags: ["pstr"],
				},
			],
		})}\n`,
		"utf8",
	);
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
				checked: number;
				issues: number;
				actions: string[];
			};
			expect(payload.checked).toBeGreaterThan(0);
			expect(payload.issues).toBeGreaterThan(0);
			expect(payload.actions).toContain("rebuild pstr");
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
			const payload = JSON.parse(out[0] ?? "{}");
			expect(payload.action).toBe("monthly");
			expect(payload.ok).toBe(true);
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
