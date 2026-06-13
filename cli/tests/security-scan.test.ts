import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReleaseSecurityScanOutcomes } from "../dev/security-scan";

const repoRoot = join(import.meta.dir, "..", "..");

function runSecurityScan(args: string[], cwd: string, pathDir?: string) {
	return spawnSync(process.execPath, [join(repoRoot, "cli/dev/security-scan.ts"), ...args], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, PATH: pathDir ?? mkdtempSync(join(tmpdir(), "security-scan-path-")) },
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

	test("release scan probe errors exit nonzero", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-probe-error-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(binDir, "osv-scanner"), "not a real binary\n", "utf8");
		chmodSync(join(binDir, "osv-scanner"), 0o755);
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(["deps", "--release", "--json"], root, binDir);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("failed to start");

			const payload = JSON.parse(result.stdout || "{}");
			expect(payload).toMatchObject({
				tool: "osv-scanner",
				kind: "deps",
				mode: "release",
				status: "errored",
				waiver_required: true,
			});
			expect(payload.reason).toContain("probe failed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release scan failures do not get waived", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-failure-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(binDir, "osv-scanner"), "#!/bin/sh\nexit 7\n", "utf8");
		chmodSync(join(binDir, "osv-scanner"), 0o755);
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(["deps", "--release", "--json"], root, binDir);
			expect(result.status).toBe(7);
			const payload = JSON.parse(result.stdout || "{}");
			expect(payload).toMatchObject({
				tool: "osv-scanner",
				kind: "deps",
				mode: "release",
				status: "failed",
				waiver_required: true,
			});
			expect(payload.reason).toContain("exited with status 7");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance scanner probe failures are failed outcomes", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-provenance-failure-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(binDir, "osv-scanner"), "#!/bin/sh\nexit 9\n", "utf8");
		writeFileSync(join(binDir, "gitleaks"), "#!/bin/sh\nexit 0\n", "utf8");
		chmodSync(join(binDir, "osv-scanner"), 0o755);
		chmodSync(join(binDir, "gitleaks"), 0o755);

		try {
			const outcomes = buildReleaseSecurityScanOutcomes({
				...process.env,
				PATH: binDir,
			});
			expect(outcomes).toContainEqual(
				expect.objectContaining({
					tool: "osv-scanner",
					kind: "deps",
					mode: "release",
					status: "failed",
					waiver_required: true,
				}),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
