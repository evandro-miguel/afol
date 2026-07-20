#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { atomicWriteText } from "../services/io/atomic";

const PACK_ID = "evolution-core";
const SCENARIO_ID = "evolution-status-contract";
const SCENARIO_VERSION = "1.0.0";
const BASELINE_ID = "evolution-core-v1";
const PROVENANCE = "fresh-local-runnable-smoke";
const SAMPLE_COUNT = 3;
const WARMUP_COUNT = 1;

const RELATIVE_PATHS = [
	".afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v1.json",
	".afol/data/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
	"src/project-template/.afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v1.json",
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

function validateInput(payload: JsonObject, head: string): JsonObject {
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
	if (result.status !== "passed" || result.pass !== true) {
		throw new Error("Benchmark scenario must pass");
	}
	const commit = requiredString(result.git_commit, "results[0].git_commit");
	if (commit !== head) {
		throw new Error(
			`Benchmark scenario git_commit ${JSON.stringify(commit)} does not match current HEAD ${JSON.stringify(head)}`,
		);
	}
	if (result.baseline_id !== BASELINE_ID) {
		throw new Error(
			"Benchmark scenario baseline_id does not match evolution-core-v1",
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
		"output_bytes",
		"tool_call_count",
		"tool_success_rate",
	] as const) {
		requiredNumber(result[key], `results[0].${key}`);
	}
	const staleIssuePrefix =
		"benchmark-provenance-commit-not-ancestor:evolution-core:evolution-status-contract:";
	if (payload.status !== "passed") {
		const issues = payload.contract_issues;
		if (
			!Array.isArray(issues) ||
			issues.length !== 1 ||
			typeof issues[0] !== "string" ||
			!issues[0].startsWith(staleIssuePrefix) ||
			issues[0].slice(staleIssuePrefix.length) === head
		) {
			throw new Error(
				"Benchmark input must pass, except for the stale evolution baseline provenance issue",
			);
		}
	}
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
	const result = validateInput(payload, head);
	const now = options.now ?? new Date();
	if (!Number.isFinite(now.getTime()))
		throw new Error("Writer timestamp is invalid");
	const timestamp = now.toISOString();
	const rootBaselinePath = join(repoRoot, RELATIVE_PATHS[0]);
	const rootScenarioPath = join(repoRoot, RELATIVE_PATHS[1]);
	const templateBaselinePath = join(repoRoot, RELATIVE_PATHS[2]);
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
