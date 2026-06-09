import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newWorkstream } from "../services/workbench/lifecycle";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function mkProjectRoot(name: string): string {
	const root = mkdtempSync(join(tmpdir(), `log-command-${name}-`));
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({ schema_version: 1 }),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
	return root;
}

function runKernel(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

describe("log command", () => {
	test("appends a timeline entry to the active session log", () => {
		const root = mkProjectRoot("active");
		try {
			const created = newWorkstream(root, "timeline-entry");

			const proc = runKernel(root, [
				"log",
				"--message",
				"implemented native log",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).toContain("log appended:");
			const log = readFileSync(created.logPath, "utf8");
			expect(log).toContain("## Timeline");
			expect(log).toContain("implemented native log");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts token-optimized session flag and positional message", () => {
		const root = mkProjectRoot("session");
		try {
			const created = newWorkstream(root, "explicit-session");

			const proc = runKernel(root, [
				"l",
				"-S",
				created.session,
				"from",
				"alias",
			]);

			expect(proc.status).toBe(0);
			const log = readFileSync(created.logPath, "utf8");
			expect(log).toContain("from alias");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("workbench command parity", () => {
	test("start auto-selects the only pending task and evidence/done persist metadata", () => {
		const root = mkProjectRoot("command-parity");
		try {
			const created = newWorkstream(root, "command-parity");

			const startProc = runKernel(root, [
				"start",
				"--session",
				created.session,
			]);
			expect(startProc.status).toBe(0);

			const evidenceProc = runKernel(root, [
				"evidence",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--command",
				"bun test",
				"--result",
				"passed",
				"--artifact",
				"reports/unit.md",
				"--note",
				"unit gate",
			]);
			expect(evidenceProc.status).toBe(0);

			const doneProc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--command",
				"bun run validate",
				"--result",
				"passed",
				"--artifact",
				"reports/validate.md",
				"--note",
				"closure gate",
			]);
			expect(doneProc.status).toBe(0);

			const evidence = readFileSync(created.evidencePath, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(evidence).toHaveLength(2);
			expect(evidence[0]).toMatchObject({
				task_id: "T-01",
				command: "bun test",
				result: "passed",
				artifact: "reports/unit.md",
				note: "unit gate",
			});
			expect(evidence[1]).toMatchObject({
				task_id: "T-01",
				command: "bun run validate",
				result: "passed",
				artifact: "reports/validate.md",
				note: "closure gate",
			});
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | done | worker |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
