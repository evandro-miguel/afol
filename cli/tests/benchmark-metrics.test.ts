import { describe, expect, test } from "bun:test";
import { parseEventStream } from "../services/benchmark/metrics";
import type { EventStreamProfile } from "../services/benchmark/types";

const profile: EventStreamProfile = {
	harness: "fixture",
	version: "1",
	format: "codex-exec-v1",
	usage_mode: "cumulative",
	token_details: "included",
};

const events = (...values: unknown[]) =>
	values.map((value) => JSON.stringify(value));
const turn = (id: string, usage?: Record<string, unknown>) => ({
	type: "turn.completed",
	id,
	usage,
});
const command = (id: string, exit_code: number | null = 0) => ({
	type: "item.completed",
	item: {
		id,
		type: "command_execution",
		command: "bun test",
		exit_code,
		status: "completed",
	},
});

describe("benchmark observed metrics", () => {
	test("preserves cache-write usage reported by Codex CLI 0.155.1", () => {
		const result = parseEventStream(
			events(
				turn("live-shape", {
					input_tokens: 288443,
					cached_input_tokens: 252416,
					cache_write_input_tokens: 0,
					output_tokens: 1567,
					reasoning_output_tokens: 351,
				}),
			),
		);
		expect(result.tokens.cache_write).toBe(0);
		expect(result.tokens.total).toBe(290010);
		expect(result.issues).toEqual([]);
	});

	test("rejects conflicting cache-write aliases and details above input", () => {
		for (const usage of [
			{ cache_write_input_tokens: 0, cache_creation_input_tokens: 3 },
			{ cache_write_input_tokens: 11 },
		]) {
			const result = parseEventStream(
				events(
					turn("bad-cache", {
						input_tokens: 10,
						output_tokens: 2,
						...usage,
					}),
				),
			);
			expect(result.tokens.total).toBeNull();
			expect(result.issues.length).toBeGreaterThan(0);
		}
	});

	test("does not invent timing, usage or acceptance from an empty completed turn", () => {
		const result = parseEventStream(events(turn("t1")));
		expect(result.effectiveness.task_completed).toBe(false);
		expect(result.tokens.input).toBeNull();
		expect(result.tokens.total).toBeNull();
		expect(result.timing.wall_clock_ms).toBeNull();
		expect(result.tools.success_rate).toBeNull();
	});

	test("sums per-turn usage without double-counting cache and reasoning details", () => {
		const result = parseEventStream(
			events(
				turn("t1", {
					input_tokens: 100,
					cached_input_tokens: 40,
					output_tokens: 20,
					reasoning_output_tokens: 5,
				}),
				turn("t2", {
					input_tokens: 50,
					cached_input_tokens: 10,
					output_tokens: 10,
					reasoning_output_tokens: 2,
				}),
			),
		);
		expect(result.tokens).toMatchObject({
			input: 150,
			cached_input: 50,
			output: 30,
			reasoning_output: 7,
			total: 180,
		});
	});

	test("deduplicates identified events and completed tool items", () => {
		const usage = turn("t1", { input_tokens: 100, output_tokens: 20 });
		const call = command("tool1", 1);
		const result = parseEventStream(events(call, call, usage, usage));
		expect(result.tools.total_calls).toBe(1);
		expect(result.tools.error_count).toBe(1);
		expect(result.tokens.total).toBe(120);
	});

	test("keeps messages outside tool totals and includes MCP and file edits", () => {
		const result = parseEventStream(
			events(
				command("tool1"),
				{
					type: "item.completed",
					item: {
						id: "tool2",
						type: "mcp_tool_call",
						server: "local",
						tool: "read_file",
						status: "completed",
					},
				},
				{
					type: "item.completed",
					item: {
						id: "tool3",
						type: "file_change",
						status: "completed",
						changes: [{ path: "src/a.ts", kind: "update" }],
					},
				},
				{
					type: "item.completed",
					item: { id: "msg1", type: "agent_message", text: "Done" },
				},
			),
		);
		expect(result.tools.total_calls).toBe(3);
		expect(Object.values(result.tools.by_type).reduce((a, b) => a + b, 0)).toBe(
			3,
		);
		expect(result.agent_messages.count).toBe(1);
		expect(result.tools.calls.every((call) => call.duration_ms === null)).toBe(
			true,
		);
	});

	test("measures a paired tool duration using timestamps instead of line positions", () => {
		const result = parseEventStream(
			events(
				{
					type: "item.started",
					timestamp: "2026-09-21T12:00:00.000Z",
					item: { id: "tool1", type: "command_execution" },
				},
				{ ...command("tool1"), timestamp: "2026-09-21T12:00:00.125Z" },
			),
		);
		expect(result.tools.calls[0]?.duration_ms).toBe(125);
	});

	test("does not treat an unknown command exit as a success", () => {
		const result = parseEventStream(events(command("tool1", null)));
		expect(result.tools.success_rate).toBeNull();
	});

	test("uses the last cumulative snapshot rather than summing snapshots", () => {
		const result = parseEventStream(
			events(
				turn("t1", { input_tokens: 100, output_tokens: 20 }),
				turn("t2", { input_tokens: 150, output_tokens: 30 }),
			),
			profile,
		);
		expect(result.tokens.total).toBe(180);
		expect(result.source).toEqual(profile);
	});

	test("supports explicitly exclusive token categories without guessing missing details", () => {
		const result = parseEventStream(
			events(
				turn("t1", {
					input_tokens: 60,
					cached_input_tokens: 30,
					cache_creation_input_tokens: 10,
					output_tokens: 15,
					reasoning_output_tokens: 5,
				}),
			),
			{ ...profile, token_details: "exclusive" },
		);
		expect(result.tokens.total).toBe(120);
		expect(
			parseEventStream(
				events(turn("t1", { input_tokens: 60, output_tokens: 15 })),
				{ ...profile, token_details: "exclusive" },
			).tokens.total,
		).toBeNull();
	});

	test("keeps a missing delta unknown instead of reporting a partial total", () => {
		const result = parseEventStream(
			events(turn("t1"), turn("t2", { input_tokens: 50, output_tokens: 10 })),
		);
		expect(result.tokens.total).toBeNull();
	});

	test("rejects corrupt usage and conflicting duplicates as measurement evidence", () => {
		for (const value of [-1, 0.5, "100"]) {
			const result = parseEventStream(
				events(turn("t1", { input_tokens: value, output_tokens: 10 })),
			);
			expect(result.tokens.total).toBeNull();
			expect(result.issues).toContain("invalid-token-count");
		}
		const conflict = parseEventStream(
			events(
				turn("t1", { input_tokens: 10, output_tokens: 5 }),
				turn("t1", { input_tokens: 100, output_tokens: 50 }),
			),
		);
		expect(conflict.tokens.total).toBeNull();
		expect(conflict.issues).toContain("conflicting-event-id");
	});

	test("marks decreasing cumulative snapshots and invalid overlap unknown", () => {
		const decreasing = parseEventStream(
			events(
				turn("t1", { input_tokens: 100, output_tokens: 20 }),
				turn("t2", { input_tokens: 50, output_tokens: 10 }),
			),
			profile,
		);
		expect(decreasing.issues).toContain("decreasing-cumulative-usage");
		expect(decreasing.tokens.total).toBeNull();
		const overlap = parseEventStream(
			events(
				turn("t1", {
					input_tokens: 10,
					cached_input_tokens: 20,
					output_tokens: 5,
				}),
			),
		);
		expect(overlap.issues).toContain("token-detail-exceeds-total");
	});

	test("tracks recovered tool failures separately from delivery and explicit retries", () => {
		const result = parseEventStream(
			events(
				command("first", 1),
				{
					type: "item.completed",
					item: { ...command("retry").item, retry_of: "first" },
				},
				turn("t1"),
			),
		);
		expect(result.tools.success_rate).toBe(0.5);
		expect(result.tools.retry_count).toBe(1);
		expect(result.effectiveness.task_completed).toBe(false);
		expect(result.plan_quality).toBeNull();
	});

	test("uses observed run timing and rejects unsupported adapter versions", () => {
		const result = parseEventStream(
			events(
				{ type: "run.started", timestamp: "2026-09-21T12:00:00Z" },
				{ type: "run.completed", timestamp: "2026-09-21T12:00:02Z" },
			),
		);
		expect(result.timing.wall_clock_ms).toBe(2000);
		expect(() =>
			parseEventStream([], {
				...profile,
				format: "future",
			} as unknown as EventStreamProfile),
		).toThrow("unsupported-event-profile");
	});
});
