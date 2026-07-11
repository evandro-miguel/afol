import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdrCommand } from "../commands/adr";
import { runChangelogCommand } from "../commands/changelog";
import { runSpecCommand } from "../commands/spec";
import {
	resolveGovernanceCatalog,
	resolvePendingSpec,
} from "../services/governance/pending-specs";
import {
	abandonAdr,
	acceptAdr,
	createAdr,
	supersedeAdr,
} from "../services/spec-gate/adr";
import { addChangelogEntry } from "../services/spec-gate/changelog";
import {
	checkSpecCompatibility,
	getSpecCheck,
	waiveSpecCheck,
} from "../services/spec-gate/checker";

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
	const root = mkdtempSync(join(tmpdir(), "spec-gate-test-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "state"), { recursive: true });
	mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "decisions"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "changelog"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "SPECS"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		'{"version":"0.1.0"}',
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		'{"version":"0.1.0"}',
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		'{"commands":[]}',
		"utf8",
	);
	return root;
}

function writeTask(
	root: string,
	sessionId: string,
	taskId: string,
	parentSpec = "",
): string {
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	const path = join(sessionDir, "plan_task_001.md");
	writeFileSync(
		path,
		[
			"---",
			`feature_id: feature-${sessionId}`,
			`parent_spec: ${parentSpec ? `"${parentSpec}"` : ""}`,
			"---",
			"",
			"# Tasks",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			`| ${taskId} | pending | worker | test |`,
			"",
		].join("\n"),
		"utf8",
	);
	return path;
}

function writeSpec(root: string, id: string, status: string): string {
	const path = join(root, ".afol", "adm", "specs", `${id}.md`);
	writeFileSync(
		path,
		[
			"---",
			"doc_type: spec",
			`id: "${id}"`,
			`status: ${status}`,
			"---",
			"",
			`# ${id}`,
		].join("\n"),
		"utf8",
	);
	return path;
}

function writePendingGovernanceFixture(
	root: string,
	specStatus = "active",
	specFeature = "F-22",
) {
	mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
		"# Roadmap\n\n### F-22 Integrity\n\n- Status: active\n- Governing spec: .afol/adm/specs/spec-22.md\n",
		"utf8",
	);
	const taskPath = writeTask(root, "S-GOV", "T-01");
	writeFileSync(
		join(root, ".afol", "adm", "specs", "spec-22.md"),
		`---\nid: spec-22\nstatus: ${specStatus}\nroadmap_feature: ${specFeature}\n---\n\n# Spec\n`,
		"utf8",
	);
	const indexPath = join(
		root,
		".afol",
		"data",
		"governance",
		"pending-specs.json",
	);
	mkdirSync(join(root, ".afol", "data", "governance"), { recursive: true });
	writeFileSync(
		indexPath,
		`${JSON.stringify({ schema_version: 1, entries: [{ session_id: "S-GOV", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", status: "open", theme: "test", task_ids: ["T-01"], missing: ["roadmap_feature", "parent_spec"], resolution_hint: "resolve" }] }, null, 2)}\n`,
		"utf8",
	);
	return { taskPath, indexPath };
}

function writeLegacySpec(root: string, id: string, status: string): string {
	const path = join(root, "docs", "arc", "SPECS", `${id}.md`);
	writeFileSync(
		path,
		[
			"---",
			"doc_type: spec",
			`id: "${id}"`,
			`status: ${status}`,
			"---",
			"",
			`# ${id}`,
		].join("\n"),
		"utf8",
	);
	return path;
}

describe("spec-gate system", () => {
	test("governance catalog requires an active canonical roadmap feature section", () => {
		for (const roadmap of [
			"# Roadmap\n\nF-22 appears only in prose.\n",
			"# Roadmap\n\n### F-22 Integrity\n\n- Status: final\n- Governing spec: .afol/adm/specs/spec-22.md\n",
		]) {
			const root = createFixture();
			try {
				writePendingGovernanceFixture(root);
				writeFileSync(
					join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
					roadmap,
					"utf8",
				);
				expect(() =>
					resolveGovernanceCatalog(root, "F-22", "spec-22"),
				).toThrow();
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("governance catalog requires explicit Governing spec for the feature", () => {
		const root = createFixture();
		try {
			writePendingGovernanceFixture(root);
			writeFileSync(
				join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
				"# Roadmap\n\n### F-22 Integrity\n\n- Status: active\n- Why this feature mentions spec-22 in prose only.\n",
				"utf8",
			);
			expect(() => resolveGovernanceCatalog(root, "F-22", "spec-22")).toThrow();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("governance resolution rejects fake, inactive, and mismatched catalog bindings", () => {
		for (const variant of [
			"fake-feature",
			"fake-spec",
			"inactive",
			"mismatch",
		] as const) {
			const root = createFixture();
			try {
				writePendingGovernanceFixture(
					root,
					variant === "inactive" ? "archived" : "active",
					variant === "mismatch" ? "F-99" : "F-22",
				);
				const input = {
					session: "S-GOV",
					featureId: variant === "fake-feature" ? "F-404" : "F-22",
					parentSpec: variant === "fake-spec" ? "missing" : "spec-22",
				};
				expect(() => resolvePendingSpec(root, input)).toThrow();
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("governance resolution rolls back frontmatter and index after an injected failure", () => {
		const root = createFixture();
		try {
			const { taskPath, indexPath } = writePendingGovernanceFixture(root);
			const taskBefore = readFileSync(taskPath, "utf8");
			const indexBefore = readFileSync(indexPath, "utf8");
			expect(() =>
				resolvePendingSpec(
					root,
					{ session: "S-GOV", featureId: "F-22", parentSpec: "spec-22" },
					{ failAfterFrontmatter: true },
				),
			).toThrow("Injected governance failure");
			expect(readFileSync(taskPath, "utf8")).toBe(taskBefore);
			expect(readFileSync(indexPath, "utf8")).toBe(indexBefore);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
	test("checkSpecCompatibility returns not_applicable when no spec linked", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(result.status).toBe("not_applicable");
			expect(result.spec_id).toBe("");
			expect(getSpecCheck(root, "session-a", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility returns conflict for open pending_spec", () => {
		const root = createFixture();
		try {
			const sessionDir = join(root, ".afol", "wb", "session-pending");
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, "session-pending_task_01.md"),
				[
					"---",
					'feature_id: ""',
					'parent_spec: ""',
					"governance_status: pending_spec",
					"pending_spec: true",
					"pending_spec_status: open",
					"---",
					"",
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | missing governing spec |",
					"",
				].join("\n"),
				"utf8",
			);
			const result = checkSpecCompatibility(root, "session-pending", "T-01");
			expect(result.status).toBe("conflict");
			expect(result.spec_id).toBe("pending_spec");
			expect(getSpecCheck(root, "session-pending", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility reads open pending_spec from governance index", () => {
		const root = createFixture();
		try {
			const sessionDir = join(root, ".afol", "wb", "session-index-pending");
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, "session-index-pending_task_01.md"),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | pending | worker | missing governing spec |",
					"",
				].join("\n"),
				"utf8",
			);
			mkdirSync(join(root, ".afol", "data", "governance"), {
				recursive: true,
			});
			writeFileSync(
				join(root, ".afol", "data", "governance", "pending-specs.json"),
				JSON.stringify(
					{
						schema_version: 1,
						entries: [
							{
								session_id: "session-index-pending",
								created_at: "2026-07-05T00:00:00.000Z",
								updated_at: "2026-07-05T00:00:00.000Z",
								status: "open",
								theme: "index pending",
								task_ids: ["T-01"],
								missing: ["roadmap_feature", "parent_spec"],
								resolution_hint:
									"run afol governance resolve-spec --session <session>",
							},
						],
					},
					null,
					2,
				),
				"utf8",
			);

			const result = checkSpecCompatibility(
				root,
				"session-index-pending",
				"T-01",
			);
			expect(result.status).toBe("conflict");
			expect(result.spec_id).toBe("pending_spec");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility returns compatible when spec exists and active", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-001");
			writeSpec(root, "spec-001", "active");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(result.status).toBe("compatible");
			expect(result.spec_id).toBe("spec-001");
			expect(getSpecCheck(root, "session-a", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility falls back to docs arc spec", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-legacy");
			writeLegacySpec(root, "spec-legacy", "active");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(result.status).toBe("compatible");
			expect(result.spec_id).toBe("spec-legacy");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("checkSpecCompatibility returns conflict when spec missing", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(result.status).toBe("conflict");
			expect(result.spec_id).toBe("spec-missing");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("waiveSpecCheck creates waiver with reason", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const result = waiveSpecCheck(
				root,
				"session-a",
				"T-01",
				" needs waiver ",
				" ADR-9 ",
			);
			expect(result.status).toBe("waived");
			expect(result.waiver_reason).toBe("needs waiver");
			expect(result.adr_ref).toBe("ADR-9");
			expect(getSpecCheck(root, "session-a", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("getSpecCheck returns stored result", () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-001");
			writeSpec(root, "spec-001", "active");
			const result = checkSpecCompatibility(root, "session-a", "T-01");
			expect(getSpecCheck(root, "session-a", "T-01")).toEqual(result);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("createAdr creates file with next sequential number", () => {
		const root = createFixture();
		try {
			const existing = join(
				root,
				".afol",
				"adm",
				"decisions",
				"ADR-001-existing.md",
			);
			writeFileSync(
				existing,
				[
					"---",
					"doc_type: adr",
					"id: ADR-001",
					"title: Existing",
					"status: accepted",
					'created_at: "2026-01-01T00:00:00.000Z"',
					'updated_at: "2026-01-01T00:00:00.000Z"',
					'decision_type: "architecture"',
					'supersedes: ""',
					'superseded_by: ""',
					"affected_specs: []",
					"affected_rules: []",
					"affected_skills: []",
					"affected_commands: []",
					'archive_reason: ""',
					"---",
					"",
				].join("\n"),
				"utf8",
			);
			const path = createAdr(root, "Next decision");
			expect(path).toContain("ADR-002-next-decision.md");
			expect(readFileSync(path, "utf8")).toContain('id: "ADR-002"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("createAdr handles slugification", () => {
		const root = createFixture();
		try {
			const path = createAdr(root, "  Hello, World! / Test  ");
			expect(path).toContain("ADR-001-hello-world-test.md");
			expect(readFileSync(path, "utf8")).toContain(
				'title: "Hello, World! / Test"',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("acceptAdr updates status", () => {
		const root = createFixture();
		try {
			const path = createAdr(root, "Accept me");
			acceptAdr(root, "ADR-001");
			expect(readFileSync(path, "utf8")).toContain("status: accepted");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("supersedeAdr updates superseded_by", () => {
		const root = createFixture();
		try {
			createAdr(root, "Old decision");
			createAdr(root, "New decision");
			supersedeAdr(root, "ADR-001", "ADR-002");
			const content = readFileSync(
				join(root, ".afol", "adm", "decisions", "ADR-001-old-decision.md"),
				"utf8",
			);
			expect(content).toContain("status: superseded");
			expect(content).toContain('superseded_by: "ADR-002"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("abandonAdr updates status with reason", () => {
		const root = createFixture();
		try {
			const path = createAdr(root, "Abandon me");
			abandonAdr(root, "ADR-001", " no longer needed ");
			expect(readFileSync(path, "utf8")).toContain("status: abandoned");
			expect(readFileSync(path, "utf8")).toContain(
				'archive_reason: "no longer needed"',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("addChangelogEntry creates file if missing", () => {
		const root = createFixture();
		try {
			const path = addChangelogEntry(root, "fix", "test entry");
			expect(readFileSync(path, "utf8")).toContain("# Changelog");
			expect(readFileSync(path, "utf8")).toContain("- fix: test entry");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("addChangelogEntry appends to existing", () => {
		const root = createFixture();
		try {
			const path = join(root, ".afol", "adm", "changelog", "CHANGELOG.md");
			writeFileSync(
				path,
				["# Changelog", "", "## old", "- fix: prior", ""].join("\n"),
				"utf8",
			);
			addChangelogEntry(root, "behavior", " appended test ");
			const content = readFileSync(path, "utf8");
			expect(content).toContain("## old");
			expect(content).toContain("- fix: prior");
			expect(content).toContain("- behavior: appended test");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec check --json returns check result", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-001");
			writeSpec(root, "spec-001", "active");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"check",
					["-S", "session-a", "-T", "T-01", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				status: string;
				spec_id: string;
				data: { action: string; status: string; spec_id: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("check");
			expect(payload.status).toBe("compatible");
			expect(payload.spec_id).toBe("spec-001");
			expect(payload.data).toMatchObject({
				action: "check",
				status: "compatible",
				spec_id: "spec-001",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec check prints human output", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-001");
			writeSpec(root, "spec-001", "active");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"check",
					["-S", "session-a", "-T", "T-01"],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout.join("\n")).toContain("spec check: compatible");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec list --json lists adm specs", async () => {
		const root = createFixture();
		try {
			writeSpec(root, "spec-001", "active");
			writeSpec(root, "spec-002", "draft");
			const captured = captureIo();
			expect(await runSpecCommand("list", ["--json"], root, captured.io)).toBe(
				0,
			);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				count: number;
				data: {
					action: string;
					count: number;
					specs: { id: string; status?: string }[];
				};
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("list");
			expect(payload.count).toBe(2);
			expect(payload.data.specs.map((spec) => spec.id)).toEqual([
				"spec-001",
				"spec-002",
			]);
			expect(payload.data).toMatchObject({
				action: "list",
				count: 2,
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec list prints compact human output", async () => {
		const root = createFixture();
		try {
			writeSpec(root, "spec-001", "active");
			const captured = captureIo();
			expect(await runSpecCommand("list", [], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("specs: 1");
			expect(captured.stdout.join("\n")).toContain(
				"- spec-001 status=active path=.afol/adm/specs/spec-001.md",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec help prints usage without requiring task args", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(await runSpecCommand("", ["--help"], root, captured.io)).toBe(0);
			expect(captured.stdout.join("\n")).toContain("Usage: afol spec");
			expect(captured.stdout.join("\n")).toContain("list");
			expect(captured.stderr.join("\n")).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol adr new --json creates ADR", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runAdrCommand(
					"new",
					["JSON output test", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				path: string;
				data: { action: string; path: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("new");
			expect(readFileSync(payload.path, "utf8")).toContain("Json Output Test");
			expect(payload.data).toMatchObject({ action: "new", path: payload.path });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol changelog add --json adds entry", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runChangelogCommand(
					"add",
					["--type", "fix", "--message", "test", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				action: string;
				path: string;
				data: { action: string; path: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("add");
			expect(readFileSync(payload.path, "utf8")).toContain("- fix: test");
			expect(payload.data).toMatchObject({ action: "add", path: payload.path });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec conflict reports conflict", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"conflict",
					["-S", "session-a", "-T", "T-01"],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout.join("\n")).toContain("spec conflict: conflict");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec waive requires reason", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"waive",
					["-S", "session-a", "-T", "T-01"],
					root,
					captured.io,
				),
			).toBe(2);
			expect(captured.stderr.join("\n")).toContain(
				"Missing --reason for spec waive.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol spec waive with adr returns waived result", async () => {
		const root = createFixture();
		try {
			writeTask(root, "session-a", "T-01", "spec-missing");
			const captured = captureIo();
			expect(
				await runSpecCommand(
					"waive",
					[
						"-S",
						"session-a",
						"-T",
						"T-01",
						"--reason",
						"needs override",
						"--adr",
						"ADR-9",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.action).toBe("waive");
			expect(payload.status).toBe("waived");
			expect(payload.waiver_reason).toBe("needs override");
			expect(payload.adr_ref).toBe("ADR-9");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol adr command covers accept supersede abandon archive", async () => {
		const root = createFixture();
		try {
			const created = captureIo();
			expect(
				await runAdrCommand("new", ["First decision"], root, created.io),
			).toBe(0);
			const firstPath = created.stdout[0] ?? "";
			expect(firstPath).toContain("ADR-001-first-decision.md");

			const accepted = captureIo();
			expect(
				await runAdrCommand("accept", ["ADR-001"], root, accepted.io),
			).toBe(0);
			expect(accepted.stdout[0] ?? "").toContain("adr accept:");

			const second = captureIo();
			expect(
				await runAdrCommand(
					"new",
					["Second decision", "--json"],
					root,
					second.io,
				),
			).toBe(0);
			const secondPayload = JSON.parse(second.stdout[0] ?? "{}");
			expect(secondPayload.path).toContain("ADR-002-second-decision.md");

			const superseded = captureIo();
			expect(
				await runAdrCommand(
					"supersede",
					["ADR-001", "ADR-002"],
					root,
					superseded.io,
				),
			).toBe(0);
			expect(superseded.stdout[0] ?? "").toContain("adr supersede:");

			const abandoned = captureIo();
			expect(
				await runAdrCommand(
					"abandon",
					["ADR-002", "--reason", "unused"],
					root,
					abandoned.io,
				),
			).toBe(0);
			expect(abandoned.stdout[0] ?? "").toContain("adr abandon:");

			const archived = captureIo();
			expect(
				await runAdrCommand(
					"archive",
					["ADR-002", "--reason", "old"],
					root,
					archived.io,
				),
			).toBe(0);
			expect(archived.stdout[0] ?? "").toContain("adr archive:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol changelog add writes human output", async () => {
		const root = createFixture();
		try {
			const captured = captureIo();
			expect(
				await runChangelogCommand(
					"a",
					["--type", "behavior", "--message", "plain output"],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout[0] ?? "").toContain("changelog add:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
