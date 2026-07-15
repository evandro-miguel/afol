import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { boundedSpawn } from "../../core/subprocess";
import { normalizeCommandForBenchmark, parseEventStream } from "./metrics";
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
		".afol/config.json",
		".agents/config.json",
		".agents/lock.json",
		".agents/manifest.json",
	]) {
		safeCopy(join(root, relativePath), join(sandboxRoot, relativePath));
	}
	safeCopy(
		join(root, "src", "project-template", ".afol", "adm"),
		join(sandboxRoot, ".afol", "adm"),
	);
	mkdirSync(join(sandboxRoot, ".agents", "skills"), { recursive: true });
	mkdirSync(join(sandboxRoot, ".afol", "wb"), { recursive: true });
}

function gitCommit(root: string): string {
	const result = boundedSpawn("git", ["rev-parse", "--short=12", "HEAD"], {
		cwd: root,
		timeoutMs: 15_000,
	});
	if (result.ok) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(text);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function commandTail(stdout: string, stderr: string): string {
	const combined = [stdout, stderr].filter(Boolean).join("\n");
	return tail(combined, 8);
}

function verifyWorkbenchClosed(root: string): {
	completed: boolean;
	notes: string[];
} {
	const status = boundedSpawn(
		"bun",
		["run", "cli/main.ts", "status", "--json"],
		{
			cwd: root,
			timeoutMs: 60_000,
			maxBuffer: 2 * 1024 * 1024,
		},
	);
	if (!status.ok) {
		return {
			completed: false,
			notes: [
				status.timedOut
					? "workbench-status-timed-out"
					: `workbench-status-exit:${status.status}:${commandTail(status.stdout, status.spawnError ?? status.stderr)}`,
			],
		};
	}

	const statusPayload = parseJson(status.stdout);
	const statusData = isRecord(statusPayload?.data) ? statusPayload.data : null;
	const statusClosed =
		statusData?.status === "none" &&
		(!Object.hasOwn(statusData, "active_session") ||
			statusData.active_session === null ||
			statusData.active_session === "" ||
			statusData.active_session === "none");
	if (!statusClosed) {
		return {
			completed: false,
			notes: ["workbench-status-not-closed"],
		};
	}

	const verify = boundedSpawn(
		"bun",
		["run", "cli/main.ts", "verify-tasks", "--strict", "--json"],
		{
			cwd: root,
			timeoutMs: 60_000,
			maxBuffer: 2 * 1024 * 1024,
		},
	);
	if (!verify.ok) {
		return {
			completed: false,
			notes: [
				verify.timedOut
					? "workbench-verify-timed-out"
					: `workbench-verify-exit:${verify.status}:${commandTail(verify.stdout, verify.spawnError ?? verify.stderr)}`,
			],
		};
	}

	const verifyPayload = parseJson(verify.stdout);
	if (verifyPayload?.ok !== true) {
		return {
			completed: false,
			notes: ["workbench-verify-not-ok"],
		};
	}

	return { completed: true, notes: [] };
}

function applyScriptedCompletionProbe(
	scenario: BenchScenario,
	sandboxRoot: string,
	metrics: ReturnType<typeof parseEventStream>,
): string[] {
	if (scenario.expected?.workbench_closed !== true) {
		return [];
	}
	const probe = verifyWorkbenchClosed(sandboxRoot);
	if (probe.completed) {
		metrics.effectiveness.task_completed = true;
		return [];
	}
	return probe.notes;
}

function writeTraceArtifacts(
	sandboxRoot: string,
	stdout: string,
	stderr: string,
): void {
	const traceDir = join(sandboxRoot, ".afol", "data", "benchmarks");
	mkdirSync(traceDir, { recursive: true });
	writeFileSync(join(traceDir, "codex-stdout.jsonl"), stdout, "utf8");
	writeFileSync(join(traceDir, "codex-stderr.log"), stderr, "utf8");
}

function observedCommands(
	metrics: ReturnType<typeof parseEventStream>,
): string[] {
	return metrics.tools.calls.map((call) => call.command);
}

function commandSegments(command: string): string[] {
	return normalizeCommandForBenchmark(command)
		.split(/&&|\|\||;|\r?\n/g)
		.map((segment) => segment.trim());
}

export function commandMatchesExpected(
	command: string,
	expected: string,
): boolean {
	const normalizedExpected = expected.trim().replace(/\s+/g, " ");
	if (!normalizedExpected) {
		return true;
	}
	return commandSegments(command).some((segment) => {
		const normalizedSegment = segment.replace(/\s+/g, " ");
		return (
			normalizedSegment === normalizedExpected ||
			normalizedSegment.startsWith(`${normalizedExpected} `)
		);
	});
}

function commandIncludesForbidden(command: string, forbidden: string): boolean {
	const normalizedForbidden = forbidden.trim().replace(/\s+/g, " ");
	if (!normalizedForbidden) {
		return false;
	}
	return normalizeCommandForBenchmark(command)
		.replace(/\s+/g, " ")
		.includes(normalizedForbidden);
}

export function collectExpectationNotes(
	scenario: BenchScenario,
	metrics: ReturnType<typeof parseEventStream>,
): string[] {
	const notes: string[] = [];
	const commands = observedCommands(metrics);
	for (const expected of scenario.expected?.commands_used ?? []) {
		if (
			!commands.some((command) => commandMatchesExpected(command, expected))
		) {
			notes.push(`expected-command-missing:${expected}`);
		}
	}
	for (const forbidden of scenario.expected?.forbidden_commands ?? []) {
		if (
			commands.some((command) => commandIncludesForbidden(command, forbidden))
		) {
			notes.push(`forbidden-command:${forbidden}`);
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
/** @internal Exported as test seam: classifies a boundedSpawn result for bench scenarios. */
export type SpawnClassification = "ok" | "missing" | "blocked" | "failed";

/** @internal Exported as test seam, called by runLiveBenchmark. */
export function _classifySpawnForBench(result: {
	ok: boolean;
	status: number | null;
	timedOut: boolean;
	signal: string | null;
	spawnError: string | null;
}): SpawnClassification {
	if (result.ok) return "ok";
	// Process ran (was spawned) but timed out, was killed, or exited non-zero
	if (result.timedOut) return "failed";
	if (result.signal) return "failed";
	if (result.status !== null) return "failed";
	// Process never started: ENOENT means binary not on PATH
	if (result.spawnError?.startsWith("ENOENT")) return "missing";
	// Permission failures mean the binary was found but cannot execute.
	if (/^(?:EACCES|EPERM):/.test(result.spawnError ?? "")) return "blocked";
	// Buffer, runtime, and unknown spawn failures are benchmark failures.
	if (result.spawnError) return "failed";
	// Fallback: no environmental diagnostic means the benchmark failed
	return "failed";
}

/** @internal Exported as a test seam for failed Codex diagnostics. */
export function _collectCodexFailureNotes(result: {
	status: number | null;
	timedOut: boolean;
	spawnError: string | null;
	stderr: string;
}): string[] {
	const notes: string[] = [];
	if (result.spawnError) notes.push(`spawn-error:${result.spawnError}`);
	if (result.stderr.trim().length > 0) {
		notes.push(`codex-stderr:${tail(result.stderr)}`);
	}
	if (result.timedOut) {
		notes.push("codex-timed-out");
	} else if (result.status !== null) {
		notes.push(`codex-exit:${result.status}`);
	}
	return notes;
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
		const codex = boundedSpawn(
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
				timeoutMs: Math.max(thresholds.max_duration_ms + 60_000, 180_000),
				maxBuffer: 20 * 1024 * 1024,
			},
		);
		const wallClockMs = Date.now() - startedAt;
		const spawnClassification = _classifySpawnForBench(codex);

		if (spawnClassification === "missing") {
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
		if (opts.keepArtifacts) {
			writeTraceArtifacts(sandboxRoot, stdout, stderr);
		}
		const metrics = parseEventStream(stdout.split(/\r?\n/));
		metrics.timing.wall_clock_ms = wallClockMs;
		const scriptedNotes = applyScriptedCompletionProbe(
			scenario,
			sandboxRoot,
			metrics,
		);
		const classification = classifyStatus(
			metrics,
			thresholds,
			scenario,
			wallClockMs,
		);
		const expectationNotes = collectExpectationNotes(scenario, metrics);
		const blockingNotes = [
			...classification.notes,
			...expectationNotes,
			...scriptedNotes,
		];
		const notes = [...blockingNotes];
		let status: BenchResult["status"];
		if (
			codex.status === 0 &&
			classification.status === "passed" &&
			blockingNotes.length === 0
		) {
			status = "passed";
		} else if (spawnClassification === "blocked") {
			status = "blocked";
			notes.push(`spawn-error:${codex.spawnError}`);
		} else {
			status = "failed";
			notes.push(
				..._collectCodexFailureNotes({
					status: codex.status,
					timedOut: codex.timedOut,
					spawnError: codex.spawnError,
					stderr,
				}),
			);
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
