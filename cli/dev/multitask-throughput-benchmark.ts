import { mkdirSync } from "node:fs";
import { join } from "node:path";

type Measurement = {
	durationMs: number;
	outputBytes: number;
	stdout: string;
};

type Mode = "sequential" | "batch";

const sourceRoot = process.cwd();
const cli = join(sourceRoot, "cli", "main.ts");
const fixtureRoot = join(
	sourceRoot,
	".afol",
	"tmp",
	`multitask-throughput-${Date.now()}`,
);

function parseRuns(args: string[]): number {
	const index = args.indexOf("--runs");
	const value = index >= 0 ? Number.parseInt(args[index + 1] ?? "", 10) : 12;
	if (!Number.isInteger(value) || value < 1 || value > 50) {
		throw new Error("--runs must be an integer from 1 to 50.");
	}
	return value;
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
		stdout,
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
	mode: Mode,
	taskCount: number,
	label: string,
): {
	afolCalls: number;
	durationMs: number;
	outputBytes: number;
} {
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
	const session = JSON.parse(created.stdout).data.session as string;
	const measurements = [created];
	if (mode === "sequential" || taskCount === 1) {
		for (let index = 1; index <= taskCount; index += 1) {
			const taskId = `T-${String(index).padStart(2, "0")}`;
			measurements.push(run(projectRoot, ["start", taskId]));
			measurements.push(run(projectRoot, ["done", taskId, "--test", "true"]));
		}
	} else {
		const selector = `T-01..T-${String(taskCount).padStart(2, "0")}`;
		measurements.push(run(projectRoot, ["start", selector]));
		measurements.push(run(projectRoot, ["done", selector, "--test", "true"]));
	}
	measurements.push(run(projectRoot, ["close", "--session", session]));
	return {
		afolCalls: measurements.length,
		durationMs: Math.round(
			measurements.reduce(
				(total, measurement) => total + measurement.durationMs,
				0,
			),
		),
		outputBytes: measurements.reduce(
			(total, measurement) => total + measurement.outputBytes,
			0,
		),
	};
}

const runs = parseRuns(Bun.argv.slice(2));
mkdirSync(fixtureRoot, { recursive: true });

const scaling = [];
for (const taskCount of [1, 5, 10]) {
	scaling.push({
		task_count: taskCount,
		sequential: executeScenario(
			"sequential",
			taskCount,
			`scaling-sequential-${taskCount}`,
		),
		batch: executeScenario("batch", taskCount, `scaling-batch-${taskCount}`),
	});
}

const repeated = {
	sequential: [] as ReturnType<typeof executeScenario>[],
	batch: [] as ReturnType<typeof executeScenario>[],
};
for (let index = 0; index < runs; index += 1) {
	repeated.sequential.push(
		executeScenario("sequential", 10, `repeat-${index}-sequential`),
	);
	repeated.batch.push(executeScenario("batch", 10, `repeat-${index}-batch`));
}

function summarize(values: ReturnType<typeof executeScenario>[]) {
	const durations = values.map((value) => value.durationMs);
	const outputs = values.map((value) => value.outputBytes);
	return {
		afol_calls: values[0]?.afolCalls ?? 0,
		samples_ms: durations,
		p50_ms: percentile(durations, 0.5),
		p95_ms: percentile(durations, 0.95),
		output_bytes_p50: percentile(outputs, 0.5),
	};
}

console.log(
	JSON.stringify({
		schema: "afol.multitask-throughput/v1",
		fixture_root: fixtureRoot,
		runs,
		scaling,
		repeated_10_tasks: {
			sequential: summarize(repeated.sequential),
			batch: summarize(repeated.batch),
		},
	}),
);
