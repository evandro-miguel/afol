import { describe, expect, test } from "bun:test";
import {
	chmodSync,
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
import type { BoundedSpawnResult } from "../core/subprocess";
import { rebuildProjectIndexes } from "../services/local-state/project-indexes";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
import { resolveValidateInvocation } from "../validate/command";
import {
	runValidationCommands,
	setBoundedSpawnForTests,
} from "../validate/command-runner";
import type { PackId } from "../validate/types";

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

function createValidationFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "validate-command-"));
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
			project: { name: "validate-fixture" },
		}),
		"utf8",
	);
	writeFileSync(
		join(agentsDir, "lock.json"),
		JSON.stringify({
			schema_version: 1,
			revision: "abc123",
			project: "validate-fixture",
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

function rebuildValidationFixtureIndexes(root: string): void {
	rebuildWorkBenchIndex(root);
	rebuildProjectIndexes(root);
}

describe("validate command", () => {
	test("resolves typed validate invocations without changing current grammar", () => {
		expect(resolveValidateInvocation([])).toEqual({
			kind: "project",
			args: [],
		});
		expect(resolveValidateInvocation(["drift", "--json"])).toEqual({
			kind: "project",
			args: ["drift", "--json"],
		});
		expect(resolveValidateInvocation(["project", "--json"])).toEqual({
			kind: "project",
			args: ["--json"],
		});
		expect(resolveValidateInvocation(["--project", "bench"])).toEqual({
			kind: "benchmark",
			args: ["bench"],
		});
		expect(resolveValidateInvocation(["select", "--json"])).toEqual({
			kind: "benchmark",
			args: ["select", "--json"],
		});
	});

	test("rejects unknown and unexpected validate arguments", async () => {
		for (const [args, message] of [
			[["--unknown"], "Unknown validate argument: --unknown"],
			[["unexpected"], "Unexpected validate argument: unexpected"],
		] as const) {
			const captured = captureIo();
			expect(await runValidateCommand(".", [...args], captured.io)).toBe(2);
			expect(captured.stdout).toEqual([]);
			expect(captured.stderr).toEqual([message]);
		}
	});

	test("renders failing drift validation in JSON and human modes", async () => {
		const root = createValidationFixture();
		try {
			const json = captureIo();
			expect(await runValidateCommand(root, ["drift", "--json"], json.io)).toBe(
				1,
			);
			const payload = JSON.parse(json.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				ok: boolean;
				findings: Array<{ hint?: string }>;
			};
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				exit_code: 1,
				ok: false,
			});
			expect(payload.findings.length).toBeGreaterThan(0);

			const human = captureIo();
			expect(
				await runValidateCommand(root, ["validate", "drift"], human.io),
			).toBe(1);
			expect(human.stdout[0]).toContain("drift: failed");
			expect(human.stdout[0]).toContain("findings:");
			expect(human.stdout[0]).toContain("hint=");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("passes structural checks in a minimal project fixture", async () => {
		const root = createValidationFixture();
		try {
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
			expect(captured.stderr).toEqual([]);
			expect(captured.stdout.length).toBe(1);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(payload.ok).toBe(true);
			expect(payload.report).toBeDefined();
			const data = payload.data as { report?: { ok?: boolean } };
			expect(data.report?.ok).toBe(true);
			const checks = payload.checks as Array<Record<string, unknown>>;
			expect(Array.isArray(checks)).toBe(true);
			expect(
				checks.some((entry) => entry.id === "config" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "lock" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "manifest" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "rules_dir" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "hooks_dir" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some(
					(entry) => entry.id === "adm_source_dir" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "adm_tools" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "skills_dir" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "wb_dir" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "adm_dir" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some(
					(entry) => entry.id === "agents_payload_clean" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) => entry.id === "wb_local_state_index" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) =>
						entry.id === "rules_local_state_index" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) =>
						entry.id === "skills_local_state_index" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) =>
						entry.id === "specs_local_state_index" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) =>
						entry.id === "files_local_state_index" && entry.ok === true,
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detects specs INDEX/frontmatter drift", async () => {
		const root = createValidationFixture();
		try {
			const specsDir = join(root, ".afol", "adm", "specs");
			mkdirSync(specsDir, { recursive: true });
			writeFileSync(
				join(specsDir, "spec-a.md"),
				[
					"---",
					"doc_type: spec",
					"id: spec-a",
					"theme: alpha",
					"status: active",
					"owners:",
					"- worker",
					"---",
					"",
					"# Spec A",
					"",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(specsDir, "INDEX.md"),
				[
					"---",
					"doc_type: specs_index",
					"id: specs_index",
					"status: active",
					"---",
					"",
					"# SPECS INDEX",
					"",
					"| Total | Count |",
					"|--------|-------|",
					"| Total | 1 |",
					"| Draft | 0 |",
					"| Active | 1 |",
					"| Final | 0 |",
					"| Superseded | 0 |",
					"",
					"| SPEC ID | Theme | Status | Owner | Links |",
					"|--------:|-------|--------|-------|------|",
					"| spec-a | alpha | active | worker | |",
					"",
				].join("\n"),
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const initialCode = await runValidateCommand(
				root,
				["--check-drift", "--json"],
				captured.io,
			);
			expect(initialCode).toBe(0);

			writeFileSync(
				join(specsDir, "INDEX.md"),
				readFileSync(join(specsDir, "INDEX.md"), "utf8").replace(
					"| spec-a | alpha | active | worker | |",
					"| spec-a | alpha | final | worker | |",
				),
				"utf8",
			);
			const drifted = captureIo();
			expect(
				await runValidateCommand(root, ["--check-drift", "--json"], drifted.io),
			).toBe(1);
			const payload = JSON.parse(drifted.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message: string }>;
			};
			const check = payload.checks?.find((entry) => entry.id === "index_drift");
			expect(check?.ok).toBe(false);
			expect(check?.message).toContain("specs_markdown");
			expect(check?.message).toContain("index/frontmatter mismatch: spec-a");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports unreadable spec frontmatter without crashing", async () => {
		const root = createValidationFixture();
		const specsDir = join(root, ".afol", "adm", "specs");
		const specPath = join(specsDir, "unreadable.md");
		try {
			mkdirSync(specsDir, { recursive: true });
			writeFileSync(
				specPath,
				"---\nid: unreadable\nstatus: active\n---\n",
				"utf8",
			);
			writeFileSync(
				join(specsDir, "INDEX.md"),
				[
					"---",
					"doc_type: specs_index",
					"id: specs_index",
					"status: active",
					"---",
					"",
					"| Total | Count |",
					"|--------|-------|",
					"| Total | 1 |",
					"| Draft | 0 |",
					"| Active | 1 |",
					"| Final | 0 |",
					"| Superseded | 0 |",
					"",
					"| SPEC ID | Theme | Status | Owner | Links |",
					"|--------:|-------|--------|-------|------|",
					"| unreadable | unreadable | active | worker | |",
					"",
				].join("\n"),
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);
			chmodSync(specPath, 0o000);
			const captured = captureIo();
			const code = await runValidateCommand(
				root,
				["--check-drift", "--json"],
				captured.io,
			);
			expect(code).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message: string }>;
			};
			const check = payload.checks?.find((entry) => entry.id === "index_drift");
			expect(check?.ok).toBe(false);
			expect(check?.message).toContain(
				"invalid spec frontmatter: unreadable.md",
			);
		} finally {
			if (existsSync(specPath)) chmodSync(specPath, 0o600);
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.each([
		{
			name: "rejects disabled adapter with .claude",
			enabled: false,
			artifact: ".claude",
			expectedCode: 1,
			expectedOk: false,
			expectedMessage:
				"claude adapter is disabled but owned artifacts are present: .claude",
		},
		{
			name: "rejects disabled adapter with CLAUDE.md",
			enabled: false,
			artifact: "CLAUDE.md",
			expectedCode: 1,
			expectedOk: false,
			expectedMessage:
				"claude adapter is disabled but owned artifacts are present: CLAUDE.md",
		},
		{
			name: "allows enabled adapter with owned artifacts",
			enabled: true,
			artifact: ".claude",
			expectedCode: 0,
			expectedOk: true,
			expectedMessage: "ok claude adapter enabled",
		},
		{
			name: "allows disabled adapter without owned artifacts",
			enabled: false,
			artifact: null,
			expectedCode: 0,
			expectedOk: true,
			expectedMessage: "ok claude adapter disabled with no owned artifacts",
		},
	])("$name", async ({
		enabled,
		artifact,
		expectedCode,
		expectedOk,
		expectedMessage,
	}) => {
		const root = createValidationFixture();
		try {
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					schema_version: 1,
					project: { name: "validate-fixture" },
					adapters: { claude: { enabled } },
				}),
				"utf8",
			);
			if (artifact === ".claude") {
				mkdirSync(join(root, ".claude", "skills"), { recursive: true });
				writeFileSync(
					join(root, ".claude", "skills", "generated.md"),
					"generated adapter artifact\n",
					"utf8",
				);
			} else if (artifact === "CLAUDE.md") {
				writeFileSync(join(root, "CLAUDE.md"), "claude adapter artifact\n");
			}
			rebuildValidationFixtureIndexes(root);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks?: Array<{ id?: string; ok?: boolean; message?: string }>;
			};
			const adapterCheck = payload.checks?.find(
				(check) => check.id === "adapter_consistency",
			);

			expect(code).toBe(expectedCode);
			expect(adapterCheck).toEqual({
				id: "adapter_consistency",
				ok: expectedOk,
				message: expectedMessage,
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project readiness ignores missing outcomes for completed history", async () => {
		const root = createValidationFixture();
		const session = "260701_0800_closed-history";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, `${session}_task_01.md`),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | historical task |",
					"",
				].join("\n"),
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean }>;
			};
			expect(
				payload.checks?.find((entry) => entry.id === "session_evidence")?.ok,
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project readiness ignores failed outcomes for completed history", async () => {
		const root = createValidationFixture();
		const session = "260701_0800_failed-history";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, `${session}_task_01.md`),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | historical task |",
					"",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(sessionDir, ".evidence.jsonl"),
				`${JSON.stringify({ task_id: "T-01", command: "bun test", result: "failed", exit_code: 1, id: "e-1", provenance: "observed" })}\n`,
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project readiness remains strict for open tasks despite closed metadata", async () => {
		const root = createValidationFixture();
		const session = "260701_0800_open-history";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, `${session}_task_01.md`),
				[
					"---",
					'doc_type: "workbench_task"',
					`id: "${session}_task_01"`,
					`session_id: "${session}"`,
					'status: "closed"',
					'updated_at: "2026-07-01T08:00:00.000Z"',
					'closed_at: "2026-07-01T08:00:00.000Z"',
					"---",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | open task |",
					"",
				].join("\n"),
				"utf8",
			);
			writeFileSync(join(sessionDir, ".evidence.jsonl"), "not-json\n", "utf8");
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);
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

	test("rejects discontinued skills-sync manifest in .agents", async () => {
		const root = createValidationFixture();
		try {
			writeFileSync(
				join(root, ".agents", "skills-sync.manifest.json"),
				"{}\n",
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message: string }>;
			};
			const check = payload.checks?.find(
				(entry) => entry.id === "agents_payload_clean",
			);

			expect(code).toBe(1);
			expect(check?.ok).toBe(false);
			expect(check?.message).toContain(".agents/skills-sync.manifest.json");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects vendored global agentic-folder-sys skill", async () => {
		const root = createValidationFixture();
		try {
			const staleSkillPath = join(
				root,
				".agents",
				"skills",
				"agentic-folder-sys",
			);
			mkdirSync(staleSkillPath, { recursive: true });
			writeFileSync(join(staleSkillPath, "SKILL.md"), "# stale\n", "utf8");
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message: string }>;
			};
			const check = payload.checks?.find(
				(entry) => entry.id === "agents_payload_clean",
			);

			expect(code).toBe(1);
			expect(check?.ok).toBe(false);
			expect(check?.message).toContain(".agents/skills/agentic-folder-sys");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects skills_dir outside .agents/skills", async () => {
		const root = createValidationFixture();
		try {
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					schema_version: 1,
					project: { name: "validate-fixture" },
					paths: {
						skills_dir: ".afol/skills",
					},
					skills_sync: {
						project_dir: ".afol/skills",
					},
				}),
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok: boolean;
				checks: Array<{ id: string; ok: boolean; message?: string }>;
			};
			expect(payload.ok).toBe(false);
			const configCheck = payload.checks.find((entry) => entry.id === "config");
			expect(configCheck?.ok).toBe(false);
			expect(configCheck?.message).toContain("paths.skills_dir");
			expect(configCheck?.message).toContain(".agents/skills");
			expect(configCheck?.message).toContain(".afol/skills");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when local-state index snapshots are missing", async () => {
		const root = createValidationFixture();
		try {
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				exit_code: number;
				ok: boolean;
				checks: Array<{ id: string; ok: boolean; message?: string }>;
			};
			expect(payload.exit_code).toBe(1);
			expect(payload.ok).toBe(false);
			for (const id of [
				"wb_local_state_index",
				"rules_local_state_index",
				"skills_local_state_index",
				"specs_local_state_index",
				"files_local_state_index",
			]) {
				const check = payload.checks.find((entry) => entry.id === id);
				expect(check).toBeDefined();
				expect(check?.ok).toBe(false);
				expect(check?.message).toContain("run afol local-state rebuild");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when manifest is missing or invalid", async () => {
		const root = createValidationFixture();
		try {
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				"{invalid-json",
				"utf8",
			);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);
			expect(captured.stderr).toEqual([]);
			expect(captured.stdout.length).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			expect(payload.ok).toBe(false);
			expect(payload.report).toBeDefined();
			const checks = payload.checks as Array<Record<string, unknown>>;
			expect(
				checks.some((entry) => entry.id === "manifest" && entry.ok === false),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when workbench index snapshot is malformed", async () => {
		const root = createValidationFixture();
		try {
			const indexPath = join(root, ".afol", "data", "index");
			mkdirSync(indexPath, { recursive: true });
			writeFileSync(
				join(indexPath, "workbench.json"),
				JSON.stringify({ kind: "bad-kind" }),
				"utf8",
			);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				checks: Array<{ id: string; ok: boolean }>;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			const indexCheck = payload.checks.find(
				(entry) => entry.id === "wb_local_state_index",
			);
			expect(indexCheck).toBeDefined();
			expect(indexCheck?.ok).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when rules index snapshot is malformed", async () => {
		const root = createValidationFixture();
		try {
			const indexPath = join(root, ".afol", "data", "index");
			mkdirSync(indexPath, { recursive: true });
			writeFileSync(
				join(indexPath, "rules.json"),
				JSON.stringify({ kind: "bad-kind" }),
				"utf8",
			);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				checks: Array<{ id: string; ok: boolean }>;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			const indexCheck = payload.checks.find(
				(entry) => entry.id === "rules_local_state_index",
			);
			expect(indexCheck).toBeDefined();
			expect(indexCheck?.ok).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back from invalid rules catalog JSON without crashing validate", async () => {
		const root = createValidationFixture();
		try {
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				"{invalid-json",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "RULE-001-example.md"),
				"# Rule 1\n",
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				ok: boolean;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(payload.ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns structured failure when project validation throws", async () => {
		const root = createValidationFixture();
		try {
			const captured = captureIo();
			const code = await runValidateCommand(
				root,
				["--json"],
				captured.io,
				async () => {
					throw new Error("validation exploded");
				},
			);

			expect(code).toBe(1);
			expect(captured.stderr).toEqual([]);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				ok: boolean;
				checks: Array<{ id: string; ok: boolean; message: string }>;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			expect(payload.ok).toBe(false);
			expect(payload.checks).toEqual([
				{
					id: "runtime",
					ok: false,
					message: "validation exploded",
				},
			]);

			const human = captureIo();
			const humanCode = await runValidateCommand(
				root,
				[],
				human.io,
				async () => {
					throw new Error("validation exploded");
				},
			);
			expect(humanCode).toBe(1);
			expect(human.stderr).toEqual([]);
			expect(human.stdout[0]).toContain("validate: failed");
			expect(human.stdout[0]).toContain("fail runtime validation exploded");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runs template forbidden scan when src/project-template exists", async () => {
		const root = createValidationFixture();
		try {
			mkdirSync(join(root, "src", "project-template", "tests"), {
				recursive: true,
			});
			writeFileSync(
				join(root, "src", "project-template", "tests", "forbidden.txt"),
				"forbidden\n",
				"utf8",
			);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			const checks = payload.checks as Array<Record<string, unknown>>;
			const templateCheck = checks.find(
				(entry) => entry.id === "template_forbidden",
			);
			expect(templateCheck).toBeDefined();
			expect(templateCheck?.ok).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runValidationCommands prevents zero-spec pack from passing as zero coverage", () => {
		const root = mkdtempSync(join(tmpdir(), "validate-zerospec-"));
		try {
			// "mcp-parity" has a defined command — this should pass
			const result = runValidationCommands(root, ["mcp-parity"]);
			expect(result.summary.passed + result.summary.failed).toBeGreaterThan(0);

			// A defined pack should NOT trigger the empty-spec guard
			const definedPackResult = runValidationCommands(root, [
				"cli-kernel-local" as PackId,
			]);
			expect(
				definedPackResult.commandResults.some(
					(r) =>
						r.status === "failed" &&
						r.stderr_tail.includes("no commands defined"),
				),
			).toBe(false); // cli-kernel-local is defined, so no failure
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runValidationCommands fires empty-spec guard for unmapped pack", () => {
		const root = mkdtempSync(join(tmpdir(), "validate-zerospec-guard-"));
		try {
			const guardResult = runValidationCommands(root, [
				"non-existent-test-pack" as PackId,
			]);
			expect(guardResult.summary.passed).toBe(0);
			expect(guardResult.summary.failed).toBe(1);
			expect(
				guardResult.commandResults.some(
					(r) =>
						r.status === "failed" &&
						r.stderr_tail.includes(
							"no commands defined for pack: non-existent-test-pack",
						),
				),
			).toBe(true);
			// Every result from the guard has exit_code null and signal null
			for (const r of guardResult.commandResults) {
				expect(r.exit_code).toBeNull();
				expect(r.signal).toBeNull();
				expect(r.duration_ms).toBe(0);
				expect(r.command).toEqual([]);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runValidationCommands classifies timeout via stderr_tail and signal", () => {
		const root = mkdtempSync(join(tmpdir(), "validate-timeout-"));
		try {
			// Replace boundedSpawn with a mock that reports timeout
			setBoundedSpawnForTests(
				() =>
					({
						ok: false,
						timedOut: true,
						status: null,
						signal: "SIGKILL",
						stdout: "",
						stderr: "timed out after 1ms",
					}) as BoundedSpawnResult,
			);

			const result = runValidationCommands(root, ["cli-kernel-local"]);
			expect(result.commandResults.length).toBeGreaterThan(0);
			for (const cmdResult of result.commandResults) {
				expect(cmdResult.status).toBe("failed");
				expect(cmdResult.signal).toBe("SIGKILL");
				expect(cmdResult.stderr_tail).toContain("timed out");
			}
			// Summary must report all as failed
			expect(result.summary.passed).toBe(0);
			expect(result.summary.failed).toBe(result.commandResults.length);
		} finally {
			setBoundedSpawnForTests(null);
			rmSync(root, { recursive: true, force: true });
		}
	});
});
