import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureDiagnostic } from "../core/diagnostic";
import { envelopeErr, stringifyEnvelope } from "../core/envelope";
import { runWithDiagnostics } from "../main";
import { listFeedback, resolveFeedbackDbPath } from "../services/feedback";

function env(root: string, mode: "off" | "local"): NodeJS.ProcessEnv {
	return { ...process.env, AFOL_STATE_HOME: root, AFOL_FEEDBACK_MODE: mode };
}

describe("unexpected and integrity diagnostic boundary", () => {
	test("invocation boundary emits a generic JSON error with a report id", async () => {
		const root = mkdtempSync(join(tmpdir(), "afol-diagnostic-boundary-"));
		const previousMode = process.env.AFOL_FEEDBACK_MODE;
		const previousHome = process.env.AFOL_STATE_HOME;
		const stdout: string[] = [];
		const log = console.log;
		try {
			process.env.AFOL_FEEDBACK_MODE = "local";
			process.env.AFOL_STATE_HOME = root;
			console.log = (value?: unknown) => stdout.push(String(value));
			const exitCode = await runWithDiagnostics(
				["bun", "afol", "validate", "--json"],
				async () => {
					throw new Error("unexpected password=hunter2");
				},
			);
			expect(exitCode).toBe(1);
			const payload = JSON.parse(stdout[0] ?? "{}");
			expect(payload.error).toEqual({
				code: "UNEXPECTED_ERROR",
				message: "Unexpected command failure.",
			});
			expect(payload.diagnostic.kind).toBe("unexpected");
			expect(payload.diagnostic.report_id).toMatch(/^FB-[0-9]+-/);
			expect(payload.diagnostic.persisted).toBe(true);
			expect(stdout[0]).not.toContain("hunter2");
		} finally {
			console.log = log;
			if (previousMode === undefined) delete process.env.AFOL_FEEDBACK_MODE;
			else process.env.AFOL_FEEDBACK_MODE = previousMode;
			if (previousHome === undefined) delete process.env.AFOL_STATE_HOME;
			else process.env.AFOL_STATE_HOME = previousHome;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("off mode returns a report id without persistence or raw output", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-diagnostic-off-"));
		try {
			const diagnostic = captureDiagnostic(
				new Error("token=secret integrity failure"),
				env(root, "off"),
			);
			expect(diagnostic.kind).toBe("integrity");
			expect(diagnostic.report_id).toMatch(/^FB-[0-9]+-/);
			expect(diagnostic.persisted).toBe(false);
			expect(existsSync(resolveFeedbackDbPath(env(root, "off")))).toBe(false);
			const output = stringifyEnvelope({
				...envelopeErr("integrity-error", "Integrity check failed.", {
					action: "test",
				}),
				diagnostic: {
					kind: diagnostic.kind,
					report_id: diagnostic.report_id,
				},
			});
			expect(output).not.toContain("secret");
			expect(output).toContain(diagnostic.report_id);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("plain object errors keep informative message and integrity classification", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-diagnostic-object-"));
		try {
			const local = env(root, "local");
			const diagnostic = captureDiagnostic(
				{
					name: "IntegrityError",
					code: "integrity_mismatch",
					message: "checksum mismatch detected",
				},
				local,
			);
			expect(diagnostic.kind).toBe("integrity");
			expect(diagnostic.persisted).toBe(true);
			const report = listFeedback(1, local)[0];
			expect(report).not.toBeUndefined();
			expect(report?.message).toContain("checksum mismatch detected");
			expect(report?.kind).toBe("integrity");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("hostile error accessors cannot break diagnostic capture", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-diagnostic-hostile-"));
		try {
			const hostile = {
				get message(): never {
					throw new Error("getter must not escape");
				},
				get code(): never {
					throw new Error("getter must not escape");
				},
				toString(): never {
					throw new Error("string conversion must not escape");
				},
			};
			const diagnostic = captureDiagnostic(hostile, env(root, "local"));
			expect(diagnostic.kind).toBe("unexpected");
			expect(diagnostic.persisted).toBe(true);
			expect(listFeedback(1, env(root, "local"))[0]?.message).toBe(
				"Unknown error",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("positional argv flags do not change outer diagnostic formatting", async () => {
		const stderr: string[] = [];
		const error = console.error;
		try {
			console.error = (value?: unknown) => stderr.push(String(value));
			expect(
				await runWithDiagnostics(
					["bun", "afol", "d", "T-01", "--", "tool", "--json"],
					async () => {
						throw new Error("unexpected");
					},
				),
			).toBe(1);
			expect(stderr).toHaveLength(1);
			expect(stderr[0]).toStartWith("err UNEXPECTED_ERROR");
			expect(stderr[0]).toContain("persisted=no");
		} finally {
			console.error = error;
		}
	});

	test("local persistence uses the same collision-safe report id and redacts", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-diagnostic-local-"));
		try {
			const local = env(root, "local");
			const diagnostic = captureDiagnostic(
				new Error("unexpected password=hunter2"),
				local,
			);
			expect(diagnostic.kind).toBe("unexpected");
			expect(diagnostic.persisted).toBe(true);
			const report = listFeedback(1, local)[0];
			expect(report?.report_id).toBe(diagnostic.report_id);
			expect(JSON.stringify(report)).not.toContain("hunter2");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
