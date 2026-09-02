import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatCatchup, runCatchupCommand } from "../commands/catchup";
import {
	agentOperationContext,
	defaultOperationContext,
} from "../core/operation-context";
import {
	applyCatchupRepair,
	combineGitChangedFiles,
	computeCatchup,
	readGitChangedFiles,
} from "../services/workbench/catchup";
import {
	bindSession,
	listBindings,
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
	runGit(root, ["init", "--initial-branch=main"]);
	runGit(root, ["config", "user.email", "catchup@example.com"]);
	runGit(root, ["config", "user.name", "Catchup Test"]);
}

function commitAll(root: string, message: string): void {
	runGit(root, ["add", "."]);
	runGit(root, ["commit", "-m", message]);
}

function touch(path: string, isoTime: string): void {
	const date = new Date(isoTime);
	utimesSync(path, date, date);
}

function createSessionArtifacts(root: string, session: string): string {
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		`${JSON.stringify({ schema_version: 1, project: { name: "catchup-test" } }, null, 2)}\n`,
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", ".active_session"),
		`${session}\n`,
		"utf8",
	);
	writeFileSync(
		join(sessionDir, `${session}_plan_01.md`),
		"---\nstatus: in_progress\n---\nplan\n",
		"utf8",
	);
	writeFileSync(
		join(sessionDir, `${session}_task_01.md`),
		"---\ntask_id: T-01\nstatus: in_progress\n---\n| T-01 | in_progress | worker | catchup |\n",
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
	return sessionDir;
}

function createRoot(session = "260614_1200_catchup-test"): {
	root: string;
	session: string;
	sessionDir: string;
} {
	const root = mkdtempSync(join(tmpdir(), "catchup-command-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	const sessionDir = createSessionArtifacts(root, session);
	initGitRoot(root);
	touch(join(sessionDir, `${session}_plan_01.md`), "2026-06-14T10:00:00.000Z");
	touch(join(sessionDir, `${session}_task_01.md`), "2026-06-14T10:00:00.000Z");
	touch(join(sessionDir, `${session}_log_01.md`), "2026-06-14T10:00:00.000Z");
	touch(
		join(sessionDir, `${session}_research_01.md`),
		"2026-06-14T10:30:00.000Z",
	);
	touch(
		join(sessionDir, `${session}_report_01.md`),
		"2026-06-14T10:15:00.000Z",
	);
	commitAll(root, "initial catchup fixture");
	return { root, session, sessionDir };
}

describe("computeCatchup git probe", () => {
	test("reports degraded when git is unavailable but session exists", () => {
		const root = mkdtempSync(join(tmpdir(), "catchup-no-git-"));
		const session = "260614_1200_no-git";
		try {
			mkdirSync(join(root, ".agents"), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			writeFileSync(
				join(root, ".agents", "config.json"),
				`${JSON.stringify(
					{ schema_version: 1, project: { name: "catchup-no-git" } },
					null,
					2,
				)}\n`,
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				`${session}\n`,
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_plan_01.md`),
				"---\n---\nplan\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_task_01.md`),
				"| T-01 | pending | worker | test |\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_log_01.md`),
				"log\n",
				"utf8",
			);

			// No git init — git is unavailable
			const report = computeCatchup(root, {});
			expect(report.session).toBe(session);
			expect(report.git_branch).toBeNull();
			// Must report degraded, not "artifacts look fresh"
			expect(report.freshness.notes.some((n) => n.includes("degraded"))).toBe(
				true,
			);
			expect(
				report.freshness.notes.some((n) => n.includes("git unavailable")),
			).toBe(true);
			expect(report.next_step).toContain("degraded");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("computeCatchup git split-failure", () => {
	test("reports degraded when git probe succeeds but status/diff query fails", () => {
		const root = mkdtempSync(join(tmpdir(), "catchup-split-fail-"));
		const session = "260614_1207_split-fail";
		try {
			mkdirSync(join(root, ".agents"), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			writeFileSync(
				join(root, ".agents", "config.json"),
				`${JSON.stringify(
					{ schema_version: 1, project: { name: "catchup-split-fail" } },
					null,
					2,
				)}\n`,
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				`${session}\n`,
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_plan_01.md`),
				"---\n---\nplan\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_task_01.md`),
				"| T-01 | pending | worker | test |\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_log_01.md`),
				"log\n",
				"utf8",
			);

			// Init git and make an initial commit so the repo is valid
			initGitRoot(root);
			commitAll(root, "initial");
			// Corrupt the index — replace it with a directory so commands that
			// read the index (status --porcelain, diff --name-only) fail, while
			// rev-parse --is-inside-work-tree (probe) continues to succeed.
			const indexPath = join(root, ".git", "index");
			rmSync(indexPath, { force: true });
			mkdirSync(indexPath, { recursive: true });

			const report = computeCatchup(root, {});
			expect(report.session).toBe(session);
			// git symbolic-ref does not depend on the index, so branch is available
			expect(report.git_branch).toBe("main");
			// Must NOT say "artifacts look fresh"
			expect(report.freshness.notes.some((n) => n.includes("degraded"))).toBe(
				true,
			);
			expect(
				report.freshness.notes.some((n) =>
					n.includes("git status query failed"),
				),
			).toBe(true);
			expect(report.next_step).toContain("degraded");
			expect(report.git_changed_files_degraded).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("computeCatchup", () => {
	test("reports no-session with a recent sessions hint when no active pointer exists", () => {
		const root = mkdtempSync(join(tmpdir(), "catchup-no-session-"));
		try {
			mkdirSync(join(root, ".agents"), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", "260614_0001_alpha"), {
				recursive: true,
			});
			writeFileSync(
				join(root, ".agents", "config.json"),
				`${JSON.stringify({ schema_version: 1, project: { name: "catchup-no-session" } }, null, 2)}\n`,
				"utf8",
			);
			const report = computeCatchup(root, {});
			expect(report.session).toBeNull();
			expect(report.session_status).toBe("no-session");
			expect(report.git_changed_files_degraded).toBe(true);
			expect(report.next_step).toContain("no active session");
			expect(report.freshness.notes.join(" ")).toContain(
				"degraded: git unavailable",
			);
			expect(report.freshness.notes.join(" ")).toContain(
				"recent sessions: 260614_0001_alpha",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports fresh artifacts when the active session is in sync with git", () => {
		const { root, session } = createRoot("260614_1200_fresh-session");
		try {
			const report = computeCatchup(root, {});
			expect(report.session).toBe(session);
			expect(report.session_status).toBe("active");
			expect(report.freshness.findings_stale).toBe(false);
			expect(report.freshness.log_behind_diff).toBe(false);
			expect(report.next_step).toBe("artifacts look fresh");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("flags log behind diff when git changes are newer than the log", () => {
		const { root, session, sessionDir } = createRoot("260614_1201_log-behind");
		try {
			const workFile = join(root, "work.txt");
			writeFileSync(workFile, "base\n", "utf8");
			runGit(root, ["add", "work.txt"]);
			writeFileSync(workFile, "base\nupdated\n", "utf8");
			runGit(root, ["add", "work.txt"]);
			touch(workFile, "2026-06-14T11:00:00.000Z");
			touch(
				join(sessionDir, `${session}_log_01.md`),
				"2026-06-14T10:00:00.000Z",
			);

			const report = computeCatchup(root, {});
			expect(report.session).toBe(session);
			expect(report.git_changed_files).toContain("work.txt");
			expect(report.freshness.log_behind_diff).toBe(true);
			expect(report.next_step).toContain("log unsynced changes");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("flags stale findings when plan/task move ahead of research", () => {
		const { root, session, sessionDir } = createRoot(
			"260614_1202_stale-findings",
		);
		try {
			const workFile = join(root, "work.txt");
			writeFileSync(workFile, "base\n", "utf8");
			runGit(root, ["add", "work.txt"]);
			writeFileSync(workFile, "base\nupdated\n", "utf8");
			const planPath = join(sessionDir, `${session}_plan_01.md`);
			const researchPath = join(sessionDir, `${session}_research_01.md`);
			touch(researchPath, "2026-06-14T10:00:00.000Z");
			touch(planPath, "2026-06-14T11:30:00.000Z");
			touch(workFile, "2026-06-14T10:00:00.000Z");
			runGit(root, ["add", "work.txt"]);

			const report = computeCatchup(root, {});
			expect(report.session).toBe(session);
			expect(report.freshness.findings_stale).toBe(true);
			expect(report.next_step).toContain("sync findings into research");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("afol catchup command", () => {
	test("preserves no-session Git degradation in text and JSON", async () => {
		const root = mkdtempSync(join(tmpdir(), "catchup-no-session-output-"));
		try {
			mkdirSync(join(root, ".agents"), { recursive: true });
			mkdirSync(join(root, ".afol", "wb"), { recursive: true });
			writeFileSync(
				join(root, ".agents", "config.json"),
				`${JSON.stringify({ schema_version: 1, project: { name: "catchup-no-session-output" } })}\n`,
				"utf8",
			);

			const textOut = captureIo();
			expect(await runCatchupCommand([], root, textOut.io)).toBe(0);
			expect(textOut.stdout.join("\n")).toContain(
				"changed_files: 0 (degraded)",
			);
			expect(textOut.stdout.join("\n")).toContain("degraded: git unavailable");

			const jsonOut = captureIo();
			expect(await runCatchupCommand(["--json"], root, jsonOut.io)).toBe(0);
			const payload = JSON.parse(jsonOut.stdout.join("\n")) as {
				data: { git_changed_files_degraded: boolean };
			};
			expect(payload.data.git_changed_files_degraded).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("prints the session id and next step", async () => {
		const { root, session } = createRoot("260614_1203_command-text");
		const out = captureIo();
		try {
			const code = await runCatchupCommand([], root, {
				stdout: (message) => out.stdout.push(message),
				stderr: (message) => out.stderr.push(message),
			});
			expect(code).toBe(0);
			expect(out.stderr).toEqual([]);
			expect(out.stdout.join("\n")).toContain(session);
			expect(out.stdout.join("\n")).toContain("next_step:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--json emits an afol.result envelope with action catchup", async () => {
		const { root, session } = createRoot("260614_1204_command-json");
		const out = captureIo();
		try {
			const code = await runCatchupCommand(["--json"], root, {
				stdout: (message) => out.stdout.push(message),
				stderr: (message) => out.stderr.push(message),
			});
			expect(code).toBe(0);
			const payload = JSON.parse(out.stdout.join("\n")) as Record<
				string,
				unknown
			>;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("catchup");
			expect((payload.data as { session?: string } | undefined)?.session).toBe(
				session,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--session targets the specified session", async () => {
		const root = mkdtempSync(join(tmpdir(), "catchup-target-session-"));
		const active = "260614_1205_active";
		const target = "260614_1206_target";
		try {
			mkdirSync(join(root, ".agents"), { recursive: true });
			mkdirSync(join(root, ".afol", "wb"), { recursive: true });
			createSessionArtifacts(root, active);
			createSessionArtifacts(root, target);
			writeFileSync(
				join(root, ".agents", "config.json"),
				`${JSON.stringify({ schema_version: 1, project: { name: "catchup-target" } }, null, 2)}\n`,
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				`${active}\n`,
				"utf8",
			);
			initGitRoot(root);
			commitAll(root, "target session fixture");

			const out = captureIo();
			const code = await runCatchupCommand(["--session", target], root, {
				stdout: (message) => out.stdout.push(message),
				stderr: (message) => out.stderr.push(message),
			});
			expect(code).toBe(0);
			expect(out.stdout.join("\n")).toContain(target);
			const report = computeCatchup(root, { session: target });
			expect(report.session).toBe(target);
			expect(report.session_status).toBe("closed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("combineGitChangedFiles deterministic combiner", () => {
	test("status failure + diff success => degraded true with diff files retained", () => {
		const result = combineGitChangedFiles(
			{ ok: false, stdout: "" },
			{ ok: true, stdout: "a.txt\nb.txt\n" },
		);
		expect(result.gitQueryFailed).toBe(true);
		expect(result.files).toEqual(["a.txt", "b.txt"]);
		expect(result.overflow).toBe(false);
	});

	test("status success + diff failure => degraded false with status files retained", () => {
		const result = combineGitChangedFiles(
			{ ok: true, stdout: " M a.txt\n?? b.txt\n" },
			{ ok: false, stdout: "" },
		);
		expect(result.gitQueryFailed).toBe(false);
		expect(result.files).toEqual(["a.txt", "b.txt"]);
		expect(result.overflow).toBe(false);
	});

	test("both fail => degraded true, empty files", () => {
		const result = combineGitChangedFiles(
			{ ok: false, stdout: "" },
			{ ok: false, stdout: "" },
		);
		expect(result.gitQueryFailed).toBe(true);
		expect(result.files).toEqual([]);
		expect(result.overflow).toBe(false);
	});

	test("both succeed => not degraded, deduped union", () => {
		const result = combineGitChangedFiles(
			{ ok: true, stdout: " M a.txt\n M b.txt\n" },
			{ ok: true, stdout: "a.txt\nc.txt\n" },
		);
		expect(result.gitQueryFailed).toBe(false);
		expect(result.files).toEqual(["a.txt", "b.txt", "c.txt"]);
		expect(result.overflow).toBe(false);
	});

	test("overflow from porcelain triggers early return with diff files hidden", () => {
		const manyFiles: string[] = [];
		for (let i = 0; i < 60; i++) {
			manyFiles.push(` M file-${i}.txt`);
		}
		const result = combineGitChangedFiles(
			{ ok: true, stdout: `${manyFiles.join("\n")}\n` },
			{ ok: true, stdout: "extra.txt\n" },
		);
		expect(result.gitQueryFailed).toBe(false);
		expect(result.overflow).toBe(true);
		expect(result.files).toHaveLength(50);
		expect(result.files).not.toContain("extra.txt");
	});

	test("overflow from diff triggers early return", () => {
		const manyFiles: string[] = [];
		for (let i = 0; i < 60; i++) {
			manyFiles.push(`file-${i}.txt`);
		}
		const result = combineGitChangedFiles(
			{ ok: true, stdout: "" },
			{ ok: true, stdout: `${manyFiles.join("\n")}\n` },
		);
		expect(result.gitQueryFailed).toBe(false);
		expect(result.overflow).toBe(true);
		expect(result.files).toHaveLength(50);
	});

	test("status failure remains degraded when diff output overflows", () => {
		const manyFiles: string[] = [];
		for (let i = 0; i < 60; i++) {
			manyFiles.push(`file-${i}.txt`);
		}
		const result = combineGitChangedFiles(
			{ ok: false, stdout: "" },
			{ ok: true, stdout: `${manyFiles.join("\n")}\n` },
		);
		expect(result.gitQueryFailed).toBe(true);
		expect(result.overflow).toBe(true);
		expect(result.files).toHaveLength(50);
	});
});

describe("readGitChangedFiles with real git", () => {
	test("gitQueryFailed is false when both status and diff succeed", () => {
		const root = mkdtempSync(join(tmpdir(), "catchup-git-ok-"));
		try {
			initGitRoot(root);
			writeFileSync(join(root, "work.txt"), "content\n", "utf8");
			runGit(root, ["add", "work.txt"]);
			runGit(root, ["commit", "-m", "add work.txt"]);
			writeFileSync(join(root, "work.txt"), "modified\n", "utf8");

			const result = readGitChangedFiles(root);
			expect(result.gitQueryFailed).toBe(false);
			expect(result.files).toContain("work.txt");
			expect(result.overflow).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("gitQueryFailed is true when both status and diff fail (corrupted index)", () => {
		const root = mkdtempSync(join(tmpdir(), "catchup-git-both-fail-"));
		try {
			initGitRoot(root);
			writeFileSync(join(root, "work.txt"), "content\n", "utf8");
			runGit(root, ["add", "work.txt"]);
			runGit(root, ["commit", "-m", "add work.txt"]);
			writeFileSync(join(root, "work.txt"), "modified\n", "utf8");

			// Corrupt index so both status and diff fail
			const indexPath = join(root, ".git", "index");
			rmSync(indexPath, { force: true });
			mkdirSync(indexPath, { recursive: true });

			const result = readGitChangedFiles(root);
			expect(result.gitQueryFailed).toBe(true);
			expect(result.files).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("catchup command text output with degraded overflow", () => {
	test("labels overflow and degraded state together", () => {
		const { root, session } = createRoot("260614_1300_degraded-overflow");
		try {
			const report = computeCatchup(root, { session });
			report.git_changed_files = Array.from(
				{ length: 50 },
				(_, index) => `bulk-${index}.md`,
			);
			report.git_changed_files_overflow = true;
			report.git_changed_files_degraded = true;
			const text = formatCatchup(report);
			expect(text).toContain(`session: ${session} (active)`);
			expect(text).toContain("changed_files: 50+ (degraded)");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

function writePendingSpecs(
	root: string,
	entries: Array<{
		session_id: string;
		status: "open" | "resolved" | "waived";
	}>,
): void {
	mkdirSync(join(root, ".afol", "data", "governance"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "data", "governance", "pending-specs.json"),
		`${JSON.stringify(
			{
				schema_version: 1,
				entries: entries.map((entry) => ({
					session_id: entry.session_id,
					created_at: "2026-06-14T12:00:00.000Z",
					updated_at: "2026-06-14T12:00:00.000Z",
					status: entry.status,
					theme: "catchup",
					task_ids: ["T-01"],
					missing: ["roadmap_feature"],
					resolution_hint: "run afol governance pending",
				})),
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
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

describe("catchup --fix session repair", () => {
	test("read-only catchup still works and does not mutate bindings", async () => {
		const { root, session } = createRoot("260614_1400_readonly-fix-guard");
		try {
			const branch = currentGitBranch(root);
			bindSession(root, {
				session: "MISSING-BOUND",
				branch,
				worktree: root,
			});
			const before = listBindings(root);
			expect(before.some((item) => item.session === "MISSING-BOUND")).toBe(
				true,
			);

			const out = captureIo();
			const code = await runCatchupCommand([], root, out.io);
			expect(code).toBe(0);
			expect(out.stdout.join("\n")).toContain(session);
			expect(out.stdout.join("\n")).toContain("pending_spec_open:");
			expect(listBindings(root)).toHaveLength(before.length);
			expect(
				listBindings(root).some((item) => item.session === "MISSING-BOUND"),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--fix removes corrupt binding and rebinds usable active when fixtures allow", async () => {
		const root = mkdtempSync(join(tmpdir(), "catchup-fix-repair-"));
		const active = "260614_1401_active-open";
		const corrupt = "CORRUPT-CONTEXT";
		const saved = {
			AFOL_CI: process.env.AFOL_CI,
			CI: process.env.CI,
			AFOL_SESSION: process.env.AFOL_SESSION,
		};
		try {
			// Disable global fallback so rebind is required after unbinding the
			// corrupt context target (matches CI multi-agent effective path).
			process.env.AFOL_CI = "1";
			delete process.env.CI;
			delete process.env.AFOL_SESSION;

			mkdirSync(join(root, ".agents"), { recursive: true });
			mkdirSync(join(root, ".afol", "wb"), { recursive: true });
			createSessionArtifacts(root, active);
			// Corrupt: session dir exists but canonical task file is missing.
			mkdirSync(join(root, ".afol", "wb", corrupt), { recursive: true });
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				`${active}\n`,
				"utf8",
			);
			initGitRoot(root);
			commitAll(root, "fix repair fixture");

			const branch = currentGitBranch(root);
			bindSession(root, {
				session: corrupt,
				branch,
				worktree: root,
			});
			expect(() => resolveSession(root, {})).toThrow(/corrupt/i);

			const out = captureIo();
			const code = await runCatchupCommand(
				["--fix", "--json"],
				root,
				out.io,
				defaultOperationContext(),
			);
			expect(code).toBe(0);
			expect(out.stderr).toEqual([]);

			const payload = JSON.parse(out.stdout.join("\n")) as {
				ok: boolean;
				action: string;
				data: {
					session: string | null;
					repair?: {
						applied: boolean;
						mutated: boolean;
						unbound: Array<{ session: string; state: string }>;
						rebound: string | null;
					};
				};
			};
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("catchup.fix");
			expect(payload.data.repair?.applied).toBe(true);
			expect(payload.data.repair?.mutated).toBe(true);
			expect(payload.data.repair?.unbound).toEqual([
				{ session: corrupt, state: "corrupt" },
			]);
			expect(payload.data.repair?.rebound).toBe(active);
			expect(payload.data.session).toBe(active);

			expect(listBindings(root).some((item) => item.session === corrupt)).toBe(
				false,
			);
			expect(resolveContextSession(root)).toBe(active);
			expect(resolveSession(root, {})).toEqual({
				session: active,
				source: "context",
			});
			// Never delete session dirs.
			expect(existsSync(join(root, ".afol", "wb", corrupt))).toBe(true);
			expect(existsSync(join(root, ".afol", "wb", active))).toBe(true);
		} finally {
			if (saved.AFOL_CI === undefined) delete process.env.AFOL_CI;
			else process.env.AFOL_CI = saved.AFOL_CI;
			if (saved.CI === undefined) delete process.env.CI;
			else process.env.CI = saved.CI;
			if (saved.AFOL_SESSION === undefined) delete process.env.AFOL_SESSION;
			else process.env.AFOL_SESSION = saved.AFOL_SESSION;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--fix unbinds missing bindings without claiming pending_spec resolution", async () => {
		const { root, session } = createRoot("260614_1402_pending-guard");
		try {
			const branch = currentGitBranch(root);
			bindSession(root, {
				session: "MISSING-BOUND",
				branch,
				worktree: root,
			});
			writePendingSpecs(root, [
				{ session_id: session, status: "open" },
				{ session_id: "other-open", status: "open" },
			]);

			const out = captureIo();
			const code = await runCatchupCommand(
				["--fix", "--json"],
				root,
				out.io,
				defaultOperationContext(),
			);
			expect(code).toBe(0);
			const payload = JSON.parse(out.stdout.join("\n")) as {
				action: string;
				data: {
					pending_spec_open: number;
					next_step: string;
					freshness: { notes: string[] };
					repair?: {
						unbound: Array<{ session: string; state: string }>;
						rebound: string | null;
					};
				};
			};
			expect(payload.action).toBe("catchup.fix");
			expect(payload.data.repair?.unbound).toEqual([
				{ session: "MISSING-BOUND", state: "missing" },
			]);
			// Active session already effective via global — rebind not required.
			expect(payload.data.pending_spec_open).toBe(2);
			expect(payload.data.freshness.notes.join(" ")).toContain(
				"open pending_spec: 2",
			);
			expect(payload.data.freshness.notes.join(" ")).toContain(
				"not auto-resolved",
			);
			// Pending is diagnostic only; operational next_step may still prefer
			// freshness (e.g. log unsynced) while notes carry governance pending.
			expect(payload.data.freshness.notes.join(" ")).toContain(
				"afol governance pending",
			);
			// Index left intact (no resolve/waive).
			const index = JSON.parse(
				readFileSync(
					join(root, ".afol", "data", "governance", "pending-specs.json"),
					"utf8",
				),
			) as { entries: Array<{ status: string }> };
			expect(
				index.entries.filter((entry) => entry.status === "open"),
			).toHaveLength(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--fix requires local interactive approval for restricted callers", async () => {
		const { root } = createRoot("260614_1403_approval");
		try {
			const out = captureIo();
			const code = await runCatchupCommand(
				["--fix"],
				root,
				out.io,
				agentOperationContext(),
			);
			expect(code).toBe(2);
			expect(out.stderr.join("\n")).toContain(
				"catchup --fix requires local interactive approval",
			);
			// No JSON envelope side channel on approval fail for text mode.
			expect(out.stdout).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("catchup fails closed when the pending spec index is corrupt", async () => {
		const { root } = createRoot("260614_1404_corrupt-pending-spec");
		try {
			const pendingPath = join(
				root,
				".afol",
				"data",
				"governance",
				"pending-specs.json",
			);
			mkdirSync(join(root, ".afol", "data", "governance"), {
				recursive: true,
			});
			writeFileSync(pendingPath, "{broken", "utf8");
			const out = captureIo();
			const code = await runCatchupCommand(["--json"], root, out.io);
			expect(code).toBe(2);
			expect(out.stdout).toEqual([]);
			expect(out.stderr.join("\n")).toContain("Invalid pending spec index");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("applyCatchupRepair is fail-closed when context file is unreadable", () => {
		const root = mkdtempSync(join(tmpdir(), "catchup-fix-unreadable-"));
		try {
			mkdirSync(join(root, ".afol", "wb"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "wb", "session-context.json"),
				"{broken",
				"utf8",
			);
			const repair = applyCatchupRepair(root);
			expect(repair.applied).toBe(true);
			expect(repair.mutated).toBe(false);
			expect(repair.unbound).toEqual([]);
			expect(repair.rebound).toBeNull();
			expect(
				repair.skipped.some((item) => item.reason.includes("unreadable")),
			).toBe(true);
			// Original corrupt file remains (fail-closed; no overwrite).
			expect(
				readFileSync(join(root, ".afol", "wb", "session-context.json"), "utf8"),
			).toBe("{broken");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
