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
import { normalizeScopedFlags } from "../aliases";
import { runLegacyCommand } from "../commands/legacy";
import { runValidateCommand } from "../commands/validate";
import { runCloseCommand } from "../commands/workbench";
import { resolveCanonicalAction } from "../core/operation-context";
import { rebuildProjectIndexes } from "../services/local-state/project-indexes";
import { resolveWorkbenchEventLogPath } from "../services/local-state/workbench-events";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
import {
	admitsLegacyEvidenceIssue,
	applyLegacyEvidenceAdmissions,
	LEGACY_EVIDENCE_BASELINE_FILE,
	validLegacyEvidenceBaseline,
} from "../services/project/legacy-evidence-baseline";
import { legacyReconcileSession } from "../services/project/legacy-reconcile";
import { closeSession, isSessionClosed } from "../services/workbench/lifecycle";

const CUTOFF = "260712_0000";

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
	const root = mkdtempSync(join(tmpdir(), "legacy-reconcile-"));
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
			project: { name: "legacy-reconcile-fixture" },
		}),
		"utf8",
	);
	writeFileSync(
		join(agentsDir, "lock.json"),
		JSON.stringify({
			schema_version: 1,
			revision: "abc123",
			project: "legacy-reconcile-fixture",
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

function sessionDir(root: string, session: string): string {
	return join(root, ".afol", "wb", session);
}

/**
 * Pre-cutoff, OPEN session whose State Board rows are all `done` but which
 * carries NO authorizing evidence ledger (or only the provided lines), so a
 * strict verify reports missing_evidence and a plain close would fail.
 * Hand-arranged: newWorkstream always stamps the current (post-cutoff) date,
 * so the pre-cutoff fixture cannot come from lifecycle helpers.
 */
function writeOpenAllDoneSession(
	root: string,
	session: string,
	rows: readonly string[],
	options?: { evidenceLines?: readonly string[] },
): string {
	const dir = sessionDir(root, session);
	mkdirSync(dir, { recursive: true });
	const taskPath = join(dir, `${session}_task_01.md`);
	writeFileSync(
		taskPath,
		[
			"---",
			'doc_type: "workbench_task"',
			`id: "${session}_task_01"`,
			`session_id: "${session}"`,
			'status: "active"',
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
			join(dir, ".evidence.jsonl"),
			`${options.evidenceLines.join("\n")}\n`,
			"utf8",
		);
	}
	return taskPath;
}

/** Already-closed pre-cutoff session with a canonical close record. */
function writeClosedAllDoneSession(
	root: string,
	session: string,
	rows: readonly string[],
): string {
	const dir = sessionDir(root, session);
	mkdirSync(dir, { recursive: true });
	const taskPath = join(dir, `${session}_task_01.md`);
	writeFileSync(
		taskPath,
		[
			"---",
			'doc_type: "workbench_task"',
			`id: "${session}_task_01"`,
			`session_id: "${session}"`,
			'status: "closed"',
			'closed_at: "2026-07-01T09:00:00.000Z"',
			'updated_at: "2026-07-01T09:00:00.000Z"',
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
	return taskPath;
}

async function captureLegacy(
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
		const code = await runLegacyCommand(["reconcile", ...args], root);
		return { code, stdout, stderr };
	} finally {
		console.log = previousStdout;
		console.error = previousStderr;
	}
}

async function captureClose(
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
		const code = await runCloseCommand(args, root);
		return { code, stdout, stderr };
	} finally {
		console.log = previousStdout;
		console.error = previousStderr;
	}
}

function baseInput(session: string, confirm: boolean) {
	return {
		sessionId: session,
		reason: "legacy debt",
		issue: "AFOL-123",
		confirm,
	};
}

describe("afol legacy reconcile", () => {
	test("dry-run (no --confirm) writes nothing and returns planned admissions + projected_close", () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-dry";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const result = legacyReconcileSession(root, baseInput(session, false));
			expect(result.status).toBe("preview");
			expect(result.dry_run).toBe(true);
			expect(result.written).toBe(false);
			expect(result.admissions).toHaveLength(1);
			expect(result.admissions[0]).toMatchObject({
				session_id: session,
				task_id: "T-01",
				issue_type: "missing_evidence",
				cutoff_relation: "pre_cutoff",
			});
			expect(result.projected_close).toEqual({ all_issues_admitted: true });
			expect(existsSync(baselinePath(root))).toBe(false);
			expect(isSessionClosed(root, session)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--confirm on an eligible pre-cutoff all-done session writes admissions AND closes", () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-confirm";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const result = legacyReconcileSession(root, baseInput(session, true));
			expect(result.status).toBe("reconciled");
			expect(result.dry_run).toBe(false);
			expect(result.written).toBe(true);
			expect(isSessionClosed(root, session)).toBe(true);
			expect(existsSync(baselinePath(root))).toBe(true);
			const baseline = JSON.parse(readFileSync(baselinePath(root), "utf8")) as {
				admissions: Array<Record<string, unknown>>;
			};
			expect(baseline.admissions).toEqual([
				expect.objectContaining({
					session_id: session,
					task_id: "T-01",
					issue_type: "missing_evidence",
					cutoff_relation: "pre_cutoff",
					approval: "legacy debt (issue: AFOL-123)",
				}),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses a post-cutoff session with the exact message", () => {
		const root = createFixture();
		const session = "260803_1200_reconcile-post";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | current task |",
			]);
			rebuildIndexes(root);
			expect(() =>
				legacyReconcileSession(root, baseInput(session, true)),
			).toThrow(
				`Session ${session} is not pre-cutoff (cutoff ${CUTOFF}); refuse legacy reconcile.`,
			);
			expect(existsSync(baselinePath(root))).toBe(false);
			expect(isSessionClosed(root, session)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses a session with open tasks", () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-open";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | finished task |",
				"| T-02 | in_progress | worker | still running |",
			]);
			rebuildIndexes(root);
			expect(() =>
				legacyReconcileSession(root, baseInput(session, true)),
			).toThrow(/still has 1 open task/);
			expect(existsSync(baselinePath(root))).toBe(false);
			expect(isSessionClosed(root, session)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses an already-closed session", () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-closed";
		try {
			writeClosedAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			expect(() =>
				legacyReconcileSession(root, baseInput(session, true)),
			).toThrow(/already closed/);
			expect(existsSync(baselinePath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses when only invalid_evidence issues exist", () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-invalid";
		try {
			writeOpenAllDoneSession(
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
							verification_run_id: "run-does-not-exist",
						}),
					],
				},
			);
			rebuildIndexes(root);
			expect(() =>
				legacyReconcileSession(root, baseInput(session, true)),
			).toThrow(/invalid_evidence which cannot be admitted/);
			expect(existsSync(baselinePath(root))).toBe(false);
			expect(isSessionClosed(root, session)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses missing --reason", async () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-noreason";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const result = await captureLegacy(root, [
				"--session",
				session,
				"--issue",
				"AFOL-123",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(/reason/i);
			expect(existsSync(baselinePath(root))).toBe(false);
			expect(isSessionClosed(root, session)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses missing --issue", async () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-noissue";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const result = await captureLegacy(root, [
				"--session",
				session,
				"--reason",
				"legacy debt",
				"--confirm",
			]);
			expect(result.code).toBe(2);
			expect(result.stderr.join("\n")).toMatch(/issue/i);
			expect(existsSync(baselinePath(root))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("command --confirm emits a reconciled envelope and closes", async () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-cmd";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const result = await captureLegacy(root, [
				"--session",
				session,
				"--reason",
				"legacy debt",
				"--issue",
				"AFOL-123",
				"--confirm",
				"--json",
			]);
			expect(result.code).toBe(0);
			const payload = JSON.parse(result.stdout[0] ?? "{}") as {
				data?: {
					status?: string;
					session?: string;
					dry_run?: boolean;
					written?: boolean;
				};
			};
			expect(payload.data?.status).toBe("reconciled");
			expect(payload.data?.session).toBe(session);
			expect(payload.data?.dry_run).toBe(false);
			expect(payload.data?.written).toBe(true);
			expect(isSessionClosed(root, session)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("after --confirm the validate gate waives every admitted issue", async () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-gate";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const result = legacyReconcileSession(root, baseInput(session, true));
			expect(result.status).toBe("reconciled");
			const baseline = validLegacyEvidenceBaseline(root);
			expect(baseline).not.toBeNull();
			const dir = sessionDir(root, session);
			const taskPath = join(dir, `${session}_task_01.md`);
			for (const admission of result.admissions) {
				expect(
					admitsLegacyEvidenceIssue(
						baseline,
						dir,
						{
							type: admission.issue_type,
							taskId: admission.task_id,
							file: taskPath,
						},
						false,
					),
				).toBe(true);
			}
			// The reconcile closed the session after the fixture index build;
			// refresh so the workbench index snapshot is not stale for validate.
			rebuildIndexes(root);
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

	test("reconciling again refuses (already closed) without duplicating admissions", () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-idem";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			expect(
				legacyReconcileSession(root, baseInput(session, true)).status,
			).toBe("reconciled");
			const before = JSON.parse(readFileSync(baselinePath(root), "utf8")) as {
				admissions: unknown[];
			};
			expect(() =>
				legacyReconcileSession(root, baseInput(session, true)),
			).toThrow(/already closed/);
			const after = JSON.parse(readFileSync(baselinePath(root), "utf8")) as {
				admissions: unknown[];
			};
			expect(after.admissions).toHaveLength(before.admissions.length);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("close failure after baseline write reports baseline_written_close_failed and a retry close succeeds", () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-atomic";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const eventPath = resolveWorkbenchEventLogPath(root);
			rmSync(eventPath, { force: true });
			mkdirSync(eventPath, { recursive: true });

			const result = legacyReconcileSession(root, baseInput(session, true));
			expect(result.status).toBe("baseline_written_close_failed");
			expect(result.written).toBe(true);
			expect(result.baseline_path).toBe(baselinePath(root));
			expect(result.close?.error ?? "").toContain("EVENT_LEDGER_UNREADABLE");
			expect(existsSync(baselinePath(root))).toBe(true);
			expect(isSessionClosed(root, session)).toBe(false);

			rmSync(eventPath, { recursive: true, force: true });
			expect(() =>
				closeSession(root, session, { admitLegacyBaseline: true }),
			).not.toThrow();
			expect(isSessionClosed(root, session)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("retry close --admit-legacy-baseline succeeds after baseline_written_close_failed while plain close stays strict", async () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-retry-cli";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const eventPath = resolveWorkbenchEventLogPath(root);
			rmSync(eventPath, { force: true });
			mkdirSync(eventPath, { recursive: true });

			const result = legacyReconcileSession(root, baseInput(session, true));
			expect(result.status).toBe("baseline_written_close_failed");
			expect(result.written).toBe(true);
			expect(result.baseline_path).toBe(baselinePath(root));
			expect(existsSync(baselinePath(root))).toBe(true);
			expect(isSessionClosed(root, session)).toBe(false);

			rmSync(eventPath, { recursive: true, force: true });

			// Plain close stays strict: admitted debt still blocks without the flag.
			const strict = await captureClose(root, ["--session", session]);
			expect(strict.code).toBe(2);
			expect(strict.stderr.join("\n")).toMatch(/failed strict verification/);
			expect(isSessionClosed(root, session)).toBe(false);

			// The documented retry closes the session via the CLI flag.
			const retry = await captureClose(root, [
				"--session",
				session,
				"--admit-legacy-baseline",
			]);
			expect(retry.code).toBe(0);
			expect(retry.stdout.join("\n")).toContain("session closed:");
			expect(isSessionClosed(root, session)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolveCanonicalAction maps legacy reconcile confirm/preview", () => {
		expect(
			resolveCanonicalAction({
				kind: "legacy",
				args: [
					"reconcile",
					"--session",
					"260701_0800_x",
					"--reason",
					"r",
					"--issue",
					"i",
				],
			}),
		).toEqual({ action: "legacy.reconcile.preview", sideEffect: "preview" });
		expect(
			resolveCanonicalAction({
				kind: "legacy",
				args: ["reconcile", "--confirm", "--session", "260701_0800_x"],
			}),
		).toEqual({ action: "legacy.reconcile", sideEffect: "write" });
		expect(
			resolveCanonicalAction({
				kind: "legacy",
				args: [
					"reconcile",
					"--confirm",
					"--dry-run",
					"--session",
					"260701_0800_x",
				],
			}),
		).toEqual({ action: "legacy.reconcile.preview", sideEffect: "preview" });
	});

	test("legacy scoped flag aliases normalize to the long forms the parser reads", () => {
		expect(
			normalizeScopedFlags("legacy", [
				"reconcile",
				"-S",
				"260701_0800_x",
				"-r",
				"reason",
				"-m",
				"summary",
				"-T",
				"T-01",
				"-D",
				"-j",
			]),
		).toEqual([
			"reconcile",
			"--session",
			"260701_0800_x",
			"--reason",
			"reason",
			"--summary",
			"summary",
			"--task-id",
			"T-01",
			"--dry-run",
			"--json",
		]);
	});

	test("applyLegacyEvidenceAdmissions requireClosed gate: true refuses an open session, false keeps the atomic reconcile preview", () => {
		const root = createFixture();
		const session = "260701_0800_reconcile-gate";
		try {
			writeOpenAllDoneSession(root, session, [
				"| T-01 | done | worker | historical task |",
			]);
			rebuildIndexes(root);
			const input = {
				sessionId: session,
				allMissing: true,
				reason: "legacy debt",
				confirm: false,
			};
			// Normal evidence admit contract: the shared core refuses an open
			// session when requireClosed is true.
			expect(() =>
				applyLegacyEvidenceAdmissions(root, input, {
					requireClosed: true,
				}),
			).toThrow(/not closed/);
			// Legacy reconcile opt-in: the same open session is admit-able when
			// requireClosed is false (the atomic admit+close path).
			const preview = applyLegacyEvidenceAdmissions(root, input, {
				requireClosed: false,
			});
			expect(preview.dry_run).toBe(true);
			expect(preview.admissions).toHaveLength(1);
			expect(existsSync(baselinePath(root))).toBe(false);
			expect(isSessionClosed(root, session)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
