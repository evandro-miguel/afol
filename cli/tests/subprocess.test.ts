import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	_formatCodedSpawnError,
	boundedSpawn,
	spawnFailureDetail,
} from "../core/subprocess";

type ProbeCommand = readonly [command: string, args: string[]];

/**
 * Keep subprocess probes independent from a shell on Windows.  In particular,
 * bash/sleep may be supplied by WSL and can spend most of the timeout budget
 * starting under the load of the complete test suite.  Bun's own runtime gives
 * these tests the same exit, stderr, output, and timer semantics everywhere.
 */
function probeCommand(
	windowsSource: string,
	posixCommand: string,
	posixArgs: string[],
): ProbeCommand {
	if (process.platform === "win32") {
		return [process.execPath, ["-e", windowsSource]];
	}
	return [posixCommand, posixArgs];
}

describe("boundedSpawn", () => {
	test("returns ok for successful command", () => {
		const [command, args] = probeCommand(
			'process.stdout.write("hello")',
			"echo",
			["hello"],
		);
		const result = boundedSpawn(command, args, { timeoutMs: 5_000 });
		expect(result.ok).toBe(true);
		expect(result.timedOut).toBe(false);
		expect(result.spawnError).toBeNull();
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("hello");
	});

	test("propagates ENOENT spawn error for nonexistent command", () => {
		const result = boundedSpawn("nonexistent-binary-xyz-999", [], {
			timeoutMs: 5_000,
		});
		expect(result.ok).toBe(false);
		expect(result.timedOut).toBe(false);
		expect(result.spawnError).not.toBeNull();
		expect(result.spawnError).toMatch(/ENOENT/);
		// Bun returns undefined for status when the binary cannot be spawned;
		// normalized to null for consistent number|null contract.
		expect(result.status).toBeNull();
	});

	test("returns failure for nonzero exit", () => {
		const [command, args] = probeCommand("process.exit(42)", "bash", [
			"-c",
			"exit 42",
		]);
		const result = boundedSpawn(command, args, {
			timeoutMs: 5_000,
		});
		expect(result.ok).toBe(false);
		expect(result.timedOut).toBe(false);
		expect(result.spawnError).toBeNull();
		expect(result.status).toBe(42);
	});

	test("captures stderr", () => {
		const [command, args] = probeCommand(
			'process.stderr.write("errmsg\\n"); process.exit(1)',
			"bash",
			["-c", "echo errmsg >&2 && exit 1"],
		);
		const result = boundedSpawn(command, args, {
			timeoutMs: 5_000,
		});
		expect(result.ok).toBe(false);
		expect(result.timedOut).toBe(false);
		expect(result.spawnError).toBeNull();
		expect(result.stderr).toContain("errmsg");
	});

	test("timeout kills process and reports timedOut", () => {
		const startedAt = Date.now();
		const [command, args] = probeCommand(
			"setTimeout(() => {}, 30_000)",
			"sleep",
			["30"],
		);
		const result = boundedSpawn(command, args, {
			timeoutMs: 200,
		});
		const elapsed = Date.now() - startedAt;
		expect(result.timedOut).toBe(true);
		expect(result.ok).toBe(false);
		expect(result.spawnError).toBeNull();
		// Should complete well before the sleep duration
		expect(elapsed).toBeLessThan(10_000);
	});

	test("timeout never loses spawn diagnostic to silent timedOut:false + spawnError:null", () => {
		// Edge case: if the error message has timeout wording but the wall-clock
		// slack criterion (wallMs >= timeoutMs - 50) does not match — due to clock
		// skew or a platform edge case — the diagnostic must not be lost.
		// The invariant: there is no path where timedOut=false AND spawnError=null
		// when the spawn error contained timeout wording.
		const [command, args] = probeCommand(
			"setTimeout(() => {}, 30_000)",
			"sleep",
			["30"],
		);
		const result = boundedSpawn(command, args, { timeoutMs: 10 });
		expect(result.ok).toBe(false);
		const diagnosticPreserved = result.timedOut || result.spawnError !== null;
		expect(diagnosticPreserved).toBe(true);
	});

	test.skipIf(process.platform === "win32")(
		"non-timeout SIGKILL (external kill) is NOT classified as timeout",
		() => {
			// Self-kill via SIGKILL within the timeout budget: not a timeout.
			const result = boundedSpawn("bash", ["-c", "kill -9 $$"], {
				timeoutMs: 10_000,
			});
			expect(result.timedOut).toBe(false);
			expect(result.signal).toBe("SIGKILL");
			expect(result.ok).toBe(false);
			expect(result.spawnError).toBeNull();
		},
	);
});

describe("spawnFailureDetail", () => {
	test("prefers structured spawn errors over null exit fallbacks", () => {
		expect(
			spawnFailureDetail({
				timedOut: false,
				spawnError: "EACCES: permission denied",
				stderr: "",
				stdout: "",
				status: null,
			}),
		).toBe("EACCES: permission denied");
	});
});

describe("boundedSpawn EACCES primitive", () => {
	test("EACCES produces ok=false, status=null, spawnError with EACCES prefix", () => {
		const testDir = mkdtempSync(join(tmpdir(), "eacces-spawn-"));
		try {
			const scriptPath = join(testDir, "nonexec.sh");
			writeFileSync(scriptPath, "#!/usr/bin/env bash\necho hello\n", {
				mode: 0o644,
			});
			const result = boundedSpawn(scriptPath, [], {
				timeoutMs: 5_000,
				cwd: testDir,
			});
			expect(result.ok).toBe(false);
			expect(result.status).toBeNull();
			expect(result.timedOut).toBe(false);
			expect(result.signal).toBeNull();
			expect(result.spawnError).not.toBeNull();
			// On Linux, spawning a non-executable file gives EACCES
			expect(
				result.spawnError?.startsWith("EACCES") ||
					result.spawnError?.startsWith("ENOENT"),
			).toBe(true);
		} finally {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test.skipIf(process.platform === "win32")(
		"non-ENOENT spawn failure preserves spawnError diagnostic",
		() => {
			const testDir = mkdtempSync(join(tmpdir(), "spawn-diag-"));
			try {
				const scriptPath = join(testDir, "nonexec.sh");
				writeFileSync(scriptPath, "#!/usr/bin/env bash\necho hello\n", {
					mode: 0o644,
				});
				const result = boundedSpawn(scriptPath, [], {
					timeoutMs: 5_000,
					cwd: testDir,
				});
				expect(
					!result.ok &&
						result.status === null &&
						!result.timedOut &&
						!result.signal,
				).toBe(true);
				expect(result.spawnError).not.toBeNull();
				expect(result.spawnError).toMatch(/^EACCES:/);
				expect(result.spawnError).not.toContain("codex-missing");
				expect(result.spawnError).not.toContain("install-codex");
				expect(result.spawnError).not.toContain("add-it-to-path");
			} finally {
				rmSync(testDir, { recursive: true, force: true });
			}
		},
	);
});

describe("boundedSpawn diagnostics", () => {
	test("preserves the EPERM code during spawn-error normalization", () => {
		expect(
			_formatCodedSpawnError({
				code: "EPERM",
				message: "operation not permitted",
			}),
		).toBe("EPERM: operation not permitted");
	});
});

describe("boundedSpawn maxBuffer diagnostics", () => {
	test("preserves spawnError when maxBuffer is exceeded", () => {
		const [command, args] = probeCommand(
			'process.stdout.write("x".repeat(8192))',
			"bash",
			["-lc", "head -c 8192 /dev/zero | tr '\\0' 'x'"],
		);
		const result = boundedSpawn(command, args, {
			timeoutMs: 5_000,
			maxBuffer: 1_024,
		});
		expect(result.ok).toBe(false);
		expect(result.timedOut).toBe(false);
		expect(result.spawnError).not.toBeNull();
		expect(result.spawnError).toMatch(/maxBuffer|ENOBUFS|stdout/iu);
	});
});
