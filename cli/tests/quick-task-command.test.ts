import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeScopedFlags } from "../aliases";
import {
	parseQuickTaskArgs,
	runQuickTaskCommand,
} from "../commands/quick-task";
import { agentOperationContext } from "../core/operation-context";

describe("quick-task parseQuickTaskArgs", () => {
	test("requires an explicit command before any session can be created", () => {
		expect(() =>
			parseQuickTaskArgs(["alpha", "--no-spec-required", "--reason", "test"]),
		).toThrow("requires --command");
	});

	test("parses --json flag", () => {
		const parsed = parseQuickTaskArgs([
			"alpha",
			"--json",
			"--command",
			"true",
			"--no-spec-required",
			"--reason",
			"test",
		]);
		expect(parsed.theme).toBe("alpha");
		expect(parsed.json).toBe(true);
	});

	test("parses -j shorthand", () => {
		const parsed = parseQuickTaskArgs([
			"alpha",
			"-j",
			"--command",
			"true",
			"--no-spec-required",
			"--reason",
			"test",
		]);
		expect(parsed.theme).toBe("alpha");
		expect(parsed.json).toBe(true);
	});

	test("parses metadata flags", () => {
		const parsed = parseQuickTaskArgs([
			"alpha",
			"--feature-id",
			"F-01",
			"--parent-spec",
			"SPEC-001",
			"--task",
			"implement foo",
			"--command",
			"true",
		]);
		expect(parsed.theme).toBe("alpha");
		expect(parsed.metadata.featureId).toBe("F-01");
		expect(parsed.metadata.parentSpec).toBe("SPEC-001");
		expect(parsed.metadata.task).toBe("implement foo");
	});

	test("parses --command and --artifact and --note", () => {
		const parsed = parseQuickTaskArgs([
			"alpha",
			"--command",
			"bun test",
			"--artifact",
			"dist/out",
			"--note",
			"first run",
			"--no-spec-required",
			"--reason",
			"test",
		]);
		expect(parsed.command).toBe("bun test");
		expect(parsed.artifact).toBe("dist/out");
		expect(parsed.note).toBe("first run");
	});

	test("throws on missing theme", () => {
		expect(() => parseQuickTaskArgs([])).toThrow("Missing theme");
	});

	test("throws on missing --feature-id value", () => {
		expect(() => parseQuickTaskArgs(["alpha", "--feature-id"])).toThrow(
			"Missing value for --feature-id",
		);
	});

	test("throws on missing --command value", () => {
		expect(() => parseQuickTaskArgs(["alpha", "--command"])).toThrow(
			"Missing value for --command",
		);
	});

	test("rejects the removed --result authority flag", () => {
		expect(() => parseQuickTaskArgs(["alpha", "--result", "passed"])).toThrow(
			"Unknown quick-task argument",
		);
	});

	test("does not normalize -o to the removed --result contract", () => {
		expect(normalizeScopedFlags("quickTask", ["-o", "passed"])).toEqual([
			"-o",
			"passed",
		]);
		expect(() =>
			parseQuickTaskArgs(["alpha", "-o", "passed", "--command", "true"]),
		).toThrow("Unknown quick-task argument: -o");
	});

	test("allows omitted governance as a pending-spec quick task", () => {
		const parsed = parseQuickTaskArgs(["alpha", "--command", "true"]);
		expect(parsed.metadata.featureId).toBeUndefined();
		expect(parsed.metadata.parentSpec).toBeUndefined();
	});

	test("throws on unknown argument", () => {
		expect(() => parseQuickTaskArgs(["alpha", "--bogus"])).toThrow(
			"Unknown quick-task argument",
		);
	});

	test("happy path parses all options", () => {
		const parsed = parseQuickTaskArgs([
			"my-theme",
			"--json",
			"--feature-id",
			"F-42",
			"--parent-spec",
			"SPEC-X",
			"--task",
			"run tests",
			"--command",
			"echo ok",
			"--artifact",
			"dist/result.json",
			"--note",
			"smoke check",
		]);
		expect(parsed.theme).toBe("my-theme");
		expect(parsed.json).toBe(true);
		expect(parsed.command).toBe("echo ok");
		expect(parsed.metadata.featureId).toBe("F-42");
		expect(parsed.metadata.parentSpec).toBe("SPEC-X");
		expect(parsed.metadata.task).toBe("run tests");
		expect(parsed.artifact).toBe("dist/result.json");
		expect(parsed.note).toBe("smoke check");
	});

	test("happy path -j shorthand with metadata", () => {
		const parsed = parseQuickTaskArgs([
			"gamma",
			"-j",
			"--feature-id",
			"F-10",
			"--command",
			"ls",
			"--parent-spec",
			"SPEC-10",
		]);
		expect(parsed.theme).toBe("gamma");
		expect(parsed.json).toBe(true);
		expect(parsed.command).toBe("ls");
		expect(parsed.metadata.featureId).toBe("F-10");
	});
});

describe("quick-task runQuickTaskCommand", () => {
	test("closes a pending-spec lifecycle with a structured resolution prompt", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-pending-spec-"));
		try {
			const exitCode = await runQuickTaskCommand(
				["pending", "--command", "true", "--json"],
				root,
			);
			expect(exitCode).toBe(0);
			const index = JSON.parse(
				readFileSync(
					join(root, ".afol", "data", "governance", "pending-specs.json"),
					"utf8",
				),
			) as { entries: Array<{ status: string }> };
			expect(index.entries).toMatchObject([{ status: "open" }]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("normalizes a governed spec path through task completion", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-spec-path-"));
		try {
			mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
			mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
				"# Roadmap\n\n### F-01 Quick task\n\n- Status: active\n- Governing spec: .afol/adm/specs/spec-01.md\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "specs", "spec-01.md"),
				"---\ndoc_type: spec\nid: spec-01\nstatus: active\nroadmap_feature: F-01\n---\n\n# Spec\n",
				"utf8",
			);

			const exitCode = await runQuickTaskCommand(
				[
					"path-governed",
					"--command",
					"true",
					"--feature-id",
					"F-01",
					"--parent-spec",
					".afol/adm/specs/spec-01.md",
				],
				root,
			);
			expect(exitCode).toBe(0);
			const sessions = readdirSync(join(root, ".afol", "wb")).filter(
				(name) => !name.startsWith("."),
			);
			expect(sessions).toHaveLength(1);
			const session = sessions[0] as string;
			const task = readFileSync(
				join(root, ".afol", "wb", session, `${session}_task_01.md`),
				"utf8",
			);
			expect(task).toContain('parent_spec: "spec-01"');
			expect(task).toContain("| T-01 | done |");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects fake governance bindings before creating a session", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-governance-"));
		try {
			const exitCode = await runQuickTaskCommand(
				[
					"fake-governance",
					"--command",
					"true",
					"--feature-id",
					"F-404",
					"--parent-spec",
					"missing-spec",
				],
				root,
			);
			expect(exitCode).toBe(2);
			expect(existsSync(join(root, ".afol", "wb"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("denies restricted agent callers before filesystem mutation", async () => {
		const exitCode = await runQuickTaskCommand(
			["alpha"],
			"/tmp/nonexistent",
			agentOperationContext(),
		);
		expect(exitCode).toBe(2);
	});

	test("returns non-zero when theme is missing", async () => {
		// The command exits before touching the filesystem when parse fails
		const exitCode = await runQuickTaskCommand([], "/tmp/nonexistent");
		expect(exitCode).toBe(2);
	});

	test("returns non-zero for invalid --result", async () => {
		const exitCode = await runQuickTaskCommand(
			["alpha", "--result", "failed"],
			"/tmp/nonexistent",
		);
		expect(exitCode).toBe(2);
	});

	test("returns non-zero for unknown flag", async () => {
		const exitCode = await runQuickTaskCommand(
			["alpha", "--bogus"],
			"/tmp/nonexistent",
		);
		expect(exitCode).toBe(2);
	});
});
