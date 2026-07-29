export const VALIDATION_SCHEMA_VERSION = "1.0.0";
export const BENCHMARK_RESULT_SCHEMA_VERSION = "1.0.0";

export const REQUIRED_PACKS = [
	"cli-kernel-local",
	"evolution-core",
	"routing-accuracy",
	"mutation-safety",
	"update-safety",
	"workbench-parity",
	"mcp-parity",
	"runtime-live-agent",
	"token-economy",
	"pstr-integrity",
	"context-bundles",
	"state-projection",
	"memory-governance",
	"library-knowledge",
	"governance-history",
	"adm-governance",
] as const;

export type PackId = (typeof REQUIRED_PACKS)[number];

export type ValidationScope = "default" | "wb" | "tpl" | "update";

export interface ScenarioCoverage {
	commands?: string[];
	subcommands?: string[];
	journeys?: string[];
	features?: string[];
	specs?: string[];
}

export interface ScenarioMeasurement {
	status?: string;
	source?: string;
	sample_count?: number;
	warmup_count?: number;
	git_commit?: string;
	timestamp?: string;
}

export interface BenchmarkExecutionProfile {
	host_profile_id: string;
	os: string;
	arch: string;
	cpu_class: string;
	bun_version: string;
	runtime_version: string;
	execution_mode: "source" | "compiled-release";
	artifact_mode: "source" | "bun-compile";
	artifact_sha256: string;
}

export interface Scenario {
	schema_version: string;
	scenario_id: string;
	scenario_version: string;
	pack_id: PackId;
	command?: string;
	coverage?: ScenarioCoverage;
	sandbox?: boolean;
	setup?: string[][];
	expected_exit?: number;
	result_schema: string;
	oracle: string;
	thresholds: Record<string, number>;
	baseline_id: string;
	deterministic_metrics: Record<string, number>;
	implementation_status?: "implemented" | "planned" | "skipped";
	live_runner_scenario_id?: string;
	compiled_binary?: boolean;
	measurement?: ScenarioMeasurement;
}

export interface ToolCoverageExemption {
	command: string;
	reason: string;
}

export interface ToolSubcommandCoverageExemption {
	subcommand: string;
	reason: string;
}

export interface ToolCoveragePolicy {
	schema_version: string;
	exemptions: ToolCoverageExemption[];
	subcommand_exemptions?: ToolSubcommandCoverageExemption[];
}

export interface RegistrySnapshot {
	schema_version: string;
	projectRoot?: string;
	packs: PackMetadata[];
	coverage?: ToolCoveragePolicy;
	scenariosByPack: Record<string, Scenario[]>;
	baselinesByPack: Record<string, Baseline>;
}

export interface ValidationCommandSpec {
	command: string[];
}

export interface ValidationCommandResult {
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

export interface Baseline {
	baseline_id: string;
	pack_id: PackId;
	schema_version: string;
	calibration_status?: "observed" | "pending";
	calibration_reason?: string;
	timing_p50_ms?: number;
	timing_p95_ms?: number;
	sample_count?: number;
	warmup_count?: number;
	git_commit?: string;
	source_repository?: string;
	timestamp?: string;
	provenance?: string;
	host_profile_id?: string;
	os?: string;
	arch?: string;
	cpu_class?: string;
	bun_version?: string;
	runtime_version?: string;
	execution_mode?: "source" | "compiled-release";
	artifact_mode?: "source" | "bun-compile";
	artifact_sha256?: string;
	scenarios?: Record<string, ScenarioBaseline>;
}

export interface ScenarioBaseline {
	scenario_id: string;
	scenario_version: string;
	timing_p50_ms: number;
	timing_p95_ms: number;
	sample_count: number;
	warmup_count: number;
}

export interface PackMetadata {
	pack_id: PackId;
	min_scenarios: number;
	selector_tags: string[];
}

export interface SelectorInput {
	scope: ValidationScope;
	changedPaths: string[];
}

export interface SelectorOutput {
	selected_pack_ids: PackId[];
	reasons: string[];
}

export interface BenchmarkResult {
	schema_version: string;
	run_id: string;
	scenario_id: string;
	scenario_version: string;
	pack_id: PackId;
	status: "passed" | "failed" | "skipped" | "baseline-missing" | "incompatible";
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
	argv_chars?: number;
	tool_call_count: number;
	tool_success_rate: number;
	git_commit: string;
	timestamp?: string;
	sample_count?: number;
	warmup_count?: number;
	host_profile_id?: string;
	os?: string;
	arch?: string;
	cpu_class?: string;
	bun_version?: string;
	runtime_version?: string;
	execution_mode?: "source" | "compiled-release";
	artifact_mode?: "source" | "bun-compile";
	artifact_sha256?: string;
	source_state_sha256?: string;
	source_dirty?: boolean | null;
	notes: string[];
}
