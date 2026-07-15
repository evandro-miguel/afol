import { spawnSync } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30_000;

export type BoundedSpawnResult = {
	ok: boolean;
	timedOut: boolean;
	stdout: string;
	stderr: string;
	status: number | null;
	signal: NodeJS.Signals | null;
	/** Populated when the child process could not be spawned (ENOENT, EACCES, etc.). */
	spawnError: string | null;
};

export type BoundedSpawnOptions = {
	cwd?: string | URL;
	timeoutMs?: number;
	maxBuffer?: number;
	stdio?:
		| "pipe"
		| "ignore"
		| "inherit"
		| Array<"pipe" | "ignore" | "inherit" | number>;
};

export function spawnFailureDetail(
	result: Pick<
		BoundedSpawnResult,
		"timedOut" | "spawnError" | "stderr" | "stdout" | "status"
	>,
): string {
	if (result.timedOut) return "timed out";
	if (result.spawnError) return result.spawnError;
	const stderr = result.stderr.trim();
	if (stderr) return stderr;
	const stdout = result.stdout.trim();
	if (stdout) return stdout;
	return `exit:${result.status ?? "null"}`;
}

/**
 * Run a subprocess with a bounded wall-clock timeout.
 * On timeout the child process receives SIGKILL.
 *
 * Accepts a restricted set of spawn options — callers may NOT set `encoding`,
 * `timeout`, or `killSignal` themselves; these are controlled by the helper
 * to guarantee bounded execution semantics.
 *
 * Returns a structured result that classifies timeout vs. other failures and
 * preserves spawn-level error diagnostics (e.g. ENOENT for missing binary).
 */
export function boundedSpawn(
	command: string,
	args: string[],
	options: BoundedSpawnOptions = {},
): BoundedSpawnResult {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const startedAt = Date.now();
	const result = spawnSync(command, args, {
		encoding: "utf8",
		timeout: timeoutMs,
		killSignal: "SIGKILL",
		cwd: options.cwd,
		maxBuffer: options.maxBuffer,
		stdio: options.stdio,
	});
	const wallMs = Date.now() - startedAt;

	// Node/Bun spawnSync: when the process is killed by the timeout mechanism,
	// result.signal is null and result.error.message includes "timed out".
	// When the binary does not exist, result.error.code is ENOENT.
	// When the binary exists but is killed externally, result.signal is set.
	let timedOut = false;
	let spawnError: string | null = null;

	if (result.error) {
		const err = result.error as NodeJS.ErrnoException;
		const msg = err.message ?? "";
		const codedSpawnError = _formatCodedSpawnError(err);
		if (codedSpawnError) {
			spawnError = codedSpawnError;
		} else if (
			msg.includes("timed out") ||
			msg.includes("ETIMEDOUT") ||
			msg.includes("TIMEDOUT")
		) {
			// Node/Bun reports timeout via result.error with a timeout message
			timedOut = wallMs >= timeoutMs - 50; // Allow 50ms clock slack
			if (!timedOut) {
				// Preserve diagnostic when the message has timeout wording but the
				// elapsed-time criterion does not match (clock skew, platform edge
				// case). Must not end as timedOut:false + spawnError:null.
				spawnError = err.message ?? String(err);
			}
		} else {
			spawnError = err.message ?? String(err);
		}
	}

	// When the process was killed by our configured SIGKILL and wall time
	// meets or exceeds the budget, classify as timeout.
	if (!timedOut && result.signal === "SIGKILL" && wallMs >= timeoutMs - 50) {
		timedOut = true;
	}

	return {
		ok: result.status === 0 && !result.error,
		timedOut,
		stdout: typeof result.stdout === "string" ? result.stdout : "",
		stderr: typeof result.stderr === "string" ? result.stderr : "",
		status: result.status ?? null,
		signal: result.signal,
		spawnError,
	};
}

/** @internal Exported for focused normalization regression tests. */
export function _formatCodedSpawnError(
	error: Pick<NodeJS.ErrnoException, "code" | "message">,
): string | null {
	if (
		error.code === "ENOENT" ||
		error.code === "EACCES" ||
		error.code === "EPERM"
	) {
		return `${error.code}: ${error.message}`;
	}
	return null;
}
