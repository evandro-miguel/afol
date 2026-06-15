import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseEventStream } from "./metrics";
import {
	BENCH_SCHEMA_VERSION,
	type BenchResult,
	type BenchScenario,
	type BenchThresholds,
	DEFAULT_BENCH_MODEL,
	DEFAULT_BENCH_PACK_ID,
	type LiveBenchResult,
} from "./types";

type LiveBenchOptions = {
	keepArtifacts?: boolean;
};

const MINIMAL_FIXTURES = [
	"afol",
	"cli",
	"package.json",
	"bun.lock",
	"tsconfig.json",
] as const;

function safeCopy(source: string, destination: string): void {
	if (!existsSync(source)) {
		return;
	}
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(source, destination, { recursive: true, force: true });
}

function copyMinimalWorkspace(root: string, sandboxRoot: string): void {
	for (const relativePath of MINIMAL_FIXTURES) {
		safeCopy(join(root, relativePath), join(sandboxRoot, relativePath));
	}
	for (const relativePath of [
		".agents/config.json",
		".agents/lock.json",
		".agents/manifest.json",
	]) {
		safeCopy(join(root, relativePath), join(sandboxRoot, relativePath));
	}
	mkdirSync(join(sandboxRoot, ".agents", "rules"), { recursive: true });
	mkdirSync(join(sandboxRoot, ".afol", "skills"), { recursive: true });
	mkdirSync(join(sandboxRoot, ".afol", "adm"), { recursive: true });
	mkdirSync(join(sandboxRoot, ".afol", "wb"), { recursive: true });
	mkdirSync(join(sandboxRoot, "docs", "arc", "SPECS"), { recursive: true });
}

function gitCommit(root: string): string {
	const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status === 0) {
		return result.stdout.trim() || "unknown";
	}
	return "unknown";
}

function normalizeThresholds(
	thresholds?: Partial<BenchThresholds>,
): BenchThresholds {
	return {
		max_output_tokens: thresholds?.max_output_tokens ?? 4_000,
		max_duration_ms: thresholds?.max_duration_ms ?? 120_000,
		min_tool_success_rate: thresholds?.min_tool_success_rate ?? 0.8,
	};
}

function tail(text: string, limit = 24): string {
	const lines = text.trim().split(/\r?\n/);
	return lines.slice(Math.max(0, lines.length - limit)).join("\n");
}

function observedCommands(
	metrics: ReturnType<typeof parseEventStream>,
): string[] {
	return metrics.tools.calls.map((call) => call.command);
}

function collectExpectationNotes(
	scenario: BenchScenario,
	metrics: ReturnType<typeof parseEventStream>,
): string[] {
	const notes: string[] = [];
	const commands = observedCommands(metrics);
	for (const expected of scenario.expected?.commands_used ?? []) {
		if (!commands.some((command) => command.includes(expected))) {
			notes.push(`expected-command-missing:${expected}`);
		}
	}
	return notes;
}

function classifyStatus(
	metrics: ReturnType<typeof parseEventStream>,
	thresholds: BenchThresholds,
	scenario: BenchScenario,
	wallClockMs: number,
): { status: BenchResult["status"]; notes: string[] } {
	const notes: string[] = [];
	if (!metrics.turn_completed) {
		notes.push("turn-not-completed");
	}
	if (metrics.tokens.output > thresholds.max_output_tokens) {
		notes.push(
			`output-tokens:${metrics.tokens.output}>${thresholds.max_output_tokens}`,
		);
	}
	if (wallClockMs > thresholds.max_duration_ms) {
		notes.push(`duration-ms:${wallClockMs}>${thresholds.max_duration_ms}`);
	}
	if (metrics.tools.success_rate < thresholds.min_tool_success_rate) {
		notes.push(
			`tool-success-rate:${metrics.tools.success_rate}<${thresholds.min_tool_success_rate}`,
		);
	}
	if (
		scenario.expected?.task_completes === true &&
		!metrics.effectiveness.task_completed
	) {
		notes.push("task-not-completed");
	}
	if (
		scenario.expected?.avoid_meta_planning === true &&
		metrics.plan_quality.meta_planning_detected
	) {
		notes.push("meta-planning-detected");
	}
	return {
		status: notes.length === 0 ? "passed" : "failed",
		notes,
	};
}

function buildResult(
	scenario: BenchScenario,
	metrics: ReturnType<typeof parseEventStream>,
	status: BenchResult["status"],
	notes: string[],
	thresholds: BenchThresholds,
	gitHash: string,
	runId: string,
	wallClockMs: number,
	allCommandsExitCode: number | null,
): LiveBenchResult {
	return {
		schema_version: BENCH_SCHEMA_VERSION,
		run_id: runId,
		scenario_id: scenario.id,
		pack_id: DEFAULT_BENCH_PACK_ID,
		status,
		mode: "live",
		git_commit: gitHash,
		model: DEFAULT_BENCH_MODEL,
		timestamp: new Date().toISOString(),
		tokens: metrics.tokens,
		timing: { wall_clock_ms: wallClockMs },
		tools: {
			total_calls: metrics.tools.total_calls + metrics.agent_messages.count,
			success_rate: metrics.tools.success_rate,
			by_type: metrics.tools.by_type,
			error_count: metrics.tools.error_count,
		},
		effectiveness: metrics.effectiveness,
		plan_quality: metrics.plan_quality,
		thresholds,
		pass: status === "passed",
		notes: [
			...notes,
			...(allCommandsExitCode === null ? ["codex-exit:null"] : []),
		],
	};
}

export function runLiveBenchmark(
	root: string,
	scenario: BenchScenario,
	opts: LiveBenchOptions = {},
): LiveBenchResult {
	const sandboxRoot = mkdtempSync(join(tmpdir(), "afol-live-bench-"));
	const thresholds = normalizeThresholds(scenario.thresholds);
	const gitHash = gitCommit(root);
	const runId = `${scenario.id}-${Date.now().toString(36)}`;
	let cleanupNeeded = !opts.keepArtifacts;
	try {
		copyMinimalWorkspace(root, sandboxRoot);
		scenario.setup?.(sandboxRoot);
		const startedAt = Date.now();
		const codex = spawnSync(
			"codex",
			[
				"exec",
				"--json",
				"--skip-git-repo-check",
				"-C",
				sandboxRoot,
				"-c",
				'model="gpt-5.4-mini"',
				"-c",
				'model_reasoning_effort="medium"',
				scenario.prompt.trim(),
			],
			{
				cwd: sandboxRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
				maxBuffer: 20 * 1024 * 1024,
			},
		);
		const wallClockMs = Date.now() - startedAt;

		if (
			codex.error &&
			(codex.error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			const metrics = parseEventStream([]);
			metrics.timing.wall_clock_ms = wallClockMs;
			return buildResult(
				scenario,
				metrics,
				"blocked",
				[`codex-missing:install-codex-or-add-it-to-path`],
				thresholds,
				gitHash,
				runId,
				wallClockMs,
				null,
			);
		}

		const stdout = codex.stdout ?? "";
		const stderr = codex.stderr ?? "";
		const metrics = parseEventStream(stdout.split(/\r?\n/));
		metrics.timing.wall_clock_ms = wallClockMs;
		const classification = classifyStatus(
			metrics,
			thresholds,
			scenario,
			wallClockMs,
		);
		const expectationNotes = collectExpectationNotes(scenario, metrics);
		const notes = [...classification.notes, ...expectationNotes];
		let status: BenchResult["status"];
		if (codex.status === 0 && classification.status === "passed") {
			status = "passed";
		} else if (codex.status === null) {
			status = "blocked";
			notes.push("codex-status:null");
		} else {
			status = "failed";
			if (stderr.trim().length > 0) {
				notes.push(`codex-stderr:${tail(stderr)}`);
			}
			notes.push(`codex-exit:${codex.status}`);
		}
		if (opts.keepArtifacts) {
			notes.push(`sandbox-kept:${sandboxRoot}`);
			cleanupNeeded = false;
		}
		return buildResult(
			scenario,
			metrics,
			status,
			notes,
			thresholds,
			gitHash,
			runId,
			wallClockMs,
			codex.status,
		);
	} finally {
		if (cleanupNeeded) {
			rmSync(sandboxRoot, { recursive: true, force: true });
		}
	}
}
