import { describe, expect, test } from "bun:test";
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
import { runCatchupCommand } from "../commands/catchup";
import { computeCatchup } from "../services/workbench/catchup";

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
	runGit(root, ["init"]);
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
			expect(report.next_step).toContain("no active session");
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
