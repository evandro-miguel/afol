import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
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
import { dirname, join } from "node:path";
import { runValidateCommand } from "../commands/validate";
import type { BoundedSpawnResult } from "../core/subprocess";
import { ADAPTER_DEFINITIONS } from "../services/adapter/antigravity";
import { collectFreshnessReport } from "../services/local-state/freshness";
import { rebuildProjectIndexes } from "../services/local-state/project-indexes";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
import { rebuildPstrIndex } from "../services/pstr/builder";
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

function writeLegacyEvidenceAdmission(
	root: string,
	session: string,
	taskPath: string,
	issueType: "missing_evidence" | "failed_evidence",
): void {
	const task = readFileSync(taskPath, "utf8");
	const heading = /^## State Board\s*$/m.exec(task);
	if (heading?.index === undefined)
		throw new Error("Test fixture lacks a State Board.");
	const start = task.indexOf("\n", heading.index) + 1;
	const followingSection = task.slice(start).search(/^## /m);
	const stateBoard =
		followingSection === -1
			? task.slice(start)
			: task.slice(start, start + followingSection);
	const evidencePath = join(dirname(taskPath), ".evidence.jsonl");
	const evidencePresent = existsSync(evidencePath);
	const sha256 = (value: string) =>
		createHash("sha256").update(value).digest("hex");
	writeFileSync(
		join(
			root,
			".afol",
			"adm",
			"source",
			"evidence-compatibility-baseline-v1.json",
		),
		`${JSON.stringify(
			{
				schema_version: 1,
				baseline_id: "test-legacy-evidence-v1",
				cutoff_session_id: "260712_0000",
				admissions: [
					{
						session_id: session,
						task_id: "T-01",
						issue_type: issueType,
						state_board_sha256: sha256(stateBoard),
						evidence_ledger_sha256: sha256(
							evidencePresent ? readFileSync(evidencePath, "utf8") : "",
						),
						evidence_ledger_present: evidencePresent,
						cutoff_relation: "pre_cutoff",
						approval: "test admission",
					},
				],
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
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

	test("resolves strict project validation through the invocation router", () => {
		expect(
			resolveValidateInvocation(["project", "--strict", "--json"]),
		).toEqual({
			kind: "project",
			args: ["--strict", "--json"],
		});
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
				data: { findings?: unknown; checked_at?: unknown };
			};
			expect(payload).toMatchObject({
				schema: "afol.result/v1",
				exit_code: 1,
				ok: false,
			});
			expect(payload.findings.length).toBeGreaterThan(0);
			expect(payload.data).not.toHaveProperty("findings");
			expect(payload.data).not.toHaveProperty("checked_at");

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
			expect(data).not.toHaveProperty("checks");
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

	test("accepts timestamp-distinct closed sessions that reuse a theme", async () => {
		const root = createValidationFixture();
		try {
			const sessionA = "260609_1001_same-feature";
			const sessionB = "260610_1002_same-feature";
			mkdirSync(join(root, ".afol", "wb", sessionA), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", sessionB), { recursive: true });
			for (const session of [sessionA, sessionB]) {
				writeFileSync(
					join(root, ".afol", "wb", session, `${session}_task_01.md`),
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
					join(root, ".afol", "wb", session, ".evidence.jsonl"),
					`${JSON.stringify({ task_id: "T-01", command: "bun test", result: "passed", exit_code: 0, id: `E-${session}`, provenance: "observed" })}\n`,
					"utf8",
				);
			}
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
			rebuildValidationFixtureIndexes(root);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks?: Array<{ id?: string; ok?: boolean; message?: string }>;
			};
			const sessionHealth = payload.checks?.find(
				(entry) => entry.id === "session_health",
			);
			expect(sessionHealth?.ok).toBe(true);
			expect(sessionHealth?.message).not.toContain("Duplicate session theme");
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
			).toBe(0);
			const driftPayload = JSON.parse(drifted.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message: string }>;
			};
			const advisoryCheck = driftPayload.checks?.find(
				(entry) => entry.id === "index_drift",
			);
			expect(advisoryCheck?.ok).toBe(true);
			expect(advisoryCheck?.message).toContain("warning:");
			expect(advisoryCheck?.message).toContain("specs_markdown");
			expect(advisoryCheck?.message).toContain(
				"index/frontmatter mismatch: spec-a",
			);

			const strict = captureIo();
			expect(
				await runValidateCommand(
					root,
					["--check-drift", "--strict", "--json"],
					strict.io,
				),
			).toBe(1);
			const strictPayload = JSON.parse(strict.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message: string }>;
			};
			const strictCheck = strictPayload.checks?.find(
				(entry) => entry.id === "index_drift",
			);
			expect(strictCheck?.ok).toBe(false);
			expect(strictCheck?.message).not.toContain("warning:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts CRLF specs frontmatter on Windows worktrees", async () => {
		const root = createValidationFixture();
		try {
			const specsDir = join(root, ".afol", "adm", "specs");
			mkdirSync(specsDir, { recursive: true });
			writeFileSync(
				join(specsDir, "spec-a.md"),
				"---\r\ndoc_type: spec\r\nid: spec-a\r\ntheme: alpha\r\nstatus: active\r\nowners:\r\n- worker\r\n---\r\n# Spec A\r\n",
				"utf8",
			);
			writeFileSync(
				join(specsDir, "INDEX.md"),
				"---\r\ndoc_type: specs_index\r\nid: specs_index\r\nstatus: active\r\n---\r\n| Total | Count |\r\n|--------|-------|\r\n| Total | 1 |\r\n| Draft | 0 |\r\n| Active | 1 |\r\n| Final | 0 |\r\n| Superseded | 0 |\r\n| SPEC ID | Theme | Status | Owner | Links |\r\n|--------:|-------|--------|-------|------|\r\n| spec-a | alpha | active | worker | |\r\n",
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			expect(
				await runValidateCommand(
					root,
					["--check-drift", "--json"],
					captured.io,
				),
			).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(process.platform === "win32")(
		"reports unreadable spec frontmatter without crashing",
		async () => {
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
				expect(code).toBe(0);
				const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
					checks?: Array<{ id: string; ok: boolean; message: string }>;
				};
				const check = payload.checks?.find(
					(entry) => entry.id === "index_drift",
				);
				expect(check?.ok).toBe(true);
				expect(check?.message).toContain(
					"invalid spec frontmatter: unreadable.md",
				);

				const strict = captureIo();
				expect(
					await runValidateCommand(
						root,
						["--check-drift", "--strict", "--json"],
						strict.io,
					),
				).toBe(1);
			} finally {
				if (existsSync(specPath)) chmodSync(specPath, 0o600);
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test.each([
		{
			name: "ignores other provider-owned rule files",
			enabled: false,
			artifact: "sibling",
			failing: false,
			message: "ok antigravity adapter disabled with no managed mirror",
		},
		{
			name: "preserves a disabled user-owned mirror",
			enabled: false,
			artifact: "user",
			failing: false,
			message: "ok antigravity adapter disabled with no managed mirror",
		},
		{
			name: "allows an enabled exact managed mirror",
			enabled: true,
			artifact: "managed",
			failing: false,
			message: "ok antigravity adapter enabled",
		},
		{
			name: "warns when an enabled mirror is missing",
			enabled: true,
			artifact: null,
			failing: true,
			message:
				"antigravity adapter is enabled but its mirror is missing: .agents/rules/afol.md",
		},
		{
			name: "warns when an enabled mirror is user-owned",
			enabled: true,
			artifact: "user",
			failing: true,
			message:
				"antigravity adapter mirror is user-owned and conflicts with enabled state: .agents/rules/afol.md",
		},
	])("$name", async ({ enabled, artifact, failing, message }) => {
		const root = createValidationFixture();
		try {
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					schema_version: 1,
					project: { name: "validate-fixture" },
					adapters: { antigravity: { enabled } },
				}),
				"utf8",
			);
			if (artifact === "sibling") {
				mkdirSync(join(root, ".agents", "rules"), { recursive: true });
				writeFileSync(
					join(root, ".agents", "rules", "user.md"),
					"user-owned rule\n",
					"utf8",
				);
			} else if (artifact === "managed") {
				mkdirSync(join(root, ".agents", "rules"), { recursive: true });
				writeFileSync(
					join(root, ".agents", "rules", "afol.md"),
					ADAPTER_DEFINITIONS.antigravity.content,
				);
			} else if (artifact === "user") {
				mkdirSync(join(root, ".agents", "rules"), { recursive: true });
				writeFileSync(
					join(root, ".agents", "rules", "afol.md"),
					"user-owned instructions\n",
				);
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

			expect(code).toBe(0);
			expect(adapterCheck).toEqual({
				id: "adapter_consistency",
				ok: true,
				message: failing ? `warning: ${message}` : message,
			});

			if (!failing) {
				return;
			}
			const strict = captureIo();
			const strictCode = await runValidateCommand(
				root,
				["--strict", "--json"],
				strict.io,
			);
			expect(strictCode).toBe(1);
			const strictPayload = JSON.parse(strict.stdout[0] ?? "{}") as {
				checks?: Array<{ id?: string; ok?: boolean; message?: string }>;
			};
			expect(
				strictPayload.checks?.find(
					(check) => check.id === "adapter_consistency",
				),
			).toEqual({
				id: "adapter_consistency",
				ok: false,
				message,
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project readiness admits hash-bound missing evidence for closed legacy history", async () => {
		const root = createValidationFixture();
		const session = "260701_0800_closed-history";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			const taskPath = join(sessionDir, `${session}_task_01.md`);
			writeFileSync(
				taskPath,
				[
					"---",
					'doc_type: "workbench_task"',
					`session_id: "${session}"`,
					'status: "closed"',
					'closed_at: "2026-07-01T08:00:00.000Z"',
					"---",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | historical task |",
					"",
				].join("\n"),
				"utf8",
			);
			writeLegacyEvidenceAdmission(root, session, taskPath, "missing_evidence");
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

	test("project readiness requires an individual hash-bound failed-evidence admission", async () => {
		const root = createValidationFixture();
		const session = "260701_0800_failed-history";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			const taskPath = join(sessionDir, `${session}_task_01.md`);
			writeFileSync(
				taskPath,
				[
					"---",
					'doc_type: "workbench_task"',
					`session_id: "${session}"`,
					'status: "closed"',
					'closed_at: "2026-07-01T08:00:00.000Z"',
					"---",
					"",
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
			writeLegacyEvidenceAdmission(root, session, taskPath, "failed_evidence");
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project readiness rejects a legacy admission after its State Board changes", async () => {
		const root = createValidationFixture();
		const session = "260701_0800_hash-mismatch";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			const taskPath = join(sessionDir, `${session}_task_01.md`);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				taskPath,
				[
					"---",
					'doc_type: "workbench_task"',
					`session_id: "${session}"`,
					'status: "closed"',
					'closed_at: "2026-07-01T08:00:00.000Z"',
					"---",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | historical task |",
					"",
				].join("\n"),
				"utf8",
			);
			writeLegacyEvidenceAdmission(root, session, taskPath, "missing_evidence");
			writeFileSync(
				taskPath,
				readFileSync(taskPath, "utf8").replace(
					"historical task",
					"mutated historical task",
				),
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);
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

	test("project readiness rejects failed evidence for a current closed session", async () => {
		const root = createValidationFixture();
		const session = "260803_1200_failed-current";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, `${session}_task_01.md`),
				[
					"---",
					'doc_type: "workbench_task"',
					`session_id: "${session}"`,
					'status: "closed"',
					'closed_at: "2026-08-03T12:00:00.000Z"',
					"---",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | current task |",
					"",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(sessionDir, ".evidence.jsonl"),
				`${JSON.stringify({ task_id: "T-01", command: "bun test", result: "failed", exit_code: 1, id: "e-current", provenance: "observed" })}\n`,
				"utf8",
			);
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

	test("warns on discontinued skills-sync manifest until strict", async () => {
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

			expect(code).toBe(0);
			expect(check?.ok).toBe(true);
			expect(check?.message).toContain("warning:");
			expect(check?.message).toContain(".agents/skills-sync.manifest.json");

			const strict = captureIo();
			expect(
				await runValidateCommand(root, ["--strict", "--json"], strict.io),
			).toBe(1);
			const strictPayload = JSON.parse(strict.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message: string }>;
			};
			const strictCheck = strictPayload.checks?.find(
				(entry) => entry.id === "agents_payload_clean",
			);
			expect(strictCheck?.ok).toBe(false);
			expect(strictCheck?.message).not.toContain("warning:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("warns on vendored global agentic-folder-sys skill until strict", async () => {
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

			expect(code).toBe(0);
			expect(check?.ok).toBe(true);
			expect(check?.message).toContain("warning:");
			expect(check?.message).toContain(".agents/skills/agentic-folder-sys");

			const strict = captureIo();
			expect(
				await runValidateCommand(root, ["--strict", "--json"], strict.io),
			).toBe(1);
			const strictPayload = JSON.parse(strict.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message: string }>;
			};
			const strictCheck = strictPayload.checks?.find(
				(entry) => entry.id === "agents_payload_clean",
			);
			expect(strictCheck?.ok).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("warns on legacy universal-skills agentic-folder-sys seed until strict", async () => {
		const root = createValidationFixture();
		try {
			const staleSeedPath = join(
				root,
				".agents",
				"source",
				"universal-skills",
				"skills",
				"agentic-folder-sys",
			);
			mkdirSync(staleSeedPath, { recursive: true });
			writeFileSync(join(staleSeedPath, "SKILL.md"), "# stale\n", "utf8");
			rebuildValidationFixtureIndexes(root);
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean; message: string }>;
			};
			const check = payload.checks?.find(
				(entry) => entry.id === "agents_payload_clean",
			);

			expect(code).toBe(0);
			expect(check?.ok).toBe(true);
			expect(check?.message).toContain("warning:");
			expect(check?.message).toContain(
				".agents/source/universal-skills/skills/agentic-folder-sys",
			);

			const strict = captureIo();
			expect(
				await runValidateCommand(root, ["--strict", "--json"], strict.io),
			).toBe(1);
			const strictPayload = JSON.parse(strict.stdout[0] ?? "{}") as {
				checks?: Array<{ id: string; ok: boolean }>;
			};
			expect(
				strictPayload.checks?.find(
					(entry) => entry.id === "agents_payload_clean",
				)?.ok,
			).toBe(false);
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

	test("warns on missing local-state snapshots until strict", async () => {
		const root = createValidationFixture();
		try {
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				exit_code: number;
				ok: boolean;
				checks: Array<{ id: string; ok: boolean; message?: string }>;
			};
			expect(payload.exit_code).toBe(0);
			expect(payload.ok).toBe(true);
			for (const id of [
				"wb_local_state_index",
				"rules_local_state_index",
				"skills_local_state_index",
				"specs_local_state_index",
				"files_local_state_index",
			]) {
				const check = payload.checks.find((entry) => entry.id === id);
				expect(check).toBeDefined();
				expect(check?.ok).toBe(true);
				expect(check?.message).toContain("warning:");
				expect(check?.message).toContain("run afol local-state rebuild");
			}

			const strict = captureIo();
			const strictCode = await runValidateCommand(
				root,
				["--strict", "--json"],
				strict.io,
			);
			expect(strictCode).toBe(1);
			const strictPayload = JSON.parse(strict.stdout[0] ?? "{}") as {
				checks: Array<{ id: string; ok: boolean; message?: string }>;
			};
			for (const id of [
				"wb_local_state_index",
				"rules_local_state_index",
				"skills_local_state_index",
				"specs_local_state_index",
				"files_local_state_index",
			]) {
				const check = strictPayload.checks.find((entry) => entry.id === id);
				expect(check?.ok).toBe(false);
				expect(check?.message).not.toContain("warning:");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps config checks blocking in every mode", async () => {
		const root = createValidationFixture();
		try {
			writeFileSync(join(root, ".afol", "config.json"), "{");

			for (const args of [["--json"], ["--strict", "--json"]]) {
				const captured = captureIo();
				const code = await runValidateCommand(root, args, captured.io);
				expect(code).toBe(1);
				const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
					ok: boolean;
					checks: Array<{ id: string; ok: boolean; message: string }>;
				};
				expect(payload.ok).toBe(false);
				const check = payload.checks.find((entry) => entry.id === "config");
				expect(check?.ok).toBe(false);
				expect(check?.message.startsWith("warning:")).toBe(false);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project validation preserves canonical local-state classifications", async () => {
		const root = createValidationFixture();
		try {
			const canonical = collectFreshnessReport(root, {
				localState: true,
				pstr: false,
			});
			expect(canonical.findings).toHaveLength(5);
			expect(
				canonical.findings.every(
					(finding) =>
						finding.surface === "local-state" &&
						finding.state === "missing" &&
						finding.remediation === "run afol local-state rebuild",
				),
			).toBe(true);

			const captured = captureIo();
			await runValidateCommand(root, ["--json"], captured.io);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks: Array<{ id: string; ok: boolean; message: string }>;
			};
			for (const finding of canonical.findings) {
				const name = finding.id.replace("local-state:", "");
				const check = payload.checks.find(
					(entry) =>
						entry.id ===
						(name === "workbench"
							? "wb_local_state_index"
							: `${name}_local_state_index`),
				);
				expect(check).toMatchObject({ ok: true });
				expect(check?.message).toBe(`warning: ${finding.message}`);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project drift reports stale PSTR without changing ordinary validation", async () => {
		const root = createValidationFixture();
		try {
			mkdirSync(join(root, "cli"), { recursive: true });
			writeFileSync(join(root, "cli", "main.ts"), "export const cli = true;\n");
			rebuildPstrIndex(root);
			writeFileSync(
				join(root, "cli", "main.ts"),
				"export const cli = false;\n",
				"utf8",
			);
			rebuildValidationFixtureIndexes(root);

			const ordinary = captureIo();
			expect(await runValidateCommand(root, ["--json"], ordinary.io)).toBe(0);
			const ordinaryPayload = JSON.parse(ordinary.stdout[0] ?? "{}") as {
				checks: Array<{ id: string; ok: boolean; message: string }>;
			};
			expect(
				ordinaryPayload.checks.some((check) => check.id === "index_drift"),
			).toBe(false);

			const drift = captureIo();
			expect(
				await runValidateCommand(root, ["--check-drift", "--json"], drift.io),
			).toBe(0);
			const driftPayload = JSON.parse(drift.stdout[0] ?? "{}") as {
				checks: Array<{ id: string; ok: boolean; message: string }>;
			};
			const indexDrift = driftPayload.checks.find(
				(check) => check.id === "index_drift",
			);
			expect(indexDrift).toMatchObject({ ok: true });
			expect(indexDrift?.message).toContain("warning:");
			expect(indexDrift?.message).toContain("pstr");
			expect(indexDrift?.message).toContain("run afol pstr rebuild");

			const strict = captureIo();
			expect(
				await runValidateCommand(
					root,
					["--check-drift", "--strict", "--json"],
					strict.io,
				),
			).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project drift preserves an invalid PSTR index", async () => {
		const root = createValidationFixture();
		try {
			mkdirSync(join(root, "cli"), { recursive: true });
			writeFileSync(join(root, "cli", "main.ts"), "export const cli = true;\n");
			rebuildPstrIndex(root);
			writeFileSync(join(root, ".afol", "pstr", "index.json"), "{", "utf8");
			rebuildValidationFixtureIndexes(root);

			const captured = captureIo();
			expect(
				await runValidateCommand(
					root,
					["--check-drift", "--json"],
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks: Array<{ id: string; ok: boolean; message: string }>;
			};
			const indexDrift = payload.checks.find(
				(check) => check.id === "index_drift",
			);
			expect(indexDrift).toMatchObject({ ok: true });
			expect(indexDrift?.message).toContain("warning:");
			expect(indexDrift?.message).toContain("pstr:index");
			expect(indexDrift?.message).toContain("invalid pstr index snapshot");
			expect(indexDrift?.message).not.toContain("pstr:map:");

			const strict = captureIo();
			expect(
				await runValidateCommand(
					root,
					["--check-drift", "--strict", "--json"],
					strict.io,
				),
			).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project drift ignores an unmaterialized PSTR surface", async () => {
		const root = createValidationFixture();
		try {
			const configPath = join(root, ".afol", "config.json");
			const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<
				string,
				unknown
			>;
			config.pstr = { areas: [] };
			writeFileSync(configPath, `${JSON.stringify(config)}\n`, "utf8");
			mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "pstr", "README.md"),
				"# PSTR definitions\n",
				"utf8",
			);
			const specsDir = join(root, ".afol", "adm", "specs");
			mkdirSync(specsDir, { recursive: true });
			writeFileSync(
				join(specsDir, "spec-a.md"),
				[
					"---",
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
			expect(
				await runValidateCommand(
					root,
					["--check-drift", "--json"],
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				checks: Array<{ id: string; ok: boolean; message: string }>;
			};
			expect(payload.checks).toContainEqual({
				id: "index_drift",
				ok: true,
				message: "no index drift",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("warns on invalid manifest until strict", async () => {
		const root = createValidationFixture();
		try {
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				"{invalid-json",
				"utf8",
			);

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
			expect(payload.data).toHaveProperty("report");
			const checks = payload.checks as Array<Record<string, unknown>>;
			const manifestCheck = checks.find((entry) => entry.id === "manifest");
			expect(manifestCheck?.ok).toBe(true);
			expect(String(manifestCheck?.message)).toContain("warning:");

			const strict = captureIo();
			const strictCode = await runValidateCommand(
				root,
				["--strict", "--json"],
				strict.io,
			);
			expect(strictCode).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("warns when workbench index snapshot is malformed until strict", async () => {
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
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				checks: Array<{ id: string; ok: boolean; message?: string }>;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			const indexCheck = payload.checks.find(
				(entry) => entry.id === "wb_local_state_index",
			);
			expect(indexCheck).toBeDefined();
			expect(indexCheck?.ok).toBe(true);
			expect(indexCheck?.message).toContain("warning:");

			const strict = captureIo();
			expect(
				await runValidateCommand(root, ["--strict", "--json"], strict.io),
			).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("warns when rules index snapshot is malformed until strict", async () => {
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
			expect(code).toBe(0);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				checks: Array<{ id: string; ok: boolean; message?: string }>;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			const indexCheck = payload.checks.find(
				(entry) => entry.id === "rules_local_state_index",
			);
			expect(indexCheck).toBeDefined();
			expect(indexCheck?.ok).toBe(true);
			expect(indexCheck?.message).toContain("warning:");

			const strict = captureIo();
			expect(
				await runValidateCommand(root, ["--strict", "--json"], strict.io),
			).toBe(1);
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
			expect(code).toBe(0);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			const checks = payload.checks as Array<Record<string, unknown>>;
			const templateCheck = checks.find(
				(entry) => entry.id === "template_forbidden",
			);
			expect(templateCheck).toBeDefined();
			expect(templateCheck?.ok).toBe(true);
			expect(templateCheck?.message).toContain("warning:");

			const strict = captureIo();
			const strictCode = await runValidateCommand(
				root,
				["--strict", "--json"],
				strict.io,
			);
			expect(strictCode).toBe(1);
			const strictPayload = JSON.parse(strict.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			const strictChecks = strictPayload.checks as Array<
				Record<string, unknown>
			>;
			const strictTemplateCheck = strictChecks.find(
				(entry) => entry.id === "template_forbidden",
			);
			expect(strictTemplateCheck?.ok).toBe(false);
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
