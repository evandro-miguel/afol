import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { detectSessionHealth } from "../services/local-state/workbench-index";
import {
	formatVerifyReport,
	verifyAllSessions,
	verifyWorkbenchTasks,
} from "../services/workbench/verify";

function mkRoot(name: string): string {
	return mkdtempSync(join(tmpdir(), `wb-verify-${name}-`));
}

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, "utf8");
}

function writeProjectConfig(root: string): void {
	write(
		join(root, ".agents", "config.json"),
		JSON.stringify({ schema_version: 1 }, null, 2),
	);
	write(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }, null, 2),
	);
}

function seedDoneWorkbenchTask(
	root: string,
	session = "260531_1200_verify",
): void {
	const sessionDir = join(root, ".afol", "wb", session);
	write(
		join(sessionDir, `${session}_task_01.md`),
		[
			"# Tasks",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | done | worker | complete |",
			"",
		].join("\n"),
	);
	write(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({ task_id: "T-01", command: "bun test", result: "passed" })}\n`,
	);
}

describe("verifyWorkbenchTasks", () => {
	test("strict root verification ignores documentation task examples/templates", () => {
		const root = mkRoot("docs-ignore");
		try {
			seedDoneWorkbenchTask(root);
			write(
				join(root, "docs", "templates", "task.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | template example |",
					"",
				].join("\n"),
			);
			write(
				join(root, "src", "project-template", "docs", "templates", "task.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | template example |",
					"",
				].join("\n"),
			);
			write(
				join(root, "docs", "lessons", "entries", "task-example.md"),
				["# Lesson example", "", "- [ ] T-02 Example task from docs", ""].join(
					"\n",
				),
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(true);
			expect(result.totalTasks).toBe(1);
			expect(result.openTasks).toHaveLength(0);
			expect(result.issues).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict root verification still detects real open workbench tasks", () => {
		const root = mkRoot("wb-detect");
		try {
			const session = "260531_1201_verify";
			const sessionDir = join(root, ".afol", "wb", session);
			write(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | real workbench task |",
					"",
				].join("\n"),
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(false);
			expect(result.totalTasks).toBe(1);
			expect(result.openTasks).toHaveLength(1);
			expect(result.openTasks[0]?.file).toContain("/.afol/wb/");
			expect(result.openTasks[0]?.id).toBe("T-01");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification rejects unknown task states", () => {
		const root = mkRoot("unknown-task-state");
		try {
			const session = "260701_0800_unknown_state";
			const sessionDir = join(root, ".afol", "wb", session);
			const taskPath = join(sessionDir, `${session}_task_01.md`);
			write(
				taskPath,
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | frozen | worker | unsupported state in current policy |",
					"",
				].join("\n"),
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(false);
			expect(result.issues).toEqual([
				{
					type: "invalid_task_state",
					taskId: "T-01",
					file: taskPath,
					line: 7,
					message: "Task T-01 has invalid state: frozen",
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project-root verification ignores legacy .agents/wb history when .afol/wb exists", () => {
		const root = mkRoot("legacy-root-ignore");
		try {
			writeProjectConfig(root);
			const currentSession = "260609_1205_verify";
			const legacySession = "260101_0900_legacy";
			const archivedSession = "260101_0800_archived";
			write(
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
					"| T-01 | pending | worker | current task |",
					"",
				].join("\n"),
			);
			write(
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
					"| T-01 | pending | worker | archived task |",
					"",
				].join("\n"),
			);
			write(
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
					"| T-01 | done | worker | legacy task |",
					"",
				].join("\n"),
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.totalTasks).toBe(1);
			expect(result.pending).toBe(1);
			expect(result.completed).toBe(0);
			expect(result.sessionPath).toContain("/.afol/wb");
			expect(
				result.taskFiles.every((file) => file.includes("/.afol/wb/")),
			).toBe(true);
			expect(
				result.taskFiles.every((file) => !file.includes("/.afol/wb/_archive/")),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification accepts failed evidence superseded by later success", () => {
		const root = mkRoot("superseded-failure");
		try {
			const session = "260531_1202_verify";
			const sessionDir = join(root, ".afol", "wb", session);
			write(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | fixed after retry |",
					"",
				].join("\n"),
			);
			write(
				join(sessionDir, ".evidence.jsonl"),
				[
					JSON.stringify({
						id: "E-fail",
						task_id: "T-01",
						command: "bun test",
						result: "failed: transient fixture",
					}),
					JSON.stringify({
						id: "E-pass",
						task_id: "T-01",
						command: "bun test",
						result: "passed",
					}),
					"",
				].join("\n"),
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(true);
			expect(result.issues).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification accepts failed evidence superseded by later success with a different command", () => {
		const root = mkRoot("superseded-failure-different-command");
		try {
			const session = "260531_1202_verify_diff";
			const sessionDir = join(root, ".afol", "wb", session);
			write(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | fixed after retry |",
					"",
				].join("\n"),
			);
			write(
				join(sessionDir, ".evidence.jsonl"),
				[
					JSON.stringify({
						id: "E-fail",
						task_id: "T-01",
						command: "bun test --watch",
						result: "failed: transient fixture",
					}),
					JSON.stringify({
						id: "E-pass",
						task_id: "T-01",
						command: "bun test",
						result: "passed",
					}),
					"",
				].join("\n"),
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(true);
			expect(result.issues).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification rejects passed evidence with a nonzero exit code", () => {
		const root = mkRoot("passed-nonzero-exit");
		try {
			const session = "260531_1202_verify_nonzero";
			const sessionDir = join(root, ".afol", "wb", session);
			write(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | command exited nonzero |",
					"",
				].join("\n"),
			);
			write(
				join(sessionDir, ".evidence.jsonl"),
				`${JSON.stringify({
					id: "E-nonzero",
					task_id: "T-01",
					command: "bun test",
					result: "passed",
					exit_code: 1,
				})}\n`,
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(false);
			expect(result.issues).toContainEqual(
				expect.objectContaining({
					taskId: "T-01",
					type: "failed_evidence",
				}),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification rejects failed evidence followed only by non-runnable success", () => {
		const root = mkRoot("failed-evidence-non-runnable-success");
		try {
			const session = "260531_1202_verify_non_runnable";
			const sessionDir = join(root, ".afol", "wb", session);
			write(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | later non-runnable marker |",
					"",
				].join("\n"),
			);
			write(
				join(sessionDir, ".evidence.jsonl"),
				[
					JSON.stringify({
						id: "E-old-pass",
						task_id: "T-01",
						command: "bun test",
						result: "passed",
					}),
					JSON.stringify({
						id: "E-fail",
						task_id: "T-01",
						command: "bun test --watch",
						result: "failed: regression",
					}),
					JSON.stringify({
						id: "E-marker",
						task_id: "T-01",
						result: "passed",
						note: "manual marker without command",
					}),
					"",
				].join("\n"),
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(false);
			expect(result.issues).toContainEqual(
				expect.objectContaining({
					taskId: "T-01",
					type: "failed_evidence",
				}),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification accepts success aliases used by lifecycle closure", () => {
		const root = mkRoot("success-alias");
		try {
			const session = "260531_1204_verify";
			const sessionDir = join(root, ".afol", "wb", session);
			write(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | alias success |",
					"",
				].join("\n"),
			);
			write(
				join(sessionDir, ".evidence.jsonl"),
				`${JSON.stringify({ id: "E-green", task_id: "T-01", command: "bun test", result: "green" })}\n`,
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(true);
			expect(result.issues).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification rejects malformed evidence JSONL lines", () => {
		const root = mkRoot("invalid-evidence");
		try {
			const session = "260531_1206_verify";
			const sessionDir = join(root, ".afol", "wb", session);
			seedDoneWorkbenchTask(root, session);
			write(
				join(sessionDir, ".evidence.jsonl"),
				[
					"{not-json",
					JSON.stringify({
						id: "E-pass",
						task_id: "T-01",
						command: "bun test",
						result: "passed",
					}),
					"",
				].join("\n"),
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(false);
			expect(result.issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "invalid_evidence",
						line: 1,
					}),
				]),
			);
			expect(result.issues).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: "missing_evidence" }),
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports missing sessions and strict missing task sessions", () => {
		const root = mkRoot("missing");
		try {
			const missing = verifyWorkbenchTasks(join(root, "missing-session"), true);
			expect(missing.allCompleted).toBe(false);
			expect(missing.totalTasks).toBe(0);
			expect(missing.issues[0]?.type).toBe("missing_session");

			const emptySession = join(root, "empty-session");
			mkdirSync(emptySession, { recursive: true });

			const relaxed = verifyWorkbenchTasks(emptySession, false);
			expect(relaxed.allCompleted).toBe(true);
			expect(relaxed.issues[0]?.type).toBe("missing_tasks");

			const strict = verifyWorkbenchTasks(emptySession, true);
			expect(strict.allCompleted).toBe(false);
			expect(strict.issues[0]?.type).toBe("missing_tasks");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("parses legacy markers and formats open-task report", () => {
		const root = mkRoot("legacy-markers");
		try {
			write(
				join(root, "task-list.md"),
				[
					"# Legacy tasks",
					"",
					"- [ ] T-01 pending task",
					"- [/] T-02 progress task",
					"- [%] T-03 implemented task",
					"- [&] T-04 tested task",
					"- [!] T-05 problem task",
					"- [>] T-06 moved task",
					"- [x] T-07 done task",
					"",
				].join("\n"),
			);

			const result = verifyWorkbenchTasks(root, false);
			const report = formatVerifyReport(result);

			expect(result.totalTasks).toBe(7);
			expect(result.pending).toBe(1);
			expect(result.inProgress).toBe(1);
			expect(result.implementedUntested).toBe(1);
			expect(result.testedNeedsSpecValidation).toBe(1);
			expect(result.problem).toBe(1);
			expect(result.moved).toBe(1);
			expect(result.completed).toBe(1);
			expect(result.openTasks).toHaveLength(5);
			expect(report).toContain("Pending:");
			expect(report).toContain("In Progress:");
			expect(report).toContain("Implemented:");
			expect(report).toContain("Tested/Spec:");
			expect(report).toContain("Problem:");
			expect(report).toContain("Moved:");
			expect(report).toContain("Open Tasks:");
			expect(report).toContain("Verification failed.");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification rejects unresolved failed evidence for done tasks", () => {
		const root = mkRoot("failed-evidence");
		try {
			const session = "260531_1203_verify";
			const sessionDir = join(root, ".agents", "wb", session);
			write(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | failed closure |",
					"",
				].join("\n"),
			);
			write(
				join(sessionDir, ".evidence.jsonl"),
				`${JSON.stringify({ id: "E-fail", taskId: "T-01", command: "bun test", result: "failed" })}\n`,
			);

			const result = verifyWorkbenchTasks(root, true);
			const report = formatVerifyReport(result);

			expect(result.allCompleted).toBe(false);
			expect(result.issues[0]?.type).toBe("failed_evidence");
			expect(report).toContain("Mode: STRICT");
			expect(report).toContain("failed_evidence");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict verification rejects open generic checklist items in task files", () => {
		const root = mkRoot("open-checklist");
		try {
			const session = "260615_1200_open_checklist";
			const sessionDir = join(root, ".afol", "wb", session);
			write(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | complete |",
					"",
					"## Sub-task Checklist (T-01)",
					"",
					"- [ ] Run final gate",
					"",
				].join("\n"),
			);
			write(
				join(sessionDir, ".evidence.jsonl"),
				`${JSON.stringify({ task_id: "T-01", command: "bun test", result: "passed" })}\n`,
			);

			const result = verifyWorkbenchTasks(root, true);

			expect(result.allCompleted).toBe(false);
			expect(
				result.issues.some((issue) => issue.type === "open_checklist_item"),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("verifyAllSessions isolates evidence per session (cross-session task ID reuse)", () => {
		const root = mkRoot("cross-session");
		try {
			// Session A: T-01 done with evidence
			const sessionA = "260609_1001_session_a";
			const sessionADir = join(root, ".afol", "wb", sessionA);
			write(
				join(sessionADir, `${sessionA}_task_01.md`),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | task in session A |",
					"",
				].join("\n"),
			);
			write(
				join(sessionADir, ".evidence.jsonl"),
				`${JSON.stringify({ task_id: "T-01", command: "bun test", result: "passed" })}\n`,
			);

			// Session B: T-01 done WITHOUT evidence
			const sessionB = "260609_1001_session_b";
			const sessionBDir = join(root, ".afol", "wb", sessionB);
			write(
				join(sessionBDir, `${sessionB}_task_01.md`),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | task in session B (no evidence) |",
					"",
				].join("\n"),
			);

			const results = verifyAllSessions(root, true);
			expect(results).toHaveLength(2);

			const resultA = results.find((r) => r.sessionPath.endsWith(sessionA));
			const resultB = results.find((r) => r.sessionPath.endsWith(sessionB));

			expect(resultA?.allCompleted).toBe(true);
			expect(resultA?.issues).toHaveLength(0);

			expect(resultB?.allCompleted).toBe(false);
			expect(resultB?.issues.some((i) => i.type === "missing_evidence")).toBe(
				true,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detectSessionHealth catches duplicate themes", () => {
		const root = mkRoot("dup-theme");
		try {
			// Two sessions sharing the same theme "same-feature"
			const sessionA = "260609_1001_same-feature";
			const sessionB = "260610_1002_same-feature";
			mkdirSync(join(root, ".afol", "wb", sessionA), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", sessionB), { recursive: true });

			const warnings = detectSessionHealth(root);
			const duplicates = warnings.filter((w) => w.type === "duplicate_theme");
			expect(duplicates.length).toBeGreaterThanOrEqual(1);
			expect(duplicates[0]?.message).toContain("same-feature");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detectSessionHealth detects stale open tasks", () => {
		const root = mkRoot("stale-tasks");
		try {
			const session = "260601_1000_stale-session";
			const sessionDir = join(root, ".afol", "wb", session);
			write(
				join(sessionDir, `${session}_task_01.md`),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | wip | worker | never finished |",
					"",
				].join("\n"),
			);

			// Force old mtime (>7 days)
			const oldTime = new Date("2025-01-01T00:00:00Z").getTime() / 1000;
			for (const file of [
				join(sessionDir, `${session}_task_01.md`),
				sessionDir,
			]) {
				try {
					utimesSync(file, oldTime, oldTime);
				} catch {
					// some filesystems don't support utimes on dirs
				}
			}

			const warnings = detectSessionHealth(root);
			const stale = warnings.filter((w) => w.type === "stale_open_tasks");
			expect(stale.length).toBeGreaterThanOrEqual(1);
			expect(stale[0]?.session).toBe(session);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
