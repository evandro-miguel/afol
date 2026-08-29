import { describe, expect, test } from "bun:test";
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
import { runValidateCommand } from "../commands/validate";
import {
	runEvidenceCommand,
	runVerifyTasksCommand,
} from "../commands/workbench";
import { rebuildProjectIndexes } from "../services/local-state/project-indexes";
import { resolveWorkbenchEventLogPath } from "../services/local-state/workbench-events";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
import {
	evidenceTransitionAdmissionPath,
	loadEvidenceTransitionAdmissions,
} from "../services/project/evidence-transition-admission";
import { LEGACY_EVIDENCE_BASELINE_FILE } from "../services/project/legacy-evidence-baseline";
import { closeSession, isSessionClosed } from "../services/workbench/lifecycle";

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
	const root = mkdtempSync(join(tmpdir(), "evidence-admit-"));
	const agentsDir = join(root, ".agents");
	mkdirSync(join(root, ".afol"), { recursive: true });
	mkdirSync(join(agentsDir, "skills"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "rules"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "hooks"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "source"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, "docs", "arc"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "evidence-admit-fixture" },
		}),
		"utf8",
	);
	writeFileSync(
		join(agentsDir, "lock.json"),
		JSON.stringify({
			schema_version: 1,
			revision: "abc123",
			project: "evidence-admit-fixture",
			locked: true,
		}),
		"utf8",
	);
	writeFileSync(
		join(agentsDir, "manifest.json"),
		JSON.stringify({ schema_version: 1, managed_hashes: {} }),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "tools.json"),
		JSON.stringify({ version: "test", tools: [] }),
		"utf8",
	);
	return root;
}

function rebuildIndexes(root: string): void {
	rebuildWorkBenchIndex(root);
	rebuildProjectIndexes(root);
}

function baselinePath(root: string): string {
	return join(root, ".afol", "adm", "source", LEGACY_EVIDENCE_BASELINE_FILE);
}

function writeHistoricalFailedTransitionAdmission(root: string): void {
	writeFileSync(
		evidenceTransitionAdmissionPath(root),
		`${JSON.stringify(
			{
				schema_version: 1,
				policy_id: "no-op-evidence-v1",
				admissions: [
					{
						policy_id: "no-op-evidence-v1",
						session_id: "260718_1557_historical-failed",
						task_id: "T-01",
						issue_type: "failed_evidence",
						state_board_sha256: "a".repeat(64),
						evidence_ledger_sha256: "b".repeat(64),
						evidence_ledger_present: true,
						issue: "https://example.invalid/historical-failed",
						approval: "historical record",
					},
				],
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
}

function writeClosedSession(
	root: string,
	session: string,
	rows: readonly string[],
	options?: { evidenceLines?: readonly string[] },
): string {
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	const taskPath = join(sessionDir, `${session}_task_01.md`);
	writeFileSync(
		taskPath,
		[
			"---",
			'doc_type: "workbench_task"',
			`id: "${session}_task_01"`,
			`session_id: "${session}"`,
			'status: "closed"',
			'closed_at: "2026-07-01T08:00:00.000Z"',
			'updated_at: "2026-07-01T08:00:00.000Z"',
			"---",
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
	if (options?.evidenceLines?.length) {
		writeFileSync(
			join(sessionDir, ".evidence.jsonl"),
			`${options.evidenceLines.join("\n")}\n`,
			"utf8",
		);
	}
	return taskPath;
}

function writeOpenSession(root: string, session: string): void {
	const sessionDir = join(root, ".afol", "wb", session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, `${session}_task_01.md`),
		[
			"---",
			'doc_type: "workbench_task"',
			`session_id: "${session}"`,
			'status: "active"',
			'updated_at: "2026-07-01T08:00:00.000Z"',
			"---",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | done | worker | open session task |",
			"",
		].join("\n"),
		"utf8",
	);
}

async function captureEvidenceAdmit(
	root: string,
	args: string[],
): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
	return captureEvidenceCommand(root, ["admit", ...args]);
}

async function captureEvidenceCommand(
	root: string,
	args: string[],
): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
	const previousStdout = console.log;
	const previousStderr = console.error;
	const stdout: string[] = [];
	const stderr: string[] = [];
	console.log = (...parts: unknown[]) => {
		stdout.push(parts.map(String).join(" "));
	};
	console.error = (...parts: unknown[]) => {
		stderr.push(parts.map(String).join(" "));
	};
	try {
		const code = await runEvidenceCommand(args, root);
		return { code, stdout, stderr };
	} finally {
		console.log = previousStdout;
		console.error = previousStderr;
	}
}

async function captureVerifyStrict(
	root: string,
	session: string,
): Promise<{ code: number; stdout: string }> {
	const previousStdout = console.log;
	const previousStderr = console.error;
	const stdout: string[] = [];
	console.log = (...parts: unknown[]) => {
		stdout.push(parts.map(String).join(" "));
	};
	console.error = () => {};
	try {
		const code = await runVerifyTasksCommand(
			[`.afol/wb/${session}`, "--strict"],
			root,
		);
		return { code, stdout: stdout.join("\n") };
	} finally {
		console.log = previousStdout;
		console.error = previousStderr;
	}
}

describe("afol evidence admit", () => {
	test("dry-run does not write baseline file", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-dry";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"dry run admission",
				"--json",
			]);
			expect(result.code).toBe(0);
			const payload = JSON.parse(result.stdout[0] ?? "{}") as {
				data?: { written?: boolean; dry_run?: boolean };
			};
			expect(payload.data?.written).toBe(false);
			expect(payload.data?.dry_run).toBe(true);
			expect(existsSync(baselinePath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("historical failed transition rows remain readable without strict failure", async () => {
		const root = createFixture();
		const session = "260818_1620_transition-legacy-read";
		try {
			writeClosedSession(
				root,
				session,
				["| T-01 | done | worker | verified task |"],
				{
					evidenceLines: [
						JSON.stringify({
							task_id: "T-01",
							command: "bun test cli/tests/evidence-admit.test.ts",
							result: "passed",
							exit_code: 0,
							id: "E-transition-legacy-read",
							created_at: "2026-08-18T16:20:00.000Z",
							provenance: "observed",
						}),
					],
				},
			);
			writeHistoricalFailedTransitionAdmission(root);
			rebuildIndexes(root);

			const loaded = loadEvidenceTransitionAdmissions(root);
			expect(loaded?.admissions).toHaveLength(1);
			expect(loaded?.admissions[0]?.issue_type).toBe("failed_evidence");

			const captured = captureIo();
			const code = await runValidateCommand(
				root,
				["--strict", "--json"],
				captured.io,
			);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				report?: { ok?: boolean };
			};
			expect(payload.report?.ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("failed evidence cannot authorize transition admission close", () => {
		const root = createFixture();
		const session = "260818_1620_transition-failed-close";
		try {
			writeOpenSession(root, session);
			writeFileSync(
				join(root, ".afol", "wb", session, ".evidence.jsonl"),
				`${JSON.stringify({
					task_id: "T-01",
					command: "bun test",
					result: "failed",
					exit_code: 1,
					id: "E-transition-failed-close",
					created_at: "2026-08-18T16:20:00.000Z",
					provenance: "observed",
				})}\n`,
				"utf8",
			);
			rebuildIndexes(root);

			expect(() =>
				closeSession(root, session, { admitTransitionAdmission: true }),
			).toThrow("failed strict verification");
			expect(isSessionClosed(root, session)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition-admit admits and closes one terminal post-cutoff debt", async () => {
		const root = createFixture();
		const session = "260818_1620_transition-open";
		try {
			writeOpenSession(root, session);
			writeFileSync(
				join(root, ".afol", "wb", session, ".evidence.jsonl"),
				`${JSON.stringify({
					task_id: "T-01",
					command: "true",
					result: "passed",
					exit_code: 0,
					id: "E-transition-noop",
					created_at: "2026-08-18T16:20:00.000Z",
					provenance: "observed",
				})}\n`,
				"utf8",
			);
			writeHistoricalFailedTransitionAdmission(root);
			rebuildIndexes(root);

			const result = await captureEvidenceCommand(root, [
				"transition-admit",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--policy",
				"no-op-evidence-v1",
				"--issue",
				"AFOL-96",
				"--approval",
				"approved transition repair",
				"--confirm",
				"--json",
			]);
			expect(result.code).toBe(0);
			expect(isSessionClosed(root, session)).toBe(true);
			expect(existsSync(evidenceTransitionAdmissionPath(root))).toBe(true);
			const admission = JSON.parse(
				readFileSync(evidenceTransitionAdmissionPath(root), "utf8"),
			) as { admissions: Array<Record<string, unknown>> };
			expect(admission.admissions).toEqual([
				expect.objectContaining({
					session_id: "260718_1557_historical-failed",
					task_id: "T-01",
					issue_type: "failed_evidence",
				}),
				expect.objectContaining({
					session_id: session,
					task_id: "T-01",
					issue_type: "missing_evidence",
					approval: "approved transition repair",
				}),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition-admit leaves durable admission for a nonzero close retry", async () => {
		const root = createFixture();
		const session = "260818_1620_transition-retry";
		const args = [
			"transition-admit",
			"--session",
			session,
			"--task-id",
			"T-01",
			"--policy",
			"no-op-evidence-v1",
			"--issue",
			"AFOL-96",
			"--approval",
			"approved transition retry",
			"--confirm",
			"--json",
		];
		try {
			writeOpenSession(root, session);
			writeFileSync(
				join(root, ".afol", "wb", session, ".evidence.jsonl"),
				`${JSON.stringify({
					task_id: "T-01",
					command: "true",
					result: "passed",
					exit_code: 0,
					id: "E-transition-retry-noop",
					created_at: "2026-08-18T16:20:00.000Z",
					provenance: "observed",
				})}\n`,
				"utf8",
			);
			rebuildIndexes(root);
			const eventPath = resolveWorkbenchEventLogPath(root);
			rmSync(eventPath, { force: true });
			mkdirSync(eventPath, { recursive: true });

			const failedClose = await captureEvidenceCommand(root, args);
			expect(failedClose.code).not.toBe(0);
			expect(isSessionClosed(root, session)).toBe(false);
			expect(existsSync(evidenceTransitionAdmissionPath(root))).toBe(true);

			rmSync(eventPath, { recursive: true, force: true });
			const retried = await captureEvidenceCommand(root, args);
			expect(retried.code).toBe(0);
			expect(isSessionClosed(root, session)).toBe(true);
			const admission = JSON.parse(
				readFileSync(evidenceTransitionAdmissionPath(root), "utf8"),
			) as { admissions: Array<Record<string, unknown>> };
			expect(admission.admissions).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition-admit refuses more than one eligible debt", async () => {
		const root = createFixture();
		const session = "260818_1620_transition-multi";
		try {
			writeOpenSession(root, session);
			const taskPath = join(
				root,
				".afol",
				"wb",
				session,
				`${session}_task_01.md`,
			);
			writeFileSync(
				taskPath,
				readFileSync(taskPath, "utf8").replace(
					"| T-01 | done | worker | open session task |",
					"| T-01 | done | worker | open session task |\n| T-02 | done | worker | second task |",
				),
				"utf8",
			);
			const noopSuccess = (taskId: string) =>
				JSON.stringify({
					task_id: taskId,
					command: "true",
					result: "passed",
					exit_code: 0,
					id: `E-transition-${taskId}`,
					created_at: "2026-08-18T16:20:00.000Z",
					provenance: "observed",
				});
			writeFileSync(
				join(root, ".afol", "wb", session, ".evidence.jsonl"),
				`${noopSuccess("T-01")}\n${noopSuccess("T-02")}\n`,
				"utf8",
			);
			rebuildIndexes(root);
			const result = await captureEvidenceCommand(root, [
				"transition-admit",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--policy",
				"no-op-evidence-v1",
				"--issue",
				"AFOL-96",
				"--approval",
				"reject multiple debt",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toContain("exactly one eligible");
			expect(existsSync(evidenceTransitionAdmissionPath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition-admit refuses mixed no-op and real failed evidence", async () => {
		const root = createFixture();
		const session = "260818_1620_transition-mixed-ledger";
		try {
			writeOpenSession(root, session);
			const evidence = (
				id: string,
				command: string,
				result: string,
				exit_code: number,
			) =>
				JSON.stringify({
					task_id: "T-01",
					command,
					result,
					exit_code,
					id,
					created_at: "2026-08-18T16:20:00.000Z",
					provenance: "observed",
				});
			writeFileSync(
				join(root, ".afol", "wb", session, ".evidence.jsonl"),
				`${evidence("E-transition-noop", "true", "passed", 0)}\n${evidence("E-transition-real", "bun test cli/tests/evidence-admit.test.ts", "failed", 1)}\n`,
				"utf8",
			);
			rebuildIndexes(root);

			const result = await captureEvidenceCommand(root, [
				"transition-admit",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--policy",
				"no-op-evidence-v1",
				"--issue",
				"AFOL-96",
				"--approval",
				"reject mixed ledger",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toContain("exactly one eligible");
			expect(isSessionClosed(root, session)).toBe(false);
			expect(existsSync(evidenceTransitionAdmissionPath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition-admit refuses a non-success no-op result", async () => {
		const root = createFixture();
		const session = "260818_1620_transition-non-success";
		try {
			writeClosedSession(
				root,
				session,
				["| T-01 | done | worker | terminal task |"],
				{
					evidenceLines: [
						JSON.stringify({
							task_id: "T-01",
							command: "true",
							result: "unknown",
							exit_code: 0,
							id: "E-transition-unknown",
							created_at: "2026-08-18T16:20:00.000Z",
							provenance: "observed",
						}),
					],
				},
			);
			rebuildIndexes(root);

			const result = await captureEvidenceCommand(root, [
				"transition-admit",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--policy",
				"no-op-evidence-v1",
				"--issue",
				"AFOL-96",
				"--approval",
				"reject non-success",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toContain("not debt caused");
			expect(existsSync(evidenceTransitionAdmissionPath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition-admit refuses a successful no-op with nonzero exit", async () => {
		const root = createFixture();
		const session = "260818_1620_transition-nonzero";
		try {
			writeClosedSession(
				root,
				session,
				["| T-01 | done | worker | terminal task |"],
				{
					evidenceLines: [
						JSON.stringify({
							task_id: "T-01",
							command: "true",
							result: "passed",
							exit_code: 1,
							id: "E-transition-nonzero",
							created_at: "2026-08-18T16:20:00.000Z",
							provenance: "observed",
						}),
					],
				},
			);
			rebuildIndexes(root);

			const result = await captureEvidenceCommand(root, [
				"transition-admit",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--policy",
				"no-op-evidence-v1",
				"--issue",
				"AFOL-96",
				"--approval",
				"reject nonzero exit",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toContain("exactly one eligible");
			expect(existsSync(evidenceTransitionAdmissionPath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition-admit refuses failed evidence", async () => {
		const root = createFixture();
		const session = "260818_1620_transition-failed";
		try {
			writeClosedSession(
				root,
				session,
				["| T-01 | done | worker | terminal task |"],
				{
					evidenceLines: [
						JSON.stringify({
							task_id: "T-01",
							command: "true",
							result: "failed",
							exit_code: 1,
							id: "E-transition-failed",
							created_at: "2026-08-18T16:20:00.000Z",
							provenance: "observed",
						}),
					],
				},
			);
			rebuildIndexes(root);

			const result = await captureEvidenceCommand(root, [
				"transition-admit",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--policy",
				"no-op-evidence-v1",
				"--issue",
				"AFOL-96",
				"--approval",
				"reject failed evidence",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toContain("exactly one eligible");
			expect(existsSync(evidenceTransitionAdmissionPath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("transition-admit refuses invalid evidence", async () => {
		const root = createFixture();
		const session = "260818_1620_transition-invalid";
		try {
			writeClosedSession(
				root,
				session,
				["| T-01 | done | worker | terminal task |"],
				{
					evidenceLines: [
						JSON.stringify({
							task_id: "T-01",
							command: "bun test",
							result: "passed",
							exit_code: 0,
							id: "E-transition-invalid",
							created_at: "2026-08-18T16:20:00.000Z",
							provenance: "observed",
							verification_run_id: "run-does-not-exist",
						}),
					],
				},
			);
			rebuildIndexes(root);

			const result = await captureEvidenceCommand(root, [
				"transition-admit",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--policy",
				"no-op-evidence-v1",
				"--issue",
				"AFOL-96",
				"--approval",
				"reject invalid evidence",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(/eligible|invalid/i);
			expect(existsSync(evidenceTransitionAdmissionPath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--confirm admits missing_evidence and validate project reports admitted", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-missing";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const admit = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"legacy missing debt",
				"--confirm",
				"--json",
			]);
			expect(admit.code).toBe(0);
			expect(existsSync(baselinePath(root))).toBe(true);
			const baseline = JSON.parse(readFileSync(baselinePath(root), "utf8")) as {
				admissions: Array<{ issue_type: string; task_id: string }>;
			};
			expect(baseline.admissions).toEqual([
				expect.objectContaining({
					task_id: "T-01",
					issue_type: "missing_evidence",
				}),
			]);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message?: string }>;
			};
			const sessionEvidence = payload.checks?.find(
				(entry) => entry.id === "session_evidence",
			);
			expect(sessionEvidence?.ok).toBe(true);
			expect(sessionEvidence?.message ?? "").toContain("admitted");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("verify-tasks --strict still fails after admit", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-strict";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			expect(
				(
					await captureEvidenceAdmit(root, [
						"--session",
						session,
						"--task-id",
						"T-01",
						"--reason",
						"strict remains red",
						"--confirm",
					])
				).code,
			).toBe(0);
			const verify = await captureVerifyStrict(root, session);
			expect(verify.code).toBe(1);
			expect(verify.stdout).toContain("missing_evidence");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects open session", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-open";
		try {
			writeOpenSession(root, session);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"should fail",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toContain("not closed");
			expect(existsSync(baselinePath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects post-cutoff closed session", async () => {
		const root = createFixture();
		const session = "260803_1200_admit-post";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | current task |",
			]);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"should fail",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toContain("not pre-cutoff");
			expect(existsSync(baselinePath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects when State Board later mutates (admission becomes stale)", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-stale";
		try {
			const taskPath = writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			expect(
				(
					await captureEvidenceAdmit(root, [
						"--session",
						session,
						"--task-id",
						"T-01",
						"--reason",
						"will go stale",
						"--confirm",
					])
				).code,
			).toBe(0);
			writeFileSync(
				taskPath,
				readFileSync(taskPath, "utf8").replace(
					"historical task",
					"mutated historical task",
				),
				"utf8",
			);
			rebuildIndexes(root);
			const captured = captureIo();
			expect(await runValidateCommand(root, ["--json"], captured.io)).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean }>;
			};
			expect(
				payload.checks?.find((entry) => entry.id === "session_evidence")?.ok,
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("failed_evidence requires failed type admission (not covered by missing)", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-failed";
		try {
			writeClosedSession(
				root,
				session,
				["| T-01 | done | worker | historical task |"],
				{
					evidenceLines: [
						JSON.stringify({
							task_id: "T-01",
							command: "bun test",
							result: "failed",
							exit_code: 1,
							id: "e-1",
							provenance: "observed",
						}),
					],
				},
			);
			rebuildIndexes(root);
			const missingOnly = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--issue-type",
				"missing_evidence",
				"--reason",
				"wrong type",
				"--confirm",
			]);
			expect(missingOnly.code).toBe(2);

			const failed = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--issue-type",
				"failed_evidence",
				"--reason",
				"failed debt",
				"--confirm",
				"--json",
			]);
			expect(failed.code).toBe(0);
			const baseline = JSON.parse(readFileSync(baselinePath(root), "utf8")) as {
				admissions: Array<{ issue_type: string }>;
			};
			expect(baseline.admissions).toHaveLength(1);
			expect(baseline.admissions[0]?.issue_type).toBe("failed_evidence");

			const captured = captureIo();
			expect(await runValidateCommand(root, ["--json"], captured.io)).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--all-missing admits multiple tasks", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-multi";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task one |",
				"| T-02 | done | worker | historical task two |",
			]);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--all-missing",
				"--reason",
				"batch debt",
				"--confirm",
				"--json",
			]);
			expect(result.code).toBe(0);
			const payload = JSON.parse(result.stdout[0] ?? "{}") as {
				data?: { admissions?: Array<{ task_id: string }> };
			};
			expect(
				payload.data?.admissions?.map((entry) => entry.task_id).sort(),
			).toEqual(["T-01", "T-02"]);
			const baseline = JSON.parse(readFileSync(baselinePath(root), "utf8")) as {
				admissions: unknown[];
			};
			expect(baseline.admissions).toHaveLength(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("re-run --confirm is idempotent (no duplicate rows)", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-idem";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const args = [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"first approval",
				"--confirm",
				"--json",
			];
			expect((await captureEvidenceAdmit(root, args)).code).toBe(0);
			const second = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"refreshed approval",
				"--confirm",
				"--json",
			]);
			expect(second.code).toBe(0);
			const payload = JSON.parse(second.stdout[0] ?? "{}") as {
				data?: { replaced?: number; added?: number; admissions_total?: number };
			};
			expect(payload.data?.replaced).toBe(1);
			expect(payload.data?.added).toBe(0);
			expect(payload.data?.admissions_total).toBe(1);
			const baseline = JSON.parse(readFileSync(baselinePath(root), "utf8")) as {
				admissions: Array<{ approval: string }>;
			};
			expect(baseline.admissions).toHaveLength(1);
			expect(baseline.admissions[0]?.approval).toBe("refreshed approval");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("missing --reason fails", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-noreason";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(/reason|approval/i);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("corrupt baseline is present_invalid: --confirm hard-fails without write", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-corrupt";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			const path = baselinePath(root);
			const corruptBody = "{not-valid-json";
			writeFileSync(path, corruptBody, "utf8");
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"must not treat corrupt as empty",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(/present but invalid|invalid/i);
			// File must remain the original corrupt body (never rewritten as create).
			expect(readFileSync(path, "utf8")).toBe(corruptBody);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("create-time raised --cutoff-session-id is refused", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-raised-cutoff";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"raised cutoff",
				"--cutoff-session-id",
				"260801_0000",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(/raises cutoff|refuse raised/i);
			expect(existsSync(baselinePath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--cutoff-session-id differing from existing baseline errors", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-cutoff-diff";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			expect(
				(
					await captureEvidenceAdmit(root, [
						"--session",
						session,
						"--task-id",
						"T-01",
						"--reason",
						"create baseline",
						"--confirm",
					])
				).code,
			).toBe(0);
			const before = readFileSync(baselinePath(root), "utf8");
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"try change cutoff",
				"--cutoff-session-id",
				"260701_0000",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(
				/differs from existing baseline cutoff/i,
			);
			expect(readFileSync(baselinePath(root), "utf8")).toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--baseline-id differing from existing baseline errors", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-baseline-diff";
		try {
			writeClosedSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			expect(
				(
					await captureEvidenceAdmit(root, [
						"--session",
						session,
						"--task-id",
						"T-01",
						"--reason",
						"create baseline",
						"--confirm",
					])
				).code,
			).toBe(0);
			const before = readFileSync(baselinePath(root), "utf8");
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"try change baseline id",
				"--baseline-id",
				"other-baseline-id",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(
				/differs from existing baseline_id/i,
			);
			expect(readFileSync(baselinePath(root), "utf8")).toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--all-missing admits only missing_evidence (skips failed_evidence)", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-all-skip-failed";
		try {
			writeClosedSession(
				root,
				session,
				[
					"| T-01 | done | worker | missing task |",
					"| T-02 | done | worker | failed task |",
				],
				{
					evidenceLines: [
						JSON.stringify({
							task_id: "T-02",
							command: "bun test",
							result: "failed",
							exit_code: 1,
							id: "e-fail",
							provenance: "observed",
						}),
					],
				},
			);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--all-missing",
				"--reason",
				"batch missing only",
				"--confirm",
				"--json",
			]);
			expect(result.code).toBe(0);
			const payload = JSON.parse(result.stdout[0] ?? "{}") as {
				data?: {
					admissions?: Array<{ task_id: string; issue_type: string }>;
				};
			};
			expect(payload.data?.admissions).toEqual([
				expect.objectContaining({
					task_id: "T-01",
					issue_type: "missing_evidence",
				}),
			]);
			const baseline = JSON.parse(readFileSync(baselinePath(root), "utf8")) as {
				admissions: Array<{ task_id: string; issue_type: string }>;
			};
			expect(baseline.admissions).toHaveLength(1);
			expect(baseline.admissions[0]?.issue_type).toBe("missing_evidence");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--all-missing --issue-type failed_evidence admits only failed", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-all-failed-only";
		try {
			writeClosedSession(
				root,
				session,
				[
					"| T-01 | done | worker | missing task |",
					"| T-02 | done | worker | failed task |",
				],
				{
					evidenceLines: [
						JSON.stringify({
							task_id: "T-02",
							command: "bun test",
							result: "failed",
							exit_code: 1,
							id: "e-fail",
							provenance: "observed",
						}),
					],
				},
			);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--all-missing",
				"--issue-type",
				"failed_evidence",
				"--reason",
				"batch failed only",
				"--confirm",
				"--json",
			]);
			expect(result.code).toBe(0);
			const payload = JSON.parse(result.stdout[0] ?? "{}") as {
				data?: {
					admissions?: Array<{ task_id: string; issue_type: string }>;
				};
			};
			expect(payload.data?.admissions).toEqual([
				expect.objectContaining({
					task_id: "T-02",
					issue_type: "failed_evidence",
				}),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses closed session that still has open tasks", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-open-tasks";
		try {
			writeClosedSession(root, session, [
				"| T-01 | in_progress | worker | still open on closed session |",
			]);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"should refuse open tasks",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(/open task/i);
			expect(existsSync(baselinePath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses invalid_evidence (cannot be admitted)", async () => {
		const root = createFixture();
		const session = "260701_0800_admit-invalid";
		try {
			writeClosedSession(
				root,
				session,
				["| T-01 | done | worker | historical task |"],
				{
					evidenceLines: [
						JSON.stringify({
							task_id: "T-01",
							command: "bun test",
							result: "passed",
							exit_code: 0,
							id: "e-1",
							provenance: "observed",
							// Run-tagged success without a matching verification run ledger.
							verification_run_id: "run-does-not-exist",
						}),
					],
				},
			);
			rebuildIndexes(root);
			const result = await captureEvidenceAdmit(root, [
				"--session",
				session,
				"--task-id",
				"T-01",
				"--reason",
				"invalid cannot admit",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(/invalid_evidence/i);
			expect(existsSync(baselinePath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
