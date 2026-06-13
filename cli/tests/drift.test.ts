import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runValidateCommand } from "../commands/validate";
import {
	checkPstrDrift,
	checkStateDrift,
	runDriftCheck,
} from "../services/drift";
import { rebuildPstrIndex } from "../services/pstr";
import { hydrateSession } from "../services/state/session-state";

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
	const root = mkdtempSync(join(tmpdir(), "drift-validation-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, "cli"), { recursive: true });
	mkdirSync(join(root, "src", "project-template"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "SPECS"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb", "test-session"), { recursive: true });

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
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		JSON.stringify({ schema_version: 1 }),
		"utf8",
	);
	writeFileSync(
		join(root, "cli", "main.ts"),
		"export const cli = true;\n",
		"utf8",
	);
	writeFileSync(
		join(root, "src", "project-template", "index.md"),
		"# Template\n",
		"utf8",
	);
	writeFileSync(
		join(root, "docs", "arc", "SPECS", "INDEX.md"),
		[
			"---",
			"doc_type: specs_index",
			"id: specs_index",
			"status: active",
			"---",
			"",
			"| SPEC ID | Theme | Status | Owner | Links |",
			"|--------:|-------|--------|-------|------|",
			"| spec-a | spec-a | active | owner | |",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, "docs", "arc", "SPECS", "spec-a.md"),
		[
			"---",
			"doc_type: spec",
			"id: spec-a",
			"status: active",
			"---",
			"",
			"# Spec A",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", "test-session", "plan.md"),
		["# Plan", "", "plan body"].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", "test-session", "task.md"),
		[
			"# Tasks",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | pending | worker | first task |",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", "test-session", ".evidence.jsonl"),
		[
			JSON.stringify({
				id: "E-1",
				task_id: "T-01",
				created_at: "2026-06-12T00:00:00.000Z",
				command: "bun test",
				result: "passed",
			}),
			"",
		].join("\n"),
		"utf8",
	);
	rebuildPstrIndex(root);
	hydrateSession(root, "test-session");
	return root;
}

describe("drift validation", () => {
	test("runDriftCheck returns ok when all drift surfaces match", () => {
		const root = createFixture();
		try {
			const report = runDriftCheck(root);
			expect(report.ok).toBe(true);
			expect(report.findings).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkPstrDrift reports stale maps", () => {
		const root = createFixture();
		try {
			writeFileSync(
				join(root, "cli", "main.ts"),
				"export const cli = false;\n",
				"utf8",
			);
			const findings = checkPstrDrift(root);
			expect(
				findings.some(
					(finding) => finding.domain === "pstr" && finding.severity === "warn",
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkStateDrift reports stale hydration", () => {
		const root = createFixture();
		try {
			writeFileSync(
				join(root, ".afol", "wb", "test-session", "task.md"),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | changed |",
					"",
				].join("\n"),
				"utf8",
			);
			const findings = checkStateDrift(root);
			expect(
				findings.some(
					(finding) =>
						finding.domain === "state" && finding.severity === "warn",
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol validate drift returns JSON report", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runValidateCommand(root, ["drift", "--json"], captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				ok: boolean;
				report?: { ok: boolean; findings: Array<{ id: string }> };
				findings: Array<{ id: string }>;
				data?: { report?: { ok: boolean; findings: Array<{ id: string }> } };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(payload.ok).toBe(true);
			expect(payload.report).toBeDefined();
			expect(payload.findings).toEqual([]);
			expect(payload.data?.report?.ok).toBe(true);
			expect(captured.stderr).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
