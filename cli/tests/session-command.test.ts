import { afterEach, describe, expect, test } from "bun:test";
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
import {
	runSessionCommand,
	setCoordinationRadarReaderForTests,
} from "../commands/session";
import {
	defaultOperationContext,
	remoteOperationContext,
} from "../core/operation-context";
import { readActiveSession } from "../services/workbench/lifecycle";
import {
	bindSession,
	readSessionContext,
	removeBinding,
	resolveContextSession,
	resolveSession,
} from "../services/workbench/session-context";

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

function createProjectRoot(name: string): string {
	const root = mkdtempSync(join(tmpdir(), `session-command-${name}-`));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify(
			{ schema_version: 1, project: { name: `session-${name}` } },
			null,
			2,
		),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }, null, 2),
		"utf8",
	);
	return root;
}

function createSessionFixture(root: string, session: string): void {
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(join(sessionDir, `${session}_task_01.md`), "# task\n", "utf8");
}

function createStateBoardSession(
	root: string,
	session: string,
	state: string,
): void {
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, `${session}_task_01.md`),
		[
			"# Tasks",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			`| T-01 | ${state} | worker | task state fixture |`,
			"",
		].join("\n"),
		"utf8",
	);
}

function createClosedSession(root: string, session: string): void {
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, `${session}_task_01.md`),
		[
			"---",
			'doc_type: "workbench_task"',
			`id: "${session}_task_01"`,
			`session_id: "${session}"`,
			'status: "closed"',
			'created_at: "2026-07-09T22:30:00.000Z"',
			'updated_at: "2026-07-09T22:30:00.000Z"',
			'closed_at: "2026-07-09T22:30:00.000Z"',
			"---",
			"",
			"# Tasks",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | done | worker | task state fixture |",
			"",
		].join("\n"),
		"utf8",
	);
}

function initGitRepo(root: string, branch = "parallel-session-test"): void {
	const git = (args: string[]): void => {
		const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
		if (result.status !== 0) {
			throw new Error(
				result.stderr || result.stdout || `git ${args.join(" ")}`,
			);
		}
	};
	git(["init"]);
	git(["config", "user.email", "test@example.com"]);
	git(["config", "user.name", "Test User"]);
	writeFileSync(join(root, "README.md"), "fixture\n", "utf8");
	git(["add", "README.md"]);
	git(["commit", "-m", "init"]);
	git(["checkout", "-b", branch]);
}

function currentGitBranch(root: string): string {
	const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	});
	if (result.status !== 0) {
		throw new Error(
			result.stderr || result.stdout || "git branch lookup failed",
		);
	}
	return result.stdout.trim();
}

function restoreEnv(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

afterEach(() => {
	setCoordinationRadarReaderForTests(null);
});

describe("session context service", () => {
	test("malformed context fails closed and is not overwritten", () => {
		const root = createProjectRoot("malformed-context");
		const path = join(root, ".afol", "wb", "session-context.json");
		try {
			writeFileSync(path, "{broken", "utf8");
			expect(() => bindSession(root, { session: "S-01" })).toThrow(
				"Invalid session context",
			);
			expect(readFileSync(path, "utf8")).toBe("{broken");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("serialized independent binds preserve both bindings", () => {
		const root = createProjectRoot("serialized-binds");
		try {
			bindSession(root, { session: "S-01", branch: "one" });
			bindSession(root, { session: "S-02", branch: "two" });
			expect(
				readSessionContext(root)
					.bindings.map((item) => item.session)
					.sort(),
			).toEqual(["S-01", "S-02"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
	test("readSessionContext returns empty when file is missing", () => {
		const root = createProjectRoot("missing");
		try {
			expect(readSessionContext(root)).toEqual({ bindings: [] });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bindSession and resolveContextSession round-trip on git repo", () => {
		const root = createProjectRoot("roundtrip");
		initGitRepo(root);
		try {
			const branch = currentGitBranch(root);
			const binding = bindSession(root, {
				session: "S-ROUNDTRIP",
				branch,
				worktree: root,
				actor: "local",
			});
			expect(binding.session).toBe("S-ROUNDTRIP");
			expect(resolveContextSession(root)).toBe("S-ROUNDTRIP");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("session resolution contract", () => {
	test("resolveSession prefers explicit over env, context, and global", () => {
		const root = createProjectRoot("resolve-order");
		initGitRepo(root);
		const saved = {
			AFOL_SESSION: process.env.AFOL_SESSION,
			AFOL_CI: process.env.AFOL_CI,
			CI: process.env.CI,
		};
		try {
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"GLOBAL\n",
				"utf8",
			);
			bindSession(root, {
				session: "CONTEXT",
				branch: currentGitBranch(root),
				worktree: root,
			});
			process.env.AFOL_SESSION = "ENV";
			expect(resolveSession(root, { explicit: "EXPLICIT" })?.session).toBe(
				"EXPLICIT",
			);
			expect(resolveSession(root, {})?.session).toBe("ENV");
			delete process.env.AFOL_SESSION;
			expect(resolveSession(root, {})?.session).toBe("CONTEXT");
			removeBinding(root, "CONTEXT");
			expect(resolveSession(root, {})?.session).toBe("GLOBAL");
		} finally {
			restoreEnv("AFOL_SESSION", saved.AFOL_SESSION);
			restoreEnv("AFOL_CI", saved.AFOL_CI);
			restoreEnv("CI", saved.CI);
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolveSession rejects global fallback in CI mode", () => {
		const root = createProjectRoot("ci-mode");
		const saved = {
			AFOL_SESSION: process.env.AFOL_SESSION,
			AFOL_CI: process.env.AFOL_CI,
			CI: process.env.CI,
		};
		try {
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"GLOBAL\n",
				"utf8",
			);
			delete process.env.AFOL_SESSION;
			process.env.CI = "1";
			expect(resolveSession(root, {})).toBeNull();
		} finally {
			restoreEnv("AFOL_SESSION", saved.AFOL_SESSION);
			restoreEnv("AFOL_CI", saved.AFOL_CI);
			restoreEnv("CI", saved.CI);
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("afol session command", () => {
	test("list renders text and json envelopes", async () => {
		const root = createProjectRoot("list");
		initGitRepo(root);
		try {
			const branch = currentGitBranch(root);
			bindSession(root, {
				session: "LISTED",
				branch,
				worktree: root,
			});
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"LISTED\n",
				"utf8",
			);
			const text = captureIo();
			const textCode = await runSessionCommand("list", [], root, text.io);
			expect(textCode).toBe(0);
			expect(text.stdout.join("\n")).toContain("session list:");
			expect(text.stdout.join("\n")).toContain("global active: LISTED");
			expect(text.stdout.join("\n")).toContain("LISTED");
			expect(text.stdout.join("\n")).not.toContain(root);

			const json = captureIo();
			const jsonCode = await runSessionCommand(
				"list",
				["--json"],
				root,
				json.io,
			);
			expect(jsonCode).toBe(0);
			const parsed = JSON.parse(json.stdout.join("\n")) as {
				schema: string;
				ok: boolean;
				action: string;
				data: {
					global_active_session: string;
					current_worktree: string;
					bindings: Array<{
						session: string;
						matches_context: boolean;
						worktree: string;
					}>;
				};
			};
			expect(parsed.schema).toBe("afol.result/v1");
			expect(parsed.ok).toBe(true);
			expect(parsed.action).toBe("session.list");
			expect(parsed.data.global_active_session).toBe("LISTED");
			expect(parsed.data.current_worktree).toBe(".");
			expect(parsed.data.bindings[0]?.worktree).toBe(".");
			expect(parsed.data.bindings[0]?.matches_context).toBe(true);

			const debugText = captureIo();
			const debugTextCode = await runSessionCommand(
				"list",
				["--debug"],
				root,
				debugText.io,
			);
			expect(debugTextCode).toBe(0);
			expect(debugText.stdout.join("\n")).toContain(root);

			const debugJson = captureIo();
			const debugJsonCode = await runSessionCommand(
				"list",
				["--json", "--debug"],
				root,
				debugJson.io,
			);
			expect(debugJsonCode).toBe(0);
			const debugParsed = JSON.parse(debugJson.stdout.join("\n")) as {
				data: {
					current_worktree: string;
					bindings: Array<{ worktree: string }>;
				};
			};
			expect(debugParsed.data.current_worktree).toBe(root);
			expect(debugParsed.data.bindings[0]?.worktree).toBe(root);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bind creates a context binding", async () => {
		const root = createProjectRoot("bind");
		initGitRepo(root);
		try {
			createSessionFixture(root, "BOUND");
			const io = captureIo();
			const code = await runSessionCommand(
				"bind",
				["--session", "BOUND", "--actor", "local"],
				root,
				io.io,
			);
			expect(code).toBe(0);
			expect(readSessionContext(root).bindings[0]?.session).toBe("BOUND");
			expect(io.stdout.join("\n")).toContain("session bound: BOUND");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("switch updates the global pointer and binding", async () => {
		const root = createProjectRoot("switch");
		initGitRepo(root);
		try {
			createSessionFixture(root, "SWITCHED");
			const io = captureIo();
			const code = await runSessionCommand("switch", ["SWITCHED"], root, io.io);
			expect(code).toBe(0);
			expect(readActiveSession(root)).toBe("SWITCHED");
			expect(resolveContextSession(root)).toBe("SWITCHED");
			expect(io.stdout.join("\n")).toContain("session switched: SWITCHED");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("switch restores active pointer and context when binding fails", async () => {
		const root = createProjectRoot("switch-rollback");
		createSessionFixture(root, "OLD");
		createSessionFixture(root, "NEXT");
		writeFileSync(
			join(root, ".afol", "wb", ".active_session"),
			"OLD\n",
			"utf8",
		);
		bindSession(root, { session: "OLD", branch: "old" });
		const contextPath = join(root, ".afol", "wb", "session-context.json");
		const before = readFileSync(contextPath, "utf8");
		const captured = captureIo();
		try {
			expect(
				await runSessionCommand(
					"switch",
					["NEXT"],
					root,
					captured.io,
					defaultOperationContext(),
					{
						beforeSwitchBinding: () => {
							throw new Error("injected binding failure");
						},
					},
				),
			).toBe(2);
			expect(readActiveSession(root)).toBe("OLD");
			expect(readFileSync(contextPath, "utf8")).toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bind rejects a missing session folder", async () => {
		const root = createProjectRoot("bind-missing");
		initGitRepo(root);
		try {
			const io = captureIo();
			const code = await runSessionCommand(
				"bind",
				["--session", "MISSING"],
				root,
				io.io,
			);
			expect(code).toBe(2);
			expect(io.stderr.join("\n")).toContain(
				"session not found: MISSING (missing folder",
			);
			expect(io.stdout).toEqual([]);
			expect(readSessionContext(root).bindings).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bind --json --session MISSING returns JSON error envelope", async () => {
		const root = createProjectRoot("bind-json-missing");
		initGitRepo(root);
		try {
			const io = captureIo();
			const code = await runSessionCommand(
				"bind",
				["--json", "--session", "MISSING"],
				root,
				io.io,
			);
			expect(code).toBe(2);
			expect(io.stderr).toEqual([]);
			expect(io.stdout).toHaveLength(1);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as {
				ok: boolean;
				exit_code: number;
				action: string;
				error?: { code: string; message: string };
			};
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(2);
			expect(payload.error?.code).toBe("SESSION_NOT_FOUND");
			expect(payload.error?.message).toContain("session not found: MISSING");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("switch rejects a session missing its task file", async () => {
		const root = createProjectRoot("switch-missing-task");
		initGitRepo(root);
		try {
			mkdirSync(join(root, ".afol", "wb", "BROKEN"), { recursive: true });
			const io = captureIo();
			const code = await runSessionCommand("switch", ["BROKEN"], root, io.io);
			expect(code).toBe(2);
			expect(io.stderr.join("\n")).toContain(
				"session corrupt: BROKEN (missing canonical task file)",
			);
			expect(readActiveSession(root)).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bind rejects a session with durable close metadata", async () => {
		const root = createProjectRoot("bind-closed");
		initGitRepo(root);
		try {
			createClosedSession(root, "DONE");
			const io = captureIo();
			const code = await runSessionCommand(
				"bind",
				["--session", "DONE"],
				root,
				io.io,
			);
			expect(code).toBe(2);
			expect(io.stderr.join("\n")).toContain(
				"session closed: DONE (durable close metadata present)",
			);
			expect(readSessionContext(root).bindings).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bind --json --session DONE returns closed session error envelope", async () => {
		const root = createProjectRoot("bind-json-closed");
		initGitRepo(root);
		try {
			createClosedSession(root, "DONE");
			const io = captureIo();
			const code = await runSessionCommand(
				"bind",
				["--json", "--session", "DONE"],
				root,
				io.io,
			);
			expect(code).toBe(2);
			expect(io.stderr).toEqual([]);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as {
				ok: boolean;
				exit_code: number;
				error: { code: string; message: string };
			};
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(2);
			expect(payload.error?.code).toBe("SESSION_ERROR");
			expect(payload.error?.message).toContain(
				"session closed: DONE (durable close metadata present)",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bind accepts sessions without durable close metadata", async () => {
		for (const state of [
			"implemented_untested",
			"tested_needs_spec_validation",
			"done",
		] as const) {
			const root = createProjectRoot(`bind-${state}`);
			initGitRepo(root);
			try {
				createStateBoardSession(root, "ACTIVE", state);
				const io = captureIo();
				const code = await runSessionCommand(
					"bind",
					["--session", "ACTIVE"],
					root,
					io.io,
				);
				expect(code).toBe(0);
				expect(readSessionContext(root).bindings[0]?.session).toBe("ACTIVE");
				expect(io.stdout.join("\n")).toContain("session bound: ACTIVE");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("switch rejects a session with durable close metadata", async () => {
		const root = createProjectRoot("switch-closed");
		initGitRepo(root);
		try {
			createClosedSession(root, "DONE");
			const io = captureIo();
			const code = await runSessionCommand("switch", ["DONE"], root, io.io);
			expect(code).toBe(2);
			expect(io.stderr.join("\n")).toContain(
				"session closed: DONE (durable close metadata present)",
			);
			expect(readActiveSession(root)).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("switch accepts sessions without durable close metadata", async () => {
		for (const state of [
			"implemented_untested",
			"tested_needs_spec_validation",
			"done",
		] as const) {
			const root = createProjectRoot(`switch-${state}`);
			initGitRepo(root);
			try {
				createStateBoardSession(root, "ACTIVE", state);
				const io = captureIo();
				const code = await runSessionCommand("switch", ["ACTIVE"], root, io.io);
				expect(code).toBe(0);
				expect(readActiveSession(root)).toBe("ACTIVE");
				expect(resolveContextSession(root)).toBe("ACTIVE");
				expect(io.stdout.join("\n")).toContain("session switched: ACTIVE");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("mutating session commands require approval in restricted contexts", async () => {
		const bindRoot = createProjectRoot("bind-approval");
		const switchRoot = createProjectRoot("switch-approval");
		const unbindRoot = createProjectRoot("unbind-approval");
		initGitRepo(bindRoot);
		initGitRepo(switchRoot);
		initGitRepo(unbindRoot);
		try {
			createSessionFixture(bindRoot, "BOUND");
			createSessionFixture(switchRoot, "SWITCHED");
			bindSession(unbindRoot, {
				session: "UNBOUND",
				branch: currentGitBranch(unbindRoot),
				worktree: unbindRoot,
			});

			const bindIo = captureIo();
			expect(
				await runSessionCommand(
					"bind",
					["--session", "BOUND"],
					bindRoot,
					bindIo.io,
					remoteOperationContext(),
				),
			).toBe(2);
			expect(readSessionContext(bindRoot).bindings).toHaveLength(0);
			expect(bindIo.stderr.join("\n")).toContain(
				"session bind requires local interactive approval",
			);

			const switchIo = captureIo();
			expect(
				await runSessionCommand(
					"switch",
					["SWITCHED"],
					switchRoot,
					switchIo.io,
					remoteOperationContext(),
				),
			).toBe(2);
			expect(readActiveSession(switchRoot)).toBeNull();
			expect(switchIo.stderr.join("\n")).toContain(
				"session switch requires local interactive approval",
			);

			const unbindIo = captureIo();
			expect(
				await runSessionCommand(
					"unbind",
					["--session", "UNBOUND"],
					unbindRoot,
					unbindIo.io,
					remoteOperationContext(),
				),
			).toBe(2);
			expect(readSessionContext(unbindRoot).bindings).toHaveLength(1);
			expect(unbindIo.stderr.join("\n")).toContain(
				"session unbind requires local interactive approval",
			);
		} finally {
			rmSync(bindRoot, { recursive: true, force: true });
			rmSync(switchRoot, { recursive: true, force: true });
			rmSync(unbindRoot, { recursive: true, force: true });
		}
	});

	test("unbind removes a binding", async () => {
		const root = createProjectRoot("unbind");
		initGitRepo(root);
		try {
			bindSession(root, {
				session: "UNBOUND",
				branch: currentGitBranch(root),
				worktree: root,
			});
			const io = captureIo();
			const code = await runSessionCommand(
				"unbind",
				["--session", "UNBOUND"],
				root,
				io.io,
			);
			expect(code).toBe(0);
			expect(readSessionContext(root).bindings).toHaveLength(0);
			expect(io.stdout.join("\n")).toContain("session unbound: UNBOUND");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("radar renders compact warning-only output for open tasks", async () => {
		const root = createProjectRoot("radar-text");
		try {
			setCoordinationRadarReaderForTests(() => ({
				generated_at: "2026-06-18T18:30:00.000Z",
				freshness: { stale: false },
				sessions: [
					{ session: "260618_1420_orchestrator", open_tasks: 2 },
					{ session: "260618_1421_other", open_tasks: 1 },
					{ session: "260618_9999_archived", open_tasks: 1, archived: true },
				],
				tasks: [
					{
						session: "260618_1420_orchestrator",
						task_id: "T-02",
						state: "in_progress",
						owner: "codex",
						touched_at: "2026-06-18T18:20:00.000Z",
						planned_files: [
							{ path: "cli/commands/session.ts", source: "planned" },
						],
						touched_files: [
							{ path: "cli/tests/session-command.test.ts", source: "touched" },
						],
						warning_ids: ["path_overlap_touched"],
					},
					{
						session: "260618_1421_other",
						task_id: "T-01",
						state: "pending",
						owner: "",
						touched_at: "2026-06-18T18:10:00.000Z",
						planned_files: [
							{ path: "cli/services/context/bundler.ts", source: "planned" },
						],
						touched_files: [],
						warning_ids: ["missing_owner"],
					},
					{
						session: "260618_1420_orchestrator",
						task_id: "T-99",
						state: "done",
						owner: "done-worker",
						warning_ids: ["ignored_done_task"],
					},
				],
				warnings: [
					{
						id: "path_overlap_touched",
						severity: "critical",
						message: "planned and touched paths overlap",
					},
					{
						id: "missing_owner",
						severity: "warning",
						message: "task owner is missing",
					},
				],
			}));
			const io = captureIo();
			const code = await runSessionCommand("radar", [], root, io.io);
			const text = io.stdout.join("\n");
			expect(code).toBe(0);
			expect(text).toContain(
				"session radar: warnings are context only, not locks",
			);
			expect(text).toContain(
				"summary: sessions=2 open_tasks=2 warnings=2 critical=1 warning=1 info=0",
			);
			expect(text).toContain("critical path_overlap_touched");
			expect(text).toContain("260618_1420_orchestrator T-02 in_progress");
			expect(text).toContain("260618_1421_other T-01 pending");
			expect(text).not.toContain("T-99");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("radar strict exits 1 on critical warnings", async () => {
		const root = createProjectRoot("radar-strict");
		try {
			setCoordinationRadarReaderForTests(() => ({
				generated_at: "2026-06-18T18:30:00.000Z",
				freshness: { stale: false },
				tasks: [
					{
						session: "260618_1420_orchestrator",
						task_id: "T-02",
						state: "in_progress",
						owner: "codex",
						warning_ids: ["path_overlap_touched"],
					},
				],
				warnings: [
					{
						id: "path_overlap_touched",
						severity: "critical",
						message: "planned and touched paths overlap",
					},
				],
			}));
			const io = captureIo();
			const code = await runSessionCommand("radar", ["--strict"], root, io.io);
			expect(code).toBe(1);
			expect(io.stdout.join("\n")).toContain("critical path_overlap_touched");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("radar json uses the session envelope and bounds payload data", async () => {
		const root = createProjectRoot("radar-json");
		try {
			const sessionField = ["sess", "ion"].join("") as "session";
			const sessionsField = ["sess", "ions"].join("") as "sessions";
			setCoordinationRadarReaderForTests(() => ({
				generated_at: "2026-06-18T18:35:00.000Z",
				freshness: { stale: true, source: ".afol/data/index/workbench.json" },
				[sessionsField]: Array.from({ length: 22 }, (_, index) => ({
					[sessionField]: `260618_S${String(index + 1).padStart(2, "0")}`,
					open_tasks: 1,
				})),
				tasks: Array.from({ length: 27 }, (_, index) => ({
					[sessionField]: index % 2 === 0 ? "260618_A" : "260618_B",
					task_id: `T-${String(index + 1).padStart(2, "0")}`,
					state: index === 25 ? "moved" : "in_progress",
					owner: `owner-${index + 1}`,
					touched_at: "2026-06-18T18:00:00.000Z",
					planned_files: Array.from({ length: 6 }, (__, pathIndex) => ({
						path: `cli/file-${index + 1}-${pathIndex + 1}.ts`,
						source: "planned",
					})),
					touched_files: Array.from({ length: 5 }, (__, pathIndex) => ({
						path: `cli/touched-${index + 1}-${pathIndex + 1}.ts`,
						source: "touched",
					})),
					warning_ids: Array.from({ length: 8 }, (__, warningIndex) => {
						return `warning-${index + 1}-${warningIndex + 1}`;
					}),
					archived: index === 26,
				})),
				warnings: Array.from({ length: 12 }, (_, index) => ({
					id: `warning-${index + 1}`,
					severity: index === 0 ? "critical" : "warning",
					message: `warning ${index + 1}`,
				})),
			}));
			const io = captureIo();
			const code = await runSessionCommand("radar", ["--json"], root, io.io);
			expect(code).toBe(0);
			const parsed = JSON.parse(io.stdout.join("\n")) as {
				schema: string;
				ok: boolean;
				action: string;
				data: {
					warning_policy: string;
					summary: { sessions: number; open_tasks: number; warnings: number };
					freshness: { stale: boolean; source: string };
					tasks: Array<{
						task_id: string;
						planned_files: Array<{ path: string }>;
						touched_files: Array<{ path: string }>;
						warning_ids: string[];
					}>;
					sessions: Array<{ session: string }>;
					warnings: Array<{ id: string }>;
					truncated: { sessions: boolean; tasks: boolean; warnings: boolean };
				};
			};
			expect(parsed.schema).toBe("afol.result/v1");
			expect(parsed.ok).toBe(true);
			expect(parsed.action).toBe("session.radar");
			expect(parsed.data.warning_policy).toBe("context-only");
			expect(parsed.data.summary).toMatchObject({
				sessions: 22,
				open_tasks: 25,
				warnings: 12,
			});
			expect(parsed.data.freshness).toEqual({
				stale: true,
				source: ".afol/data/index/workbench.json",
			});
			expect(parsed.data.tasks).toHaveLength(25);
			expect(parsed.data.tasks[0]?.planned_files).toHaveLength(4);
			expect(parsed.data.tasks[0]?.touched_files).toHaveLength(4);
			expect(parsed.data.tasks[0]?.warning_ids).toHaveLength(6);
			expect(parsed.data.sessions).toHaveLength(20);
			expect(parsed.data.warnings).toHaveLength(10);
			expect(parsed.data.truncated).toEqual({
				sessions: true,
				tasks: false,
				warnings: true,
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("radar normalizes live snapshot open_tasks shape", async () => {
		const root = createProjectRoot("radar-live-shape");
		try {
			setCoordinationRadarReaderForTests(() => ({
				generated_at: "2026-06-18T18:40:00.000Z",
				source: {
					workbench_index: ".afol/data/index/workbench.json",
					mutation_journal: ".afol/data/mutations/journal.jsonl",
					workbench_status: "fresh",
				},
				open_tasks: [
					{
						session: "260618_live",
						task_id: "T-02",
						state: "in_progress",
						owner: "codex",
						touched_at: "2026-06-18T18:39:00.000Z",
						planned_files: [
							{ path: "cli/commands/session.ts", source: "frontmatter" },
						],
						touched_files: [
							{ path: "cli/tests/session-command.test.ts", source: "mutation" },
						],
						warning_ids: ["path_overlap_touched"],
					},
					{
						session: "260618_live",
						task_id: "T-99",
						state: "done",
						owner: "closer",
						warning_ids: [],
					},
				],
				warnings: [
					{
						id: "path_overlap_touched",
						severity: "critical",
						reason: "tasks overlap on touched paths",
					},
				],
			}));

			const text = captureIo();
			const textCode = await runSessionCommand("radar", [], root, text.io);
			expect(textCode).toBe(0);
			expect(text.stdout.join("\n")).toContain(
				"summary: sessions=1 open_tasks=1 warnings=1 critical=1 warning=0 info=0",
			);
			expect(text.stdout.join("\n")).toContain(
				"critical path_overlap_touched: tasks overlap on touched paths",
			);
			expect(text.stdout.join("\n")).not.toContain("T-99");

			const json = captureIo();
			const jsonCode = await runSessionCommand(
				"radar",
				["--json"],
				root,
				json.io,
			);
			expect(jsonCode).toBe(0);
			const parsed = JSON.parse(json.stdout.join("\n")) as {
				data: {
					freshness: {
						workbench_index: string;
						mutation_journal: string;
						workbench_status: string;
					};
					summary: { sessions: number; open_tasks: number; warnings: number };
					tasks: Array<{ task_id: string }>;
					truncated: { sessions: boolean; tasks: boolean; warnings: boolean };
				};
			};
			expect(parsed.data.freshness).toEqual({
				workbench_index: ".afol/data/index/workbench.json",
				mutation_journal: ".afol/data/mutations/journal.jsonl",
				workbench_status: "fresh",
			});
			expect(parsed.data.summary).toMatchObject({
				sessions: 1,
				open_tasks: 1,
				warnings: 1,
			});
			expect(parsed.data.tasks).toHaveLength(1);
			expect(parsed.data.tasks[0]?.task_id).toBe("T-02");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("unknown action exits with code 2", async () => {
		const root = createProjectRoot("unknown");
		initGitRepo(root);
		try {
			const io = captureIo();
			const code = await runSessionCommand("nope", [], root, io.io);
			expect(code).toBe(2);
			expect(io.stderr.join("\n")).toContain(
				"use list, bind, switch, unbind, or radar",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
