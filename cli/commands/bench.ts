import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	type BenchResult,
	DEFAULT_BENCH_PACK_ID,
	listBenchScenarios,
	runLiveBenchmark,
} from "../services/benchmark";
import {
	type CliMicroResult,
	runCliMicroBenchmark,
	summarizeCliMicro,
} from "../services/benchmark/cli-micro";
import {
	buildReport,
	loadBaseline,
	loadSavedRun,
	saveBaseline,
	saveRunArchive,
} from "../services/benchmark/report";
import type { BenchScenario } from "../services/benchmark/types";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type BenchAction = "run" | "cli" | "list" | "report" | "baseline";

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

function emitJson(
	io: CommandIo,
	action: string,
	data: Record<string, unknown>,
): void {
	io.stdout(stringifyEnvelope(envelopeOk(data, { action })));
}

function emitFailure(
	io: CommandIo,
	_action: string,
	message: string,
	exitCode = 2,
): number {
	io.stderr(message);
	return exitCode;
}

export async function runBenchCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const benchAction = action as BenchAction;
		const parsed = parseArgs(benchAction, args);
		const scenarios = listBenchScenarios();

		switch (benchAction) {
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
				const results = runCliMicroBenchmark(projectRoot);
				const summary = summarizeCliMicro(results);
				if (parsed.json) {
					emitJson(io, "bench.cli", { ...summary, results });
				} else {
					io.stdout(formatCliMicroText(results));
				}
				return 0;
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
					);
				}
				const loaded = loadSavedRun(runPath);
				if (!loaded) {
					return emitFailure(
						io,
						"bench.report",
						`Unable to read benchmark run: ${runPath}`,
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
					const results = runLiveScenarios(projectRoot, scenarios, false);
					const baseline = loadBaseline(projectRoot, DEFAULT_BENCH_PACK_ID);
					const report = buildReport(results, baseline);
					const runPath = saveRunArchive(projectRoot, report);
					const baselinePath = saveBaseline(
						projectRoot,
						DEFAULT_BENCH_PACK_ID,
						report,
					);
					if (parsed.json) {
						emitJson(io, "bench.baseline", {
							run_path: runPath,
							baseline_path: baselinePath,
							...report.json,
						});
					} else {
						io.stdout(
							[
								report.text,
								`saved baseline: ${baselinePath}`,
								`saved run: ${runPath}`,
							].join("\n"),
						);
					}
					return report.results.some((result) => result.status === "blocked")
						? 3
						: report.results.some((result) => result.status !== "passed")
							? 1
							: 0;
				}
				const baseline = loadBaseline(projectRoot, DEFAULT_BENCH_PACK_ID);
				if (!baseline) {
					return emitFailure(
						io,
						"bench.baseline",
						"No baseline found for comprehensive-live.",
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
				const results = runLiveScenarios(
					projectRoot,
					selectedScenarios,
					parsed.keepArtifacts,
				);
				const baseline = loadBaseline(projectRoot, DEFAULT_BENCH_PACK_ID);
				const report = buildReport(results, baseline);
				let runPath: string | null = null;
				if (parsed.save) {
					runPath = saveRunArchive(projectRoot, report);
				}
				if (parsed.json) {
					emitJson(io, "bench.run", {
						...report.json,
						run_path: runPath,
					});
				} else {
					const extra = runPath ? `\nsaved run: ${runPath}` : "";
					io.stdout(`${report.text}${extra}`);
				}
				if (
					results.some(
						(result) =>
							result.status === "blocked" &&
							result.notes.some((note) => note.startsWith("codex-missing:")),
					)
				) {
					return 3;
				}
				return results.some((result) => result.status !== "passed") ? 1 : 0;
			}
			default:
				return emitFailure(io, "bench", `Unknown bench action: ${action}`);
		}
	} catch (error) {
		return emitFailure(io, `bench.${action}`, (error as Error).message);
	}
}
