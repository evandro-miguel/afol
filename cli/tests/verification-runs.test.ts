import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	doneTask,
	newWorkstream,
	prepareVerificationRun,
	recordEvidence,
	recordVerificationRunStep,
	startTask,
	taskAttemptSnapshot,
	transitionTask,
} from "../services/workbench/lifecycle";
import {
	appendVerificationRunStart,
	appendVerificationRunStep,
	appendVerificationRunTerminal,
	fsyncDirectoryIfSupported,
	readVerificationRunLedger,
	reconcileVerificationEvidenceOrphans,
	type VerificationRunStartRecord,
	verificationCommandDigest,
	verificationRunRecordsAuthorize,
	verificationRunsPath,
} from "../services/workbench/verification-runs";
import { verifyWorkbenchTasks } from "../services/workbench/verify";

function root(name: string): string {
	return mkdtempSync(join(tmpdir(), `verification-runs-${name}-`));
}

describe("verification run ledger", () => {
	test("skips only the unsupported Windows directory fsync", () => {
		const projectRoot = root("fsync-platform");
		try {
			const missingDirectory = join(projectRoot, "missing");
			expect(() =>
				fsyncDirectoryIfSupported(missingDirectory, "win32"),
			).not.toThrow();
			expect(() =>
				fsyncDirectoryIfSupported(missingDirectory, "linux"),
			).toThrow();
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("reconciles evidence-first orphan and authorizes only a complete terminal run", () => {
		const projectRoot = root("orphan");
		try {
			const created = newWorkstream(projectRoot, "orphan recovery");
			startTask(projectRoot, { session: created.session, taskId: "T-01" });
			const command = "bun test";
			const digest = verificationCommandDigest(command);
			const run: VerificationRunStartRecord = {
				record_type: "start",
				verification_run_id: "VR-test-orphan",
				task_id: "T-01",
				task_attempt: 1,
				verification_attempt: 1,
				step_count: 1,
				commands: [{ step_index: 1, command_digest: digest }],
				created_at: new Date().toISOString(),
			};
			appendVerificationRunStart(projectRoot, created.session, run, () => {});
			const evidence = recordEvidence(projectRoot, {
				session: created.session,
				taskId: "T-01",
				command,
				result: "passed",
				exitCode: 0,
				provenance: "observed",
				verification: {
					runId: run.verification_run_id,
					taskAttempt: 1,
					verificationAttempt: 1,
					stepIndex: 1,
					stepCount: 1,
					status: "passed",
					durationMs: 1,
				},
			});

			expect(() =>
				doneTask(projectRoot, { session: created.session, taskId: "T-01" }),
			).toThrow("complete matching verification run");
			reconcileVerificationEvidenceOrphans(
				projectRoot,
				created.session,
				run,
				() => {},
			);
			appendVerificationRunTerminal(
				projectRoot,
				created.session,
				{
					record_type: "terminal",
					verification_run_id: run.verification_run_id,
					task_id: "T-01",
					task_attempt: 1,
					verification_attempt: 1,
					status: "passed",
					evidence_ids: [evidence.id],
					evidence_count: 1,
					authorizing_evidence_id: evidence.id,
					created_at: new Date().toISOString(),
				},
				() => {},
			);
			transitionTask(projectRoot, {
				session: created.session,
				taskId: "T-01",
				state: "implemented_untested",
			});
			transitionTask(projectRoot, {
				session: created.session,
				taskId: "T-01",
				state: "tested_needs_spec_validation",
			});
			expect(
				doneTask(projectRoot, { session: created.session, taskId: "T-01" })
					.authorizingEvidenceId,
			).toBe(evidence.id);
			const steps = readVerificationRunLedger(
				projectRoot,
				created.session,
			).filter((record) => record.record_type === "step");
			expect(steps).toHaveLength(1);
			writeFileSync(
				verificationRunsPath(projectRoot, created.session),
				`${JSON.stringify(run)}\n`,
			);
			const strict = verifyWorkbenchTasks(created.sessionDir, true);
			expect(strict.allCompleted).toBeFalse();
			expect(strict.issues).toContainEqual(
				expect.objectContaining({
					type: "invalid_evidence",
					message: expect.stringContaining(
						"complete matching verification run",
					),
				}),
			);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("enforces unique run step identity and exactly one terminal", () => {
		const projectRoot = root("unique");
		try {
			const created = newWorkstream(projectRoot, "unique run records");
			const digest = verificationCommandDigest("true");
			const run: VerificationRunStartRecord = {
				record_type: "start",
				verification_run_id: "VR-test-unique",
				task_id: "T-01",
				task_attempt: 0,
				verification_attempt: 1,
				step_count: 1,
				commands: [{ step_index: 1, command_digest: digest }],
				created_at: new Date().toISOString(),
			};
			appendVerificationRunStart(projectRoot, created.session, run, () => {});
			const step = {
				record_type: "step" as const,
				verification_run_id: run.verification_run_id,
				task_id: "T-01",
				task_attempt: 0,
				verification_attempt: 1,
				step_index: 1,
				step_count: 1,
				command_digest: digest,
				evidence_id: "E-1",
				status: "passed" as const,
				exit_code: 0,
				duration_ms: 1,
				created_at: new Date().toISOString(),
			};
			appendVerificationRunStep(projectRoot, created.session, step, () => {});
			appendVerificationRunStep(projectRoot, created.session, step, () => {});
			expect(() =>
				appendVerificationRunStep(
					projectRoot,
					created.session,
					{ ...step, evidence_id: "E-2" },
					() => {},
				),
			).toThrow("Duplicate verification run step");
			const terminal = {
				record_type: "terminal" as const,
				verification_run_id: run.verification_run_id,
				task_id: "T-01",
				task_attempt: 0,
				verification_attempt: 1,
				status: "passed" as const,
				evidence_ids: ["E-1"],
				evidence_count: 1,
				authorizing_evidence_id: "E-1",
				created_at: new Date().toISOString(),
			};
			expect(
				verificationRunRecordsAuthorize(
					[
						run,
						step,
						{
							...terminal,
							evidence_ids: ["E-cross-run"],
							authorizing_evidence_id: "E-cross-run",
						},
					],
					"T-01",
					0,
					"E-cross-run",
					run.verification_run_id,
				),
			).toBeFalse();
			appendVerificationRunTerminal(
				projectRoot,
				created.session,
				terminal,
				() => {},
			);
			appendVerificationRunTerminal(
				projectRoot,
				created.session,
				{ ...terminal, status: "failed" },
				() => {},
			);
			const terminals = readVerificationRunLedger(
				projectRoot,
				created.session,
			).filter((record) => record.record_type === "terminal");
			expect(terminals).toHaveLength(1);
			expect(terminals[0]).toMatchObject({ status: "passed" });
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("rejects a task that becomes ineligible before step persistence", () => {
		const projectRoot = root("stale-state");
		try {
			const created = newWorkstream(projectRoot, "stale task state");
			startTask(projectRoot, { session: created.session, taskId: "T-01" });
			const command = "bun test";
			const prepared = prepareVerificationRun(
				projectRoot,
				{
					session: created.session,
					taskId: "T-01",
					taskAttemptSnapshot: taskAttemptSnapshot(projectRoot, {
						session: created.session,
						taskId: "T-01",
					}),
					commands: [command],
				},
				{ fencingCheck: () => {} },
			);
			expect(prepared.kind).toBe("new");
			if (prepared.kind !== "new") throw new Error("expected new run");
			transitionTask(projectRoot, {
				session: created.session,
				taskId: "T-01",
				state: "moved",
			});
			expect(() =>
				recordVerificationRunStep(
					projectRoot,
					{
						session: created.session,
						taskId: "T-01",
						run: prepared.run,
						stepIndex: 1,
						command,
						status: "passed",
						exitCode: 0,
						durationMs: 1,
					},
					{ fencingCheck: () => {} },
				),
			).toThrow("became ineligible");
			expect(
				readVerificationRunLedger(projectRoot, created.session).filter(
					(record) => record.record_type === "step",
				),
			).toHaveLength(0);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("checks fencing before an intermediate task-state write", () => {
		const projectRoot = root("transition-fence");
		try {
			const created = newWorkstream(projectRoot, "transition fence");
			startTask(projectRoot, { session: created.session, taskId: "T-01" });
			expect(() =>
				transitionTask(
					projectRoot,
					{
						session: created.session,
						taskId: "T-01",
						state: "implemented_untested",
					},
					{
						fencingCheck: () => {
							throw new Error("fence lost");
						},
					},
				),
			).toThrow("fence lost");
			const verification = verifyWorkbenchTasks(created.sessionDir);
			expect(verification.openTasks).toContainEqual(
				expect.objectContaining({ id: "T-01", state: "in_progress" }),
			);
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});

	test("does not recover a passed run from an older task attempt", () => {
		const projectRoot = root("old-attempt");
		try {
			const created = newWorkstream(projectRoot, "old attempt run");
			startTask(projectRoot, { session: created.session, taskId: "T-01" });
			const oldAttempt = taskAttemptSnapshot(projectRoot, {
				session: created.session,
				taskId: "T-01",
			});
			const digest = verificationCommandDigest("true");
			const oldRun: VerificationRunStartRecord = {
				record_type: "start",
				verification_run_id: "VR-old-attempt",
				task_id: "T-01",
				task_attempt: oldAttempt,
				verification_attempt: 1,
				step_count: 1,
				commands: [{ step_index: 1, command_digest: digest }],
				created_at: new Date().toISOString(),
			};
			appendVerificationRunStart(
				projectRoot,
				created.session,
				oldRun,
				() => {},
			);
			appendVerificationRunStep(
				projectRoot,
				created.session,
				{
					record_type: "step",
					verification_run_id: oldRun.verification_run_id,
					task_id: "T-01",
					task_attempt: oldAttempt,
					verification_attempt: 1,
					step_index: 1,
					step_count: 1,
					command_digest: digest,
					evidence_id: "E-old-attempt",
					status: "passed",
					exit_code: 0,
					duration_ms: 1,
					created_at: new Date().toISOString(),
				},
				() => {},
			);
			appendVerificationRunTerminal(
				projectRoot,
				created.session,
				{
					record_type: "terminal",
					verification_run_id: oldRun.verification_run_id,
					task_id: "T-01",
					task_attempt: oldAttempt,
					verification_attempt: 1,
					status: "passed",
					evidence_ids: ["E-old-attempt"],
					evidence_count: 1,
					authorizing_evidence_id: "E-old-attempt",
					created_at: new Date().toISOString(),
				},
				() => {},
			);
			transitionTask(projectRoot, {
				session: created.session,
				taskId: "T-01",
				state: "problem",
			});
			transitionTask(projectRoot, {
				session: created.session,
				taskId: "T-01",
				state: "in_progress",
			});
			const currentAttempt = taskAttemptSnapshot(projectRoot, {
				session: created.session,
				taskId: "T-01",
			});
			expect(currentAttempt).toBeGreaterThan(oldAttempt);
			const prepared = prepareVerificationRun(
				projectRoot,
				{
					session: created.session,
					taskId: "T-01",
					taskAttemptSnapshot: currentAttempt,
					commands: ["true"],
				},
				{ fencingCheck: () => {} },
			);
			expect(prepared.kind).toBe("new");
			if (prepared.kind === "new") {
				expect(prepared.run.task_attempt).toBe(currentAttempt);
				expect(prepared.run.verification_attempt).toBe(2);
			}
		} finally {
			rmSync(projectRoot, { recursive: true, force: true });
		}
	});
});
