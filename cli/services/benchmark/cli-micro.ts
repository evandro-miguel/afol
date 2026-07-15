import { join } from "node:path";
import { boundedSpawn, spawnFailureDetail } from "../../core/subprocess";
import { DEFAULT_CLI_PACK_ID } from "./types";

export type CliMicroResult = {
	command: string;
	args: string[];
	exit_code: number | null;
	wall_clock_ms: number;
	output_bytes: number;
	estimated_output_tokens: number;
	status: "passed" | "failed";
	notes: string[];
};

const MICRO_COMMANDS: string[][] = [
	["status"],
	["validate", "project", "--json"],
	["rule"],
	["-h"],
	["session", "list"],
	["catchup"],
	["preflight", "test"],
];

export function runCliMicroBenchmark(root: string): CliMicroResult[] {
	const afolPath = join(root, "afol");
	return MICRO_COMMANDS.map((args) => {
		const startedAt = Date.now();
		const result = boundedSpawn(afolPath, args, {
			cwd: root,
			timeoutMs: 60_000,
		});
		const wallClockMs = Date.now() - startedAt;
		const outputBytes = Buffer.byteLength(result.stdout, "utf8");
		const pass = result.ok && !result.timedOut && result.status === 0;
		return {
			command: "afol",
			args,
			exit_code: result.status,
			wall_clock_ms: wallClockMs,
			output_bytes: outputBytes,
			estimated_output_tokens: Math.ceil(outputBytes / 4),
			status: pass ? "passed" : "failed",
			notes: pass ? [] : [spawnFailureDetail(result)],
		};
	});
}

export function summarizeCliMicro(results: CliMicroResult[]): {
	pack_id: typeof DEFAULT_CLI_PACK_ID;
	total_wall_clock_ms: number;
	total_output_bytes: number;
	total_estimated_output_tokens: number;
	passed: number;
	failed: number;
} {
	let totalWallClockMs = 0;
	let totalOutputBytes = 0;
	let totalTokens = 0;
	let passed = 0;
	let failed = 0;
	for (const result of results) {
		totalWallClockMs += result.wall_clock_ms;
		totalOutputBytes += result.output_bytes;
		totalTokens += result.estimated_output_tokens;
		if (result.status === "passed") {
			passed += 1;
		} else {
			failed += 1;
		}
	}
	return {
		pack_id: DEFAULT_CLI_PACK_ID,
		total_wall_clock_ms: totalWallClockMs,
		total_output_bytes: totalOutputBytes,
		total_estimated_output_tokens: totalTokens,
		passed,
		failed,
	};
}
