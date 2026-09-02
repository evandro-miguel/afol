import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
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

function waitForExit(
	proc: ReturnType<typeof spawn>,
): Promise<{ code: number | null; stderr: string; stdout: string }> {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		proc.stdout?.setEncoding("utf8");
		proc.stderr?.setEncoding("utf8");
		proc.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		proc.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		proc.on("error", reject);
		proc.on("close", (code) => {
			resolve({ code, stderr, stdout });
		});
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

	test("emits a json envelope when requested", () => {
		const root = mkProjectRoot("json");
		try {
			const created = newWorkstream(root, "json-log");

			const proc = runKernel(root, [
				"log",
				"--session",
				created.session,
				"--message",
				"json timeline",
				"--json",
			]);

			expect(proc.status).toBe(0);
			const payload = JSON.parse(proc.stdout as string) as Record<
				string,
				unknown
			>;
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				ok: true,
				action: "workbench.log",
			});
			expect(payload.data).toMatchObject({
				session: created.session,
				status: "logged",
				message: "json timeline",
			});
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

	test("concurrent log commands preserve all timeline entries and clean up the session lock", async () => {
		const root = mkProjectRoot("log-concurrency");
		try {
			const created = newWorkstream(root, "log-concurrency");
			const messages = Array.from(
				{ length: 8 },
				(_, index) => `entry-${index}`,
			);
			const processes = messages.map((message) =>
				spawn(
					"bun",
					[kernelPath, "log", "--session", created.session, message],
					{
						cwd: root,
						stdio: ["ignore", "pipe", "pipe"],
					},
				),
			);

			const results = await Promise.all(processes.map(waitForExit));
			for (const result of results) {
				expect(result.code).toBe(0);
				expect(result.stderr).toBe("");
			}

			const log = readFileSync(created.logPath, "utf8");
			for (const message of messages) {
				expect(log).toContain(message);
			}

			const eventRows = readFileSync(
				join(root, ".afol", "data", "events", "events.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			// 1 workbench.new + 1 telemetry session_start + 8 workbench.append_log
			expect(eventRows).toHaveLength(10);
			expect(
				eventRows.filter((row) => row.type === "workbench.append_log"),
			).toHaveLength(8);
			expect(eventRows.filter((row) => row.source === "afol-cli")).toHaveLength(
				1,
			);
			expect(
				existsSync(
					join(root, ".afol", "wb", ".locks", `${created.session}.lock`),
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("workbench command parity", () => {
	test("compact workflow aliases preserve evidence and done metadata", () => {
		const root = mkProjectRoot("command-parity");
		try {
			const created = newWorkstream(root, "command-parity", {
				noSpecRequiredReason: "command parity fixture",
			});

			const startProc = runKernel(root, ["st", "-S", created.session]);
			expect(startProc.status).toBe(0);

			const evidenceProc = runKernel(root, [
				"e",
				"-S",
				created.session,
				"-T",
				"T-01",
				"-c",
				"bun test",
				"-o",
				"passed",
				"--artifact",
				"reports/unit.md",
				"--note",
				"unit gate",
			]);
			expect(evidenceProc.status).toBe(0);

			const doneProc = runKernel(root, [
				"d",
				"-S",
				created.session,
				"-T",
				"T-01",
				"--test",
				"test -d .afol",
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
				command: "test -d .afol",
				result: "passed",
				provenance: "observed",
			});
			expect(readFileSync(created.taskPath, "utf8")).toContain(
				"| T-01 | done | worker |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
