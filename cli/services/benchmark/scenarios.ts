import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchScenario } from "./types";

function seedProjectSkeleton(root: string): void {
	mkdirSync(join(root, ".agents", "skills"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "hooks"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "rules"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "source"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	if (!existsSync(join(root, ".afol", "adm", "tools.json"))) {
		writeFileSync(
			join(root, ".afol", "adm", "tools.json"),
			JSON.stringify({ version: "benchmark-fixture", tools: [] }, null, 2),
			"utf8",
		);
	}
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify(
			{ schema_version: 1, project: { name: "benchmark-fixture" } },
			null,
			2,
		),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }, null, 2),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		JSON.stringify({ schema_version: 1, managed_hashes: {} }, null, 2),
		"utf8",
	);
	writeFileSync(
		join(root, "AGENTS.md"),
		[
			"# AGENTS.md",
			"",
			"This fixture is AFOL-only.",
			"",
			"- Use bare `afol` commands for status, specs, validation, and workbench lifecycle.",
			"- Use `afol maintenance ...` for maintenance cadence checks.",
			"- Do not use `./afol`.",
			"- Do not inspect `.afol/adm/specs/**` directly when `afol spec list` answers the question.",
			"- Do not inspect `.afol/memory/**`, `.afol/library/**`, or `.afol/wb/**` directly when AFOL maintenance commands answer the question.",
		].join("\n"),
		"utf8",
	);
}

function seedSpecs(root: string): void {
	const specDir = join(root, ".afol", "adm", "specs");
	if (!existsSync(specDir)) {
		mkdirSync(specDir, { recursive: true });
	}
	writeFileSync(
		join(specDir, "test-feature.md"),
		[
			"---",
			"doc_type: spec",
			"id: test-feature",
			"status: active",
			"---",
			"",
			"# test-feature",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(specDir, "active-runtime.md"),
		[
			"---",
			"doc_type: spec",
			"id: active-runtime",
			"status: active",
			"---",
			"",
			"# active-runtime",
		].join("\n"),
		"utf8",
	);
}

function seedGovernedLifecycleFixture(root: string): void {
	const roadmapDir = join(root, ".afol", "adm", "roadmap");
	const specsDir = join(root, ".afol", "adm", "specs");
	mkdirSync(roadmapDir, { recursive: true });
	mkdirSync(specsDir, { recursive: true });
	writeFileSync(
		join(roadmapDir, "GENERAL-ROADMAP.md"),
		[
			"# Roadmap",
			"",
			"### F-01 Test feature",
			"",
			"- Status: active",
			"- Governing spec: .afol/adm/specs/spec-01.md",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(specsDir, "spec-01.md"),
		[
			"---",
			"doc_type: spec",
			"id: spec-01",
			"status: active",
			"roadmap_feature: F-01",
			"---",
			"",
			"# Test feature",
		].join("\n"),
		"utf8",
	);
}

export const BENCH_SCENARIOS: BenchScenario[] = [
	{
		id: "governed-task-lifecycle",
		version: "1.0.0",
		description:
			"Create, start, test, complete, and close a governed workbench task.",
		prompt:
			'Execute exactly one command: `afol qt lifecycle -F F-01 -P spec-01 -t "exercise T-01" -c "echo hello"`. The fixture already contains the governed F-01/spec-01 pair. Do not call separate `afol new`, `afol start`, `afol evidence`, `afol d`, or `afol close` commands; use the compact `afol qt` lifecycle so its observed verification remains the evidence.',
		setup(root) {
			seedProjectSkeleton(root);
			seedGovernedLifecycleFixture(root);
		},
		expected: {
			commands_used: ["afol qt"],
			forbidden_commands: [
				"afol new",
				"afol start",
				"afol evidence",
				"afol d",
				"afol close",
				"--command",
				"--result",
				".afol/wb",
				".evidence.jsonl",
			],
			task_completes: true,
			workbench_closed: true,
		},
	},
	{
		id: "file-inspection-vs-command",
		version: "1.0.0",
		description:
			"Prefer governed CLI inspection over raw file reads when reporting project state.",
		prompt:
			"Run `afol status`, then run `afol spec list --json`, then summarize the current project status and active specs. Use bare `afol`, not `./afol`; do not inspect `.afol/adm/specs` directly unless the command is unavailable.",
		setup(root) {
			seedProjectSkeleton(root);
			seedSpecs(root);
		},
		expected: {
			commands_used: ["afol status", "afol spec list"],
			forbidden_commands: ["./afol", ".afol/adm/specs"],
		},
	},
	{
		id: "validation-flow",
		version: "1.0.0",
		description: "Run project validation and summarize failures through AFOL.",
		prompt:
			"Run `afol local-state rebuild`, then run `afol validate project` and report any failures.",
		setup(root) {
			seedProjectSkeleton(root);
		},
		expected: {
			commands_used: ["afol local-state rebuild", "afol validate project"],
			task_completes: true,
		},
	},
	{
		id: "plan-quality-check",
		version: "1.0.0",
		description:
			"Plan a new feature without drifting into meta-planning language.",
		prompt: "Plan adding a new feature called 'test-feature'.",
		setup(root) {
			seedProjectSkeleton(root);
		},
		expected: {
			avoid_meta_planning: true,
		},
	},
	{
		id: "maintenance-cadence-review",
		version: "1.0.0",
		description:
			"Exercise weekly, monthly, memory, and library maintenance cadence warnings through AFOL.",
		prompt:
			'Audit AFOL maintenance cadence. Run `afol maintenance weekly --dry-run`, `afol maintenance monthly --dry-run`, `afol maintenance review --area memory --dry-run`, `afol maintenance review --area library --dry-run`, and `afol maintenance review --area commands --note "benchmark review" --dry-run`; summarize cleanup/archive/roadmap/spec/manifest warnings. Use bare `afol`; do not inspect `.afol/memory`, `.afol/library`, `.afol/wb`, or `.afol/adm` files directly.',
		setup(root) {
			seedProjectSkeleton(root);
		},
		expected: {
			commands_used: [
				"afol maintenance weekly",
				"afol maintenance monthly",
				"afol maintenance review --area memory",
				"afol maintenance review --area library",
				"afol maintenance review --area commands",
			],
			forbidden_commands: [
				"./afol",
				".afol/memory",
				".afol/library",
				".afol/wb",
				".afol/adm",
			],
		},
	},
];

export function listBenchScenarios(): BenchScenario[] {
	return [...BENCH_SCENARIOS];
}
