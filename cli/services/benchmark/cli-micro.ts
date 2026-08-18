import { resolve } from "node:path";
import { boundedSpawn, spawnFailureDetail } from "../../core/subprocess";
import { resolveAfolExecutable } from "../../validate/scenario-execution";
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

export type CliMicroThresholds = {
	max_wall_clock_ms: number;
	max_output_tokens: number;
};

export type CliMicroInvocation = {
	command: string;
	args: string[];
};

export const CLI_MICRO_THRESHOLDS: CliMicroThresholds = {
	max_wall_clock_ms: 60_000,
	max_output_tokens: 10_000,
};

const CLI_MICRO_OUTPUT_WARNING_TOKENS = 5_000;

const MICRO_COMMANDS: string[][] = [
	["status"],
	["validate", "project", "--json"],
	["rule"],
	["-h"],
	["session", "list"],
	["catchup"],
	["preflight", "test"],
];

/**
 * Resolve the AFOL process that owns this benchmark. Compiled builds must
 * re-execute their current binary, while source runs must invoke Bun with the
 * source entrypoint. The repository's `afol` wrapper is POSIX shell-only.
 */
export function resolveCliMicroInvocation(
	mainPath = Bun.main,
	execPath = process.execPath,
): CliMicroInvocation {
	const executable = resolveAfolExecutable(undefined, mainPath, execPath);
	if (executable) return { command: executable, args: [] };
	return {
		command: execPath,
		args: [resolve(import.meta.dir, "..", "..", "main.ts")],
	};
}

export function collectCliMicroThresholdNotes(
	wallClockMs: number,
	estimatedOutputTokens: number,
	thresholds: CliMicroThresholds = CLI_MICRO_THRESHOLDS,
): string[] {
	const notes: string[] = [];
	if (wallClockMs > thresholds.max_wall_clock_ms) {
		notes.push(
			`threshold-exceeded:max_wall_clock_ms:${wallClockMs}>${thresholds.max_wall_clock_ms}`,
		);
	}
	if (estimatedOutputTokens > CLI_MICRO_OUTPUT_WARNING_TOKENS) {
		notes.push(`token-rule:non-ideal(>5k):${estimatedOutputTokens}tokens`);
	}
	if (estimatedOutputTokens > thresholds.max_output_tokens) {
		notes.push(
			`threshold-exceeded:max_output_tokens:${estimatedOutputTokens}>${thresholds.max_output_tokens}`,
		);
	}
	return notes;
}

export function runCliMicroBenchmark(
	root: string,
	thresholds: CliMicroThresholds = CLI_MICRO_THRESHOLDS,
	invocation: CliMicroInvocation = resolveCliMicroInvocation(),
): CliMicroResult[] {
	return MICRO_COMMANDS.map((args) => {
		const startedAt = Date.now();
		const result = boundedSpawn(
			invocation.command,
			[...invocation.args, ...args],
			{
				cwd: root,
				timeoutMs: 60_000,
			},
		);
		const wallClockMs = Date.now() - startedAt;
		const outputBytes =
			Buffer.byteLength(result.stdout, "utf8") +
			Buffer.byteLength(result.stderr, "utf8");
		const estimatedOutputTokens = Math.ceil(outputBytes / 4);
		const thresholdNotes = collectCliMicroThresholdNotes(
			wallClockMs,
			estimatedOutputTokens,
			thresholds,
		);
		const pass =
			result.ok &&
			!result.timedOut &&
			result.status === 0 &&
			!thresholdNotes.some((note) => note.startsWith("threshold-exceeded:"));
		return {
			command: "afol",
			args,
			exit_code: result.status,
			wall_clock_ms: wallClockMs,
			output_bytes: outputBytes,
			estimated_output_tokens: estimatedOutputTokens,
			status: pass ? "passed" : "failed",
			notes:
				result.ok && !result.timedOut && result.status === 0
					? thresholdNotes
					: [spawnFailureDetail(result), ...thresholdNotes],
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
