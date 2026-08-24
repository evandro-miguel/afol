import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import { releaseArtifactPath } from "../dev/build-release";
import {
	buildReleaseSecurityScanOutcomes,
	runReleaseSecurityScans,
} from "../dev/security-scan";
import {
	directoryReparseTestSupport,
	symlinkTestSupport,
} from "./symlink-test-support";

const repoRoot = join(import.meta.dir, "..", "..");
const RELEASE_ARTIFACT = releaseArtifactPath("dist/afol");

type MockScannerOptions = {
	version?: string;
	exitCode?: number;
	stdout?: string;
	stderr?: string;
	logPath?: string;
	invocationPathLog?: string;
	replaceExecutableOnVersion?: boolean;
};

function writeMockScanner(
	binDir: string,
	name: string,
	options: MockScannerOptions = {},
): void {
	const version = options.version ?? `${name} test`;
	const supportsVersion =
		options.version !== undefined || (options.exitCode ?? 0) === 0;
	const executable = join(
		binDir,
		process.platform === "win32" ? `${name}.cmd` : name,
	);
	if (process.platform === "win32") {
		const scriptPath = join(binDir, `${name}-fixture.js`);
		const script = [
			'const fs = require("node:fs");',
			"const args = process.argv.slice(2);",
			...(supportsVersion
				? [
						`if (args[0] === "--version") { ${
							options.replaceExecutableOnVersion
								? `fs.writeFileSync(${JSON.stringify(executable)}, "@echo off\\r\\nexit /b 0\\r\\n", "utf8"); `
								: ""
						}process.stdout.write(${JSON.stringify(`${version}\n`)}); process.exit(0); }`,
					]
				: []),
			...(options.logPath
				? [
						`fs.appendFileSync(${JSON.stringify(options.logPath)}, args.join(" ") + "\\n");`,
					]
				: []),
			...(options.stdout
				? [`process.stdout.write(${JSON.stringify(`${options.stdout}\n`)});`]
				: []),
			...(options.stderr
				? [`process.stderr.write(${JSON.stringify(`${options.stderr}\n`)});`]
				: []),
			`process.exit(${options.exitCode ?? 0});`,
		].join("\n");
		writeFileSync(scriptPath, script, "utf8");
		writeFileSync(
			executable,
			`@echo off\r\n${options.invocationPathLog ? `echo %~f0>>"${options.invocationPathLog}"\r\n` : ""}"${process.execPath}" "${scriptPath}" %*\r\n`,
			"utf8",
		);
		return;
	}

	const script = [
		"#!/bin/sh",
		...(options.invocationPathLog
			? [
					`printf '%s\\n' "$0" >> '${options.invocationPathLog.replaceAll("'", "'\\''")}'`,
				]
			: []),
		...(supportsVersion
			? [
					`if [ "$1" = "--version" ]; then ${
						options.replaceExecutableOnVersion
							? `printf '#!/bin/sh\\nexit 0\\n' > '${executable.replaceAll("'", "'\\''")}'; `
							: ""
					}printf '${version}\\n'; exit 0; fi`,
				]
			: []),
		...(options.logPath
			? [`printf '%s\\n' "$*" >> '${options.logPath.replaceAll("'", "'\\''")}'`]
			: []),
		...(options.stdout ? [`printf '%s\\n' '${options.stdout}'`] : []),
		...(options.stderr ? [`printf '%s\\n' '${options.stderr}' >&2`] : []),
		`exit ${options.exitCode ?? 0}`,
		"",
	].join("\n");
	writeFileSync(executable, script, "utf8");
	chmodSync(executable, 0o755);
}

function scannerPath(binDir: string): string {
	return `${binDir}${delimiter}${process.env.PATH ?? ""}`;
}

function runSecurityScan(
	args: string[],
	cwd: string,
	pathDir?: string,
	envOverrides: NodeJS.ProcessEnv = {},
) {
	return spawnSync(
		process.execPath,
		[join(repoRoot, "cli/dev/security-scan.ts"), ...args],
		{
			cwd,
			encoding: "utf8",
			env: {
				...process.env,
				AFOL_OSV_SCANNER_PATH: undefined,
				AFOL_GITLEAKS_PATH: undefined,
				...envOverrides,
				PATH: pathDir ?? mkdtempSync(join(tmpdir(), "security-scan-path-")),
			},
			shell: false,
		},
	);
}

function scannerExecutable(binDir: string, name: string): string {
	return join(binDir, process.platform === "win32" ? `${name}.cmd` : name);
}

function pinnedReleaseScannerEnvironment(binDir: string): NodeJS.ProcessEnv {
	return {
		AFOL_OSV_SCANNER_PATH: scannerExecutable(binDir, "osv-scanner"),
		AFOL_GITLEAKS_PATH: scannerExecutable(binDir, "gitleaks"),
	};
}

function gitEnv(pathDir?: string): NodeJS.ProcessEnv {
	return {
		...process.env,
		...(pathDir ? { PATH: scannerPath(pathDir) } : {}),
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
				status: "errored",
				waiver_required: true,
			});
			expect(payload.reason).toContain("AFOL_OSV_SCANNER_PATH");
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
		writeMockScanner(binDir, "gitleaks");

		try {
			const result = runSecurityScan(
				["secrets", "--release", "--json"],
				root,
				binDir,
				pinnedReleaseScannerEnvironment(binDir),
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

	test("release scan fails closed when a scanner changes after its version probe", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-release-swap-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		writeMockScanner(binDir, "osv-scanner", {
			version: "osv-scanner 2.4.0",
			replaceExecutableOnVersion: true,
		});

		try {
			const result = runSecurityScan(
				["deps", "--release", "--json"],
				root,
				binDir,
				pinnedReleaseScannerEnvironment(binDir),
			);
			expect(result.status).toBe(1);
			const payload = JSON.parse(result.stdout || "{}");
			expect(payload).toMatchObject({
				tool: "osv-scanner",
				kind: "deps",
				mode: "release",
				status: "errored",
				waiver_required: true,
			});
			expect(payload.reason).toContain("changed after trust validation");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release scan executes a private verified copy instead of the configured pathname", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-release-copy-"));
		const binDir = join(root, "bin");
		const invocationPathLog = join(root, "scanner-path.log");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		writeMockScanner(binDir, "osv-scanner", {
			version: "osv-scanner 2.4.0",
			invocationPathLog,
		});

		try {
			const configured = scannerExecutable(binDir, "osv-scanner");
			const result = runSecurityScan(
				["deps", "--release", "--json"],
				root,
				binDir,
				{ AFOL_OSV_SCANNER_PATH: configured },
			);
			expect(result.status).toBe(0);
			const invoked = readFileSync(invocationPathLog, "utf8")
				.trim()
				.split(/\r?\n/);
			expect(invoked.length).toBeGreaterThanOrEqual(2);
			for (const path of invoked) {
				expect(path).not.toBe(configured);
				expect(path).toContain("afol-release-scanner-");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release deps scan rejects osv fallback when osv-scanner is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-osv-fallback-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		writeMockScanner(binDir, "osv", { version: "osv fallback 1.0" });

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
				status: "errored",
				waiver_required: true,
			});
			expect(payload.reason).toContain("AFOL_OSV_SCANNER_PATH");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("secrets scan covers git history and current worktree", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-secrets-"));
		const binDir = join(root, "bin");
		const logPath = join(root, "gitleaks-args.log");
		mkdirSync(binDir, { recursive: true });
		writeMockScanner(binDir, "gitleaks", {
			version: "gitleaks test",
			logPath,
		});

		try {
			const result = runSecurityScan(
				["secrets", "--release", "--json"],
				root,
				binDir,
				pinnedReleaseScannerEnvironment(binDir),
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
		writeFileSync(join(root, RELEASE_ARTIFACT), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		for (const [name, version] of [
			["osv-scanner", "osv-scanner 2.4.0"],
			["gitleaks", "gitleaks 8.30.1"],
		] as const) {
			writeMockScanner(binDir, name, { version });
		}
		const env = gitEnv(binDir);
		const commitSha = commitFixture(root, env);

		try {
			const result = runSecurityScan(
				["release"],
				root,
				scannerPath(binDir),
				pinnedReleaseScannerEnvironment(binDir),
			);
			expect(result.status).toBe(0);
			expect(result.stdout).toContain(
				join("dist", "security-scan.release.json"),
			);

			const report = JSON.parse(
				readFileSync(join(root, "dist/security-scan.release.json"), "utf8"),
			);
			const artifactSha = createHash("sha256")
				.update(readFileSync(join(root, RELEASE_ARTIFACT)))
				.digest("hex");
			const lockSha = createHash("sha256")
				.update(readFileSync(join(root, "bun.lock")))
				.digest("hex");
			const osvPath = scannerExecutable(binDir, "osv-scanner");
			const gitleaksPath = scannerExecutable(binDir, "gitleaks");
			expect(report).toMatchObject({
				mode: "release",
				target: {
					artifact: RELEASE_ARTIFACT,
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
						executable_path: osvPath,
						executable_sha256: createHash("sha256")
							.update(readFileSync(osvPath))
							.digest("hex"),
					}),
					expect.objectContaining({
						tool: "gitleaks",
						kind: "secrets",
						status: "passed",
						version: "gitleaks 8.30.1",
						executable_path: gitleaksPath,
						executable_sha256: createHash("sha256")
							.update(readFileSync(gitleaksPath))
							.digest("hex"),
					}),
				]),
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release scan refuses scanner shims discovered only through PATH", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-path-shim-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		mkdirSync(join(root, "dist"), { recursive: true });
		writeFileSync(join(root, RELEASE_ARTIFACT), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		writeMockScanner(binDir, "osv-scanner", { version: "osv-scanner shim" });
		writeMockScanner(binDir, "gitleaks", { version: "gitleaks shim" });
		commitFixture(root, gitEnv(binDir));

		try {
			const result = runSecurityScan(["release"], root, scannerPath(binDir));
			expect(result.status).toBe(1);
			const report = JSON.parse(
				readFileSync(join(root, "dist/security-scan.release.json"), "utf8"),
			);
			expect(report.scans).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						tool: "osv-scanner",
						status: "errored",
						reason: expect.stringContaining("AFOL_OSV_SCANNER_PATH"),
					}),
					expect.objectContaining({
						tool: "gitleaks",
						status: "errored",
						reason: expect.stringContaining("AFOL_GITLEAKS_PATH"),
					}),
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"release scan rejects a scanner path that traverses a reparse point",
		() => {
			const root = mkdtempSync(join(tmpdir(), "security-scan-scanner-link-"));
			const external = mkdtempSync(
				join(tmpdir(), "security-scan-scanner-link-target-"),
			);
			const binDir = join(root, "bin");
			mkdirSync(binDir, { recursive: true });
			writeFileSync(join(root, "bun.lock"), "", "utf8");
			writeMockScanner(external, "osv-scanner");
			symlinkSync(
				scannerExecutable(external, "osv-scanner"),
				scannerExecutable(binDir, "osv-scanner"),
				"file",
			);

			try {
				const result = runSecurityScan(
					["deps", "--release", "--json"],
					root,
					binDir,
					{ AFOL_OSV_SCANNER_PATH: scannerExecutable(binDir, "osv-scanner") },
				);
				expect(result.status).toBe(1);
				const payload = JSON.parse(result.stdout || "{}");
				expect(payload).toMatchObject({
					status: "errored",
					reason: expect.stringContaining("must not traverse"),
				});
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(external, { recursive: true, force: true });
			}
		},
	);

	test("release scan rejects a scanner path that is not a regular file", () => {
		const root = mkdtempSync(
			join(tmpdir(), "security-scan-scanner-directory-"),
		);
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(
				["deps", "--release", "--json"],
				root,
				binDir,
				{ AFOL_OSV_SCANNER_PATH: binDir },
			);
			expect(result.status).toBe(1);
			const payload = JSON.parse(result.stdout || "{}");
			expect(payload).toMatchObject({
				status: "errored",
				reason: expect.stringContaining("regular file"),
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!directoryReparseTestSupport.available)(
		"release scan fails closed when dist is a symlink outside the release root",
		() => {
			const root = mkdtempSync(join(tmpdir(), "security-scan-reparse-root-"));
			const external = mkdtempSync(
				join(tmpdir(), "security-scan-reparse-external-"),
			);
			const binDir = join(root, "bin");
			mkdirSync(binDir, { recursive: true });
			writeFileSync(join(root, "bun.lock"), "", "utf8");
			writeFileSync(
				join(external, basename(RELEASE_ARTIFACT)),
				"artifact",
				"utf8",
			);
			symlinkSync(
				external,
				join(root, "dist"),
				process.platform === "win32" ? "junction" : "dir",
			);

			try {
				const result = runSecurityScan(["release"], root, binDir);
				expect(result.status).not.toBe(0);
				expect(result.stderr).toContain("release output directory");
				expect(existsSync(join(external, "security-scan.release.json"))).toBe(
					false,
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(external, { recursive: true, force: true });
			}
		},
	);
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
		writeMockScanner(binDir, "osv-scanner", {
			version: "osv-scanner 2.4.0",
			stderr: "api.osv.dev blocked",
			exitCode: 7,
		});
		writeMockScanner(binDir, "gitleaks", { version: "gitleaks 8.30.1" });

		try {
			const result = runSecurityScan(
				["release"],
				root,
				binDir,
				pinnedReleaseScannerEnvironment(binDir),
			);
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
		if (process.platform === "win32") {
			writeFileSync(
				join(binDir, "osv-scanner.exe"),
				"not a real binary\r\n",
				"utf8",
			);
		} else {
			writeFileSync(join(binDir, "osv-scanner"), "not a real binary\n", "utf8");
			chmodSync(join(binDir, "osv-scanner"), 0o755);
		}
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(
				["deps", "--release", "--json"],
				root,
				binDir,
				{
					AFOL_OSV_SCANNER_PATH: join(
						binDir,
						process.platform === "win32" ? "osv-scanner.exe" : "osv-scanner",
					),
				},
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
		writeMockScanner(binDir, "osv-scanner", {
			stderr: "osv scan failed",
			exitCode: 7,
		});
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const result = runSecurityScan(
				["deps", "--release", "--json"],
				root,
				binDir,
				pinnedReleaseScannerEnvironment(binDir),
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
		writeMockScanner(binDir, "osv-scanner", { exitCode: 9 });
		writeMockScanner(binDir, "gitleaks");

		try {
			const outcomes = buildReleaseSecurityScanOutcomes({
				...process.env,
				PATH: scannerPath(binDir),
				...pinnedReleaseScannerEnvironment(binDir),
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
		writeMockScanner(binDir, "osv-scanner", { version: "osv-scanner 2.4.0" });
		writeMockScanner(binDir, "gitleaks", { version: "gitleaks 8.30.1" });

		try {
			const outcomes = buildReleaseSecurityScanOutcomes({
				...process.env,
				PATH: scannerPath(binDir),
				...pinnedReleaseScannerEnvironment(binDir),
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

	test("release provenance fails closed when a scanner changes during its probe", () => {
		const root = mkdtempSync(join(tmpdir(), "security-scan-provenance-swap-"));
		const binDir = join(root, "bin");
		mkdirSync(binDir, { recursive: true });
		writeMockScanner(binDir, "osv-scanner", {
			version: "osv-scanner 2.4.0",
			replaceExecutableOnVersion: true,
		});
		writeMockScanner(binDir, "gitleaks", { version: "gitleaks 8.30.1" });

		try {
			const outcomes = buildReleaseSecurityScanOutcomes({
				...process.env,
				PATH: scannerPath(binDir),
				...pinnedReleaseScannerEnvironment(binDir),
			});
			expect(outcomes).toContainEqual(
				expect.objectContaining({
					tool: "osv-scanner",
					kind: "deps",
					mode: "release",
					status: "errored",
					reason: expect.stringContaining("changed after trust validation"),
				}),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
