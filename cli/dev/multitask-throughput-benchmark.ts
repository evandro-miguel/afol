import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
	assertValidMultitaskBenchmarkBaseline,
	evaluateMultitaskBenchmark,
	formatBenchmarkSummary,
	type MultitaskBenchmarkBaseline,
	type MultitaskBenchmarkResult,
	type RepeatedSummary,
	repeatedPairOrder,
	type ScenarioResult,
} from "./multitask-throughput-contract";

type Measurement = {
	durationMs: number;
	outputBytes: number;
	argvChars: number;
};

type Mode = "sequential" | "batch";

type Options = {
	runs: number;
	json: boolean;
	save: boolean;
	smoke: boolean;
	keepFixture: boolean;
	baselinePath: string;
};

const sourceRoot = process.cwd();
const cli = join(sourceRoot, "cli", "main.ts");
const defaultBaselinePath = join(
	sourceRoot,
	".afol",
	"data",
	"benchmarks",
	"baselines",
	"multitask-throughput-v1.json",
);

function optionValue(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

function loadBaseline(path: string): MultitaskBenchmarkBaseline {
	const baseline = JSON.parse(
		readFileSync(path, "utf8"),
	) as MultitaskBenchmarkBaseline;
	assertValidMultitaskBenchmarkBaseline(baseline, path);
	return baseline;
}

function baselineSha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitOutput(args: string[]): string {
	const process = Bun.spawnSync(["git", ...args], { cwd: sourceRoot });
	if (process.exitCode !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed (${process.exitCode}): ${process.stderr.toString().trim()}`,
		);
	}
	return process.stdout.toString().trim();
}

function sourceProvenance(): { commit: string; dirty: boolean } {
	return {
		commit: gitOutput(["rev-parse", "HEAD"]),
		dirty: gitOutput(["status", "--porcelain"]).length > 0,
	};
}

function parseOptions(args: string[]): Options {
	const baselinePath = resolve(
		sourceRoot,
		optionValue(args, "--baseline") ?? defaultBaselinePath,
	);
	const baseline = loadBaseline(baselinePath);
	const smoke = args.includes("--smoke");
	const requestedRuns = optionValue(args, "--runs");
	if (smoke && requestedRuns) {
		throw new Error("Use either --smoke or --runs, not both.");
	}
	const runs = smoke
		? 1
		: requestedRuns
			? Number.parseInt(requestedRuns, 10)
			: baseline.sample_count_min;
	if (!Number.isInteger(runs) || runs < 1 || runs > 50) {
		throw new Error("--runs must be an integer from 1 to 50.");
	}
	if (!smoke && runs < baseline.sample_count_min) {
		throw new Error(
			`Quality comparison requires at least ${baseline.sample_count_min} runs; use --smoke for a fast check.`,
		);
	}
	const valueFlags = new Set(["--runs", "--baseline"]);
	const booleanFlags = new Set([
		"--json",
		"--save",
		"--smoke",
		"--keep-fixture",
	]);
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] ?? "";
		if (valueFlags.has(arg)) {
			if (!args[index + 1]) throw new Error(`Missing value for ${arg}.`);
			index += 1;
		} else if (!booleanFlags.has(arg)) {
			throw new Error(`Unknown benchmark argument: ${arg}`);
		}
	}
	return {
		runs,
		json: args.includes("--json"),
		save: args.includes("--save"),
		smoke,
		keepFixture: args.includes("--keep-fixture"),
		baselinePath,
	};
}

function run(cwd: string, args: string[]): Measurement {
	const started = performance.now();
	const process = Bun.spawnSync(["bun", cli, ...args], {
		cwd,
		env: { ...Bun.env, NO_COLOR: "1" },
	});
	const durationMs = performance.now() - started;
	const stdout = process.stdout.toString();
	const stderr = process.stderr.toString();
	if (process.exitCode !== 0) {
		throw new Error(
			`${args.join(" ")} failed (${process.exitCode})\n${stdout}${stderr}`,
		);
	}
	return {
		durationMs,
		outputBytes: Buffer.byteLength(stdout) + Buffer.byteLength(stderr),
		argvChars: Array.from(args.join(" ").trim()).length,
	};
}

function percentile(values: number[], requested: number): number {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.ceil(sorted.length * requested) - 1] ?? 0;
}

function taskArgs(taskCount: number): string[] {
	return Array.from({ length: taskCount }, (_, index) => [
		"--task",
		`benchmark task ${index + 1}`,
	]).flat();
}

function executeScenario(
	fixtureRoot: string,
	mode: Mode,
	taskCount: number,
	label: string,
): ScenarioResult {
	const projectRoot = join(fixtureRoot, label);
	mkdirSync(projectRoot, { recursive: true });
	run(sourceRoot, ["bootstrap", projectRoot]);
	const created = run(projectRoot, [
		"new",
		label,
		"--no-spec-required",
		"--reason",
		"temporary benchmark fixture",
		...taskArgs(taskCount),
		"--json",
	]);
	const measurements = [created];
	const authoredHotPath: Measurement[] = [];
	if (mode === "sequential" || taskCount === 1) {
		for (let index = 1; index <= taskCount; index += 1) {
			const taskId = `T-${String(index).padStart(2, "0")}`;
			const started = run(projectRoot, ["st", taskId]);
			const completed = run(projectRoot, ["d", taskId, "-x", "test -d .afol"]);
			measurements.push(started, completed);
			authoredHotPath.push(started, completed);
		}
	} else {
		const selector = `T-01..T-${String(taskCount).padStart(2, "0")}`;
		const started = run(projectRoot, ["st", selector]);
		const completed = run(projectRoot, ["d", selector, "-x", "test -d .afol"]);
		measurements.push(started, completed);
		authoredHotPath.push(started, completed);
	}
	const closed = run(projectRoot, ["c"]);
	measurements.push(closed);
	authoredHotPath.push(closed);
	return {
		afolCalls: measurements.length,
		verificationRuns: mode === "sequential" || taskCount === 1 ? taskCount : 1,
		durationMs: Math.round(
			measurements.reduce(
				(sum, measurement) => sum + measurement.durationMs,
				0,
			),
		),
		outputBytes: measurements.reduce(
			(sum, measurement) => sum + measurement.outputBytes,
			0,
		),
		argvChars: authoredHotPath.reduce(
			(sum, measurement) => sum + measurement.argvChars,
			0,
		),
	};
}

function summarize(values: ScenarioResult[]): RepeatedSummary {
	const durations = values.map((value) => value.durationMs);
	return {
		afol_calls: values[0]?.afolCalls ?? 0,
		verification_runs: values[0]?.verificationRuns ?? 0,
		samples_ms: durations,
		p50_ms: percentile(durations, 0.5),
		p95_ms: percentile(durations, 0.95),
		output_bytes_p50: percentile(
			values.map((value) => value.outputBytes),
			0.5,
		),
		argv_chars_p50: percentile(
			values.map((value) => value.argvChars),
			0.5,
		),
	};
}

async function main(): Promise<void> {
	const options = parseOptions(Bun.argv.slice(2));
	const baseline = loadBaseline(options.baselinePath);
	const provenance = sourceProvenance();
	const baselineHash = baselineSha256(options.baselinePath);
	const fixtureRoot = join(
		sourceRoot,
		".afol",
		"tmp",
		`multitask-throughput-${Date.now()}`,
	);
	mkdirSync(fixtureRoot, { recursive: true });
	try {
		const scaling = [1, 5, 10].map((taskCount) => ({
			task_count: taskCount,
			sequential: executeScenario(
				fixtureRoot,
				"sequential",
				taskCount,
				`scaling-sequential-${taskCount}`,
			),
			batch: executeScenario(
				fixtureRoot,
				"batch",
				taskCount,
				`scaling-batch-${taskCount}`,
			),
		}));
		const sequential: ScenarioResult[] = [];
		const batch: ScenarioResult[] = [];
		const boundary = executeScenario(
			fixtureRoot,
			"batch",
			100,
			"boundary-batch-100",
		);
		for (let index = 0; index < options.runs; index += 1) {
			for (const mode of repeatedPairOrder(index)) {
				const measurement = executeScenario(
					fixtureRoot,
					mode,
					10,
					`repeat-${index}-${mode}`,
				);
				if (mode === "sequential") sequential.push(measurement);
				else batch.push(measurement);
			}
		}
		const result: MultitaskBenchmarkResult = {
			schema: "afol.multitask-throughput/v2",
			generated_at: new Date().toISOString(),
			environment: {
				platform: process.platform,
				arch: process.arch,
				bun_version: Bun.version,
				timing_mode: "paired-relative",
				pair_order: "alternating",
				source_commit: provenance.commit,
				source_dirty: provenance.dirty,
				baseline_sha256: baselineHash,
			},
			runs: options.runs,
			first_attempt_success: true,
			retries: 0,
			scaling,
			batch_boundary_100: boundary,
			repeated_10_tasks: {
				sequential: summarize(sequential),
				batch: summarize(batch),
			},
		};
		const comparison = evaluateMultitaskBenchmark(
			result,
			baseline,
			!options.smoke,
		);
		const payload = { ...result, comparison };
		let artifactPath: string | undefined;
		if (options.save) {
			const stamp = result.generated_at
				.replaceAll(":", "-")
				.replace(/\.\d{3}Z$/, "Z");
			artifactPath = join(
				sourceRoot,
				".afol",
				"data",
				"benchmarks",
				"results",
				`${stamp}_multitask-throughput.json`,
			);
			mkdirSync(dirname(artifactPath), { recursive: true });
			writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
		}
		console.log(
			options.json
				? JSON.stringify(payload)
				: formatBenchmarkSummary(result, comparison, artifactPath),
		);
		if (comparison.status === "failed") process.exitCode = 1;
	} finally {
		if (!options.keepFixture) {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	}
}

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 2;
	}
}
