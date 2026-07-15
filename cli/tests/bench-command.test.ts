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
import { runBenchCommand, saveRuntimeLiveSnapshot } from "../commands/bench";
import { runCliMicroBenchmark } from "../services/benchmark/cli-micro";
import {
	collectExpectationNotes,
	commandMatchesExpected,
} from "../services/benchmark/live-runner";
import {
	classifyCommand,
	parseEventStream,
} from "../services/benchmark/metrics";
import { buildReport } from "../services/benchmark/report";
import { listBenchScenarios } from "../services/benchmark/scenarios";
import type { BenchResult, BenchScenario } from "../services/benchmark/types";

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

function createProjectRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "bench-command-"));
	mkdirSync(join(root, ".agents", "rules"), { recursive: true });
	mkdirSync(join(root, ".agents", "skills"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, "docs", "arc"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({ schema_version: 1, project: { name: "bench-fixture" } }),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		JSON.stringify({ schema_version: 1, managed_hashes: {} }),
		"utf8",
	);
	return root;
}

function validSavedBenchResult(overrides: Record<string, unknown> = {}) {
	return {
		schema_version: "afol.benchmark/v2",
		run_id: "run-1",
		scenario_id: "scenario-1",
		pack_id: "comprehensive-live",
		status: "passed",
		mode: "cli-micro",
		git_commit: "fixture",
		model: "codex",
		timestamp: "2026-06-17T00:00:00.000Z",
		tokens: {
			input: 1,
			output: 1,
			cached_input: 0,
			reasoning_output: 0,
			total: 2,
		},
		timing: { wall_clock_ms: 1 },
		tools: {
			total_calls: 1,
			success_rate: 1,
			by_type: { file_read: 0, afol_command: 1, shell: 0, agent_message: 0 },
			error_count: 0,
		},
		effectiveness: { task_completed: true, error_count: 0 },
		plan_quality: { meta_planning_detected: false, direct_execution: true },
		thresholds: {
			max_output_tokens: 10_000,
			max_duration_ms: 60_000,
			min_tool_success_rate: 0.95,
		},
		pass: true,
		notes: [],
		...overrides,
	};
}

describe("benchmark metrics", () => {
	test("classifyCommand groups file inspection, afol, and shell commands", () => {
		expect(classifyCommand("sed -n '1,20p' file.txt")).toBe("file_read");
		expect(classifyCommand("cat docs/arc/spec.md")).toBe("file_read");
		expect(classifyCommand("rg test-feature docs")).toBe("file_read");
		expect(classifyCommand("afol status")).toBe("afol_command");
		expect(classifyCommand("command -v afol && afol status")).toBe(
			"afol_command",
		);
		expect(classifyCommand("/usr/bin/zsh -lc 'afol spec list --json'")).toBe(
			"afol_command",
		);
		expect(classifyCommand("./afol status")).toBe("shell");
		expect(classifyCommand("/usr/bin/zsh -lc './afol status'")).toBe("shell");
		expect(classifyCommand("echo hello")).toBe("shell");
		expect(classifyCommand("git status --short")).toBe("shell");
	});

	test("parseEventStream extracts tokens, tool calls, errors, and planning signals", () => {
		const metrics = parseEventStream([
			JSON.stringify({
				type: "item.completed",
				item: {
					id: "item_1",
					type: "command_execution",
					command: "sed -n '1,120p' test.txt",
					aggregated_output: "hello\n",
					exit_code: 0,
					status: "completed",
				},
			}),
			JSON.stringify({
				type: "item.completed",
				item: {
					id: "item_2",
					type: "command_execution",
					command: "afol status",
					aggregated_output: "",
					exit_code: 1,
					status: "failed",
				},
			}),
			JSON.stringify({
				type: "item.completed",
				item: {
					id: "item_3",
					type: "agent_message",
					text: "I will create the plan before acting.",
				},
			}),
			JSON.stringify({
				type: "turn.completed",
				usage: {
					input_tokens: 10,
					cached_input_tokens: 2,
					output_tokens: 3,
					reasoning_output_tokens: 1,
				},
			}),
		]);

		expect(metrics.tokens).toEqual({
			input: 10,
			cached_input: 2,
			output: 3,
			reasoning_output: 1,
			total: 16,
		});
		expect(metrics.tools.by_type).toEqual({
			file_read: 1,
			afol_command: 1,
			shell: 0,
			agent_message: 1,
		});
		expect(metrics.tools.error_count).toBe(1);
		expect(metrics.tools.success_rate).toBe(0.5);
		expect(metrics.plan_quality.meta_planning_detected).toBe(true);
		expect(metrics.plan_quality.direct_execution).toBe(false);
		expect(metrics.effectiveness.task_completed).toBe(false);
		expect(metrics.agent_messages.count).toBe(1);
		expect(metrics.agent_messages.total_chars).toBeGreaterThan(0);
	});
});

describe("live benchmark expectation policy", () => {
	function metricsForCommands(commands: string[]) {
		return parseEventStream(
			commands.map((command, index) =>
				JSON.stringify({
					type: "item.completed",
					item: {
						id: `item_${index}`,
						type: "command_execution",
						command,
						exit_code: 0,
						status: "completed",
					},
				}),
			),
		);
	}

	test("matches expected afol commands by shell segment", () => {
		expect(commandMatchesExpected("afol status --json", "afol status")).toBe(
			true,
		);
		expect(
			commandMatchesExpected(
				"command -v afol && afol spec list --json",
				"afol spec list",
			),
		).toBe(true);
		expect(
			commandMatchesExpected(
				"/usr/bin/zsh -lc 'afol spec list --json'",
				"afol spec list",
			),
		).toBe(true);
		expect(commandMatchesExpected("./afol status --json", "afol status")).toBe(
			false,
		);
	});

	test("rejects local wrapper and direct spec file inspection", () => {
		const scenario: BenchScenario = {
			id: "file-inspection-vs-command",
			version: "test",
			description: "test",
			prompt: "test",
			expected: {
				commands_used: ["afol status", "afol spec list"],
				forbidden_commands: ["./afol", ".afol/adm/specs"],
			},
		};
		const metrics = metricsForCommands([
			"/usr/bin/zsh -lc './afol status --json'",
			"sed -n '1,20p' .afol/adm/specs/active-runtime.md",
			"/usr/bin/zsh -lc 'afol spec list --json'",
		]);

		expect(collectExpectationNotes(scenario, metrics)).toEqual([
			"expected-command-missing:afol status",
			"forbidden-command:./afol",
			"forbidden-command:.afol/adm/specs",
		]);
	});

	test("maintenance cadence scenario requires maintenance commands and rejects direct state reads", () => {
		const scenario = listBenchScenarios().find(
			(candidate) => candidate.id === "maintenance-cadence-review",
		);
		expect(scenario).toBeDefined();
		if (!scenario) {
			throw new Error("Expected maintenance-cadence-review scenario");
		}
		expect(scenario?.expected?.commands_used).toEqual([
			"afol maintenance weekly",
			"afol maintenance monthly",
			"afol maintenance review --area memory",
			"afol maintenance review --area library",
			"afol maintenance review --area commands",
		]);

		const passingMetrics = metricsForCommands([
			"afol maintenance weekly --dry-run",
			"afol maintenance monthly --dry-run",
			"afol maintenance review --area memory --dry-run",
			"afol maintenance review --area library --dry-run",
			'afol maintenance review --area commands --note "benchmark review" --dry-run',
		]);
		expect(collectExpectationNotes(scenario, passingMetrics)).toEqual([]);

		const failingMetrics = metricsForCommands([
			"sed -n '1,80p' .afol/memory/memory.md",
			"afol maintenance weekly --dry-run",
			"afol maintenance monthly --dry-run",
		]);
		expect(collectExpectationNotes(scenario, failingMetrics)).toEqual([
			"expected-command-missing:afol maintenance review --area memory",
			"expected-command-missing:afol maintenance review --area library",
			"expected-command-missing:afol maintenance review --area commands",
			"forbidden-command:.afol/memory",
		]);
	});
});

describe("bench command surfaces", () => {
	test("list renders text and json", async () => {
		const root = createProjectRoot();
		try {
			const text = captureIo();
			const textCode = await runBenchCommand("list", [], root, text.io);
			expect(textCode).toBe(0);
			expect(text.stdout.join("\n")).toContain("bench scenarios: 5");
			expect(text.stdout.join("\n")).toContain("governed-task-lifecycle");
			expect(text.stdout.join("\n")).toContain("maintenance-cadence-review");

			const json = captureIo();
			const jsonCode = await runBenchCommand("list", ["--json"], root, json.io);
			expect(jsonCode).toBe(0);
			const payload = JSON.parse(json.stdout.join("\n")) as {
				schema: string;
				ok: boolean;
				action: string;
				data: { pack_id: string; scenarios: Array<{ id: string }> };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("bench.list");
			expect(payload.data.pack_id).toBe("comprehensive-live");
			expect(payload.data.scenarios.map((scenario) => scenario.id)).toContain(
				"validation-flow",
			);
			expect(payload.data.scenarios.map((scenario) => scenario.id)).toContain(
				"maintenance-cadence-review",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("cli benchmark emits an envelope with real command metrics", async () => {
		const root = process.cwd();
		const captured = captureIo();
		const code = await runBenchCommand("cli", ["--json"], root, captured.io);
		expect(code).toBe(0);
		expect(captured.stdout.length).toBe(1);
		const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
			schema: string;
			ok: boolean;
			action: string;
			data: {
				pack_id: string;
				results: Array<{
					args: string[];
					output_bytes: number;
					estimated_output_tokens: number;
				}>;
			};
		};
		expect(payload.schema).toBe("afol.result/v1");
		expect(payload.ok).toBe(true);
		expect(payload.action).toBe("bench.cli");
		expect(payload.data.pack_id).toBe("cli-micro");
		expect(payload.data.results).toHaveLength(7);
		expect(
			payload.data.results.every((result) => result.output_bytes >= 0),
		).toBe(true);
	});

	test("runtime-live action exposes dry-run metadata without execution", async () => {
		const captured = captureIo();
		const code = await runBenchCommand(
			"runtime-live",
			["--json"],
			process.cwd(),
			captured.io,
		);
		expect(code).toBe(0);
		const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
			action: string;
			data: {
				mode: string;
				live_execution: boolean;
				live_execution_entrypoint: string;
				benchmark_profile: { model: string; reasoning_effort: string };
				scenario_count: number;
				validation_command: string;
			};
		};
		expect(payload.action).toBe("bench.runtime-live");
		expect(payload.data.mode).toBe("dry-run");
		expect(payload.data.live_execution).toBe(false);
		expect(payload.data.live_execution_entrypoint).toBe(
			"afol bench run --all --save",
		);
		expect(payload.data.benchmark_profile.model).toBe("gpt-5.4-mini");
		expect(payload.data.benchmark_profile.reasoning_effort).toBe("medium");
		expect(payload.data.scenario_count).toBeGreaterThan(0);
		expect(payload.data.validation_command).toBe(
			"afol validate bench --pack runtime-live-agent --json",
		);
	});

	test("runtime-live dry-run reports malformed snapshot without executing", async () => {
		const root = createProjectRoot();
		try {
			mkdirSync(join(root, ".afol", "data", "benchmarks", "snapshots"), {
				recursive: true,
			});
			writeFileSync(
				join(
					root,
					".afol",
					"data",
					"benchmarks",
					"snapshots",
					"runtime-flow-live-agent-v4-latest.json",
				),
				"{not json",
				"utf8",
			);
			const captured = captureIo();
			const code = await runBenchCommand(
				"runtime-live",
				["--json"],
				root,
				captured.io,
			);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				data: {
					live_execution: boolean;
					snapshot_exists: boolean;
					snapshot_parse_error: string | null;
					note: string;
				};
			};
			expect(payload.data.live_execution).toBe(false);
			expect(payload.data.snapshot_exists).toBe(true);
			expect(payload.data.snapshot_parse_error).toBeTruthy();
			expect(payload.data.note).toContain("snapshot parse failed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("saved all-scenario runs write a compliant runtime-live snapshot", () => {
		const root = createProjectRoot();
		try {
			const result = validSavedBenchResult({
				scenario_id: "governed-task-lifecycle",
			}) as BenchResult;
			const report = buildReport([result], null);
			const snapshotPath = saveRuntimeLiveSnapshot(
				root,
				report,
				".afol/data/benchmarks/results/run.json",
			);
			const snapshot = JSON.parse(
				readFileSync(join(root, snapshotPath), "utf8"),
			) as Record<string, unknown>;
			expect(snapshot.schema_version).toBe("1.0.0");
			expect(snapshot.stale_after_days).toBe(7);
			expect(Date.parse(String(snapshot.generated_at))).not.toBeNaN();
			expect(snapshot.scenarios).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "live-implement-start-complete-evidence",
					}),
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("report filters malformed saved run rows", async () => {
		const root = createProjectRoot();
		try {
			const runPath = join(root, "malformed-run.json");
			writeFileSync(
				runPath,
				JSON.stringify({
					results: [{ scenario_id: "s1" }, validSavedBenchResult()],
				}),
				"utf8",
			);
			const captured = captureIo();
			const code = await runBenchCommand(
				"report",
				["--run", runPath],
				root,
				captured.io,
			);
			expect(code).toBe(0);
			expect(captured.stderr).toHaveLength(0);
			expect(captured.stdout[0]).toContain(
				"results: 1 passed=1 failed=0 blocked=0",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("report rejects saved runs with no valid rows", async () => {
		const root = createProjectRoot();
		try {
			const runPath = join(root, "invalid-run.json");
			writeFileSync(
				runPath,
				JSON.stringify({ results: [{ scenario_id: "s1" }] }),
				"utf8",
			);
			const captured = captureIo();
			const code = await runBenchCommand(
				"report",
				["--run", runPath],
				root,
				captured.io,
			);
			expect(code).toBe(2);
			expect(captured.stdout).toHaveLength(0);
			expect(captured.stderr).toHaveLength(1);
			expect(captured.stderr[0]).toContain("Malformed benchmark run");
			expect(captured.stderr[0]).toContain("results must include");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("report emits a JSON error envelope for a missing run", async () => {
		const root = createProjectRoot();
		try {
			const captured = captureIo();
			const code = await runBenchCommand(
				"report",
				["--json", "--run", "missing-run.json"],
				root,
				captured.io,
			);
			expect(code).toBe(2);
			expect(captured.stderr).toHaveLength(0);
			expect(captured.stdout).toHaveLength(1);
			expect(JSON.parse(captured.stdout[0] ?? "{}")).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "bench.report",
				exit_code: 2,
				error: {
					code: "bench.error",
					message: expect.stringContaining("missing-run.json"),
				},
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("report emits a JSON error envelope for a missing run argument", async () => {
		const root = createProjectRoot();
		try {
			const captured = captureIo();
			const code = await runBenchCommand(
				"report",
				["--json", "--run"],
				root,
				captured.io,
			);
			expect(code).toBe(2);
			expect(captured.stderr).toHaveLength(0);
			expect(captured.stdout).toHaveLength(1);
			expect(JSON.parse(captured.stdout[0] ?? "{}")).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "bench.report",
				exit_code: 2,
				error: {
					code: "bench.error",
					message: "Missing value for --run in bench report.",
				},
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("report recognizes the short JSON alias on parser failures", async () => {
		const root = createProjectRoot();
		try {
			const captured = captureIo();
			const code = await runBenchCommand(
				"report",
				["-j", "--unknown"],
				root,
				captured.io,
			);
			expect(code).toBe(2);
			expect(captured.stderr).toHaveLength(0);
			expect(captured.stdout).toHaveLength(1);
			expect(JSON.parse(captured.stdout[0] ?? "{}")).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "bench.report",
				exit_code: 2,
				error: {
					code: "bench.error",
					message: "Unknown bench argument: --unknown",
				},
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("baseline rejects malformed baseline JSON", async () => {
		const root = createProjectRoot();
		try {
			const baselineDir = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"baselines",
				"comprehensive-live",
			);
			mkdirSync(baselineDir, { recursive: true });
			writeFileSync(join(baselineDir, "baseline-v1.json"), "{bad-json\n");
			const captured = captureIo();
			const code = await runBenchCommand(
				"baseline",
				["--json"],
				root,
				captured.io,
			);
			expect(code).toBe(2);
			expect(captured.stderr).toHaveLength(0);
			expect(captured.stdout).toHaveLength(1);
			expect(JSON.parse(captured.stdout[0] ?? "{}")).toMatchObject({
				schema: "afol.result/v1",
				ok: false,
				action: "bench.baseline",
				exit_code: 2,
				error: {
					code: "bench.error",
					message: expect.stringContaining("Malformed benchmark JSON"),
				},
			});
			expect(captured.stdout[0]).toContain("baseline-v1.json");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runCliMicroBenchmark reports read-only command metrics", () => {
		const results = runCliMicroBenchmark(process.cwd());
		expect(results).toHaveLength(7);
		expect(results.map((result) => result.args[0])).toEqual(
			expect.arrayContaining([
				"status",
				"validate",
				"rule",
				"-h",
				"session",
				"catchup",
				"preflight",
			]),
		);
		expect(results.every((result) => result.command === "afol")).toBe(true);
		expect(results.every((result) => result.wall_clock_ms >= 0)).toBe(true);
		expect(results.every((result) => result.output_bytes >= 0)).toBe(true);
		expect(results.every((result) => result.estimated_output_tokens >= 0)).toBe(
			true,
		);
	});
});
