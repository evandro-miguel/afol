import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { inspectEventLedger } from "../services/events/ledger";
import {
	detectSessionHealth,
	rebuildWorkBenchIndex,
	validateWorkBenchIndex,
} from "../services/local-state/workbench-index";
import {
	evidenceCompletionAuthorization,
	formatVerifyReport,
	verifyAllSessions,
	verifyTaskText,
	verifyWorkbenchTasks,
} from "../services/workbench/verify";

describe("evidence completion authorization", () => {
	test("fails closed for declared, legacy, missing-exit, and n/a evidence", () => {
		for (const entry of [
			{
				id: "E-declared",
				command: "bun test",
				result: "passed",
				exit_code: 0,
				provenance: "declared",
			},
			{ id: "E-legacy", command: "bun test", result: "passed", exit_code: 0 },
			{
				id: "E-missing-exit",
				command: "bun test",
				result: "passed",
				provenance: "observed",
			},
			{
				id: "E-na",
				command: "review docs",
				result: "n/a",
				exit_code: 0,
				provenance: "observed",
			},
		]) {
			expect(evidenceCompletionAuthorization([entry]).status).toBe("missing");
		}
	});

	test("returns the later applicable observed success after a failure", () => {
		expect(
			evidenceCompletionAuthorization([
				{
					id: "E-failed",
					command: "bun test",
					result: "failed",
					exit_code: 1,
					provenance: "observed",
				},
				{
					id: "E-passed",
					command: "bun test",
					result: "passed",
					exit_code: 0,
					provenance: "observed",
				},
			]),
		).toEqual({ status: "passed", evidenceId: "E-passed" });
	});

	test("does not authorize shell no-op commands", () => {
		for (const command of [
			"true",
			" /bin/true ",
			" : ",
			"true # verification",
			": # verification",
			"env true",
			"/bin/env true",
			"/usr/bin/env true",
			"env -i 'true'",
			"env -C /tmp true",
			"env --chdir=/tmp true",
			"command -- true",
			"command -p true",
			"command -v true",
			"command -V true",
			"exec :",
			"exec -c true",
			"exec -l true",
			"exec -cl true",
			"exec -a afol true",
			"exec -- true",
			"sh -c true",
			"bash -lc 'true'",
			"zsh -c ':'",
			"sh -n",
			"bash -n",
			"sh -n --",
			"bash -n --",
			"/bin/sh -c true",
			"/usr/bin/bash -lc true",
			"/usr/bin/zsh -c :",
			"/bin/dash -c true",
			"bash -c",
			"eval true",
			"eval 'true",
			"true && :",
			"true || :",
			"true; :",
			"true | :",
			"true & :",
		]) {
			expect(
				evidenceCompletionAuthorization([
					{
						id: `E-${command.trim()}`,
						command,
						result: "passed",
						exit_code: 0,
						provenance: "observed",
					},
				]),
			).toEqual({ status: "missing" });
		}
	});

	test("authorizes shell syntax-check commands as runnable evidence", () => {
		for (const command of [
			"sh -n session-task.sh",
			"bash -n session-task.sh",
			"/bin/sh -n session-task.sh",
			"/usr/bin/zsh -n session-task.sh",
		]) {
			expect(
				evidenceCompletionAuthorization([
					{
						id: `E-${command.trim()}`,
						command,
						result: "passed",
						exit_code: 0,
						provenance: "observed",
					},
				]),
			).toEqual({ status: "passed", evidenceId: `E-${command.trim()}` });
		}
	});

	test("keeps runnable wrapper commands authorizing", () => {
		for (const command of [
			"env CI=1 bun test --filter workbench",
			"command bun test",
			"exec bun test",
			"bash -lc 'bun test'",
			"/usr/bin/bash -lc 'bun test'",
			"/opt/custom/bash -lc true",
			"eval bun test",
			"bun test && bun run typecheck",
		]) {
			expect(
				evidenceCompletionAuthorization([
					{
						id: `E-${command}`,
						command,
						result: "passed",
						exit_code: 0,
						provenance: "observed",
					},
				]),
			).toEqual({ status: "passed", evidenceId: `E-${command}` });
		}
	});
});

test("strict verification rejects duplicate task ids across task files", () => {
	const root = mkRoot("duplicate-task-id");
	try {
		for (const suffix of ["01", "02"])
			write(
				join(root, `session_task_${suffix}.md`),
				`# Tasks\n\n| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n| T-01 | pending | worker | duplicate |\n`,
			);
		const result = verifyWorkbenchTasks(root, true);
		expect(
			result.issues.some((issue) => issue.type === "duplicate_task_id"),
		).toBe(true);
		expect(result.allCompleted).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("strict verification rejects duplicate task ids in one task file", () => {
	const root = mkRoot("duplicate-task-id-same-file");
	try {
		write(
			join(root, "session_task_01.md"),
			`# Tasks\n\n| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n| T-01 | pending | worker | first |\n| T-01 | pending | worker | duplicate |\n`,
		);
		const result = verifyWorkbenchTasks(root, true);
		expect(result.issues.map((issue) => issue.type)).toContain(
			"duplicate_task_id",
		);
		expect(result.allCompleted).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("repository verification allows the same task id in different sessions", () => {
	const root = mkRoot("duplicate-task-id-different-sessions");
	try {
		for (const session of ["session-a", "session-b"]) {
			write(
				join(root, session, `${session}_task_01.md`),
				`# Tasks\n\n| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n| T-01 | pending | worker | valid per-session id |\n`,
			);
			write(join(root, session, ".evidence.jsonl"), "");
		}
		const result = verifyWorkbenchTasks(root, true);
		expect(result.issues.map((issue) => issue.type)).not.toContain(
			"duplicate_task_id",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

function mkRoot(name: string): string {
	return mkdtempSync(join(tmpdir(), `wb-verify-${name}-`));
}

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	if (path.endsWith(".evidence.jsonl")) {
		const lines = content.split("\n").map((line, index) => {
			if (!line.trim()) {
				return line;
			}
			try {
				const entry = JSON.parse(line) as Record<string, unknown>;
				if (
					typeof entry.result === "string" &&
					[
						"pass",
						"passed",
						"success",
						"successful",
						"ok",
						"green",
						"valid",
						"resolved",
					].includes(entry.result.toLowerCase())
				) {
					return JSON.stringify({
						id: entry.id ?? `E-fixture-${index}`,
						...entry,
						exit_code: entry.exit_code ?? 0,
						provenance: entry.provenance ?? "observed",
					});
				}
			} catch {
				return line;
			}
			return line;
		});
		writeFileSync(path, lines.join("\n"), "utf8");
		return;
	}
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
	test("formats the session path relative to cwd in deeply nested checkouts", () => {
		const sessionPath = join(
			process.cwd(),
			".tmp",
			"deep",
			"nested",
			"checkout",
			".afol",
			"wb",
			"sb-wb",
		);
		const result = verifyTaskText(
			[
				"## State Board",
				"",
				"| Task | State | Owner | Notes |",
				"|------|-------|-------|-------|",
				"| T-01 | done | worker | verified |",
				"",
			].join("\n"),
			join(sessionPath, "sb-wb_task_01.md"),
		);

		const report = formatVerifyReport(result);

		expect(report).toContain(
			`Session: ${relative(process.cwd(), sessionPath)}`,
		);
		expect(report).not.toContain(`Session: ${process.cwd()}`);
	});

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
			expect(result.openTasks[0]?.file.replaceAll("\\", "/")).toContain(
				"/.afol/wb/",
			);
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
			expect(result.sessionPath.replaceAll("\\", "/")).toContain("/.afol/wb");
			expect(
				result.taskFiles.every((file) =>
					file.replaceAll("\\", "/").includes("/.afol/wb/"),
				),
			).toBe(true);
			expect(
				result.taskFiles.every(
					(file) => !file.replaceAll("\\", "/").includes("/.afol/wb/_archive/"),
				),
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

	test("strict verification treats open generic checklist items as non-blocking", () => {
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

			expect(result.allCompleted).toBe(true);
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

	test("detectSessionHealth ignores timestamp-distinct closed sessions with the same theme", () => {
		const root = mkRoot("dup-theme");
		try {
			// Closed sessions may legitimately reuse a descriptive theme.
			const sessionA = "260609_1001_same-feature";
			const sessionB = "260610_1002_same-feature";
			mkdirSync(join(root, ".afol", "wb", sessionA), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", sessionB), { recursive: true });
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "data", "events", "events.jsonl"),
				`${[
					{ type: "workbench.new", session: sessionA },
					{ type: "workbench.close", session: sessionA },
					{ type: "workbench.new", session: sessionB },
					{ type: "workbench.close", session: sessionB },
				]
					.map((event, index) => JSON.stringify({ ...event, id: `E-${index}` }))
					.join("\n")}\n`,
				"utf8",
			);

			const warnings = detectSessionHealth(root);
			expect(warnings).toEqual([]);
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

			const workbenchSnapshot = rebuildWorkBenchIndex(root);
			const eventLedger = inspectEventLedger(root);
			expect(validateWorkBenchIndex(root, { eventLedger })).toEqual(
				validateWorkBenchIndex(root),
			);
			expect(
				detectSessionHealth(root, { eventLedger, workbenchSnapshot }),
			).toEqual(detectSessionHealth(root));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
