import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

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
	type PackId,
	type PackMetadata,
	REQUIRED_PACKS,
	type RegistrySnapshot,
	type Scenario,
	type ScenarioCoverage,
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

function loadRegistryMetadata(registryPath: string): {
	packs: PackMetadata[];
	coverage?: ToolCoveragePolicy;
} {
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

export function loadRegistry(projectRoot: string): RegistrySnapshot {
	const registryPath = join(projectRoot, REGISTRY_RELATIVE_PATH);
	const { packs, coverage } = loadRegistryMetadata(registryPath);

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

	const snapshot: RegistrySnapshot = {
		schema_version: VALIDATION_SCHEMA_VERSION,
		projectRoot,
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
	governingSpec?: string;
}

interface SpecEntry {
	id: string;
	fileName: string;
	roadmapFeature?: string;
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
): { features: Set<string>; specs: Set<string> } {
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
		if (!coverage.features.has(feature.id)) {
			issues.push(`scenario-feature-coverage-missing:${feature.id}`);
		}
	}
	for (const spec of specs.values()) {
		if (
			spec.roadmapFeature !== undefined &&
			!knownFeatures.has(spec.roadmapFeature)
		) {
			issues.push(
				`spec-roadmap-feature-unknown:${spec.id}:${spec.roadmapFeature}`,
			);
		}
		if (!coverage.specs.has(spec.id)) {
			issues.push(`scenario-spec-coverage-missing:${spec.id}`);
		}
	}
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
			validateScenarioJourneyCoverage(scenario, packId, issues);
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
	validateToolCoverage(snapshot, issues);
	validateFeatureSpecCoverage(snapshot, issues);
	return issues;
}
