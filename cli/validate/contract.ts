import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";

const REGISTRY_RELATIVE_PATH = ".agents/data/benchmarks/registry.json";
const SCENARIOS_RELATIVE_PATH = ".agents/data/benchmarks/scenarios";
const BASELINES_RELATIVE_PATH = ".agents/data/benchmarks/baselines";
const RESULTS_RELATIVE_PATH = ".agents/data/benchmarks/results";
const LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH =
	".agents/benchmarks/runtime-flow-live-agent-v4-latest.json";
const LIVE_BENCHMARK_EXPECTED_PACK_ID = "runtime-flow-live-agent-v4";
const LIVE_BENCHMARK_REFRESH_COMMAND =
	"python3 .agents/scripts/agents-benchmark.py run --save --model gpt-5.4-mini --reasoning-effort medium";

export const VALIDATION_SCHEMA_VERSION = "1.0.0";
export const BENCHMARK_RESULT_SCHEMA_VERSION = "1.0.0";

export const REQUIRED_PACKS = [
	"cli-kernel-local",
	"routing-accuracy",
	"mutation-safety",
	"update-safety",
	"workbench-parity",
	"mcp-parity",
	"runtime-live-agent",
	"token-economy",
] as const;

export type PackId = (typeof REQUIRED_PACKS)[number];

export type ValidationScope = "default" | "wb" | "tpl" | "update";

const OUTPUT_TAIL_LIMIT = 4000;

interface ValidationCommandSpec {
	command: string[];
}

const VALIDATION_COMMANDS_BY_PACK: Record<PackId, ValidationCommandSpec[]> = {
	"cli-kernel-local": [
		{ command: ["bun", "run", "typecheck"] },
		{
			command: [
				"bun",
				"test",
				"cli/tests/kernel.test.ts",
				"cli/tests/validate-command.test.ts",
			],
		},
	],
	"routing-accuracy": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/kernel.test.ts",
				"cli/tests/rule-command.test.ts",
				"cli/tests/skill-command.test.ts",
			],
		},
	],
	"mutation-safety": [
		{ command: ["bun", "test", "cli/tests/mutation-safety.test.ts"] },
	],
	"update-safety": [
		{ command: ["bun", "test", "cli/tests/update-command.test.ts"] },
	],
	"workbench-parity": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/workbench-lifecycle.test.ts",
				"cli/tests/workbench-verify.test.ts",
				"cli/tests/log-command.test.ts",
				"cli/tests/verify-command.test.ts",
			],
		},
	],
	"mcp-parity": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"mcp-parity",
				"--json",
			],
		},
	],
	"runtime-live-agent": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"runtime-live-agent",
				"--json",
			],
		},
	],
	"token-economy": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"token-economy",
				"--json",
			],
		},
	],
};

interface ValidationCommandResult {
	pack_id: PackId;
	command: string[];
	status: "passed" | "failed";
	exit_code: number | null;
	signal: string | null;
	duration_ms: number;
	stdout_tail: string;
	stderr_tail: string;
	reported_status?: string;
	reported_pass?: boolean;
}

export interface Scenario {
	schema_version: string;
	scenario_id: string;
	scenario_version: string;
	pack_id: PackId;
	command: string;
	result_schema: string;
	oracle: string;
	thresholds: Record<string, number>;
	baseline_id: string;
	deterministic_metrics: Record<string, number>;
	implementation_status?: "implemented" | "skipped";
	live_runner_scenario_id?: string;
}

interface Baseline {
	baseline_id: string;
	pack_id: PackId;
	schema_version: string;
	timing_p50_ms?: number;
	timing_p95_ms?: number;
}

interface PackMetadata {
	pack_id: PackId;
	min_scenarios: number;
	selector_tags: string[];
}

export interface RegistrySnapshot {
	schema_version: string;
	packs: PackMetadata[];
	scenariosByPack: Record<string, Scenario[]>;
	baselinesByPack: Record<string, Baseline>;
}

interface SelectorInput {
	scope: ValidationScope;
	changedPaths: string[];
}

interface SelectorOutput {
	selected_pack_ids: PackId[];
	reasons: string[];
}

interface BenchmarkResult {
	schema_version: string;
	run_id: string;
	scenario_id: string;
	scenario_version: string;
	pack_id: PackId;
	status: "passed" | "failed" | "skipped" | "baseline-missing";
	baseline_id: string;
	baseline_reference: string;
	threshold_reference: Record<string, number>;
	pass: boolean;
	duration_ms: number;
	timing_p50_ms: number;
	timing_p95_ms: number;
	error_count: number;
	retry_count: number;
	context_tokens: number;
	prompt_tokens: number;
	output_tokens: number;
	context_bytes: number;
	output_bytes: number;
	tool_call_count: number;
	tool_success_rate: number;
	git_commit: string;
	notes: string[];
}

interface LiveRunnerProfile {
	runtime: string;
	model: string;
	reasoning_effort: string;
}

interface LiveRunnerScenarioResult {
	id: string;
	pass: boolean;
	duration_ms: number;
	tool_call_count: number;
	tool_success_rate: number;
	error_count: number;
	retry_count: number;
	context_bytes: number;
	prompt_bytes: number;
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
}

interface LiveRunnerResultPayload {
	pack_id: string;
	generated_at: string;
	pass: boolean;
	duration_ms: number;
	tool_call_count: number;
	error_count: number;
	retry_count: number;
	context_bytes_total: number;
	prompt_bytes_total: number;
	benchmark_profile: LiveRunnerProfile;
	scenarios: LiveRunnerScenarioResult[];
}

interface RuntimeLiveEvidence {
	snapshotPathRelative: string;
	savedResultPathRelative: string;
	payloadSource: "result" | "snapshot";
	payload: LiveRunnerResultPayload;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, key: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Invalid or missing string field: ${key}`);
	}
	return value;
}

function asNumberRecord(value: unknown, key: string): Record<string, number> {
	if (!isObject(value)) {
		throw new Error(`Invalid or missing object field: ${key}`);
	}
	const result: Record<string, number> = {};
	for (const [entryKey, entryValue] of Object.entries(value)) {
		if (typeof entryValue !== "number" || Number.isNaN(entryValue)) {
			throw new Error(`Invalid numeric threshold field: ${key}.${entryKey}`);
		}
		result[entryKey] = entryValue;
	}
	return result;
}

function asOptionalNumber(value: unknown, key: string): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "number" || Number.isNaN(value)) {
		throw new Error(`Invalid numeric field: ${key}`);
	}
	return value;
}

function asOptionalObject(
	value: unknown,
	key: string,
): Record<string, unknown> | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!isObject(value)) {
		throw new Error(`Invalid object field: ${key}`);
	}
	return value;
}

function asBoolean(value: unknown, key: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`Invalid boolean field: ${key}`);
	}
	return value;
}

function asOptionalString(value: unknown, key: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Invalid optional string field: ${key}`);
	}
	return value;
}

function loadJsonObject(path: string): Record<string, unknown> {
	if (!existsSync(path)) {
		throw new Error(`Missing required file: ${path}`);
	}
	const parsed = JSON.parse(readFileSync(path, "utf8"));
	if (!isObject(parsed)) {
		throw new Error(`Invalid JSON object: ${path}`);
	}
	return parsed;
}

function parsePackId(value: unknown, key: string): PackId {
	const packId = asString(value, key);
	if (!REQUIRED_PACKS.includes(packId as PackId)) {
		throw new Error(`Unknown pack id in ${key}: ${packId}`);
	}
	return packId as PackId;
}

function parseScenario(
	data: Record<string, unknown>,
	sourcePath: string,
): Scenario {
	const scenario: Scenario = {
		schema_version: asString(
			data.schema_version,
			`${sourcePath}.schema_version`,
		),
		scenario_id: asString(data.scenario_id, `${sourcePath}.scenario_id`),
		scenario_version: asString(
			data.scenario_version,
			`${sourcePath}.scenario_version`,
		),
		pack_id: parsePackId(data.pack_id, `${sourcePath}.pack_id`),
		command: asString(data.command, `${sourcePath}.command`),
		result_schema: asString(data.result_schema, `${sourcePath}.result_schema`),
		oracle: asString(data.oracle, `${sourcePath}.oracle`),
		thresholds: asNumberRecord(data.thresholds, `${sourcePath}.thresholds`),
		baseline_id: asString(data.baseline_id, `${sourcePath}.baseline_id`),
		deterministic_metrics: asNumberRecord(
			data.deterministic_metrics,
			`${sourcePath}.deterministic_metrics`,
		),
	};
	if (typeof data.implementation_status === "string") {
		if (
			data.implementation_status === "implemented" ||
			data.implementation_status === "skipped"
		) {
			scenario.implementation_status = data.implementation_status;
		}
	}
	const liveRunnerScenarioId = asOptionalString(
		data.live_runner_scenario_id,
		`${sourcePath}.live_runner_scenario_id`,
	);
	if (liveRunnerScenarioId !== undefined) {
		scenario.live_runner_scenario_id = liveRunnerScenarioId;
	}
	return scenario;
}

function parseBaseline(
	data: Record<string, unknown>,
	sourcePath: string,
): Baseline {
	const baseline: Baseline = {
		baseline_id: asString(data.baseline_id, `${sourcePath}.baseline_id`),
		pack_id: parsePackId(data.pack_id, `${sourcePath}.pack_id`),
		schema_version: asString(
			data.schema_version,
			`${sourcePath}.schema_version`,
		),
	};
	const timingP50 = asOptionalNumber(
		data.timing_p50_ms,
		`${sourcePath}.timing_p50_ms`,
	);
	const timingP95 = asOptionalNumber(
		data.timing_p95_ms,
		`${sourcePath}.timing_p95_ms`,
	);
	if (timingP50 !== undefined) {
		baseline.timing_p50_ms = timingP50;
	}
	if (timingP95 !== undefined) {
		baseline.timing_p95_ms = timingP95;
	}
	return baseline;
}

function getGitCommit(projectRoot: string): string {
	const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
		cwd: projectRoot,
		encoding: "utf8",
	});
	if (result.status !== 0) {
		return "unknown";
	}
	return (result.stdout || "").trim() || "unknown";
}

function loadPackMetadata(registryPath: string): PackMetadata[] {
	const registry = loadJsonObject(registryPath);
	const schemaVersion = asString(
		registry.schema_version,
		"registry.schema_version",
	);
	if (schemaVersion !== VALIDATION_SCHEMA_VERSION) {
		throw new Error(
			`Unsupported registry schema_version: ${schemaVersion} (expected ${VALIDATION_SCHEMA_VERSION})`,
		);
	}
	const packsRaw = registry.packs;
	if (!Array.isArray(packsRaw)) {
		throw new Error("Invalid registry: packs must be an array");
	}
	return packsRaw.map((entry, index) => {
		if (!isObject(entry)) {
			throw new Error(`Invalid registry.packs[${index}]`);
		}
		const selectorTags = Array.isArray(entry.selector_tags)
			? entry.selector_tags.filter(
					(tag): tag is string => typeof tag === "string",
				)
			: [];
		return {
			pack_id: parsePackId(entry.pack_id, `registry.packs[${index}].pack_id`),
			min_scenarios: Number(entry.min_scenarios ?? 0),
			selector_tags: selectorTags,
		};
	});
}

export function loadRegistry(projectRoot: string): RegistrySnapshot {
	const registryPath = join(projectRoot, REGISTRY_RELATIVE_PATH);
	const packs = loadPackMetadata(registryPath);

	const scenariosByPack: Record<string, Scenario[]> = {};
	for (const pack of packs) {
		const packPath = join(projectRoot, SCENARIOS_RELATIVE_PATH, pack.pack_id);
		if (!existsSync(packPath)) {
			scenariosByPack[pack.pack_id] = [];
			continue;
		}
		const scenarios = readdirSync(packPath)
			.filter((entry) => entry.endsWith(".json"))
			.sort()
			.map((entry) => {
				const path = join(packPath, entry);
				return parseScenario(loadJsonObject(path), path);
			});
		scenariosByPack[pack.pack_id] = scenarios;
	}

	const baselinesByPack: Record<string, Baseline> = {};
	for (const pack of packs) {
		const baselinePath = join(
			projectRoot,
			BASELINES_RELATIVE_PATH,
			pack.pack_id,
			"baseline-v1.json",
		);
		if (!existsSync(baselinePath)) {
			continue;
		}
		baselinesByPack[pack.pack_id] = parseBaseline(
			loadJsonObject(baselinePath),
			baselinePath,
		);
	}

	return {
		schema_version: VALIDATION_SCHEMA_VERSION,
		packs,
		scenariosByPack,
		baselinesByPack,
	};
}

export function validateRegistryContract(snapshot: RegistrySnapshot): string[] {
	const issues: string[] = [];
	for (const packId of REQUIRED_PACKS) {
		const pack = snapshot.packs.find((entry) => entry.pack_id === packId);
		if (!pack) {
			issues.push(`missing-pack:${packId}`);
			continue;
		}
		const scenarios = snapshot.scenariosByPack[packId] ?? [];
		if (scenarios.length < pack.min_scenarios) {
			issues.push(
				`insufficient-scenarios:${packId}:${scenarios.length}<${pack.min_scenarios}`,
			);
		}
		for (const scenario of scenarios) {
			if (scenario.pack_id !== packId) {
				issues.push(`scenario-pack-mismatch:${packId}:${scenario.scenario_id}`);
			}
			if (scenario.schema_version !== VALIDATION_SCHEMA_VERSION) {
				issues.push(
					`scenario-schema-version-mismatch:${packId}:${scenario.scenario_id}:${scenario.schema_version}`,
				);
			}
			if (scenario.result_schema !== BENCHMARK_RESULT_SCHEMA_VERSION) {
				issues.push(
					`scenario-schema-mismatch:${packId}:${scenario.scenario_id}`,
				);
			}
			if (!scenario.oracle || Object.keys(scenario.thresholds).length === 0) {
				issues.push(
					`scenario-contract-missing:${packId}:${scenario.scenario_id}`,
				);
			}
		}
		const baseline = snapshot.baselinesByPack[packId];
		if (!baseline) {
			issues.push(`missing-baseline:${packId}`);
			continue;
		}
		if (baseline.schema_version !== VALIDATION_SCHEMA_VERSION) {
			issues.push(
				`baseline-schema-version-mismatch:${packId}:${baseline.schema_version}`,
			);
		}
	}
	return issues;
}

function defaultPackSelection(changedPaths: string[]): SelectorOutput {
	const normalizePath = (value: string): string =>
		value.replace(/\\/g, "/").replace(/^\.\//, "");
	const hasPrefix = (value: string, prefixes: readonly string[]): boolean =>
		prefixes.some((prefix) => value.startsWith(prefix));
	const isPromptContextDoc = (value: string): boolean => {
		if (!value.startsWith("docs/")) {
			return false;
		}
		const lower = value.toLowerCase();
		return lower.includes("prompt") || lower.includes("context");
	};

	if (changedPaths.length === 0) {
		return {
			selected_pack_ids: [
				"cli-kernel-local",
				"routing-accuracy",
				"mutation-safety",
				"update-safety",
				"workbench-parity",
				"mcp-parity",
				"runtime-live-agent",
				"token-economy",
			],
			reasons: ["default-no-paths"],
		};
	}
	const selected = new Set<PackId>();
	const reasons: string[] = [];
	for (const changedPath of changedPaths) {
		const normalizedPath = normalizePath(changedPath);
		if (hasPrefix(normalizedPath, [".agents/runtime/"])) {
			selected.add("mcp-parity");
			selected.add("runtime-live-agent");
			reasons.push(`runtime-change:${changedPath}`);
			continue;
		}
		if (hasPrefix(normalizedPath, ["cli/mcp/"])) {
			selected.add("mcp-parity");
			reasons.push(`mcp-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/rules/",
				"cli/skills/",
				"cli/services/catalog/",
				"cli/commands/catalog.ts",
			])
		) {
			selected.add("routing-accuracy");
			reasons.push(`routing-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/update/",
				"cli/services/update/",
				"cli/commands/update.ts",
			])
		) {
			selected.add("update-safety");
			reasons.push(`update-change:${changedPath}`);
			continue;
		}
		if (
			hasPrefix(normalizedPath, [
				"cli/files/",
				"cli/commands/file.ts",
				"cli/services/mutations/",
				"cli/services/project/root.ts",
				"cli/services/project/paths.ts",
			])
		) {
			selected.add("mutation-safety");
			reasons.push(`mutation-change:${changedPath}`);
			continue;
		}
		if (hasPrefix(normalizedPath, ["cli/"])) {
			selected.add("cli-kernel-local");
			reasons.push(`cli-change:${changedPath}`);
			continue;
		}
		if (hasPrefix(normalizedPath, [".afol/wb/", ".agents/wb/"])) {
			selected.add("workbench-parity");
			reasons.push(`workbench-change:${changedPath}`);
			continue;
		}
		if (isPromptContextDoc(normalizedPath)) {
			selected.add("token-economy");
			reasons.push(`prompt-context-doc-change:${changedPath}`);
		}
	}
	if (selected.size === 0) {
		selected.add("cli-kernel-local");
		reasons.push("fallback-default");
	}
	return {
		selected_pack_ids: [...selected].sort() as PackId[],
		reasons,
	};
}

export function selectPacks(input: SelectorInput): SelectorOutput {
	if (input.scope === "wb") {
		return {
			selected_pack_ids: ["workbench-parity"],
			reasons: ["scope-wb"],
		};
	}
	if (input.scope === "tpl") {
		return {
			selected_pack_ids: ["cli-kernel-local"],
			reasons: ["scope-tpl"],
		};
	}
	if (input.scope === "update") {
		return {
			selected_pack_ids: ["update-safety"],
			reasons: ["scope-update"],
		};
	}
	return defaultPackSelection(input.changedPaths);
}

function parseLiveRunnerProfile(
	data: unknown,
	sourcePath: string,
): LiveRunnerProfile {
	if (!isObject(data)) {
		throw new Error(`Invalid benchmark profile object: ${sourcePath}`);
	}
	return {
		runtime: asString(data.runtime, `${sourcePath}.runtime`),
		model: asString(data.model, `${sourcePath}.model`),
		reasoning_effort: asString(
			data.reasoning_effort,
			`${sourcePath}.reasoning_effort`,
		),
	};
}

function parseLiveRunnerScenarioResult(
	data: unknown,
	sourcePath: string,
): LiveRunnerScenarioResult {
	if (!isObject(data)) {
		throw new Error(`Invalid live scenario object: ${sourcePath}`);
	}
	const toolCallCount =
		asOptionalNumber(data.tool_call_count, `${sourcePath}.tool_call_count`) ??
		0;
	const errorCount =
		asOptionalNumber(data.error_count, `${sourcePath}.error_count`) ?? 0;
	const tokenUsage = asOptionalObject(
		data.token_usage,
		`${sourcePath}.token_usage`,
	);
	return {
		id: asString(data.id, `${sourcePath}.id`),
		pass: asBoolean(data.pass, `${sourcePath}.pass`),
		duration_ms:
			asOptionalNumber(data.duration_ms, `${sourcePath}.duration_ms`) ?? 0,
		tool_call_count: toolCallCount,
		tool_success_rate:
			asOptionalNumber(
				data.tool_success_rate,
				`${sourcePath}.tool_success_rate`,
			) ?? deriveToolSuccessRate(toolCallCount, errorCount),
		error_count: errorCount,
		retry_count:
			asOptionalNumber(data.retry_count, `${sourcePath}.retry_count`) ?? 0,
		context_bytes:
			asOptionalNumber(data.context_bytes, `${sourcePath}.context_bytes`) ?? 0,
		prompt_bytes:
			asOptionalNumber(data.prompt_bytes, `${sourcePath}.prompt_bytes`) ?? 0,
		input_tokens:
			asOptionalNumber(
				tokenUsage?.input_tokens,
				`${sourcePath}.token_usage.input_tokens`,
			) ?? 0,
		output_tokens:
			asOptionalNumber(
				tokenUsage?.output_tokens,
				`${sourcePath}.token_usage.output_tokens`,
			) ?? 0,
		total_tokens:
			asOptionalNumber(
				tokenUsage?.total_tokens,
				`${sourcePath}.token_usage.total_tokens`,
			) ?? 0,
	};
}

function deriveToolSuccessRate(
	toolCallCount: number,
	errorCount: number,
): number {
	if (toolCallCount <= 0) {
		return errorCount === 0 ? 1 : 0;
	}
	const successCount = Math.max(0, toolCallCount - errorCount);
	return Number((successCount / toolCallCount).toFixed(4));
}

function payloadMetricValue(
	data: Record<string, unknown>,
	summary: Record<string, unknown> | undefined,
	key: string,
): unknown {
	return data[key] ?? summary?.[key];
}

function parseLiveRunnerPayload(
	data: Record<string, unknown>,
	sourcePath: string,
): LiveRunnerResultPayload {
	const scenariosRaw = data.scenarios;
	if (!Array.isArray(scenariosRaw)) {
		throw new Error(
			`Invalid live runner scenarios array: ${sourcePath}.scenarios`,
		);
	}
	const scenarios = scenariosRaw.map((entry, index) =>
		parseLiveRunnerScenarioResult(entry, `${sourcePath}.scenarios[${index}]`),
	);
	if (scenarios.length === 0) {
		throw new Error(`Live runner artifact has no scenarios: ${sourcePath}`);
	}
	const summary = asOptionalObject(data.summary, `${sourcePath}.summary`);
	return {
		pack_id: asString(data.pack_id, `${sourcePath}.pack_id`),
		generated_at: asString(data.generated_at, `${sourcePath}.generated_at`),
		pass: asBoolean(
			payloadMetricValue(data, summary, "pass"),
			`${sourcePath}.pass`,
		),
		duration_ms:
			asOptionalNumber(
				payloadMetricValue(data, summary, "duration_ms"),
				`${sourcePath}.duration_ms`,
			) ?? 0,
		tool_call_count:
			asOptionalNumber(
				payloadMetricValue(data, summary, "tool_call_count"),
				`${sourcePath}.tool_call_count`,
			) ?? 0,
		error_count:
			asOptionalNumber(
				payloadMetricValue(data, summary, "error_count"),
				`${sourcePath}.error_count`,
			) ?? 0,
		retry_count:
			asOptionalNumber(
				payloadMetricValue(data, summary, "retry_count"),
				`${sourcePath}.retry_count`,
			) ?? 0,
		context_bytes_total:
			asOptionalNumber(
				payloadMetricValue(data, summary, "context_bytes_total"),
				`${sourcePath}.context_bytes_total`,
			) ?? 0,
		prompt_bytes_total:
			asOptionalNumber(
				payloadMetricValue(data, summary, "prompt_bytes_total"),
				`${sourcePath}.prompt_bytes_total`,
			) ?? 0,
		benchmark_profile: parseLiveRunnerProfile(
			data.benchmark_profile,
			`${sourcePath}.benchmark_profile`,
		),
		scenarios,
	};
}

function resolveRelativePath(projectRoot: string, targetPath: string): string {
	return relative(projectRoot, resolve(projectRoot, targetPath)).replaceAll(
		"\\",
		"/",
	);
}

function loadRuntimeLiveEvidence(projectRoot: string): RuntimeLiveEvidence {
	const snapshotPath = join(projectRoot, LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH);
	if (!existsSync(snapshotPath)) {
		throw new Error(
			`runtime-live-artifact-missing:${LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH};run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	const snapshot = loadJsonObject(snapshotPath);
	const snapshotPackId = asString(snapshot.pack_id, `${snapshotPath}.pack_id`);
	if (snapshotPackId !== LIVE_BENCHMARK_EXPECTED_PACK_ID) {
		throw new Error(
			`runtime-live-artifact-pack-mismatch:${snapshotPackId};expected:${LIVE_BENCHMARK_EXPECTED_PACK_ID};run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	const snapshotProfile = parseLiveRunnerProfile(
		snapshot.benchmark_profile,
		`${snapshotPath}.benchmark_profile`,
	);
	if (
		snapshotProfile.model !== "gpt-5.4-mini" ||
		snapshotProfile.reasoning_effort !== "medium"
	) {
		throw new Error(
			`runtime-live-profile-mismatch:model=${snapshotProfile.model},reasoning=${snapshotProfile.reasoning_effort};expected:gpt-5.4-mini/medium;run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	const savedResultPathRaw = asString(
		snapshot.saved_result_path,
		`${snapshotPath}.saved_result_path`,
	);
	const savedResultPath = resolve(projectRoot, savedResultPathRaw);
	const payloadSource = existsSync(savedResultPath) ? "result" : "snapshot";
	const payloadPath =
		payloadSource === "result" ? savedResultPath : snapshotPath;
	const payloadRaw =
		payloadSource === "result" ? loadJsonObject(savedResultPath) : snapshot;
	const payload = parseLiveRunnerPayload(payloadRaw, payloadPath);
	if (payload.pack_id !== LIVE_BENCHMARK_EXPECTED_PACK_ID) {
		throw new Error(
			`runtime-live-artifact-pack-mismatch:${payload.pack_id};expected:${LIVE_BENCHMARK_EXPECTED_PACK_ID};run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	if (
		payload.benchmark_profile.model !== "gpt-5.4-mini" ||
		payload.benchmark_profile.reasoning_effort !== "medium"
	) {
		throw new Error(
			`runtime-live-profile-mismatch:model=${payload.benchmark_profile.model},reasoning=${payload.benchmark_profile.reasoning_effort};expected:gpt-5.4-mini/medium;run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	return {
		snapshotPathRelative: resolveRelativePath(
			projectRoot,
			LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH,
		),
		savedResultPathRelative: resolveRelativePath(
			projectRoot,
			savedResultPathRaw,
		),
		payloadSource,
		payload,
	};
}

function failedRuntimeLiveResult(
	projectRoot: string,
	scenario: Scenario,
	baselinePath: string,
	note: string,
): BenchmarkResult {
	return {
		schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		run_id: `live-runtime-live-agent-${scenario.scenario_id}-${scenario.scenario_version}`,
		scenario_id: scenario.scenario_id,
		scenario_version: scenario.scenario_version,
		pack_id: scenario.pack_id,
		status: "failed",
		baseline_id: scenario.baseline_id,
		baseline_reference: relative(projectRoot, baselinePath).replaceAll(
			"\\",
			"/",
		),
		threshold_reference: scenario.thresholds,
		pass: false,
		duration_ms: 0,
		timing_p50_ms: 0,
		timing_p95_ms: 0,
		error_count: 1,
		retry_count: 0,
		context_tokens: 0,
		prompt_tokens: 0,
		output_tokens: 0,
		context_bytes: 0,
		output_bytes: 0,
		tool_call_count: 0,
		tool_success_rate: 0,
		git_commit: getGitCommit(projectRoot),
		notes: [note],
	};
}

function collectThresholdNotes(
	thresholds: Record<string, number>,
	metrics: Record<string, number | undefined>,
): string[] {
	const notes: string[] = [];
	for (const [thresholdKey, thresholdValue] of Object.entries(thresholds)) {
		const metricKey =
			thresholdKey === "max_p95_ms" || thresholdKey === "min_p95_ms"
				? "timing_p95_ms"
				: thresholdKey === "max_p50_ms" || thresholdKey === "min_p50_ms"
					? "timing_p50_ms"
					: thresholdKey.startsWith("max_") || thresholdKey.startsWith("min_")
						? thresholdKey.slice(4)
						: null;
		if (!metricKey) {
			notes.push(`unsupported-threshold:${thresholdKey}`);
			continue;
		}
		const metricValue = metrics[metricKey];
		if (typeof metricValue !== "number" || Number.isNaN(metricValue)) {
			notes.push(`threshold-metric-missing:${thresholdKey}`);
			continue;
		}
		if (thresholdKey.startsWith("max_") && metricValue > thresholdValue) {
			notes.push(
				`threshold-exceeded:${thresholdKey}:${metricValue}>${thresholdValue}`,
			);
		} else if (
			thresholdKey.startsWith("min_") &&
			metricValue < thresholdValue
		) {
			notes.push(
				`threshold-below-min:${thresholdKey}:${metricValue}<${thresholdValue}`,
			);
		}
	}
	return notes;
}

function runtimeLiveDirectEvidenceNote(
	evidence: RuntimeLiveEvidence,
	scenario: Scenario,
	reason:
		| "runtime-live-direct-evidence-missing"
		| "runtime-live-direct-evidence-reused",
): string {
	const mappedId = scenario.live_runner_scenario_id ?? "missing";
	return `${reason}:${scenario.scenario_id}:${mappedId};artifact:${evidence.savedResultPathRelative};run:${LIVE_BENCHMARK_REFRESH_COMMAND}`;
}

function buildRuntimeLiveAgentResults(
	projectRoot: string,
	scenarios: Scenario[],
	baselinePath: string,
): { results: BenchmarkResult[]; notes: string[] } {
	let evidence: RuntimeLiveEvidence;
	try {
		evidence = loadRuntimeLiveEvidence(projectRoot);
	} catch (error) {
		const note = (error as Error).message;
		return {
			results: scenarios.map((scenario) =>
				failedRuntimeLiveResult(projectRoot, scenario, baselinePath, note),
			),
			notes: [note],
		};
	}

	const liveById = new Map<string, LiveRunnerScenarioResult>();
	for (const liveScenario of evidence.payload.scenarios) {
		liveById.set(liveScenario.id, liveScenario);
	}
	const usedLiveScenarioIds = new Set<string>();
	let matchedDirectEvidenceCount = 0;
	let incompleteArtifact = false;

	const results = scenarios.map((scenario) => {
		const mappingId = scenario.live_runner_scenario_id;
		if (!mappingId) {
			incompleteArtifact = true;
			return failedRuntimeLiveResult(
				projectRoot,
				scenario,
				baselinePath,
				runtimeLiveDirectEvidenceNote(
					evidence,
					scenario,
					"runtime-live-direct-evidence-missing",
				),
			);
		}
		const mappedScenario = liveById.get(mappingId);
		if (!mappedScenario) {
			incompleteArtifact = true;
			return failedRuntimeLiveResult(
				projectRoot,
				scenario,
				baselinePath,
				runtimeLiveDirectEvidenceNote(
					evidence,
					scenario,
					"runtime-live-direct-evidence-missing",
				),
			);
		}
		if (usedLiveScenarioIds.has(mappedScenario.id)) {
			incompleteArtifact = true;
			return failedRuntimeLiveResult(
				projectRoot,
				scenario,
				baselinePath,
				runtimeLiveDirectEvidenceNote(
					evidence,
					scenario,
					"runtime-live-direct-evidence-reused",
				),
			);
		}
		usedLiveScenarioIds.add(mappedScenario.id);
		matchedDirectEvidenceCount += 1;
		const mappedId = mappedScenario.id;
		const metrics: Record<string, number> = {
			duration_ms: mappedScenario.duration_ms,
			timing_p50_ms: mappedScenario.duration_ms,
			timing_p95_ms: mappedScenario.duration_ms,
			error_count: mappedScenario.error_count,
			retry_count: mappedScenario.retry_count,
			context_tokens: mappedScenario.input_tokens,
			prompt_tokens: mappedScenario.input_tokens,
			output_tokens: mappedScenario.output_tokens,
			total_tokens: mappedScenario.total_tokens,
			context_bytes: mappedScenario.context_bytes,
			output_bytes: mappedScenario.prompt_bytes,
			tool_call_count: mappedScenario.tool_call_count,
			tool_success_rate: mappedScenario.tool_success_rate,
		};
		const thresholdNotes = collectThresholdNotes(scenario.thresholds, metrics);
		const status: BenchmarkResult["status"] =
			mappedScenario.pass && thresholdNotes.length === 0 ? "passed" : "failed";
		const notes = [
			`live-runner-artifact:${evidence.savedResultPathRelative}`,
			`live-runner-snapshot:${evidence.snapshotPathRelative}`,
			`live-runner-evidence-source:${evidence.payloadSource}`,
			`live-runner-scenario:${mappedId}`,
			`live-runner-generated-at:${evidence.payload.generated_at}`,
			`live-runner-profile:${evidence.payload.benchmark_profile.model}/${evidence.payload.benchmark_profile.reasoning_effort}`,
		];
		if (!mappedScenario.pass) {
			notes.push("live-runner-scenario-failed");
		}
		notes.push(...thresholdNotes);
		return {
			schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
			run_id: `live-runtime-live-agent-${scenario.scenario_id}-${scenario.scenario_version}`,
			scenario_id: scenario.scenario_id,
			scenario_version: scenario.scenario_version,
			pack_id: scenario.pack_id,
			status,
			baseline_id: scenario.baseline_id,
			baseline_reference: relative(projectRoot, baselinePath).replaceAll(
				"\\",
				"/",
			),
			threshold_reference: scenario.thresholds,
			pass: status === "passed",
			duration_ms: metrics.duration_ms ?? 0,
			timing_p50_ms: metrics.timing_p50_ms ?? 0,
			timing_p95_ms: metrics.timing_p95_ms ?? 0,
			error_count: metrics.error_count ?? 0,
			retry_count: metrics.retry_count ?? 0,
			context_tokens: metrics.context_tokens ?? 0,
			prompt_tokens: metrics.prompt_tokens ?? 0,
			output_tokens: metrics.output_tokens ?? 0,
			context_bytes: metrics.context_bytes ?? 0,
			output_bytes: metrics.output_bytes ?? 0,
			tool_call_count: metrics.tool_call_count ?? 0,
			tool_success_rate: metrics.tool_success_rate ?? 0,
			git_commit: getGitCommit(projectRoot),
			notes,
		};
	});

	if (matchedDirectEvidenceCount !== scenarios.length) {
		incompleteArtifact = true;
	}

	return {
		results,
		notes: [
			`runtime-live-agent-artifact:${evidence.savedResultPathRelative}`,
			`runtime-live-agent-evidence-source:${evidence.payloadSource}`,
			...(incompleteArtifact
				? [
						`runtime-live-artifact-incomplete:${evidence.savedResultPathRelative};matched-direct-evidence:${matchedDirectEvidenceCount}/${scenarios.length};run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
					]
				: []),
			`runtime-live-agent-refresh:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		],
	};
}

function buildResult(
	projectRoot: string,
	scenario: Scenario,
	baselinePath: string,
	baseline: Baseline | undefined,
): BenchmarkResult {
	const metrics = scenario.deterministic_metrics;
	const notes = collectThresholdNotes(scenario.thresholds, metrics);
	if (baseline) {
		if (
			typeof baseline.timing_p50_ms === "number" &&
			typeof metrics.timing_p50_ms === "number" &&
			metrics.timing_p50_ms > baseline.timing_p50_ms
		) {
			notes.push(
				`baseline-regression:timing_p50_ms:${metrics.timing_p50_ms}>${baseline.timing_p50_ms}`,
			);
		}
		if (
			typeof baseline.timing_p95_ms === "number" &&
			typeof metrics.timing_p95_ms === "number" &&
			metrics.timing_p95_ms > baseline.timing_p95_ms
		) {
			notes.push(
				`baseline-regression:timing_p95_ms:${metrics.timing_p95_ms}>${baseline.timing_p95_ms}`,
			);
		}
	}
	const status: BenchmarkResult["status"] =
		scenario.implementation_status === "skipped"
			? "skipped"
			: !baseline
				? "baseline-missing"
				: notes.length > 0
					? "failed"
					: "passed";
	return {
		schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		run_id: `det-${scenario.pack_id}-${scenario.scenario_id}-${scenario.scenario_version}`,
		scenario_id: scenario.scenario_id,
		scenario_version: scenario.scenario_version,
		pack_id: scenario.pack_id,
		status,
		baseline_id: scenario.baseline_id,
		baseline_reference: relative(projectRoot, baselinePath).replaceAll(
			"\\",
			"/",
		),
		threshold_reference: scenario.thresholds,
		pass: status === "passed",
		duration_ms: metrics.duration_ms ?? 0,
		timing_p50_ms: metrics.timing_p50_ms ?? metrics.duration_ms ?? 0,
		timing_p95_ms: metrics.timing_p95_ms ?? metrics.duration_ms ?? 0,
		error_count: metrics.error_count ?? 0,
		retry_count: metrics.retry_count ?? 0,
		context_tokens: metrics.context_tokens ?? 0,
		prompt_tokens: metrics.prompt_tokens ?? 0,
		output_tokens: metrics.output_tokens ?? 0,
		context_bytes: metrics.context_bytes ?? 0,
		output_bytes: metrics.output_bytes ?? 0,
		tool_call_count: metrics.tool_call_count ?? 1,
		tool_success_rate: metrics.tool_success_rate ?? 1,
		git_commit: getGitCommit(projectRoot),
		notes:
			status === "skipped"
				? ["not-implemented-live-runner"]
				: status === "baseline-missing"
					? ["baseline-missing"]
					: notes,
	};
}

function outputJson(payload: Record<string, unknown>): number {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
	return 0;
}

function outputJsonWithStatus(
	payload: Record<string, unknown>,
	status: number,
): number {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
	return status;
}

function outputTail(value: string): string {
	if (value.length <= OUTPUT_TAIL_LIMIT) {
		return value;
	}
	return value.slice(value.length - OUTPUT_TAIL_LIMIT);
}

function registrySummary(
	snapshot: RegistrySnapshot,
): Array<Record<string, unknown>> {
	return snapshot.packs.map((entry) => ({
		pack_id: entry.pack_id,
		min_scenarios: entry.min_scenarios,
		scenario_count: (snapshot.scenariosByPack[entry.pack_id] ?? []).length,
		baseline_present: Boolean(snapshot.baselinesByPack[entry.pack_id]),
	}));
}

function runPackCommand(
	projectRoot: string,
	packId: PackId,
	spec: ValidationCommandSpec,
): ValidationCommandResult {
	const startedAt = performance.now();
	const [command, ...args] = spec.command;
	if (!command) {
		throw new Error(`Empty validation command for pack: ${packId}`);
	}
	const result = spawnSync(command, args, {
		cwd: projectRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const durationMs = Math.round(performance.now() - startedAt);
	const exitCode = result.status;
	let reportedStatus: string | undefined;
	let reportedPass: boolean | undefined;
	try {
		const payload = JSON.parse(result.stdout ?? "") as Record<string, unknown>;
		if (typeof payload.status === "string") {
			reportedStatus = payload.status;
		}
		if (typeof payload.pass === "boolean") {
			reportedPass = payload.pass;
		}
	} catch {
		// Non-JSON command output is valid for package scripts and tests.
	}
	const reportedFailure = reportedPass === false || reportedStatus === "failed";
	const passed =
		exitCode === 0 && !result.signal && !result.error && !reportedFailure;
	const commandResult: ValidationCommandResult = {
		pack_id: packId,
		command: spec.command,
		status: passed ? "passed" : "failed",
		exit_code: exitCode,
		signal: result.signal,
		duration_ms: durationMs,
		stdout_tail: outputTail(result.stdout ?? ""),
		stderr_tail: outputTail(
			result.error ? result.error.message : (result.stderr ?? ""),
		),
	};
	if (reportedStatus !== undefined) {
		commandResult.reported_status = reportedStatus;
	}
	if (reportedPass !== undefined) {
		commandResult.reported_pass = reportedPass;
	}
	return commandResult;
}

function timestampSlug(now: Date = new Date()): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	return (
		[
			String(now.getUTCFullYear()),
			pad(now.getUTCMonth() + 1),
			pad(now.getUTCDate()),
		].join("") +
		"_" +
		[
			pad(now.getUTCHours()),
			pad(now.getUTCMinutes()),
			pad(now.getUTCSeconds()),
		].join("")
	);
}

function stableResultFileName(selectedPacks: PackId[]): string {
	const packPart =
		selectedPacks.length === 1
			? selectedPacks[0]
			: selectedPacks.length > 1
				? `${selectedPacks[0]}-multi`
				: "benchmark";
	return `${timestampSlug()}_${packPart}.json`;
}

function resolveOutputPath(projectRoot: string, outputPath: string): string {
	return isAbsolute(outputPath) ? outputPath : resolve(projectRoot, outputPath);
}

function saveBenchmarkPayload(
	projectRoot: string,
	payload: Record<string, unknown>,
	selectedPacks: PackId[],
	outputPathArg?: string,
): string {
	const defaultPath = join(
		projectRoot,
		RESULTS_RELATIVE_PATH,
		stableResultFileName(selectedPacks),
	);
	const outputPath = outputPathArg
		? resolveOutputPath(projectRoot, outputPathArg)
		: defaultPath;
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return relative(projectRoot, outputPath).replaceAll("\\", "/");
}

function parseArgs(args: string[]): {
	mode: "run" | "select" | "bench";
	scope: ValidationScope;
	changedPaths: string[];
	explicitPacks: PackId[];
	save: boolean;
	outputPath?: string;
} {
	let mode: "run" | "select" | "bench" = "run";
	let scope: ValidationScope = "default";
	const changedPaths: string[] = [];
	const explicitPacks: PackId[] = [];
	let save = false;
	let outputPath: string | undefined;

	let index = 0;
	const modeArg = args[index];
	if (modeArg === "bench" || modeArg === "select" || modeArg === "run") {
		mode = modeArg;
		index += 1;
	}
	if (mode !== "bench") {
		const scopeArg = args[index];
		if (scopeArg === "wb" || scopeArg === "tpl" || scopeArg === "update") {
			scope = scopeArg;
			index += 1;
		}
	}

	while (index < args.length) {
		const token = args[index];
		const nextArg = args[index + 1];
		if (token === "--changed-path" && nextArg) {
			changedPaths.push(nextArg);
			index += 2;
			continue;
		}
		if (token === "--pack" && nextArg) {
			const pack = nextArg;
			if (!REQUIRED_PACKS.includes(pack as PackId)) {
				throw new Error(`Unknown --pack value: ${pack}`);
			}
			explicitPacks.push(pack as PackId);
			index += 2;
			continue;
		}
		if (token === "--json") {
			index += 1;
			continue;
		}
		if (token === "--save") {
			save = true;
			index += 1;
			continue;
		}
		if (token === "--output") {
			const value = args[index + 1];
			if (!value) {
				throw new Error("Missing value for --output");
			}
			outputPath = value;
			index += 2;
			continue;
		}
		throw new Error(`Unknown validation argument: ${token}`);
	}

	const parsed = {
		mode,
		scope,
		changedPaths,
		explicitPacks,
		save,
	};
	return outputPath === undefined ? parsed : { ...parsed, outputPath };
}

function handleSelect(
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
): number {
	const selection = selectPacks({ scope, changedPaths });
	return outputJson({
		schema_version: VALIDATION_SCHEMA_VERSION,
		command_family: "validation",
		mode: "select",
		scope,
		selected_pack_ids: selection.selected_pack_ids,
		reasons: selection.reasons,
		registry: registrySummary(snapshot),
		contract_issues: validateRegistryContract(snapshot),
	});
}

function handleRun(
	projectRoot: string,
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
	explicitPacks: PackId[],
): number {
	const selection = selectPacks({ scope, changedPaths });
	const selectedPacks =
		explicitPacks.length > 0 ? explicitPacks : selection.selected_pack_ids;
	const commandResults: ValidationCommandResult[] = [];
	for (const packId of selectedPacks) {
		for (const spec of VALIDATION_COMMANDS_BY_PACK[packId] ?? []) {
			commandResults.push(runPackCommand(projectRoot, packId, spec));
		}
	}
	const passed = commandResults.filter(
		(entry) => entry.status === "passed",
	).length;
	const failed = commandResults.filter(
		(entry) => entry.status === "failed",
	).length;
	const contractIssues = validateRegistryContract(snapshot);
	const pass = failed === 0 && contractIssues.length === 0;
	return outputJsonWithStatus(
		{
			schema_version: VALIDATION_SCHEMA_VERSION,
			command_family: "validation",
			mode: "run",
			scope,
			status: pass ? "passed" : "failed",
			pass,
			selected_pack_ids: selectedPacks,
			selection_reasons: selection.reasons,
			summary: {
				total: commandResults.length,
				passed,
				failed,
			},
			command_results: commandResults,
			registry: registrySummary(snapshot),
			contract_issues: contractIssues,
		},
		pass ? 0 : 2,
	);
}

function handleBenchmark(
	projectRoot: string,
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
	explicitPacks: PackId[],
	persist: boolean,
	outputPath?: string,
): number {
	const selection = selectPacks({ scope, changedPaths });
	const selectedPacks =
		explicitPacks.length > 0 ? explicitPacks : selection.selected_pack_ids;
	const results: BenchmarkResult[] = [];
	const benchmarkNotes: string[] = [];
	for (const packId of selectedPacks) {
		const scenarios = snapshot.scenariosByPack[packId] ?? [];
		const baselinePath = join(
			projectRoot,
			BASELINES_RELATIVE_PATH,
			packId,
			"baseline-v1.json",
		);
		const baseline = snapshot.baselinesByPack[packId];
		if (packId === "runtime-live-agent") {
			const live = buildRuntimeLiveAgentResults(
				projectRoot,
				scenarios,
				baselinePath,
			);
			results.push(...live.results);
			benchmarkNotes.push(...live.notes);
			continue;
		}
		for (const scenario of scenarios) {
			results.push(buildResult(projectRoot, scenario, baselinePath, baseline));
		}
	}
	const passed = results.filter((entry) => entry.status === "passed").length;
	const failed = results.filter((entry) => entry.status === "failed").length;
	const skipped = results.filter((entry) => entry.status === "skipped").length;
	const baselineMissing = results.filter(
		(entry) => entry.status === "baseline-missing",
	).length;
	const contractIssues = validateRegistryContract(snapshot);
	const pass =
		failed === 0 &&
		baselineMissing === 0 &&
		skipped === 0 &&
		contractIssues.length === 0;
	const allSkipped =
		results.length > 0 &&
		skipped === results.length &&
		failed === 0 &&
		baselineMissing === 0 &&
		contractIssues.length === 0;
	const status: "passed" | "failed" | "skipped" = pass
		? "passed"
		: allSkipped
			? "skipped"
			: "failed";
	const notes = allSkipped
		? ["all-scenarios-skipped:not-implemented-live-runner", ...benchmarkNotes]
		: benchmarkNotes;
	const payload: Record<string, unknown> = {
		schema_version: VALIDATION_SCHEMA_VERSION,
		command_family: "validation",
		mode: "benchmark",
		benchmark_result_schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		status,
		pass,
		selected_pack_ids: selectedPacks,
		selection_reasons: selection.reasons,
		result_count: results.length,
		notes,
		summary: {
			total: results.length,
			passed,
			failed,
			skipped,
			baseline_missing: baselineMissing,
		},
		results,
		contract_issues: contractIssues,
	};
	if (persist || outputPath) {
		const savedResultPath = saveBenchmarkPayload(
			projectRoot,
			payload,
			selectedPacks,
			outputPath,
		);
		payload.saved_result_path = savedResultPath;
		payload.saved_result_file = basename(savedResultPath);
	}
	return outputJsonWithStatus(payload, pass ? 0 : 2);
}

export function runValidationCommand(
	projectRoot: string,
	args: string[],
): number {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs(args);
	} catch (error) {
		console.error((error as Error).message);
		return 2;
	}

	let snapshot: RegistrySnapshot;
	try {
		snapshot = loadRegistry(projectRoot);
	} catch (error) {
		console.error((error as Error).message);
		return 2;
	}

	if (parsed.mode === "bench") {
		return handleBenchmark(
			projectRoot,
			snapshot,
			parsed.scope,
			parsed.changedPaths,
			parsed.explicitPacks,
			parsed.save,
			parsed.outputPath,
		);
	}
	if (parsed.mode === "select") {
		return handleSelect(snapshot, parsed.scope, parsed.changedPaths);
	}
	return handleRun(
		projectRoot,
		snapshot,
		parsed.scope,
		parsed.changedPaths,
		parsed.explicitPacks,
	);
}
