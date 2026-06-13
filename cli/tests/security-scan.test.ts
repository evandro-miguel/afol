import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

function runSecurityScan(args: string[], cwd: string) {
	return spawnSync(process.execPath, [join(repoRoot, "cli/dev/security-scan.ts"), ...args], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, PATH: mkdtempSync(join(tmpdir(), "security-scan-path-")) },
		shell: false,
	});
}

describe("security scan CLI", () => {
	test("informative deps scan skips when scanner is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-info-"));
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(["deps"], root);
			expect(result.status).toBe(0);
			expect(result.stdout).toContain(
				"osv-scanner not installed; skipping dependency scan (informative).",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("required deps scan fails when scanner is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-required-"));
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(["deps", "--required"], root);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(
				"osv-scanner not installed; required dependency scan cannot run.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("json release deps scan includes structured waiver outcome", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-release-"));
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(["deps", "--release", "--json"], root);
			expect(result.status).toBe(0);

			const payload = JSON.parse(result.stdout || "{}");
			expect(payload).toMatchObject({
				tool: "osv-scanner",
				kind: "deps",
				mode: "release",
				status: "waived",
				waiver_required: true,
			});
			expect(payload.reason).toContain("missing binary");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
