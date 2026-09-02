import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFeedbackCommand } from "../commands/feedback";
import {
	annotateFeedback,
	feedbackStatus,
	getFeedback,
	listFeedback,
	openFeedbackDb,
	recordFeedback,
	resolveFeedbackDbPath,
} from "../services/feedback";
import { removeTestRoot } from "./windows-test-support";

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
						"token=never-print\u001b]0;spoofed",
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
			expect(captured.stdout[0]).not.toContain("\u001b");
			expect(captured.stdout[0]).toContain("[REDACTED]");
		} finally {
			removeTestRoot(root);
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
			removeTestRoot(root);
		}
	});

	test("redacts additional sensitive keys in metadata and free text", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-sensitive-"));
		try {
			const report = recordFeedback(
				{
					message: "passphrase=open-sesame jwt=header.payload.signature",
					metadata: {
						pwd: "password-value",
						salt: "salt-value",
						cert: "certificate-value",
						jwt: "jwt-value",
						safe: "keep",
					},
				},
				env(root),
			);
			const serialized = JSON.stringify(report);
			for (const secret of [
				"open-sesame",
				"header.payload.signature",
				"password-value",
				"salt-value",
				"certificate-value",
				"jwt-value",
			]) {
				expect(serialized).not.toContain(secret);
			}
			expect(serialized).toContain("keep");
		} finally {
			removeTestRoot(root);
		}
	});

	test("value flags reject a following short flag", async () => {
		const captured = capture();
		expect(
			await runFeedbackCommand("last", ["--note", "-j"], captured.io),
		).toBe(2);
		expect([...captured.stdout, ...captured.stderr].join("\n")).toContain(
			"Missing value for --note.",
		);
	});

	test("missing explicit annotation ids reach the friendly CLI error", async () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-missing-note-"));
		const previousHome = process.env.AFOL_STATE_HOME;
		try {
			expect(annotateFeedback("FB-missing", "note", env(root))).toBeNull();
			process.env.AFOL_STATE_HOME = root;
			const captured = capture();
			expect(
				await runFeedbackCommand(
					"annotate",
					["--id", "FB-missing", "--note", "note", "--mode", "local", "--json"],
					captured.io,
				),
			).toBe(2);
			expect(captured.stdout[0]).toContain(
				"No feedback report available to annotate.",
			);
			expect(captured.stdout[0]).not.toContain("FOREIGN KEY");
		} finally {
			if (previousHome === undefined) delete process.env.AFOL_STATE_HOME;
			else process.env.AFOL_STATE_HOME = previousHome;
			removeTestRoot(root);
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
			removeTestRoot(root);
		}
	});

	test("unknown actions return a structured command error", async () => {
		const captured = capture();
		expect(await runFeedbackCommand("unknown", [], captured.io)).toBe(2);
		const payload = JSON.parse(captured.stdout[0] ?? "{}");
		expect(payload.schema).toBe("afol.result/v1");
		expect(payload.ok).toBe(false);
	});

	test("invalid feedback arguments never reflect attacker-controlled values", async () => {
		const captured = capture();
		const sentinel = "TOP_SECRET_SENTINEL";
		expect(
			await runFeedbackCommand(
				"status",
				["--metadata", `{"broken":"${sentinel}`],
				captured.io,
			),
		).toBe(2);
		expect(captured.stdout[0]).not.toContain(sentinel);
		const unknown = capture();
		expect(await runFeedbackCommand("status", [sentinel], unknown.io)).toBe(2);
		expect(unknown.stdout[0]).not.toContain(sentinel);
	});

	test("invalid metadata distinguishes malformed JSON from non-object values", async () => {
		const malformed = capture();
		expect(
			await runFeedbackCommand("status", ["--metadata", "{"], malformed.io),
		).toBe(2);
		expect(malformed.stdout[0]).toContain("Invalid --metadata JSON.");

		const nonObject = capture();
		expect(
			await runFeedbackCommand("status", ["--metadata", "[]"], nonObject.io),
		).toBe(2);
		expect(nonObject.stdout[0]).toContain(
			"Invalid --metadata: must be a JSON object.",
		);
	});

	test("read-only local feedback queries do not initialize absent storage", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-read-only-"));
		try {
			const local = env(root);
			expect(feedbackStatus(local)).toMatchObject({
				mode: "local",
				enabled: true,
				count: 0,
			});
			expect(listFeedback(10, local)).toEqual([]);
			expect(getFeedback("FB-missing", local)).toBeNull();
			expect(existsSync(resolveFeedbackDbPath(local))).toBe(false);
		} finally {
			removeTestRoot(root);
		}
	});

	test("read-only local feedback queries fail on invalid db payload", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-corrupt-db-"));
		try {
			const local = env(root);
			const dbPath = resolveFeedbackDbPath(local);
			writeFileSync(dbPath, "not-a-sqlite-db", "utf8");
			expect(() => feedbackStatus(local)).toThrow("file is not a database");
			expect(() => listFeedback(10, local)).toThrow("file is not a database");
			expect(() => getFeedback("FB-missing", local)).toThrow(
				"file is not a database",
			);
		} finally {
			removeTestRoot(root);
		}
	});

	test("invalid metadata JSON is surfaced as malformed metadata", () => {
		const root = mkdtempSync(
			join(tmpdir(), "afol-feedback-malformed-metadata-"),
		);
		try {
			const local = env(root);
			const report = recordFeedback({ message: "ok" }, local);
			expect(report).not.toBeNull();
			if (!report) throw new Error("expected feedback report");
			const db = openFeedbackDb(local);
			db.prepare("UPDATE feedback_reports SET metadata_json = '1'").run();
			db.close();
			const reloaded = getFeedback(report.report_id, local);
			expect(reloaded?.metadata).toEqual({ malformed: true });
		} finally {
			removeTestRoot(root);
		}
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
			removeTestRoot(root);
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
			removeTestRoot(root);
		}
	});

	test("permanent SQLite errors with lock text are returned directly", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-feedback-lock-failure-"));
		try {
			const local = env(root);
			const db = openFeedbackDb(local);
			db.exec(
				"CREATE TRIGGER reject_feedback_locked BEFORE INSERT ON feedback_reports BEGIN SELECT RAISE(ABORT, 'database is locked'); END;",
			);
			db.close();
			expect(() =>
				recordFeedback({ kind: "error", message: "should fail" }, local),
			).toThrow("database is locked");
		} finally {
			removeTestRoot(root);
		}
	});
});
