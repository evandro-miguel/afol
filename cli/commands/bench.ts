import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	type CliMicroResult,
	runCliMicroBenchmark,
	summarizeCliMicro,
} from "../services/benchmark/cli-micro";
import { runLiveBenchmark } from "../services/benchmark/live-runner";
import {
	buildReport,
	loadBaseline,
	loadSavedRun,
	saveBaseline,
	saveRunArchive,
} from "../services/benchmark/report";
import { listBenchScenarios } from "../services/benchmark/scenarios";
import type { BenchResult, BenchScenario } from "../services/benchmark/types";
import { DEFAULT_BENCH_PACK_ID } from "../services/benchmark/types";
import { type CommandIo, DEFAULT_IO } from "./io";

type BenchAction =
	| "run"
	| "cli"
	| "list"
	| "report"
	| "baseline"
	| "runtime-live";

const RUNTIME_LIVE_SNAPSHOT_RELATIVE_PATH =
	".afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json";
const RUNTIME_LIVE_VALIDATE_COMMAND =
	"afol validate bench --pack runtime-live-agent --json";
const RUNTIME_LIVE_RECEIPT_GUIDANCE =
	"run the fixed harness outside AFOL and provide its receipt at .afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json";

type ParsedArgs = {
	json: boolean;
	scenario: string | null;
	all: boolean;
	save: boolean;
	keepArtifacts: boolean;
	runPath: string | null;
};

function parseArgs(action: BenchAction, args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		json: false,
		scenario: null,
		all: false,
		save: false,
		keepArtifacts: false,
		runPath: null,
	};
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (!value) {
			continue;
		}
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (action === "run") {
			if (value === "--scenario") {
				const next = args[index + 1];
				if (!next || next.startsWith("-")) {
					throw new Error("Missing value for --scenario in bench run.");
				}
				parsed.scenario = next;
				index += 1;
				continue;
			}
			if (value === "--all") {
				parsed.all = true;
				continue;
			}
			if (value === "--save") {
				parsed.save = true;
				continue;
			}
			if (value === "--keep-artifacts") {
				parsed.keepArtifacts = true;
				continue;
			}
		}
		if (action === "report" && value === "--run") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --run in bench report.");
			}
			parsed.runPath = next;
			index += 1;
			continue;
		}
		if (action === "baseline" && value === "--save") {
			parsed.save = true;
			continue;
		}
		throw new Error(`Unknown bench argument: ${value}`);
	}
	if (action === "run" && parsed.scenario && parsed.all) {
		throw new Error("Use either --scenario or --all, not both.");
	}
	return parsed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function readJsonFile(path: string): {
	data: Record<string, unknown> | null;
	error: string | null;
} {
	try {
		return {
			data: asRecord(JSON.parse(readFileSync(path, "utf8"))),
			error: null,
		};
	} catch (error) {
		return { data: null, error: (error as Error).message };
	}
}

function runtimeLiveProfile(snapshot: Record<string, unknown> | null): {
	runtime: string;
	model: string;
	reasoning_effort: string;
} {
	const profile = asRecord(snapshot?.benchmark_profile);
	return {
		runtime: typeof profile?.runtime === "string" ? profile.runtime : "codex",
		model: typeof profile?.model === "string" ? profile.model : "gpt-5.4-mini",
		reasoning_effort:
			typeof profile?.reasoning_effort === "string"
				? profile.reasoning_effort
				: "medium",
	};
}

function runtimeLiveDryRun(projectRoot: string): Record<string, unknown> {
	const snapshotPath = join(projectRoot, RUNTIME_LIVE_SNAPSHOT_RELATIVE_PATH);
	const snapshotExists = existsSync(snapshotPath);
	const loadedSnapshot = snapshotExists
		? readJsonFile(snapshotPath)
		: { data: null, error: null };
	const snapshot = loadedSnapshot.data;
	const scenariosRaw = snapshot?.scenarios;
	const scenarioIds = Array.isArray(scenariosRaw)
		? scenariosRaw
				.map((entry) =>
					typeof entry === "object" && entry && "id" in entry
						? String((entry as { id: unknown }).id)
						: null,
				)
				.filter((entry): entry is string => Boolean(entry))
		: [];
	const note = loadedSnapshot.error
		? `receipt validation preview; snapshot parse failed: ${loadedSnapshot.error}`
		: "receipt validation preview; AFOL does not execute benchmark agents";
	return {
		pack_id: "runtime-live-agent",
		live_pack_id: snapshot?.pack_id ?? "runtime-flow-live-agent-v4",
		mode: "receipt-required",
		receipt_required: true,
		receipt_path: RUNTIME_LIVE_SNAPSHOT_RELATIVE_PATH,
		snapshot_exists: snapshotExists,
		saved_result_path: snapshot?.saved_result_path ?? null,
		benchmark_profile: runtimeLiveProfile(snapshot),
		snapshot_parse_error: loadedSnapshot.error,
		scenario_count: scenarioIds.length,
		scenario_ids: scenarioIds,
		validation_command: RUNTIME_LIVE_VALIDATE_COMMAND,
		receipt_guidance: RUNTIME_LIVE_RECEIPT_GUIDANCE,
		note,
	};
}

function formatRuntimeLiveDryRun(data: Record<string, unknown>): string {
	const profile = runtimeLiveProfile(asRecord(data));
	return [
		`bench runtime-live: ${data.mode}`,
		`receipt_required: ${data.receipt_required}`,
		`receipt: ${data.receipt_path} exists=${data.snapshot_exists}`,
		`profile: ${profile.model}/${profile.reasoning_effort}`,
		`scenarios: ${data.scenario_count}`,
		`validate: ${data.validation_command}`,
		`receipt guidance: ${data.receipt_guidance}`,
		String(data.note),
	].join("\n");
}

function formatScenarioList(scenarios: BenchScenario[]): string {
	return [
		`bench scenarios: ${scenarios.length}`,
		...scenarios.map(
			(scenario) =>
				`${scenario.id} @ ${scenario.version} - ${scenario.description}`,
		),
	].join("\n");
}

function selectScenarios(
	scenarios: BenchScenario[],
	parsed: ParsedArgs,
): BenchScenario[] {
	if (parsed.scenario) {
		const selected = scenarios.find(
			(scenario) => scenario.id === parsed.scenario,
		);
		if (!selected) {
			throw new Error(`Unknown benchmark scenario: ${parsed.scenario}`);
		}
		return [selected];
	}
	return parsed.all ? scenarios : scenarios;
}

function formatCliMicroText(results: CliMicroResult[]): string {
	const summary = summarizeCliMicro(results);
	return [
		`bench cli: ${summary.passed}/${results.length} passed`,
		`pack: ${summary.pack_id}`,
		`wall_clock_ms: ${summary.total_wall_clock_ms}`,
		`output_bytes: ${summary.total_output_bytes}`,
		`estimated_output_tokens: ${summary.total_estimated_output_tokens}`,
		...results.map(
			(result) =>
				`${result.status} ${result.command} ${result.args.join(" ")} exit=${result.exit_code ?? "null"} wall_clock_ms=${result.wall_clock_ms} output_bytes=${result.output_bytes} est_tokens=${result.estimated_output_tokens}`,
		),
	].join("\n");
}

function readLatestRunPath(projectRoot: string): string | null {
	const resultsDir = join(
		projectRoot,
		".afol",
		"data",
		"benchmarks",
		"results",
	);
	if (!existsSync(resultsDir)) {
		return null;
	}
	const candidates = readdirSync(resultsDir)
		.filter((entry) => entry.endsWith(".json"))
		.sort();
	const latest = candidates.at(-1);
	return latest ? join(resultsDir, latest) : null;
}

function resolveRunPath(projectRoot: string, runPath: string): string {
	return isAbsolute(runPath) ? runPath : resolve(projectRoot, runPath);
}

function runLiveScenarios(
	projectRoot: string,
	scenarios: BenchScenario[],
	keepArtifacts: boolean,
): BenchResult[] {
	return scenarios.map((scenario) =>
		runLiveBenchmark(projectRoot, scenario, { keepArtifacts }),
	);
}

type LiveScenarioRunner = (
	projectRoot: string,
	scenarios: BenchScenario[],
	keepArtifacts: boolean,
) => BenchResult[];

type CliMicroRunner = (projectRoot: string) => CliMicroResult[];

function reportExitCode(results: BenchResult[]): 0 | 1 | 3 {
	if (results.some((result) => result.status === "blocked")) {
		return 3;
	}
	return results.some((result) => result.status !== "passed") ? 1 : 0;
}

function emitJson(
	io: CommandIo,
	action: string,
	data: Record<string, unknown>,
): void {
	io.stdout(stringifyEnvelope(envelopeOk(data, { action })));
}

function emitReportJson(
	io: CommandIo,
	action: string,
	data: Record<string, unknown>,
	exitCode: 0 | 1 | 3,
	failure: { code: string; message: string } = {
		code: "BENCH_SCENARIOS_FAILED",
		message: "benchmark scenarios failed",
	},
): void {
	if (exitCode === 0) {
		emitJson(io, action, data);
		return;
	}
	const blocked = exitCode === 3;
	const error = blocked
		? {
				code: "BENCH_SCENARIOS_BLOCKED",
				message: "benchmark scenarios blocked",
			}
		: failure;
	const envelope = envelopeErr(error.code, error.message, {
		action,
		exitCode,
	}) as ResultEnvelope<Record<string, unknown>>;
	envelope.data = data;
	io.stdout(stringifyEnvelope(envelope));
}

function emitFailure(
	io: CommandIo,
	action: string,
	message: string,
	json: boolean,
	exitCode = 2,
): number {
	if (json) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr("bench.error", message, { action, exitCode }),
			),
		);
	} else {
		io.stderr(message);
	}
	return exitCode;
}

export async function runBenchCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	runScenarios: LiveScenarioRunner = runLiveScenarios,
	runCliMicro: CliMicroRunner = runCliMicroBenchmark,
): Promise<number> {
	try {
		const benchAction = action as BenchAction;
		const parsed = parseArgs(benchAction, args);
		const scenarios = listBenchScenarios();

		switch (benchAction) {
			case "runtime-live": {
				const data = runtimeLiveDryRun(projectRoot);
				if (parsed.json) {
					emitJson(io, "bench.runtime-live", data);
				} else {
					io.stdout(formatRuntimeLiveDryRun(data));
				}
				return 0;
			}
			case "list": {
				const data = {
					pack_id: DEFAULT_BENCH_PACK_ID,
					scenarios,
				};
				if (parsed.json) {
					emitJson(io, "bench.list", data);
				} else {
					io.stdout(formatScenarioList(scenarios));
				}
				return 0;
			}
			case "cli": {
				const results = runCliMicro(projectRoot);
				const summary = summarizeCliMicro(results);
				const exitCode = results.some((result) => result.status !== "passed")
					? 1
					: 0;
				if (parsed.json) {
					emitReportJson(io, "bench.cli", { ...summary, results }, exitCode, {
						code: "BENCH_CLI_FAILED",
						message: "cli microbenchmark failed",
					});
				} else {
					io.stdout(formatCliMicroText(results));
				}
				return exitCode;
			}
			case "report": {
				const runPath = parsed.runPath
					? resolveRunPath(projectRoot, parsed.runPath)
					: readLatestRunPath(projectRoot);
				if (!runPath) {
					return emitFailure(
						io,
						"bench.report",
						"No saved benchmark run found.",
						parsed.json,
					);
				}
				const loaded = loadSavedRun(runPath);
				if (!loaded) {
					return emitFailure(
						io,
						"bench.report",
						`Unable to read benchmark run: ${runPath}`,
						parsed.json,
					);
				}
				const baseline = loadBaseline(projectRoot, loaded.pack_id);
				const report = buildReport(loaded.results, baseline);
				if (parsed.json) {
					emitJson(io, "bench.report", { ...report.json, run_path: runPath });
				} else {
					io.stdout(report.text);
				}
				return 0;
			}
			case "baseline": {
				if (parsed.save) {
					const results = runScenarios(projectRoot, scenarios, false);
					const baseline = loadBaseline(projectRoot, DEFAULT_BENCH_PACK_ID);
					const report = buildReport(results, baseline);
					const runPath = saveRunArchive(projectRoot, report);
					const baselinePath = saveBaseline(
						projectRoot,
						DEFAULT_BENCH_PACK_ID,
						report,
					);
					const exitCode = reportExitCode(results);
					if (parsed.json) {
						emitReportJson(
							io,
							"bench.baseline",
							{
								run_path: runPath,
								baseline_path: baselinePath,
								...report.json,
							},
							exitCode,
						);
					} else {
						io.stdout(
							[
								report.text,
								`saved baseline: ${baselinePath}`,
								`saved run: ${runPath}`,
							].join("\n"),
						);
					}
					return exitCode;
				}
				const baseline = loadBaseline(projectRoot, DEFAULT_BENCH_PACK_ID);
				if (!baseline) {
					return emitFailure(
						io,
						"bench.baseline",
						"No baseline found for comprehensive-live.",
						parsed.json,
					);
				}
				if (parsed.json) {
					emitJson(io, "bench.baseline", { baseline });
				} else {
					io.stdout(JSON.stringify(baseline, null, 2));
				}
				return 0;
			}
			case "run": {
				const selectedScenarios = selectScenarios(scenarios, parsed);
				const results = runScenarios(
					projectRoot,
					selectedScenarios,
					parsed.keepArtifacts,
				);
				const baseline = loadBaseline(projectRoot, DEFAULT_BENCH_PACK_ID);
				const report = buildReport(results, baseline);
				let runPath: string | null = null;
				const runtimeSnapshotPath: string | null = null;
				if (parsed.save) {
					runPath = saveRunArchive(projectRoot, report);
				}
				const exitCode = reportExitCode(results);
				if (parsed.json) {
					emitReportJson(
						io,
						"bench.run",
						{
							...report.json,
							run_path: runPath,
							runtime_snapshot_path: runtimeSnapshotPath,
						},
						exitCode,
					);
				} else {
					const extra = runPath ? `\nsaved run: ${runPath}` : "";
					io.stdout(`${report.text}${extra}`);
				}
				return exitCode;
			}
			default:
				return emitFailure(
					io,
					"bench",
					`Unknown bench action: ${action}`,
					parsed.json,
				);
		}
	} catch (error) {
		return emitFailure(
			io,
			`bench.${action}`,
			(error as Error).message,
			args.includes("--json") || args.includes("-j"),
		);
	}
}
