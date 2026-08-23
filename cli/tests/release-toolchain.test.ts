import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
	writeCompiledReleaseBuildReceipt,
} from "../dev/build-release";
import {
	buildReleaseProvenance,
	writeReleaseProvenance,
} from "../dev/release-provenance";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";

const repoRoot = join(import.meta.dir, "..", "..");
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

function writeFakeReleaseScanners(binDir: string): void {
	mkdirSync(binDir, { recursive: true });
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
	const artifact = "dist/afol";
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
	const artifactPath = join(root, "dist", "afol");
	if (existsSync(artifactPath)) {
		writeCompiledReleaseBuildReceipt(
			artifactPath,
			compiledReleaseBuildArgs("cli/main.ts", "dist/afol"),
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
		expect(scripts["lint:biome"]).toBe("biome check cli");
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
		expect(scripts["smoke:clean"]).toContain("--exclude-vcs-ignores");
		expect(scripts["validate:toolchain"]).toBe(
			"bun run version:check && bun run manifest:check && bun run lint:biome && bun run lint:oxlint && bun run lint:knip && bun run toolchain:diff",
		);
		expect(scripts["validate:release"]).not.toContain(
			"bun run validate:security:required",
		);
		expect(scripts["validate:release"]).toContain(
			"bun run local-state:rebuild",
		);
		expect(scripts["validate:release"]).toContain("bun run validate:project");
		expect(scripts["validate:project"]).toBe(
			"bun run kernel -- v project --strict --json",
		);
		expect(scripts["validate:release"]).toContain("bun run typecheck");
		expect(scripts["test:full"]).toBe("bun test --only-failures");
		expect(scripts["validate:release"]).toContain("bun run test:full");
		expect(scripts["validate:release"]).toContain("bun run coverage:check");
		expect(scripts["validate:ux-governance"]).toBe(
			"bun run kernel -- ux validate --json && bun run kernel -- v bench --pack governance-history --timing-mode observe --json",
		);
		expect(scripts["validate:release"]).toContain(
			"bun run validate:ux-governance",
		);
		expect(scripts["validate:release"]).toContain("bun run smoke:clean");
		expect(scripts["validate:release"]).toContain(
			"bun run release:provenance:release",
		);
		const releaseSteps = splitScriptSteps(scripts["validate:release"]);
		const compactCliBenchmarks =
			"bun run kernel -- v bench --pack token-economy --pack cli-kernel-local --json";
		const stepIndex = (step: string) => releaseSteps.indexOf(step);
		expect(releaseSteps[0]).toBe("bun run validate:toolchain");
		expect(releaseSteps).toContain(compactCliBenchmarks);
		expect(stepIndex("bun run validate:project")).toBeLessThan(
			stepIndex("bun run typecheck"),
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
		expect(stepIndex("bun run local-state:rebuild")).toBeLessThan(
			stepIndex("bun run validate:project"),
		);
		expect(stepIndex("bun run validate:project-benchmarks")).toBeLessThan(
			stepIndex("bun run validate:ux-governance"),
		);
		expect(stepIndex("bun run validate:ux-governance")).toBeLessThan(
			stepIndex(compactCliBenchmarks),
		);
		expect(stepIndex(compactCliBenchmarks)).toBeLessThan(
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
			"bun run cli/dev/coverage-check.ts --include cli/dev/release-provenance.ts --include cli/commands/bootstrap.ts --include cli/commands/project-benchmark.ts --include cli/commands/validate.ts --include cli/services/project-benchmark/catalog.ts --include cli/services/project-benchmark/generate.ts --include cli/services/project-benchmark/matrix.ts --include cli/services/project-benchmark/paths.ts --include cli/services/project-benchmark/render.ts --include cli/services/project-benchmark/schema.ts --include cli/services/project-benchmark/scoring.ts --include cli/services/project-benchmark/types.ts --include cli/services/project-benchmark/validate-project-relations.ts --include cli/services/project-benchmark/validate-project-shape.ts --include cli/services/project-benchmark/validate.ts --include cli/services/project-benchmark/validation-utils.ts --isolate --timeout 30000 cli/tests/bootstrap-cleanup.test.ts cli/tests/bootstrap-conflicts.test.ts cli/tests/bootstrap-template-cleanliness.test.ts cli/tests/bootstrap.test.ts cli/tests/coverage-check.test.ts cli/tests/help.test.ts cli/tests/kernel.test.ts cli/tests/operation-context.test.ts cli/tests/project-benchmark-command.test.ts cli/tests/project-benchmark-validation.test.ts cli/tests/registry.test.ts cli/tests/release-toolchain.test.ts cli/tests/validate-command.test.ts cli/tests/validate-internals.test.ts cli/tests/validation.test.ts cli/tests/version-metadata.test.ts",
		);
		expect(scripts["coverage:check"]).toContain(
			"cli/tests/coverage-check.test.ts",
		);
		expect(scripts["coverage:project-benchmarks"]).toBe(
			"bun run cli/dev/coverage-check.ts --include cli/commands/project-benchmark.ts --include cli/services/project-benchmark/catalog.ts --include cli/services/project-benchmark/generate.ts --include cli/services/project-benchmark/matrix.ts --include cli/services/project-benchmark/paths.ts --include cli/services/project-benchmark/render.ts --include cli/services/project-benchmark/schema.ts --include cli/services/project-benchmark/scoring.ts --include cli/services/project-benchmark/types.ts --include cli/services/project-benchmark/validate-project-relations.ts --include cli/services/project-benchmark/validate-project-shape.ts --include cli/services/project-benchmark/validate.ts --include cli/services/project-benchmark/validation-utils.ts --max-concurrency 1 --timeout 30000 cli/tests/project-benchmark-command.test.ts cli/tests/project-benchmark-validation.test.ts cli/tests/registry.test.ts cli/tests/help.test.ts cli/tests/kernel.test.ts cli/tests/operation-context.test.ts cli/tests/validation.test.ts",
		);
		expect(scripts["validate:mutation-performance"]).toBe(
			"bun run kernel -- v bench --pack mutation-safety --json",
		);
		expect(scripts["validate:project-benchmarks"]).toContain(
			"bun run validate:mutation-performance && bun run coverage:project-benchmarks",
		);
	});

	test("coverage scripts track every project-benchmark source file", () => {
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as { scripts?: Record<string, string> };
		const scripts = pkg.scripts ?? {};
		const sourcePrefix = "cli/services/project-benchmark/";
		const expectedSources = readdirSync(join(repoRoot, sourcePrefix), {
			withFileTypes: true,
		})
			.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
			.map((entry) => `${sourcePrefix}${entry.name}`)
			.sort();

		for (const scriptName of [
			"coverage:check",
			"coverage:project-benchmarks",
		]) {
			const actualSources = parseScriptIncludes(scripts[scriptName] ?? "")
				.filter((path) => path.startsWith(sourcePrefix))
				.sort();
			expect(actualSources, scriptName).toEqual(expectedSources);
		}
	});

	test("no hosted CI workflows are configured (ADR-009)", () => {
		const dir = join(repoRoot, ".github", "workflows");
		expect(existsSync(dir)).toBe(false);
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
			"local-state:rebuild",
			"validate:project",
			"typecheck",
			"validate:template",
			"validate:bootstrap",
			"validate:project-benchmarks",
			"validate:ux-governance",
			"kernel",
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);

		const gitEnv = {
			...process.env,
			PATH: binDir,
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: binDir,
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};
		try {
			commitReleaseFixture(root, gitEnv);
			unlinkSync(join(distDir, "afol.build.json"));
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: binDir,
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};
		try {
			commitReleaseFixture(root, gitEnv);
			writeCompiledReleaseBuildReceipt(join(distDir, "afol"), [
				"build",
				"--compile",
				"--format=esm",
				"--no-compile-autoload-dotenv",
				"--no-compile-autoload-bunfig",
				"cli/main.ts",
				"--outfile",
				"dist/afol",
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: binDir,
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};
		try {
			commitReleaseFixture(root, gitEnv);
			writeFileSync(join(distDir, "afol"), "mutated artifact", "utf8");
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: binDir,
			GIT_AUTHOR_NAME: "Test User",
			GIT_AUTHOR_EMAIL: "test@example.com",
			GIT_COMMITTER_NAME: "Test User",
			GIT_COMMITTER_EMAIL: "test@example.com",
		};
		try {
			commitReleaseFixture(root, gitEnv);
			writeCompiledReleaseBuildReceipt(
				join(distDir, "afol"),
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);

		const gitEnv = {
			...process.env,
			PATH: binDir,
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
				fileSha256(join(distDir, "afol")),
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);

		const gitEnv = {
			...process.env,
			PATH: binDir,
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
			expect(readFileSync(checksumPath, "utf8")).toContain("  dist/afol");
			const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
			const artifactPath = join(root, "dist", "afol");
			expect(provenance).toMatchObject({
				artifact: "dist/afol",
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);

		const gitEnv = {
			...process.env,
			PATH: binDir,
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

	test("release provenance records version registry path and sha256", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-registry-"));
		const distDir = join(root, "dist");
		mkdirSync(distDir, { recursive: true });
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");

		try {
			const provenance = buildReleaseProvenance({ cwd: root });
			const registryPath = join(
				root,
				".afol",
				"adm",
				"source",
				"release-version.json",
			);
			const registrySha256 = createHash("sha256")
				.update(readFileSync(registryPath))
				.digest("hex");

			expect(provenance.version_registry_path).toBe(
				".afol/adm/source/release-version.json",
			);
			expect(provenance.version_registry_sha256).toBe(registrySha256);
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

	test("release provenance rejects a registry version that diverges from generated metadata", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-registry-mismatch-"),
		);
		const distDir = join(root, "dist");
		mkdirSync(distDir, { recursive: true });
		writeReleaseVersionRegistry(root, {
			packageJsonVersion: "9.9.9",
			registryVersion: "9.9.9",
		});
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");

		try {
			expect(() => buildReleaseProvenance({ cwd: root })).toThrow(
				/generated version metadata .* does not match registered release version/,
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: binDir,
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: binDir,
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: binDir,
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		writeFileSync(
			join(binDir, "osv-scanner"),
			[
				"#!/bin/sh",
				'if [ "$1" = "--version" ]; then',
				"  printf 'osv-scanner 2.4.0\\n'",
				"  exit 0",
				"fi",
				"printf 'osv blocked\\n' >&2",
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
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		const gitEnv = {
			...process.env,
			PATH: binDir,
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: binDir,
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
				fileSha256(join(distDir, "afol")),
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
		symlinkSync("/usr/bin/git", join(binDir, "git"));
		writeFakeReleaseScanners(binDir);
		const gitEnv = {
			...process.env,
			PATH: binDir,
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
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

	test("release provenance fails release mode without a version registry", () => {
		const root = mkdtempSync(
			join(tmpdir(), "release-provenance-missing-registry-"),
		);
		const distDir = join(root, "dist");
		mkdirSync(distDir, { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify(
				{
					name: CLI_PACKAGE_NAME,
					version: CLI_VERSION,
				},
				null,
				2,
			),
			"utf8",
		);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");

		try {
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true }),
			).toThrow(/missing required \.afol\/adm\/source\/release-version\.json/);
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
				).toThrow(/reparse path|physical containment/);
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
