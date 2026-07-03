import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	runStatusCommand,
	setCatchupComputerForTests,
} from "../commands/status";
import { rebuildProjectIndexes } from "../services/local-state/project-indexes";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
import { rebuildPstrIndex } from "../services/pstr/builder";
import { collectGlobalStatusFindings } from "../services/status/global-findings";
import type { CatchupReport } from "../services/workbench/catchup";

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

afterEach(() => {
	setCatchupComputerForTests(null);
});

function runGit(root: string, args: string[]): void {
	const result = spawnSync("git", args, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		throw new Error(
			(result.stderr as string) || `git ${args.join(" ")} failed`,
		);
	}
}

function initGitRoot(root: string): void {
	runGit(root, ["init"]);
	runGit(root, ["config", "user.email", "status@example.com"]);
	runGit(root, ["config", "user.name", "Status Test"]);
}

function commitAll(root: string, message: string): void {
	runGit(root, ["add", "."]);
	runGit(root, ["commit", "-m", message]);
}

function touch(path: string, isoTime: string): void {
	const date = new Date(isoTime);
	utimesSync(path, date, date);
}

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "status-command-"));
	const afolDir = join(root, ".afol");
	const agentsDir = join(root, ".agents");
	const wbDir = join(root, ".afol", "wb");
	const activeSessionFile = join(wbDir, ".active_session");
	const sessionId = "260530_2256_cli-native-command-parity";
	const sessionDir = join(wbDir, sessionId);

	mkdirSync(afolDir, { recursive: true });
	mkdirSync(agentsDir, { recursive: true });
	mkdirSync(sessionDir, { recursive: true });

	writeFileSync(
		join(afolDir, "config.json"),
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

function createFreshnessFixture(mode: "fresh" | "stale-log"): {
	root: string;
	session: string;
} {
	const root = mkdtempSync(join(tmpdir(), "status-freshness-"));
	const session = "260530_2257_status-freshness";
	const afolDir = join(root, ".afol");
	const agentsDir = join(root, ".agents");
	const wbDir = join(root, ".afol", "wb");
	const activeSessionFile = join(wbDir, ".active_session");
	const sessionDir = join(wbDir, session);
	const workFile = join(root, "work.txt");

	mkdirSync(afolDir, { recursive: true });
	mkdirSync(agentsDir, { recursive: true });
	mkdirSync(sessionDir, { recursive: true });

	writeFileSync(
		join(afolDir, "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "status-freshness" },
		}),
		"utf8",
	);
	writeFileSync(
		join(agentsDir, "lock.json"),
		JSON.stringify({
			schema_version: 1,
			revision: "abc123",
			project: "status-freshness",
			locked: true,
		}),
		"utf8",
	);
	writeFileSync(activeSessionFile, `${session}\n`, "utf8");
	writeFileSync(
		join(sessionDir, `${session}_plan_01.md`),
		"---\nstatus: in_progress\n---\nplan\n",
		"utf8",
	);
	writeFileSync(
		join(sessionDir, `${session}_task_01.md`),
		"---\ntask_id: T-01\nstatus: in_progress\n---\n| T-01 | in_progress | worker | status |\n",
		"utf8",
	);
	writeFileSync(
		join(sessionDir, `${session}_log_01.md`),
		"---\nstatus: in_progress\n---\nlog\n",
		"utf8",
	);
	writeFileSync(
		join(sessionDir, `${session}_research_01.md`),
		"---\nstatus: in_progress\n---\nresearch\n",
		"utf8",
	);
	writeFileSync(
		join(sessionDir, `${session}_report_01.md`),
		"---\nstatus: in_progress\n---\nreport\n",
		"utf8",
	);
	writeFileSync(workFile, "base\n", "utf8");

	initGitRoot(root);
	commitAll(root, "status freshness fixture");

	if (mode === "stale-log") {
		writeFileSync(workFile, "base\nupdated\n", "utf8");
		touch(workFile, "2026-06-14T11:00:00.000Z");
		touch(join(sessionDir, `${session}_log_01.md`), "2026-06-14T10:00:00.000Z");
	}

	return { root, session };
}

function createNoSessionFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "status-no-session-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "status-no-session" },
		}),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({
			schema_version: 1,
			revision: "abc123",
			project: "status-no-session",
			locked: true,
		}),
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

	test("selects active state-board task before first task id", () => {
		const root = createFixture();
		try {
			const sessionId = "260530_2256_cli-native-command-parity";
			const taskFile = join(
				root,
				".afol",
				"wb",
				sessionId,
				`${sessionId}_task_01.md`,
			);
			writeFileSync(
				taskFile,
				[
					"---",
					"task_id: T-01",
					"status: pending",
					"---",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | first id is not active |",
					"| T-02 | in_progress | worker | real active task |",
					"| T-03 | done | worker | complete |",
					"",
					"NEXT:",
					"- continue T-02",
					"",
				].join("\n"),
				"utf8",
			);

			const captured = captureIo();
			const code = runStatusCommand(root, [], captured.io);
			const text = captured.stdout[0] ?? "";
			expect(code).toBe(0);
			expect(text).toContain("TASK: T-02");
			expect(text).toContain("STATUS: in_progress");

			const override = captureIo();
			const overrideCode = runStatusCommand(
				root,
				["--task-id", "T-01"],
				override.io,
			);
			const overrideText = override.stdout[0] ?? "";
			expect(overrideCode).toBe(0);
			expect(overrideText).toContain("TASK: T-01");
			expect(overrideText).toContain("STATUS: pending");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("active session + stale log shows log_behind_diff=yes", () => {
		const { root } = createFreshnessFixture("stale-log");
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, ["--catchup"], captured.io);
			expect(code).toBe(0);
			const text = captured.stdout[0] ?? "";
			expect(text).toContain("freshness:");
			expect(text).toContain("log_behind_diff=yes");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("active session + fresh prints freshness ok", () => {
		const { root } = createFreshnessFixture("fresh");
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, ["--catchup"], captured.io);
			expect(code).toBe(0);
			expect(captured.stdout[0] ?? "").toContain("freshness: ok");
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
				data?: {
					status?: string;
					task?: string;
					paths?: Record<string, unknown>;
				};
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
			expect(paths.config_source).toBe("canonical");
			expect(typeof paths.lock).toBe("string");
			expect(typeof paths.active_session).toBe("string");
			expect(typeof paths.task_file).toBe("string");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("surfaces global index failures instead of masking blockers as none", () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, [], captured.io);
			expect(code).toBe(0);

			const text = captured.stdout[0] ?? "";
			expect(text).toContain("VALIDATION_OR_CHECKS:");
			expect(text).toContain("BLOCKERS:");
			expect(text).toContain("- none");
			expect(text).not.toContain("project indexes need rebuild");
			expect(text).not.toContain("run afol local-state rebuild");
			expect(text).not.toContain("run afol pstr rebuild");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("surfaces global index findings with --health", () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, ["--health"], captured.io);
			expect(code).toBe(0);

			const text = captured.stdout[0] ?? "";
			expect(text).toContain("VALIDATION_OR_CHECKS:");
			expect(text).toContain("BLOCKERS:");
			expect(text).toContain("project indexes need rebuild");
			expect(text).toContain("run afol local-state rebuild; afol pstr rebuild");
			expect(text).not.toContain("BLOCKERS:\n- none");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("supports --task-id status override", () => {
		const root = createFixture();
		try {
			const sessionId = "260530_2256_cli-native-command-parity";
			const sessionDir = join(root, ".afol", "wb", sessionId);
			writeFileSync(
				join(sessionDir, `${sessionId}_task_02.md`),
				[
					"---",
					"task_id: T-02",
					"status: done",
					"---",
					"",
					"FILES_WRITTEN:",
					"- cli/commands/other.ts",
					"VALIDATION_OR_CHECKS:",
					"- none",
					"BLOCKERS:",
					"- none",
					"NEXT:",
					"- none",
					"",
				].join("\n"),
				"utf8",
			);

			const captured = captureIo();
			const code = runStatusCommand(root, ["--task-id", "T-02"], captured.io);
			expect(code).toBe(0);
			const text = captured.stdout[0] ?? "";
			expect(text).toContain("TASK: T-02");
			expect(text).toContain("STATUS: done");
			expect(text).not.toContain("TASK: T-01");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails explicit --task-id when the task does not exist", () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, ["--task-id", "T-99"], captured.io);

			expect(code).toBe(1);
			expect(captured.stdout).toEqual([]);
			expect(captured.stderr.join("\n")).toContain("error: task-not-found");
			expect(captured.stderr.join("\n")).toContain("T-99");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns JSON error for explicit --task-id misses", () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			const code = runStatusCommand(
				root,
				["--task-id", "T-99", "--json"],
				captured.io,
			);

			expect(code).toBe(1);
			expect(captured.stderr).toEqual([]);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok?: boolean;
				exit_code?: number;
				error?: { code?: string; message?: string };
			};
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.error?.code).toBe("task-not-found");
			expect(payload.error?.message).toContain("T-99");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("global status findings report local-state rebuild when PSTR is current", () => {
		const root = createFixture();
		try {
			rebuildPstrIndex(root);

			const findings = collectGlobalStatusFindings(root);

			expect(findings).toHaveLength(1);
			expect(findings[0]).toMatchObject({
				validation: "local-state: 5 index snapshots need rebuild",
				blocker: "local-state: 5 index snapshots need rebuild",
				next: "run afol local-state rebuild",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("global status findings report PSTR rebuild when local-state is current", () => {
		const root = createFixture();
		try {
			rebuildWorkBenchIndex(root);
			rebuildProjectIndexes(root);

			const findings = collectGlobalStatusFindings(root);

			expect(
				findings.some((finding) => finding.validation.startsWith("pstr:")),
			).toBe(true);
			expect(
				findings.some((finding) =>
					finding.validation.startsWith("local-state:"),
				),
			).toBe(false);
			expect(findings[0]?.next).toBe("run afol pstr rebuild");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("default status skips catchup for active session and --catchup enables it", () => {
		const { root, session } = createFreshnessFixture("fresh");
		try {
			let catchupCalls = 0;
			const report: CatchupReport = {
				session,
				session_status: "active",
				git_changed_files: [],
				git_changed_files_overflow: false,
				git_branch: "main",
				artifacts: {
					plan: { present: true, mtime: null, lines: 1 },
					task: { present: true, mtime: null, lines: 1 },
					log: { present: true, mtime: null, lines: 1 },
					report: { present: true, mtime: null, lines: 1 },
				},
				freshness: {
					findings_stale: false,
					log_behind_diff: false,
					notes: [],
				},
				next_step: "next",
			};
			setCatchupComputerForTests((() => {
				catchupCalls += 1;
				return report;
			}) as Parameters<typeof setCatchupComputerForTests>[0]);

			const textCaptured = captureIo();
			const textCode = runStatusCommand(root, [], textCaptured.io);
			expect(textCode).toBe(0);
			expect(catchupCalls).toBe(0);
			expect(textCaptured.stdout.join("\n")).not.toContain("freshness:");

			const jsonCaptured = captureIo();
			const jsonCode = runStatusCommand(root, ["--json"], jsonCaptured.io);
			expect(jsonCode).toBe(0);
			const jsonPayload = JSON.parse(jsonCaptured.stdout[0] ?? "{}") as {
				data?: { session?: unknown };
			};
			expect(jsonPayload.data?.session).toBeUndefined();

			const catchupText = captureIo();
			const catchupTextCode = runStatusCommand(
				root,
				["--catchup"],
				catchupText.io,
			);
			expect(catchupTextCode).toBe(0);
			expect(catchupCalls).toBe(1);
			expect(catchupText.stdout.join("\n")).toContain("freshness: ok");

			const catchupJson = captureIo();
			const catchupJsonCode = runStatusCommand(
				root,
				["--json", "--catchup"],
				catchupJson.io,
			);
			expect(catchupJsonCode).toBe(0);
			const catchupPayload = JSON.parse(catchupJson.stdout[0] ?? "{}") as {
				data?: {
					session?: {
						id?: string;
						freshness?: unknown;
					};
				};
			};
			expect(catchupPayload.data?.session?.id).toBe(session);
			expect(catchupPayload.data?.session?.freshness).toBeDefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--json includes freshness under session when catchup is requested", () => {
		const { root, session } = createFreshnessFixture("fresh");
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, ["--json", "--catchup"], captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				data?: {
					session?: {
						id?: string;
						freshness?: unknown;
					};
				};
			};
			expect(payload.data?.session?.id).toBe(session);
			expect(payload.data?.session?.freshness).toBeDefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--json omits freshness when no active session exists", () => {
		const root = createNoSessionFixture();
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				data?: {
					session?: unknown;
				};
			};
			expect(payload.data?.session).toBeUndefined();
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

	test("no active session omits freshness line", () => {
		const root = createNoSessionFixture();
		try {
			const captured = captureIo();
			const code = runStatusCommand(root, [], captured.io);
			expect(code).toBe(0);
			expect(captured.stdout[0] ?? "").not.toContain("freshness:");
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
