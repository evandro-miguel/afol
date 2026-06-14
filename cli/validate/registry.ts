import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
	asNumberRecord,
	asOptionalNumber,
	asOptionalString,
	asString,
	isObject,
	loadJsonObject,
} from "./shared";
import {
	type Baseline,
	BENCHMARK_RESULT_SCHEMA_VERSION,
	type PackId,
	type PackMetadata,
	REQUIRED_PACKS,
	type RegistrySnapshot,
	type Scenario,
	VALIDATION_SCHEMA_VERSION,
} from "./types";

const REGISTRY_RELATIVE_PATH = ".afol/data/benchmarks/catalog/registry.json";
const SCENARIOS_RELATIVE_PATH = ".afol/data/benchmarks/catalog/scenarios";
const BASELINES_RELATIVE_PATH = ".afol/data/benchmarks/catalog/baselines";

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
	if (typeof data.sandbox === "boolean") {
		scenario.sandbox = data.sandbox;
	} else if (data.sandbox !== undefined) {
		throw new Error(`Invalid boolean field: ${sourcePath}.sandbox`);
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
