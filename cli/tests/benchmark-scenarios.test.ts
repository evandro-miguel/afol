import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runQuickTaskCommand } from "../commands/quick-task";
import { resolveCommand } from "../router";
import { listBenchScenarios } from "../services/benchmark/scenarios";

function lifecycleScenario() {
	const scenario = listBenchScenarios().find(
		(candidate) => candidate.id === "governed-task-lifecycle",
	);
	if (!scenario) {
		throw new Error("Expected governed-task-lifecycle scenario");
	}
	return scenario;
}

describe("governed-task-lifecycle benchmark contract", () => {
	test("seeds a valid governing spec", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-benchmark-scenario-"));
		try {
			const scenario = lifecycleScenario();
			scenario.setup?.(root);
			const spec = readFileSync(
				join(root, ".afol", "adm", "specs", "spec-01.md"),
				"utf8",
			);
			expect(spec).toMatch(/^doc_type: spec$/m);
			expect(spec).toMatch(/^id: spec-01$/m);
			expect(spec).toMatch(/^roadmap_feature: F-01$/m);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses one compact qt call while preserving observed verification", () => {
		const scenario = lifecycleScenario();
		expect(scenario.prompt).toContain(
			'afol qt lifecycle -F F-01 -P spec-01 -t "exercise T-01" -c "echo hello"',
		);
		expect(scenario.expected?.commands_used).toEqual(["afol qt"]);
		expect(scenario.expected?.commands_used).toHaveLength(1);
		expect(scenario.expected?.forbidden_commands).toEqual(
			expect.arrayContaining([
				"afol new",
				"afol start",
				"afol evidence",
				"afol d",
				"afol close",
			]),
		);
		expect(scenario.expected?.task_completes).toBe(true);
		expect(scenario.expected?.workbench_closed).toBe(true);
	});

	test("compact qt invocation completes with observed evidence", async () => {
		const root = mkdtempSync(join(tmpdir(), "afol-benchmark-qt-"));
		try {
			const scenario = lifecycleScenario();
			scenario.setup?.(root);
			const resolution = resolveCommand([
				"qt",
				"lifecycle",
				"-F",
				"F-01",
				"-P",
				"spec-01",
				"-t",
				"exercise T-01",
				"-c",
				"echo hello",
			]);
			expect(resolution.kind).toBe("quickTask");
			if (resolution.kind !== "quickTask") {
				throw new Error("Expected qt to resolve to quickTask");
			}
			expect(await runQuickTaskCommand(resolution.args, root)).toBe(0);

			const sessions = readdirSync(join(root, ".afol", "wb")).filter(
				(name) => !name.startsWith("."),
			);
			expect(sessions).toHaveLength(1);
			const session = sessions[0] as string;
			const evidence = readFileSync(
				join(root, ".afol", "wb", session, ".evidence.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(evidence).toHaveLength(1);
			expect(evidence[0]).toMatchObject({
				command: "echo hello",
				result: "passed",
				exit_code: 0,
				provenance: "observed",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
