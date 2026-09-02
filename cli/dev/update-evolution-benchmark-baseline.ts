#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { atomicWriteText } from "../services/io/atomic";
import { runValidationCommand } from "../validate/command";
import { normalizeGitRepositoryId } from "../validate/registry";

const PACK_ID = "evolution-core";
const SCENARIO_ID = "evolution-status-contract";
const SCENARIO_VERSION = "1.1.0";
const BASELINE_ID = "evolution-core-v2";
const VALIDATION_SCHEMA_VERSION = "1.0.0";
const BENCHMARK_RESULT_SCHEMA_VERSION = "1.0.0";
const RUN_ID = "bench-evolution-core-evolution-status-contract-1.1.0";
const RUNNER_EVIDENCE = "expected-exit-honored:0";
const BASELINE_REFERENCE =
	".afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v2.json";
const PROVENANCE = "fresh-local-runnable-smoke";
const FIXTURE_PROVENANCE = "untrusted-test-fixture";
const TOKENIZER_ID = "output-bytes-divided-by-4";
const TOKENIZER_VERSION = "1";
const SAMPLE_COUNT = 3;
const WARMUP_COUNT = 1;
const MAX_DURATION_MS = 4000;
const MAX_P95_MS = 4000;
const MAX_OUTPUT_TOKENS = 250;
const MAX_OUTPUT_BYTES = 4000;
const MIN_TOOL_SUCCESS_RATE = 0.98;

const RELATIVE_PATHS = [
	"src/builtin-assets/benchmarks/catalog/baselines/evolution-core/baseline-v2.json",
	"src/builtin-assets/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
] as const;

const BENCHMARK_INPUT_PATHS = [
	"cli",
	"package.json",
	"bun.lock",
	"src/project-template/.afol/config.json",
	"src/builtin-assets/benchmarks/catalog",
	"src/project-template/.agents/lock.json",
	"src/project-template/.agents/manifest.json",
] as const;

type JsonObject = Record<string, unknown>;

export type EvolutionBaselineWriterOptions = {
	now?: Date;
	currentCommit?: string;
	write?: (path: string, content: string) => void;
};

type ControlledBenchmark = {
	exitCode: number;
	payload: JsonObject;
};

function withBaselineRollback(
	targets: readonly (readonly [string, string])[],
	write: (path: string, content: string) => void,
): void {
	const snapshots = targets.map(([path]) => ({
		path,
		before: existsSync(path) ? readFileSync(path) : null,
	}));
	try {
		for (const [path, content] of targets) write(path, content);
	} catch (error) {
		const rollbackFailures: Array<{ path: string; error: unknown }> = [];
		for (let index = snapshots.length - 1; index >= 0; index -= 1) {
			const snapshot = snapshots[index];
			if (!snapshot) continue;
			try {
				if (snapshot.before === null) {
					if (existsSync(snapshot.path)) rmSync(snapshot.path, { force: true });
					continue;
				}
				atomicWriteText(snapshot.path, snapshot.before.toString("utf8"));
			} catch (rollbackError) {
				rollbackFailures.push({
					path: snapshot.path,
					error: rollbackError,
				});
			}
		}
		if (rollbackFailures.length > 0) {
			const writeMessage =
				error instanceof Error ? error.message : String(error);
			const rollbackSummary = rollbackFailures
				.map(({ path }) => path)
				.join(", ");
			throw new AggregateError(
				[error, ...rollbackFailures.map((failure) => failure.error)],
				`Baseline write failed (${writeMessage}); rollback also failed for: ${rollbackSummary}`,
			);
		}
		throw error;
	}
}

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readObject(path: string): JsonObject {
	const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
	if (!isObject(parsed)) throw new Error(`${path} must contain a JSON object`);
	return parsed;
}

function runControlledBenchmark(repoRoot: string): ControlledBenchmark {
	const stdout: string[] = [];
	const originalWrite = process.stdout.write;
	process.stdout.write = ((chunk: string | Uint8Array) => {
		stdout.push(
			typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
		);
		return true;
	}) as typeof process.stdout.write;
	let exitCode: number;
	try {
		exitCode = runValidationCommand(repoRoot, [
			"bench",
			"--pack",
			PACK_ID,
			"--json",
		]);
	} finally {
		process.stdout.write = originalWrite;
	}
	if (exitCode !== 0 && exitCode !== 2) {
		throw new Error(`Controlled evolution benchmark exited ${exitCode}`);
	}
	const output = stdout.join("").trim();
	if (output.length === 0) {
		throw new Error("Controlled evolution benchmark produced no JSON output");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch {
		throw new Error("Controlled evolution benchmark produced invalid JSON");
	}
	if (!isObject(parsed)) {
		throw new Error(
			"Controlled evolution benchmark output must be a JSON object",
		);
	}
	return { exitCode, payload: parsed };
}

function requiredString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} must be a non-empty string`);
	}
	return value;
}

function requiredNumber(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`${label} must be a non-negative number`);
	}
	return value;
}

function requiredSourceRepository(value: unknown, label: string): string {
	const raw = requiredString(value, label);
	const normalized = normalizeGitRepositoryId(raw);
	if (normalized === undefined) {
		throw new Error(`${label} must be a valid source repository`);
	}
	return normalized;
}

function commitMatchesHead(commit: string, head: string): boolean {
	return (
		/^[a-f0-9]{7,40}$/iu.test(commit) &&
		(head.startsWith(commit) || commit.startsWith(head))
	);
}

function controlledGitExecutable(): string {
	const candidates =
		process.platform === "win32"
			? ["C:\\Program Files\\Git\\cmd\\git.exe"]
			: [
					"/usr/bin/git",
					"/bin/git",
					"/usr/local/bin/git",
					"/opt/homebrew/bin/git",
				];
	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		try {
			return realpathSync(candidate);
		} catch {
			// Try the next fixed system location.
		}
	}
	throw new Error(
		"Evolution baseline writer requires a controlled local git executable",
	);
}

function gitReadOnlyEnv(): NodeJS.ProcessEnv {
	const env = Object.fromEntries(
		[
			"PATH",
			"LANG",
			"LC_ALL",
			"LC_CTYPE",
			"SystemRoot",
			"SystemDrive",
			"windir",
		].flatMap((key) =>
			process.env[key] === undefined ? [] : [[key, process.env[key]]],
		),
	) as NodeJS.ProcessEnv;
	return {
		...env,
		GIT_NO_LAZY_FETCH: "1",
		GIT_OPTIONAL_LOCKS: "0",
		GIT_TERMINAL_PROMPT: "0",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
		GIT_CONFIG_SYSTEM: process.platform === "win32" ? "NUL" : "/dev/null",
	};
}

function runLocalGit(repoRoot: string, args: readonly string[]) {
	return spawnSync(controlledGitExecutable(), [...args], {
		cwd: realpathSync(repoRoot),
		env: gitReadOnlyEnv(),
		encoding: "utf8",
		maxBuffer: 1_048_576,
		shell: false,
		timeout: 3_000,
		windowsHide: true,
	});
}

function assertCleanBenchmarkInputs(repoRoot: string): void {
	const result = runLocalGit(repoRoot, [
		"--no-pager",
		"--no-optional-locks",
		"--no-lazy-fetch",
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
		"--",
		...BENCHMARK_INPUT_PATHS,
	]);
	if (result.error || result.status !== 0) {
		throw new Error(
			"Evolution baseline writer cannot verify clean benchmark inputs",
		);
	}
	const dirtyPaths = `${result.stdout ?? ""}`
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
	if (dirtyPaths.length > 0) {
		throw new Error(
			`Evolution baseline writer requires clean benchmark inputs at HEAD; dirty paths: ${dirtyPaths.slice(0, 5).join(", ")}`,
		);
	}
}

function currentCommit(repoRoot: string): string {
	const result = runLocalGit(repoRoot, [
		"--no-pager",
		"--no-optional-locks",
		"--no-lazy-fetch",
		"rev-parse",
		"--short=12",
		"HEAD",
	]);
	const head = `${result.stdout ?? ""}`.trim();
	if (result.error || result.status !== 0 || !/^[a-f0-9]{12}$/u.test(head)) {
		throw new Error("Unable to resolve current git HEAD");
	}
	return head;
}

function validateBootstrapMetrics(result: JsonObject): void {
	const duration = requiredNumber(result.duration_ms, "results[0].duration_ms");
	const p95 = requiredNumber(result.timing_p95_ms, "results[0].timing_p95_ms");
	const errors = requiredNumber(result.error_count, "results[0].error_count");
	const retries = requiredNumber(result.retry_count, "results[0].retry_count");
	const outputTokens = requiredNumber(
		result.output_tokens,
		"results[0].output_tokens",
	);
	const toolSuccessRate = requiredNumber(
		result.tool_success_rate,
		"results[0].tool_success_rate",
	);
	if (duration > MAX_DURATION_MS) {
		throw new Error(`Bootstrap duration exceeds ${MAX_DURATION_MS}ms`);
	}
	if (p95 > MAX_P95_MS) {
		throw new Error(`Bootstrap p95 exceeds ${MAX_P95_MS}ms`);
	}
	if (errors !== 0) throw new Error("Bootstrap result must have zero errors");
	if (retries !== 0) throw new Error("Bootstrap result must have zero retries");
	if (outputTokens > MAX_OUTPUT_TOKENS) {
		throw new Error(`Bootstrap output_tokens exceeds ${MAX_OUTPUT_TOKENS}`);
	}
	if (result.output_bytes !== undefined) {
		const outputBytes = requiredNumber(
			result.output_bytes,
			"results[0].output_bytes",
		);
		if (outputBytes > MAX_OUTPUT_BYTES) {
			throw new Error(`Bootstrap output_bytes exceeds ${MAX_OUTPUT_BYTES}`);
		}
	}
	if (toolSuccessRate < MIN_TOOL_SUCCESS_RATE) {
		throw new Error(
			`Bootstrap tool_success_rate is below ${MIN_TOOL_SUCCESS_RATE}`,
		);
	}
}

function validateContractIssues(
	payload: JsonObject,
	allowMissingBaseline: boolean,
): void {
	const issues = payload.contract_issues;
	if (
		!Array.isArray(issues) ||
		issues.some((issue) => typeof issue !== "string")
	) {
		throw new Error("Benchmark input contract_issues must be a string array");
	}
	const allowed = allowMissingBaseline
		? ["missing-baseline:evolution-core"]
		: [];
	if (issues.some((issue) => !allowed.includes(issue))) {
		throw new Error("Benchmark input contains unrelated contract issues");
	}
}

function validateInput(
	payload: JsonObject,
	head: string,
	baselinePresent: boolean,
): JsonObject {
	if (payload.schema_version !== VALIDATION_SCHEMA_VERSION) {
		throw new Error(
			`Benchmark input schema_version must be ${VALIDATION_SCHEMA_VERSION}`,
		);
	}
	if (payload.command_family !== "validation") {
		throw new Error("Benchmark input must have command_family=validation");
	}
	if (payload.mode !== "benchmark") {
		throw new Error("Benchmark input must have mode=benchmark");
	}
	if (
		payload.benchmark_result_schema_version !== BENCHMARK_RESULT_SCHEMA_VERSION
	) {
		throw new Error(
			`Benchmark input result schema must be ${BENCHMARK_RESULT_SCHEMA_VERSION}`,
		);
	}
	const packs = payload.selected_pack_ids;
	if (!Array.isArray(packs) || packs.length !== 1 || packs[0] !== PACK_ID) {
		throw new Error("Benchmark input must select only evolution-core");
	}
	if (payload.result_count !== 1 || !Array.isArray(payload.results)) {
		throw new Error("Benchmark input must contain exactly one result");
	}
	const results = payload.results;
	if (results.length !== 1 || !isObject(results[0])) {
		throw new Error("Benchmark input must contain exactly one result");
	}
	const result = results[0];
	if (result.schema_version !== BENCHMARK_RESULT_SCHEMA_VERSION) {
		throw new Error(
			`Benchmark result schema_version must be ${BENCHMARK_RESULT_SCHEMA_VERSION}`,
		);
	}
	if (result.run_id !== RUN_ID) {
		throw new Error(`Benchmark result run_id must be ${RUN_ID}`);
	}
	if (
		result.scenario_id !== SCENARIO_ID ||
		result.scenario_version !== SCENARIO_VERSION ||
		result.pack_id !== PACK_ID
	) {
		throw new Error("Benchmark input scenario does not match evolution-core");
	}
	const commit = requiredString(result.git_commit, "results[0].git_commit");
	if (!commitMatchesHead(commit, head)) {
		throw new Error(
			`Benchmark scenario git_commit ${JSON.stringify(commit)} does not match current HEAD ${JSON.stringify(head)}`,
		);
	}
	if (result.baseline_id !== BASELINE_ID) {
		throw new Error(
			"Benchmark scenario baseline_id does not match evolution-core-v2",
		);
	}
	if (result.baseline_reference !== BASELINE_REFERENCE) {
		throw new Error(
			"Benchmark scenario baseline_reference does not match baseline-v2.json",
		);
	}
	for (const key of [
		"duration_ms",
		"timing_p50_ms",
		"timing_p95_ms",
		"error_count",
		"retry_count",
		"context_tokens",
		"prompt_tokens",
		"output_tokens",
		"context_bytes",
		"tool_call_count",
		"tool_success_rate",
	] as const) {
		requiredNumber(result[key], `results[0].${key}`);
	}
	const notes = result.notes;
	if (!Array.isArray(notes) || notes.some((note) => typeof note !== "string")) {
		throw new Error("Benchmark result notes must be a string array");
	}
	if (notes.some((note) => note.startsWith("baseline-regression:"))) {
		throw new Error("Benchmark input must not contain baseline-regression");
	}
	if (!notes.includes(RUNNER_EVIDENCE)) {
		throw new Error(
			`Benchmark result lacks runner evidence ${RUNNER_EVIDENCE}`,
		);
	}
	requiredSourceRepository(
		result.source_repository,
		"results[0].source_repository",
	);
	if (result.status === "baseline-missing" && result.pass === false) {
		if (baselinePresent) {
			throw new Error("Cannot bootstrap an existing baseline");
		}
		if (payload.status !== "failed" || payload.pass !== false) {
			throw new Error("Baseline-missing bootstrap must fail the benchmark run");
		}
		validateContractIssues(payload, true);
		validateBootstrapMetrics(result);
		return result;
	}
	if (result.status !== "passed" || result.pass !== true) {
		throw new Error(
			"Benchmark scenario must pass or be a valid baseline-missing bootstrap",
		);
	}
	if (!baselinePresent) {
		throw new Error(
			"Cannot refresh a missing baseline without baseline-missing status",
		);
	}
	if (payload.status !== "passed" || payload.pass !== true) {
		throw new Error("Passed benchmark result must pass the benchmark run");
	}
	validateContractIssues(payload, false);
	validateBootstrapMetrics(result);
	return result;
}

function baselineFromResult(
	result: JsonObject,
	timestamp: string,
	provenance: string,
	sourceRepository: string,
): JsonObject {
	return {
		schema_version: "1.0.0",
		baseline_id: BASELINE_ID,
		pack_id: PACK_ID,
		host_profile_id: "ci-linux-x64",
		sample_count: SAMPLE_COUNT,
		warmup_count: WARMUP_COUNT,
		timing_p50_ms: requiredNumber(
			result.timing_p50_ms,
			"results[0].timing_p50_ms",
		),
		timing_p95_ms: requiredNumber(
			result.timing_p95_ms,
			"results[0].timing_p95_ms",
		),
		tokenizer_id: TOKENIZER_ID,
		tokenizer_version: TOKENIZER_VERSION,
		git_commit: requiredString(result.git_commit, "results[0].git_commit"),
		source_repository: sourceRepository,
		run_id: requiredString(result.run_id, "results[0].run_id"),
		timestamp,
		results_count: 1,
		provenance,
	};
}

function scenarioFromResult(
	path: string,
	result: JsonObject,
	timestamp: string,
	provenance: string,
	sourceRepository: string,
): JsonObject {
	const scenario = readObject(path);
	const metrics = isObject(scenario.deterministic_metrics)
		? { ...scenario.deterministic_metrics }
		: {};
	for (const key of [
		"duration_ms",
		"timing_p50_ms",
		"timing_p95_ms",
		"error_count",
		"retry_count",
		"context_tokens",
		"prompt_tokens",
		"output_tokens",
		"context_bytes",
		"output_bytes",
		"tool_call_count",
		"tool_success_rate",
	] as const) {
		if (result[key] !== undefined) metrics[key] = result[key];
	}
	scenario.baseline_id = BASELINE_ID;
	scenario.scenario_version = SCENARIO_VERSION;
	scenario.deterministic_metrics = metrics;
	scenario.measurement = {
		status: "observed",
		source: provenance,
		sample_count: SAMPLE_COUNT,
		warmup_count: WARMUP_COUNT,
		git_commit: requiredString(result.git_commit, "results[0].git_commit"),
		source_repository: sourceRepository,
		timestamp,
	};
	return scenario;
}

function writeEvolutionBenchmarkBaseline(
	repoRoot: string,
	payload: JsonObject,
	provenance: string,
	options: EvolutionBaselineWriterOptions = {},
): string[] {
	const head = options.currentCommit ?? currentCommit(repoRoot);
	const baselinePath = join(repoRoot, RELATIVE_PATHS[0]);
	const result = validateInput(payload, head, existsSync(baselinePath));
	const now = options.now ?? new Date();
	if (!Number.isFinite(now.getTime()))
		throw new Error("Writer timestamp is invalid");
	const timestamp = now.toISOString();
	const sourceRepository = requiredSourceRepository(
		result.source_repository,
		"results[0].source_repository",
	);
	const scenarioPath = join(repoRoot, RELATIVE_PATHS[1]);
	const baseline = baselineFromResult(
		result,
		timestamp,
		provenance,
		sourceRepository,
	);
	const scenario = scenarioFromResult(
		scenarioPath,
		result,
		timestamp,
		provenance,
		sourceRepository,
	);
	const baselineText = `${JSON.stringify(baseline, null, 2)}\n`;
	const scenarioText = `${JSON.stringify(scenario, null, 2)}\n`;
	const outputs = [
		[baselinePath, baselineText],
		[scenarioPath, scenarioText],
	] as const;
	withBaselineRollback(outputs, options.write ?? atomicWriteText);
	return [...RELATIVE_PATHS];
}

export function updateEvolutionBenchmarkBaseline(
	repoRoot: string,
	options: EvolutionBaselineWriterOptions = {},
): string[] {
	assertCleanBenchmarkInputs(repoRoot);
	const benchmark = runControlledBenchmark(repoRoot);
	const results = benchmark.payload.results;
	const status =
		Array.isArray(results) && isObject(results[0])
			? results[0].status
			: undefined;
	const expectedExit = status === "baseline-missing" ? 2 : 0;
	if (benchmark.exitCode !== expectedExit) {
		throw new Error(
			`Controlled evolution benchmark exit ${benchmark.exitCode} does not match result status`,
		);
	}
	return writeEvolutionBenchmarkBaseline(
		repoRoot,
		benchmark.payload,
		PROVENANCE,
		options,
	);
}

function assertNoExternalInput(args: string[]): void {
	if (args.length === 0) return;
	throw new Error(
		"Usage: bun run cli/dev/update-evolution-benchmark-baseline.ts (external benchmark JSON is not accepted)",
	);
}

export const evolutionBaselineWriterTestApi = {
	writeFixture(
		repoRoot: string,
		inputPath: string,
		options: EvolutionBaselineWriterOptions = {},
	): string[] {
		return writeEvolutionBenchmarkBaseline(
			repoRoot,
			readObject(inputPath),
			FIXTURE_PROVENANCE,
			options,
		);
	},
	writeFixtureAfterCleanInputCheck(
		repoRoot: string,
		inputPath: string,
		options: EvolutionBaselineWriterOptions = {},
	): string[] {
		assertCleanBenchmarkInputs(repoRoot);
		return writeEvolutionBenchmarkBaseline(
			repoRoot,
			readObject(inputPath),
			FIXTURE_PROVENANCE,
			options,
		);
	},
	assertCleanInputs: assertCleanBenchmarkInputs,
	assertNoExternalInput,
};

function main(): void {
	try {
		const repoRoot = resolve(import.meta.dir, "..", "..");
		assertNoExternalInput(process.argv.slice(2));
		const paths = updateEvolutionBenchmarkBaseline(repoRoot);
		console.log(`evolution benchmark baseline: updated ${paths.length} files`);
	} catch (error) {
		console.error((error as Error).message);
		process.exitCode = 1;
	}
}

if (import.meta.main) main();
