import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { isAbsolute, join, relative } from "node:path";
import { resolveProjectPaths } from "../../services/project/paths";
import { resolveProjectPath } from "../../services/project/root";
import {
	checkSpecCompatibility,
	getSpecCheck,
} from "../../services/spec-gate/checker";
import type { SpecCheckResult } from "../../services/spec-gate/types";
import type { VerificationSpec } from "./types";

export type { VerificationSpec } from "./types";

import {
	defaultAllowGlobalFallback,
	isCiMode,
	resolveSession as resolveBoundSession,
} from "../../services/workbench/session-context";

function pathIsInside(root: string, candidate: string): boolean {
	const relativePath = relative(root, candidate);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
}

const SESSION_ID_TARGET_RE = /^\d{6}_\d{4}_[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function resolveVerifyTargetPath(root: string, target: string): string {
	const normalized = target.trim().replace(/\\/g, "/").replace(/^\.\//, "");
	if (SESSION_ID_TARGET_RE.test(normalized)) {
		return resolveVerifySessionPath(root, normalized);
	}
	const result = resolveProjectPath(root, target);
	if (!result.ok) {
		throw new Error(result.error);
	}
	return result.value.path;
}

export function resolveVerifySessionPath(
	root: string,
	session: string,
): string {
	const projectPaths = resolveProjectPaths(root);
	const normalized = session.trim().replace(/\\/g, "/").replace(/^\.\//, "");
	const sessionTarget =
		normalized === projectPaths.wbDir ||
		normalized.startsWith(`${projectPaths.wbDir}/`)
			? normalized
			: `${projectPaths.wbDir}/${normalized}`;
	const result = resolveProjectPath(root, sessionTarget);
	if (!result.ok) {
		throw new Error(result.error);
	}
	if (!pathIsInside(projectPaths.abs.wbDir, result.value.path)) {
		throw new Error(`Path escapes workbench directory: ${session}`);
	}
	return result.value.path;
}

export function resolveSession(
	root: string,
	session: string,
	commandName: string,
): string {
	const resolved = resolveBoundSession(root, {
		explicit: session,
		allowGlobalFallback: defaultAllowGlobalFallback(),
	});
	if (resolved) {
		return resolved.session;
	}
	if (isCiMode()) {
		throw new Error(
			`Missing --session for ${commandName}; set --session, AFOL_SESSION, or bind the current context with afol session bind. Global fallback is disabled in CI.`,
		);
	}
	throw new Error(
		`Missing --session for ${commandName}; set --session, AFOL_SESSION, or bind the current context with afol session bind.`,
	);
}

export function resolveRequiredSpecCheck(
	root: string,
	session: string,
	taskId: string,
): SpecCheckResult {
	const current = getSpecCheck(root, session, taskId);
	if (current?.status === "waived") {
		return current;
	}
	return checkSpecCompatibility(root, session, taskId);
}

export function splitCommandLine(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let tokenStarted = false;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index] ?? "";
		if (quote !== "'" && char === "\\") {
			let quoteIndex = index;
			while (command[quoteIndex] === "\\") quoteIndex += 1;
			if (command[quoteIndex] === '"') {
				const slashCount = quoteIndex - index;
				current += "\\".repeat(Math.floor(slashCount / 2));
				tokenStarted = true;
				if (slashCount % 2 === 0) {
					quote = quote === '"' ? null : '"';
				} else {
					current += '"';
				}
				index = quoteIndex;
				continue;
			}
		}
		if (quote) {
			if (char === quote) {
				quote = null;
				continue;
			}
			current += char;
			tokenStarted = true;
			continue;
		}
		if (char === "\\") {
			const next = command[index + 1] ?? "";
			if (next && (/\s/.test(next) || next === '"' || next === "'")) {
				current += next;
				tokenStarted = true;
				index += 1;
				continue;
			}
			current += char;
			tokenStarted = true;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			tokenStarted = true;
			continue;
		}
		if (/\s/.test(char)) {
			if (tokenStarted) {
				tokens.push(current);
				current = "";
				tokenStarted = false;
			}
			continue;
		}
		current += char;
		tokenStarted = true;
	}
	if (quote) {
		throw new Error("Unclosed quote in --test command.");
	}
	if (tokenStarted) {
		tokens.push(current);
	}
	return tokens;
}

export type RunVerificationResult = {
	exitCode: number;
	error?: string;
	signal?: string;
};

export type ObservedVerificationStatus =
	| "passed"
	| "failed"
	| "timed_out"
	| "output_limit"
	| "signaled"
	| "spawn_failed"
	| "lock_lost";

export type ObservedVerificationResult = {
	exitCode: number;
	status: ObservedVerificationStatus;
	durationMs: number;
	signal?: string;
};

export type RunVerificationAsyncOptions = {
	timeoutMs?: number;
	maxOutputBytes?: number;
	signal?: AbortSignal;
};

/**
 * Full-repository verification can legitimately take more than five minutes on
 * a warm-but-loaded host. Keep the default finite and bounded so `done --test`
 * remains fail-closed rather than allowing an unbounded child process.
 */
export const DEFAULT_VERIFICATION_TIMEOUT_MS = 600_000;
export const MAX_VERIFICATION_TIMEOUT_MS = 600_000;
const DEFAULT_VERIFICATION_OUTPUT_BYTES = 1024 * 1024;

export function resolveVerificationTimeoutMs(timeoutMs?: number): number {
	if (timeoutMs === undefined) return DEFAULT_VERIFICATION_TIMEOUT_MS;
	if (
		!Number.isInteger(timeoutMs) ||
		timeoutMs < 1 ||
		timeoutMs > MAX_VERIFICATION_TIMEOUT_MS
	) {
		throw new Error(
			`verification timeout must be an integer between 1 and ${MAX_VERIFICATION_TIMEOUT_MS} ms`,
		);
	}
	return timeoutMs;
}

function terminateProcessTree(child: ChildProcess, force: boolean): void {
	const pid = child.pid;
	if (!pid) return;
	if (process.platform === "win32") {
		const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "";
		const taskkill = isAbsolute(systemRoot)
			? join(systemRoot, "System32", "taskkill.exe")
			: "taskkill.exe";
		spawnSync(taskkill, ["/pid", String(pid), "/t", ...(force ? ["/f"] : [])], {
			shell: false,
			stdio: "ignore",
			windowsHide: true,
		});
		return;
	}
	try {
		process.kill(-pid, force ? "SIGKILL" : "SIGTERM");
	} catch {
		child.kill(force ? "SIGKILL" : "SIGTERM");
	}
}

export function runVerificationAsync(
	root: string,
	spec: VerificationSpec,
	options: RunVerificationAsyncOptions = {},
): Promise<ObservedVerificationResult> {
	const startedAt = Date.now();
	const durationMs = (): number => Date.now() - startedAt;
	const timeoutMs = resolveVerificationTimeoutMs(options.timeoutMs);
	if (
		(spec.mode === "shell" && spec.command.trim().length === 0) ||
		(spec.mode === "argv" && spec.executable.trim().length === 0)
	) {
		return Promise.resolve({
			exitCode: 1,
			status: "spawn_failed",
			durationMs: durationMs(),
		});
	}
	if (options.signal?.aborted) {
		return Promise.resolve({
			exitCode: 1,
			status: "lock_lost",
			durationMs: durationMs(),
		});
	}

	return new Promise((resolve) => {
		const child =
			spec.mode === "shell"
				? spawn(spec.command, {
						cwd: root,
						detached: process.platform !== "win32",
						shell: true,
						stdio: ["ignore", "pipe", "pipe"],
					})
				: spawn(spec.executable, spec.args, {
						cwd: root,
						detached: process.platform !== "win32",
						shell: false,
						stdio: ["ignore", "pipe", "pipe"],
					});
		let settled = false;
		let outputBytes = 0;
		let forcedStatus: ObservedVerificationStatus | null = null;
		let forceKill: ReturnType<typeof setTimeout> | null = null;
		const maxOutputBytes =
			options.maxOutputBytes ?? DEFAULT_VERIFICATION_OUTPUT_BYTES;
		const finish = (result: ObservedVerificationResult): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (forceKill) clearTimeout(forceKill);
			options.signal?.removeEventListener("abort", abortHandler);
			resolve(result);
		};
		const terminate = (status: ObservedVerificationStatus): void => {
			if (settled || forcedStatus) return;
			forcedStatus = status;
			if (process.platform === "win32") {
				terminateProcessTree(child, true);
			} else {
				terminateProcessTree(child, false);
				forceKill = setTimeout(() => terminateProcessTree(child, true), 100);
				forceKill.unref();
			}
		};
		const countOutput = (chunk: Buffer | string): void => {
			outputBytes += Buffer.isBuffer(chunk)
				? chunk.byteLength
				: Buffer.byteLength(chunk, "utf8");
			if (outputBytes > maxOutputBytes) terminate("output_limit");
		};
		child.stdout?.on("data", countOutput);
		child.stderr?.on("data", countOutput);
		const abortHandler = (): void => terminate("lock_lost");
		options.signal?.addEventListener("abort", abortHandler, { once: true });
		const timeout = setTimeout(() => terminate("timed_out"), timeoutMs);
		timeout.unref();
		child.once("error", () => {
			finish({
				exitCode: 1,
				status: forcedStatus ?? "spawn_failed",
				durationMs: durationMs(),
			});
		});
		child.once("close", (code, signal) => {
			const status =
				forcedStatus ??
				(signal ? "signaled" : code === 0 ? "passed" : "failed");
			const observedExitCode = code ?? 1;
			finish({
				exitCode:
					status === "passed"
						? 0
						: observedExitCode === 0
							? 1
							: observedExitCode,
				status,
				durationMs: durationMs(),
				...(signal ? { signal } : {}),
			});
		});
	});
}

export function runVerification(
	root: string,
	command: string | VerificationSpec,
	options: { shell?: boolean; timeoutMs?: number } = {},
): RunVerificationResult {
	const timeoutMs = resolveVerificationTimeoutMs(options.timeoutMs);
	const spec: VerificationSpec =
		typeof command === "string"
			? options.shell
				? { mode: "shell", command }
				: (() => {
						const argv = splitCommandLine(command);
						return {
							mode: "argv" as const,
							executable: argv[0] ?? "",
							args: argv.slice(1),
						};
					})()
			: command;
	if (
		(spec.mode === "shell" && spec.command.trim().length === 0) ||
		(spec.mode === "argv" && spec.executable.trim().length === 0)
	) {
		return { exitCode: 1, error: "Empty --test command." };
	}
	let result: ReturnType<typeof spawnSync>;
	if (spec.mode === "shell") {
		result = spawnSync(spec.command, {
			cwd: root,
			encoding: "utf8",
			maxBuffer: 1024 * 1024,
			timeout: timeoutMs,
			shell: true,
		});
	} else {
		result = spawnSync(spec.executable, spec.args, {
			cwd: root,
			encoding: "utf8",
			maxBuffer: 1024 * 1024,
			timeout: timeoutMs,
		});
	}

	if (result.error) {
		return {
			exitCode: 1,
			error: result.error.message,
			...(result.signal ? { signal: result.signal } : {}),
		};
	}
	return {
		exitCode: result.status ?? 1,
		...(result.signal ? { signal: result.signal } : {}),
	};
}
