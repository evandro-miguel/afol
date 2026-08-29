import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runQuickTaskCommand } from "../commands/quick-task";
import { runStartCommand } from "../commands/workbench";
import { resolveCommand } from "../router";
import { listBenchScenarios } from "../services/benchmark/scenarios";
import { newWorkstream } from "../services/workbench/lifecycle";

type FleetScenario = {
	scenario_id: string;
	pack_id: string;
	command: string;
	coverage?: {
		subcommands?: string[];
		journeys?: string[];
	};
	expected_exit?: number;
	implementation_status?: "planned" | "implemented" | "skipped";
};

function readFleetScenario(name: string): FleetScenario {
	return JSON.parse(
		readFileSync(
			join(
				process.cwd(),
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"scenarios",
				"update-safety",
				`${name}.json`,
			),
			"utf8",
		),
	) as FleetScenario;
}

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
	test("route-task cannot mutate an active fixture session", async () => {
		const root = mkdtempSync(join(tmpdir(), "afol-route-task-isolation-"));
		try {
			const created = newWorkstream(root, "active fixture", {
				noSpecRequiredReason: "benchmark isolation fixture",
			});
			const scenario = JSON.parse(
				readFileSync(
					join(
						process.cwd(),
						".afol/data/benchmarks/catalog/scenarios/routing-accuracy/route-task.json",
					),
					"utf8",
				),
			) as { command: string; expected_exit: number };
			const resolution = resolveCommand(scenario.command.split(" ").slice(1));
			expect(resolution.kind).toBe("start");
			if (resolution.kind !== "start") throw new Error("Expected start route");

			const before = {
				active: readFileSync(created.activeSessionPath, "utf8"),
				task: readFileSync(created.taskPath, "utf8"),
				evidence: readFileSync(created.evidencePath, "utf8"),
			};
			expect(await runStartCommand(resolution.args, root)).toBe(
				scenario.expected_exit,
			);
			expect(readFileSync(created.activeSessionPath, "utf8")).toBe(
				before.active,
			);
			expect(readFileSync(created.taskPath, "utf8")).toBe(before.task);
			expect(readFileSync(created.evidencePath, "utf8")).toBe(before.evidence);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

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

describe("fleet update-safety benchmark scenarios", () => {
	test("covers fleet check, preview, and ineligible apply subcommands", () => {
		const check = readFleetScenario("fleet-check");
		const preview = readFleetScenario("fleet-preview");
		const apply = readFleetScenario("fleet-apply");

		const checkSubcommand =
			"fleet check --root <path> [--root <path>...] [--json]";
		const previewSubcommand =
			"fleet repair --derived --dry-run --root <path> [--json]";
		const applySubcommand =
			"fleet repair --derived --root <path> --reason <text> [--json]";

		expect(check).toMatchObject({
			scenario_id: "fleet-check",
			pack_id: "update-safety",
			command:
				"afol fleet check --root /__afol_fleet_benchmark_missing_root_v1__ --json",
			implementation_status: "implemented",
		});
		expect(preview).toMatchObject({
			scenario_id: "fleet-preview",
			pack_id: "update-safety",
			command:
				"afol fleet repair --derived --dry-run --root /__afol_fleet_benchmark_missing_root_v1__ --json",
			implementation_status: "implemented",
		});
		expect(apply).toMatchObject({
			scenario_id: "fleet-apply",
			pack_id: "update-safety",
			implementation_status: "implemented",
			command:
				'afol fleet repair --derived --root /__afol_fleet_benchmark_missing_root_v1__ --reason "missing-config guard" --json',
		});

		expect(check.coverage?.subcommands).toEqual([checkSubcommand]);
		expect(preview.coverage?.subcommands).toEqual([previewSubcommand]);
		expect(apply.coverage?.subcommands).toEqual([applySubcommand]);

		expect(check.coverage?.journeys?.length).toBeGreaterThanOrEqual(1);
		expect(preview.coverage?.journeys?.length).toBeGreaterThanOrEqual(1);
		expect(apply.coverage?.journeys?.length).toBeGreaterThanOrEqual(1);
		expect([
			...(check.coverage?.subcommands ?? []),
			...(preview.coverage?.subcommands ?? []),
			...(apply.coverage?.subcommands ?? []),
		]).toEqual(
			expect.arrayContaining([
				checkSubcommand,
				previewSubcommand,
				applySubcommand,
			]),
		);
		expect(check.expected_exit).toBe(1);
		expect(preview.expected_exit).toBe(0);
		expect(apply.expected_exit).toBe(1);
		for (const scenario of [check, preview, apply]) {
			expect(scenario.command).not.toContain("--root / ");
			expect(scenario.command).not.toMatch(/--root\s+\/[^\w]/);
		}
		expect(preview.expected_exit).toBe(0);
	});
});
