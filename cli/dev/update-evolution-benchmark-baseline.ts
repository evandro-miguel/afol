#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { atomicWriteText } from "../services/io/atomic";

const PACK_ID = "evolution-core";
const SCENARIO_ID = "evolution-status-contract";
const SCENARIO_VERSION = "1.1.0";
const BASELINE_ID = "evolution-core-v2";
const BASELINE_REFERENCE =
	".afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v2.json";
const PROVENANCE = "fresh-local-runnable-smoke";
const SAMPLE_COUNT = 3;
const WARMUP_COUNT = 1;
const MAX_DURATION_MS = 4000;
const MAX_P95_MS = 4000;
const MAX_OUTPUT_TOKENS = 250;
const MAX_OUTPUT_BYTES = 4000;
const MIN_TOOL_SUCCESS_RATE = 0.98;

const RELATIVE_PATHS = [
	".afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v2.json",
	".afol/data/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
	"src/project-template/.afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v2.json",
	"src/project-template/.afol/data/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
] as const;

type JsonObject = Record<string, unknown>;

export type EvolutionBaselineWriterOptions = {
	now?: Date;
	currentCommit?: string;
	write?: (path: string, content: string) => void;
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
		for (let index = snapshots.length - 1; index >= 0; index -= 1) {
			const snapshot = snapshots[index];
			if (!snapshot) continue;
			try {
				if (snapshot.before === null) {
					if (existsSync(snapshot.path)) rmSync(snapshot.path, { force: true });
					continue;
				}
				atomicWriteText(snapshot.path, snapshot.before.toString("utf8"));
			} catch {
				// Preserve the original write failure while attempting every rollback.
			}
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

function currentCommit(repoRoot: string): string {
	try {
		return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
			cwd: repoRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch {
		throw new Error("Unable to resolve current git HEAD");
	}
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
	if (payload.mode !== "benchmark") {
		throw new Error("Benchmark input must have mode=benchmark");
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
	if (
		result.scenario_id !== SCENARIO_ID ||
		result.scenario_version !== SCENARIO_VERSION ||
		result.pack_id !== PACK_ID
	) {
		throw new Error("Benchmark input scenario does not match evolution-core");
	}
	const commit = requiredString(result.git_commit, "results[0].git_commit");
	if (commit !== head) {
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
	if (
		Array.isArray(notes) &&
		notes.some(
			(note) =>
				typeof note === "string" && note.startsWith("baseline-regression:"),
		)
	) {
		throw new Error("Benchmark input must not contain baseline-regression");
	}
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

function baselineFromResult(result: JsonObject, timestamp: string): JsonObject {
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
		tokenizer_id: "tiktoken-o200k-base",
		tokenizer_version: "recorded",
		git_commit: requiredString(result.git_commit, "results[0].git_commit"),
		run_id: requiredString(result.run_id, "results[0].run_id"),
		timestamp,
		results_count: 1,
		provenance: PROVENANCE,
	};
}

function scenarioFromResult(
	path: string,
	result: JsonObject,
	timestamp: string,
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
		source: PROVENANCE,
		sample_count: SAMPLE_COUNT,
		warmup_count: WARMUP_COUNT,
		git_commit: requiredString(result.git_commit, "results[0].git_commit"),
		timestamp,
	};
	return scenario;
}

export function updateEvolutionBenchmarkBaseline(
	repoRoot: string,
	inputPath: string,
	options: EvolutionBaselineWriterOptions = {},
): string[] {
	const payload = readObject(inputPath);
	const head = options.currentCommit ?? currentCommit(repoRoot);
	const rootBaselinePath = join(repoRoot, RELATIVE_PATHS[0]);
	const templateBaselinePath = join(repoRoot, RELATIVE_PATHS[2]);
	const result = validateInput(
		payload,
		head,
		existsSync(rootBaselinePath) || existsSync(templateBaselinePath),
	);
	const now = options.now ?? new Date();
	if (!Number.isFinite(now.getTime()))
		throw new Error("Writer timestamp is invalid");
	const timestamp = now.toISOString();
	const rootScenarioPath = join(repoRoot, RELATIVE_PATHS[1]);
	const templateScenarioPath = join(repoRoot, RELATIVE_PATHS[3]);
	const baseline = baselineFromResult(result, timestamp);
	const rootScenario = scenarioFromResult(rootScenarioPath, result, timestamp);
	const templateScenario = scenarioFromResult(
		templateScenarioPath,
		result,
		timestamp,
	);
	const baselineText = `${JSON.stringify(baseline, null, 2)}\n`;
	const rootScenarioText = `${JSON.stringify(rootScenario, null, 2)}\n`;
	const templateScenarioText = `${JSON.stringify(templateScenario, null, 2)}\n`;
	const outputs = [
		[rootBaselinePath, baselineText],
		[rootScenarioPath, rootScenarioText],
		[templateBaselinePath, baselineText],
		[templateScenarioPath, templateScenarioText],
	] as const;
	withBaselineRollback(outputs, options.write ?? atomicWriteText);
	return [...RELATIVE_PATHS];
}

function parseInputPath(args: string[]): string {
	if (args.length === 1 && args[0] && !args[0].startsWith("-")) return args[0];
	if (args.length === 2 && args[0] === "--input" && args[1]) return args[1];
	throw new Error(
		"Usage: bun run cli/dev/update-evolution-benchmark-baseline.ts <benchmark-output.json>",
	);
}

function main(): void {
	try {
		const repoRoot = resolve(import.meta.dir, "..", "..");
		const inputPath = resolve(repoRoot, parseInputPath(process.argv.slice(2)));
		const paths = updateEvolutionBenchmarkBaseline(repoRoot, inputPath);
		console.log(`evolution benchmark baseline: updated ${paths.length} files`);
	} catch (error) {
		console.error((error as Error).message);
		process.exitCode = 1;
	}
}

if (import.meta.main) main();
