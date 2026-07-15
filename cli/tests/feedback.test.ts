import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFeedbackCommand } from "../commands/feedback";
import {
	annotateFeedback,
	feedbackStatus,
	listFeedback,
	openFeedbackDb,
	recordFeedback,
	resolveFeedbackDbPath,
} from "../services/feedback";

function capture() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (value: string) => stdout.push(value),
			stderr: (value: string) => stderr.push(value),
		},
	};
}

function env(root: string, mode: "off" | "local" = "local"): NodeJS.ProcessEnv {
	return { ...process.env, AFOL_STATE_HOME: root, AFOL_FEEDBACK_MODE: mode };
}

describe("offline feedback backend", () => {
	test("off mode is side-effect free and preview redacts before output", async () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-off-"));
		try {
			const disabled = env(root, "off");
			expect(
				recordFeedback(
					{ message: "token=never-persist", metadata: { token: "secret" } },
					disabled,
				),
			).toBeNull();
			expect(existsSync(resolveFeedbackDbPath(disabled))).toBe(false);
			const previousMode = process.env.AFOL_FEEDBACK_MODE;
			const previousHome = process.env.AFOL_STATE_HOME;
			process.env.AFOL_FEEDBACK_MODE = "off";
			process.env.AFOL_STATE_HOME = root;
			const captured = capture();
			expect(
				await runFeedbackCommand(
					"preview",
					[
						"--message",
						"token=never-print",
						"--stack",
						"Authorization: Bearer abc",
						"--json",
					],
					captured.io,
				),
			).toBe(0);
			if (previousMode === undefined) delete process.env.AFOL_FEEDBACK_MODE;
			else process.env.AFOL_FEEDBACK_MODE = previousMode;
			if (previousHome === undefined) delete process.env.AFOL_STATE_HOME;
			else process.env.AFOL_STATE_HOME = previousHome;
			expect(captured.stdout[0]).not.toContain("never-print");
			expect(captured.stdout[0]).not.toContain("Bearer abc");
			expect(captured.stdout[0]).toContain("[REDACTED]");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("local records are redacted, WAL-backed, and last-note is idempotent", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-local-"));
		try {
			const local = env(root);
			const report = recordFeedback(
				{
					kind: "error",
					message: "password=hunter2",
					stack: "Bearer abc",
					metadata: { token: "abc", env: { HOME: "/secret" }, safe: "ok" },
				},
				local,
			);
			expect(report).not.toBeNull();
			expect(JSON.stringify(report)).not.toContain("hunter2");
			expect(JSON.stringify(report)).not.toContain("/secret");
			expect(existsSync(resolveFeedbackDbPath(local))).toBe(true);
			const db = openFeedbackDb(local);
			expect(
				(db.query("PRAGMA journal_mode").get() as { journal_mode?: string })
					.journal_mode,
			).toBe("wal");
			db.close();
			const first = annotateFeedback("last", "note=keep", local);
			const second = annotateFeedback("last", "note=keep", local);
			expect(first?.last_note).toBe("note=keep");
			expect(second?.last_note).toBe(first?.last_note);
			expect(listFeedback(10, local)).toHaveLength(1);
			expect(feedbackStatus(local).count).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("command supports last-note and guarded purge", async () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-command-"));
		try {
			const local = env(root);
			const report = recordFeedback({ message: "failed" }, local);
			expect(report).not.toBeNull();
			const previousMode = process.env.AFOL_FEEDBACK_MODE;
			const previousHome = process.env.AFOL_STATE_HOME;
			process.env.AFOL_FEEDBACK_MODE = "local";
			process.env.AFOL_STATE_HOME = root;
			const noted = capture();
			expect(
				await runFeedbackCommand("last", ["-m", "fixed", "--json"], noted.io),
			).toBe(0);
			expect(noted.stdout[0]).toContain('"last_note":"fixed"');
			const unsafe = capture();
			expect(
				await runFeedbackCommand("purge", ["--all", "--json"], unsafe.io),
			).toBe(2);
			expect(unsafe.stdout[0]).toContain("requires --confirm");
			const safe = capture();
			expect(
				await runFeedbackCommand(
					"purge",
					["--all", "--confirm", "--json"],
					safe.io,
				),
			).toBe(0);
			expect(listFeedback(10, local)).toHaveLength(0);
			if (previousMode === undefined) delete process.env.AFOL_FEEDBACK_MODE;
			else process.env.AFOL_FEEDBACK_MODE = previousMode;
			if (previousHome === undefined) delete process.env.AFOL_STATE_HOME;
			else process.env.AFOL_STATE_HOME = previousHome;
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("unknown actions return a structured command error", async () => {
		const captured = capture();
		expect(await runFeedbackCommand("unknown", [], captured.io)).toBe(2);
		const payload = JSON.parse(captured.stdout[0] ?? "{}");
		expect(payload.schema).toBe("afol.result/v1");
		expect(payload.ok).toBe(false);
	});

	test("multiprocess writers complete without lost reports", async () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-contention-"));
		try {
			const modulePath = join(process.cwd(), "cli/services/feedback/index.ts");
			const script = `import { recordFeedback } from ${JSON.stringify(modulePath)}; recordFeedback({kind:"worker", message:process.argv[1]}, process.env);`;
			const workers = Array.from({ length: 8 }, (_, index) =>
				Bun.spawn(["bun", "-e", script, `worker-${index}`], {
					env: {
						...process.env,
						AFOL_STATE_HOME: root,
						AFOL_FEEDBACK_MODE: "local",
					},
				}),
			);
			const statuses = await Promise.all(
				workers.map((worker) => worker.exited),
			);
			expect(statuses).toEqual(Array.from({ length: 8 }, () => 0));
			expect(listFeedback(100, env(root))).toHaveLength(8);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("failed insert rolls back atomically and allows recovery", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-fault-"));
		try {
			const local = env(root);
			const db = openFeedbackDb(local);
			db.exec(
				"CREATE TRIGGER reject_feedback BEFORE INSERT ON feedback_reports BEGIN SELECT RAISE(ABORT, 'injected fault'); END;",
			);
			db.close();
			expect(() =>
				recordFeedback({ message: "should rollback" }, local),
			).toThrow("injected fault");
			expect(listFeedback(10, local)).toHaveLength(0);
			const recoveryDb = openFeedbackDb(local);
			recoveryDb.exec("DROP TRIGGER reject_feedback");
			recoveryDb.close();
			expect(recordFeedback({ message: "recovered" }, local)).not.toBeNull();
			expect(listFeedback(10, local)).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
