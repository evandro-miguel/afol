import { boundedSpawn } from "../core/subprocess";
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
	"evolution-core": [
		{ command: ["bun", "run", "typecheck"] },
		{
			command: [
				"bun",
				"test",
				"cli/tests/evolution-core.test.ts",
				"cli/tests/evolve-command.test.ts",
				"cli/tests/evolution-legacy-migration.test.ts",
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
	parseFailed?: boolean;
}

export type ValidationCommandSummary = {
	passed: number;
	failed: number;
};

export type ValidationCommandRun = {
	commandResults: ValidationCommandResult[];
	summary: ValidationCommandSummary;
};

type ValidationCommandOutcome = {
	commandResult: ValidationCommandResult;
	countsAsPassed: boolean;
};

function parseValidationCommandReport(
	stdout: string | undefined,
	expectsJsonReport: boolean,
): ValidationCommandReport {
	if (stdout === undefined || stdout === "") {
		return expectsJsonReport ? { parseFailed: true } : {};
	}
	try {
		const payload = JSON.parse(stdout) as unknown;
		if (
			typeof payload !== "object" ||
			payload === null ||
			Array.isArray(payload)
		) {
			return expectsJsonReport ? { parseFailed: true } : {};
		}
		const reportPayload = payload as Record<string, unknown>;
		const report: ValidationCommandReport = {};
		if (typeof reportPayload.status === "string") {
			report.reportedStatus = reportPayload.status;
		}
		if (typeof reportPayload.pass === "boolean") {
			report.reportedPass = reportPayload.pass;
		}
		return report;
	} catch {
		return expectsJsonReport ? { parseFailed: true } : {};
	}
}

function expectsJsonReport(command: readonly string[]): boolean {
	return command.includes("--json");
}

function isValidationCommandPassing(
	result: {
		ok: boolean;
		status: number | null;
		signal: NodeJS.Signals | null;
		timedOut: boolean;
	},
	report: ValidationCommandReport,
): boolean {
	return (
		result.ok &&
		!result.timedOut &&
		result.status === 0 &&
		!result.signal &&
		!report.parseFailed &&
		report.reportedPass !== false &&
		report.reportedStatus !== "failed"
	);
}

// Test seam: allows tests to replace boundedSpawn for deterministic timeout/spy coverage.
let boundedSpawnImpl = boundedSpawn;
export function setBoundedSpawnForTests(
	impl: typeof boundedSpawn | null,
): void {
	boundedSpawnImpl = impl ?? boundedSpawn;
}

function runPackCommand(
	projectRoot: string,
	packId: PackId,
	spec: ValidationCommandSpec,
): ValidationCommandOutcome {
	const startedAt = performance.now();
	const [command, ...args] = spec.command;
	if (!command) {
		throw new Error(`Empty validation command for pack: ${packId}`);
	}
	const result = boundedSpawnImpl(command, args, {
		cwd: projectRoot,
		timeoutMs: 120_000,
	});
	const durationMs = Math.round(performance.now() - startedAt);
	const report = parseValidationCommandReport(
		result.stdout,
		expectsJsonReport(spec.command),
	);
	const passed = isValidationCommandPassing(result, report);
	const commandResult: ValidationCommandResult = {
		pack_id: packId,
		command: spec.command,
		status: passed ? "passed" : "failed",
		exit_code: result.status,
		signal: result.timedOut ? "SIGKILL" : result.signal,
		duration_ms: durationMs,
		stdout_tail: outputTail(result.stdout),
		stderr_tail: outputTail(
			result.spawnError ?? (result.timedOut ? "timed out" : result.stderr),
		),
	};
	if (report.reportedStatus !== undefined) {
		commandResult.reported_status = report.reportedStatus;
	}
	if (report.reportedPass !== undefined) {
		commandResult.reported_pass = report.reportedPass;
	}
	return {
		commandResult,
		countsAsPassed: passed,
	};
}

function summarizeValidationCommandResults(
	commandOutcomes: ValidationCommandOutcome[],
): ValidationCommandSummary {
	let passed = 0;
	let failed = 0;
	for (const entry of commandOutcomes) {
		if (entry.countsAsPassed) {
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
	const commandOutcomes: ValidationCommandOutcome[] = [];
	const commandResults: ValidationCommandResult[] = [];
	for (const packId of selectedPacks) {
		const specs = VALIDATION_COMMANDS_BY_PACK[packId];
		if (!specs || specs.length === 0) {
			// A selected pack with zero command specs cannot pass as zero coverage.
			const noopResult: ValidationCommandResult = {
				pack_id: packId,
				command: [],
				status: "failed",
				exit_code: null,
				signal: null,
				duration_ms: 0,
				stdout_tail: "",
				stderr_tail: `no commands defined for pack: ${packId}`,
			};
			commandOutcomes.push({
				commandResult: noopResult,
				countsAsPassed: false,
			});
			commandResults.push(noopResult);
			continue;
		}
		for (const spec of specs) {
			const outcome = runPackCommand(projectRoot, packId, spec);
			commandOutcomes.push(outcome);
			commandResults.push(outcome.commandResult);
		}
	}
	return {
		commandResults,
		summary: summarizeValidationCommandResults(commandOutcomes),
	};
}
