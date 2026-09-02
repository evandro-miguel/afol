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
import { newWorkstream, recordEvidence } from "../services/workbench/lifecycle";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function portablePath(value: string): string {
	return value.replaceAll("\\", "/");
}

function mkProjectRoot(name: string): string {
	const root = mkdtempSync(join(tmpdir(), `verify-command-${name}-`));
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

describe("verify-tasks command", () => {
	test("repo-root strict verification scans .afol/wb and ignores legacy .agents/wb", () => {
		const root = mkProjectRoot("root-scan");
		try {
			const currentSession = "260609_1707_current";
			const legacySession = "260101_0900_legacy";
			const archivedSession = "260101_0800_archived";
			mkdirSync(join(root, ".afol", "wb", currentSession), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", "_archive", archivedSession), {
				recursive: true,
			});
			mkdirSync(join(root, ".agents", "wb", legacySession), {
				recursive: true,
			});
			writeFileSync(
				join(
					root,
					".afol",
					"wb",
					currentSession,
					`${currentSession}_task_01.md`,
				),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | current work |",
					"",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(
					root,
					".afol",
					"wb",
					"_archive",
					archivedSession,
					`${archivedSession}_task_01.md`,
				),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | archived old work |",
					"",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(
					root,
					".agents",
					"wb",
					legacySession,
					`${legacySession}_task_01.md`,
				),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | legacy history |",
					"",
				].join("\n"),
				"utf8",
			);

			const proc = runKernel(root, ["verify-tasks", "--strict"]);

			expect(proc.status).toBe(1);
			expect(proc.stderr as string).toBe("");
			expect(portablePath(proc.stdout as string)).toContain(
				"Session: .afol/wb",
			);
			expect(proc.stdout as string).toContain("Pending:");
			expect(proc.stdout as string).not.toContain("/.afol/wb/_archive/");
			expect(proc.stdout as string).not.toContain("/.agents/wb/");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails with open state-board tasks and prints the open task", () => {
		const root = mkProjectRoot("open");
		try {
			const created = newWorkstream(root, "verify-open");

			const proc = runKernel(root, [
				"verify-tasks",
				`.afol/wb/${created.session}`,
			]);

			expect(proc.status).toBe(1);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).toContain("Task Verification Report");
			expect(proc.stdout as string).toContain("Pending:");
			expect(proc.stdout as string).toContain("Open Tasks:");
			expect(proc.stdout as string).toContain("T-01");
			expect(proc.stdout as string).toContain("Verification failed.");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolves a bare session id for positional strict verification", () => {
		const root = mkProjectRoot("bare-session");
		try {
			const created = newWorkstream(root, "verify-bare-session");
			const proc = runKernel(root, ["vf", created.session, "--strict"]);

			expect(proc.status).toBe(1);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).toContain(
				`Session: .afol/wb/${created.session}`,
			);
			expect(proc.stdout as string).toContain("Open Tasks:");
			expect(proc.stdout as string).not.toContain("missing_session");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("passes strict verification when done tasks have passed evidence", () => {
		const root = mkProjectRoot("strict");
		try {
			const created = newWorkstream(root, "verify-strict");
			writeFileSync(
				created.taskPath,
				[
					"# Tasks: verify-strict",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | implemented |",
					"",
				].join("\n"),
				"utf8",
			);
			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
				exitCode: 0,
				provenance: "observed",
			});

			const proc = runKernel(root, [
				"verify",
				"--session",
				created.session,
				"--strict",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).toContain("Mode: STRICT");
			expect(proc.stdout as string).toContain("Completed:");
			expect(proc.stdout as string).toContain("All tasks completed.");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification fails done tasks without ledger evidence", () => {
		const root = mkProjectRoot("missing-evidence");
		try {
			const created = newWorkstream(root, "missing-evidence");
			writeFileSync(
				created.taskPath,
				[
					"# Tasks: missing-evidence",
					"",
					"- [x] T-01 Finished without closure evidence",
					"",
				].join("\n"),
				"utf8",
			);

			const proc = runKernel(root, [
				"vf",
				`.afol/wb/${created.session}`,
				"--strict",
			]);

			expect(proc.status).toBe(1);
			expect(proc.stdout as string).toContain("missing_evidence");
			expect(proc.stdout as string).toContain(
				"T-01 marked done but lacks passed evidence",
			);
			expect(proc.stdout as string).toContain("Verification failed.");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("compacts strict issue output by default and exposes full details with --verbose", () => {
		const root = mkProjectRoot("compact-report");
		const session = "260701_0800_compact-report";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			const rows = Array.from(
				{ length: 12 },
				(_, index) =>
					`| T-${String(index + 1).padStart(2, "0")} | done | worker | historical task ${index + 1} |`,
			);
			writeFileSync(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					...rows,
					"",
				].join("\n"),
				"utf8",
			);

			const compact = runKernel(root, [
				"verify-tasks",
				`.afol/wb/${session}`,
				"--strict",
			]);
			expect(compact.status).toBe(1);
			expect(compact.stdout as string).toContain("Issues: 12");
			expect(compact.stdout as string).toContain("missing_evidence: 12");
			expect(compact.stdout as string).toContain(
				"T-01 marked done but lacks passed evidence",
			);
			expect(compact.stdout as string).not.toContain(
				"T-06 marked done but lacks passed evidence",
			);
			expect(compact.stdout as string).toContain("7 more issue(s) omitted");

			const verbose = runKernel(root, [
				"verify-tasks",
				`.afol/wb/${session}`,
				"--strict",
				"--verbose",
			]);
			expect(verbose.status).toBe(1);
			expect(verbose.stdout as string).toContain(
				"T-12 marked done but lacks passed evidence",
			);
			expect(verbose.stdout as string).not.toContain("issue(s) omitted");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("direct strict verification remains strict for closed sessions", () => {
		const root = mkProjectRoot("closed-strict");
		try {
			const created = newWorkstream(root, "closed-strict");
			const closedAt = "2026-07-01T08:00:00.000Z";
			const task = readFileSync(created.taskPath, "utf8")
				.replace('status: "active"', 'status: "closed"')
				.replace(
					/^updated_at: .*$/m,
					`updated_at: "${closedAt}"\nclosed_at: "${closedAt}"`,
				)
				.replace("| T-01 | pending |", "| T-01 | done |")
				.replace("| T-01 | in_progress |", "| T-01 | done |");
			writeFileSync(created.taskPath, task, "utf8");

			const proc = runKernel(root, [
				"verify-tasks",
				`.afol/wb/${created.session}`,
				"--strict",
			]);

			expect(proc.status).toBe(1);
			expect(proc.stdout as string).toContain("missing_evidence");
			expect(proc.stdout as string).toContain("Verification failed.");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts explicit .afol/wb session paths", () => {
		const root = mkProjectRoot("explicit-wb-path");
		try {
			const created = newWorkstream(root, "explicit-wb-path");
			writeFileSync(
				created.taskPath,
				[
					"# Tasks: explicit-wb-path",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | explicit path |",
					"",
				].join("\n"),
				"utf8",
			);
			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
				exitCode: 0,
				provenance: "observed",
			});

			const proc = runKernel(root, [
				"verify-tasks",
				`.afol/wb/${created.session}`,
				"--strict",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).toContain("All tasks completed.");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects session arguments that escape the configured workbench root", () => {
		const root = mkProjectRoot("session-escape");
		try {
			const proc = runKernel(root, [
				"verify-tasks",
				"--session",
				"../../outside",
			]);

			expect(proc.status).toBe(2);
			expect(proc.stdout as string).toBe("");
			expect(proc.stderr as string).toContain(
				"Path escapes workbench directory: ../../outside",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects positional verify paths that escape the project root", () => {
		const root = mkProjectRoot("positional-escape");
		try {
			const proc = runKernel(root, ["verify-tasks", "../outside"]);

			expect(proc.status).toBe(2);
			expect(proc.stdout as string).toBe("");
			expect(proc.stderr as string).toContain(
				"Path escapes project root: ../outside",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
