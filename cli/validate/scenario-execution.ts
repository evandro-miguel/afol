import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import {
	accessSync,
	chmodSync,
	existsSync,
	constants as fsConstants,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmdirSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { cpus, arch as osArch, platform } from "node:os";
import { join, resolve } from "node:path";
import { boundedSpawn, spawnFailureDetail } from "../core/subprocess";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";
import { outputTail } from "./output";
import type { BenchmarkExecutionProfile, Scenario } from "./types";

const BENCH_SAMPLES = 3;
const BENCH_WARMUP_SAMPLES = 1;
export const RELEASE_BENCH_SAMPLES = 20;
export const RELEASE_BENCH_WARMUP_SAMPLES = 1;
const REAL_REPO_ROOT = resolve(import.meta.dir, "..", "..");
const SANDBOX_COPY_EXCLUDES = [
	".git",
	"node_modules",
	"dist",
	".bun-build*",
	".coverage",
	".afol/tmp",
];
const COMPLETION_LOCKS_ROOT = ".afol/wb/.locks";
const COMPLETION_LOCK_FILE_RE = /^completion-[a-f0-9]{64}\.lock(?:\.fence)?$/;
const RUNTIME_STATE_GUARD_PATHS = [
	".afol/state",
	".afol/data/events",
	".afol/data/index",
	".afol/data/mutations",
	".afol/pstr",
	".afol/wb/.active_session",
	".afol/wb/session-context.json",
] as const;

export function resolveScenarioSampleCount(
	scenario: Pick<Scenario, "pack_id">,
	requested?: number,
): number {
	const resolved =
		requested ??
		(scenario.pack_id === "mutation-safety"
			? RELEASE_BENCH_SAMPLES
			: BENCH_SAMPLES);
	if (
		!Number.isInteger(resolved) ||
		resolved < 1 ||
		(scenario.pack_id === "mutation-safety" && resolved < RELEASE_BENCH_SAMPLES)
	) {
		throw new Error(
			scenario.pack_id === "mutation-safety"
				? `release-benchmark-sample-count-required:${RELEASE_BENCH_SAMPLES}`
				: "benchmark-sample-count-invalid",
		);
	}
	return resolved;
}

export interface CommandInvocation {
	command: string;
	args: string[];
}

export interface ScenarioSampleRun {
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
	argv_chars?: number;
	tool_call_count: number;
	tool_success_rate: number;
	sample_count: number;
	warmup_count: number;
}

function argvCharCount(command: string): number {
	return Array.from(command.trim()).length;
}

export interface ScenarioExecutionResult {
	metrics: ScenarioExecutionMetrics;
	notes: string[];
	passed: boolean;
	profile: BenchmarkExecutionProfile;
	timestamp: string;
	git_commit: string;
}

export interface PreparedCompiledReleaseArtifact {
	binaryPath: string;
	profile: BenchmarkExecutionProfile;
	timestamp: string;
	git_commit: string;
	cleanup: () => void;
}

export interface ScenarioExecutionOptions {
	artifact?: PreparedCompiledReleaseArtifact;
	sampleCount?: number;
	warmupCount?: number;
	seams?: ScenarioExecutionSeams;
}

export type ScenarioSamplePhase = "setup" | "warmup" | "sample";

export interface ScenarioExecutionSeams {
	runSample?: (
		projectRoot: string,
		invocation: CommandInvocation,
		phase: ScenarioSamplePhase,
	) => ScenarioSampleRun;
	createSandboxRoot?: (projectRoot: string) => string;
	cleanupSandboxRoot?: (sandboxRoot: string) => void;
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

type CompletionLockEntryType =
	| "regular"
	| "directory"
	| "symlink"
	| "other"
	| "unavailable";

interface CompletionLockEntry {
	path: string;
	type: CompletionLockEntryType;
	identity?: string;
	fingerprint?: string;
	metadata?: CompletionLockMetadataSnapshot | null;
}

interface CompletionLockState {
	rootType: "missing" | "directory" | "symlink" | "other" | "unavailable";
	rootIdentity?: string;
	entries: CompletionLockEntry[];
}

interface CompletionLockMetadataSnapshot {
	pid: number;
	host: string;
	owner_token: string;
	generation: number;
	acquired_at: string;
	heartbeat_at: string;
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
	trustedAfolBinary?: string,
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
		trustedAfolBinary,
	);
}

function resolveCommandInvocation(
	repoRoot: string,
	projectRoot: string,
	tokens: string[],
	preferLocalWrapper: boolean,
	trustedAfolBinary?: string,
): CommandInvocation {
	const program = tokens[0];
	if (program === undefined) {
		throw new Error("Empty command tokens");
	}
	const args = tokens.slice(1);
	if (program === "afol" || program === "a") {
		if (trustedAfolBinary) {
			return { command: trustedAfolBinary, args };
		}
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

export function ensureBenchmarkTempRoot(projectRoot: string): string {
	const tempRoot = join(projectRoot, ".afol", "tmp");
	mkdirSync(tempRoot, { recursive: true });
	return tempRoot;
}

export function compiledReleaseBuildArgs(targetBinary: string): string[] {
	return [
		"build",
		"--compile",
		"--no-compile-autoload-dotenv",
		"--no-compile-autoload-bunfig",
		join(REAL_REPO_ROOT, "cli", "main.ts"),
		"--outfile",
		targetBinary,
	];
}

export function writeBenchmarkArtifactProvenance(
	targetBinary: string,
	artifactSha256: string,
	commitSha: string,
	generatedAt: string,
): string {
	const provenancePath = `${targetBinary}.provenance.json`;
	writeFileSync(
		provenancePath,
		`${JSON.stringify(
			{
				artifact: targetBinary,
				package_name: CLI_PACKAGE_NAME,
				version: CLI_VERSION,
				sha256: artifactSha256,
				generated_at: generatedAt,
				commit_sha: commitSha,
				build_command: `bun ${compiledReleaseBuildArgs(targetBinary).join(" ")}`,
				platform: process.platform,
				arch: process.arch,
				build_target: `bun-${process.platform}-${process.arch}`,
				compile_autoload_dotenv: false,
				compile_autoload_bunfig: false,
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	return provenancePath;
}

function createSandboxRoot(projectRoot: string): string {
	const sandboxRoot = mkdtempSync(
		join(ensureBenchmarkTempRoot(projectRoot), "afol-bench-sandbox-"),
	);
	const excludeFlags = SANDBOX_COPY_EXCLUDES.map(
		(entry) => `--exclude ${shellQuote(entry)}`,
	).join(" ");
	const exportCommand = [
		"set -euo pipefail;",
		`tar -C ${shellQuote(projectRoot)} ${excludeFlags} -cf - . | tar -C ${shellQuote(sandboxRoot)} -xf -`,
	].join(" ");
	const exportResult = boundedSpawn("bash", ["-lc", exportCommand], {
		timeoutMs: 120_000,
	});
	if (!exportResult.ok) {
		rmSync(sandboxRoot, { recursive: true, force: true });
		throw new Error(
			`Sandbox copy export failed: ${outputTail(spawnFailureDetail(exportResult))}`,
		);
	}
	const projectNodeModules = join(projectRoot, "node_modules");
	if (existsSync(projectNodeModules)) {
		symlinkSync(projectNodeModules, join(sandboxRoot, "node_modules"), "dir");
	}
	return sandboxRoot;
}

function controlledCpuClass(): string {
	const configured = process.env.AFOL_BENCH_CPU_CLASS?.trim();
	if (configured) return configured;
	const model = cpus()[0]?.model ?? "unknown-cpu";
	return model
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function gitCommit(projectRoot: string): string {
	const result = boundedSpawn("git", ["rev-parse", "HEAD"], {
		cwd: projectRoot,
		timeoutMs: 15_000,
	});
	return result.ok && result.stdout.trim() ? result.stdout.trim() : "unknown";
}

function executionProfile(
	executionMode: BenchmarkExecutionProfile["execution_mode"],
	artifactMode: BenchmarkExecutionProfile["artifact_mode"],
	artifactSha256: string,
): BenchmarkExecutionProfile {
	const os = platform();
	const arch = osArch();
	const cpuClass = controlledCpuClass();
	return {
		host_profile_id:
			process.env.AFOL_BENCH_HOST_PROFILE_ID?.trim() ||
			`${os}-${arch}-${cpuClass}`,
		os,
		arch,
		cpu_class: cpuClass,
		bun_version: Bun.version,
		runtime_version: Bun.version,
		execution_mode: executionMode,
		artifact_mode: artifactMode,
		artifact_sha256: artifactSha256,
	};
}

export function prepareCompiledReleaseArtifact(
	projectRoot: string,
): PreparedCompiledReleaseArtifact {
	const artifactParent = ensureBenchmarkTempRoot(projectRoot);
	const artifactRoot = mkdtempSync(join(artifactParent, "afol-bench-release-"));
	const targetBinary = join(artifactRoot, "afol");
	try {
		const versionResult = boundedSpawn("bun", ["run", "version:generate"], {
			cwd: REAL_REPO_ROOT,
			timeoutMs: 60_000,
		});
		if (!versionResult.ok) {
			throw new Error(
				`compiled-release-version:${outputTail(spawnFailureDetail(versionResult))}`,
			);
		}
		const result = boundedSpawn("bun", compiledReleaseBuildArgs(targetBinary), {
			cwd: REAL_REPO_ROOT,
			timeoutMs: 300_000,
		});
		if (!result.ok) {
			throw new Error(
				`compiled-release:${outputTail(spawnFailureDetail(result))}`,
			);
		}
		chmodSync(targetBinary, 0o755);
		const artifactSha256 = hashFile(targetBinary);
		const timestamp = new Date().toISOString();
		const commit = gitCommit(projectRoot);
		writeBenchmarkArtifactProvenance(
			targetBinary,
			artifactSha256,
			commit,
			timestamp,
		);
		return {
			binaryPath: targetBinary,
			profile: executionProfile(
				"compiled-release",
				"bun-compile",
				artifactSha256,
			),
			timestamp,
			git_commit: commit,
			cleanup: () => rmSync(artifactRoot, { recursive: true, force: true }),
		};
	} catch (error) {
		rmSync(artifactRoot, { recursive: true, force: true });
		throw error;
	}
}

export function executeScenarioPackWithArtifact<T>(
	projectRoot: string,
	scenarios: readonly Scenario[],
	execute: (
		scenario: Scenario,
		artifact: PreparedCompiledReleaseArtifact | undefined,
	) => T,
	prepare: (
		projectRoot: string,
	) => PreparedCompiledReleaseArtifact = prepareCompiledReleaseArtifact,
): T[] {
	const artifact = scenarios.some(
		(scenario) => scenario.compiled_binary === true,
	)
		? prepare(projectRoot)
		: undefined;
	try {
		return scenarios.map((scenario) =>
			execute(
				scenario,
				scenario.compiled_binary === true ? artifact : undefined,
			),
		);
	} finally {
		artifact?.cleanup();
	}
}

function gitStatusPorcelain(projectRoot: string): {
	ok: boolean;
	output: string;
} {
	const result = boundedSpawn(
		"git",
		["status", "--porcelain", "--untracked-files=all"],
		{
			cwd: projectRoot,
			timeoutMs: 15_000,
		},
	);
	return {
		ok: result.ok,
		output: result.stdout.trimEnd(),
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
		if (path.length > 0 && !isCompletionLockPath(path)) {
			entries.push({ status, path });
		}
	}
	return entries;
}

function isCompletionLockPath(path: string): boolean {
	const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
	return (
		normalized === COMPLETION_LOCKS_ROOT ||
		normalized.startsWith(`${COMPLETION_LOCKS_ROOT}/`)
	);
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

function statIdentity(stat: Stats): string {
	return `${stat.dev}:${stat.ino}`;
}

function expectedCompletionLockFile(path: string): "lock" | "fence" | null {
	const prefix = `${COMPLETION_LOCKS_ROOT}/`;
	if (!path.startsWith(prefix)) return null;
	const relativePath = path.slice(prefix.length);
	if (relativePath.includes("/") || !COMPLETION_LOCK_FILE_RE.test(relativePath))
		return null;
	return relativePath.endsWith(".lock.fence") ? "fence" : "lock";
}

function parseCompletionLockMetadata(
	raw: string,
): CompletionLockMetadataSnapshot | null {
	try {
		const value = JSON.parse(raw) as Record<string, unknown>;
		const keys = Object.keys(value).sort();
		const expectedKeys = [
			"acquired_at",
			"generation",
			"heartbeat_at",
			"host",
			"owner_token",
			"pid",
		];
		if (keys.length !== expectedKeys.length) return null;
		if (keys.some((key, index) => key !== expectedKeys[index])) return null;
		if (
			typeof value.pid !== "number" ||
			!Number.isSafeInteger(value.pid) ||
			value.pid <= 0 ||
			typeof value.host !== "string" ||
			!value.host ||
			typeof value.owner_token !== "string" ||
			!value.owner_token ||
			typeof value.generation !== "number" ||
			!Number.isSafeInteger(value.generation) ||
			value.generation < 0 ||
			typeof value.acquired_at !== "string" ||
			!Number.isFinite(Date.parse(value.acquired_at)) ||
			typeof value.heartbeat_at !== "string" ||
			!Number.isFinite(Date.parse(value.heartbeat_at))
		) {
			return null;
		}
		const metadata: CompletionLockMetadataSnapshot = {
			pid: value.pid,
			host: value.host,
			owner_token: value.owner_token,
			generation: value.generation,
			acquired_at: value.acquired_at,
			heartbeat_at: value.heartbeat_at,
		};
		if (raw !== `${JSON.stringify(metadata)}\n`) return null;
		return metadata;
	} catch {
		return null;
	}
}

function completionLockStateSnapshot(projectRoot: string): CompletionLockState {
	const rootPath = join(projectRoot, COMPLETION_LOCKS_ROOT);
	let rootStat: ReturnType<typeof lstatSync>;
	try {
		rootStat = lstatSync(rootPath);
	} catch (error) {
		return {
			rootType: errorCode(error) === "ENOENT" ? "missing" : "unavailable",
			entries: [],
		};
	}
	if (rootStat.isSymbolicLink()) return { rootType: "symlink", entries: [] };
	if (!rootStat.isDirectory()) return { rootType: "other", entries: [] };

	const entries: CompletionLockEntry[] = [];
	const visit = (
		absoluteDirectory: string,
		relativeDirectory: string,
	): void => {
		let names: string[];
		try {
			names = readdirSync(absoluteDirectory).sort();
		} catch {
			entries.push({
				path: relativeDirectory
					? `${COMPLETION_LOCKS_ROOT}/${relativeDirectory}`
					: COMPLETION_LOCKS_ROOT,
				type: "unavailable",
			});
			return;
		}
		for (const name of names) {
			const relativePath = relativeDirectory
				? `${relativeDirectory}/${name}`
				: name;
			const absolutePath = join(absoluteDirectory, name);
			const path = `${COMPLETION_LOCKS_ROOT}/${relativePath}`;
			try {
				const stat = lstatSync(absolutePath);
				const identity = statIdentity(stat);
				if (stat.isSymbolicLink()) {
					entries.push({ type: "symlink", path, identity });
				} else if (stat.isFile()) {
					const raw = readFileSync(absolutePath);
					entries.push({
						type: "regular",
						path,
						identity,
						fingerprint: createHash("sha256").update(raw).digest("hex"),
						...(expectedCompletionLockFile(path) === "lock"
							? {
									metadata: parseCompletionLockMetadata(raw.toString("utf8")),
								}
							: {}),
					});
				} else if (stat.isDirectory()) {
					entries.push({ type: "directory", path, identity });
					visit(absolutePath, relativePath);
				} else {
					entries.push({ type: "other", path, identity });
				}
			} catch {
				entries.push({ type: "unavailable", path });
			}
		}
	};
	visit(rootPath, "");
	return {
		rootType: "directory",
		rootIdentity: statIdentity(rootStat),
		entries,
	};
}

function immutableCompletionMetadataMatches(
	before: CompletionLockMetadataSnapshot,
	after: CompletionLockMetadataSnapshot,
): boolean {
	return (
		before.pid === after.pid &&
		before.host === after.host &&
		before.owner_token === after.owner_token &&
		before.generation === after.generation &&
		before.acquired_at === after.acquired_at &&
		Date.parse(after.heartbeat_at) >= Date.parse(before.heartbeat_at)
	);
}

function completionLockChangedPaths(
	before: CompletionLockState,
	after: CompletionLockState,
): string[] {
	const changed = new Set<string>();
	if (before.rootType !== after.rootType) changed.add(COMPLETION_LOCKS_ROOT);
	if (
		before.rootType === "directory" &&
		after.rootType === "directory" &&
		before.rootIdentity !== after.rootIdentity
	) {
		changed.add(COMPLETION_LOCKS_ROOT);
	}
	if (
		before.rootType === "symlink" ||
		before.rootType === "other" ||
		before.rootType === "unavailable" ||
		after.rootType === "symlink" ||
		after.rootType === "other" ||
		after.rootType === "unavailable"
	) {
		changed.add(COMPLETION_LOCKS_ROOT);
	}
	const beforeByPath = new Map(
		before.entries.map((entry) => [entry.path, entry]),
	);
	const afterByPath = new Map(
		after.entries.map((entry) => [entry.path, entry]),
	);
	for (const path of new Set([...beforeByPath.keys(), ...afterByPath.keys()])) {
		const beforeEntry = beforeByPath.get(path);
		const afterEntry = afterByPath.get(path);
		if (!beforeEntry || !afterEntry || beforeEntry.type !== afterEntry.type) {
			changed.add(path);
			continue;
		}
		if (beforeEntry.identity !== afterEntry.identity) {
			changed.add(path);
			continue;
		}
		if (
			beforeEntry.type === "symlink" ||
			beforeEntry.type === "other" ||
			beforeEntry.type === "unavailable"
		) {
			changed.add(path);
			continue;
		}
		if (beforeEntry.type === "regular") {
			const expectedKind = expectedCompletionLockFile(path);
			if (expectedKind === "lock") {
				if (
					!beforeEntry.metadata ||
					!afterEntry.metadata ||
					!immutableCompletionMetadataMatches(
						beforeEntry.metadata,
						afterEntry.metadata,
					)
				) {
					changed.add(path);
				}
			} else if (beforeEntry.fingerprint !== afterEntry.fingerprint) {
				changed.add(path);
			}
		}
	}
	return [...changed].sort();
}

function cleanupAddedCompletionLockEntries(
	projectRoot: string,
	before: CompletionLockState,
	after: CompletionLockState,
): void {
	const beforePaths = new Set(before.entries.map((entry) => entry.path));
	const additions = after.entries
		.filter((entry) => !beforePaths.has(entry.path))
		.sort((left, right) => right.path.length - left.path.length);
	for (const entry of additions) {
		if (expectedCompletionLockFile(entry.path)) continue;
		const absolutePath = join(projectRoot, entry.path);
		try {
			const stat = lstatSync(absolutePath);
			if (stat.isSymbolicLink() || stat.isFile()) {
				unlinkSync(absolutePath);
			} else if (stat.isDirectory()) {
				rmdirSync(absolutePath);
			}
		} catch {
			// Leak reporting remains authoritative when conservative cleanup cannot act.
		}
	}
	const rootPath = join(projectRoot, COMPLETION_LOCKS_ROOT);
	try {
		const stat = lstatSync(rootPath);
		if (stat.isSymbolicLink() && before.rootType !== "symlink") {
			unlinkSync(rootPath);
		} else if (before.rootType === "missing" && stat.isDirectory()) {
			rmdirSync(rootPath);
		}
	} catch {
		// Do not broaden cleanup beyond an empty directory or the added symlink.
	}
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
		boundedSpawn(
			"git",
			["restore", "--worktree", "--staged", "--", entry.path],
			{
				cwd: projectRoot,
				timeoutMs: 30_000,
			},
		);
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
	phase: ScenarioSamplePhase,
	seams?: ScenarioExecutionSeams,
): ScenarioSampleRun {
	if (seams?.runSample) {
		return seams.runSample(projectRoot, invocation, phase);
	}
	const startedAt = performance.now();
	const result = boundedSpawn(invocation.command, invocation.args, {
		cwd: projectRoot,
		timeoutMs: 120_000,
	});
	const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
	return {
		duration_ms: durationMs,
		exit_code: result.status,
		signal: result.signal,
		spawn_error: result.spawnError ?? (result.timedOut ? "timed out" : null),
		stdout: result.stdout,
		stderr:
			result.spawnError ?? (result.timedOut ? "timed out" : result.stderr),
	};
}

function coerceMetrics(
	metrics: Record<string, number>,
	sampleCount = BENCH_SAMPLES,
	warmupCount = BENCH_WARMUP_SAMPLES,
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
		...(typeof metrics.argv_chars === "number"
			? { argv_chars: metrics.argv_chars }
			: {}),
		tool_call_count: metrics.tool_call_count ?? 1,
		tool_success_rate: metrics.tool_success_rate ?? 1,
		sample_count: sampleCount,
		warmup_count: warmupCount,
	};
}

function isCommandSuccess(sample: ScenarioSampleRun): boolean {
	return !sample.signal && !sample.spawn_error && sample.exit_code === 0;
}

type SandboxScenarioSampleResult = {
	sample: ScenarioSampleRun | null;
	note: string | null;
};

function runSandboxScenarioSample(
	projectRoot: string,
	scenario: Scenario,
	command: string,
	phase: Exclude<ScenarioSamplePhase, "setup">,
	trustedAfolBinary?: string,
	seams?: ScenarioExecutionSeams,
): SandboxScenarioSampleResult {
	let sandboxRoot: string | null = null;
	try {
		sandboxRoot = seams?.createSandboxRoot
			? seams.createSandboxRoot(projectRoot)
			: createSandboxRoot(projectRoot);
		for (const [index, setupCommand] of (scenario.setup ?? []).entries()) {
			if (setupCommand.length === 0) {
				throw new Error("Empty setup command");
			}
			const setupInvocation = resolveCommandInvocation(
				REAL_REPO_ROOT,
				sandboxRoot,
				setupCommand,
				false,
				trustedAfolBinary,
			);
			const setupSample = runScenarioSample(
				sandboxRoot,
				setupInvocation,
				"setup",
				seams,
			);
			if (!isCommandSuccess(setupSample)) {
				return {
					sample: null,
					note: `setup-failed:${index}:${setupSample.exit_code ?? "null"}`,
				};
			}
		}
		const invocation = resolveScenarioInvocation(
			REAL_REPO_ROOT,
			sandboxRoot,
			command,
			false,
			trustedAfolBinary,
		);
		return {
			sample: runScenarioSample(sandboxRoot, invocation, phase, seams),
			note: null,
		};
	} finally {
		if (sandboxRoot) {
			if (seams?.cleanupSandboxRoot) {
				seams.cleanupSandboxRoot(sandboxRoot);
			} else {
				rmSync(sandboxRoot, { recursive: true, force: true });
			}
		}
	}
}

function runSandboxScenarioCommand(
	projectRoot: string,
	scenario: Scenario,
	command: string,
	options: Required<
		Pick<ScenarioExecutionOptions, "sampleCount" | "warmupCount">
	> & { artifact?: PreparedCompiledReleaseArtifact },
	seams?: ScenarioExecutionSeams,
): ScenarioExecutionResult {
	const expectedExit = scenario.expected_exit;
	const warmups = Array.from({ length: options.warmupCount }, () =>
		runSandboxScenarioSample(
			projectRoot,
			scenario,
			command,
			"warmup",
			options.artifact?.binaryPath,
			seams,
		),
	);
	const measured = Array.from({ length: options.sampleCount }, () =>
		runSandboxScenarioSample(
			projectRoot,
			scenario,
			command,
			"sample",
			options.artifact?.binaryPath,
			seams,
		),
	);
	const setupNotes = [...warmups, ...measured]
		.map((result) => result.note)
		.filter((note): note is string => note !== null);
	const samples = measured
		.map((result) => result.sample)
		.filter((sample): sample is ScenarioSampleRun => sample !== null);
	if (
		warmups.some((warmup) => !warmup.sample) ||
		setupNotes.length > 0 ||
		samples.length !== options.sampleCount
	) {
		const sourceProfile = executionProfile("source", "source", "source");
		return {
			metrics: coerceMetrics(
				{
					...scenario.deterministic_metrics,
					argv_chars: argvCharCount(command),
				},
				options.sampleCount,
				options.warmupCount,
			),
			notes: setupNotes.length > 0 ? setupNotes : ["setup-failed:unknown"],
			passed: false,
			profile: options.artifact?.profile ?? sourceProfile,
			timestamp: options.artifact?.timestamp ?? new Date().toISOString(),
			git_commit: options.artifact?.git_commit ?? gitCommit(projectRoot),
		};
	}
	const warmupNotes = warmups.flatMap((warmup, index) =>
		warmup.sample && scenarioSamplePassed(warmup.sample, expectedExit)
			? []
			: [
					`warmup-failed:${index + 1}:exit=${warmup.sample?.exit_code ?? "null"}:stderr=${outputTail((warmup.sample?.spawn_error ?? warmup.sample?.stderr) || warmup.sample?.stdout || "")}`,
				],
	);
	const sampleFailureNotes = samples.flatMap((sample, index) =>
		scenarioSamplePassed(sample, expectedExit)
			? []
			: [
					`sample-failed:${index + 1}:exit=${sample.exit_code ?? "null"}:stderr=${outputTail((sample.spawn_error ?? sample.stderr) || sample.stdout)}`,
				],
	);
	const durations = samples.map((sample) => sample.duration_ms);
	const representativeSample =
		samples.findLast(
			(sample) => Buffer.byteLength(sample.stdout, "utf8") > 0,
		) ?? samples.at(-1);
	const outputBytes = representativeSample
		? Buffer.byteLength(representativeSample.stdout, "utf8")
		: 0;
	const successfulSamples = samples.filter((sample) =>
		scenarioSamplePassed(sample, expectedExit),
	).length;
	const passed =
		warmupNotes.length === 0 &&
		sampleFailureNotes.length === 0 &&
		successfulSamples === options.sampleCount;
	return {
		metrics: {
			duration_ms: Math.round(percentile(durations, 0.5)),
			timing_p50_ms: Math.round(percentile(durations, 0.5)),
			timing_p95_ms: Math.round(percentile(durations, 0.95)),
			error_count: options.sampleCount - successfulSamples,
			retry_count: 0,
			context_tokens: 0,
			prompt_tokens: 0,
			output_tokens: Math.round(outputBytes / 4),
			context_bytes: 0,
			output_bytes: outputBytes,
			argv_chars: argvCharCount(command),
			tool_call_count: 1,
			tool_success_rate: Number(
				(successfulSamples / options.sampleCount).toFixed(4),
			),
			sample_count: options.sampleCount,
			warmup_count: options.warmupCount,
		},
		notes:
			passed && typeof expectedExit === "number"
				? [`expected-exit-honored:${expectedExit}`]
				: [...warmupNotes, ...sampleFailureNotes],
		passed,
		profile:
			options.artifact?.profile ??
			executionProfile("source", "source", "source"),
		timestamp: options.artifact?.timestamp ?? new Date().toISOString(),
		git_commit: options.artifact?.git_commit ?? gitCommit(projectRoot),
	};
}

export function runScenarioCommand(
	projectRoot: string,
	scenario: Scenario,
	options: ScenarioExecutionOptions = {},
): ScenarioExecutionResult {
	if (scenario.compiled_binary === true && options.artifact === undefined) {
		const artifact = prepareCompiledReleaseArtifact(projectRoot);
		try {
			return runScenarioCommand(projectRoot, scenario, {
				...options,
				artifact,
			});
		} finally {
			artifact.cleanup();
		}
	}
	const sampleCount = resolveScenarioSampleCount(scenario, options.sampleCount);
	const warmupCount = options.warmupCount ?? RELEASE_BENCH_WARMUP_SAMPLES;
	const command =
		typeof scenario.command === "string" ? scenario.command.trim() : "";
	if (command.length === 0) {
		throw new Error("Scenario command is required for execution");
	}
	console.error(
		`bench: running ${scenario.pack_id}/${scenario.scenario_id} ...`,
	);
	if (scenario.sandbox) {
		return runSandboxScenarioCommand(
			projectRoot,
			scenario,
			command,
			{
				...(options.artifact ? { artifact: options.artifact } : {}),
				sampleCount,
				warmupCount,
			},
			options.seams,
		);
	}
	const expectedExit = scenario.expected_exit;
	const invocation = resolveScenarioInvocation(
		REAL_REPO_ROOT,
		projectRoot,
		command,
		true,
		options.artifact?.binaryPath,
	);
	const gitStatusBefore = gitStatusPorcelain(projectRoot);
	const gitStateBefore = gitStatusBefore.ok
		? porcelainState(projectRoot, gitStatusBefore.output)
		: null;
	const runtimeStateBefore = runtimeStateSnapshot(projectRoot);
	const completionLocksBefore = completionLockStateSnapshot(projectRoot);
	const warmups = Array.from({ length: warmupCount }, () =>
		runScenarioSample(projectRoot, invocation, "warmup", options.seams),
	);
	const warmupNotes = warmups.flatMap((warmup, index) =>
		scenarioSamplePassed(warmup, expectedExit)
			? []
			: [
					`warmup-failed:${index + 1}:exit=${warmup.exit_code ?? "null"}:stderr=${outputTail((warmup.spawn_error ?? warmup.stderr) || warmup.stdout)}`,
				],
	);
	const samples: ScenarioSampleRun[] = [];
	for (let index = 0; index < sampleCount; index += 1) {
		samples.push(
			runScenarioSample(projectRoot, invocation, "sample", options.seams),
		);
	}
	const gitStatusAfter = gitStatusPorcelain(projectRoot);
	const gitStateAfter = gitStatusAfter.ok
		? porcelainState(projectRoot, gitStatusAfter.output)
		: null;
	const runtimeStateAfter = runtimeStateSnapshot(projectRoot);
	const completionLocksAfter = completionLockStateSnapshot(projectRoot);
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
	for (const path of completionLockChangedPaths(
		completionLocksBefore,
		completionLocksAfter,
	)) {
		leakedPaths.add(path);
	}
	cleanupAddedCompletionLockEntries(
		projectRoot,
		completionLocksBefore,
		completionLocksAfter,
	);
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
		argv_chars: argvCharCount(command),
		tool_call_count: 1,
		tool_success_rate: Number((successfulSamples / sampleCount).toFixed(4)),
		sample_count: sampleCount,
		warmup_count: warmupCount,
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
		profile:
			options.artifact?.profile ??
			executionProfile("source", "source", "source"),
		timestamp: options.artifact?.timestamp ?? new Date().toISOString(),
		git_commit: options.artifact?.git_commit ?? gitCommit(projectRoot),
	};
}
