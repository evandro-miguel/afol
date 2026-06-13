import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStatusCommand } from "../commands/status";

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

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "status-command-"));
	const agentsDir = join(root, ".agents");
	const wbDir = join(root, ".afol", "wb");
	const activeSessionFile = join(wbDir, ".active_session");
	const sessionId = "260530_2256_cli-native-command-parity";
	const sessionDir = join(wbDir, sessionId);

	mkdirSync(agentsDir, { recursive: true });
	mkdirSync(sessionDir, { recursive: true });

	writeFileSync(
		join(agentsDir, "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "status-fixture" },
		}),
		"utf8",
	);

	writeFileSync(
		join(agentsDir, "lock.json"),
		JSON.stringify({
			schema_version: 1,
			revision: "abc123",
			project: "status-fixture",
			locked: true,
		}),
		"utf8",
	);

	writeFileSync(activeSessionFile, `${sessionId}\n`, "utf8");

	const taskFile = join(sessionDir, `${sessionId}_task_01.md`);
	writeFileSync(
		taskFile,
		[
			"---",
			"task_id: T-01",
			"status: in_progress",
			"---",
			"",
			"FILES_WRITTEN:",
			"- cli/commands/status.ts",
			"VALIDATION_OR_CHECKS:",
			"- bun test cli/tests/status.test.ts",
			"BLOCKERS:",
			"- none",
			"NEXT:",
			"- implement validate",
			"",
		].join("\n"),
		"utf8",
	);

	return root;
}

describe("status command", () => {
	test("prints compact STATUS block with required fields", () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, [], captured.io);
			expect(code).toBe(0);
			expect(captured.stderr).toEqual([]);
			expect(captured.stdout.length).toBe(1);

			const text = captured.stdout[0] ?? "";
			expect(text).toContain("STATUS:");
			expect(text).toContain("TASK:");
			expect(text).toContain("FILES_WRITTEN:");
			expect(text).toContain("VALIDATION_OR_CHECKS:");
			expect(text).toContain("BLOCKERS:");
			expect(text).toContain("NEXT:");
			expect(text).toContain("TASK: T-01");
			expect(text).toContain("STATUS: in_progress");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

		test("supports --json with simple payload and read paths", () => {
			const root = createFixture();
			try {
				const captured = captureIo();
				const code = runStatusCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
			expect(captured.stderr).toEqual([]);
			expect(captured.stdout.length).toBe(1);

				const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
					schema: string;
					ok: boolean;
					exit_code: number;
					status: string;
					task: string;
					paths: Record<string, unknown>;
					data?: { status?: string; task?: string; paths?: Record<string, unknown> };
				};
				expect(payload.schema).toBe("afol.result/v1");
				expect(payload.ok).toBe(true);
				expect(payload.exit_code).toBe(0);
				expect(payload.status).toBe("in_progress");
				expect(payload.task).toBe("T-01");
				expect(payload.data?.status).toBe("in_progress");
				expect(payload.data?.task).toBe("T-01");
				const paths = payload.paths;
				expect(typeof paths.config).toBe("string");
				expect(typeof paths.lock).toBe("string");
				expect(typeof paths.active_session).toBe("string");
				expect(typeof paths.task_file).toBe("string");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects unknown arguments before reading project state", () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, ["--bad"], captured.io);

			expect(code).toBe(2);
			expect(captured.stdout).toEqual([]);
			expect(captured.stderr).toEqual(["Unknown status argument: --bad"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports no active task when active session points to missing task files", () => {
		const root = createFixture();
		try {
			const activeSessionFile = join(root, ".afol", "wb", ".active_session");
			writeFileSync(activeSessionFile, "260530_9999_missing-tasks\n", "utf8");

			const captured = captureIo();
			const code = runStatusCommand(root, ["--json"], captured.io);

			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(payload.status).toBe("none");
			expect(payload.task).toBe("none");
			expect((payload.paths as Record<string, unknown>).task_file).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("extracts task fields from state board, inline values, and plain lines", () => {
		const root = createFixture();
		try {
			const sessionId = "260530_2256_cli-native-command-parity";
			const sessionDir = join(root, ".afol", "wb", sessionId);
			writeFileSync(
				join(sessionDir, `${sessionId}_task_01.md`),
				[
					"---",
					"task_id: T-01",
					"status: done",
					"---",
					"",
					"# Task",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | covered |",
					"",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(sessionDir, `${sessionId}_task_02.md`),
				[
					"---",
					"task_id: T-02",
					"status: tested_needs_spec_validation",
					"---",
					"",
					"# Task",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-02 | tested_needs_spec_validation | worker | verify status extraction |",
					"",
					"FILES_WRITTEN: cli/commands/status.ts",
					"VALIDATION_OR_CHECKS:",
					"",
					"- bun test cli/tests/status.test.ts",
					"BLOCKERS:",
					"- none",
					"NEXT:",
					"review coverage output",
					"",
				].join("\n"),
				"utf8",
			);

			const captured = captureIo();
			const code = runStatusCommand(root, [], captured.io);
			const text = captured.stdout[0] ?? "";

			expect(code).toBe(0);
			expect(text).toContain("STATUS: tested_needs_spec_validation");
			expect(text).toContain("TASK: T-02");
			expect(text).toContain("- cli/commands/status.ts");
			expect(text).toContain("- bun test cli/tests/status.test.ts");
			expect(text).toContain("- review coverage output");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
