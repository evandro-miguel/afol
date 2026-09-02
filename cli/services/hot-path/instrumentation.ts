export type HotPathCounter =
	| "status.health"
	| "status.catchup"
	| "workbench.local_state_refresh"
	| "workbench.telemetry"
	| "workbench.canonical_write";

export type HotPathOperation = "status" | "start" | "done" | "close";

/** Explicit benchmark side-channel used when a scenario runs the real CLI. */
export const HOT_PATH_BENCHMARK_ENV = "AFOL_HOT_PATH_BENCHMARK";
export const HOT_PATH_BENCHMARK_MARKER = "AFOL_HOT_PATH_BENCHMARK_RESULT:";

export const HOT_PATH_COUNTER_CAP = 1_024;
export const HOT_PATH_DURATION_MS_CAP = 60_000;
export const HOT_PATH_OUTPUT_BYTES_CAP = 10_000;

const counters: Record<HotPathCounter, number> = {
	"status.health": 0,
	"status.catchup": 0,
	"workbench.local_state_refresh": 0,
	"workbench.telemetry": 0,
	"workbench.canonical_write": 0,
};

type HotPathMeasurement = {
	calls: number;
	duration_ms: number;
	output_bytes: number;
};

const measurements: Record<HotPathOperation, HotPathMeasurement> = {
	status: { calls: 0, duration_ms: 0, output_bytes: 0 },
	start: { calls: 0, duration_ms: 0, output_bytes: 0 },
	done: { calls: 0, duration_ms: 0, output_bytes: 0 },
	close: { calls: 0, duration_ms: 0, output_bytes: 0 },
};

function bounded(value: number, cap: number): number {
	return Math.min(Math.max(0, Math.round(value)), cap);
}

/** Process-local counters for focused hot-path tests and benchmarks only. */
export function countHotPathOperation(counter: HotPathCounter): void {
	counters[counter] = Math.min(counters[counter] + 1, HOT_PATH_COUNTER_CAP);
}

export function beginHotPathMeasurement(
	operation: HotPathOperation,
): (output: string) => void {
	const startedAt = performance.now();
	return (output: string) => {
		const measurement = measurements[operation];
		if (measurement.calls >= HOT_PATH_COUNTER_CAP) return;
		measurement.calls += 1;
		measurement.duration_ms += bounded(
			performance.now() - startedAt,
			HOT_PATH_DURATION_MS_CAP,
		);
		measurement.output_bytes += bounded(
			Buffer.byteLength(output, "utf8"),
			HOT_PATH_OUTPUT_BYTES_CAP,
		);
	};
}

export function readHotPathCountersForTests(): Readonly<
	Record<HotPathCounter, number>
> {
	return { ...counters };
}

export function readHotPathMeasurementsForTests(): Readonly<
	Record<HotPathOperation, HotPathMeasurement>
> {
	return Object.fromEntries(
		Object.entries(measurements).map(([operation, measurement]) => [
			operation,
			{ ...measurement },
		]),
	) as Record<HotPathOperation, HotPathMeasurement>;
}

export function resetHotPathCountersForTests(): void {
	for (const counter of Object.keys(counters) as HotPathCounter[]) {
		counters[counter] = 0;
	}
	for (const operation of Object.keys(measurements) as HotPathOperation[]) {
		measurements[operation] = { calls: 0, duration_ms: 0, output_bytes: 0 };
	}
}

function emitHotPathBenchmarkResult(): void {
	if (process.env[HOT_PATH_BENCHMARK_ENV] !== "1") return;
	process.stderr.write(
		`${HOT_PATH_BENCHMARK_MARKER}${JSON.stringify({ counters, measurements })}\n`,
	);
}

if (process.env[HOT_PATH_BENCHMARK_ENV] === "1") {
	process.once("exit", emitHotPathBenchmarkResult);
}
