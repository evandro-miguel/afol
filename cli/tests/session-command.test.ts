import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as childProcessModule from "node:child_process";
import { spawnSync } from "node:child_process";
import * as nodeFs from "node:fs";
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
import { readEventLedgerRecords } from "../services/events/ledger";
import {
	appendAdoptionReviewEvent,
	learningReviewStatus,
	readAdoptionReviewEvents,
} from "../services/evolution/adoption-candidates";
import {
	DEFAULT_EVOLUTION_PATHS,
	DEFAULT_EVOLUTION_SETTINGS,
} from "../services/evolution/config";
import { loadWorkBenchIndexSnapshot } from "../services/local-state/workbench-index";
import {
	archiveSessions,
	readArchivedSessionState,
	restoreSessions,
} from "../services/workbench/archive";
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

const LEARNING_PROJECT_ID = "6b7d91ca-496f-4f0c-8537-5c4993810d15";

function enableLearningCandidate(root: string, session: string): void {
	mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "data", "events", "events.jsonl"),
		"",
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: {
				name: "session-learning",
				id: LEARNING_PROJECT_ID,
				timezone: "UTC",
			},
			paths: {
				external_dir: DEFAULT_EVOLUTION_PATHS.externalDir,
				evolution_db: DEFAULT_EVOLUTION_PATHS.evolutionDb,
				evolution_data_dir: DEFAULT_EVOLUTION_PATHS.evolutionDataDir,
				evolution_events_dir: DEFAULT_EVOLUTION_PATHS.evolutionEventsDir,
			},
			evolution: DEFAULT_EVOLUTION_SETTINGS,
		}),
		"utf8",
	);
	const taskPath = join(root, ".afol", "wb", session, `${session}_task_01.md`);
	writeFileSync(
		taskPath,
		`${readFileSync(taskPath, "utf8")}\nDecision: retain the bounded learning review gate.\n`,
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", session, ".evidence.jsonl"),
		`${JSON.stringify({
			id: "E-LEARNING-01",
			task_id: "T-01",
			result: "passed",
			provenance: "observed",
			command: "bun test",
			exit_code: 0,
			created_at: "2026-08-11T12:00:00.000Z",
		})}\n`,
		"utf8",
	);
}

function recordLearningReview(
	root: string,
	session: string,
	decision: "approved" | "rejected",
): void {
	const status = learningReviewStatus(root, session);
	const candidate = status.required[0];
	if (!candidate)
		throw new Error("learning candidate fixture was not discovered");
	appendAdoptionReviewEvent(root, session, {
		candidate_id: candidate.id,
		fingerprint: candidate.fingerprint,
		decision,
		reason: `fixture ${decision}`,
		created_at: "2026-08-11T13:00:00.000Z",
	});
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
	test.each([
		["nonzero git exit", 7],
		["git timeout", null],
	] as const)("%s degrades context resolution to null", (_label, status) => {
		const root = createProjectRoot("git-context-degraded");
		const spawnSpy = spyOn(childProcessModule, "spawnSync").mockImplementation(
			(() =>
				({
					pid: 1,
					output: [null, "", ""],
					status,
					signal: null,
					stdout: "",
					stderr: "",
					...(status === null
						? {
								error: Object.assign(new Error("git timed out"), {
									code: "ETIMEDOUT",
								}),
							}
						: {}),
				}) as unknown as ReturnType<
					typeof spawnSync
				>) as unknown as typeof childProcessModule.spawnSync,
		);
		try {
			bindSession(root, {
				session: "S-GIT-DEGRADED",
				branch: "fixture",
				worktree: root,
			});

			expect(resolveContextSession(root)).toBeNull();
			expect(spawnSpy).toHaveBeenCalledWith(
				"git",
				["rev-parse", "--git-dir", "--show-toplevel"],
				expect.objectContaining({ timeout: 5_000 }),
			);
		} finally {
			spawnSpy.mockRestore();
			rmSync(root, { recursive: true, force: true });
		}
	});

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
			createSessionFixture(root, "CONTEXT");
			createSessionFixture(root, "GLOBAL");
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

	test("resolveSession ignores closed context and falls through to open global", () => {
		const root = createProjectRoot("closed-context-fallback");
		initGitRepo(root);
		try {
			createClosedSession(root, "CLOSED");
			createSessionFixture(root, "GLOBAL");
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"GLOBAL\n",
				"utf8",
			);
			bindSession(root, {
				session: "CLOSED",
				branch: currentGitBranch(root),
				worktree: root,
			});

			expect(resolveSession(root, {})).toEqual({
				session: "GLOBAL",
				source: "global",
			});
			expect(resolveContextSession(root)).toBe("CLOSED");
			expect(readSessionContext(root).bindings).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolveSession ignores missing but fails closed for corrupt context bindings", () => {
		const root = createProjectRoot("invalid-implicit-targets");
		initGitRepo(root);
		try {
			bindSession(root, {
				session: "MISSING-CONTEXT",
				branch: currentGitBranch(root),
				worktree: root,
			});
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"MISSING-GLOBAL\n",
				"utf8",
			);
			expect(resolveSession(root, {})).toBeNull();

			mkdirSync(join(root, ".afol", "wb", "CORRUPT-CONTEXT"), {
				recursive: true,
			});
			removeBinding(root, "MISSING-CONTEXT");
			bindSession(root, {
				session: "CORRUPT-CONTEXT",
				branch: currentGitBranch(root),
				worktree: root,
			});
			expect(() => resolveSession(root, {})).toThrow(
				"Context session binding is corrupt: CORRUPT-CONTEXT",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("malformed context fails closed and switch repairs the binding", async () => {
		const root = createProjectRoot("malformed-context-recovery");
		initGitRepo(root);
		try {
			createSessionFixture(root, "GLOBAL");
			createSessionFixture(root, "SWITCHED");
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"GLOBAL\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", "session-context.json"),
				"{broken",
				"utf8",
			);
			expect(() => resolveSession(root, {})).toThrow("Invalid session context");

			const io = captureIo();
			expect(await runSessionCommand("switch", ["SWITCHED"], root, io.io)).toBe(
				0,
			);
			expect(readActiveSession(root)).toBe("SWITCHED");
			expect(resolveContextSession(root)).toBe("SWITCHED");
			expect(readSessionContext(root).bindings).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolveSession preserves invalid explicit and environment targets", () => {
		const root = createProjectRoot("invalid-explicit-env");
		const saved = process.env.AFOL_SESSION;
		try {
			expect(resolveSession(root, { explicit: "MISSING-EXPLICIT" })).toEqual({
				session: "MISSING-EXPLICIT",
				source: "explicit",
			});
			process.env.AFOL_SESSION = "MISSING-ENV";
			expect(resolveSession(root, {})).toEqual({
				session: "MISSING-ENV",
				source: "env",
			});
		} finally {
			restoreEnv("AFOL_SESSION", saved);
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
	test("archives closed candidates logically and restores their index state", async () => {
		const root = createProjectRoot("archive-restore");
		try {
			createClosedSession(root, "OLD");
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			writeFileSync(join(root, ".afol", "data", "events", "events.jsonl"), "");
			const taskPath = join(root, ".afol", "wb", "OLD", "OLD_task_01.md");
			writeFileSync(
				taskPath,
				readFileSync(taskPath, "utf8").replaceAll("2026-07-09", "2025-07-09"),
				"utf8",
			);
			const preview = captureIo();
			const previewCode = await runSessionCommand(
				"archive",
				["--candidates", "--older-than-days", "90", "--json"],
				root,
				preview.io,
			);
			expect(previewCode).toBe(0);
			const previewPayload = JSON.parse(preview.stdout[0] ?? "{}") as {
				data: {
					read_only: boolean;
					candidates: Array<{
						session: string;
						learning_review_state: string;
					}>;
				};
			};
			expect(previewPayload.data.read_only).toBe(true);
			expect(previewPayload.data.candidates).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						session: "OLD",
						learning_review_state: "no_candidate",
					}),
				]),
			);

			const archive = captureIo();
			expect(
				await runSessionCommand(
					"archive",
					["OLD", "--reason", "monthly retention", "--json"],
					root,
					archive.io,
				),
			).toBe(0);
			expect(
				readFileSync(
					join(root, ".afol", "wb", "OLD", "OLD_task_01.md"),
					"utf8",
				),
			).toContain("closed_at");
			expect(loadWorkBenchIndexSnapshot(root)?.sessions).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ session: "OLD", archived: true }),
				]),
			);
			const archiveEvent = readEventLedgerRecords(root).find(
				(record) => record.type === "workbench.archive",
			);
			expect(archiveEvent?.detail).toMatchObject({
				learning_review: "no_candidate",
			});

			const restore = captureIo();
			expect(
				await runSessionCommand(
					"restore",
					["OLD", "--reason", "retention exception", "--json"],
					root,
					restore.io,
				),
			).toBe(0);
			expect(loadWorkBenchIndexSnapshot(root)?.sessions).toEqual(
				expect.arrayContaining([
					expect.not.objectContaining({ session: "OLD", archived: true }),
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archive rejects open, active, bound, and corrupt sessions", async () => {
		const root = createProjectRoot("archive-rejections");
		try {
			createSessionFixture(root, "OPEN");
			createClosedSession(root, "ACTIVE");
			createClosedSession(root, "BOUND");
			mkdirSync(join(root, ".afol", "wb", "BROKEN"), { recursive: true });
			writeFileSync(join(root, ".afol", "wb", ".active_session"), "ACTIVE\n");
			bindSession(root, { session: "BOUND" });
			for (const [session, expected] of [
				["OPEN", "session open: OPEN"],
				["ACTIVE", "session active: ACTIVE"],
				["BOUND", "session bound: BOUND"],
				["BROKEN", "session corrupt: BROKEN"],
			] as const) {
				const io = captureIo();
				expect(
					await runSessionCommand(
						"archive",
						[session, "--reason", "retention"],
						root,
						io.io,
					),
				).toBe(2);
				expect(io.stderr.join("\n")).toContain(expected);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archive dry-run uses apply preconditions and does not claim invalid targets", async () => {
		const root = createProjectRoot("archive-dry-run-preflight");
		try {
			createSessionFixture(root, "OPEN");
			createClosedSession(root, "ACTIVE");
			createClosedSession(root, "BOUND");
			createClosedSession(root, "ARCHIVED");
			mkdirSync(join(root, ".afol", "wb", "BROKEN"), { recursive: true });
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			writeFileSync(join(root, ".afol", "data", "events", "events.jsonl"), "");
			expect(
				await runSessionCommand(
					"archive",
					["ARCHIVED", "--reason", "retention"],
					root,
					captureIo().io,
				),
			).toBe(0);
			writeFileSync(join(root, ".afol", "wb", ".active_session"), "ACTIVE\n");
			bindSession(root, { session: "BOUND" });
			for (const [session, expected] of [
				["OPEN", "session open: OPEN"],
				["ACTIVE", "session active: ACTIVE"],
				["BOUND", "session bound: BOUND"],
				["BROKEN", "session corrupt: BROKEN"],
				["ARCHIVED", "session already archived: ARCHIVED"],
				["MISSING", "session corrupt: MISSING"],
			] as const) {
				const io = captureIo();
				expect(
					await runSessionCommand(
						"archive",
						[session, "--reason", "retention", "--dry-run"],
						root,
						io.io,
					),
				).toBe(2);
				expect(io.stderr.join("\n")).toContain(expected);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("restore dry-run uses apply preconditions", async () => {
		const root = createProjectRoot("restore-dry-run-preflight");
		try {
			createClosedSession(root, "NOT_ARCHIVED");
			createSessionFixture(root, "OPEN");
			for (const [session, expected] of [
				["NOT_ARCHIVED", "session not archived: NOT_ARCHIVED"],
				["OPEN", "session open: OPEN"],
				["MISSING", "session corrupt: MISSING"],
			] as const) {
				const io = captureIo();
				expect(
					await runSessionCommand(
						"restore",
						[session, "--reason", "retention", "--dry-run"],
						root,
						io.io,
					),
				).toBe(2);
				expect(io.stderr.join("\n")).toContain(expected);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archive and restore batches preflight all targets before mutation", async () => {
		const root = createProjectRoot("archive-batch-preflight");
		try {
			createClosedSession(root, "FIRST");
			createSessionFixture(root, "SECOND");
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			writeFileSync(join(root, ".afol", "data", "events", "events.jsonl"), "");
			const archive = captureIo();
			expect(
				await runSessionCommand(
					"archive",
					["FIRST", "SECOND", "--reason", "retention"],
					root,
					archive.io,
				),
			).toBe(2);
			expect(readArchivedSessionState(root, "FIRST").archived).toBe(false);

			createClosedSession(root, "RESTORE_FIRST");
			const archiveFirst = captureIo();
			expect(
				await runSessionCommand(
					"archive",
					["RESTORE_FIRST", "--reason", "retention"],
					root,
					archiveFirst.io,
				),
			).toBe(0);
			const restore = captureIo();
			expect(
				await runSessionCommand(
					"restore",
					["RESTORE_FIRST", "SECOND", "--reason", "retention"],
					root,
					restore.io,
				),
			).toBe(2);
			expect(readArchivedSessionState(root, "RESTORE_FIRST").archived).toBe(
				true,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archive batches reject duplicate identifiers without mutation", () => {
		const root = createProjectRoot("archive-batch-duplicate");
		try {
			createClosedSession(root, "DUPLICATE");
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			const eventPath = join(root, ".afol", "data", "events", "events.jsonl");
			writeFileSync(eventPath, "", "utf8");
			expect(() =>
				archiveSessions(root, ["DUPLICATE", "DUPLICATE"], "retention"),
			).toThrow("duplicate session identifier: DUPLICATE");
			expect(readFileSync(eventPath, "utf8")).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archive batches roll back the ledger and leave the index unchanged on a second write failure", () => {
		const root = createProjectRoot("archive-batch-atomic-write");
		try {
			createClosedSession(root, "FIRST");
			createClosedSession(root, "SECOND");
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			const eventPath = join(root, ".afol", "data", "events", "events.jsonl");
			writeFileSync(eventPath, "", "utf8");
			const indexPath = join(
				root,
				".afol",
				"data",
				"index",
				"workbench-index.json",
			);
			mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
			writeFileSync(indexPath, "index-before", "utf8");
			let writes = 0;
			expect(() =>
				archiveSessions(root, ["FIRST", "SECOND"], "retention", {
					ledgerIo: {
						writeBytes: (fd, value) => {
							writes += 1;
							if (writes === 1) return nodeFs.writeSync(fd, value, 0, 7, null);
							throw new Error("second ledger write failed");
						},
					},
				}),
			).toThrow("second ledger write failed");
			expect(readFileSync(eventPath, "utf8")).toBe("");
			expect(readFileSync(indexPath, "utf8")).toBe("index-before");
			expect(readArchivedSessionState(root, "FIRST").archived).toBe(false);
			expect(readArchivedSessionState(root, "SECOND").archived).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("restore batches report durable commit when the post-ledger index rebuild fails", () => {
		const root = createProjectRoot("restore-batch-index-repair");
		try {
			createClosedSession(root, "FIRST");
			createClosedSession(root, "SECOND");
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "data", "events", "events.jsonl"),
				"",
				"utf8",
			);
			archiveSessions(root, ["FIRST", "SECOND"], "retention");
			expect(() =>
				restoreSessions(root, ["FIRST", "SECOND"], "retention", {
					beforeIndexRebuild: () => {
						throw new Error("index write failed");
					},
				}),
			).toThrow(
				"event ledger committed; workbench index repair required (run afol local-state rebuild): index write failed",
			);
			expect(readArchivedSessionState(root, "FIRST").archived).toBe(false);
			expect(readArchivedSessionState(root, "SECOND").archived).toBe(false);
			expect(
				readEventLedgerRecords(root)
					.filter((record) => record.type === "workbench.restore")
					.map((record) => record.session),
			).toEqual(["FIRST", "SECOND"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archive dry-run blocks an unreviewed learning candidate", async () => {
		const root = createProjectRoot("archive-learning-candidate");
		try {
			createClosedSession(root, "LEARNING");
			enableLearningCandidate(root, "LEARNING");
			expect(learningReviewStatus(root, "LEARNING")).toMatchObject({
				terminal: false,
			});
			const candidates = captureIo();
			expect(
				await runSessionCommand(
					"archive",
					["--candidates", "--older-than-days", "0", "--json"],
					root,
					candidates.io,
				),
			).toBe(0);
			expect(JSON.parse(candidates.stdout[0] ?? "{}").data.candidates).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						session: "LEARNING",
						learning_review_state: "candidate_available",
					}),
				]),
			);
			const io = captureIo();
			expect(
				await runSessionCommand(
					"archive",
					["LEARNING", "--reason", "retention", "--dry-run"],
					root,
					io.io,
				),
			).toBe(2);
			expect(io.stderr.join("\n")).toContain(
				"session learning review required",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.each([
		"approved",
		"rejected",
	] as const)("archive records a terminal %s learning review", async (decision) => {
		const root = createProjectRoot(`archive-learning-${decision}`);
		try {
			createClosedSession(root, "LEARNING");
			enableLearningCandidate(root, "LEARNING");
			recordLearningReview(root, "LEARNING", decision);
			const status = learningReviewStatus(root, "LEARNING");
			expect(status.terminal).toBe(true);
			const io = captureIo();
			const archiveCode = await runSessionCommand(
				"archive",
				["LEARNING", "--reason", "retention", "--json"],
				root,
				io.io,
			);
			expect(archiveCode).toBe(0);
			const payload = JSON.parse(io.stdout[0] ?? "{}") as {
				data: {
					archived: Array<{
						learning_review:
							| "no_candidate"
							| { candidates: Array<{ id: string; fingerprint: string }> };
					}>;
				};
			};
			const review = payload.data.archived[0]?.learning_review;
			expect(review).toMatchObject({
				candidates: [
					{
						id: status.required[0]?.id,
						fingerprint: status.required[0]?.fingerprint,
					},
				],
			});
			const archiveEvent = readEventLedgerRecords(root).find(
				(record) => record.type === "workbench.archive",
			);
			expect(archiveEvent?.detail).toMatchObject({
				learning_review: review,
			});
			const reviewJournal = readAdoptionReviewEvents(root);
			const restore = captureIo();
			expect(
				await runSessionCommand(
					"restore",
					["LEARNING", "--reason", "retention exception", "--json"],
					root,
					restore.io,
				),
			).toBe(0);
			expect(readAdoptionReviewEvents(root)).toEqual(reviewJournal);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archive reblocks a candidate after its fingerprint changes", async () => {
		const root = createProjectRoot("archive-learning-edited");
		try {
			createClosedSession(root, "LEARNING");
			enableLearningCandidate(root, "LEARNING");
			recordLearningReview(root, "LEARNING", "approved");
			const taskPath = join(
				root,
				".afol",
				"wb",
				"LEARNING",
				"LEARNING_task_01.md",
			);
			writeFileSync(
				taskPath,
				readFileSync(taskPath, "utf8").replace(
					"Decision: retain the bounded learning review gate.",
					"Decision: use an edited learning review gate.",
				),
				"utf8",
			);
			expect(learningReviewStatus(root, "LEARNING")).toMatchObject({
				terminal: false,
			});
			const io = captureIo();
			expect(
				await runSessionCommand(
					"archive",
					["LEARNING", "--reason", "retention"],
					root,
					io.io,
				),
			).toBe(2);
			expect(io.stderr.join("\n")).toContain(
				"session learning review required",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archive candidates apply a bounded default page and preserve offset pagination", async () => {
		const root = createProjectRoot("archive-candidates-page");
		const eventLog = join(root, ".afol", "data", "events", "events.jsonl");
		try {
			for (let index = 0; index < 128; index += 1) {
				createClosedSession(root, `CLOSED-${String(index).padStart(3, "0")}`);
			}
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			writeFileSync(eventLog, "", "utf8");
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"CLOSED-000\n",
				"utf8",
			);
			bindSession(root, { session: "CLOSED-001" });

			const openSpy = spyOn(nodeFs, "openSync");
			try {
				const defaultPage = captureIo();
				expect(
					await runSessionCommand(
						"archive",
						["--candidates", "--older-than-days", "0", "--json"],
						root,
						defaultPage.io,
					),
				).toBe(0);
				const defaultPayload = JSON.parse(defaultPage.stdout[0] ?? "{}") as {
					data: {
						candidates: Array<{ session: string }>;
						total_count: number;
						returned_count: number;
						offset: number;
						limit: number;
						has_more: boolean;
					};
				};
				expect(defaultPayload.data).toMatchObject({
					total_count: 126,
					returned_count: 10,
					offset: 0,
					limit: 10,
					has_more: true,
				});
				expect(defaultPayload.data.candidates).toHaveLength(10);
				expect(defaultPayload.data.candidates[0]).toEqual(
					expect.objectContaining({ session: "CLOSED-002" }),
				);
				expect(
					new TextEncoder().encode(defaultPage.stdout[0] ?? "").byteLength,
				).toBeLessThan(20_000);
				const ledgerReadsAfterDefaultPage = openSpy.mock.calls.filter(
					([path]) => String(path) === eventLog,
				).length;
				expect(ledgerReadsAfterDefaultPage).toBe(1);

				const io = captureIo();
				expect(
					await runSessionCommand(
						"archive",
						[
							"--candidates",
							"--older-than-days",
							"0",
							"--offset",
							"10",
							"--limit",
							"100",
							"--json",
						],
						root,
						io.io,
					),
				).toBe(0);
				const payload = JSON.parse(io.stdout[0] ?? "{}") as {
					data: {
						candidates: Array<{ session: string }>;
						total_count: number;
						returned_count: number;
						offset: number;
						limit: number;
						has_more: boolean;
					};
				};
				expect(payload.data.total_count).toBe(126);
				expect(payload.data.returned_count).toBe(100);
				expect(payload.data.offset).toBe(10);
				expect(payload.data.limit).toBe(100);
				expect(payload.data.has_more).toBe(true);
				expect(payload.data.candidates).toHaveLength(100);
				expect(payload.data.candidates[0]).toEqual(
					expect.objectContaining({ session: "CLOSED-012" }),
				);
				expect(payload.data.candidates).not.toEqual(
					expect.arrayContaining([
						expect.objectContaining({ session: "CLOSED-000" }),
						expect.objectContaining({ session: "CLOSED-001" }),
					]),
				);
				const ledgerReads = openSpy.mock.calls.filter(
					([path]) => String(path) === eventLog,
				).length;
				expect(ledgerReads).toBe(2);
			} finally {
				openSpy.mockRestore();
			}

			const invalidLimit = captureIo();
			expect(
				await runSessionCommand(
					"archive",
					["--candidates", "--older-than-days", "0", "--limit", "101"],
					root,
					invalidLimit.io,
				),
			).toBe(2);
			expect(invalidLimit.stderr.join("\n")).toContain(
				"--limit must not exceed 100",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

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
			const portableRoot = root.replaceAll("\\", "/");
			expect(debugText.stdout.join("\n")).toContain(portableRoot);

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
			expect(debugParsed.data.current_worktree).toBe(portableRoot);
			expect(debugParsed.data.bindings[0]?.worktree).toBe(portableRoot);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("list remains diagnostic when the context file is malformed", async () => {
		const root = createProjectRoot("list-malformed-context");
		initGitRepo(root);
		try {
			createSessionFixture(root, "GLOBAL");
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"GLOBAL\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", "session-context.json"),
				"{broken",
				"utf8",
			);

			const text = captureIo();
			expect(await runSessionCommand("list", [], root, text.io)).toBe(0);
			expect(text.stdout.join("\n")).toContain(
				"effective session: GLOBAL (global)",
			);
			expect(text.stdout.join("\n")).toContain("context file: corrupt");

			const json = captureIo();
			expect(await runSessionCommand("list", ["--json"], root, json.io)).toBe(
				0,
			);
			const parsed = JSON.parse(json.stdout.join("\n")) as {
				data: {
					context_file_state: string;
					effective_session: string;
					effective_source: string;
					bindings: unknown[];
				};
			};
			expect(parsed.data.context_file_state).toBe("corrupt");
			expect(parsed.data.effective_session).toBe("GLOBAL");
			expect(parsed.data.effective_source).toBe("global");
			expect(parsed.data.bindings).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("list distinguishes raw stale context from the effective session", async () => {
		const root = createProjectRoot("list-effective");
		initGitRepo(root);
		try {
			createClosedSession(root, "CLOSED");
			createSessionFixture(root, "GLOBAL");
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"GLOBAL\n",
				"utf8",
			);
			bindSession(root, {
				session: "CLOSED",
				branch: currentGitBranch(root),
				worktree: root,
			});

			const json = captureIo();
			expect(await runSessionCommand("list", ["--json"], root, json.io)).toBe(
				0,
			);
			const payload = JSON.parse(json.stdout[0] ?? "{}") as {
				data: {
					context_session: string;
					context_session_state: string;
					context_session_ignored: string;
					effective_session: string;
					effective_source: string;
				};
			};
			expect(payload.data).toMatchObject({
				context_session: "CLOSED",
				context_session_state: "closed",
				context_session_ignored: "closed",
				effective_session: "GLOBAL",
				effective_source: "global",
			});

			const text = captureIo();
			expect(await runSessionCommand("list", [], root, text.io)).toBe(0);
			expect(text.stdout.join("\n")).toContain(
				"context session: CLOSED (ignored: closed)",
			);
			expect(text.stdout.join("\n")).toContain(
				"effective session: GLOBAL (global)",
			);
			expect(text.stdout.join("\n")).not.toContain(root);
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
				"use list, bind, switch, unbind, archive, restore, or radar",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
