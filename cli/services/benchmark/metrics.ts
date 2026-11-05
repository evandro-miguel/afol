import type {
	BenchToolCall,
	BenchToolType,
	EventStreamProfile,
	RawMetrics,
} from "./types";

const FILE_READ_RE = /(^|\s)(sed|cat|head|tail|rg|grep|less|more|bat)\b/;
const AFOL_COMMAND_RE =
	/(^|&&|\|\||\||;|\n)\s*(?:(?:\.\/)?afol\b|bun\s+run\s+cli\/main\.ts\b|bun\s+run\s+kernel\s+--(?:\s|$))/;
const SHELL_LC_RE =
	/(?:^|\s)(?:[./\w-]+\/)?(?:sh|bash|zsh)\s+-lc\s+(['"])([\s\S]*)\1\s*$/;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: null;
}

export function normalizeCommandForBenchmark(command: string): string {
	const trimmed = command.trim();
	const shellMatch = SHELL_LC_RE.exec(trimmed);
	return shellMatch ? (shellMatch[2] ?? "").trim() : trimmed;
}

export function isAfolProtocolCommand(command: string): boolean {
	return AFOL_COMMAND_RE.test(normalizeCommandForBenchmark(command));
}

export function classifyCommand(command: string): BenchToolType {
	const normalizedCommand = normalizeCommandForBenchmark(command);
	if (FILE_READ_RE.test(normalizedCommand) || command.includes("Read")) {
		return "file_read";
	}
	if (isAfolProtocolCommand(normalizedCommand)) {
		return "afol_command";
	}
	return "shell";
}

const DEFAULT_PROFILE: EventStreamProfile = {
	harness: "codex",
	version: "unspecified",
	format: "codex-exec-v1",
	usage_mode: "delta",
	token_details: "included",
};
const TOKEN_FIELDS = {
	input: "input_tokens",
	output: "output_tokens",
	cached_input: "cached_input_tokens",
	reasoning_output: "reasoning_output_tokens",
	cache_write: "cache_creation_input_tokens",
} as const;

function timestamp(value: unknown): number | null {
	if (typeof value !== "string") return null;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : null;
}

function toolType(item: Record<string, unknown>): BenchToolCall["type"] | null {
	switch (item.type) {
		case "command_execution":
			return classifyCommand(
				typeof item.command === "string" ? item.command : "",
			);
		case "mcp_tool_call":
			return "mcp";
		case "file_change":
			return "file_edit";
		case "file_read":
			return "file_read";
		case "tool_call":
		case "web_search":
			return "other";
		default:
			return null;
	}
}

/** Parse observations only. Delivery acceptance belongs to a separate verifier. */
export function parseEventStream(
	lines: string[],
	profile: EventStreamProfile = DEFAULT_PROFILE,
): RawMetrics {
	if (
		profile.format !== "codex-exec-v1" ||
		!["delta", "cumulative"].includes(profile.usage_mode) ||
		!["included", "exclusive"].includes(profile.token_details) ||
		!profile.harness ||
		!profile.version
	)
		throw new Error("unsupported-event-profile");
	const tokens: RawMetrics["tokens"] = {
		input: null,
		output: null,
		cached_input: null,
		reasoning_output: null,
		cache_write: null,
		total: null,
	};
	const tools: RawMetrics["tools"] = {
		total_calls: 0,
		success_rate: null,
		by_type: {
			file_read: 0,
			afol_command: 0,
			shell: 0,
			file_edit: 0,
			mcp: 0,
			other: 0,
		},
		error_count: 0,
		unknown_count: 0,
		retry_count: 0,
		calls: [],
	};
	const messages: RawMetrics["agent_messages"] = {
		count: 0,
		total_chars: 0,
		texts: [],
	};
	const issues = new Set<string>();
	const seen = new Map<string, string>();
	const starts = new Map<string, number>();
	let usageCount = 0;
	let turnCompleted = false;
	let runStart: number | null = null;
	let runEnd: number | null = null;
	let invalidUsage = false;
	const addMessage = (text: unknown) => {
		if (typeof text !== "string") return;
		messages.count += 1;
		messages.total_chars += text.length;
		messages.texts.push(text);
	};
	for (const line of lines) {
		if (!line.trim()) continue;
		let event: unknown;
		try {
			event = JSON.parse(line);
		} catch {
			issues.add("malformed-event");
			invalidUsage = true;
			continue;
		}
		if (!isObject(event) || typeof event.type !== "string") {
			issues.add("invalid-event");
			invalidUsage = true;
			continue;
		}
		const item = isObject(event.item) ? event.item : null;
		const id =
			typeof item?.id === "string"
				? item.id
				: typeof event.id === "string"
					? event.id
					: null;
		const key = id === null ? null : `${event.type}:${id}`;
		if (key) {
			const encoded = JSON.stringify(event);
			const previous = seen.get(key);
			if (previous !== undefined) {
				if (previous !== encoded) {
					issues.add("conflicting-event-id");
					invalidUsage = true;
				}
				continue;
			}
			seen.set(key, encoded);
		}
		const at = timestamp(event.timestamp);
		if (event.type === "thread.started" || event.type === "run.started")
			runStart ??= at;
		if (event.type === "run.completed" || event.type === "turn.completed")
			runEnd = at;
		if (event.type === "item.started" && id && at !== null) starts.set(id, at);
		if (event.type === "turn.completed") {
			turnCompleted = true;
			const usage = isObject(event.usage) ? { ...event.usage } : {};
			if (usage.cache_write_input_tokens !== undefined) {
				if (
					usage.cache_creation_input_tokens !== undefined &&
					usage.cache_creation_input_tokens !== usage.cache_write_input_tokens
				) {
					issues.add("conflicting-cache-write-usage");
					invalidUsage = true;
				}
				usage.cache_creation_input_tokens = usage.cache_write_input_tokens;
			}
			if (profile.token_details === "included") {
				for (const [detail, parent] of [
					["cached_input_tokens", "input_tokens"],
					["cache_creation_input_tokens", "input_tokens"],
					["reasoning_output_tokens", "output_tokens"],
				] as const) {
					const child = parseInteger(usage[detail]);
					const total = parseInteger(usage[parent]);
					if (child !== null && total !== null && child > total) {
						issues.add("token-detail-exceeds-total");
						invalidUsage = true;
					}
				}
			}
			for (const field of Object.keys(
				TOKEN_FIELDS,
			) as (keyof typeof TOKEN_FIELDS)[]) {
				const value = parseInteger(usage[TOKEN_FIELDS[field]]);
				if (usage[TOKEN_FIELDS[field]] !== undefined && value === null) {
					issues.add("invalid-token-count");
					invalidUsage = true;
				}
				const previous = tokens[field];
				if (profile.usage_mode === "cumulative") {
					if (value !== null && previous !== null && value < previous) {
						issues.add("decreasing-cumulative-usage");
						invalidUsage = true;
					}
					tokens[field] = value;
				} else {
					tokens[field] =
						usageCount === 0
							? value
							: previous === null || value === null
								? null
								: previous + value;
				}
			}
			usageCount += 1;
			continue;
		}
		if (event.type === "agent_message") addMessage(event.text);
		if (event.type !== "item.completed" || !item) continue;
		if (item.type === "agent_message") {
			addMessage(item.text);
			continue;
		}
		const type = toolType(item);
		if (!type) {
			if (item.type !== "reasoning" && item.type !== "todo_list")
				issues.add("unsupported-item-type");
			continue;
		}
		const exit =
			typeof item.exit_code === "number" && Number.isSafeInteger(item.exit_code)
				? item.exit_code
				: null;
		const status = typeof item.status === "string" ? item.status : "unknown";
		const failed =
			status === "failed" ||
			status === "error" ||
			item.error != null ||
			(exit !== null && exit !== 0);
		const succeeded =
			!failed &&
			(item.type === "command_execution" ? exit === 0 : status === "completed");
		const start = id ? starts.get(id) : undefined;
		const observedDuration = parseInteger(item.duration_ms);
		const duration =
			observedDuration ??
			(start !== undefined && at !== null && at >= start ? at - start : null);
		tools.calls.push({
			command: typeof item.command === "string" ? item.command : "",
			exit_code: exit,
			status,
			type,
			duration_ms: duration,
		});
		tools.total_calls += 1;
		tools.by_type[type] += 1;
		if (failed) tools.error_count += 1;
		else if (!succeeded) tools.unknown_count += 1;
		if (typeof item.retry_of === "string") tools.retry_count += 1;
	}
	if (profile.token_details === "included") {
		if (
			(tokens.cached_input !== null &&
				tokens.input !== null &&
				tokens.cached_input > tokens.input) ||
			(tokens.reasoning_output !== null &&
				tokens.output !== null &&
				tokens.reasoning_output > tokens.output) ||
			(tokens.cache_write !== null &&
				tokens.input !== null &&
				tokens.cache_write > tokens.input)
		) {
			issues.add("token-detail-exceeds-total");
			invalidUsage = true;
		}
	}
	const totalFields =
		profile.token_details === "included"
			? [tokens.input, tokens.output]
			: [
					tokens.input,
					tokens.output,
					tokens.cached_input,
					tokens.reasoning_output,
					tokens.cache_write,
				];
	if (totalFields.every((value) => value !== null))
		tokens.total = totalFields.reduce<number>(
			(sum, value) => sum + (value ?? 0),
			0,
		);
	if (
		Object.values(tokens).some(
			(value) => value !== null && !Number.isSafeInteger(value),
		)
	) {
		issues.add("token-count-overflow");
		invalidUsage = true;
	}
	if (invalidUsage)
		for (const field of Object.keys(tokens) as (keyof typeof tokens)[])
			tokens[field] = null;
	if (tools.total_calls > 0 && tools.unknown_count === 0 && issues.size === 0)
		tools.success_rate = Number(
			((tools.total_calls - tools.error_count) / tools.total_calls).toFixed(4),
		);
	return {
		schema_version: "afol_metrics_v1",
		source: { ...profile },
		issues: [...issues],
		tokens,
		timing: {
			wall_clock_ms:
				runStart !== null && runEnd !== null && runEnd >= runStart
					? runEnd - runStart
					: null,
		},
		tools,
		effectiveness: {
			task_completed: false,
			error_count: tools.error_count,
			retry_count: tools.retry_count,
		},
		plan_quality: null,
		agent_messages: messages,
		turn_completed: turnCompleted,
	};
}
