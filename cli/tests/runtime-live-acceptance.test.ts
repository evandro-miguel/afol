import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistry } from "../validate/registry";
import { buildRuntimeLiveAgentResults } from "../validate/runtime-live";
import type { Scenario } from "../validate/types";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
const scenario: Scenario = {
	schema_version: "1.0.0",
	scenario_id: "test-delivery",
	scenario_version: "1.0.0",
	pack_id: "runtime-live-agent",
	execution_source: "project",
	result_schema: "2.0.0",
	oracle: "independent-checks-and-artifacts",
	thresholds: {
		max_duration_ms: 1000,
		max_output_tokens: 100,
		min_tool_success_rate: 0.9,
	},
	baseline_id: "fixture",
	deterministic_metrics: {},
	implementation_status: "implemented",
	live_runner_scenario_id: "delivery",
};
function fixture(rows: unknown[]): string {
	const root = mkdtempSync(join(tmpdir(), "runtime-acceptance-"));
	roots.push(root);
	const dir = join(root, ".afol/data/benchmarks/snapshots");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "runtime-flow-live-agent-v4-latest.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			pack_id: "runtime-flow-live-agent-v4",
			generated_at: new Date().toISOString(),
			stale_after_days: 7,
			pass: true,
			benchmark_profile: {
				runtime: "codex",
				model: "gpt-5.6-luna",
				reasoning_effort: "medium",
			},
			scenarios: rows,
		}),
	);
	return root;
}
const declared = {
	id: "delivery",
	pass: true,
	duration_ms: 10,
	tool_call_count: 1,
	tool_success_rate: 1,
	error_count: 0,
	token_usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
};

const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex");
const artifact = "export const answer = 42;\n";
const contract = {
	checks: [
		{
			id: "answer",
			argv: [
				process.execPath,
				"-e",
				"const text = await Bun.file('answer.ts').text(); if (!text.includes('answer = 42')) process.exit(1);",
			],
		},
	],
	artifacts: ["answer.ts"],
};
const observationStart = Date.now() - 10_000;
const observedTime = (offset = 0) =>
	new Date(observationStart + offset).toISOString();
const observedEvents = [
	{ type: "run.started", timestamp: observedTime() },
	{
		type: "item.completed",
		item: {
			id: "tool1",
			type: "command_execution",
			command: "check",
			status: "completed",
			exit_code: 0,
		},
	},
	{
		type: "turn.completed",
		id: "t1",
		timestamp: observedTime(50),
		usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 },
	},
];
type Snapshot = {
	schema_version: string;
	generated_at: string;
	benchmark_profile: {
		runtime: string;
		model: string;
		reasoning_effort: string;
	};
	event_profile: {
		harness: string;
		version: string;
		format: string;
		usage_mode: string;
		token_details: string;
	};
	scenarios: Array<{
		id: string;
		pass: boolean;
		events: unknown[];
		acceptance: {
			source_commit: string;
			contract_sha256: string;
			artifacts: Array<{ path: string; sha256: string }>;
		};
	}>;
};
function observedFixture(): {
	root: string;
	snapshot: Snapshot;
	configured: Scenario;
} {
	const root = fixture([]);
	execFileSync("git", ["init", "-q"], { cwd: root });
	writeFileSync(join(root, "answer.ts"), artifact);
	execFileSync("git", ["add", "answer.ts"], { cwd: root });
	execFileSync(
		"git",
		[
			"-c",
			"user.name=Fixture",
			"-c",
			"user.email=fixture@example.invalid",
			"commit",
			"-qm",
			"fixture",
		],
		{ cwd: root },
	);
	const snapshot = JSON.parse(
		readFileSync(
			join(
				root,
				".afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json",
			),
			"utf8",
		),
	) as Snapshot;
	snapshot.schema_version = "2.0.0";
	snapshot.event_profile = {
		harness: "codex",
		version: "fixture-1",
		format: "codex-exec-v1",
		usage_mode: "delta",
		token_details: "included",
	};
	snapshot.scenarios = [
		{
			id: "delivery",
			pass: false,
			events: observedEvents,
			acceptance: {
				source_commit: execFileSync("git", ["rev-parse", "HEAD"], {
					cwd: root,
					encoding: "utf8",
				}).trim(),
				contract_sha256: hash(JSON.stringify(contract)),
				artifacts: [{ path: "answer.ts", sha256: hash(artifact) }],
			},
		},
	];
	return { root, snapshot, configured: { ...scenario, acceptance: contract } };
}
function save(root: string, snapshot: unknown) {
	writeFileSync(
		join(
			root,
			".afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json",
		),
		JSON.stringify(snapshot),
	);
}

function first<T>(values: T[]): T {
	const value = values[0];
	if (value === undefined) throw new Error("fixture entry missing");
	return value;
}

describe("runtime benchmark independent acceptance", () => {
	test("bundled workloads remain staged until project acceptance is supplied", () => {
		const { root, snapshot } = observedFixture();
		save(root, snapshot);
		const scenarios =
			loadRegistry(root).scenariosByPack["runtime-live-agent"] ?? [];
		expect(scenarios).toHaveLength(4);
		expect(
			scenarios.every((row) => row.implementation_status === "planned"),
		).toBe(true);
		const results = buildRuntimeLiveAgentResults(
			root,
			scenarios,
			"baseline.json",
		).results;
		expect(results.every((row) => row.status === "skipped" && !row.pass)).toBe(
			true,
		);
		expect(results.every((row) => row.tool_call_count === null)).toBe(true);
	});
	test("a declared pass with no independent checks/artifacts cannot pass the live gate", () => {
		const root = fixture([declared]);
		const result = buildRuntimeLiveAgentResults(
			root,
			[scenario],
			"baseline.json",
		);
		expect(result.results[0]?.pass).toBe(false);
	});
	test("missing telemetry cannot be substituted with zero and perfect tool success", () => {
		const root = fixture([{ id: "delivery", pass: true }]);
		const result = buildRuntimeLiveAgentResults(
			root,
			[scenario],
			"baseline.json",
		);
		expect(result.results[0]?.pass).toBe(false);
	});
	test("duplicate external scenario IDs cannot overwrite failed evidence", () => {
		const root = fixture([{ ...declared, pass: false }, declared]);
		const result = buildRuntimeLiveAgentResults(
			root,
			[scenario],
			"baseline.json",
		);
		expect(result.results[0]?.pass).toBe(false);
	});

	test("acceptance is decided by actual checks and artifacts, not declared pass", () => {
		const { root, snapshot, configured } = observedFixture();
		save(root, snapshot);
		const result = buildRuntimeLiveAgentResults(
			root,
			[configured],
			"baseline.json",
		).results[0];
		expect(
			result?.notes.filter((note) => !note.startsWith("live-runner")),
		).toEqual([]);
		expect(result?.pass).toBe(true);
		expect(result?.acceptance_checks?.[0]?.exit_code).toBe(0);
		expect(result?.observations?.tokens.total).toBe(15);
		expect(result?.prompt_tokens).toBeNull();
		expect(result?.timing_p95_ms).toBeNull();
	});

	test("a completed empty turn does not establish delivery", () => {
		const { root, snapshot, configured } = observedFixture();
		first(snapshot.scenarios).events = [
			{ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
		];
		save(root, snapshot);
		const result = buildRuntimeLiveAgentResults(
			root,
			[configured],
			"baseline.json",
		).results[0];
		expect(result?.pass).toBe(false);
		expect(result?.duration_ms).toBeNull();
		expect(result?.acceptance_checks).toEqual([]);
	});

	test("failed checks and changed artifacts defeat declared pass", () => {
		const { root, snapshot, configured } = observedFixture();
		writeFileSync(join(root, "answer.ts"), "export const answer = 41;\n");
		first(snapshot.scenarios).pass = true;
		first(first(snapshot.scenarios).acceptance.artifacts).sha256 = hash(
			"export const answer = 41;\n",
		);
		save(root, snapshot);
		const result = buildRuntimeLiveAgentResults(
			root,
			[configured],
			"baseline.json",
		).results[0];
		expect(result?.pass).toBe(false);
		expect(result?.acceptance_checks?.[0]?.exit_code).toBe(1);
	});

	test("rejects duplicate mappings and stale or mismatched evidence before checks", () => {
		const { root, snapshot, configured } = observedFixture();
		snapshot.scenarios.push(first(snapshot.scenarios));
		save(root, snapshot);
		expect(
			buildRuntimeLiveAgentResults(root, [configured], "baseline.json")
				.notes[0],
		).toContain("duplicate");
		snapshot.scenarios.pop();
		snapshot.generated_at = "2020-01-01T00:00:00Z";
		save(root, snapshot);
		expect(
			buildRuntimeLiveAgentResults(root, [configured], "baseline.json")
				.notes[0],
		).toContain("stale");
		snapshot.generated_at = new Date().toISOString();
		snapshot.benchmark_profile.model = "gpt-5.4-mini";
		save(root, snapshot);
		expect(
			buildRuntimeLiveAgentResults(root, [configured], "baseline.json")
				.notes[0],
		).toContain("profile-mismatch");
	});

	test("a recovered tool error does not override a verified delivery", () => {
		const { root, snapshot, configured } = observedFixture();
		first(snapshot.scenarios).events = [
			observedEvents[0],
			{
				type: "item.completed",
				item: {
					id: "failed-tool",
					type: "command_execution",
					command: "check",
					status: "failed",
					exit_code: 1,
				},
			},
			...observedEvents.slice(1),
		];
		save(root, snapshot);
		const result = buildRuntimeLiveAgentResults(
			root,
			[
				{
					...configured,
					thresholds: { ...configured.thresholds, min_tool_success_rate: 0.5 },
				},
			],
			"baseline.json",
		).results[0];
		expect(result?.pass).toBe(true);
		expect(result?.error_count).toBe(1);
		expect(result?.tool_success_rate).toBe(0.5);
	});

	test("saved result paths cannot escape the benchmark artifact directories", () => {
		const { root, snapshot, configured } = observedFixture();
		save(root, { ...snapshot, saved_result_path: "../../outside.json" });
		const result = buildRuntimeLiveAgentResults(
			root,
			[configured],
			"baseline.json",
		);
		expect(result.notes[0]).toBe("runtime-live-artifact-path-invalid");
	});

	test("percentile gates require multiple observed samples and exclude declared warmups", () => {
		const { root, snapshot, configured } = observedFixture();
		const timed = {
			...configured,
			thresholds: { ...configured.thresholds, max_p95_ms: 250 },
		};
		save(root, snapshot);
		expect(
			buildRuntimeLiveAgentResults(root, [timed], "baseline.json").results[0]
				?.notes,
		).toContain("threshold-metric-missing:max_p95_ms");
		const samples = [900, 100, 200].map((duration, index) => ({
			run_id: `run-${index}`,
			started_at: observedTime(),
			finished_at: observedTime(duration),
		}));
		save(root, {
			...snapshot,
			scenarios: [
				{
					...first(snapshot.scenarios),
					timing_samples: { warmup_count: 1, samples },
				},
			],
		});
		const result = buildRuntimeLiveAgentResults(root, [timed], "baseline.json")
			.results[0];
		expect(result?.pass).toBe(true);
		expect(result?.timing_p50_ms).toBe(100);
		expect(result?.timing_p95_ms).toBe(200);
		expect(result?.sample_count).toBe(2);
		expect(result?.warmup_count).toBe(1);
		save(root, {
			...snapshot,
			scenarios: [
				{
					...first(snapshot.scenarios),
					timing_samples: {
						warmup_count: 0,
						samples: [samples[0], samples[0]],
					},
				},
			],
		});
		expect(
			buildRuntimeLiveAgentResults(root, [timed], "baseline.json").results[0]
				?.pass,
		).toBe(false);
	});

	test("the native CLI derives pass and emits unknown values unchanged", () => {
		const { root, snapshot, configured } = observedFixture();
		save(root, snapshot);
		const catalog = join(root, ".afol/data/benchmarks/catalog");
		mkdirSync(join(root, ".agents"), { recursive: true });
		for (const name of ["lock.json", "manifest.json"]) {
			copyFileSync(
				join(import.meta.dir, "../../src/project-template/.agents", name),
				join(root, ".agents", name),
			);
		}
		mkdirSync(join(catalog, "scenarios/runtime-live-agent"), {
			recursive: true,
		});
		writeFileSync(
			join(root, ".afol/config.json"),
			JSON.stringify({ schema_version: 1, project: { name: "fixture" } }),
		);
		writeFileSync(
			join(catalog, "registry.json"),
			JSON.stringify({
				schema_version: "1.0.0",
				packs: [{ pack_id: "runtime-live-agent", min_scenarios: 1 }],
			}),
		);
		writeFileSync(
			join(catalog, "scenarios/runtime-live-agent/delivery.json"),
			JSON.stringify({ ...configured, command: "afol status" }),
		);
		const cli = join(import.meta.dir, "../main.ts");
		const run = () =>
			Bun.spawnSync(
				[
					process.execPath,
					cli,
					"validate",
					"bench",
					"--pack",
					"runtime-live-agent",
					"--scenario-id",
					scenario.scenario_id,
					"--json",
				],
				{ cwd: root },
			);
		const success = run();
		expect(success.stderr.toString()).toBe("");
		const payload = JSON.parse(success.stdout.toString());
		expect(success.exitCode).toBe(0);
		expect(payload.pass).toBe(true);
		expect(payload.benchmark_result_schema_version).toBe("2.0.0");
		expect(payload.results[0].prompt_tokens).toBeNull();
		writeFileSync(
			join(catalog, "scenarios/runtime-live-agent/duplicate.json"),
			JSON.stringify({
				...configured,
				scenario_id: "duplicate",
				command: "afol status",
			}),
		);
		const reused = run();
		expect(reused.exitCode).toBe(2);
		expect(JSON.parse(reused.stdout.toString()).results[0].notes).toContain(
			"runtime-live-direct-evidence-missing-or-reused",
		);
		rmSync(join(catalog, "scenarios/runtime-live-agent/duplicate.json"));
		writeFileSync(join(root, "answer.ts"), "incorrect artifact");
		const failed = run();
		expect(failed.exitCode).toBe(2);
		expect(JSON.parse(failed.stdout.toString()).pass).toBe(false);
	});
});
