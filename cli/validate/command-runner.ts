import { spawnSync } from "node:child_process";
import { outputTail } from "./output";
import type {
	PackId,
	ValidationCommandResult,
	ValidationCommandSpec,
} from "./types";

const VALIDATION_COMMANDS_BY_PACK: Record<PackId, ValidationCommandSpec[]> = {
	"cli-kernel-local": [
		{ command: ["bun", "run", "typecheck"] },
		{
			command: [
				"bun",
				"test",
				"cli/tests/kernel.test.ts",
				"cli/tests/validate-command.test.ts",
			],
		},
	],
	"routing-accuracy": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/kernel.test.ts",
				"cli/tests/rule-command.test.ts",
				"cli/tests/skill-command.test.ts",
			],
		},
	],
	"mutation-safety": [
		{ command: ["bun", "test", "cli/tests/mutation-safety.test.ts"] },
	],
	"update-safety": [
		{ command: ["bun", "test", "cli/tests/update-command.test.ts"] },
	],
	"workbench-parity": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/workbench-lifecycle.test.ts",
				"cli/tests/workbench-verify.test.ts",
				"cli/tests/log-command.test.ts",
				"cli/tests/verify-command.test.ts",
			],
		},
	],
	"mcp-parity": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"mcp-parity",
				"--json",
			],
		},
	],
	"runtime-live-agent": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"runtime-live-agent",
				"--json",
			],
		},
	],
	"token-economy": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"token-economy",
				"--json",
			],
		},
	],
	"pstr-integrity": [
		{ command: ["bun", "test", "cli/tests/pstr-schema-sweep.test.ts"] },
	],
	"context-bundles": [
		{ command: ["bun", "test", "cli/tests/context-system.test.ts"] },
	],
	"state-projection": [
		{ command: ["bun", "test", "cli/tests/state-command.test.ts"] },
	],
	"memory-governance": [
		{ command: ["bun", "test", "cli/tests/memory-command.test.ts"] },
	],
	"library-knowledge": [
		{ command: ["bun", "test", "cli/tests/library-system.test.ts"] },
	],
	"governance-history": [
		{ command: ["bun", "test", "cli/tests/spec-gate-system.test.ts"] },
	],
	"adm-governance": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/adm-paths.test.ts",
				"cli/tests/adm-plan.test.ts",
				"cli/tests/adm-migrate.test.ts",
			],
		},
	],
};

interface ValidationCommandReport {
	reportedStatus?: string;
	reportedPass?: boolean;
}

export type ValidationCommandSummary = {
	passed: number;
	failed: number;
};

export type ValidationCommandRun = {
	commandResults: ValidationCommandResult[];
	summary: ValidationCommandSummary;
};

function parseValidationCommandReport(
	stdout: string | undefined,
): ValidationCommandReport {
	if (stdout === undefined || stdout === "") {
		return {};
	}
	try {
		const payload = JSON.parse(stdout) as Record<string, unknown>;
		const report: ValidationCommandReport = {};
		if (typeof payload.status === "string") {
			report.reportedStatus = payload.status;
		}
		if (typeof payload.pass === "boolean") {
			report.reportedPass = payload.pass;
		}
		return report;
	} catch {
		return {};
	}
}

function isValidationCommandPassing(
	result: ReturnType<typeof spawnSync>,
	report: ValidationCommandReport,
): boolean {
	return (
		result.status === 0 &&
		!result.signal &&
		!result.error &&
		report.reportedPass !== false &&
		report.reportedStatus !== "failed"
	);
}

function runPackCommand(
	projectRoot: string,
	packId: PackId,
	spec: ValidationCommandSpec,
): ValidationCommandResult {
	const startedAt = performance.now();
	const [command, ...args] = spec.command;
	if (!command) {
		throw new Error(`Empty validation command for pack: ${packId}`);
	}
	const result = spawnSync(command, args, {
		cwd: projectRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const durationMs = Math.round(performance.now() - startedAt);
	const report = parseValidationCommandReport(result.stdout ?? "");
	const passed = isValidationCommandPassing(result, report);
	const commandResult: ValidationCommandResult = {
		pack_id: packId,
		command: spec.command,
		status: passed ? "passed" : "failed",
		exit_code: result.status,
		signal: result.signal,
		duration_ms: durationMs,
		stdout_tail: outputTail(result.stdout ?? ""),
		stderr_tail: outputTail(
			result.error ? result.error.message : (result.stderr ?? ""),
		),
	};
	if (report.reportedStatus !== undefined) {
		commandResult.reported_status = report.reportedStatus;
	}
	if (report.reportedPass !== undefined) {
		commandResult.reported_pass = report.reportedPass;
	}
	return commandResult;
}

function isInformationalBenchmarkCommand(command: readonly string[]): boolean {
	return (
		command[0] === "bun" &&
		command[1] === "run" &&
		command[3] === "v" &&
		command[4] === "bench"
	);
}

function summarizeValidationCommandResults(
	commandResults: ValidationCommandResult[],
): ValidationCommandSummary {
	let passed = 0;
	let failed = 0;
	for (const entry of commandResults) {
		const informationalBenchmark = isInformationalBenchmarkCommand(
			entry.command,
		);
		if (entry.status === "passed" || informationalBenchmark) {
			passed += 1;
		} else {
			failed += 1;
		}
	}
	return { passed, failed };
}

export function runValidationCommands(
	projectRoot: string,
	selectedPacks: PackId[],
): ValidationCommandRun {
	const commandResults: ValidationCommandResult[] = [];
	for (const packId of selectedPacks) {
		for (const spec of VALIDATION_COMMANDS_BY_PACK[packId] ?? []) {
			commandResults.push(runPackCommand(projectRoot, packId, spec));
		}
	}
	return {
		commandResults,
		summary: summarizeValidationCommandResults(commandResults),
	};
}
