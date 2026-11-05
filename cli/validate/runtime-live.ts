import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { boundedSpawn } from "../core/subprocess";
import { evaluateBenchmarkAcceptance } from "../services/benchmark/acceptance";
import { parseEventStream } from "../services/benchmark/metrics";
import type {
	EventStreamProfile,
	RawMetrics,
} from "../services/benchmark/types";
import { asString, isObject } from "./shared";
import type { BenchmarkResult, Scenario } from "./types";

const SNAPSHOT =
	".afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json";
const PACK = "runtime-flow-live-agent-v4";
const SCHEMA = "2.0.0";
const MAX_BYTES = 4 * 1024 * 1024;
const REFRESH =
	"provide a fresh schema 2.0.0 external receipt and catalog acceptance contract; AFOL does not execute models";
const PROFILE = {
	runtime: "codex",
	model: "gpt-5.6-luna",
	reasoning_effort: "medium",
};

type LiveScenario = {
	id: string;
	metrics: RawMetrics;
	acceptance: unknown;
	timing: {
		timing_p50_ms: number | null;
		timing_p95_ms: number | null;
		sample_count: number;
		warmup_count: number;
	};
};
type Evidence = {
	path: string;
	generatedAt: string;
	scenarios: Map<string, LiveScenario>;
};

function readArtifact(root: string, path: string): Record<string, unknown> {
	const parts = path.split("/");
	if (
		isAbsolute(path) ||
		path.includes("\\") ||
		!/^\.afol\/data\/benchmarks\/(snapshots|results)\/.+\.json$/.test(path) ||
		parts.slice(1).some((part) => !part || part.startsWith("."))
	)
		throw new Error("runtime-live-artifact-path-invalid");
	const target = resolve(root, path);
	const rel = relative(realpathSync(root), realpathSync(target));
	if (
		rel.startsWith("..") ||
		isAbsolute(rel) ||
		realpathSync(target) !== target
	)
		throw new Error("runtime-live-artifact-path-invalid");
	const stat = lstatSync(target);
	if (!stat.isFile() || stat.size > MAX_BYTES)
		throw new Error("runtime-live-artifact-size-invalid");
	const data: unknown = JSON.parse(readFileSync(target, "utf8"));
	if (!isObject(data) || Array.isArray(data))
		throw new Error("runtime-live-artifact-invalid");
	return data;
}

function validateHeader(data: Record<string, unknown>): string {
	if (data.schema_version !== SCHEMA)
		throw new Error(
			`runtime-live-acceptance-required:schema=${String(data.schema_version)};${REFRESH}`,
		);
	if (data.pack_id !== PACK)
		throw new Error("runtime-live-artifact-pack-mismatch");
	const profile = data.benchmark_profile;
	if (
		!isObject(profile) ||
		Object.entries(PROFILE).some(([key, value]) => profile[key] !== value)
	)
		throw new Error("runtime-live-profile-mismatch");
	const generatedAt = asString(data.generated_at, "generated_at");
	const age = Date.now() - Date.parse(generatedAt);
	if (
		!Number.isFinite(age) ||
		age < 0 ||
		age > 7 * 86400000 ||
		data.stale_after_days !== 7
	)
		throw new Error("runtime-live-snapshot-stale");
	return generatedAt;
}

function timingSamples(
	value: unknown,
	generatedAt: string,
): LiveScenario["timing"] {
	if (value === undefined)
		return {
			timing_p50_ms: null,
			timing_p95_ms: null,
			sample_count: 0,
			warmup_count: 0,
		};
	if (
		!isObject(value) ||
		!Array.isArray(value.samples) ||
		value.samples.length > 64 ||
		typeof value.warmup_count !== "number" ||
		!Number.isSafeInteger(value.warmup_count) ||
		value.warmup_count < 0 ||
		value.samples.length - value.warmup_count < 2
	)
		throw new Error("runtime-live-timing-samples-invalid");
	const ids = new Set<string>();
	const durations = value.samples
		.map((sample: unknown) => {
			if (
				!isObject(sample) ||
				typeof sample.run_id !== "string" ||
				!sample.run_id ||
				ids.has(sample.run_id)
			)
				throw new Error("runtime-live-timing-sample-id-invalid");
			ids.add(sample.run_id);
			const start =
				typeof sample.started_at === "string"
					? Date.parse(sample.started_at)
					: NaN;
			const finish =
				typeof sample.finished_at === "string"
					? Date.parse(sample.finished_at)
					: NaN;
			if (
				!Number.isFinite(start) ||
				!Number.isFinite(finish) ||
				finish < start ||
				finish > Date.parse(generatedAt) ||
				start < Date.parse(generatedAt) - 7 * 86400000
			)
				throw new Error("runtime-live-timing-sample-timestamp-invalid");
			return finish - start;
		})
		.slice(value.warmup_count)
		.sort((a: number, b: number) => a - b);
	return {
		timing_p50_ms: durations[Math.ceil(durations.length * 0.5) - 1] ?? null,
		timing_p95_ms: durations[Math.ceil(durations.length * 0.95) - 1] ?? null,
		sample_count: durations.length,
		warmup_count: value.warmup_count,
	};
}

function loadEvidence(root: string): Evidence {
	const snapshot = readArtifact(root, SNAPSHOT);
	const generatedAt = validateHeader(snapshot);
	const path =
		snapshot.saved_result_path === undefined
			? SNAPSHOT
			: asString(snapshot.saved_result_path, "saved_result_path");
	const payload = path === SNAPSHOT ? snapshot : readArtifact(root, path);
	if (validateHeader(payload) !== generatedAt)
		throw new Error("runtime-live-result-timestamp-mismatch");
	const profile = payload.event_profile;
	if (
		!isObject(profile) ||
		profile.harness !== PROFILE.runtime ||
		typeof profile.version !== "string" ||
		!profile.version.trim()
	)
		throw new Error("runtime-live-event-profile-invalid");
	// parseEventStream validates the adapter version and accounting semantics.
	const eventProfile = profile as EventStreamProfile;
	if (
		!Array.isArray(payload.scenarios) ||
		payload.scenarios.length === 0 ||
		payload.scenarios.length > 64
	)
		throw new Error("runtime-live-scenarios-invalid");
	const scenarios = new Map<string, LiveScenario>();
	for (const entry of payload.scenarios) {
		if (!isObject(entry)) throw new Error("runtime-live-scenario-invalid");
		const id = asString(entry.id, "scenario.id");
		if (scenarios.has(id))
			throw new Error(`runtime-live-scenario-duplicate:${id}`);
		if (
			!Array.isArray(entry.events) ||
			entry.events.length === 0 ||
			entry.events.length > 4096
		)
			throw new Error(`runtime-live-events-required:${id}`);
		const lines = entry.events.map((event: unknown) => {
			if (!isObject(event) || Array.isArray(event))
				throw new Error(`runtime-live-event-invalid:${id}`);
			return JSON.stringify(event);
		});
		scenarios.set(id, {
			id,
			metrics: parseEventStream(lines, eventProfile),
			acceptance: entry.acceptance,
			timing: timingSamples(entry.timing_samples, generatedAt),
		});
	}
	return { path, generatedAt, scenarios };
}

function gitCommit(root: string): string {
	const result = boundedSpawn("git", ["rev-parse", "HEAD"], {
		cwd: root,
		timeoutMs: 15000,
	});
	return result.ok ? result.stdout.trim() : "unknown";
}

function emptyResult(
	root: string,
	scenario: Scenario,
	baselinePath: string,
	note: string,
): BenchmarkResult {
	return {
		schema_version: SCHEMA,
		run_id: `live-runtime-live-agent-${scenario.scenario_id}-${scenario.scenario_version}`,
		scenario_id: scenario.scenario_id,
		scenario_version: scenario.scenario_version,
		pack_id: scenario.pack_id,
		status: scenario.implementation_status === "planned" ? "skipped" : "failed",
		baseline_id: scenario.baseline_id,
		baseline_reference: relative(root, baselinePath).replaceAll("\\", "/"),
		threshold_reference: scenario.thresholds,
		pass: false,
		duration_ms: null,
		timing_p50_ms: null,
		timing_p95_ms: null,
		error_count: null,
		retry_count: null,
		context_tokens: null,
		prompt_tokens: null,
		output_tokens: null,
		context_bytes: null,
		output_bytes: null,
		tool_call_count: null,
		tool_success_rate: null,
		git_commit: gitCommit(root),
		notes: [note],
	};
}

export function collectThresholdNotes(
	thresholds: Record<string, number>,
	metrics: Record<string, number | null | undefined>,
): string[] {
	const notes: string[] = [];
	for (const [key, threshold] of Object.entries(thresholds)) {
		const metric =
			key === "max_p95_ms" || key === "min_p95_ms"
				? "timing_p95_ms"
				: key === "max_p50_ms" || key === "min_p50_ms"
					? "timing_p50_ms"
					: key.startsWith("max_") || key.startsWith("min_")
						? key.slice(4)
						: null;
		if (!metric || !Number.isFinite(threshold)) {
			notes.push(`unsupported-threshold:${key}`);
			continue;
		}
		const value = metrics[metric];
		if (typeof value !== "number" || !Number.isFinite(value)) {
			notes.push(`threshold-metric-missing:${key}`);
			continue;
		}
		if (key.startsWith("max_") && value > threshold)
			notes.push(`threshold-exceeded:${key}:${value}>${threshold}`);
		if (key.startsWith("min_") && value < threshold)
			notes.push(`threshold-below-min:${key}:${value}<${threshold}`);
	}
	return notes;
}

export function buildRuntimeLiveAgentResults(
	root: string,
	scenarios: Scenario[],
	baselinePath: string,
	allScenarios: Scenario[] = scenarios,
): { results: BenchmarkResult[]; notes: string[] } {
	let evidence: Evidence;
	try {
		evidence = loadEvidence(root);
	} catch (error) {
		const note = (error as Error).message;
		return {
			results: scenarios.map((scenario) =>
				emptyResult(root, scenario, baselinePath, note),
			),
			notes: [note],
		};
	}
	const mappingCounts = new Map<string, number>();
	for (const scenario of allScenarios) {
		if (
			scenario.implementation_status !== "planned" &&
			scenario.live_runner_scenario_id
		) {
			const id = scenario.live_runner_scenario_id;
			mappingCounts.set(id, (mappingCounts.get(id) ?? 0) + 1);
		}
	}
	const results = scenarios.map((scenario): BenchmarkResult => {
		const base = emptyResult(
			root,
			scenario,
			baselinePath,
			"planned-no-execution",
		);
		if (scenario.implementation_status === "planned") return base;
		const id = scenario.live_runner_scenario_id;
		const live = id ? evidence.scenarios.get(id) : undefined;
		if (!live || !id || mappingCounts.get(id) !== 1)
			return {
				...base,
				notes: ["runtime-live-direct-evidence-missing-or-reused"],
			};
		const raw = live.metrics;
		const measured = {
			duration_ms: raw.timing.wall_clock_ms,
			...live.timing,
			error_count: raw.tools.error_count,
			retry_count: raw.tools.retry_count,
			context_tokens: raw.tokens.input,
			prompt_tokens: null,
			output_tokens: raw.tokens.output,
			total_tokens: raw.tokens.total,
			context_bytes: null,
			output_bytes: null,
			tool_call_count: raw.tools.total_calls,
			tool_success_rate: raw.tools.success_rate,
		};
		const notes = [
			...raw.issues,
			...collectThresholdNotes(scenario.thresholds, measured),
		];
		if (
			raw.tokens.total === null ||
			raw.timing.wall_clock_ms === null ||
			raw.tools.success_rate === null
		)
			notes.push("runtime-live-observations-incomplete");
		// Never obtain commands from events or from the external receipt.
		const acceptance =
			notes.length === 0
				? evaluateBenchmarkAcceptance(
						root,
						scenario.acceptance,
						live.acceptance,
					)
				: {
						passed: false,
						notes: ["runtime-live-acceptance-not-run"],
						checks: [],
					};
		notes.push(...acceptance.notes);
		const passed = notes.length === 0 && acceptance.passed;
		return {
			...base,
			...measured,
			pass: passed,
			status: passed ? "passed" : "failed",
			observations: {
				schema_version: raw.schema_version,
				source: raw.source,
				tokens: raw.tokens,
				timing: raw.timing,
				issues: raw.issues,
			},
			acceptance_checks: acceptance.checks,
			notes: [
				...notes,
				`live-runner-artifact:${evidence.path}`,
				`live-runner-generated-at:${evidence.generatedAt}`,
			],
		};
	});
	return { results, notes: [`runtime-live-agent-artifact:${evidence.path}`] };
}
