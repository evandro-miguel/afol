export const BENCH_SCHEMA_VERSION = "2.0.0" as const;
export const DEFAULT_BENCH_MODEL = "gpt-5.4-mini/medium" as const;
export const DEFAULT_BENCH_PACK_ID = "comprehensive-live" as const;
export const DEFAULT_CLI_PACK_ID = "cli-micro" as const;

export type BenchToolType = "file_read" | "afol_command" | "shell";

export type BenchTokens = {
	input: number;
	output: number;
	cached_input: number;
	reasoning_output: number;
	total: number;
};

export type BenchTiming = {
	wall_clock_ms: number;
};

export type BenchToolTypeCounts = {
	file_read: number;
	afol_command: number;
	shell: number;
	agent_message: number;
};

export type BenchToolCall = {
	command: string;
	exit_code: number | null;
	status: string;
	type: BenchToolType;
	duration_ms: number;
};

export type BenchThresholds = {
	max_output_tokens: number;
	max_duration_ms: number;
	min_tool_success_rate: number;
	/** Total provider-reported tokens, including cached/reasoning fields. */
	max_total_tokens?: number;
	/** Number of observed AFOL protocol commands in the agent trace. */
	max_afol_commands?: number;
	/** Number of AFOL-bearing command executions in the agent trace. */
	max_round_trips?: number;
};

export type BenchScenarioExpected = {
	commands_used?: readonly string[];
	forbidden_commands?: readonly string[];
	avoid_meta_planning?: boolean;
	task_completes?: boolean;
	workbench_closed?: boolean;
};

export type BenchScenario = {
	id: string;
	version: string;
	description: string;
	prompt: string;
	setup?: (sandboxDir: string) => void;
	expected?: BenchScenarioExpected;
	thresholds?: Partial<BenchThresholds>;
};

export type BenchResult = {
	schema_version: typeof BENCH_SCHEMA_VERSION;
	run_id: string;
	scenario_id: string;
	pack_id: string;
	status: "passed" | "failed" | "blocked";
	mode: "live" | "cli-micro";
	git_commit: string;
	model: string;
	timestamp: string;
	tokens: BenchTokens;
	timing: BenchTiming;
	tools: {
		total_calls: number;
		success_rate: number;
		by_type: BenchToolTypeCounts;
		error_count: number;
	};
	effectiveness: {
		task_completed: boolean;
		error_count: number;
	};
	plan_quality: {
		meta_planning_detected: boolean;
		direct_execution: boolean;
	} | null;
	thresholds: BenchThresholds;
	pass: boolean;
	notes: string[];
};

export type RawMetrics = {
	tokens: BenchTokens;
	timing: BenchTiming;
	tools: {
		total_calls: number;
		success_rate: number;
		by_type: BenchToolTypeCounts;
		error_count: number;
		retry_count: number;
		calls: BenchToolCall[];
	};
	effectiveness: {
		task_completed: boolean;
		error_count: number;
		retry_count: number;
	};
	plan_quality: {
		meta_planning_detected: boolean;
		direct_execution: boolean;
	};
	agent_messages: {
		count: number;
		total_chars: number;
		texts: string[];
	};
	turn_completed: boolean;
};

export type BenchmarkBaseline = {
	schema_version: string;
	baseline_id: string;
	pack_id: string;
	git_commit?: string;
	run_id?: string;
	timestamp?: string;
	results_count?: number;
	tokens?: BenchTokens;
	timing?: BenchTiming;
	tools?: {
		total_calls: number;
		success_rate: number;
		by_type: BenchToolTypeCounts;
		error_count: number;
	};
	effectiveness?: {
		task_completed: boolean;
		error_count: number;
	};
	plan_quality?: {
		meta_planning_detected: boolean;
		direct_execution: boolean;
	} | null;
	aggregate?: {
		total_tokens: number;
		total_time_ms: number;
		avg_tool_success_rate: number;
	};
	legacy?: Record<string, unknown>;
};

export type BenchReport = {
	schema_version: typeof BENCH_SCHEMA_VERSION;
	run_id: string;
	pack_id: string;
	timestamp: string;
	results: BenchResult[];
	baseline: BenchmarkBaseline | null;
	summary: {
		total: number;
		passed: number;
		failed: number;
		blocked: number;
		total_tokens: number;
		total_time_ms: number;
		avg_tool_success_rate: number;
	};
	comparison: {
		delta_tokens: number | null;
		delta_time_ms: number | null;
		delta_tool_success_rate: number | null;
		regressions: string[];
	};
	text: string;
	json: Record<string, unknown>;
};

export type LiveBenchResult = BenchResult;
