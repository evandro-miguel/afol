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
		expect(parsed.metadata.tasks).toEqual(["implement foo"]);
	});

	test("parses repeated --task into metadata.tasks with first as task", () => {
		const parsed = parseQuickTaskArgs([
			"alpha",
			"--task",
			"first",
			"--task",
			"second",
			"--task",
			"third",
			"--command",
			"true",
		]);
		expect(parsed.metadata.task).toBe("first");
		expect(parsed.metadata.tasks).toEqual(["first", "second", "third"]);
	});

	test("normalizes repeated -t aliases into multi-task metadata", () => {
		const parsed = parseQuickTaskArgs(
			normalizeScopedFlags("quickTask", [
				"alpha",
				"-t",
				"one",
				"-t",
				"two",
				"-c",
				"true",
			]),
		);
		expect(parsed.metadata.task).toBe("one");
		expect(parsed.metadata.tasks).toEqual(["one", "two"]);
		expect(parsed.command).toBe("true");
	});

	test("caps repeated --task at 100", () => {
		const args = ["alpha", "--command", "true"];
		for (let i = 0; i < 101; i += 1) {
			args.push("--task", `task-${i}`);
		}
		expect(() => parseQuickTaskArgs(args)).toThrow(
			"quick-task supports at most 100 tasks",
		);
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
		expect(parsed.metadata.tasks).toEqual(["run tests"]);
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
				["pending", "--command", "test -d .afol", "--json"],
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
					"test -d .afol",
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

	test("defers fake governance bindings into a pending-spec session", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-governance-"));
		try {
			const exitCode = await runQuickTaskCommand(
				[
					"fake-governance",
					"--command",
					"test -d .afol",
					"--feature-id",
					"F-404",
					"--parent-spec",
					"missing-spec",
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
			expect(task).toContain('feature_id: "F-404"');
			expect(task).toContain('parent_spec: "missing-spec"');
			expect(task).toContain('governance_status: "pending_spec"');
			expect(
				JSON.parse(
					readFileSync(
						join(root, ".afol", "data", "governance", "pending-specs.json"),
						"utf8",
					),
				) as { entries: Array<{ status: string }> },
			).toMatchObject({ entries: [{ status: "open" }] });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("defers planned features and inactive specs into pending_spec", async () => {
		for (const fixture of [
			{ feature: "F-31", featureStatus: "planned", specStatus: "active" },
			{ feature: "F-32", featureStatus: "active", specStatus: "draft" },
		] as const) {
			const root = mkdtempSync(join(tmpdir(), "quick-task-catalog-deferred-"));
			try {
				mkdirSync(join(root, ".afol", "adm", "roadmap"), {
					recursive: true,
				});
				mkdirSync(join(root, ".afol", "adm", "specs"), {
					recursive: true,
				});
				writeFileSync(
					join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
					`# Roadmap\n\n### ${fixture.feature} Fixture\n\n- Status: ${fixture.featureStatus}\n- Governing spec: .afol/adm/specs/${fixture.feature}.md\n`,
					"utf8",
				);
				writeFileSync(
					join(root, ".afol", "adm", "specs", `${fixture.feature}.md`),
					`---\ndoc_type: spec\nid: ${fixture.feature}\nstatus: ${fixture.specStatus}\nroadmap_feature: ${fixture.feature}\n---\n\n# Spec\n`,
					"utf8",
				);

				const exitCode = await runQuickTaskCommand(
					[
						"deferred catalog",
						"--command",
						"test -d .afol",
						"--feature-id",
						fixture.feature,
						"--parent-spec",
						fixture.feature,
					],
					root,
				);
				expect(exitCode).toBe(0);
				const sessions = readdirSync(join(root, ".afol", "wb")).filter(
					(name) => !name.startsWith("."),
				);
				expect(sessions).toHaveLength(1);
				const task = readFileSync(
					join(
						root,
						".afol",
						"wb",
						sessions[0] as string,
						`${sessions[0]}_task_01.md`,
					),
					"utf8",
				);
				expect(task).toContain('governance_status: "pending_spec"');
				expect(task).toContain('pending_spec_status: "open"');
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
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

	test("JSON parse recovery does not report a phantom task", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-parse-recovery-"));
		const output: string[] = [];
		const originalLog = console.log;
		try {
			console.log = (...values: unknown[]) => output.push(values.join(" "));
			const exitCode = await runQuickTaskCommand(
				["alpha", "--bogus", "--json"],
				root,
			);
			expect(exitCode).toBe(2);
			const envelope = JSON.parse(output.at(-1) ?? "{}") as {
				schema?: string;
				ok?: boolean;
				exit_code?: number;
				error?: { code?: string };
				data?: {
					session?: string | null;
					task_id?: string | null;
					task_ids?: string[];
					failed_step?: string;
				};
			};
			expect(envelope).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				exit_code: 2,
				error: { code: "workbench.error" },
				data: {
					session: null,
					task_id: null,
					task_ids: [],
					failed_step: "parse",
				},
			});
			expect(existsSync(join(root, ".afol", "wb"))).toBe(false);
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("single-task qt still closes with done state", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-single-"));
		try {
			const exitCode = await runQuickTaskCommand(
				[
					"single",
					"--task",
					"only one",
					"--command",
					"test -d .afol",
					"--no-spec-required",
					"--reason",
					"single fixture",
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
			expect(task).toContain("| T-01 | done |");
			expect(task).not.toContain("| T-02 |");
			expect(task).toContain('status: "closed"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("multi-task qt closes all tasks done with one verification", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-multi-"));
		try {
			const exitCode = await runQuickTaskCommand(
				[
					"multi",
					"--task",
					"first work",
					"--task",
					"second work",
					"--task",
					"third work",
					"--command",
					"test -d .afol",
					"--json",
					"--no-spec-required",
					"--reason",
					"multi fixture",
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
			expect(task).toContain("| T-01 | done |");
			expect(task).toContain("| T-02 | done |");
			expect(task).toContain("| T-03 | done |");
			expect(task).toContain('status: "closed"');
			const evidenceLines = readFileSync(
				join(root, ".afol", "wb", session, ".evidence.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.filter(Boolean);
			expect(evidenceLines).toHaveLength(3);
			for (const line of evidenceLines) {
				const entry = JSON.parse(line) as {
					result: string;
					provenance?: string;
				};
				expect(entry.result).toBe("passed");
				expect(entry.provenance).toBe("observed");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fail path records failed evidence and does not close", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-multi-fail-"));
		const output: string[] = [];
		const originalLog = console.log;
		try {
			console.log = (...values: unknown[]) => output.push(values.join(" "));
			const exitCode = await runQuickTaskCommand(
				[
					"multi-fail",
					"--task",
					"a",
					"--task",
					"b",
					"--command",
					"false",
					"--json",
					"--no-spec-required",
					"--reason",
					"fail fixture",
				],
				root,
			);
			expect(exitCode).toBe(1);
			const envelope = JSON.parse(output.at(-1) ?? "{}") as {
				data?: Record<string, unknown>;
			};
			expect(envelope.data).toMatchObject({
				failed_step: "verification",
				status: "failed",
				task_ids: ["T-01", "T-02"],
				evidence_ids: expect.any(Array),
				next_command: expect.any(String),
			});
			const sessions = readdirSync(join(root, ".afol", "wb")).filter(
				(name) => !name.startsWith("."),
			);
			expect(sessions).toHaveLength(1);
			const session = sessions[0] as string;
			const task = readFileSync(
				join(root, ".afol", "wb", session, `${session}_task_01.md`),
				"utf8",
			);
			expect(task).toContain("| T-01 | in_progress |");
			expect(task).toContain("| T-02 | in_progress |");
			expect(task).not.toContain("| T-01 | done |");
			expect(task).not.toContain('status: "closed"');
			const evidenceLines = readFileSync(
				join(root, ".afol", "wb", session, ".evidence.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.filter(Boolean);
			expect(evidenceLines).toHaveLength(2);
			for (const line of evidenceLines) {
				const entry = JSON.parse(line) as {
					result: string;
					exit_code: number;
					provenance?: string;
				};
				expect(entry.result).toBe("failed");
				expect(entry.exit_code).not.toBe(0);
				expect(entry.provenance).toBe("observed");
			}
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("verification failure prints session-open recovery with the real task id", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-fail-recovery-"));
		const errors: string[] = [];
		const originalError = console.error;
		try {
			console.error = (...values: unknown[]) =>
				errors.push(values.map(String).join(" "));
			const exitCode = await runQuickTaskCommand(
				[
					"fail-recovery",
					"--task",
					"broken work",
					"--command",
					"false",
					"--no-spec-required",
					"--reason",
					"recovery fixture",
				],
				root,
			);
			expect(exitCode).toBe(1);
			const sessions = readdirSync(join(root, ".afol", "wb")).filter(
				(name) => !name.startsWith("."),
			);
			expect(sessions).toHaveLength(1);
			const output = errors.join("\n");
			expect(output).toContain(
				`session=${sessions[0]} failed_step=verification`,
			);
			expect(output).toContain("session left open");
			expect(output).toContain(
				'next: afol tr T-01 --state problem -r "<reason>"',
			);
			expect(output).toContain("(mark blocker)");
			expect(output).toContain('or: afol d T-01 -x "<corrected command>"');
			expect(output).toContain("(retry and close)");
		} finally {
			console.error = originalError;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("passing quick task prints no session-open recovery lines", async () => {
		const root = mkdtempSync(join(tmpdir(), "quick-task-pass-clean-"));
		const logs: string[] = [];
		const originalLog = console.log;
		try {
			console.log = (...values: unknown[]) => logs.push(values.join(" "));
			const exitCode = await runQuickTaskCommand(
				["pass-clean", "--command", "test -d .afol"],
				root,
			);
			expect(exitCode).toBe(0);
			expect(logs.join("\n")).not.toContain("session left open");
			expect(logs.join("\n")).toContain("quick-task complete:");
		} finally {
			console.log = originalLog;
			rmSync(root, { recursive: true, force: true });
		}
	});
});
