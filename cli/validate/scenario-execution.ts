import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	accessSync,
	existsSync,
	constants as fsConstants,
	lstatSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { outputTail } from "./output";
import type { Scenario } from "./types";

const BENCH_SAMPLES = 3;
const BENCH_WARMUP_SAMPLES = 1;
const REAL_REPO_ROOT = resolve(import.meta.dir, "..", "..");
const SANDBOX_COPY_EXCLUDES = [".git", "node_modules", "dist", ".bun-build*"];
const RUNTIME_STATE_GUARD_PATHS = [
	".afol/state",
	".afol/data/events",
	".afol/data/index",
	".afol/data/mutations",
	".afol/pstr",
	".afol/wb/.active_session",
	".afol/wb/session-context.json",
] as const;

interface CommandInvocation {
	command: string;
	args: string[];
}

interface ScenarioSampleRun {
	duration_ms: number;
	exit_code: number | null;
	signal: string | null;
	spawn_error: string | null;
	stdout: string;
	stderr: string;
}

interface ScenarioExecutionMetrics {
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
	tool_call_count: number;
	tool_success_rate: number;
}

interface ScenarioExecutionResult {
	metrics: ScenarioExecutionMetrics;
	notes: string[];
	passed: boolean;
}

interface PorcelainStateEntry {
	status: string;
	path: string;
	fingerprint: string;
}

interface RuntimeStateEntry {
	path: string;
	fingerprint: string;
}

function scenarioSamplePassed(
	sample: ScenarioSampleRun,
	expectedExit: number | undefined,
): boolean {
	return (
		sample.exit_code === (expectedExit ?? 0) &&
		!sample.signal &&
		!sample.spawn_error
	);
}

function tokenizeCommand(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaping = false;
	for (const char of command.trim()) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (escaping || quote) {
		throw new Error(`Invalid scenario command: ${command}`);
	}
	if (current.length > 0) {
		tokens.push(current);
	}
	return tokens;
}

function resolveScenarioInvocation(
	repoRoot: string,
	projectRoot: string,
	command: string,
	preferLocalWrapper = true,
): CommandInvocation {
	const tokens = tokenizeCommand(command);
	if (tokens.length === 0) {
		throw new Error("Empty scenario command");
	}
	return resolveCommandInvocation(
		repoRoot,
		projectRoot,
		tokens,
		preferLocalWrapper,
	);
}

function resolveCommandInvocation(
	repoRoot: string,
	projectRoot: string,
	tokens: string[],
	preferLocalWrapper: boolean,
): CommandInvocation {
	const program = tokens[0];
	if (program === undefined) {
		throw new Error("Empty command tokens");
	}
	const args = tokens.slice(1);
	if (program === "afol" || program === "a") {
		if (!preferLocalWrapper) {
			return {
				command: "bun",
				args: ["run", join(repoRoot, "cli", "main.ts"), ...args],
			};
		}
		const afolPath = join(projectRoot, "afol");
		try {
			accessSync(afolPath, fsConstants.X_OK);
			return { command: afolPath, args };
		} catch {
			return {
				command: "bun",
				args: ["run", join(repoRoot, "cli", "main.ts"), ...args],
			};
		}
	}
	return { command: program, args };
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function createSandboxRoot(projectRoot: string): string {
	const sandboxRoot = mkdtempSync(join(tmpdir(), "afol-bench-sandbox-"));
	const excludeFlags = SANDBOX_COPY_EXCLUDES.map(
		(entry) => `--exclude ${shellQuote(entry)}`,
	).join(" ");
	const exportCommand = [
		"set -euo pipefail;",
		`tar -C ${shellQuote(projectRoot)} ${excludeFlags} -cf - . | tar -C ${shellQuote(sandboxRoot)} -xf -`,
	].join(" ");
	const exportResult = spawnSync("bash", ["-lc", exportCommand], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (exportResult.status !== 0 || exportResult.signal || exportResult.error) {
		throw new Error(
			`Sandbox copy export failed: ${outputTail(
				String((exportResult.stderr ?? exportResult.error?.message) || "tar"),
			)}`,
		);
	}
	const projectNodeModules = join(projectRoot, "node_modules");
	if (existsSync(projectNodeModules)) {
		symlinkSync(projectNodeModules, join(sandboxRoot, "node_modules"), "dir");
	}
	return sandboxRoot;
}

function gitStatusPorcelain(projectRoot: string): {
	ok: boolean;
	output: string;
} {
	const result = spawnSync("git", ["status", "--porcelain"], {
		cwd: projectRoot,
		encoding: "utf8",
	});
	return {
		ok: result.status === 0 && !result.signal && !result.error,
		output: (result.stdout ?? "").toString().trimEnd(),
	};
}

function porcelainEntries(
	porcelain: string,
): Array<{ status: string; path: string }> {
	const entries: Array<{ status: string; path: string }> = [];
	for (const line of porcelain.split(/\r?\n/)) {
		if (!line.trim()) {
			continue;
		}
		const status = line.slice(0, 2);
		const pathPart = line.length > 3 ? line.slice(3).trim() : line.trim();
		const path = pathPart.includes(" -> ")
			? pathPart.slice(pathPart.lastIndexOf(" -> ") + 4)
			: pathPart;
		if (path.length > 0) {
			entries.push({ status, path });
		}
	}
	return entries;
}

function porcelainEntryKey(entry: { status: string; path: string }): string {
	return `${entry.status} ${entry.path}`;
}

function errorCode(error: unknown): string {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as { code?: unknown }).code ?? "unknown")
		: "unknown";
}

function hashFile(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashPath(path: string): string {
	try {
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) {
			return `symlink:${readlinkSync(path)}`;
		}
		if (stat.isFile()) {
			return `file:${hashFile(path)}`;
		}
		if (stat.isDirectory()) {
			const hash = createHash("sha256");
			hash.update("dir");
			for (const name of readdirSync(path).sort()) {
				if (name === ".git") {
					continue;
				}
				hash.update("\0");
				hash.update(name);
				hash.update("\0");
				hash.update(hashPath(join(path, name)));
			}
			return `dir:${hash.digest("hex")}`;
		}
		return `other:${stat.mode}:${stat.size}:${Math.trunc(stat.mtimeMs)}`;
	} catch (error) {
		return `unavailable:${errorCode(error)}`;
	}
}

function porcelainState(
	projectRoot: string,
	porcelain: string,
): PorcelainStateEntry[] {
	return porcelainEntries(porcelain).map((entry) => ({
		...entry,
		fingerprint: hashPath(join(projectRoot, entry.path)),
	}));
}

function runtimeStateSnapshot(projectRoot: string): RuntimeStateEntry[] {
	return RUNTIME_STATE_GUARD_PATHS.map((path) => ({
		path,
		fingerprint: hashPath(join(projectRoot, path)),
	}));
}

function equivalentRuntimeState(
	before: RuntimeStateEntry[],
	after: RuntimeStateEntry[],
): boolean {
	const beforeByPath = new Map(before.map((entry) => [entry.path, entry]));
	const afterByPath = new Map(after.map((entry) => [entry.path, entry]));
	if (beforeByPath.size !== afterByPath.size) {
		return false;
	}
	for (const [path, beforeEntry] of beforeByPath) {
		const afterEntry = afterByPath.get(path);
		if (!afterEntry || afterEntry.fingerprint !== beforeEntry.fingerprint) {
			return false;
		}
	}
	return true;
}

function runtimeChangedPaths(
	before: RuntimeStateEntry[],
	after: RuntimeStateEntry[],
): string[] {
	const beforeByPath = new Map(before.map((entry) => [entry.path, entry]));
	const afterByPath = new Map(after.map((entry) => [entry.path, entry]));
	const changedPaths = new Set<string>();
	for (const [path, afterEntry] of afterByPath) {
		const beforeEntry = beforeByPath.get(path);
		if (!beforeEntry || beforeEntry.fingerprint !== afterEntry.fingerprint) {
			changedPaths.add(path);
		}
	}
	for (const path of beforeByPath.keys()) {
		if (!afterByPath.has(path)) {
			changedPaths.add(path);
		}
	}
	return [...changedPaths];
}

function equivalentPorcelainState(
	before: PorcelainStateEntry[],
	after: PorcelainStateEntry[],
): boolean {
	const beforeByKey = new Map(
		before.map((entry) => [porcelainEntryKey(entry), entry]),
	);
	const afterByKey = new Map(
		after.map((entry) => [porcelainEntryKey(entry), entry]),
	);
	if (beforeByKey.size !== afterByKey.size) {
		return false;
	}
	for (const [key, beforeEntry] of beforeByKey) {
		const afterEntry = afterByKey.get(key);
		if (!afterEntry || afterEntry.fingerprint !== beforeEntry.fingerprint) {
			return false;
		}
	}
	return true;
}

function porcelainChangedPaths(
	before: PorcelainStateEntry[],
	after: PorcelainStateEntry[],
): string[] {
	const beforeByKey = new Map(
		before.map((entry) => [porcelainEntryKey(entry), entry]),
	);
	const afterByKey = new Map(
		after.map((entry) => [porcelainEntryKey(entry), entry]),
	);
	const changedPaths = new Set<string>();
	for (const [key, afterEntry] of afterByKey) {
		const beforeEntry = beforeByKey.get(key);
		if (!beforeEntry || beforeEntry.fingerprint !== afterEntry.fingerprint) {
			changedPaths.add(afterEntry.path);
		}
	}
	for (const [key, beforeEntry] of beforeByKey) {
		if (!afterByKey.has(key)) {
			changedPaths.add(beforeEntry.path);
		}
	}
	return [...changedPaths];
}

function cleanupGitStatusDiff(
	projectRoot: string,
	before: string,
	after: string,
): void {
	const beforeLines = new Set(porcelainEntries(before).map(porcelainEntryKey));
	for (const entry of porcelainEntries(after)) {
		const line = porcelainEntryKey(entry);
		if (beforeLines.has(line)) {
			continue;
		}
		if (entry.status === "??") {
			rmSync(join(projectRoot, entry.path), { recursive: true, force: true });
			continue;
		}
		spawnSync("git", ["restore", "--worktree", "--staged", "--", entry.path], {
			cwd: projectRoot,
			encoding: "utf8",
		});
	}
}

function percentile(values: number[], ratio: number): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((left, right) => left - right);
	if (sorted.length === 1) {
		return sorted[0] ?? 0;
	}
	const position = (sorted.length - 1) * ratio;
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	const lower = sorted[lowerIndex] ?? 0;
	const upper = sorted[upperIndex] ?? lower;
	if (lowerIndex === upperIndex) {
		return lower;
	}
	return lower + (upper - lower) * (position - lowerIndex);
}

function runScenarioSample(
	projectRoot: string,
	invocation: CommandInvocation,
): ScenarioSampleRun {
	const startedAt = performance.now();
	const result = spawnSync(invocation.command, invocation.args, {
		cwd: projectRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
	return {
		duration_ms: durationMs,
		exit_code: result.status,
		signal: result.signal,
		spawn_error: result.error ? result.error.message : null,
		stdout: result.stdout ?? "",
		stderr: result.error ? result.error.message : (result.stderr ?? ""),
	};
}

function coerceMetrics(
	metrics: Record<string, number>,
): ScenarioExecutionMetrics {
	return {
		duration_ms: metrics.duration_ms ?? 0,
		timing_p50_ms: metrics.timing_p50_ms ?? metrics.duration_ms ?? 0,
		timing_p95_ms: metrics.timing_p95_ms ?? metrics.duration_ms ?? 0,
		error_count: metrics.error_count ?? 0,
		retry_count: metrics.retry_count ?? 0,
		context_tokens: metrics.context_tokens ?? 0,
		prompt_tokens: metrics.prompt_tokens ?? 0,
		output_tokens: metrics.output_tokens ?? 0,
		context_bytes: metrics.context_bytes ?? 0,
		output_bytes: metrics.output_bytes ?? 0,
		tool_call_count: metrics.tool_call_count ?? 1,
		tool_success_rate: metrics.tool_success_rate ?? 1,
	};
}

function isCommandSuccess(sample: ScenarioSampleRun): boolean {
	return !sample.signal && !sample.spawn_error && sample.exit_code === 0;
}

function buildSampleMetrics(
	sample: ScenarioSampleRun,
	passed: boolean,
): ScenarioExecutionMetrics {
	const outputBytes = Buffer.byteLength(sample.stdout, "utf8");
	return {
		duration_ms: sample.duration_ms,
		timing_p50_ms: sample.duration_ms,
		timing_p95_ms: sample.duration_ms,
		error_count: passed ? 0 : 1,
		retry_count: 0,
		context_tokens: 0,
		prompt_tokens: 0,
		output_tokens: Math.round(outputBytes / 4),
		context_bytes: 0,
		output_bytes: outputBytes,
		tool_call_count: 1,
		tool_success_rate: passed ? 1 : 0,
	};
}

function runSandboxScenarioCommand(
	projectRoot: string,
	scenario: Scenario,
	command: string,
): ScenarioExecutionResult {
	const expectedExit = scenario.expected_exit;
	let sandboxRoot: string | null = null;
	try {
		sandboxRoot = createSandboxRoot(projectRoot);
		for (const [index, setupCommand] of (scenario.setup ?? []).entries()) {
			if (setupCommand.length === 0) {
				throw new Error("Empty setup command");
			}
			const setupInvocation = resolveCommandInvocation(
				REAL_REPO_ROOT,
				sandboxRoot,
				setupCommand,
				false,
			);
			const setupSample = runScenarioSample(sandboxRoot, setupInvocation);
			if (!isCommandSuccess(setupSample)) {
				return {
					metrics: coerceMetrics(scenario.deterministic_metrics),
					notes: [`setup-failed:${index}:${setupSample.exit_code ?? "null"}`],
					passed: false,
				};
			}
		}
		const invocation = resolveScenarioInvocation(
			REAL_REPO_ROOT,
			sandboxRoot,
			command,
			false,
		);
		const sample = runScenarioSample(sandboxRoot, invocation);
		const passed = scenarioSamplePassed(sample, expectedExit);
		return {
			metrics: buildSampleMetrics(sample, passed),
			notes: buildSandboxNotes(sample, passed, expectedExit),
			passed,
		};
	} finally {
		if (sandboxRoot) {
			rmSync(sandboxRoot, { recursive: true, force: true });
		}
	}
}

function buildSandboxNotes(
	sample: ScenarioSampleRun,
	passed: boolean,
	expectedExit: number | undefined,
): string[] {
	if (!passed) {
		return [
			`sample-failed:1:exit=${sample.exit_code ?? "null"}:stderr=${outputTail((sample.spawn_error ?? sample.stderr) || sample.stdout)}`,
		];
	}
	return typeof expectedExit === "number"
		? [`expected-exit-honored:${expectedExit}`]
		: [];
}

export function runScenarioCommand(
	projectRoot: string,
	scenario: Scenario,
): ScenarioExecutionResult {
	const command =
		typeof scenario.command === "string" ? scenario.command.trim() : "";
	if (command.length === 0) {
		throw new Error("Scenario command is required for execution");
	}
	console.error(
		`bench: running ${scenario.pack_id}/${scenario.scenario_id} ...`,
	);
	if (scenario.sandbox) {
		return runSandboxScenarioCommand(projectRoot, scenario, command);
	}
	const expectedExit = scenario.expected_exit;
	const invocation = resolveScenarioInvocation(
		REAL_REPO_ROOT,
		projectRoot,
		command,
	);
	const gitStatusBefore = gitStatusPorcelain(projectRoot);
	const gitStateBefore = gitStatusBefore.ok
		? porcelainState(projectRoot, gitStatusBefore.output)
		: null;
	const runtimeStateBefore = runtimeStateSnapshot(projectRoot);
	let warmup = runScenarioSample(projectRoot, invocation);
	for (let index = 1; index < BENCH_WARMUP_SAMPLES; index += 1) {
		warmup = runScenarioSample(projectRoot, invocation);
	}
	const warmupNotes: string[] = [];
	if (!scenarioSamplePassed(warmup, expectedExit)) {
		warmupNotes.push(
			`warmup-failed:exit=${warmup.exit_code ?? "null"}:stderr=${outputTail((warmup.spawn_error ?? warmup.stderr) || warmup.stdout)}`,
		);
	}
	const samples: ScenarioSampleRun[] = [];
	for (let index = 0; index < BENCH_SAMPLES; index += 1) {
		samples.push(runScenarioSample(projectRoot, invocation));
	}
	const gitStatusAfter = gitStatusPorcelain(projectRoot);
	const gitStateAfter = gitStatusAfter.ok
		? porcelainState(projectRoot, gitStatusAfter.output)
		: null;
	const runtimeStateAfter = runtimeStateSnapshot(projectRoot);
	const sideEffectNotes: string[] = [];
	const leakedPaths = new Set<string>();
	const gitGuardUnavailable =
		!gitStatusBefore.ok ||
		!gitStatusAfter.ok ||
		!gitStateBefore ||
		!gitStateAfter;
	if (
		!gitGuardUnavailable &&
		!equivalentPorcelainState(gitStateBefore, gitStateAfter)
	) {
		const changedFiles = porcelainChangedPaths(gitStateBefore, gitStateAfter);
		for (const path of changedFiles) {
			leakedPaths.add(path);
		}
		cleanupGitStatusDiff(
			projectRoot,
			gitStatusBefore.output,
			gitStatusAfter.output,
		);
	}
	if (!equivalentRuntimeState(runtimeStateBefore, runtimeStateAfter)) {
		for (const path of runtimeChangedPaths(
			runtimeStateBefore,
			runtimeStateAfter,
		)) {
			leakedPaths.add(path);
		}
	}
	if (leakedPaths.size > 0) {
		sideEffectNotes.push(`side-effect-leak:${[...leakedPaths].join(",")}`);
	} else if (gitGuardUnavailable) {
		sideEffectNotes.push("side-effect-guard-unavailable");
	}
	const sampleFailureNotes = samples.flatMap((sample, index) => {
		if (scenarioSamplePassed(sample, expectedExit)) {
			return [];
		}
		return [
			`sample-failed:${index + 1}:exit=${sample.exit_code ?? "null"}:stderr=${outputTail((sample.spawn_error ?? sample.stderr) || sample.stdout)}`,
		];
	});
	const durations = samples.map((sample) => sample.duration_ms);
	const representativeSample =
		[...samples]
			.reverse()
			.find((sample) => Buffer.byteLength(sample.stdout, "utf8") > 0) ??
		samples[samples.length - 1] ??
		samples[0];
	const outputBytes = representativeSample
		? Buffer.byteLength(representativeSample.stdout, "utf8")
		: 0;
	const successfulSamples = samples.filter((sample) =>
		scenarioSamplePassed(sample, expectedExit),
	).length;
	const errorCount = samples.length - successfulSamples;
	const metrics: ScenarioExecutionMetrics = {
		duration_ms: Math.round(percentile(durations, 0.5)),
		timing_p50_ms: Math.round(percentile(durations, 0.5)),
		timing_p95_ms: Math.round(percentile(durations, 0.95)),
		error_count: errorCount,
		retry_count: 0,
		context_tokens: 0,
		prompt_tokens: 0,
		output_tokens: Math.round(outputBytes / 4),
		context_bytes: 0,
		output_bytes: outputBytes,
		tool_call_count: 1,
		tool_success_rate: Number((successfulSamples / BENCH_SAMPLES).toFixed(4)),
	};
	const passed =
		warmupNotes.length === 0 &&
		sampleFailureNotes.length === 0 &&
		sideEffectNotes.length === 0 &&
		errorCount === 0 &&
		gitStatusBefore.ok &&
		gitStatusAfter.ok;
	const executionNotes = [
		...warmupNotes,
		...sampleFailureNotes,
		...sideEffectNotes,
	];
	if (passed && typeof expectedExit === "number") {
		executionNotes.push(`expected-exit-honored:${expectedExit}`);
	}
	return {
		metrics,
		notes: executionNotes,
		passed,
	};
}
