import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runValidateCommand } from "../commands/validate";
import {
	checkActiveSessionPointerMutation,
	checkPstrDrift,
	checkStateDrift,
	runDriftCheck,
} from "../services/drift/checker";
import { collectFreshnessReport } from "../services/local-state/freshness";
import { rebuildPstrIndex } from "../services/pstr/builder";
import { hydrateSession } from "../services/state/session-state";
import { sweepDaily } from "../services/sweep/runner";
import { removeTestRoot } from "./windows-test-support";

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
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
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
		join(root, ".afol", "adm", "specs", "INDEX.md"),
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
		join(root, ".afol", "adm", "specs", "spec-a.md"),
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

function initGitRepo(root: string): void {
	const result = spawnSync("git", ["init"], {
		cwd: root,
		encoding: "utf8",
		shell: false,
	});
	if (result.error || result.status !== 0) {
		throw new Error(result.stderr || result.stdout || "git init failed");
	}
}

function stageActiveSessionPointer(
	root: string,
	session = "test-session",
): void {
	writeFileSync(
		join(root, ".afol", "wb", ".active_session"),
		`${session}\n`,
		"utf8",
	);
	const addResult = spawnSync("git", ["add", ".afol/wb/.active_session"], {
		cwd: root,
		encoding: "utf8",
		shell: false,
	});
	if (addResult.error || addResult.status !== 0) {
		throw new Error(addResult.stderr || addResult.stdout || "git add failed");
	}
}

describe("drift validation", () => {
	test("runDriftCheck returns ok when all drift surfaces match", () => {
		const root = createFixture();
		try {
			initGitRepo(root);
			const report = runDriftCheck(root);
			expect(report.ok).toBe(true);
			expect(report.findings).toEqual([]);
		} finally {
			removeTestRoot(root);
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
			removeTestRoot(root);
		}
	});

	test("canonical PSTR freshness keeps map state across drift adapters", () => {
		const root = createFixture();
		try {
			writeFileSync(
				join(root, "cli", "main.ts"),
				"export const cli = false;\n",
				"utf8",
			);
			const report = collectFreshnessReport(root, {
				localState: false,
				pstr: true,
			});
			const canonical = report.findings.find(
				(finding) => finding.id === "pstr:map:cli",
			);
			expect(canonical).toMatchObject({
				surface: "pstr",
				state: "stale",
				remediation: "run afol pstr rebuild",
			});

			const drift = checkPstrDrift(root).find(
				(finding) => finding.id === "pstr:map:cli:stale",
			);
			expect(drift).toMatchObject({
				domain: "pstr",
				severity: "warn",
				hint: "run afol pstr rebuild",
			});
		} finally {
			removeTestRoot(root);
		}
	});

	test("PSTR drift preserves an invalid index instead of deriving missing maps", () => {
		const root = createFixture();
		try {
			writeFileSync(join(root, ".afol", "pstr", "index.json"), "{", "utf8");

			const report = collectFreshnessReport(root, {
				localState: false,
				pstr: true,
			});
			expect(report.findings).toEqual([
				expect.objectContaining({
					id: "pstr:index",
					state: "invalid",
				}),
			]);
			expect(checkPstrDrift(root)).toEqual([
				expect.objectContaining({ id: "pstr:index:invalid" }),
			]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("PSTR drift preserves an index with an unknown map entry", () => {
		const root = createFixture();
		try {
			const indexPath = join(root, ".afol", "pstr", "index.json");
			const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
				maps: Array<{ id: string }>;
				manifest?: unknown;
			};
			const [firstMap] = index.maps;
			if (!firstMap) {
				throw new Error("fixture PSTR index must have a map");
			}
			firstMap.id = "unknown-map";
			delete index.manifest;
			writeFileSync(indexPath, `${JSON.stringify(index)}\n`, "utf8");

			const report = collectFreshnessReport(root, {
				localState: false,
				pstr: true,
			});
			expect(report.findings).toEqual([
				expect.objectContaining({
					id: "pstr:index",
					state: "invalid",
					message: expect.stringContaining("unknown pstr map entry"),
				}),
			]);
			expect(checkPstrDrift(root)).toEqual([
				expect.objectContaining({ id: "pstr:index:invalid" }),
			]);
		} finally {
			removeTestRoot(root);
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
			removeTestRoot(root);
		}
	});

	test("checkActiveSessionPointerMutation warns on staged pointer changes", () => {
		const root = createFixture();
		try {
			initGitRepo(root);
			stageActiveSessionPointer(root);
			const findings = checkActiveSessionPointerMutation(root);
			expect(findings).toHaveLength(1);
			expect(findings[0]?.id).toBe("active-session-pointer-mutated");
			expect(findings[0]?.severity).toBe("warn");
		} finally {
			removeTestRoot(root);
		}
	});

	test("sweepDaily surfaces active session pointer mutation warning", () => {
		const root = createFixture();
		try {
			initGitRepo(root);
			stageActiveSessionPointer(root);
			const report = sweepDaily(root);
			expect(report.issues).toBeGreaterThan(0);
			expect(report.actions).toContain(
				"review .afol/wb/.active_session mutation",
			);
		} finally {
			removeTestRoot(root);
		}
	});

	test("checkActiveSessionPointerMutation stays quiet when pointer is untouched", () => {
		const root = createFixture();
		try {
			initGitRepo(root);
			const findings = checkActiveSessionPointerMutation(root);
			expect(findings).toEqual([]);
		} finally {
			removeTestRoot(root);
		}
	});

	test("runDriftCheck reports adm drift", () => {
		const root = createFixture();
		try {
			initGitRepo(root);
			writeFileSync(
				join(root, ".afol", "adm", "specs", "spec-a.md"),
				"changed",
				"utf8",
			);
			const report = runDriftCheck(root);
			expect(report.ok).toBe(false);
			expect(report.findings.some((finding) => finding.domain === "adm")).toBe(
				true,
			);
		} finally {
			removeTestRoot(root);
		}
	});

	test("afol validate drift returns JSON report", async () => {
		const root = createFixture();
		try {
			initGitRepo(root);
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
			removeTestRoot(root);
		}
	});

	test("runDriftCheck reports git collection failure", () => {
		const root = createFixture();
		try {
			const report = runDriftCheck(root);
			expect(report.ok).toBe(false);
			expect(report.findings).toHaveLength(1);
			expect(report.findings[0]).toMatchObject({
				id: "state:git:collection-failed",
				severity: "fail",
				domain: "state",
				message: "failed to collect git drift for .afol/wb/.active_session",
			});
			expect(report.findings[0]?.actual).toContain("not a git repository");
		} finally {
			removeTestRoot(root);
		}
	});
});
