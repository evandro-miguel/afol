import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { splitCommandLine } from "../commands/workbench/verify";
import { boundedSpawn } from "../core/subprocess";
import { sha256 } from "../services/evolution/imports/digest";
import {
	HOT_PATH_BENCHMARK_ENV,
	HOT_PATH_BENCHMARK_MARKER,
} from "../services/hot-path/instrumentation";
import {
	completeObservedTask,
	newWorkstream,
	startTask,
} from "../services/workbench/lifecycle";
import { maxSampleOutputBytes } from "./output-metrics";
import type {
	BenchmarkExecutionProfile,
	HotPathScenarioConfig,
	PreparedCompiledReleaseArtifact,
	Scenario,
	ScenarioExecutionResult,
} from "./types";

type HotPathRunnerOptions = {
	sampleCount: number;
	warmupCount: number;
	artifact?: PreparedCompiledReleaseArtifact;
};

type CapturedOutput = {
	stdout: string;
	stderr: string;
};

type HotPathInstrumentationSnapshot = {
	counters: Record<
		| "status.health"
		| "status.catchup"
		| "workbench.local_state_refresh"
		| "workbench.telemetry"
		| "workbench.canonical_write",
		number
	>;
	measurements: Record<
		"status" | "start" | "done" | "close",
		{ calls: number; duration_ms: number; output_bytes: number }
	>;
};

type CliInvocation = {
	/** The command-level argv passed to the real AFOL CLI (without wrappers). */
	args: string[];
	exitCode: number;
	output: CapturedOutput;
	duration_ms: number;
	instrumentation: HotPathInstrumentationSnapshot;
	note?: string;
};

type HotPathSample = {
	duration_ms: number;
	output_bytes: number;
	canonical_write_count: number;
	telemetry_append_count: number;
	derived_work_calls: number;
	instrumented_duration_ms: number;
	instrumented_output_bytes: number;
	fixture_creation_duration_ms: number;
	setup_duration_ms: number;
	recovery_duration_ms: number;
	exit_code: number;
	notes: string[];
};

const HOT_PATH_OUTPUT_LIMIT_BYTES = 20_000;
const HOT_PATH_MAIN_PATH = resolve(import.meta.dir, "../main.ts");

export const F32_CONFIG_VERIFICATION_COMMAND =
	'bun -e \'let c=await Bun.file(".afol/config.json").json().catch(()=>null);process.exit(c?.schema_version===1&&c?.project?.name==="f32-hot-path-fixture"?0:1)\'';

/**
 * Compiled-Bun detection used by the hot-path launcher.
 *
 * `import.meta.dir` is not a reliable discriminator: inside a
 * `bun build --compile` binary it can resolve to a virtual `$bunfs` path or
 * to the build-time source directory, so the external entrypoint may either
 * not exist or still exist on disk. The compiled-runtime signal is the
 * entrypoint itself being a virtual `$bunfs` path instead of an external
 * file. This mirrors `isCompiledBunRuntime` in scenario-execution.ts.
 */
function isHotPathCompiledRuntime(mainPath: string = Bun.main): boolean {
	return mainPath.includes("$bunfs");
}

/**
 * Resolve the argv that launches the real AFOL CLI for a hot-path sample.
 *
 * Source runtime: the Bun runtime re-executes the external `main.ts`
 * entrypoint. Compiled runtime: the running binary re-executes itself, so the
 * embedded source path must not be passed to it.
 */
export function resolveHotPathLauncherArgv(
	compiledRuntime: boolean,
	execPath: string,
	sourceMainPath: string,
	args: string[],
): string[] {
	return compiledRuntime
		? [execPath, ...args]
		: [execPath, sourceMainPath, ...args];
}

function emptyInstrumentation(): HotPathInstrumentationSnapshot {
	return {
		counters: {
			"status.health": 0,
			"status.catchup": 0,
			"workbench.local_state_refresh": 0,
			"workbench.telemetry": 0,
			"workbench.canonical_write": 0,
		},
		measurements: {
			status: { calls: 0, duration_ms: 0, output_bytes: 0 },
			start: { calls: 0, duration_ms: 0, output_bytes: 0 },
			done: { calls: 0, duration_ms: 0, output_bytes: 0 },
			close: { calls: 0, duration_ms: 0, output_bytes: 0 },
		},
	};
}

function addInstrumentation(
	left: HotPathInstrumentationSnapshot,
	right: HotPathInstrumentationSnapshot,
): HotPathInstrumentationSnapshot {
	const combined = emptyInstrumentation();
	for (const key of Object.keys(combined.counters) as Array<
		keyof HotPathInstrumentationSnapshot["counters"]
	>) {
		combined.counters[key] = left.counters[key] + right.counters[key];
	}
	for (const key of Object.keys(combined.measurements) as Array<
		keyof HotPathInstrumentationSnapshot["measurements"]
	>) {
		combined.measurements[key] = {
			calls: left.measurements[key].calls + right.measurements[key].calls,
			duration_ms:
				left.measurements[key].duration_ms +
				right.measurements[key].duration_ms,
			output_bytes:
				left.measurements[key].output_bytes +
				right.measurements[key].output_bytes,
		};
	}
	return combined;
}

export function captureBenchmarkMarker(stderr: string): {
	output: string;
	instrumentation: HotPathInstrumentationSnapshot;
	note?: string;
} {
	const lines = stderr.split(/\r?\n/);
	const markerIndex = lines.findIndex((line) =>
		line.startsWith(HOT_PATH_BENCHMARK_MARKER),
	);
	if (markerIndex < 0) {
		return {
			output: stderr,
			instrumentation: emptyInstrumentation(),
			note: "hot-path-instrumentation-missing",
		};
	}
	const marker =
		lines[markerIndex]?.slice(HOT_PATH_BENCHMARK_MARKER.length) ?? "";
	try {
		const parsed = JSON.parse(marker) as HotPathInstrumentationSnapshot;
		return {
			output: lines.filter((_, index) => index !== markerIndex).join("\n"),
			instrumentation: parsed,
		};
	} catch {
		return {
			output: lines.filter((_, index) => index !== markerIndex).join("\n"),
			instrumentation: emptyInstrumentation(),
			note: "hot-path-instrumentation-invalid",
		};
	}
}

function runDeclaredCli(
	root: string,
	args: string[],
	session: string,
	artifact?: PreparedCompiledReleaseArtifact,
): CliInvocation {
	const started = performance.now();
	const result = boundedSpawn(
		"env",
		[
			`${HOT_PATH_BENCHMARK_ENV}=1`,
			// Keep the catalog argv unchanged while binding the temporary fixture
			// through the same implicit-session mechanism as the fast path. This
			// also keeps the benchmark valid when CI disables global fallback.
			`AFOL_SESSION=${session}`,
			...resolveHotPathLauncherArgv(
				artifact !== undefined || isHotPathCompiledRuntime(),
				artifact?.binaryPath ?? process.execPath,
				HOT_PATH_MAIN_PATH,
				args,
			),
		],
		{
			cwd: root,
			timeoutMs: 30_000,
			maxBuffer: 256_000,
		},
	);
	const captured = captureBenchmarkMarker(result.stderr);
	return {
		args: [...args],
		exitCode: result.status ?? 1,
		output: { stdout: result.stdout, stderr: captured.output },
		duration_ms: Math.max(1, Math.round(performance.now() - started)),
		instrumentation: captured.instrumentation,
		...(captured.note ? { note: captured.note } : {}),
	};
}

function percentile(values: number[], ratio: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	const position = (sorted.length - 1) * ratio;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	const lowerValue = sorted[lower] ?? 0;
	const upperValue = sorted[upper] ?? lowerValue;
	return Math.round(
		lowerValue + (upperValue - lowerValue) * (position - lower),
	);
}

function gitCommit(projectRoot: string): string {
	const result = boundedSpawn("git", ["rev-parse", "--short=12", "HEAD"], {
		cwd: projectRoot,
		timeoutMs: 15_000,
	});
	return result.ok ? result.stdout.trim() || "unknown" : "unknown";
}

/**
 * Hash the running compiled executable for provenance, failing closed when
 * the artifact cannot be read or hashed.
 */
function hashRunningExecutable(execPath: string): string {
	try {
		return sha256(readFileSync(execPath));
	} catch (error) {
		throw new Error(
			`compiled-runtime-artifact-hash-failed:${execPath}:${(error as Error).message}`,
		);
	}
}

/**
 * Execution profile for a hot-path benchmark run.
 *
 * Source runtime reports the historical source profile. Compiled runtime
 * (the benchmark self-launching from a `bun build --compile` binary) reports
 * compiled-release/bun-compile provenance with the real SHA-256 of the
 * running executable and fails closed when the artifact cannot be hashed.
 */
export function executionProfile(
	mainPath: string = Bun.main,
	execPath: string = process.execPath,
): BenchmarkExecutionProfile {
	const compiledRuntime = isHotPathCompiledRuntime(mainPath);
	return {
		host_profile_id: `hot-path-${process.platform}-${process.arch}`,
		os: process.platform,
		arch: process.arch,
		cpu_class: `${cpus().length}-cpu`,
		bun_version: Bun.version,
		runtime_version: Bun.version,
		execution_mode: compiledRuntime ? "compiled-release" : "source",
		artifact_mode: compiledRuntime ? "bun-compile" : "source",
		artifact_sha256: compiledRuntime
			? hashRunningExecutable(execPath)
			: "source",
	};
}

function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function prepareProjectRoot(root: string): void {
	for (const path of [
		".afol/adm/hooks",
		".afol/adm/rules",
		".afol/adm/source",
		".afol/adm/specs",
		".afol/wb",
		".agents/skills",
	]) {
		mkdirSync(join(root, path), { recursive: true });
	}
	writeJson(join(root, ".afol", "config.json"), {
		schema_version: 1,
		project: { name: "f32-hot-path-fixture" },
	});
	writeJson(join(root, ".agents", "lock.json"), {
		schema_version: 1,
		locked: true,
	});
	writeJson(join(root, ".agents", "manifest.json"), {
		schema_version: 1,
		managed_hashes: {},
	});
}

function prepareFixture(
	root: string,
	operation: HotPathScenarioConfig["operation"],
): {
	session: string;
	fixture_creation_duration_ms: number;
	setup_duration_ms: number;
} {
	const fixtureStarted = performance.now();
	prepareProjectRoot(root);
	const setupStarted = performance.now();
	const created = newWorkstream(root, "f32 hot path", {
		noSpecRequiredReason: "benchmark fixture",
	});
	if (operation === "done" || operation === "close") {
		startTask(root, { session: created.session, taskId: "T-01" });
	}
	if (operation === "close") {
		completeObservedTask(root, {
			session: created.session,
			taskId: "T-01",
			command: F32_CONFIG_VERIFICATION_COMMAND,
			exitCode: 0,
		});
	}
	return {
		session: created.session,
		fixture_creation_duration_ms: Math.max(
			1,
			Math.round(performance.now() - fixtureStarted),
		),
		setup_duration_ms: Math.max(
			1,
			Math.round(performance.now() - setupStarted),
		),
	};
}

/**
 * Resolve the catalog command to command-level AFOL argv.
 *
 * The `afol` executable token is a catalog notation and is handled by the
 * benchmark launcher. No flags are synthesized here: the only runtime
 * substitution is the temporary fixture session placeholder.
 */
export function declaredHotPathArgs(
	scenario: HotPathScenarioConfig,
	command: string,
	session: string,
): string[] {
	const tokens = splitCommandLine(command.trim());
	if (tokens.shift() !== "afol") {
		throw new Error(`Hot-path command must start with afol: ${command}`);
	}
	const operation = tokens.shift();
	if (operation !== scenario.operation) {
		throw new Error(
			`Hot-path command operation mismatch: ${operation ?? "missing"} != ${scenario.operation}`,
		);
	}
	// The catalog command is the benchmark's authored fast path.  Only the
	// fixture placeholder is bound at runtime; lifecycle commands must resolve
	// their session through the fixture's active-session binding, not by adding
	// an explicit --session flag that the catalog did not author.
	return [
		operation,
		...tokens.map((token) => (token === "fixture" ? session : token)),
	];
}

function invokeHotPath(
	root: string,
	scenario: HotPathScenarioConfig,
	session: string,
	command: string,
	artifact?: PreparedCompiledReleaseArtifact,
): {
	exitCode: number;
	duration_ms: number;
	output: CapturedOutput;
	recovery_duration_ms: number;
	instrumentation: HotPathInstrumentationSnapshot;
	notes: string[];
} {
	const primaryArgs = declaredHotPathArgs(scenario, command, session);
	const primary = runDeclaredCli(root, primaryArgs, session, artifact);
	let recoveryDuration = 0;
	let recoveryInstrumentation = emptyInstrumentation();
	const notes: string[] = [];
	if (primary.note) notes.push(primary.note);
	if (scenario.mode === "explicit-derived" && scenario.operation !== "status") {
		if (scenario.recovery_command !== "afol local-state rebuild --json") {
			throw new Error(
				`Unsupported lifecycle recovery command: ${scenario.recovery_command ?? "missing"}`,
			);
		}
		const recovery = runDeclaredCli(
			root,
			["local-state", "rebuild", "--json"],
			session,
			artifact,
		);
		recoveryDuration = recovery.duration_ms;
		recoveryInstrumentation = recovery.instrumentation;
		if (recovery.note) notes.push(`recovery-${recovery.note}`);
		if (recovery.exitCode !== 0) {
			notes.push(`hot-path-recovery-exit:${recovery.exitCode}`);
		}
	}
	return {
		exitCode:
			primary.exitCode !== 0 ? primary.exitCode : notes.length > 0 ? 1 : 0,
		duration_ms: primary.duration_ms,
		// Recovery is a harness boundary, not command output. The instrumentation
		// marker was removed by runDeclaredCli before this is measured.
		output: primary.output,
		recovery_duration_ms: recoveryDuration,
		instrumentation: addInstrumentation(
			primary.instrumentation,
			recoveryInstrumentation,
		),
		notes,
	};
}

function runSample(
	projectRoot: string,
	scenario: HotPathScenarioConfig,
	command: string,
	artifact?: PreparedCompiledReleaseArtifact,
): HotPathSample {
	const afolDir = join(projectRoot, ".afol");
	const tempDir = join(afolDir, "tmp");
	const afolDirExisted = existsSync(afolDir);
	const tempDirExisted = existsSync(tempDir);
	mkdirSync(tempDir, { recursive: true });
	const fixtureRoot = mkdtempSync(join(tempDir, "f32-hot-path-"));
	const notes: string[] = [];
	try {
		const fixture = prepareFixture(fixtureRoot, scenario.operation);
		const invocation = invokeHotPath(
			fixtureRoot,
			scenario,
			fixture.session,
			command,
			artifact,
		);
		const outputBytes = maxSampleOutputBytes([invocation.output]);
		const counters = invocation.instrumentation.counters;
		const measurement =
			invocation.instrumentation.measurements[scenario.operation];
		const derivedWorkCalls =
			counters["status.health"] +
			counters["status.catchup"] +
			counters["workbench.local_state_refresh"];
		notes.push(...invocation.notes);
		if (outputBytes > HOT_PATH_OUTPUT_LIMIT_BYTES) {
			notes.push(
				`hot-path-output-bytes:${outputBytes}>${HOT_PATH_OUTPUT_LIMIT_BYTES}`,
			);
		}
		if (invocation.exitCode !== 0) {
			notes.push(`hot-path-exit:${invocation.exitCode}`);
		}
		if (counters["workbench.telemetry"] > 0) {
			notes.push(`hot-path-telemetry:${counters["workbench.telemetry"]}`);
		}
		if (scenario.mode === "default" && derivedWorkCalls > 0) {
			notes.push(`hot-path-derived-work:${derivedWorkCalls}`);
		}
		if (scenario.mode === "explicit-derived" && derivedWorkCalls === 0) {
			notes.push("hot-path-derived-work-missing");
		}
		if (
			scenario.operation !== "status" &&
			counters["workbench.canonical_write"] === 0
		) {
			notes.push("hot-path-canonical-write-missing");
		}
		return {
			duration_ms: invocation.duration_ms,
			output_bytes: outputBytes,
			canonical_write_count: counters["workbench.canonical_write"],
			telemetry_append_count: counters["workbench.telemetry"],
			derived_work_calls: derivedWorkCalls,
			instrumented_duration_ms: measurement.duration_ms,
			instrumented_output_bytes: measurement.output_bytes,
			fixture_creation_duration_ms: fixture.fixture_creation_duration_ms,
			setup_duration_ms: fixture.setup_duration_ms,
			recovery_duration_ms: invocation.recovery_duration_ms,
			exit_code: invocation.exitCode,
			notes,
		};
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
		for (const [path, existed] of [
			[tempDir, tempDirExisted],
			[afolDir, afolDirExisted],
		] as const) {
			if (existed) continue;
			try {
				rmdirSync(path);
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "ENOENT" && code !== "ENOTEMPTY") {
					notes.push(`hot-path-cleanup-error:${code ?? "unknown"}`);
				}
			}
		}
	}
}

export function runHotPathScenario(
	projectRoot: string,
	scenario: Scenario,
	options: HotPathRunnerOptions,
): ScenarioExecutionResult {
	if (!scenario.hot_path) {
		throw new Error(
			`Hot-path scenario is missing configuration: ${scenario.scenario_id}`,
		);
	}
	const samples: HotPathSample[] = [];
	const warmupNotes: string[] = [];
	for (let index = 0; index < options.warmupCount; index += 1) {
		try {
			const warmup = runSample(
				projectRoot,
				scenario.hot_path,
				scenario.command ?? "",
				options.artifact,
			);
			// The warmup is intentionally not part of reported aggregates, but a
			// failed contract still fails closed rather than hiding a regression.
			if (warmup.notes.length > 0) {
				warmupNotes.push(`warmup-${index + 1}:${warmup.notes.join(",")}`);
			}
		} catch (error) {
			warmupNotes.push(`warmup-${index + 1}:${(error as Error).message}`);
		}
	}
	for (let index = 0; index < options.sampleCount; index += 1) {
		try {
			samples.push(
				runSample(
					projectRoot,
					scenario.hot_path,
					scenario.command ?? "",
					options.artifact,
				),
			);
		} catch (error) {
			samples.push({
				duration_ms: 0,
				output_bytes: 0,
				canonical_write_count: 0,
				telemetry_append_count: 0,
				derived_work_calls: 0,
				instrumented_duration_ms: 0,
				instrumented_output_bytes: 0,
				fixture_creation_duration_ms: 0,
				setup_duration_ms: 0,
				recovery_duration_ms: 0,
				exit_code: 1,
				notes: [`sample-${index + 1}:${(error as Error).message}`],
			});
		}
	}
	const durations = samples.map((sample) => sample.duration_ms);
	const outputBytes = samples.map((sample) => sample.output_bytes);
	const successful = samples.filter(
		(sample) => sample.exit_code === 0 && sample.notes.length === 0,
	).length;
	const notes = [...warmupNotes, ...samples.flatMap((sample) => sample.notes)];
	const profile = options.artifact?.profile ?? executionProfile();
	return {
		metrics: {
			duration_ms: percentile(durations, 0.5),
			timing_p50_ms: percentile(durations, 0.5),
			timing_p95_ms: percentile(durations, 0.95),
			error_count: options.sampleCount - successful,
			retry_count: 0,
			context_tokens: 0,
			prompt_tokens: 0,
			output_tokens: Math.round(Math.max(0, ...outputBytes) / 4),
			context_bytes: 0,
			output_bytes: Math.max(0, ...outputBytes),
			argv_chars: Array.from(scenario.command ?? "").length,
			tool_call_count: 1,
			tool_success_rate: Number((successful / options.sampleCount).toFixed(4)),
			sample_count: options.sampleCount,
			warmup_count: options.warmupCount,
			canonical_write_count: samples.reduce(
				(total, sample) => total + sample.canonical_write_count,
				0,
			),
			telemetry_append_count: samples.reduce(
				(total, sample) => total + sample.telemetry_append_count,
				0,
			),
			derived_work_calls: samples.reduce(
				(total, sample) => total + sample.derived_work_calls,
				0,
			),
			instrumented_duration_ms: Math.round(
				samples.reduce(
					(total, sample) => total + sample.instrumented_duration_ms,
					0,
				) / Math.max(1, samples.length),
			),
			instrumented_output_bytes: Math.round(
				samples.reduce(
					(total, sample) => total + sample.instrumented_output_bytes,
					0,
				) / Math.max(1, samples.length),
			),
			fixture_creation_duration_ms: percentile(
				samples.map((sample) => sample.fixture_creation_duration_ms),
				0.5,
			),
			setup_duration_ms: percentile(
				samples.map((sample) => sample.setup_duration_ms),
				0.5,
			),
			recovery_duration_ms: percentile(
				samples.map((sample) => sample.recovery_duration_ms),
				0.5,
			),
		},
		notes,
		passed: notes.length === 0 && successful === options.sampleCount,
		profile,
		timestamp: options.artifact?.timestamp ?? new Date().toISOString(),
		git_commit: options.artifact?.git_commit ?? gitCommit(projectRoot),
		...(options.artifact
			? {
					source_state_sha256: options.artifact.source_state_sha256,
					source_dirty: options.artifact.source_dirty,
				}
			: {}),
	};
}
