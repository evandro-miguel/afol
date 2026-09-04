import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { boundedSpawn } from "../core/subprocess";
import { BUILTIN_ASSET_FILES } from "../generated/builtin-assets";
import { kernelRegistry } from "../registry";
import {
	asNumberRecord,
	asOptionalNumber,
	asOptionalObject,
	asOptionalString,
	asString,
	isObject,
	loadJsonObject,
} from "./shared";
import {
	type Baseline,
	BENCHMARK_RESULT_SCHEMA_VERSION,
	type BenchmarkScenarioSource,
	type HotPathDerivedPath,
	type HotPathScenarioConfig,
	type HotPathScenarioMode,
	type HotPathScenarioOperation,
	type PackId,
	type PackMetadata,
	REQUIRED_PACKS,
	type RegistrySnapshot,
	type Scenario,
	type ScenarioBaseline,
	type ScenarioCoverage,
	type ScenarioMeasurement,
	type ToolCoverageExemption,
	type ToolCoveragePolicy,
	type ToolSubcommandCoverageExemption,
	VALIDATION_SCHEMA_VERSION,
} from "./types";

const REGISTRY_RELATIVE_PATH = ".afol/data/benchmarks/catalog/registry.json";
const SCENARIOS_RELATIVE_PATH = ".afol/data/benchmarks/catalog/scenarios";
const BASELINES_RELATIVE_PATH = ".afol/data/benchmarks/catalog/baselines";
const ROADMAP_RELATIVE_PATHS = [
	".afol/adm/roadmap/GENERAL-ROADMAP.md",
	".afol/adm/roadmap.md",
] as const;
const SPECS_RELATIVE_PATH = ".afol/adm/specs";
const IMPLEMENTATION_STATUSES = ["implemented", "planned", "skipped"] as const;
type ImplementationStatus = (typeof IMPLEMENTATION_STATUSES)[number];
const ROADMAP_STATUSES = [
	"active",
	"final",
	"planned",
	"planned follow-on",
	"release",
] as const;
const SPEC_STATUSES = [
	"active",
	"approved",
	"deprecated",
	"draft",
	"final",
	"planned",
	"release",
	"review",
	"superseded",
] as const;
const GIT_PROVENANCE_TIMEOUT_MS = 5_000;

export function baselineFilename(packId: PackId): string {
	return packId === "evolution-core" ? "baseline-v2.json" : "baseline-v1.json";
}

function parsePackId(value: unknown, key: string): PackId {
	const packId = asString(value, key);
	if (!REQUIRED_PACKS.includes(packId as PackId)) {
		throw new Error(`Unknown pack id in ${key}: ${packId}`);
	}
	return packId as PackId;
}

function asStringArray(value: unknown, key: string): string[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`Invalid or missing string array field: ${key}`);
	}
	return value.map((entry, index) => asString(entry, `${key}[${index}]`));
}

function asOptionalStringArray(
	value: unknown,
	key: string,
): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	return asStringArray(value, key);
}

function parseScenarioCoverage(
	value: unknown,
	sourcePath: string,
): ScenarioCoverage | undefined {
	const coverageRaw = asOptionalObject(value, `${sourcePath}.coverage`);
	if (coverageRaw === undefined) {
		return undefined;
	}
	const coverage: ScenarioCoverage = {};
	const commands = asOptionalStringArray(
		coverageRaw.commands,
		`${sourcePath}.coverage.commands`,
	);
	if (commands !== undefined) {
		coverage.commands = commands;
	}
	const subcommands = asOptionalStringArray(
		coverageRaw.subcommands,
		`${sourcePath}.coverage.subcommands`,
	);
	if (subcommands !== undefined) {
		coverage.subcommands = subcommands;
	}
	const journeys = asOptionalStringArray(
		coverageRaw.journeys,
		`${sourcePath}.coverage.journeys`,
	);
	if (journeys !== undefined) {
		coverage.journeys = journeys;
	}
	const features = asOptionalStringArray(
		coverageRaw.features,
		`${sourcePath}.coverage.features`,
	);
	if (features !== undefined) {
		coverage.features = features;
	}
	const specs = asOptionalStringArray(
		coverageRaw.specs,
		`${sourcePath}.coverage.specs`,
	);
	if (specs !== undefined) {
		coverage.specs = specs;
	}
	if (
		coverage.commands === undefined &&
		coverage.subcommands === undefined &&
		coverage.journeys === undefined &&
		coverage.features === undefined &&
		coverage.specs === undefined
	) {
		throw new Error(`Invalid empty coverage field: ${sourcePath}.coverage`);
	}
	return coverage;
}

function parseHotPathScenario(
	data: Record<string, unknown>,
	sourcePath: string,
): HotPathScenarioConfig | undefined {
	if (data.runner === undefined && data.hot_path === undefined) {
		return undefined;
	}
	if (data.runner !== "hot-path") {
		throw new Error(`Invalid hot-path runner: ${sourcePath}.runner`);
	}
	const raw = asOptionalObject(data.hot_path, `${sourcePath}.hot_path`);
	if (raw === undefined) {
		throw new Error(`Missing hot-path config: ${sourcePath}.hot_path`);
	}
	const operation = asString(raw.operation, `${sourcePath}.hot_path.operation`);
	const operations = ["status", "start", "done", "close"] as const;
	if (!operations.includes(operation as HotPathScenarioOperation)) {
		throw new Error(
			`Invalid hot-path operation: ${sourcePath}.hot_path.operation`,
		);
	}
	const mode = asString(raw.mode, `${sourcePath}.hot_path.mode`);
	const modes = ["default", "explicit-derived"] as const;
	if (!modes.includes(mode as HotPathScenarioMode)) {
		throw new Error(`Invalid hot-path mode: ${sourcePath}.hot_path.mode`);
	}
	const derivedPath = asOptionalString(
		raw.derived_path,
		`${sourcePath}.hot_path.derived_path`,
	);
	const recoveryCommand = asOptionalString(
		raw.recovery_command,
		`${sourcePath}.hot_path.recovery_command`,
	);
	const derivedPaths = ["health", "catchup", "rebuild"] as const;
	if (
		derivedPath !== undefined &&
		!derivedPaths.includes(derivedPath as HotPathDerivedPath)
	) {
		throw new Error(
			`Invalid hot-path derived path: ${sourcePath}.hot_path.derived_path`,
		);
	}
	if (mode === "explicit-derived" && derivedPath === undefined) {
		throw new Error(
			`Explicit hot-path scenarios require derived_path: ${sourcePath}.hot_path.derived_path`,
		);
	}
	if (mode === "default" && derivedPath !== undefined) {
		throw new Error(
			`Default hot-path scenarios cannot declare derived_path: ${sourcePath}.hot_path.derived_path`,
		);
	}
	if (mode === "default" && recoveryCommand !== undefined) {
		throw new Error(
			`Default hot-path scenarios cannot declare recovery_command: ${sourcePath}.hot_path.recovery_command`,
		);
	}
	if (
		mode === "explicit-derived" &&
		operation !== "status" &&
		recoveryCommand !== "afol local-state rebuild --json"
	) {
		throw new Error(
			`Lifecycle explicit-derived scenarios require afol local-state rebuild --json: ${sourcePath}.hot_path.recovery_command`,
		);
	}
	return {
		operation: operation as HotPathScenarioOperation,
		mode: mode as HotPathScenarioMode,
		...(derivedPath ? { derived_path: derivedPath as HotPathDerivedPath } : {}),
		...(recoveryCommand ? { recovery_command: recoveryCommand } : {}),
	};
}

function parseScenario(
	data: Record<string, unknown>,
	sourcePath: string,
	executionSource: BenchmarkScenarioSource,
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
		execution_source: executionSource,
	};
	const hotPath = parseHotPathScenario(data, sourcePath);
	if (hotPath !== undefined) {
		scenario.runner = "hot-path";
		scenario.hot_path = hotPath;
	}
	const coverage = parseScenarioCoverage(data.coverage, sourcePath);
	if (coverage !== undefined) {
		scenario.coverage = coverage;
	}
	if (typeof data.sandbox === "boolean") {
		scenario.sandbox = data.sandbox;
	} else if (data.sandbox !== undefined) {
		throw new Error(`Invalid boolean field: ${sourcePath}.sandbox`);
	}
	if (typeof data.compiled_binary === "boolean") {
		scenario.compiled_binary = data.compiled_binary;
	} else if (data.compiled_binary !== undefined) {
		throw new Error(`Invalid boolean field: ${sourcePath}.compiled_binary`);
	}
	if (data.setup !== undefined) {
		if (!Array.isArray(data.setup)) {
			throw new Error(`Invalid setup commands field: ${sourcePath}.setup`);
		}
		scenario.setup = data.setup.map((entry, index) => {
			if (!Array.isArray(entry) || entry.length === 0) {
				throw new Error(`Invalid setup command: ${sourcePath}.setup[${index}]`);
			}
			return entry.map((value, argIndex) => {
				if (typeof value !== "string" || value.trim() === "") {
					throw new Error(
						`Invalid setup argument: ${sourcePath}.setup[${index}][${argIndex}]`,
					);
				}
				return value;
			});
		});
	}
	const expectedExit = asOptionalNumber(
		data.expected_exit,
		`${sourcePath}.expected_exit`,
	);
	if (expectedExit !== undefined) {
		scenario.expected_exit = expectedExit;
	}
	if (
		typeof data.implementation_status !== "string" ||
		!IMPLEMENTATION_STATUSES.includes(
			data.implementation_status as ImplementationStatus,
		)
	) {
		throw new Error(
			`Invalid or missing implementation_status field: ${sourcePath}.implementation_status`,
		);
	}
	scenario.implementation_status =
		data.implementation_status as ImplementationStatus;
	const liveRunnerScenarioId = asOptionalString(
		data.live_runner_scenario_id,
		`${sourcePath}.live_runner_scenario_id`,
	);
	if (liveRunnerScenarioId !== undefined) {
		scenario.live_runner_scenario_id = liveRunnerScenarioId;
	}
	const measurementRaw = asOptionalObject(
		data.measurement,
		`${sourcePath}.measurement`,
	);
	if (measurementRaw !== undefined) {
		const measurement: ScenarioMeasurement = {};
		const status = asOptionalString(
			measurementRaw.status,
			`${sourcePath}.measurement.status`,
		);
		const source = asOptionalString(
			measurementRaw.source,
			`${sourcePath}.measurement.source`,
		);
		const sampleCount = asOptionalNumber(
			measurementRaw.sample_count,
			`${sourcePath}.measurement.sample_count`,
		);
		const warmupCount = asOptionalNumber(
			measurementRaw.warmup_count,
			`${sourcePath}.measurement.warmup_count`,
		);
		const gitCommit = asOptionalString(
			measurementRaw.git_commit,
			`${sourcePath}.measurement.git_commit`,
		);
		const sourceRepository = asOptionalString(
			measurementRaw.source_repository,
			`${sourcePath}.measurement.source_repository`,
		);
		const timestamp = asOptionalString(
			measurementRaw.timestamp,
			`${sourcePath}.measurement.timestamp`,
		);
		if (status !== undefined) measurement.status = status;
		if (source !== undefined) measurement.source = source;
		if (sampleCount !== undefined) measurement.sample_count = sampleCount;
		if (warmupCount !== undefined) measurement.warmup_count = warmupCount;
		if (gitCommit !== undefined) measurement.git_commit = gitCommit;
		if (sourceRepository !== undefined) {
			measurement.source_repository = sourceRepository;
		}
		if (timestamp !== undefined) measurement.timestamp = timestamp;
		scenario.measurement = measurement;
	}
	return scenario;
}

function asRequiredFiniteNumber(value: unknown, key: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`Invalid or missing finite numeric field: ${key}`);
	}
	return value;
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
	const calibrationStatus = asOptionalString(
		data.calibration_status,
		`${sourcePath}.calibration_status`,
	);
	if (
		calibrationStatus !== undefined &&
		calibrationStatus !== "observed" &&
		calibrationStatus !== "pending"
	) {
		throw new Error(
			`Invalid calibration status: ${sourcePath}.calibration_status`,
		);
	}
	const calibrationReason = asOptionalString(
		data.calibration_reason,
		`${sourcePath}.calibration_reason`,
	);
	if (calibrationStatus !== undefined) {
		baseline.calibration_status = calibrationStatus;
	}
	if (calibrationReason !== undefined) {
		baseline.calibration_reason = calibrationReason;
	}
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
	const sampleCount = asOptionalNumber(
		data.sample_count,
		`${sourcePath}.sample_count`,
	);
	const warmupCount = asOptionalNumber(
		data.warmup_count,
		`${sourcePath}.warmup_count`,
	);
	const gitCommit = asOptionalString(
		data.git_commit,
		`${sourcePath}.git_commit`,
	);
	const sourceRepository = asOptionalString(
		data.source_repository,
		`${sourcePath}.source_repository`,
	);
	const timestamp = asOptionalString(data.timestamp, `${sourcePath}.timestamp`);
	const provenance = asOptionalString(
		data.provenance,
		`${sourcePath}.provenance`,
	);
	if (sampleCount !== undefined) baseline.sample_count = sampleCount;
	if (warmupCount !== undefined) baseline.warmup_count = warmupCount;
	if (gitCommit !== undefined) baseline.git_commit = gitCommit;
	if (sourceRepository !== undefined) {
		baseline.source_repository = sourceRepository;
	}
	if (timestamp !== undefined) baseline.timestamp = timestamp;
	if (provenance !== undefined) baseline.provenance = provenance;
	for (const field of [
		"host_profile_id",
		"os",
		"arch",
		"cpu_class",
		"bun_version",
		"runtime_version",
		"artifact_sha256",
	] as const) {
		const value = asOptionalString(data[field], `${sourcePath}.${field}`);
		if (value !== undefined) baseline[field] = value;
	}
	const executionMode = asOptionalString(
		data.execution_mode,
		`${sourcePath}.execution_mode`,
	);
	if (
		executionMode !== undefined &&
		executionMode !== "source" &&
		executionMode !== "compiled-release"
	) {
		throw new Error(`Invalid execution mode: ${sourcePath}.execution_mode`);
	}
	if (executionMode !== undefined) baseline.execution_mode = executionMode;
	const artifactMode = asOptionalString(
		data.artifact_mode,
		`${sourcePath}.artifact_mode`,
	);
	if (
		artifactMode !== undefined &&
		artifactMode !== "source" &&
		artifactMode !== "bun-compile"
	) {
		throw new Error(`Invalid artifact mode: ${sourcePath}.artifact_mode`);
	}
	if (artifactMode !== undefined) baseline.artifact_mode = artifactMode;
	if (data.scenarios !== undefined) {
		if (!isObject(data.scenarios)) {
			throw new Error(`Invalid scenario baseline map: ${sourcePath}.scenarios`);
		}
		const scenarios: Record<string, ScenarioBaseline> = {};
		for (const [scenarioId, value] of Object.entries(data.scenarios)) {
			if (!isObject(value)) {
				throw new Error(
					`Invalid scenario baseline: ${sourcePath}.scenarios.${scenarioId}`,
				);
			}
			scenarios[scenarioId] = {
				scenario_id: asString(
					value.scenario_id,
					`${sourcePath}.scenarios.${scenarioId}.scenario_id`,
				),
				scenario_version: asString(
					value.scenario_version,
					`${sourcePath}.scenarios.${scenarioId}.scenario_version`,
				),
				timing_p50_ms: asRequiredFiniteNumber(
					value.timing_p50_ms,
					`${sourcePath}.scenarios.${scenarioId}.timing_p50_ms`,
				),
				timing_p95_ms: asRequiredFiniteNumber(
					value.timing_p95_ms,
					`${sourcePath}.scenarios.${scenarioId}.timing_p95_ms`,
				),
				sample_count: asRequiredFiniteNumber(
					value.sample_count,
					`${sourcePath}.scenarios.${scenarioId}.sample_count`,
				),
				warmup_count: asRequiredFiniteNumber(
					value.warmup_count,
					`${sourcePath}.scenarios.${scenarioId}.warmup_count`,
				),
			};
		}
		baseline.scenarios = scenarios;
	}
	return baseline;
}

function parseToolCoverageExemption(
	value: unknown,
	key: string,
): ToolCoverageExemption {
	if (!isObject(value)) {
		throw new Error(`Invalid registry coverage exemption: ${key}`);
	}
	return {
		command: asString(value.command, `${key}.command`),
		reason: asString(value.reason, `${key}.reason`),
	};
}

function parseToolSubcommandCoverageExemption(
	value: unknown,
	key: string,
): ToolSubcommandCoverageExemption {
	if (!isObject(value)) {
		throw new Error(`Invalid registry subcommand coverage exemption: ${key}`);
	}
	return {
		subcommand: asString(value.subcommand, `${key}.subcommand`),
		reason: asString(value.reason, `${key}.reason`),
	};
}

function parseToolCoveragePolicy(
	registry: Record<string, unknown>,
): ToolCoveragePolicy | undefined {
	const coverageRaw = asOptionalObject(registry.coverage, "registry.coverage");
	if (coverageRaw === undefined) {
		return undefined;
	}
	const exemptionsRaw = coverageRaw.exemptions;
	if (!Array.isArray(exemptionsRaw)) {
		throw new Error("Invalid registry.coverage.exemptions");
	}
	const policy: ToolCoveragePolicy = {
		schema_version: asString(
			coverageRaw.schema_version,
			"registry.coverage.schema_version",
		),
		exemptions: exemptionsRaw.map((entry, index) =>
			parseToolCoverageExemption(
				entry,
				`registry.coverage.exemptions[${index}]`,
			),
		),
	};
	const subcommandExemptionsRaw = coverageRaw.subcommand_exemptions;
	if (subcommandExemptionsRaw !== undefined) {
		if (!Array.isArray(subcommandExemptionsRaw)) {
			throw new Error("Invalid registry.coverage.subcommand_exemptions");
		}
		policy.subcommand_exemptions = subcommandExemptionsRaw.map((entry, index) =>
			parseToolSubcommandCoverageExemption(
				entry,
				`registry.coverage.subcommand_exemptions[${index}]`,
			),
		);
	}
	return policy;
}

function loadRegistryMetadata(registry: Record<string, unknown>): {
	packs: PackMetadata[];
	coverage?: ToolCoveragePolicy;
} {
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
	const packs = packsRaw.map((entry, index) => {
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
	const coverage = parseToolCoveragePolicy(registry);
	if (coverage === undefined) {
		return { packs };
	}
	return { packs, coverage };
}

const BUILTIN_CATALOG_PREFIX = "benchmarks/catalog/";
const CATALOG_RELATIVE_PREFIX = ".afol/data/benchmarks/catalog/";

function builtinAssetPath(relativePath: string): string {
	if (!relativePath.startsWith(CATALOG_RELATIVE_PREFIX)) {
		throw new Error(`Invalid benchmark catalog path: ${relativePath}`);
	}
	return `${BUILTIN_CATALOG_PREFIX}${relativePath.slice(CATALOG_RELATIVE_PREFIX.length)}`;
}

function builtinAssetBytes(relativePath: string): Buffer | undefined {
	const entry = BUILTIN_ASSET_FILES[builtinAssetPath(relativePath)];
	return entry ? Buffer.from(entry.contentBase64, "base64") : undefined;
}

function loadBuiltinCatalogJson(relativePath: string): Record<string, unknown> {
	const assetPath = builtinAssetPath(relativePath);
	const entry = BUILTIN_ASSET_FILES[assetPath];
	if (!entry) {
		throw new Error(`Missing builtin benchmark catalog file: ${assetPath}`);
	}
	const value: unknown = JSON.parse(
		Buffer.from(entry.contentBase64, "base64").toString("utf8"),
	);
	if (!isObject(value)) {
		throw new Error(`Invalid builtin benchmark catalog file: ${assetPath}`);
	}
	return value;
}

export function loadRegistry(projectRoot: string): RegistrySnapshot {
	const registryPath = join(projectRoot, REGISTRY_RELATIVE_PATH);
	const useProjectCatalog = existsSync(registryPath);
	const loadCatalogJson = (relativePath: string): Record<string, unknown> =>
		useProjectCatalog
			? loadJsonObject(join(projectRoot, relativePath))
			: loadBuiltinCatalogJson(relativePath);
	const { packs, coverage } = loadRegistryMetadata(
		loadCatalogJson(REGISTRY_RELATIVE_PATH),
	);

	const scenariosByPack: Record<string, Scenario[]> = {};
	for (const pack of packs) {
		const packRelativePath = `${SCENARIOS_RELATIVE_PATH}/${pack.pack_id}`;
		const packPath = join(projectRoot, packRelativePath);
		if (useProjectCatalog && !existsSync(packPath)) {
			scenariosByPack[pack.pack_id] = [];
			continue;
		}
		const scenarioEntries = useProjectCatalog
			? readdirSync(packPath)
			: Object.keys(BUILTIN_ASSET_FILES)
					.filter((entry) =>
						entry.startsWith(
							`${BUILTIN_CATALOG_PREFIX}scenarios/${pack.pack_id}/`,
						),
					)
					.map((entry) => basename(entry));
		const scenarios = scenarioEntries
			.filter((entry) => entry.endsWith(".json"))
			.sort()
			.map((entry) => {
				const relativePath = `${packRelativePath}/${entry}`;
				if (useProjectCatalog) {
					// Parse and classify from one byte snapshot so a replacement after
					// validation cannot change the command that gets executed.
					const scenarioBytes = readFileSync(join(projectRoot, relativePath));
					const parsed: unknown = JSON.parse(scenarioBytes.toString("utf8"));
					if (!isObject(parsed)) {
						throw new Error(
							`Invalid JSON object: ${join(projectRoot, relativePath)}`,
						);
					}
					const embeddedBytes = builtinAssetBytes(relativePath);
					const executionSource: BenchmarkScenarioSource =
						embeddedBytes !== undefined &&
						Buffer.compare(scenarioBytes, embeddedBytes) === 0
							? "builtin-copy"
							: "project";
					const scenario = parseScenario(parsed, relativePath, executionSource);
					scenario.execution_source_path = relativePath;
					return scenario;
				}
				const scenario = parseScenario(
					loadCatalogJson(relativePath),
					relativePath,
					"builtin",
				);
				scenario.execution_source_path = relativePath;
				return scenario;
			});
		scenariosByPack[pack.pack_id] = scenarios;
	}

	const baselinesByPack: Record<string, Baseline> = {};
	for (const pack of packs) {
		const baselinePath = join(
			projectRoot,
			BASELINES_RELATIVE_PATH,
			pack.pack_id,
			baselineFilename(pack.pack_id),
		);
		const baselineRelativePath = `${BASELINES_RELATIVE_PATH}/${pack.pack_id}/${baselineFilename(pack.pack_id)}`;
		if (useProjectCatalog && !existsSync(baselinePath)) {
			continue;
		}
		const builtinBaselineKey = `${BUILTIN_CATALOG_PREFIX}baselines/${pack.pack_id}/${baselineFilename(pack.pack_id)}`;
		if (!useProjectCatalog && !BUILTIN_ASSET_FILES[builtinBaselineKey])
			continue;
		baselinesByPack[pack.pack_id] = parseBaseline(
			loadCatalogJson(baselineRelativePath),
			baselineRelativePath,
		);
	}

	const snapshot: RegistrySnapshot = {
		schema_version: VALIDATION_SCHEMA_VERSION,
		projectRoot,
		source: useProjectCatalog ? "project" : "builtin",
		packs,
		scenariosByPack,
		baselinesByPack,
	};
	if (coverage !== undefined) {
		snapshot.coverage = coverage;
	}
	return snapshot;
}

function parseCommandToken(command: string | undefined): string | undefined {
	if (command === undefined) {
		return undefined;
	}
	const [executable, token] = command.trim().split(/\s+/);
	if (
		(executable !== "afol" && executable !== "a" && executable !== "./afol") ||
		token === undefined ||
		token.startsWith("-")
	) {
		return undefined;
	}
	return kernelRegistry.canonicalize(token);
}

function normalizeCoverageCommand(command: string): string {
	return parseCommandToken(command) ?? kernelRegistry.canonicalize(command);
}

function registrySubcommands(): string[] {
	return kernelRegistry.commands.flatMap((command) =>
		(command.subcommands ?? []).map(
			(subcommand) => `${command.command} ${subcommand.usage}`,
		),
	);
}

function normalizeCoverageSubcommand(subcommand: string): string {
	const tokens = subcommand.trim().split(/\s+/);
	const firstToken = tokens[0];
	if (firstToken === "afol" || firstToken === "a" || firstToken === "./afol") {
		tokens.shift();
	}
	const command = tokens.shift();
	if (command === undefined || command.startsWith("-") || tokens.length === 0) {
		return subcommand.trim();
	}
	return `${kernelRegistry.canonicalize(command)} ${tokens.join(" ")}`;
}

function isProductionProofScenario(scenario: Scenario): boolean {
	return scenario.implementation_status === "implemented";
}

function collectCoveredCommands(
	snapshot: RegistrySnapshot,
	knownCommands: ReadonlySet<string>,
	issues: string[],
): Set<string> {
	const coveredCommands = new Set<string>();
	for (const [packId, scenarios] of Object.entries(snapshot.scenariosByPack)) {
		for (const scenario of scenarios) {
			const commandFromScenario = parseCommandToken(scenario.command);
			if (
				commandFromScenario !== undefined &&
				knownCommands.has(commandFromScenario) &&
				isProductionProofScenario(scenario)
			) {
				coveredCommands.add(commandFromScenario);
			}
			for (const command of scenario.coverage?.commands ?? []) {
				const canonicalCommand = normalizeCoverageCommand(command);
				if (!knownCommands.has(canonicalCommand)) {
					issues.push(
						`scenario-tool-coverage-unknown:${packId}:${scenario.scenario_id}:${command}`,
					);
					continue;
				}
				if (isProductionProofScenario(scenario)) {
					coveredCommands.add(canonicalCommand);
				}
			}
		}
	}
	return coveredCommands;
}

function collectCoveredSubcommands(
	snapshot: RegistrySnapshot,
	knownSubcommands: ReadonlySet<string>,
	issues: string[],
): Set<string> {
	const coveredSubcommands = new Set<string>();
	for (const [packId, scenarios] of Object.entries(snapshot.scenariosByPack)) {
		for (const scenario of scenarios) {
			for (const subcommand of scenario.coverage?.subcommands ?? []) {
				const canonicalSubcommand = normalizeCoverageSubcommand(subcommand);
				if (!knownSubcommands.has(canonicalSubcommand)) {
					issues.push(
						`scenario-tool-subcommand-coverage-unknown:${packId}:${scenario.scenario_id}:${subcommand}`,
					);
					continue;
				}
				if (isProductionProofScenario(scenario)) {
					coveredSubcommands.add(canonicalSubcommand);
				}
			}
		}
	}
	return coveredSubcommands;
}

function validateScenarioJourneyCoverage(
	scenario: Scenario,
	packId: string,
	issues: string[],
): void {
	const coverage = scenario.coverage;
	if (coverage === undefined || !isProductionProofScenario(scenario)) {
		return;
	}
	const coversTool =
		(coverage.commands?.length ?? 0) > 0 ||
		(coverage.subcommands?.length ?? 0) > 0;
	if (coversTool && (coverage.journeys?.length ?? 0) === 0) {
		issues.push(
			`scenario-journey-coverage-missing:${packId}:${scenario.scenario_id}`,
		);
	}
}

function validateToolCoverage(
	snapshot: RegistrySnapshot,
	issues: string[],
): void {
	const knownCommands = new Set<string>(
		kernelRegistry.knownCanonicalCommands(),
	);
	const subcommands = registrySubcommands();
	const knownSubcommands = new Set<string>(subcommands);
	const coveredCommands = collectCoveredCommands(
		snapshot,
		knownCommands,
		issues,
	);
	const coveredSubcommands = collectCoveredSubcommands(
		snapshot,
		knownSubcommands,
		issues,
	);
	if (snapshot.coverage === undefined) {
		issues.push("tool-coverage-policy-missing");
		return;
	}
	if (snapshot.coverage.schema_version !== VALIDATION_SCHEMA_VERSION) {
		issues.push(
			`tool-coverage-policy-schema-version-mismatch:${snapshot.coverage.schema_version}`,
		);
	}
	const exemptedCommands = new Set<string>();
	for (const exemption of snapshot.coverage.exemptions) {
		const canonicalCommand = normalizeCoverageCommand(exemption.command);
		if (!knownCommands.has(canonicalCommand)) {
			issues.push(`tool-coverage-exemption-unknown:${exemption.command}`);
			continue;
		}
		if (exemption.reason.trim() === "") {
			issues.push(`tool-coverage-exemption-reason-missing:${canonicalCommand}`);
		}
		if (exemptedCommands.has(canonicalCommand)) {
			issues.push(`tool-coverage-exemption-duplicate:${canonicalCommand}`);
		}
		exemptedCommands.add(canonicalCommand);
	}
	for (const command of kernelRegistry.knownCanonicalCommands()) {
		if (!coveredCommands.has(command) && !exemptedCommands.has(command)) {
			issues.push(`tool-coverage-missing:${command}`);
		}
	}
	const subcommandExemptions = snapshot.coverage.subcommand_exemptions;
	if (subcommandExemptions === undefined) {
		issues.push("tool-subcommand-coverage-policy-missing");
		return;
	}
	const exemptedSubcommands = new Set<string>();
	for (const exemption of subcommandExemptions) {
		const canonicalSubcommand = normalizeCoverageSubcommand(
			exemption.subcommand,
		);
		if (!knownSubcommands.has(canonicalSubcommand)) {
			issues.push(
				`tool-subcommand-coverage-exemption-unknown:${exemption.subcommand}`,
			);
			continue;
		}
		if (exemption.reason.trim() === "") {
			issues.push(
				`tool-subcommand-coverage-exemption-reason-missing:${canonicalSubcommand}`,
			);
		}
		if (exemptedSubcommands.has(canonicalSubcommand)) {
			issues.push(
				`tool-subcommand-coverage-exemption-duplicate:${canonicalSubcommand}`,
			);
		}
		exemptedSubcommands.add(canonicalSubcommand);
	}
	for (const subcommand of subcommands) {
		if (
			!coveredSubcommands.has(subcommand) &&
			!exemptedSubcommands.has(subcommand)
		) {
			issues.push(`tool-subcommand-coverage-missing:${subcommand}`);
		}
	}
}

interface RoadmapFeature {
	id: string;
	title: string;
	status?: string;
	governingSpec?: string;
}

interface SpecEntry {
	id: string;
	fileName: string;
	status?: string;
	roadmapFeature?: string;
}

function requiresProductionProof(status: string | undefined): boolean {
	return status === "final" || status === "release";
}

function validateGovernanceStatus(
	status: string | undefined,
	allowedStatuses: readonly string[],
	issuePrefix: string,
	identifier: string,
	issues: string[],
): boolean {
	if (status === undefined || !allowedStatuses.includes(status)) {
		issues.push(
			`${issuePrefix}-status-invalid:${identifier}:${status ?? "missing"}`,
		);
		return false;
	}
	return true;
}

function cleanMarkdownScalar(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const cleaned = value
		.trim()
		.replace(/^[-\s]+/, "")
		.trim()
		.replace(/^["'`]+|["'`]+$/g, "")
		.trim();
	return cleaned === "" ? undefined : cleaned;
}

function parseFrontmatterScalar(
	source: string,
	key: string,
): string | undefined {
	const lines = source.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") {
		return undefined;
	}
	for (let index = 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (line === undefined) {
			continue;
		}
		if (line.trim() === "---") {
			return undefined;
		}
		const match = line.match(/^([^:#]+):\s*(.*)$/);
		const matchedKey = match?.[1];
		const matchedValue = match?.[2];
		if (
			matchedKey === undefined ||
			matchedValue === undefined ||
			matchedKey.trim() !== key
		) {
			continue;
		}
		return cleanMarkdownScalar(matchedValue);
	}
	return undefined;
}

function parseRoadmapFeatures(source: string): RoadmapFeature[] {
	const features: RoadmapFeature[] = [];
	let current: RoadmapFeature | undefined;
	let expectingGoverningSpec = false;
	for (const line of source.split(/\r?\n/)) {
		const heading = line.match(/^###\s+(F-\d{2})\s+(.+?)\s*$/);
		if (heading) {
			const featureId = heading[1];
			const title = heading[2];
			if (featureId === undefined || title === undefined) {
				continue;
			}
			const feature: RoadmapFeature = { id: featureId, title: title.trim() };
			current = feature;
			features.push(feature);
			expectingGoverningSpec = false;
			continue;
		}
		if (current === undefined) {
			continue;
		}
		const status = line.match(/^- Status:\s*(.*)$/);
		if (status) {
			const parsedStatus = cleanMarkdownScalar(status[1]);
			if (parsedStatus !== undefined) {
				current.status = parsedStatus;
			}
			continue;
		}
		const governingSpec = line.match(/^- Governing spec:\s*(.*)$/);
		if (governingSpec) {
			const parsedGoverningSpec = cleanMarkdownScalar(governingSpec[1]);
			if (parsedGoverningSpec !== undefined) {
				current.governingSpec = parsedGoverningSpec;
			}
			expectingGoverningSpec = parsedGoverningSpec === undefined;
			continue;
		}
		if (expectingGoverningSpec) {
			const value = cleanMarkdownScalar(line);
			if (value !== undefined) {
				current.governingSpec = value;
				expectingGoverningSpec = false;
			}
		}
	}
	return features;
}

function loadRoadmapFeatures(projectRoot: string): RoadmapFeature[] {
	for (const relativePath of ROADMAP_RELATIVE_PATHS) {
		const roadmapPath = join(projectRoot, relativePath);
		if (existsSync(roadmapPath)) {
			return parseRoadmapFeatures(readFileSync(roadmapPath, "utf8"));
		}
	}
	return [];
}

function loadSpecEntries(projectRoot: string): Map<string, SpecEntry> {
	const specsDir = join(projectRoot, SPECS_RELATIVE_PATH);
	const entries = new Map<string, SpecEntry>();
	if (!existsSync(specsDir)) {
		return entries;
	}
	for (const entry of readdirSync(specsDir, { withFileTypes: true }).sort(
		(left, right) => left.name.localeCompare(right.name),
	)) {
		if (
			!entry.isFile() ||
			!entry.name.endsWith(".md") ||
			entry.name === "INDEX.md" ||
			entry.name === "README.md"
		) {
			continue;
		}
		const source = readFileSync(join(specsDir, entry.name), "utf8");
		const docType = parseFrontmatterScalar(source, "doc_type");
		if (docType === "spec-test") {
			continue;
		}
		const fallbackId = entry.name.replace(/\.md$/, "");
		const id = parseFrontmatterScalar(source, "id") ?? fallbackId;
		const specEntry: SpecEntry = {
			id,
			fileName: entry.name,
		};
		const status = parseFrontmatterScalar(source, "status");
		if (status !== undefined) {
			specEntry.status = status;
		}
		const roadmapFeature = parseFrontmatterScalar(source, "roadmap_feature");
		if (roadmapFeature !== undefined) {
			specEntry.roadmapFeature = roadmapFeature;
		}
		entries.set(id, specEntry);
	}
	return entries;
}

function normalizeSpecReference(value: string): string {
	const cleaned = cleanMarkdownScalar(value) ?? value.trim();
	return basename(cleaned).replace(/\.md$/, "");
}

function collectFeatureAndSpecCoverage(
	snapshot: RegistrySnapshot,
	knownFeatures: ReadonlySet<string>,
	knownSpecs: ReadonlySet<string>,
	issues: string[],
): {
	features: Set<string>;
	specs: Set<string>;
} {
	const features = new Set<string>();
	const specs = new Set<string>();
	for (const [packId, scenarios] of Object.entries(snapshot.scenariosByPack)) {
		for (const scenario of scenarios) {
			for (const feature of scenario.coverage?.features ?? []) {
				if (!knownFeatures.has(feature)) {
					issues.push(
						`scenario-feature-coverage-unknown:${packId}:${scenario.scenario_id}:${feature}`,
					);
					continue;
				}
				if (isProductionProofScenario(scenario)) {
					features.add(feature);
				}
			}
			for (const spec of scenario.coverage?.specs ?? []) {
				const specId = normalizeSpecReference(spec);
				if (!knownSpecs.has(specId)) {
					issues.push(
						`scenario-spec-coverage-unknown:${packId}:${scenario.scenario_id}:${spec}`,
					);
					continue;
				}
				if (isProductionProofScenario(scenario)) {
					specs.add(specId);
				}
			}
		}
	}
	return { features, specs };
}

function validateFeatureSpecCoverage(
	snapshot: RegistrySnapshot,
	issues: string[],
): void {
	if (snapshot.projectRoot === undefined) {
		return;
	}
	const roadmapFeatures = loadRoadmapFeatures(snapshot.projectRoot);
	const specs = loadSpecEntries(snapshot.projectRoot);
	if (roadmapFeatures.length === 0 && specs.size === 0) {
		return;
	}
	const knownFeatures = new Set(roadmapFeatures.map((feature) => feature.id));
	const knownSpecs = new Set(specs.keys());
	const coverage = collectFeatureAndSpecCoverage(
		snapshot,
		knownFeatures,
		knownSpecs,
		issues,
	);
	for (const feature of roadmapFeatures) {
		const validStatus = validateGovernanceStatus(
			feature.status,
			ROADMAP_STATUSES,
			"roadmap-feature",
			feature.id,
			issues,
		);
		const rawGoverningSpec = cleanMarkdownScalar(feature.governingSpec);
		if (
			rawGoverningSpec === undefined ||
			rawGoverningSpec.toUpperCase() === "TBD"
		) {
			issues.push(`roadmap-feature-governing-spec-missing:${feature.id}`);
		} else {
			const governingSpecId = normalizeSpecReference(rawGoverningSpec);
			const governingSpec = specs.get(governingSpecId);
			if (governingSpec === undefined) {
				issues.push(
					`roadmap-feature-governing-spec-unknown:${feature.id}:${rawGoverningSpec}`,
				);
			} else if (
				governingSpec.roadmapFeature !== undefined &&
				governingSpec.roadmapFeature !== feature.id
			) {
				issues.push(
					`roadmap-feature-governing-spec-mismatch:${feature.id}:${governingSpec.id}:${governingSpec.roadmapFeature}`,
				);
			}
		}
		if (
			validStatus &&
			requiresProductionProof(feature.status) &&
			!coverage.features.has(feature.id)
		) {
			issues.push(`scenario-feature-coverage-missing:${feature.id}`);
		}
	}
	for (const spec of specs.values()) {
		const validStatus = validateGovernanceStatus(
			spec.status,
			SPEC_STATUSES,
			"spec",
			spec.id,
			issues,
		);
		if (
			spec.roadmapFeature !== undefined &&
			!knownFeatures.has(spec.roadmapFeature)
		) {
			issues.push(
				`spec-roadmap-feature-unknown:${spec.id}:${spec.roadmapFeature}`,
			);
		}
		if (
			validStatus &&
			requiresProductionProof(spec.status) &&
			!coverage.specs.has(spec.id)
		) {
			issues.push(`scenario-spec-coverage-missing:${spec.id}`);
		}
	}
}

interface GitProvenance {
	exists: boolean;
	ancestor: boolean;
	commitTimeMs?: number;
}

const gitProvenanceCache = new Map<string, GitProvenance>();

function runBoundedGit(projectRoot: string, args: string[]) {
	return boundedSpawn("git", args, {
		cwd: projectRoot,
		timeoutMs: GIT_PROVENANCE_TIMEOUT_MS,
		maxBuffer: 64 * 1024,
	});
}

function readGitProvenance(projectRoot: string, commit: string): GitProvenance {
	const head = runBoundedGit(projectRoot, ["rev-parse", "--verify", "HEAD"]);
	const headKey = head.ok ? head.stdout.trim() : "<missing-head>";
	const cacheKey = `${projectRoot}\0${commit}\0${headKey}`;
	const cached = gitProvenanceCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}
	const commitObject = runBoundedGit(projectRoot, [
		"cat-file",
		"-e",
		`${commit}^{commit}`,
	]);
	if (!commitObject.ok) {
		const missing: GitProvenance = { exists: false, ancestor: false };
		gitProvenanceCache.set(cacheKey, missing);
		return missing;
	}
	const ancestor = runBoundedGit(projectRoot, [
		"merge-base",
		"--is-ancestor",
		commit,
		"HEAD",
	]);
	if (!ancestor.ok) {
		const notAncestor: GitProvenance = { exists: true, ancestor: false };
		gitProvenanceCache.set(cacheKey, notAncestor);
		return notAncestor;
	}
	const timestamp = runBoundedGit(projectRoot, [
		"show",
		"-s",
		"--format=%cI",
		commit,
	]);
	const commitTimeMs = timestamp.ok
		? Date.parse(timestamp.stdout.trim())
		: Number.NaN;
	const result: GitProvenance = {
		exists: true,
		ancestor: true,
		...(Number.isFinite(commitTimeMs) ? { commitTimeMs } : {}),
	};
	gitProvenanceCache.set(cacheKey, result);
	return result;
}

export function normalizeGitRepositoryId(value: string): string | undefined {
	let normalized = value.trim();
	if (!normalized || /[?#\s]/u.test(normalized)) return undefined;
	if (/^[^/@\s]+@[^/:\s]+:.+$/u.test(normalized)) {
		const separator = normalized.indexOf(":");
		normalized = `${normalized.slice(0, separator).replace(/^[^@]+@/u, "")}/${normalized.slice(separator + 1)}`;
	} else {
		normalized = normalized.replace(
			/^(?:git\+ssh|ssh|git|https?):\/\/(?:[^@/\s]+@)?/iu,
			"",
		);
	}
	normalized = normalized.replace(/\/+$/u, "").replace(/\.git$/iu, "");
	return /^[a-z0-9.-]+\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(normalized)
		? normalized.toLowerCase()
		: undefined;
}

export function readGitRepositoryId(projectRoot: string): string | undefined {
	const remote = runBoundedGit(projectRoot, [
		"config",
		"--get",
		"remote.origin.url",
	]);
	return remote.ok ? normalizeGitRepositoryId(remote.stdout) : undefined;
}

function validateTimestamp(
	value: string | undefined,
	label: string,
	nowMs: number,
	commitTimeMs: number | undefined,
	issues: string[],
): number | undefined {
	if (value === undefined) {
		issues.push(`benchmark-provenance-missing:${label}`);
		return undefined;
	}
	const timestampMs = Date.parse(value);
	if (!Number.isFinite(timestampMs)) {
		issues.push(`benchmark-provenance-timestamp-invalid:${label}`);
		return undefined;
	}
	if (timestampMs > nowMs) {
		issues.push(`benchmark-provenance-timestamp-future:${label}`);
	}
	if (commitTimeMs !== undefined && timestampMs < commitTimeMs) {
		issues.push(`benchmark-provenance-timestamp-before-commit:${label}`);
	}
	return timestampMs;
}

function validateSampleCount(
	value: number | undefined,
	label: string,
	issues: string[],
): void {
	if (value === undefined) {
		issues.push(`benchmark-provenance-missing:${label}`);
		return;
	}
	if (!Number.isInteger(value) || value < 1) {
		issues.push(`benchmark-provenance-sample-count-invalid:${label}`);
	}
}

function validateWarmupCount(
	value: number | undefined,
	label: string,
	issues: string[],
): void {
	if (value === undefined) {
		issues.push(`benchmark-provenance-missing:${label}`);
		return;
	}
	if (!Number.isInteger(value) || value < 0) {
		issues.push(`benchmark-provenance-warmup-count-invalid:${label}`);
	}
}

/**
 * Validate the provenance contract for an observed benchmark measurement.
 * This is intentionally separate from registry shape checks so tests and
 * tooling can exercise the Git/time invariants without loading the catalog.
 */
export function validateBenchmarkProvenance(
	projectRoot: string | undefined,
	scenario: Scenario,
	baseline: Baseline,
	now: Date = new Date(),
): string[] {
	const prefix = `${scenario.pack_id}:${scenario.scenario_id}`;
	const issues: string[] = [];
	if (baseline.baseline_id !== scenario.baseline_id) {
		issues.push(`benchmark-provenance-mismatch:${prefix}:baseline_id`);
	}
	if (baseline.pack_id !== scenario.pack_id) {
		issues.push(`benchmark-provenance-mismatch:${prefix}:pack_id`);
	}
	const measurement = scenario.measurement;
	if (measurement === undefined) {
		if (
			scenario.pack_id === "evolution-core" &&
			baseline.calibration_status !== "pending"
		) {
			issues.push(`benchmark-provenance-missing:${prefix}:measurement`);
		}
		return issues;
	}
	if (measurement.status !== "observed") {
		issues.push(
			`benchmark-provenance-status-invalid:${prefix}:${measurement.status ?? "missing"}`,
		);
	}
	if (measurement.source === undefined) {
		issues.push(`benchmark-provenance-missing:${prefix}:measurement.source`);
	}
	const measurementSourceRepository = measurement.source_repository;
	const normalizedMeasurementRepository =
		typeof measurementSourceRepository === "string"
			? normalizeGitRepositoryId(measurementSourceRepository)
			: undefined;
	if (measurementSourceRepository === undefined) {
		issues.push(
			`benchmark-provenance-missing:${prefix}:measurement.source_repository`,
		);
	} else if (normalizedMeasurementRepository === undefined) {
		issues.push(
			`benchmark-provenance-source-repository-invalid:${prefix}:measurement`,
		);
	}
	const normalizedBaselineRepository =
		typeof baseline.source_repository === "string"
			? normalizeGitRepositoryId(baseline.source_repository)
			: undefined;
	if (baseline.source_repository === undefined) {
		issues.push(
			`benchmark-provenance-missing:${prefix}:baseline.source_repository`,
		);
	} else if (normalizedBaselineRepository === undefined) {
		issues.push(
			`benchmark-provenance-source-repository-invalid:${prefix}:baseline`,
		);
	}
	if (
		normalizedMeasurementRepository !== undefined &&
		normalizedBaselineRepository !== undefined &&
		normalizedMeasurementRepository !== normalizedBaselineRepository
	) {
		issues.push(`benchmark-provenance-mismatch:${prefix}:source_repository`);
	}
	if (baseline.provenance === undefined) {
		issues.push(`benchmark-provenance-missing:${prefix}:baseline.provenance`);
	} else if (
		measurement.source !== undefined &&
		baseline.provenance !== measurement.source
	) {
		issues.push(`benchmark-provenance-mismatch:${prefix}:provenance`);
	}
	validateSampleCount(
		measurement.sample_count,
		`${prefix}:measurement.sample_count`,
		issues,
	);
	validateSampleCount(
		baseline.sample_count,
		`${prefix}:baseline.sample_count`,
		issues,
	);
	validateWarmupCount(
		measurement.warmup_count,
		`${prefix}:measurement.warmup_count`,
		issues,
	);
	validateWarmupCount(
		baseline.warmup_count,
		`${prefix}:baseline.warmup_count`,
		issues,
	);
	if (scenario.pack_id === "evolution-core") {
		if (measurement.sample_count !== 3) {
			issues.push(`benchmark-provenance-sample-count-required:${prefix}:3`);
		}
		if (measurement.warmup_count !== 1) {
			issues.push(`benchmark-provenance-warmup-count-required:${prefix}:1`);
		}
	}
	for (const [field, measured, recorded] of [
		["sample_count", measurement.sample_count, baseline.sample_count],
		["warmup_count", measurement.warmup_count, baseline.warmup_count],
	] as const) {
		if (
			measured !== undefined &&
			recorded !== undefined &&
			measured !== recorded
		) {
			issues.push(`benchmark-provenance-mismatch:${prefix}:${field}`);
		}
	}
	if (measurement.git_commit === undefined) {
		issues.push(
			`benchmark-provenance-missing:${prefix}:measurement.git_commit`,
		);
	}
	if (baseline.git_commit === undefined) {
		issues.push(`benchmark-provenance-missing:${prefix}:baseline.git_commit`);
	}
	if (
		measurement.git_commit !== undefined &&
		baseline.git_commit !== undefined &&
		measurement.git_commit !== baseline.git_commit
	) {
		issues.push(`benchmark-provenance-mismatch:${prefix}:git_commit`);
	}
	const commit = measurement.git_commit ?? baseline.git_commit;
	let git: GitProvenance | undefined;
	if (commit !== undefined) {
		if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
			issues.push(`benchmark-provenance-commit-invalid:${prefix}:${commit}`);
		} else if (
			projectRoot !== undefined &&
			normalizedMeasurementRepository !== undefined &&
			normalizedBaselineRepository !== undefined &&
			normalizedMeasurementRepository === normalizedBaselineRepository &&
			readGitRepositoryId(projectRoot) === normalizedMeasurementRepository
		) {
			git = readGitProvenance(projectRoot, commit);
			if (!git.exists) {
				issues.push(
					`benchmark-provenance-commit-not-found:${prefix}:${commit}`,
				);
			} else if (!git.ancestor) {
				issues.push(
					`benchmark-provenance-commit-not-ancestor:${prefix}:${commit}`,
				);
			}
		}
	}
	const nowMs = now.getTime();
	if (!Number.isFinite(nowMs)) {
		issues.push(`benchmark-provenance-now-invalid:${prefix}`);
		return issues;
	}
	const measurementTimestampMs = validateTimestamp(
		measurement.timestamp,
		`${prefix}:measurement.timestamp`,
		nowMs,
		git?.commitTimeMs,
		issues,
	);
	const baselineTimestampMs = validateTimestamp(
		baseline.timestamp,
		`${prefix}:baseline.timestamp`,
		nowMs,
		git?.commitTimeMs,
		issues,
	);
	if (
		measurementTimestampMs !== undefined &&
		baselineTimestampMs !== undefined &&
		measurementTimestampMs !== baselineTimestampMs
	) {
		issues.push(`benchmark-provenance-mismatch:${prefix}:timestamp`);
	}
	return issues;
}

function isSyntheticProfileValue(value: string): boolean {
	return /(?:^|[-_])(fixture|placeholder|synthetic|unknown|pending)(?:$|[-_])/i.test(
		value,
	);
}

const CALIBRATION_REASON_MAX_LENGTH = 64;
const CALIBRATION_REASON_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PENDING_BASELINE_OBSERVED_FIELDS = [
	"timing_p50_ms",
	"timing_p95_ms",
	"sample_count",
	"warmup_count",
	"git_commit",
	"source_repository",
	"timestamp",
	"provenance",
	"host_profile_id",
	"os",
	"arch",
	"cpu_class",
	"bun_version",
	"runtime_version",
	"execution_mode",
	"artifact_mode",
	"artifact_sha256",
	"scenarios",
] as const;

export function validatePendingBaselineContract(
	baseline: Baseline,
	issuePrefix: string,
): string[] {
	const issues: string[] = [];
	if (
		typeof baseline.calibration_reason !== "string" ||
		baseline.calibration_reason.trim() === ""
	) {
		issues.push(`${issuePrefix}-calibration-reason-required`);
	} else if (
		baseline.calibration_reason.length > CALIBRATION_REASON_MAX_LENGTH ||
		!CALIBRATION_REASON_PATTERN.test(baseline.calibration_reason)
	) {
		issues.push(`${issuePrefix}-calibration-reason-format-invalid`);
	} else if (isSyntheticProfileValue(baseline.calibration_reason)) {
		issues.push(`${issuePrefix}-calibration-reason-placeholder`);
	}
	for (const field of PENDING_BASELINE_OBSERVED_FIELDS) {
		if (baseline[field] !== undefined) {
			issues.push(`${issuePrefix}-pending-observed-field:${field}`);
		}
	}
	return issues;
}

export function formatCalibrationReason(value: string | undefined): string {
	return typeof value === "string" &&
		value.length <= CALIBRATION_REASON_MAX_LENGTH &&
		CALIBRATION_REASON_PATTERN.test(value)
		? value
		: "reason-invalid";
}

export function validateMutationBaselineContract(
	projectRoot: string | undefined,
	scenarios: readonly Scenario[],
	baseline: Baseline,
	now: Date = new Date(),
): string[] {
	const issues: string[] = [];
	for (const scenario of scenarios) {
		if (scenario.compiled_binary !== true) {
			issues.push(
				`mutation-scenario-compiled-release-required:${scenario.scenario_id}`,
			);
		}
	}
	if (baseline.calibration_status === "pending") {
		issues.push(
			...validatePendingBaselineContract(baseline, "mutation-baseline"),
		);
		return issues;
	}
	if (baseline.calibration_reason !== undefined) {
		issues.push("mutation-baseline-calibration-reason-unexpected");
	}
	const requiredProfileFields = [
		"host_profile_id",
		"os",
		"arch",
		"cpu_class",
		"bun_version",
		"runtime_version",
		"execution_mode",
		"artifact_mode",
	] as const;
	for (const field of requiredProfileFields) {
		const value = baseline[field];
		if (typeof value !== "string" || value.trim() === "") {
			issues.push(`mutation-baseline-provenance-missing:${field}`);
		} else if (isSyntheticProfileValue(value)) {
			issues.push(`mutation-baseline-profile-placeholder:${field}`);
		}
	}
	if (baseline.execution_mode !== "compiled-release") {
		issues.push("mutation-baseline-execution-mode-required");
	}
	if (baseline.artifact_mode !== "bun-compile") {
		issues.push("mutation-baseline-artifact-mode-required");
	}
	if (
		typeof baseline.artifact_sha256 !== "string" ||
		!/^[a-f0-9]{64}$/.test(baseline.artifact_sha256)
	) {
		issues.push("mutation-baseline-artifact-sha256-invalid");
	}
	if (
		typeof baseline.git_commit !== "string" ||
		!/^[a-f0-9]{40}$/i.test(baseline.git_commit)
	) {
		issues.push("mutation-baseline-git-commit-invalid");
	} else if (projectRoot === undefined) {
		issues.push("mutation-baseline-project-root-missing");
	} else {
		const sourceRepository =
			typeof baseline.source_repository === "string"
				? normalizeGitRepositoryId(baseline.source_repository)
				: undefined;
		if (sourceRepository === undefined) {
			issues.push("mutation-baseline-source-repository-invalid");
		}
		const git = readGitProvenance(projectRoot, baseline.git_commit);
		const localRepository = readGitRepositoryId(projectRoot);
		if (
			!git.exists &&
			(sourceRepository === undefined || localRepository === sourceRepository)
		) {
			issues.push("mutation-baseline-git-commit-not-found");
		} else if (!git.ancestor) {
			if (git.exists) {
				issues.push("mutation-baseline-git-commit-not-ancestor");
			}
		}
	}
	const timestampMs =
		typeof baseline.timestamp === "string"
			? Date.parse(baseline.timestamp)
			: Number.NaN;
	if (!Number.isFinite(timestampMs)) {
		issues.push("mutation-baseline-timestamp-invalid");
	} else if (timestampMs > now.getTime()) {
		issues.push("mutation-baseline-timestamp-future");
	}
	if (
		typeof baseline.provenance !== "string" ||
		baseline.provenance.trim() === ""
	) {
		issues.push("mutation-baseline-provenance-missing:provenance");
	} else if (/calibration-pending/i.test(baseline.provenance)) {
		issues.push("mutation-baseline-calibration-pending");
	}
	if (
		!Number.isInteger(baseline.sample_count) ||
		(baseline.sample_count ?? 0) < 20
	) {
		issues.push("mutation-baseline-sample-count-required:20");
	}
	if (
		!Number.isInteger(baseline.warmup_count) ||
		(baseline.warmup_count ?? 0) < 1
	) {
		issues.push("mutation-baseline-warmup-count-required:1");
	}
	for (const scenario of scenarios) {
		const scenarioBaseline = baseline.scenarios?.[scenario.scenario_id];
		if (!scenarioBaseline) {
			issues.push(`mutation-scenario-baseline-missing:${scenario.scenario_id}`);
			continue;
		}
		if (
			scenarioBaseline.scenario_id !== scenario.scenario_id ||
			scenarioBaseline.scenario_version !== scenario.scenario_version
		) {
			issues.push(
				`mutation-scenario-baseline-identity-mismatch:${scenario.scenario_id}`,
			);
		}
		if (
			!Number.isInteger(scenarioBaseline.sample_count) ||
			scenarioBaseline.sample_count < 20
		) {
			issues.push(
				`mutation-scenario-baseline-sample-count-required:${scenario.scenario_id}:20`,
			);
		}
		if (
			!Number.isInteger(scenarioBaseline.warmup_count) ||
			scenarioBaseline.warmup_count < 1
		) {
			issues.push(
				`mutation-scenario-baseline-warmup-count-required:${scenario.scenario_id}:1`,
			);
		}
		const hardP95 = scenario.thresholds.max_p95_ms;
		if (
			typeof hardP95 === "number" &&
			scenarioBaseline.timing_p95_ms > hardP95
		) {
			issues.push(
				`mutation-scenario-baseline-violates-slo:${scenario.scenario_id}:timing_p95_ms`,
			);
		}
	}
	return issues;
}

export function validateRegistryContract(snapshot: RegistrySnapshot): string[] {
	const issues: string[] = [];
	const scenarioIds = new Set<string>();
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
			if (scenarioIds.has(scenario.scenario_id)) {
				issues.push(`duplicate-scenario-id:${scenario.scenario_id}`);
			} else {
				scenarioIds.add(scenario.scenario_id);
			}
			if (
				packId === "evolution-core" &&
				scenario.implementation_status !== "implemented"
			) {
				issues.push(
					`scenario-implementation-status-required:${packId}:${scenario.scenario_id}:${scenario.implementation_status ?? "missing"}`,
				);
			}
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
			validateScenarioJourneyCoverage(scenario, packId, issues);
		}
		const baseline = snapshot.baselinesByPack[packId];
		if (!baseline) {
			if (packId !== "evolution-core") {
				issues.push(`missing-baseline:${packId}`);
			}
			continue;
		}
		if (baseline.schema_version !== VALIDATION_SCHEMA_VERSION) {
			issues.push(
				`baseline-schema-version-mismatch:${packId}:${baseline.schema_version}`,
			);
		}
		if (packId === "mutation-safety") {
			issues.push(
				...validateMutationBaselineContract(
					snapshot.projectRoot,
					scenarios,
					baseline,
				),
			);
		} else if (baseline.calibration_status === "pending") {
			issues.push(
				...validatePendingBaselineContract(baseline, `${packId}-baseline`),
			);
		}
		for (const scenario of scenarios) {
			issues.push(
				...validateBenchmarkProvenance(
					snapshot.projectRoot,
					scenario,
					baseline,
				),
			);
		}
	}
	validateToolCoverage(snapshot, issues);
	validateFeatureSpecCoverage(snapshot, issues);
	return issues;
}
