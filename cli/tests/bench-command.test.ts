import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBenchCommand } from "../commands/bench";
import { classifyCommand, parseEventStream } from "../services/benchmark";
import { runCliMicroBenchmark } from "../services/benchmark/cli-micro";

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

describe("benchmark metrics", () => {
	test("classifyCommand groups file inspection, afol, and shell commands", () => {
		expect(classifyCommand("sed -n '1,20p' file.txt")).toBe("file_read");
		expect(classifyCommand("cat docs/arc/spec.md")).toBe("file_read");
		expect(classifyCommand("rg test-feature docs")).toBe("file_read");
		expect(classifyCommand("afol status")).toBe("afol_command");
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

describe("bench command surfaces", () => {
	test("list renders text and json", async () => {
		const root = createProjectRoot();
		try {
			const text = captureIo();
			const textCode = await runBenchCommand("list", [], root, text.io);
			expect(textCode).toBe(0);
			expect(text.stdout.join("\n")).toContain("bench scenarios: 4");
			expect(text.stdout.join("\n")).toContain("governed-task-lifecycle");

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
				benchmark_profile: { model: string; reasoning_effort: string };
				scenario_count: number;
				validation_command: string;
			};
		};
		expect(payload.action).toBe("bench.runtime-live");
		expect(payload.data.mode).toBe("dry-run");
		expect(payload.data.live_execution).toBe(false);
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
