import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchScenario } from "./types";

function seedProjectSkeleton(root: string): void {
	mkdirSync(join(root, ".agents", "rules"), { recursive: true });
	mkdirSync(join(root, ".agents", "skills"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "SPECS"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
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
}

function seedSpecs(root: string): void {
	const specDir = join(root, "docs", "arc", "SPECS");
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

export const BENCH_SCENARIOS: BenchScenario[] = [
	{
		id: "governed-task-lifecycle",
		version: "1.0.0",
		description:
			"Create, start, evidence, complete, and close a governed workbench task.",
		prompt:
			"Create a workbench session, start task T-01, add evidence with command 'echo hello', mark done, close session. Use afol commands.",
		setup(root) {
			seedProjectSkeleton(root);
		},
		expected: {
			commands_used: [
				"afol new",
				"afol start",
				"afol evidence",
				"afol done",
				"afol close",
			],
			task_completes: true,
		},
	},
	{
		id: "file-inspection-vs-command",
		version: "1.0.0",
		description:
			"Prefer governed CLI inspection over raw file reads when reporting project state.",
		prompt: "Show the current project status and list active specs.",
		setup(root) {
			seedProjectSkeleton(root);
			seedSpecs(root);
		},
		expected: {
			commands_used: ["afol status", "afol spec"],
		},
	},
	{
		id: "validation-flow",
		version: "1.0.0",
		description: "Run project validation and summarize failures through AFOL.",
		prompt: "Run project validation and report any failures.",
		setup(root) {
			seedProjectSkeleton(root);
		},
		expected: {
			commands_used: ["afol validate project"],
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
];

export function listBenchScenarios(): BenchScenario[] {
	return [...BENCH_SCENARIOS];
}
