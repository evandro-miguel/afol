import { describe, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
	compiledReleaseBuildArgs,
	DEFAULT_BUILD_COMMAND,
	releaseArtifactPath,
	writeCompiledReleaseBuildReceipt,
} from "../dev/build-release";
import {
	buildReleaseProvenance,
	writeReleaseProvenance,
} from "../dev/release-provenance";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";
import { directoryReparseTestSupport } from "./symlink-test-support";

const repoRoot = join(import.meta.dir, "..", "..");
const RELEASE_ARTIFACT = releaseArtifactPath("dist/afol");
const RELEASE_ARTIFACT_NAME = releaseArtifactPath("afol");
const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseScriptIncludes(script: string): string[] {
	const tokens = script.trim().split(/\s+/);
	const includes: string[] = [];
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "--include") {
			const value = tokens[index + 1];
			if (value) includes.push(value);
			index += 1;
		} else if (token?.startsWith("--include=")) {
			includes.push(token.slice("--include=".length));
		}
	}
	return includes;
}

function writeReleasePackageMetadata(
	root: string,
	options: {
		packageJsonName?: string;
		packageJsonVersion?: string;
	} = {},
): void {
	const packageJsonName = options.packageJsonName ?? CLI_PACKAGE_NAME;
	const packageJsonVersion = options.packageJsonVersion ?? CLI_VERSION;
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify(
			{
				name: packageJsonName,
				version: packageJsonVersion,
			},
			null,
			2,
		),
		"utf8",
	);
}

function writeReleaseVersionRegistry(
	root: string,
	options: {
		packageJsonName?: string;
		packageJsonVersion?: string;
		registryPackageName?: string;
		registryVersion?: string;
	} = {},
): void {
	const packageJsonName = options.packageJsonName ?? CLI_PACKAGE_NAME;
	const packageJsonVersion = options.packageJsonVersion ?? CLI_VERSION;
	const registryPackageName = options.registryPackageName ?? packageJsonName;
	const registryVersion = options.registryVersion ?? packageJsonVersion;
	mkdirSync(join(root, ".afol", "adm", "source"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "adm", "source", "release-version.json"),
		JSON.stringify(
			{
				packageName: registryPackageName,
				currentVersion: registryVersion,
			},
			null,
			2,
		),
		"utf8",
	);
	writeReleasePackageMetadata(root, { packageJsonName, packageJsonVersion });
}

type MockScannerOptions = {
	version?: string;
	exitCode?: number;
	stdout?: string;
	stderr?: string;
	logPath?: string;
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
						`if (args[0] === "--version") { process.stdout.write(${JSON.stringify(`${version}\n`)}); process.exit(0); }`,
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
			`@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`,
			"utf8",
		);
		return;
	}

	const script = [
		"#!/bin/sh",
		...(supportsVersion
			? [`if [ "$1" = "--version" ]; then printf '${version}\\n'; exit 0; fi`]
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

function pinnedReleaseScannerEnvironment(binDir: string): NodeJS.ProcessEnv {
	return {
		AFOL_OSV_SCANNER_PATH: join(
			binDir,
			process.platform === "win32" ? "osv-scanner.cmd" : "osv-scanner",
		),
		AFOL_GITLEAKS_PATH: join(
			binDir,
			process.platform === "win32" ? "gitleaks.cmd" : "gitleaks",
		),
	};
}

function writeFakeReleaseScanners(binDir: string): void {
	mkdirSync(binDir, { recursive: true });
	for (const [name, version] of [
		["osv-scanner", "osv-scanner 2.4.0"],
		["gitleaks", "gitleaks 8.30.1"],
	] as const) {
		writeMockScanner(binDir, name, { version });
	}
}

function writePortableReleaseScanners(binDir: string): void {
	mkdirSync(binDir, { recursive: true });
	for (const name of ["osv-scanner", "gitleaks"]) {
		const suffix = process.platform === "win32" ? ".cmd" : "";
		const content =
			process.platform === "win32"
				? "@echo off\r\nexit /b 0\r\n"
				: "#!/bin/sh\nexit 0\n";
		const path = join(binDir, `${name}${suffix}`);
		writeFileSync(path, content, "utf8");
		if (process.platform !== "win32") chmodSync(path, 0o755);
	}
}

function supportsDirectoryLink(): boolean {
	const root = mkdtempSync(
		join(tmpdir(), "release-provenance-link-capability-"),
	);
	const target = join(root, "target");
	const link = join(root, "link");
	try {
		mkdirSync(target);
		symlinkSync(
			target,
			link,
			process.platform === "win32" ? "junction" : "dir",
		);
		return true;
	} catch {
		return false;
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

const hasDirectoryLinkCapability = supportsDirectoryLink();

function fileSha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readCommitSha(root: string): string {
	const result = spawnSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
		shell: false,
	});
	if (result.error || result.status !== 0) {
		return "unknown";
	}
	const sha = result.stdout.trim();
	return sha.length > 0 ? sha : "unknown";
}

function securityEvidenceTarget(
	root: string,
	overrides: Partial<Record<string, string>> = {},
): Record<string, string> {
	const artifact = RELEASE_ARTIFACT;
	const artifactPath = join(root, artifact);
	const lockPath = join(root, "bun.lock");
	return {
		artifact,
		artifact_sha256: existsSync(artifactPath)
			? fileSha256(artifactPath)
			: "unknown",
		commit_sha: readCommitSha(root),
		lockfile: existsSync(lockPath) ? "bun.lock" : "unknown",
		lock_sha256: existsSync(lockPath) ? fileSha256(lockPath) : "unknown",
		...overrides,
	};
}

function writePassingSecurityEvidence(
	root: string,
	options: {
		target?: Partial<Record<string, string>>;
		targetErrors?: string[];
		generatedAt?: string;
	} = {},
): void {
	mkdirSync(join(root, "dist"), { recursive: true });
	writeFileSync(
		join(root, "dist", "security-scan.release.json"),
		JSON.stringify(
			{
				generated_at: options.generatedAt ?? new Date().toISOString(),
				mode: "release",
				target: securityEvidenceTarget(root, options.target),
				...(options.targetErrors
					? { target_errors: options.targetErrors }
					: {}),
				scans: [
					{
						tool: "osv-scanner",
						kind: "deps",
						mode: "release",
						status: "passed",
						version: "osv-scanner 2.4.0",
					},
					{
						tool: "gitleaks",
						kind: "secrets",
						mode: "release",
						status: "passed",
						version: "gitleaks 8.30.1",
					},
				],
			},
			null,
			2,
		),
		"utf8",
	);
}

function runGit(root: string, args: string[], env: NodeJS.ProcessEnv): void {
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

function commitReleaseFixture(root: string, env: NodeJS.ProcessEnv): void {
	const artifactPath = join(root, RELEASE_ARTIFACT);
	if (existsSync(artifactPath)) {
		writeCompiledReleaseBuildReceipt(
			artifactPath,
			compiledReleaseBuildArgs("cli/main.ts", RELEASE_ARTIFACT),
		);
	}
	runGit(root, ["init"], env);
	runGit(root, ["add", "-A"], env);
	runGit(root, ["commit", "--no-verify", "-m", "test release provenance"], env);
}

function splitScriptSteps(script: string | undefined): string[] {
	return (script ?? "")
		.split(/\s*&&\s*/)
		.map((step) => step.trim())
		.filter((step) => step.length > 0);
}

describe("release and toolchain contracts", () => {
	test.skipIf(!directoryReparseTestSupport.available)(
		"provenance refuses a dist directory reparse point before writing receipts",
		() => {
			const root = mkdtempSync(
				join(tmpdir(), "release-provenance-reparse-root-"),
			);
			const external = mkdtempSync(
				join(tmpdir(), "release-provenance-reparse-external-"),
			);
			try {
				writeFileSync(
					join(root, "package.json"),
					JSON.stringify({ name: CLI_PACKAGE_NAME, version: CLI_VERSION }),
					"utf8",
				);
				writeFileSync(join(root, "bun.lock"), "", "utf8");
				writeFileSync(
					join(external, RELEASE_ARTIFACT_NAME),
					"artifact",
					"utf8",
				);
				symlinkSync(
					external,
					join(root, "dist"),
					process.platform === "win32" ? "junction" : "dir",
				);

				expect(() => writeReleaseProvenance({ cwd: root })).toThrow(
					/release output directory/,
				);
				expect(
					existsSync(join(external, `${RELEASE_ARTIFACT_NAME}.sha256`)),
				).toBe(false);
				expect(
					existsSync(
						join(external, `${RELEASE_ARTIFACT_NAME}.provenance.json`),
					),
				).toBe(false);
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(external, { recursive: true, force: true });
			}
		},
	);

	test("package scripts pin stable TypeScript and keep strict release gates", () => {
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as {
			scripts?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const scripts = pkg.scripts ?? {};

		expect(pkg.devDependencies?.typescript).toBe("7.0.2");
		expect(scripts.typecheck).toBe("tsc --noEmit -p tsconfig.json");
		expect(scripts["typecheck:ts7:informative"]).toBeUndefined();
		expect(scripts["lint:biome"]).toContain("biome check cli");
		expect(scripts["lint:biome"]).not.toContain("--formatter-enabled=false");
		expect(scripts["lint:biome"]).toContain("--line-ending=lf");
		expect(scripts["lint:knip"]).toBe(
			"knip --dependencies --use-tsconfig-files --max-issues 0",
		);
		expect(scripts["lint:knip:informative"]).toBe(
			"knip --dependencies --use-tsconfig-files --max-issues 20",
		);
		expect(scripts["validate:security"]).toBe(
			"bun run security:scan:informative",
		);
		expect(scripts["validate:security:required"]).toBe(
			"bun run security:scan:required",
		);
		expect(scripts["validate:security:release"]).toBe(
			"bun run security:scan:release",
		);
		expect(scripts["security:scan:release"]).toBe(
			"bun run cli/dev/security-scan.ts release",
		);
		expect(scripts["toolchain:diff"]).toBe(
			"bun run cli/dev/toolchain-smoke.ts",
		);
		expect(scripts.build).toBe(
			"bun run version:generate && bun run cli/dev/build-release.ts",
		);
		expect(scripts["build:deterministic"]).toBe(
			"bun install --frozen-lockfile && bun test cli/tests/reproducible-build.test.ts && bun run build",
		);
		expect(scripts["smoke:wsl2"]).toBe("bun run cli/dev/dist-smoke.ts --wsl2");
		expect(scripts["smoke:clean"]).toBe("bun run cli/dev/clean-smoke.ts");
		expect(scripts["validate:toolchain"]).toBe(
			"bun run version:check && bun run manifest:check && bun run lint:biome && bun run lint:oxlint && bun run lint:knip && bun run toolchain:diff",
		);
		expect(scripts["validate:release"]).not.toContain(
			"bun run validate:security:required",
		);
		expect(scripts["validate:release"]).not.toContain(
			"bun run local-state:rebuild",
		);
		expect(scripts["validate:release"]).not.toContain(
			"bun run validate:project",
		);
		expect(scripts["validate:project"]).toBe(
			"bun run kernel -- v project --strict --json",
		);
		expect(scripts["validate:release"]).toContain("bun run typecheck");
		expect(scripts["validate:release"]).toContain("bun run public:audit -- .");
		expect(scripts["test:full"]).toBe("bun run cli/dev/full-test.ts");
		expect(scripts["validate:release"]).toContain("bun run test:full");
		expect(scripts["validate:release"]).toContain("bun run coverage:check");
		if (scripts["validate:ux-governance"]) {
			expect(scripts["validate:ux-governance"]).toBe(
				"bun run kernel -- ux validate --json && bun run kernel -- v bench --pack governance-history --timing-mode observe --json",
			);
		}
		expect(scripts["validate:release"]).not.toContain(
			"bun run validate:ux-governance",
		);
		expect(scripts["validate:release"]).toContain("bun run smoke:clean");
		expect(scripts["validate:release"]).toContain(
			"bun run release:provenance:release",
		);
		expect(scripts["release:windows"]).toBe(
			"bun run test:full && bun run build && bun run validate:security:release && bun run release:provenance:release && bun run smoke:dist && bun run smoke:clean",
		);
		const windowsReleaseSteps = splitScriptSteps(scripts["release:windows"]);
		expect(windowsReleaseSteps).toHaveLength(6);
		expect(windowsReleaseSteps[0]).toBe("bun run test:full");
		expect(windowsReleaseSteps[1]).toBe("bun run build");
		expect(windowsReleaseSteps[2]).toBe("bun run validate:security:release");
		expect(windowsReleaseSteps[3]).toBe("bun run release:provenance:release");
		expect(windowsReleaseSteps[4]).toBe("bun run smoke:dist");
		expect(windowsReleaseSteps[5]).toBe("bun run smoke:clean");
		const releaseSteps = splitScriptSteps(scripts["validate:release"]);
		const stepIndex = (step: string) => releaseSteps.indexOf(step);
		expect(releaseSteps[0]).toBe("bun run validate:toolchain");
		expect(releaseSteps).not.toContain(
			"bun run kernel -- v bench --pack token-economy --pack cli-kernel-local --json",
		);
		for (const step of [
			"bun run smoke:dist",
			"bun run smoke:clean",
			"bun run validate:security:release",
			"bun run release:provenance:release",
		]) {
			expect(stepIndex(step)).toBeGreaterThanOrEqual(0);
		}
		expect(stepIndex("bun run smoke:dist")).toBeLessThan(
			stepIndex("bun run smoke:clean"),
		);
		expect(stepIndex("bun run validate:bootstrap")).toBeLessThan(
			stepIndex("bun run test:full"),
		);
		expect(stepIndex("bun run test:full")).toBeLessThan(
			stepIndex("bun run coverage:check"),
		);
		expect(stepIndex("bun run validate:security:release")).toBeLessThan(
			stepIndex("bun run release:provenance:release"),
		);
		expect(stepIndex("bun run release:provenance:release")).toBeLessThan(
			stepIndex("bun run smoke:dist"),
		);
		expect(scripts["coverage:check"]).toBe(
			"bun run cli/dev/coverage-check.ts --include cli/dev/release-provenance.ts --include cli/commands/bootstrap.ts --include cli/commands/validate.ts --isolate --timeout 30000 cli/tests/bootstrap-cleanup.test.ts cli/tests/bootstrap-conflicts.test.ts cli/tests/bootstrap-template-cleanliness.test.ts cli/tests/bootstrap.test.ts cli/tests/coverage-check.test.ts cli/tests/help.test.ts cli/tests/kernel.test.ts cli/tests/operation-context.test.ts cli/tests/registry.test.ts cli/tests/release-toolchain.test.ts cli/tests/validate-command.test.ts cli/tests/version-metadata.test.ts",
		);
		expect(scripts["coverage:check"]).toContain(
			"cli/tests/coverage-check.test.ts",
		);
		if (scripts["coverage:project-benchmarks"]) {
			expect(scripts["coverage:project-benchmarks"]).toBe(
				"bun run cli/dev/coverage-check.ts --include cli/commands/project-benchmark.ts --include cli/services/project-benchmark/catalog.ts --include cli/services/project-benchmark/generate.ts --include cli/services/project-benchmark/matrix.ts --include cli/services/project-benchmark/paths.ts --include cli/services/project-benchmark/render.ts --include cli/services/project-benchmark/schema.ts --include cli/services/project-benchmark/scoring.ts --include cli/services/project-benchmark/types.ts --include cli/services/project-benchmark/validate-project-relations.ts --include cli/services/project-benchmark/validate-project-shape.ts --include cli/services/project-benchmark/validate.ts --include cli/services/project-benchmark/validation-utils.ts --max-concurrency 1 --timeout 30000 cli/tests/project-benchmark-command.test.ts cli/tests/project-benchmark-validation.test.ts cli/tests/registry.test.ts cli/tests/help.test.ts cli/tests/kernel.test.ts cli/tests/operation-context.test.ts cli/tests/validation.test.ts",
			);
			expect(scripts["validate:mutation-performance"]).toBe(
				"bun run kernel -- v bench --pack mutation-safety --json",
			);
			expect(scripts["validate:project-benchmarks"]).toContain(
				"bun run validate:mutation-performance && bun run coverage:project-benchmarks",
			);
		}
	});

	test("Biome formatter gate rejects malformed TypeScript", () => {
		const root = mkdtempSync(join(tmpdir(), "biome-format-gate-"));
		const source = join(root, "malformed.ts");
		try {
			writeFileSync(source, "const value={foo:1};\r\n", "utf8");
			const result = spawnSync(
				process.execPath,
				["x", "biome", "check", source, "--line-ending=lf"],
				{ cwd: repoRoot, encoding: "utf8" },
			);
			expect(result.status).not.toBe(0);
			expect(`${result.stdout}${result.stderr}`).toMatch(/format/i);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release build receipt write cleans temporary outputs on write failure", () => {
		const root = mkdtempSync(join(tmpdir(), "release-receipt-write-failure-"));
		const artifactPath = join(root, RELEASE_ARTIFACT);
		const artifactDir = join(root, "dist");
		mkdirSync(artifactDir, { recursive: true });
		writeFileSync(artifactPath, "artifact", "utf8");
		const artifactParts = RELEASE_ARTIFACT.split(/[\\/]/);
		const receiptFileName = `${artifactParts[artifactParts.length - 1]}.build.json`;

		const originalWriteFileSync = nodeFs.writeFileSync;
		let writeAttempts = 0;
		const writeSpy = spyOn(nodeFs, "writeFileSync").mockImplementation(
			(...args: Parameters<typeof nodeFs.writeFileSync>) => {
				const path = args[0];
				if (
					typeof path === "string" &&
					path
						.replaceAll("\\", "/")
						.includes(`${RELEASE_ARTIFACT_NAME}.build.json`) &&
					++writeAttempts === 1
				) {
					throw new Error("simulated write failure");
				}
				return originalWriteFileSync(...args);
			},
		);
		try {
			expect(() =>
				writeCompiledReleaseBuildReceipt(
					artifactPath,
					compiledReleaseBuildArgs("cli/main.ts", RELEASE_ARTIFACT),
					root,
				),
			).toThrow("simulated write failure");
			expect(
				readdirSync(artifactDir).filter((entry) =>
					entry.startsWith(receiptFileName),
				),
			).toHaveLength(0);
		} finally {
			writeSpy.mockRestore();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release build receipt writes can be retried after a transient write failure", () => {
		const root = mkdtempSync(join(tmpdir(), "release-receipt-reacquire-"));
		const artifactPath = join(root, RELEASE_ARTIFACT);
		const artifactDir = join(root, "dist");
		mkdirSync(artifactDir, { recursive: true });
		writeFileSync(artifactPath, "artifact", "utf8");
		const artifactParts = RELEASE_ARTIFACT.split(/[\\/]/);
		const receiptFileName = `${artifactParts[artifactParts.length - 1]}.build.json`;

		const originalWriteFileSync = nodeFs.writeFileSync;
		let writeAttempts = 0;
		const writeSpy = spyOn(nodeFs, "writeFileSync").mockImplementation(
			(...args: Parameters<typeof nodeFs.writeFileSync>) => {
				const path = args[0];
				if (
					typeof path === "string" &&
					path
						.replaceAll("\\", "/")
						.includes(`${RELEASE_ARTIFACT_NAME}.build.json`) &&
					++writeAttempts === 1
				) {
					throw new Error("simulated write failure");
				}
				return originalWriteFileSync(...args);
			},
		);
		try {
			expect(() =>
				writeCompiledReleaseBuildReceipt(
					artifactPath,
					compiledReleaseBuildArgs("cli/main.ts", RELEASE_ARTIFACT),
					root,
				),
			).toThrow("simulated write failure");
			expect(() =>
				writeCompiledReleaseBuildReceipt(
					artifactPath,
					compiledReleaseBuildArgs("cli/main.ts", RELEASE_ARTIFACT),
					root,
				),
			).not.toThrow();
			const receiptPath = join(artifactDir, receiptFileName);
			const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
			expect(receipt.artifact_sha256).toBe(
				createHash("sha256").update("artifact").digest("hex"),
			);
			expect(
				readdirSync(artifactDir).filter((entry) =>
					entry.startsWith(receiptFileName),
				),
			).toHaveLength(1);
		} finally {
			writeSpy.mockRestore();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("coverage scripts track every project-benchmark source file", () => {
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as { scripts?: Record<string, string> };
		const scripts = pkg.scripts ?? {};
		if (!scripts["coverage:project-benchmarks"]) return;
		const sourcePrefix = "cli/services/project-benchmark/";
		const expectedSources = readdirSync(join(repoRoot, sourcePrefix), {
			withFileTypes: true,
		})
			.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
			.map((entry) => `${sourcePrefix}${entry.name}`)
			.sort();

		for (const scriptName of ["coverage:project-benchmarks"]) {
			const actualSources = parseScriptIncludes(scripts[scriptName] ?? "")
				.filter((path) => path.startsWith(sourcePrefix))
				.sort();
			expect(actualSources, scriptName).toEqual(expectedSources);
		}
	});

	test("public alpha uses the local-only release contract", () => {
		const dir = join(repoRoot, ".github", "workflows");
		expect(existsSync(dir)).toBe(false);
	});

	test("Windows exposes the canonical local release sequence", () => {
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as {
			scripts?: Record<string, string>;
		};
		expect(pkg.scripts?.["release:windows"]).toBe(
			"bun run test:full && bun run build && bun run validate:security:release && bun run release:provenance:release && bun run smoke:dist && bun run smoke:clean",
		);
	});

	test("validate:release executes strict gates in order with stubbed steps", () => {
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as {
			scripts?: Record<string, string>;
		};
		const releaseScript = pkg.scripts?.["validate:release"];
		if (typeof releaseScript !== "string") {
			throw new Error("missing validate:release script");
		}
		const expectedSteps = [
			"validate:toolchain",
			"public:audit",
			"typecheck",
			"validate:template",
			"validate:bootstrap",
			"test:full",
			"coverage:check",
			"build:deterministic",
			"validate:security:release",
			"release:provenance:release",
			"smoke:dist",
			"smoke:clean",
		];
		const root = mkdtempSync(join(tmpdir(), "validate-release-script-"));
		try {
			writeFileSync(
				join(root, "mark.ts"),
				[
					'import { appendFileSync } from "node:fs";',
					'appendFileSync("order.log", (process.argv[2] ?? "missing") + "\\n");',
					"",
				].join("\n"),
				"utf8",
			);
			const scripts: Record<string, string> = {
				"validate:release": releaseScript,
				kernel: "bun run mark.ts kernel",
			};
			for (const step of expectedSteps) {
				scripts[step] = `bun run mark.ts ${step}`;
			}
			writeFileSync(
				join(root, "package.json"),
				JSON.stringify({ scripts }, null, 2),
				"utf8",
			);

			const result = spawnSync("bun", ["run", "validate:release"], {
				cwd: root,
				encoding: "utf8",
				shell: false,
			});
			if (result.error) {
				throw result.error;
			}

			expect(result.status).toBe(0);
			expect(
				readFileSync(join(root, "order.log"), "utf8").trim().split("\n"),
			).toEqual(expectedSteps);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("toolchain smoke executes parser, schema, and diff dependencies", () => {
		const result = spawnSync(
			"bun",
			[join(repoRoot, "cli/dev/toolchain-smoke.ts")],
			{
				cwd: repoRoot,
				encoding: "utf8",
				shell: false,
			},
		);
		if (result.error) {
			throw result.error;
		}

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("toolchain smoke: ok");
		expect(result.stderr).toBe("");
	});

	test("package metadata keeps the private prerelease posture", () => {
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as {
			private?: boolean;
			version?: string;
			license?: string;
		};

		expect(pkg.private).toBe(true);
		expect(pkg.license).toBe("MIT");
		expect(pkg.version).toMatch(SEMVER_PATTERN);
		expect(pkg.version).toContain("-");
		expect(pkg.version).not.toBe("0.0.0");
	});

	test("generate-version creates cli/generated recursively", () => {
		const root = mkdtempSync(join(tmpdir(), "generate-version-"));
		const cliRoot = join(root, "cli");
		mkdirSync(cliRoot, { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "fixture-cli", version: "1.2.3-beta.1" }, null, 2),
			"utf8",
		);

		try {
			const result = spawnSync(
				"bun",
				[join(repoRoot, "cli/dev/generate-version.ts")],
				{
					cwd: root,
					encoding: "utf8",
					shell: false,
				},
			);
			if (result.error) {
				throw result.error;
			}
			expect(result.status).toBe(0);

			const outputPath = join(root, "cli/generated/version.ts");
			expect(existsSync(outputPath)).toBe(true);

			const output = readFileSync(outputPath, "utf8");
			expect(output).toContain(
				'export const CLI_PACKAGE_NAME = "fixture-cli";',
			);
			expect(output).toContain('export const CLI_VERSION = "1.2.3-beta.1";');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance records scanner statuses", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-scanners-"));
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);

		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);

			const provenance = buildReleaseProvenance({
				cwd: root,
				releaseMode: true,
				env: gitEnv,
			});
			expect(provenance.build_target).toBe(
				`bun-${process.platform}-${process.arch}`,
			);
			expect(provenance.compile_bytecode).toBe(false);
			expect(provenance.compile_minify).toBe(true);
			expect(provenance.module_format).toBe("esm");
			expect(provenance.compile_autoload_dotenv).toBe(false);
			expect(provenance.compile_autoload_bunfig).toBe(false);
			expect(provenance.security_scanners).toHaveLength(2);
			expect(provenance.security_scanners).toEqual(
				expect.arrayContaining([
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
			);
			expect(provenance.security_scanners).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ waiver_required: true }),
				]),
			);
			expect(existsSync(join(root, "dist", "security-scan.release.json"))).toBe(
				true,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance fails closed without a SHA-bound build receipt", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-missing-receipt-"),
		);
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};
		try {
			commitReleaseFixture(root, gitEnv);
			unlinkSync(join(distDir, `${RELEASE_ARTIFACT_NAME}.build.json`));
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true, env: gitEnv }),
			).toThrow(/missing compiled release build receipt/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance rejects a SHA-bound receipt without minification", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-unminified-receipt-"),
		);
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};
		try {
			commitReleaseFixture(root, gitEnv);
			writeCompiledReleaseBuildReceipt(join(distDir, RELEASE_ARTIFACT_NAME), [
				"build",
				"--compile",
				"--format=esm",
				"--no-compile-autoload-dotenv",
				"--no-compile-autoload-bunfig",
				"cli/main.ts",
				"--outfile",
				RELEASE_ARTIFACT,
			]);
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true, env: gitEnv }),
			).toThrow(/compiled release build receipt has noncanonical flags/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance rejects a receipt whose artifact SHA no longer matches", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-mismatched-receipt-"),
		);
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};
		try {
			commitReleaseFixture(root, gitEnv);
			writeFileSync(
				join(distDir, RELEASE_ARTIFACT_NAME),
				"mutated artifact",
				"utf8",
			);
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true, env: gitEnv }),
			).toThrow(/compiled release build receipt does not bind artifact/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance rejects a SHA-valid receipt with a forged artifact contract", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-forged-receipt-contract-"),
		);
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};
		try {
			commitReleaseFixture(root, gitEnv);
			writeCompiledReleaseBuildReceipt(
				join(distDir, RELEASE_ARTIFACT_NAME),
				compiledReleaseBuildArgs("cli/forged-main.ts", "dist/forged-afol"),
			);
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true, env: gitEnv }),
			).toThrow(/compiled release build receipt has noncanonical flags/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance refreshes forged security evidence before reading it", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-stale-"));
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);

		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);
			writePassingSecurityEvidence(root, {
				generatedAt: "2000-01-01T00:00:00.000Z",
				target: { artifact_sha256: "forged-artifact-sha" },
			});

			const provenance = buildReleaseProvenance({
				cwd: root,
				releaseMode: true,
				env: gitEnv,
			});
			expect(provenance.security_scanners).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ kind: "deps", status: "passed" }),
					expect.objectContaining({ kind: "secrets", status: "passed" }),
				]),
			);
			const report = JSON.parse(
				readFileSync(join(root, "dist", "security-scan.release.json"), "utf8"),
			);
			expect(report.generated_at).not.toBe("2000-01-01T00:00:00.000Z");
			expect(report.target.artifact_sha256).toBe(
				fileSha256(join(distDir, RELEASE_ARTIFACT_NAME)),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance writes checksum and provenance artifacts", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-write-"));
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);

		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);

			const { checksumPath, provenancePath } = writeReleaseProvenance({
				cwd: root,
				releaseMode: true,
				env: gitEnv,
			});
			expect(readFileSync(checksumPath, "utf8")).toContain(
				`  ${RELEASE_ARTIFACT}`,
			);
			const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
			const artifactPath = join(root, RELEASE_ARTIFACT);
			expect(provenance).toMatchObject({
				artifact: RELEASE_ARTIFACT,
				build_command: DEFAULT_BUILD_COMMAND,
				compile_bytecode: false,
				compile_minify: true,
				compile_autoload_bunfig: false,
				compile_autoload_dotenv: false,
				module_format: "esm",
				sha256: fileSha256(artifactPath),
				size_bytes: statSync(artifactPath).size,
				security_scanners: expect.arrayContaining([
					expect.objectContaining({ kind: "deps", status: "passed" }),
					expect.objectContaining({ kind: "secrets", status: "passed" }),
				]),
			});
			expect(Number.isSafeInteger(provenance.size_bytes)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance uses GitHub head ref in detached PR checkout", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-detached-"));
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);

		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);

			const sha = spawnSync("git", ["rev-parse", "HEAD"], {
				cwd: root,
				encoding: "utf8",
				env: gitEnv,
				shell: false,
			}).stdout.trim();
			expect(sha.length).toBeGreaterThan(0);

			const checkout = spawnSync("git", ["checkout", "--detach", sha], {
				cwd: root,
				encoding: "utf8",
				env: gitEnv,
				shell: false,
			});
			if (checkout.error) {
				throw checkout.error;
			}
			expect(checkout.status).toBe(0);

			const provenance = buildReleaseProvenance({
				cwd: root,
				releaseMode: true,
				env: {
					...gitEnv,
					GITHUB_HEAD_REF: "adminitration_refactor",
				},
			});
			expect(provenance.branch).toBe("adminitration_refactor");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance records package metadata path and sha256", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-version-"));
		const distDir = join(root, "dist");
		mkdirSync(distDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const provenance = buildReleaseProvenance({ cwd: root });
			const sourcePath = join(root, "package.json");
			const sourceSha256 = createHash("sha256")
				.update(readFileSync(sourcePath))
				.digest("hex");

			expect(provenance.version_source_path).toBe("package.json");
			expect(provenance.version_source_sha256).toBe(sourceSha256);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("generate-version rejects the placeholder version", () => {
		const root = mkdtempSync(join(tmpdir(), "generate-version-invalid-"));
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "fixture-cli", version: "0.0.0" }, null, 2),
			"utf8",
		);

		try {
			const result = spawnSync(
				"bun",
				[join(repoRoot, "cli/dev/generate-version.ts")],
				{
					cwd: root,
					encoding: "utf8",
					shell: false,
				},
			);
			if (result.error) {
				throw result.error;
			}

			expect(result.status).not.toBe(0);
			expect(`${result.stderr ?? ""}${result.stdout ?? ""}`).toContain(
				"package.json version must not use placeholder 0.0.0",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance rejects package metadata that diverges from generated metadata", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-version-mismatch-"),
		);
		const distDir = join(root, "dist");
		mkdirSync(distDir, { recursive: true });
		writeReleasePackageMetadata(root, {
			packageJsonVersion: "9.9.9",
		});
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");

		try {
			expect(() => buildReleaseProvenance({ cwd: root })).toThrow(
				/generated version metadata .* does not match package metadata/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance fails release mode without dependency lock metadata", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-"));
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");

		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true, env: gitEnv }),
			).toThrow(
				/security-scan\.release\.json target is incomplete: release dependency lockfile is unknown/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance creates missing release security evidence", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-no-security-"));
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);
			const provenance = buildReleaseProvenance({
				cwd: root,
				releaseMode: true,
				env: gitEnv,
			});
			expect(provenance.security_scanners).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ kind: "deps", status: "passed" }),
					expect.objectContaining({ kind: "secrets", status: "passed" }),
				]),
			);
			expect(existsSync(join(root, "dist", "security-scan.release.json"))).toBe(
				true,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance overwrites stale release security evidence", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-stale-security-"),
		);
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);
			writePassingSecurityEvidence(root, {
				generatedAt: "2000-01-01T00:00:00.000Z",
			});
			const provenance = buildReleaseProvenance({
				cwd: root,
				releaseMode: true,
				env: gitEnv,
			});
			expect(provenance.security_scanners).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ kind: "deps", status: "passed" }),
					expect.objectContaining({ kind: "secrets", status: "passed" }),
				]),
			);
			const report = JSON.parse(
				readFileSync(join(root, "dist", "security-scan.release.json"), "utf8"),
			);
			expect(report.generated_at).not.toBe("2000-01-01T00:00:00.000Z");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance rejects failed release security evidence", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-failed-security-"),
		);
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		writeMockScanner(binDir, "osv-scanner", {
			version: "osv-scanner 2.4.0",
			stderr: "osv blocked",
			exitCode: 7,
		});
		writeMockScanner(binDir, "gitleaks", { version: "gitleaks 8.30.1" });

		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);
			writePassingSecurityEvidence(root);
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true, env: gitEnv }),
			).toThrow(/release provenance requires passed security scans/);
			const report = JSON.parse(
				readFileSync(join(root, "dist", "security-scan.release.json"), "utf8"),
			);
			const depsScan = report.scans.find(
				(scan: { kind: string }) => scan.kind === "deps",
			);
			expect(depsScan).toMatchObject({ tool: "osv-scanner", status: "failed" });
			expect(depsScan.reason).toContain("osv blocked");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance overwrites legacy security evidence without target metadata", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-legacy-security-"),
		);
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);
			writeFileSync(
				join(root, "dist", "security-scan.release.json"),
				JSON.stringify(
					{
						generated_at: new Date().toISOString(),
						mode: "release",
						scans: [
							{
								tool: "osv-scanner",
								kind: "deps",
								mode: "release",
								status: "passed",
							},
							{
								tool: "gitleaks",
								kind: "secrets",
								mode: "release",
								status: "passed",
							},
						],
					},
					null,
					2,
				),
				"utf8",
			);
			const provenance = buildReleaseProvenance({
				cwd: root,
				releaseMode: true,
				env: gitEnv,
			});
			expect(provenance.security_scanners).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ kind: "deps", status: "passed" }),
					expect.objectContaining({ kind: "secrets", status: "passed" }),
				]),
			);
			const report = JSON.parse(
				readFileSync(join(root, "dist", "security-scan.release.json"), "utf8"),
			);
			expect(report.target.artifact_sha256).toBe(
				fileSha256(join(distDir, RELEASE_ARTIFACT_NAME)),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance overwrites malformed release security evidence", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-malformed-security-"),
		);
		const distDir = join(root, "dist");
		const binDir = join(root, "bin");
		mkdirSync(distDir, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: scannerPath(binDir),
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);
			writeFileSync(
				join(root, "dist", "security-scan.release.json"),
				JSON.stringify(
					{
						generated_at: new Date().toISOString(),
						mode: "release",
						target: securityEvidenceTarget(root),
						scans: [
							{
								kind: "deps",
								mode: "release",
								status: "passed",
							},
							{
								tool: "gitleaks",
								kind: "secrets",
								mode: "release",
								status: "passed",
							},
						],
					},
					null,
					2,
				),
				"utf8",
			);
			const provenance = buildReleaseProvenance({
				cwd: root,
				releaseMode: true,
				env: gitEnv,
			});
			expect(provenance.security_scanners).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						tool: "osv-scanner",
						kind: "deps",
						status: "passed",
					}),
					expect.objectContaining({
						tool: "gitleaks",
						kind: "secrets",
						status: "passed",
					}),
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance rejects dirty release checkout", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-dirty-"));
		const distDir = join(root, "dist");
		mkdirSync(distDir, { recursive: true });
		writeReleasePackageMetadata(root);
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		const gitEnv = {
			...process.env,
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);
			writePassingSecurityEvidence(root);
			writeFileSync(join(root, "dirty.txt"), "dirty", "utf8");
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true, env: gitEnv }),
			).toThrow(/release provenance requires clean source checkout/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance fails when package metadata is missing", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-missing-package-"),
		);
		const distDir = join(root, "dist");
		mkdirSync(distDir, { recursive: true });
		writeFileSync(join(distDir, RELEASE_ARTIFACT_NAME), "artifact", "utf8");

		try {
			expect(() => buildReleaseProvenance({ cwd: root })).toThrow(
				/package\.json/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("canonicalizes a Windows candidate artifact before writing sidecars", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-windows-artifact-"),
		);
		const artifact = join(root, "dist", "afol.exe");
		mkdirSync(join(root, "dist"), { recursive: true });
		writeReleaseVersionRegistry(root);
		writeFileSync(artifact, "artifact", "utf8");

		try {
			const written = writeReleaseProvenance({
				cwd: root,
				artifact: "dist\\afol.exe",
			});
			expect(written.provenancePath).toBe(
				join(root, "dist", "afol.exe.provenance.json"),
			);
			expect(
				JSON.parse(readFileSync(written.provenancePath, "utf8")),
			).toMatchObject({ artifact: "dist/afol.exe" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects unsafe release artifact paths before writing sidecars", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-unsafe-artifact-"),
		);
		mkdirSync(join(root, "dist"), { recursive: true });
		writeReleaseVersionRegistry(root);
		writeFileSync(join(root, "dist", "afol.exe"), "artifact", "utf8");

		try {
			for (const artifact of [
				"../dist/afol.exe",
				"dist\\..\\afol.exe",
				"/dist/afol.exe",
				"C:\\dist\\afol.exe",
				"C:dist\\afol.exe",
				"\\\\server\\share\\afol.exe",
				"dist/afol.exe/",
				"dist//afol.exe",
				"dist/afol:stream.exe",
				"dist/afol.exe\r\n",
				"dist/afol.exe ",
				"dist/afol.exe.",
				"dist/CON.exe",
				"dist/LPT9.txt",
			]) {
				expect(() => writeReleaseProvenance({ cwd: root, artifact })).toThrow(
					/invalid release artifact/,
				);
			}
			expect(existsSync(join(root, "dist", "afol.exe.sha256"))).toBe(false);
			expect(existsSync(join(root, "dist", "afol.exe.provenance.json"))).toBe(
				false,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!hasDirectoryLinkCapability)(
		"rejects a directory link that escapes the physical dist root",
		() => {
			const root = mkdtempSync(
				join(tmpdir(), "release-provenance-reparse-artifact-"),
			);
			const outside = mkdtempSync(
				join(tmpdir(), "release-provenance-reparse-outside-"),
			);
			try {
				writeReleaseVersionRegistry(root);
				writeFileSync(join(outside, "afol.exe"), "artifact", "utf8");
				symlinkSync(
					outside,
					join(root, "dist"),
					process.platform === "win32" ? "junction" : "dir",
				);
				expect(() =>
					writeReleaseProvenance({ cwd: root, artifact: "dist/afol.exe" }),
				).toThrow(/release output directory|reparse path|physical containment/);
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	test("release mode binds an explicit Windows candidate to fresh security evidence and sidecars", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-windows-release-mode-"),
		);
		const binDir = join(root, "bin");
		const artifact = join(root, "dist", "afol.exe");
		mkdirSync(join(root, "dist"), { recursive: true });
		writeReleaseVersionRegistry(root);
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		writeFileSync(artifact, "windows artifact", "utf8");
		writeCompiledReleaseBuildReceipt(
			artifact,
			compiledReleaseBuildArgs("cli/main.ts", "dist/afol.exe"),
		);
		writePortableReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
			Path: `${binDir}${delimiter}${process.env.Path ?? process.env.PATH ?? ""}`,
			...pinnedReleaseScannerEnvironment(binDir),
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};

		try {
			commitReleaseFixture(root, gitEnv);
			const written = writeReleaseProvenance({
				cwd: root,
				artifact: "dist\\afol.exe",
				releaseMode: true,
				env: gitEnv,
			});
			const report = JSON.parse(
				readFileSync(join(root, "dist", "security-scan.release.json"), "utf8"),
			);
			expect(report.target).toMatchObject({
				artifact: "dist/afol.exe",
				artifact_sha256: fileSha256(artifact),
			});
			expect(
				JSON.parse(readFileSync(written.provenancePath, "utf8")),
			).toMatchObject({
				artifact: "dist/afol.exe",
				sha256: fileSha256(artifact),
			});
			expect(readFileSync(written.checksumPath, "utf8")).toBe(
				`${fileSha256(artifact)}  dist/afol.exe\n`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
