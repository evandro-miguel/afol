import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function runBootstrap(
	target: string,
	args: string[] = [],
): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [kernelPath, "bootstrap", target, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function writeLegacyTargetFixture(targetRoot: string): void {
	const agentsRoot = join(targetRoot, ".agents");
	const legacyPyRoot = join(agentsRoot, "legacy");
	const legacyVenv = join(legacyPyRoot, ".venv");
	const runtimeCache = join(agentsRoot, "runtime");
	const legacyVenvCache = join(legacyVenv, "__pycache__");

	mkdirSync(legacyPyRoot, { recursive: true });
	mkdirSync(runtimeCache, { recursive: true });
	mkdirSync(join(agentsRoot, "scripts"), { recursive: true });
	mkdirSync(legacyVenv, { recursive: true });
	mkdirSync(legacyVenvCache, { recursive: true });

	writeFileSync(
		join(agentsRoot, "scripts", "bootstrap.py"),
		"print('legacy script')",
		"utf8",
	);
	writeFileSync(
		join(runtimeCache, "runtime.py"),
		"print('runtime shim')",
		"utf8",
	);
	writeFileSync(join(agentsRoot, "agents"), "# legacy adapter wrapper", "utf8");
	writeFileSync(
		join(agentsRoot, "agents-mcp"),
		"# legacy adapter wrapper",
		"utf8",
	);
	writeFileSync(join(legacyPyRoot, "uv.lock"), "legacy uv lock", "utf8");
	writeFileSync(
		join(legacyPyRoot, "pyproject.toml"),
		"[project]\\nname = 'legacy'\\n",
		"utf8",
	);
	writeFileSync(join(legacyPyRoot, ".python-version"), "3.13", "utf8");
	writeFileSync(join(legacyVenv, "env.py"), "print('venv')", "utf8");
	writeFileSync(join(legacyVenvCache, "cache.pyc"), "venv cache", "utf8");

	mkdirSync(join(agentsRoot, "keep"), { recursive: true });
	writeFileSync(join(agentsRoot, "keep", "project-owned.md"), "keep", "utf8");
}

function assertLegacyArtifactsRemoved(targetRoot: string): void {
	expect(existsSync(join(targetRoot, ".agents", "scripts"))).toBe(false);
	expect(existsSync(join(targetRoot, ".agents", "runtime"))).toBe(false);
	expect(existsSync(join(targetRoot, ".agents", "agents"))).toBe(false);
	expect(existsSync(join(targetRoot, ".agents", "agents-mcp"))).toBe(false);
	expect(existsSync(join(targetRoot, ".agents", "legacy", "uv.lock"))).toBe(
		false,
	);
	expect(
		existsSync(join(targetRoot, ".agents", "legacy", "pyproject.toml")),
	).toBe(false);
	expect(
		existsSync(join(targetRoot, ".agents", "legacy", ".python-version")),
	).toBe(false);
	expect(existsSync(join(targetRoot, ".agents", "legacy", ".venv"))).toBe(
		false,
	);
	expect(
		existsSync(join(targetRoot, ".agents", "legacy", ".venv", "__pycache__")),
	).toBe(false);
}

describe("bootstrap cleanup of legacy Python scaffold", () => {
	test("dry-run reports legacy cleanup and preserves files", () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-cleanup-dry-run-"));
		try {
			writeLegacyTargetFixture(target);

			const proc = runBootstrap(target, [
				"--dry-run",
				"--cleanup-obsolete",
				"--verbose",
			]);
			expect(proc.status).toBe(0);
			expect(proc.stdout as string).toContain(
				"cleanup-pending .agents/scripts legacy-script-root",
			);
			expect(proc.stdout as string).toContain(
				"cleanup-pending .agents/runtime legacy-runtime-root",
			);
			expect(proc.stdout as string).toContain("cleanup=8");
			expect(proc.stdout as string).toContain("mode=dry-run");

			expect(existsSync(join(target, ".agents", "scripts"))).toBe(true);
			expect(existsSync(join(target, ".agents", "runtime"))).toBe(true);
			expect(existsSync(join(target, ".agents", "legacy", "uv.lock"))).toBe(
				true,
			);
			expect(
				existsSync(join(target, ".agents", "legacy", "pyproject.toml")),
			).toBe(true);
			expect(
				existsSync(join(target, ".agents", "legacy", ".python-version")),
			).toBe(true);
			expect(existsSync(join(target, ".agents", "legacy", ".venv"))).toBe(true);
			expect(
				existsSync(join(target, ".agents", "legacy", ".venv", "__pycache__")),
			).toBe(true);
			expect(
				existsSync(join(target, ".agents", "keep", "project-owned.md")),
			).toBe(true);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("apply removes legacy artifacts only with --cleanup-obsolete", () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-cleanup-apply-"));
		try {
			writeLegacyTargetFixture(target);

			const noopCleanupProc = runBootstrap(target);
			expect(noopCleanupProc.status).toBe(0);
			expect(noopCleanupProc.stdout).toContain("cleanup=8");
			expect(existsSync(join(target, ".agents", "scripts"))).toBe(true);
			expect(existsSync(join(target, ".agents", "legacy", "uv.lock"))).toBe(
				true,
			);

			const cleanupProc = runBootstrap(target, [
				"--cleanup-obsolete",
				"--verbose",
			]);
			expect(cleanupProc.status).toBe(0);
			expect(cleanupProc.stdout).toContain(
				"cleanup-removed .agents/scripts legacy-script-root",
			);
			expect(cleanupProc.stdout).toContain(
				"cleanup-removed .agents/runtime legacy-runtime-root",
			);
			assertLegacyArtifactsRemoved(target);
			expect(
				existsSync(join(target, ".agents", "keep", "project-owned.md")),
			).toBe(true);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});
});
