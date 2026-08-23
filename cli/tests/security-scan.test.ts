import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildReleaseSecurityScanOutcomes,
	runReleaseSecurityScans,
} from "../dev/security-scan";

const repoRoot = join(import.meta.dir, "..", "..");

function runSecurityScan(args: string[], cwd: string, pathDir?: string) {
	return spawnSync(
		process.execPath,
		[join(repoRoot, "cli/dev/security-scan.ts"), ...args],
		{
			cwd,
			encoding: "utf8",
			env: {
				...process.env,
				PATH: pathDir ?? mkdtempSync(join(tmpdir(), "security-scan-path-")),
			},
			shell: false,
		},
	);
}

function gitEnv(pathDir?: string): NodeJS.ProcessEnv {
	return {
		...process.env,
		...(pathDir ? { PATH: `${pathDir}:${process.env.PATH ?? ""}` } : {}),
		GIT_AUTHOR_NAME: "Test User",
		GIT_AUTHOR_EMAIL: "test@example.com",
		GIT_COMMITTER_NAME: "Test User",
		GIT_COMMITTER_EMAIL: "test@example.com",
	};
}

function commitFixture(root: string, env: NodeJS.ProcessEnv): string {
	for (const args of [
		["init"],
		["add", "-A"],
		["commit", "--no-verify", "-m", "test security scan"],
	] as const) {
		const result = spawnSync("git", args, {
			cwd: root,
			encoding: "utf8",
			env,
			shell: false,
		});
		if (result.error) {
			throw result.error;
		}
		expect(result.status).toBe(0);
	}

	const sha = spawnSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
		env,
		shell: false,
	}).stdout.trim();
	expect(sha.length).toBeGreaterThan(0);
	return sha;
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

	test("json release deps scan fails with structured waiver outcome when scanner is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-release-"));
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(["deps", "--release", "--json"], root);
			expect(result.status).toBe(1);

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

	test("json release deps scan fails when no supported lockfile exists", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-release-no-lock-"));

		try {
			const result = runSecurityScan(["deps", "--release", "--json"], root);
			expect(result.status).toBe(1);

			const payload = JSON.parse(result.stdout || "{}");
			expect(payload).toMatchObject({
				tool: "dependency-lockfile",
				kind: "deps",
				mode: "release",
				status: "waived",
				waiver_required: true,
			});
			expect(payload.reason).toContain(
				"No OSV-supported dependency lockfile found",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("json release scan omits waiver when scanner passes", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-pass-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(binDir, "gitleaks"), "#!/bin/sh\nexit 0\n", "utf8");
		chmodSync(join(binDir, "gitleaks"), 0o755);

		try {
			const result = runSecurityScan(
				["secrets", "--release", "--json"],
				root,
				binDir,
			);
			expect(result.status).toBe(0);

			const payload = JSON.parse(result.stdout || "{}");
			expect(payload).toMatchObject({
				tool: "gitleaks",
				kind: "secrets",
				mode: "release",
				status: "passed",
			});
			expect(payload).not.toHaveProperty("waiver_required");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release deps scan rejects osv fallback when osv-scanner is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-osv-fallback-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		writeFileSync(
			join(binDir, "osv"),
			[
				"#!/bin/sh",
				'if [ "$1" = "--version" ]; then',
				"  printf 'osv fallback 1.0\\n'",
				"  exit 0",
				"fi",
				"exit 0",
				"",
			].join("\n"),
			"utf8",
		);
		chmodSync(join(binDir, "osv"), 0o755);

		try {
			const result = runSecurityScan(
				["deps", "--release", "--json"],
				root,
				binDir,
			);
			expect(result.status).toBe(1);

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

	test("secrets scan covers git history and current worktree", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-secrets-"));
		const binDir = join(root, "bin");
		const logPath = join(root, "gitleaks-args.log");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(
			join(binDir, "gitleaks"),
			[
				"#!/bin/sh",
				'if [ "$1" = "--version" ]; then',
				"  printf 'gitleaks test\\n'",
				"  exit 0",
				"fi",
				`printf '%s\\n' "$*" >> "${logPath}"`,
				"exit 0",
				"",
			].join("\n"),
			"utf8",
		);
		chmodSync(join(binDir, "gitleaks"), 0o755);

		try {
			const result = runSecurityScan(
				["secrets", "--release", "--json"],
				root,
				binDir,
			);
			expect(result.status).toBe(0);

			const argsLog = readFileSync(logPath, "utf8");
			expect(argsLog.trim().split("\n")).toEqual([
				"git -v --redact --exit-code 1 .",
				"dir -v --redact --exit-code 1 .",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release scan writes aggregate evidence report", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-release-report-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		mkdirSync(join(root, "dist"), { recursive: true });
		writeFileSync(join(root, "dist", "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		for (const [name, version] of [
			["osv-scanner", "osv-scanner 2.4.0"],
			["gitleaks", "gitleaks 8.30.1"],
		] as const) {
			writeFileSync(
				join(binDir, name),
				[
					"#!/bin/sh",
					'if [ "$1" = "--version" ]; then',
					`  printf '${version}\\n'`,
					"  exit 0",
					"fi",
					"exit 0",
					"",
				].join("\n"),
				"utf8",
			);
			chmodSync(join(binDir, name), 0o755);
		}
		const env = gitEnv(binDir);
		const commitSha = commitFixture(root, env);

		try {
			const result = runSecurityScan(
				["release"],
				root,
				`${binDir}:${process.env.PATH ?? ""}`,
			);
			expect(result.status).toBe(0);
			expect(result.stdout).toContain("dist/security-scan.release.json");

			const report = JSON.parse(
				readFileSync(join(root, "dist/security-scan.release.json"), "utf8"),
			);
			const artifactSha = createHash("sha256")
				.update(readFileSync(join(root, "dist", "afol")))
				.digest("hex");
			const lockSha = createHash("sha256")
				.update(readFileSync(join(root, "bun.lock")))
				.digest("hex");
			expect(report).toMatchObject({
				mode: "release",
				target: {
					artifact: "dist/afol",
					artifact_sha256: artifactSha,
					commit_sha: commitSha,
					lockfile: "bun.lock",
					lock_sha256: lockSha,
				},
				scans: expect.arrayContaining([
					expect.objectContaining({
						tool: "osv-scanner",
						kind: "deps",
						status: "passed",
						version: "osv-scanner 2.4.0",
					}),
					expect.objectContaining({
						tool: "gitleaks",
						kind: "secrets",
						status: "passed",
						version: "gitleaks 8.30.1",
					}),
				]),
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("binds an explicit Windows candidate artifact into the release target", () => {
		const root = mkdtempSync(
			join(tmpdir(), "security-scan-explicit-artifact-"),
		);
		mkdirSync(join(root, "dist"), { recursive: true });
		writeFileSync(join(root, "dist", "afol.exe"), "windows artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const { report } = runReleaseSecurityScans({
				cwd: root,
				artifact: "dist\\afol.exe",
			});
			expect(report.target).toMatchObject({
				artifact: "dist/afol.exe",
				artifact_sha256: createHash("sha256")
					.update(readFileSync(join(root, "dist", "afol.exe")))
					.digest("hex"),
			});
			expect(report.target_errors).not.toContain(
				"missing release artifact: dist/afol.exe",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects hostile raw artifact targets before a release scan", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-hostile-artifact-"));
		try {
			for (const artifact of [
				"../dist/afol.exe",
				"dist\\..\\afol.exe",
				"C:dist\\afol.exe",
				"\\\\server\\share\\afol.exe",
				"dist/CON.exe",
				"dist/afol.exe ",
			]) {
				expect(() => runReleaseSecurityScans({ cwd: root, artifact })).toThrow(
					/invalid release artifact/,
				);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release scan report carries scanner failure detail", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-release-failure-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		writeFileSync(
			join(binDir, "osv-scanner"),
			[
				"#!/bin/sh",
				'if [ "$1" = "--version" ]; then',
				"  printf 'osv-scanner 2.4.0\\n'",
				"  exit 0",
				"fi",
				"printf 'api.osv.dev blocked\\n' >&2",
				"exit 7",
				"",
			].join("\n"),
			"utf8",
		);
		writeFileSync(
			join(binDir, "gitleaks"),
			[
				"#!/bin/sh",
				'if [ "$1" = "--version" ]; then',
				"  printf 'gitleaks 8.30.1\\n'",
				"  exit 0",
				"fi",
				"exit 0",
				"",
			].join("\n"),
			"utf8",
		);
		chmodSync(join(binDir, "osv-scanner"), 0o755);
		chmodSync(join(binDir, "gitleaks"), 0o755);

		try {
			const result = runSecurityScan(["release"], root, binDir);
			expect(result.status).toBe(1);

			const report = JSON.parse(
				readFileSync(join(root, "dist/security-scan.release.json"), "utf8"),
			);
			const depsScan = report.scans.find(
				(scan: { kind: string }) => scan.kind === "deps",
			);
			expect(depsScan.reason).toContain("api.osv.dev blocked");
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
			const result = runSecurityScan(
				["deps", "--release", "--json"],
				root,
				binDir,
			);
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
		writeFileSync(
			join(binDir, "osv-scanner"),
			["#!/bin/sh", "printf 'osv scan failed\\n' >&2", "exit 7", ""].join("\n"),
			"utf8",
		);
		chmodSync(join(binDir, "osv-scanner"), 0o755);
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(
				["deps", "--release", "--json"],
				root,
				binDir,
			);
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
			expect(payload.reason).toContain("osv scan failed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance scanner probe failures are failed outcomes", () => {
		const root = mkdtempSync(
			join(tmpdir(), "security-scan-provenance-failure-"),
		);
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

	test("release provenance marks available scanners as skipped with waiver", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-provenance-skip-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(
			join(binDir, "osv-scanner"),
			"#!/bin/sh\nprintf 'osv-scanner 2.4.0\\n'\nexit 0\n",
			"utf8",
		);
		writeFileSync(
			join(binDir, "gitleaks"),
			"#!/bin/sh\nprintf 'gitleaks 8.30.1\\n'\nexit 0\n",
			"utf8",
		);
		chmodSync(join(binDir, "osv-scanner"), 0o755);
		chmodSync(join(binDir, "gitleaks"), 0o755);

		try {
			const outcomes = buildReleaseSecurityScanOutcomes({
				...process.env,
				PATH: binDir,
			});
			expect(outcomes).toContainEqual(
				expect.objectContaining({
					tool: "gitleaks",
					kind: "secrets",
					mode: "release",
					status: "skipped",
					version: "gitleaks 8.30.1",
					waiver_required: true,
				}),
			);
			expect(outcomes).toContainEqual(
				expect.objectContaining({
					tool: "osv-scanner",
					kind: "deps",
					mode: "release",
					status: "skipped",
					version: "osv-scanner 2.4.0",
					waiver_required: true,
				}),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
