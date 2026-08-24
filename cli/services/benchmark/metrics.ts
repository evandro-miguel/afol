import type { BenchToolType, RawMetrics } from "./types";

const FILE_READ_RE = /(^|\s)(sed|cat|head|tail|rg|grep|less|more|bat)\b/;
const AFOL_COMMAND_RE =
	/(^|&&|\|\||\||;|\n)\s*(?:(?:\.\/)?afol\b|bun\s+run\s+cli\/main\.ts\b|bun\s+run\s+kernel\s+--(?:\s|$))/;
const SHELL_LC_RE =
	/(?:^|\s)(?:[./\w-]+\/)?(?:sh|bash|zsh)\s+-lc\s+(['"])([\s\S]*)\1\s*$/;

const META_PLANNING_PHRASES = [
	"create the plan",
	"write the plan",
	"draft the plan",
	"research for the plan",
];

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value)
		? Math.trunc(value)
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

export function parseEventStream(lines: string[]): RawMetrics {
	const tokens = {
		input: 0,
		output: 0,
		cached_input: 0,
		reasoning_output: 0,
		total: 0,
	};
	const tools = {
		total_calls: 0,
		success_rate: 1,
		by_type: {
			file_read: 0,
			afol_command: 0,
			shell: 0,
			agent_message: 0,
		},
		error_count: 0,
		retry_count: 0,
		calls: [] as RawMetrics["tools"]["calls"],
	};
	const agentMessages = {
		count: 0,
		total_chars: 0,
		texts: [] as string[],
	};
	let turnCompleted = false;

	for (const [index, line] of lines.entries()) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed) as unknown;
		} catch {
			continue;
		}
		if (!isObject(parsed) || typeof parsed.type !== "string") {
			continue;
		}

		switch (parsed.type) {
			case "turn.completed": {
				turnCompleted = true;
				const usage = isObject(parsed.usage) ? parsed.usage : null;
				if (usage) {
					const input = parseInteger(usage.input_tokens);
					const cachedInput = parseInteger(usage.cached_input_tokens);
					const output = parseInteger(usage.output_tokens);
					const reasoning = parseInteger(usage.reasoning_output_tokens);
					if (input !== null) {
						tokens.input = input;
					}
					if (cachedInput !== null) {
						tokens.cached_input = cachedInput;
					}
					if (output !== null) {
						tokens.output = output;
					}
					if (reasoning !== null) {
						tokens.reasoning_output = reasoning;
					}
					tokens.total =
						tokens.input +
						tokens.cached_input +
						tokens.output +
						tokens.reasoning_output;
				}
				break;
			}
			case "item.completed": {
				const item = isObject(parsed.item) ? parsed.item : null;
				if (item?.type !== "command_execution") {
					if (item?.type === "agent_message") {
						const text = typeof item.text === "string" ? item.text : "";
						agentMessages.count += 1;
						agentMessages.total_chars += text.length;
						agentMessages.texts.push(text);
						tools.by_type.agent_message += 1;
					}
					break;
				}

				const command = typeof item.command === "string" ? item.command : "";
				const exitCode = parseInteger(item.exit_code);
				const status =
					typeof item.status === "string" ? item.status : "unknown";
				const type = classifyCommand(command);
				const retry = /retry/i.test(status);
				const call = {
					command,
					exit_code: exitCode,
					status,
					type,
					duration_ms: index + 1,
				};
				tools.total_calls += 1;
				tools.by_type[type] += 1;
				if (exitCode !== null && exitCode !== 0) {
					tools.error_count += 1;
				}
				if (retry) {
					tools.retry_count += 1;
				}
				tools.calls.push(call);
				break;
			}
			case "agent_message": {
				const text = typeof parsed.text === "string" ? parsed.text : "";
				agentMessages.count += 1;
				agentMessages.total_chars += text.length;
				agentMessages.texts.push(text);
				tools.by_type.agent_message += 1;
				break;
			}
		}
	}

	if (tools.total_calls > 0) {
		const successful = tools.total_calls - tools.error_count;
		tools.success_rate = Number((successful / tools.total_calls).toFixed(4));
	}

	const metaPlanningDetected = agentMessages.texts.some((text) => {
		const lower = text.toLowerCase();
		return META_PLANNING_PHRASES.some((phrase) => lower.includes(phrase));
	});

	const taskCompleted = turnCompleted && tools.error_count === 0;
	return {
		tokens,
		timing: { wall_clock_ms: 0 },
		tools,
		effectiveness: {
			task_completed: taskCompleted,
			error_count: tools.error_count,
			retry_count: tools.retry_count,
		},
		plan_quality: {
			meta_planning_detected: metaPlanningDetected,
			direct_execution: !metaPlanningDetected,
		},
		agent_messages: agentMessages,
		turn_completed: turnCompleted,
	};
}
