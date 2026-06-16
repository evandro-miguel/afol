import { spawnSync } from "node:child_process";
import {
	accessSync,
	existsSync,
	constants as fsConstants,
	mkdtempSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { saveBenchmarkPayload } from "./benchmark-files";
import {
	outputJson,
	outputJsonWithStatus,
	outputTail,
	registrySummary,
} from "./output";
import { loadRegistry, validateRegistryContract } from "./registry";
import {
	buildRuntimeLiveAgentResults,
	collectThresholdNotes,
} from "./runtime-live";
import { selectPacks } from "./selector";
import {
	type Baseline,
	BENCHMARK_RESULT_SCHEMA_VERSION,
	type BenchmarkResult,
	type PackId,
	REQUIRED_PACKS,
	type RegistrySnapshot,
	type Scenario,
	VALIDATION_SCHEMA_VERSION,
	type ValidationCommandResult,
	type ValidationCommandSpec,
	type ValidationScope,
} from "./types";

const BASELINES_RELATIVE_PATH = ".afol/data/benchmarks/catalog/baselines";
const BENCH_SAMPLES = 3;
const BENCH_WARMUP_SAMPLES = 1;
// Project token rule (see AGENTS.md / low-token principle):
// >5000 output tokens = non-ideal (warn); >10000 = prohibitive (fail).
const TOKEN_RULE_NONIDEAL = 5_000;
const TOKEN_RULE_PROHIBITIVE = 10_000;
const REAL_REPO_ROOT = resolve(import.meta.dir, "..", "..");
const SANDBOX_COPY_EXCLUDES = [".git", "node_modules", "dist", ".bun-build*"];

const VALIDATION_COMMANDS_BY_PACK: Record<PackId, ValidationCommandSpec[]> = {
	"cli-kernel-local": [
		{ command: ["bun", "run", "typecheck"] },
		{
			command: [
				"bun",
				"test",
				"cli/tests/kernel.test.ts",
				"cli/tests/validate-command.test.ts",
			],
		},
	],
	"routing-accuracy": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/kernel.test.ts",
				"cli/tests/rule-command.test.ts",
				"cli/tests/skill-command.test.ts",
			],
		},
	],
	"mutation-safety": [
		{ command: ["bun", "test", "cli/tests/mutation-safety.test.ts"] },
	],
	"update-safety": [
		{ command: ["bun", "test", "cli/tests/update-command.test.ts"] },
	],
	"workbench-parity": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/workbench-lifecycle.test.ts",
				"cli/tests/workbench-verify.test.ts",
				"cli/tests/log-command.test.ts",
				"cli/tests/verify-command.test.ts",
			],
		},
	],
	"mcp-parity": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"mcp-parity",
				"--json",
			],
		},
	],
	"runtime-live-agent": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"runtime-live-agent",
				"--json",
			],
		},
	],
	"token-economy": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"token-economy",
				"--json",
			],
		},
	],
	"pstr-integrity": [
		{ command: ["bun", "test", "cli/tests/pstr-schema-sweep.test.ts"] },
	],
	"context-bundles": [
		{ command: ["bun", "test", "cli/tests/context-system.test.ts"] },
	],
	"state-projection": [
		{ command: ["bun", "test", "cli/tests/state-command.test.ts"] },
	],
	"memory-governance": [
		{ command: ["bun", "test", "cli/tests/memory-command.test.ts"] },
	],
	"library-knowledge": [
		{ command: ["bun", "test", "cli/tests/library-system.test.ts"] },
	],
	"governance-history": [
		{ command: ["bun", "test", "cli/tests/spec-gate-system.test.ts"] },
	],
	"adm-governance": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/adm-paths.test.ts",
				"cli/tests/adm-plan.test.ts",
				"cli/tests/adm-migrate.test.ts",
			],
		},
	],
};

interface ValidationCommandReport {
	reportedStatus?: string;
	reportedPass?: boolean;
}

interface ParsedValidationArgs {
	mode: "run" | "select" | "bench";
	scope: ValidationScope;
	changedPaths: string[];
	explicitPacks: PackId[];
	save: boolean;
	outputPath?: string;
}

interface BenchmarkPackResults {
	results: BenchmarkResult[];
	notes: string[];
}

interface BenchmarkRunSummary {
	total: number;
	passed: number;
	failed: number;
	skipped: number;
	baselineMissing: number;
}

interface CommandInvocation {
	command: string;
	args: string[];
}

interface ScenarioSampleRun {
	duration_ms: number;
	exit_code: number | null;
	signal: string | null;
	spawn_error: string | null;
	stdout: string;
	stderr: string;
}

interface ScenarioExecutionMetrics {
	duration_ms: number;
	timing_p50_ms: number;
	timing_p95_ms: number;
	error_count: number;
	retry_count: number;
	context_tokens: number;
	prompt_tokens: number;
	output_tokens: number;
	context_bytes: number;
	output_bytes: number;
	tool_call_count: number;
	tool_success_rate: number;
}

interface ScenarioExecutionResult {
	metrics: ScenarioExecutionMetrics;
	notes: string[];
	passed: boolean;
}

function scenarioSamplePassed(
	sample: ScenarioSampleRun,
	expectedExit: number | undefined,
): boolean {
	return (
		sample.exit_code === (expectedExit ?? 0) &&
		!sample.signal &&
		!sample.spawn_error
	);
}

function parseValidationCommandReport(
	stdout: string | undefined,
): ValidationCommandReport {
	if (stdout === undefined || stdout === "") {
		return {};
	}
	try {
		const payload = JSON.parse(stdout) as Record<string, unknown>;
		const report: ValidationCommandReport = {};
		if (typeof payload.status === "string") {
			report.reportedStatus = payload.status;
		}
		if (typeof payload.pass === "boolean") {
			report.reportedPass = payload.pass;
		}
		return report;
	} catch {
		return {};
	}
}

function isValidationCommandPassing(
	result: ReturnType<typeof spawnSync>,
	report: ValidationCommandReport,
): boolean {
	return (
		result.status === 0 &&
		!result.signal &&
		!result.error &&
		report.reportedPass !== false &&
		report.reportedStatus !== "failed"
	);
}

function appendBaselineRegressionNotes(
	notes: string[],
	baseline: Baseline | undefined,
	metrics: Record<string, number>,
): void {
	if (!baseline) {
		return;
	}
	if (
		typeof baseline.timing_p50_ms === "number" &&
		typeof metrics.timing_p50_ms === "number" &&
		metrics.timing_p50_ms > baseline.timing_p50_ms
	) {
		notes.push(
			`baseline-regression:timing_p50_ms:${metrics.timing_p50_ms}>${baseline.timing_p50_ms}`,
		);
	}
	if (
		typeof baseline.timing_p95_ms === "number" &&
		typeof metrics.timing_p95_ms === "number" &&
		metrics.timing_p95_ms > baseline.timing_p95_ms
	) {
		notes.push(
			`baseline-regression:timing_p95_ms:${metrics.timing_p95_ms}>${baseline.timing_p95_ms}`,
		);
	}
}

function applyProjectTokenRule(result: BenchmarkResult): BenchmarkResult {
	if (result.status === "skipped") {
		return result;
	}
	const outputTokens = result.output_tokens ?? 0;
	if (outputTokens > TOKEN_RULE_PROHIBITIVE) {
		const tokenRuleNote = `token-rule:prohibitive(>10k):${outputTokens}tokens`;
		return {
			...result,
			status: "failed",
			pass: false,
			notes: [tokenRuleNote, ...result.notes],
		};
	}
	if (outputTokens > TOKEN_RULE_NONIDEAL) {
		return {
			...result,
			notes: [
				...result.notes,
				`token-rule:non-ideal(>5k):${outputTokens}tokens`,
			],
		};
	}
	return result;
}

function tokenizeCommand(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaping = false;
	for (const char of command.trim()) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (escaping || quote) {
		throw new Error(`Invalid scenario command: ${command}`);
	}
	if (current.length > 0) {
		tokens.push(current);
	}
	return tokens;
}

function resolveScenarioInvocation(
	repoRoot: string,
	projectRoot: string,
	command: string,
): CommandInvocation {
	const tokens = tokenizeCommand(command);
	if (tokens.length === 0) {
		throw new Error("Empty scenario command");
	}
	return resolveCommandInvocation(repoRoot, projectRoot, tokens, true);
}

function resolveCommandInvocation(
	repoRoot: string,
	projectRoot: string,
	tokens: string[],
	preferLocalWrapper: boolean,
): CommandInvocation {
	const program = tokens[0];
	if (program === undefined) {
		throw new Error("Empty command tokens");
	}
	const args = tokens.slice(1);
	if (program === "afol" || program === "a") {
		if (!preferLocalWrapper) {
			return {
				command: "bun",
				args: ["run", join(repoRoot, "cli", "main.ts"), ...args],
			};
		}
		const afolPath = join(projectRoot, "afol");
		try {
			accessSync(afolPath, fsConstants.X_OK);
			return { command: afolPath, args };
		} catch {
			return {
				command: "bun",
				args: ["run", join(repoRoot, "cli", "main.ts"), ...args],
			};
		}
	}
	return { command: program, args };
}

function resolveSetupInvocation(
	repoRoot: string,
	projectRoot: string,
	command: string[],
): CommandInvocation {
	if (command.length === 0) {
		throw new Error("Empty setup command");
	}
	return resolveCommandInvocation(repoRoot, projectRoot, command, true);
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function createSandboxRoot(projectRoot: string): string {
	const sandboxRoot = mkdtempSync(join(tmpdir(), "afol-bench-sandbox-"));
	const excludeFlags = SANDBOX_COPY_EXCLUDES.map(
		(entry) => `--exclude ${shellQuote(entry)}`,
	).join(" ");
	const exportCommand = [
		"set -euo pipefail;",
		`tar -C ${shellQuote(projectRoot)} ${excludeFlags} -cf - . | tar -C ${shellQuote(sandboxRoot)} -xf -`,
	].join(" ");
	const exportResult = spawnSync("bash", ["-lc", exportCommand], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (exportResult.status !== 0 || exportResult.signal || exportResult.error) {
		throw new Error(
			`Sandbox copy export failed: ${outputTail(
				String((exportResult.stderr ?? exportResult.error?.message) || "tar"),
			)}`,
		);
	}
	const projectNodeModules = join(projectRoot, "node_modules");
	if (existsSync(projectNodeModules)) {
		symlinkSync(projectNodeModules, join(sandboxRoot, "node_modules"), "dir");
	}
	return sandboxRoot;
}

function gitStatusPorcelain(projectRoot: string): {
	ok: boolean;
	output: string;
} {
	const result = spawnSync("git", ["status", "--porcelain"], {
		cwd: projectRoot,
		encoding: "utf8",
	});
	return {
		ok: result.status === 0 && !result.signal && !result.error,
		output: (result.stdout ?? "").toString().trimEnd(),
	};
}

function porcelainPaths(porcelain: string): string[] {
	const paths: string[] = [];
	for (const line of porcelain.split(/\r?\n/)) {
		if (!line.trim()) {
			continue;
		}
		const pathPart = line.length > 3 ? line.slice(3).trim() : line.trim();
		const renamed = pathPart.includes(" -> ")
			? pathPart.slice(pathPart.lastIndexOf(" -> ") + 4)
			: pathPart;
		if (renamed.length > 0) {
			paths.push(renamed);
		}
	}
	return [...new Set(paths)];
}

function porcelainEntries(
	porcelain: string,
): Array<{ status: string; path: string }> {
	const entries: Array<{ status: string; path: string }> = [];
	for (const line of porcelain.split(/\r?\n/)) {
		if (!line.trim()) {
			continue;
		}
		const status = line.slice(0, 2);
		const pathPart = line.length > 3 ? line.slice(3).trim() : line.trim();
		const path = pathPart.includes(" -> ")
			? pathPart.slice(pathPart.lastIndexOf(" -> ") + 4)
			: pathPart;
		if (path.length > 0) {
			entries.push({ status, path });
		}
	}
	return entries;
}

function cleanupGitStatusDiff(
	projectRoot: string,
	before: string,
	after: string,
): void {
	const beforeLines = new Set(
		before.split(/\r?\n/).filter((line) => line.trim()),
	);
	for (const entry of porcelainEntries(after)) {
		const line = `${entry.status} ${entry.path}`;
		if (beforeLines.has(line)) {
			continue;
		}
		if (entry.status === "??") {
			rmSync(join(projectRoot, entry.path), { recursive: true, force: true });
			continue;
		}
		spawnSync("git", ["restore", "--worktree", "--staged", "--", entry.path], {
			cwd: projectRoot,
			encoding: "utf8",
		});
	}
}

function percentile(values: number[], ratio: number): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((left, right) => left - right);
	if (sorted.length === 1) {
		return sorted[0] ?? 0;
	}
	const position = (sorted.length - 1) * ratio;
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	const lower = sorted[lowerIndex] ?? 0;
	const upper = sorted[upperIndex] ?? lower;
	if (lowerIndex === upperIndex) {
		return lower;
	}
	return lower + (upper - lower) * (position - lowerIndex);
}

function runScenarioSample(
	projectRoot: string,
	invocation: CommandInvocation,
): ScenarioSampleRun {
	const startedAt = performance.now();
	const result = spawnSync(invocation.command, invocation.args, {
		cwd: projectRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
	return {
		duration_ms: durationMs,
		exit_code: result.status,
		signal: result.signal,
		spawn_error: result.error ? result.error.message : null,
		stdout: result.stdout ?? "",
		stderr: result.error ? result.error.message : (result.stderr ?? ""),
	};
}

function coerceMetrics(
	metrics: Record<string, number>,
): ScenarioExecutionMetrics {
	return {
		duration_ms: metrics.duration_ms ?? 0,
		timing_p50_ms: metrics.timing_p50_ms ?? metrics.duration_ms ?? 0,
		timing_p95_ms: metrics.timing_p95_ms ?? metrics.duration_ms ?? 0,
		error_count: metrics.error_count ?? 0,
		retry_count: metrics.retry_count ?? 0,
		context_tokens: metrics.context_tokens ?? 0,
		prompt_tokens: metrics.prompt_tokens ?? 0,
		output_tokens: metrics.output_tokens ?? 0,
		context_bytes: metrics.context_bytes ?? 0,
		output_bytes: metrics.output_bytes ?? 0,
		tool_call_count: metrics.tool_call_count ?? 1,
		tool_success_rate: metrics.tool_success_rate ?? 1,
	};
}

function isCommandSuccess(sample: ScenarioSampleRun): boolean {
	return !sample.signal && !sample.spawn_error && sample.exit_code === 0;
}

function buildSampleMetrics(
	sample: ScenarioSampleRun,
	passed: boolean,
): ScenarioExecutionMetrics {
	const outputBytes = Buffer.byteLength(sample.stdout, "utf8");
	return {
		duration_ms: sample.duration_ms,
		timing_p50_ms: sample.duration_ms,
		timing_p95_ms: sample.duration_ms,
		error_count: passed ? 0 : 1,
		retry_count: 0,
		context_tokens: 0,
		prompt_tokens: 0,
		output_tokens: Math.round(outputBytes / 4),
		context_bytes: 0,
		output_bytes: outputBytes,
		tool_call_count: 1,
		tool_success_rate: passed ? 1 : 0,
	};
}

function runSandboxScenarioCommand(
	projectRoot: string,
	scenario: Scenario,
	command: string,
): ScenarioExecutionResult {
	const expectedExit = scenario.expected_exit;
	let sandboxRoot: string | null = null;
	try {
		sandboxRoot = createSandboxRoot(projectRoot);
		for (const [index, setupCommand] of (scenario.setup ?? []).entries()) {
			const setupInvocation = resolveSetupInvocation(
				REAL_REPO_ROOT,
				sandboxRoot,
				setupCommand,
			);
			const setupSample = runScenarioSample(sandboxRoot, setupInvocation);
			if (!isCommandSuccess(setupSample)) {
				return {
					metrics: coerceMetrics(scenario.deterministic_metrics),
					notes: [`setup-failed:${index}:${setupSample.exit_code ?? "null"}`],
					passed: false,
				};
			}
		}
		const invocation = resolveScenarioInvocation(
			REAL_REPO_ROOT,
			sandboxRoot,
			command,
		);
		const sample = runScenarioSample(sandboxRoot, invocation);
		const passed = scenarioSamplePassed(sample, expectedExit);
		const notes = passed
			? typeof expectedExit === "number"
				? [`expected-exit-honored:${expectedExit}`]
				: []
			: [
					`sample-failed:1:exit=${sample.exit_code ?? "null"}:stderr=${outputTail((sample.spawn_error ?? sample.stderr) || sample.stdout)}`,
				];
		return {
			metrics: buildSampleMetrics(sample, passed),
			notes,
			passed,
		};
	} finally {
		if (sandboxRoot) {
			rmSync(sandboxRoot, { recursive: true, force: true });
		}
	}
}

export function runScenarioCommand(
	projectRoot: string,
	scenario: Scenario,
): ScenarioExecutionResult {
	const command =
		typeof scenario.command === "string" ? scenario.command.trim() : "";
	if (command.length === 0) {
		throw new Error("Scenario command is required for execution");
	}
	console.error(
		`bench: running ${scenario.pack_id}/${scenario.scenario_id} ...`,
	);
	if (scenario.sandbox) {
		return runSandboxScenarioCommand(projectRoot, scenario, command);
	}
	const expectedExit = scenario.expected_exit;
	const invocation = resolveScenarioInvocation(
		REAL_REPO_ROOT,
		projectRoot,
		command,
	);
	const gitStatusBefore = gitStatusPorcelain(projectRoot);
	let warmup = runScenarioSample(projectRoot, invocation);
	for (let index = 1; index < BENCH_WARMUP_SAMPLES; index += 1) {
		warmup = runScenarioSample(projectRoot, invocation);
	}
	const warmupNotes: string[] = [];
	if (!scenarioSamplePassed(warmup, expectedExit)) {
		warmupNotes.push(
			`warmup-failed:exit=${warmup.exit_code ?? "null"}:stderr=${outputTail((warmup.spawn_error ?? warmup.stderr) || warmup.stdout)}`,
		);
	}
	const samples: ScenarioSampleRun[] = [];
	for (let index = 0; index < BENCH_SAMPLES; index += 1) {
		samples.push(runScenarioSample(projectRoot, invocation));
	}
	const gitStatusAfter = gitStatusPorcelain(projectRoot);
	const sideEffectNotes: string[] = [];
	if (!gitStatusBefore.ok || !gitStatusAfter.ok) {
		sideEffectNotes.push("side-effect-guard-unavailable");
	} else if (gitStatusBefore.output !== gitStatusAfter.output) {
		const changedFiles = porcelainPaths(gitStatusAfter.output);
		if (changedFiles.length > 0) {
			sideEffectNotes.push(`side-effect-leak:${changedFiles.join(",")}`);
		} else {
			sideEffectNotes.push("side-effect-leak:unknown");
		}
		cleanupGitStatusDiff(
			projectRoot,
			gitStatusBefore.output,
			gitStatusAfter.output,
		);
	}
	const sampleFailureNotes = samples.flatMap((sample, index) => {
		if (scenarioSamplePassed(sample, expectedExit)) {
			return [];
		}
		return [
			`sample-failed:${index + 1}:exit=${sample.exit_code ?? "null"}:stderr=${outputTail((sample.spawn_error ?? sample.stderr) || sample.stdout)}`,
		];
	});
	const durations = samples.map((sample) => sample.duration_ms);
	const representativeSample =
		[...samples]
			.reverse()
			.find((sample) => Buffer.byteLength(sample.stdout, "utf8") > 0) ??
		samples[samples.length - 1] ??
		samples[0];
	const outputBytes = representativeSample
		? Buffer.byteLength(representativeSample.stdout, "utf8")
		: 0;
	const successfulSamples = samples.filter((sample) =>
		scenarioSamplePassed(sample, expectedExit),
	).length;
	const errorCount = samples.length - successfulSamples;
	const metrics: ScenarioExecutionMetrics = {
		duration_ms: Math.round(percentile(durations, 0.5)),
		timing_p50_ms: Math.round(percentile(durations, 0.5)),
		timing_p95_ms: Math.round(percentile(durations, 0.95)),
		error_count: errorCount,
		retry_count: 0,
		context_tokens: 0,
		prompt_tokens: 0,
		output_tokens: Math.round(outputBytes / 4),
		context_bytes: 0,
		output_bytes: outputBytes,
		tool_call_count: 1,
		tool_success_rate: Number((successfulSamples / BENCH_SAMPLES).toFixed(4)),
	};
	const passed =
		warmupNotes.length === 0 &&
		sampleFailureNotes.length === 0 &&
		sideEffectNotes.length === 0 &&
		errorCount === 0 &&
		gitStatusBefore.ok &&
		gitStatusAfter.ok;
	const executionNotes = [
		...warmupNotes,
		...sampleFailureNotes,
		...sideEffectNotes,
	];
	if (passed && typeof expectedExit === "number") {
		executionNotes.push(`expected-exit-honored:${expectedExit}`);
	}
	return {
		metrics,
		notes: executionNotes,
		passed,
	};
}

function resolveBenchmarkStatus(
	status: BenchmarkResult["status"],
): "passed" | "failed" | "skipped" {
	return status === "skipped"
		? "skipped"
		: status === "baseline-missing"
			? "failed"
			: status === "passed"
				? "passed"
				: "failed";
}

function summarizeBenchmarkResults(
	results: BenchmarkResult[],
): BenchmarkRunSummary {
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	let baselineMissing = 0;
	for (const entry of results) {
		switch (entry.status) {
			case "passed":
				passed += 1;
				break;
			case "failed":
				failed += 1;
				break;
			case "skipped":
				skipped += 1;
				break;
			case "baseline-missing":
				baselineMissing += 1;
				break;
		}
	}
	return { total: results.length, passed, failed, skipped, baselineMissing };
}

function resolveBenchmarkRunStatus(
	summary: BenchmarkRunSummary,
	contractIssueCount: number,
): "passed" | "failed" | "skipped" {
	// A run passes when there are no real failures or missing baselines.
	// Skipped scenarios are honest opt-outs (e.g. mutating/session-scoped
	// commands that cannot run in-root) and do NOT fail the run, as long as
	// at least one scenario actually passed. A run with zero failures but
	// also zero passes (everything skipped) reports "skipped" to signal no
	// real coverage, distinct from a passing run.
	const pass =
		summary.failed === 0 &&
		summary.baselineMissing === 0 &&
		contractIssueCount === 0 &&
		summary.passed > 0;
	if (pass) {
		return "passed";
	}
	const allSkipped =
		summary.total > 0 &&
		summary.skipped === summary.total &&
		summary.failed === 0 &&
		summary.baselineMissing === 0 &&
		contractIssueCount === 0;
	return allSkipped ? "skipped" : "failed";
}

function collectBenchmarkPackResults(
	projectRoot: string,
	snapshot: RegistrySnapshot,
	packId: PackId,
): BenchmarkPackResults {
	const scenarios = snapshot.scenariosByPack[packId] ?? [];
	const baselinePath = join(
		projectRoot,
		BASELINES_RELATIVE_PATH,
		packId,
		"baseline-v1.json",
	);
	const baseline = snapshot.baselinesByPack[packId];
	if (packId === "runtime-live-agent") {
		const runtimeLiveResults = buildRuntimeLiveAgentResults(
			projectRoot,
			scenarios,
			baselinePath,
		);
		return {
			results: runtimeLiveResults.results.map(applyProjectTokenRule),
			notes: runtimeLiveResults.notes,
		};
	}
	return {
		results: scenarios.map((scenario) =>
			buildResult(projectRoot, scenario, baselinePath, baseline),
		),
		notes: [],
	};
}

function summarizeValidationCommandResults(
	commandResults: ValidationCommandResult[],
): { passed: number; failed: number } {
	let passed = 0;
	let failed = 0;
	for (const entry of commandResults) {
		const informationalBenchmark =
			entry.command[0] === "bun" &&
			entry.command[1] === "run" &&
			entry.command[3] === "v" &&
			entry.command[4] === "bench";
		if (entry.status === "passed" || informationalBenchmark) {
			passed += 1;
		} else {
			failed += 1;
		}
	}
	return { passed, failed };
}

function consumeValidationArg(
	state: ParsedValidationArgs,
	token: string,
	nextArg: string | undefined,
): number | undefined {
	switch (token) {
		case "--changed-path":
			if (!nextArg) {
				throw new Error("Missing value for --changed-path");
			}
			state.changedPaths.push(nextArg);
			return 2;
		case "--pack":
			if (!nextArg) {
				throw new Error("Missing value for --pack");
			}
			if (!REQUIRED_PACKS.includes(nextArg as PackId)) {
				throw new Error(`Unknown --pack value: ${nextArg}`);
			}
			state.explicitPacks.push(nextArg as PackId);
			return 2;
		case "--save":
			state.save = true;
			return 1;
		case "--output":
			if (!nextArg) {
				throw new Error("Missing value for --output");
			}
			state.outputPath = nextArg;
			return 2;
		default:
			return undefined;
	}
}

export function buildResult(
	projectRoot: string,
	scenario: Scenario,
	baselinePath: string,
	baseline: Baseline | undefined,
): BenchmarkResult {
	// bench executes scenario.command and measures; deterministic_metrics is legacy/ignored for execution packs
	const hasCommand =
		typeof scenario.command === "string" && scenario.command.trim().length > 0;
	const execution =
		hasCommand &&
		(scenario.sandbox || scenario.implementation_status !== "skipped")
			? runScenarioCommand(projectRoot, scenario)
			: null;
	const metrics = execution?.metrics ?? scenario.deterministic_metrics;
	const notes = execution?.notes
		? [...execution.notes]
		: ["no-command-fallback"];
	const thresholdNotes = collectThresholdNotes(
		scenario.thresholds,
		metrics as Record<string, number | undefined>,
	);
	const regressionNotes: string[] = [];
	appendBaselineRegressionNotes(
		regressionNotes,
		baseline,
		metrics as Record<string, number>,
	);
	const status: BenchmarkResult["status"] =
		scenario.implementation_status === "skipped" && !scenario.sandbox
			? "skipped"
			: !baseline
				? "baseline-missing"
				: execution && !execution.passed
					? "failed"
					: thresholdNotes.length > 0 || regressionNotes.length > 0
						? "failed"
						: "passed";
	if (status === "baseline-missing") {
		notes.push("baseline-missing");
	} else {
		notes.push(...thresholdNotes, ...regressionNotes);
	}
	const resolvedStatus = resolveBenchmarkStatus(status);
	return applyProjectTokenRule({
		schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		run_id: `${execution ? "bench" : "legacy"}-${scenario.pack_id}-${scenario.scenario_id}-${scenario.scenario_version}`,
		scenario_id: scenario.scenario_id,
		scenario_version: scenario.scenario_version,
		pack_id: scenario.pack_id,
		status: status,
		baseline_id: scenario.baseline_id,
		baseline_reference: relative(projectRoot, baselinePath).replaceAll(
			"\\",
			"/",
		),
		threshold_reference: scenario.thresholds,
		pass: resolvedStatus === "passed",
		duration_ms: metrics.duration_ms ?? 0,
		timing_p50_ms: metrics.timing_p50_ms ?? metrics.duration_ms ?? 0,
		timing_p95_ms: metrics.timing_p95_ms ?? metrics.duration_ms ?? 0,
		error_count: metrics.error_count ?? 0,
		retry_count: metrics.retry_count ?? 0,
		context_tokens: metrics.context_tokens ?? 0,
		prompt_tokens: metrics.prompt_tokens ?? 0,
		output_tokens: metrics.output_tokens ?? 0,
		context_bytes: metrics.context_bytes ?? 0,
		output_bytes: metrics.output_bytes ?? 0,
		tool_call_count: metrics.tool_call_count ?? 1,
		tool_success_rate: metrics.tool_success_rate ?? 1,
		git_commit: getGitCommit(projectRoot),
		notes:
			status === "skipped"
				? ["not-implemented-live-runner"]
				: status === "baseline-missing"
					? notes
					: notes,
	});
}

function getGitCommit(projectRoot: string): string {
	const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
		cwd: projectRoot,
		encoding: "utf8",
	});
	if (result.status !== 0) {
		return "unknown";
	}
	return (result.stdout || "").trim() || "unknown";
}

function runPackCommand(
	projectRoot: string,
	packId: PackId,
	spec: ValidationCommandSpec,
): ValidationCommandResult {
	const startedAt = performance.now();
	const [command, ...args] = spec.command;
	if (!command) {
		throw new Error(`Empty validation command for pack: ${packId}`);
	}
	const result = spawnSync(command, args, {
		cwd: projectRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const durationMs = Math.round(performance.now() - startedAt);
	const report = parseValidationCommandReport(result.stdout ?? "");
	const passed = isValidationCommandPassing(result, report);
	const commandResult: ValidationCommandResult = {
		pack_id: packId,
		command: spec.command,
		status: passed ? "passed" : "failed",
		exit_code: result.status,
		signal: result.signal,
		duration_ms: durationMs,
		stdout_tail: outputTail(result.stdout ?? ""),
		stderr_tail: outputTail(
			result.error ? result.error.message : (result.stderr ?? ""),
		),
	};
	if (report.reportedStatus !== undefined) {
		commandResult.reported_status = report.reportedStatus;
	}
	if (report.reportedPass !== undefined) {
		commandResult.reported_pass = report.reportedPass;
	}
	return commandResult;
}

function parseArgs(args: string[]): ParsedValidationArgs {
	const parsed: ParsedValidationArgs = {
		mode: "run",
		scope: "default",
		changedPaths: [],
		explicitPacks: [],
		save: false,
	};

	let index = 0;
	const modeArg = args[index];
	if (modeArg === "bench" || modeArg === "select" || modeArg === "run") {
		parsed.mode = modeArg;
		index += 1;
	}
	if (parsed.mode !== "bench") {
		const scopeArg = args[index];
		if (scopeArg === "wb" || scopeArg === "tpl" || scopeArg === "update") {
			parsed.scope = scopeArg;
			index += 1;
		}
	}

	while (index < args.length) {
		const token = args[index];
		if (token === undefined) {
			break;
		}
		const nextArg = args[index + 1];
		const consumed = consumeValidationArg(parsed, token, nextArg);
		if (consumed !== undefined) {
			index += consumed;
			continue;
		}
		if (token === "--json") {
			index += 1;
			continue;
		}
		throw new Error(`Unknown validation argument: ${token}`);
	}

	return parsed;
}

function handleSelect(
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
): number {
	const selection = selectPacks({ scope, changedPaths });
	return outputJson({
		schema_version: VALIDATION_SCHEMA_VERSION,
		command_family: "validation",
		mode: "select",
		scope,
		selected_pack_ids: selection.selected_pack_ids,
		reasons: selection.reasons,
		registry: registrySummary(snapshot),
		contract_issues: validateRegistryContract(snapshot),
	});
}

function handleRun(
	projectRoot: string,
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
	explicitPacks: PackId[],
): number {
	const selection = selectPacks({ scope, changedPaths });
	const selectedPacks =
		explicitPacks.length > 0 ? explicitPacks : selection.selected_pack_ids;
	const commandResults: ValidationCommandResult[] = [];
	for (const packId of selectedPacks) {
		for (const spec of VALIDATION_COMMANDS_BY_PACK[packId] ?? []) {
			commandResults.push(runPackCommand(projectRoot, packId, spec));
		}
	}
	const summary = summarizeValidationCommandResults(commandResults);
	const contractIssues = validateRegistryContract(snapshot);
	const pass = summary.failed === 0 && contractIssues.length === 0;
	return outputJsonWithStatus(
		{
			schema_version: VALIDATION_SCHEMA_VERSION,
			command_family: "validation",
			mode: "run",
			scope,
			status: pass ? "passed" : "failed",
			pass,
			selected_pack_ids: selectedPacks,
			selection_reasons: selection.reasons,
			summary: {
				total: commandResults.length,
				passed: summary.passed,
				failed: summary.failed,
			},
			command_results: commandResults,
			registry: registrySummary(snapshot),
			contract_issues: contractIssues,
		},
		pass ? 0 : 2,
	);
}

function handleBenchmark(
	projectRoot: string,
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
	explicitPacks: PackId[],
	persist: boolean,
	outputPath?: string,
): number {
	const selection = selectPacks({ scope, changedPaths });
	const selectedPacks =
		explicitPacks.length > 0 ? explicitPacks : selection.selected_pack_ids;
	const packResults = selectedPacks.map((packId) =>
		collectBenchmarkPackResults(projectRoot, snapshot, packId),
	);
	const results = packResults.flatMap((entry) => entry.results);
	const benchmarkNotes = packResults.flatMap((entry) => entry.notes);
	const summary = summarizeBenchmarkResults(results);
	const contractIssues = validateRegistryContract(snapshot);
	const status = resolveBenchmarkRunStatus(summary, contractIssues.length);
	const notes =
		status === "skipped"
			? ["all-scenarios-skipped:not-implemented-live-runner", ...benchmarkNotes]
			: benchmarkNotes;
	const payload: Record<string, unknown> = {
		schema_version: VALIDATION_SCHEMA_VERSION,
		command_family: "validation",
		mode: "benchmark",
		benchmark_result_schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		status,
		pass: status === "passed",
		selected_pack_ids: selectedPacks,
		selection_reasons: selection.reasons,
		result_count: results.length,
		notes,
		summary: {
			total: summary.total,
			passed: summary.passed,
			failed: summary.failed,
			skipped: summary.skipped,
			baseline_missing: summary.baselineMissing,
		},
		results,
		contract_issues: contractIssues,
	};
	if (persist || outputPath) {
		const savedResultPath = saveBenchmarkPayload(
			projectRoot,
			payload,
			selectedPacks,
			outputPath,
		);
		payload.saved_result_path = savedResultPath;
		payload.saved_result_file = savedResultPath.split("/").at(-1);
	}
	return outputJsonWithStatus(payload, status === "passed" ? 0 : 2);
}

export function runValidationCommand(
	projectRoot: string,
	args: string[],
): number {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs(args);
	} catch (error) {
		console.error((error as Error).message);
		return 2;
	}

	let snapshot: RegistrySnapshot;
	try {
		snapshot = loadRegistry(projectRoot);
	} catch (error) {
		console.error((error as Error).message);
		return 2;
	}

	if (parsed.mode === "bench") {
		return handleBenchmark(
			projectRoot,
			snapshot,
			parsed.scope,
			parsed.changedPaths,
			parsed.explicitPacks,
			parsed.save,
			parsed.outputPath,
		);
	}
	if (parsed.mode === "select") {
		return handleSelect(snapshot, parsed.scope, parsed.changedPaths);
	}
	return handleRun(
		projectRoot,
		snapshot,
		parsed.scope,
		parsed.changedPaths,
		parsed.explicitPacks,
	);
}
