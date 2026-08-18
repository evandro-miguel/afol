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
		expect(scripts["validate:release"]).toContain("bun run typecheck");
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

	test("public CI keeps audit, typecheck, tests, and smoke blocking", () => {
		const workflow = readFileSync(
			join(repoRoot, ".github", "workflows", "ci.yml"),
			"utf8",
		).replace(/\r\n/g, "\n");
		type WorkflowStep = { name?: string; run?: string };
		type ValidationJob = {
			"runs-on"?: string;
			steps?: WorkflowStep[];
			env?: Record<string, unknown>;
		};
		const parsedWorkflow = Bun.YAML.parse(workflow) as {
			jobs?: Record<string, ValidationJob>;
		};
		const validationJob = parsedWorkflow.jobs?.linux ?? {};
		const validationSteps = validationJob.steps ?? [];
		const workflowStep = (name: string): WorkflowStep =>
			validationSteps.find((step) => step.name === name) ?? {};
		const stepIndex = (name: string): number =>
			validationSteps.findIndex((step) => step.name === name);

		expect(validationJob["runs-on"]).toBe("ubuntu-24.04");
		expect(validationJob.env).toBeUndefined();
		expect(workflowStep("Install dependencies").run).toBe(
			"bun install --frozen-lockfile",
		);
		expect(workflowStep("Audit public boundary").run).toBe(
			"bun run public:audit -- .",
		);
		expect(workflowStep("Lint and typecheck").run).toContain(
			"bun run typecheck",
		);
		expect(workflowStep("Test").run).toBe("bun run test:full");
		expect(workflowStep("Build and smoke").run).toContain("bun run smoke:dist");
		expect(workflowStep("Verify Linux x64").run).toContain(
			'test "$(uname -m)" = x86_64',
		);
		expect(stepIndex("Install dependencies")).toBeLessThan(
			stepIndex("Audit public boundary"),
		);
		expect(stepIndex("Lint and typecheck")).toBeLessThan(stepIndex("Test"));
	});

	test("CI runs release validation for pull requests and main while retaining manual dispatch", () => {
		const workflow = readFileSync(
			join(repoRoot, ".github", "workflows", "ci.yml"),
			"utf8",
		).replace(/\r\n/g, "\n");

		expect(workflow).toContain("  workflow_dispatch:\n");
		expect(workflow).toContain("  pull_request:\n");
		expect(workflow).toContain("  push:\n    branches: [main]\n");
		expect(workflow).toContain("permissions:\n  contents: read\n");
		expect(workflow).toContain("with:\n          fetch-depth: 0\n");
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
		};

		expect(pkg.private).toBe(true);
		expect(pkg.version).toMatch(SEMVER_PATTERN);
		expect(pkg.version).toContain("-");
		expect(pkg.version).not.toBe("0.0.0");
	});

	test("release workflow provisions pinned scanners and attested assets", () => {
		const workflow = readFileSync(
			join(repoRoot, ".github", "workflows", "release.yml"),
			"utf8",
		);
		const osvInstallCommand =
			'go install "github.com/google/osv-scanner/v2/cmd/osv-scanner@v$' +
			'{OSV_SCANNER_VERSION}"';
		const gitleaksInstallCommand =
			'go install "github.com/zricethezav/gitleaks/v8@v$' +
			'{GITLEAKS_VERSION}"';

		expect(workflow).toContain('OSV_SCANNER_VERSION: "2.3.8"');
		expect(workflow).toContain('GITLEAKS_VERSION: "8.24.2"');
		expect(workflow).toContain(
			"uses: actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e # v7.0.0",
		);
		expect(workflow).toContain('go-version: "1.26.x"');
		expect(workflow).toContain("cache: false");
		expect(workflow).toContain(
			"uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0",
		);
		expect(workflow).toContain("Install pinned security scanners");
		expect(workflow).toContain(osvInstallCommand);
		expect(workflow).toContain(gitleaksInstallCommand);
		expect(workflow).toContain(
			'echo "AFOL_OSV_SCANNER_PATH=$tool_dir/osv-scanner" >> "$GITHUB_ENV"',
		);
		expect(workflow).toContain(
			'echo "AFOL_GITLEAKS_PATH=$tool_dir/gitleaks" >> "$GITHUB_ENV"',
		);
		expect(workflow).not.toContain('echo "$tool_dir" >> "$GITHUB_PATH"');
		expect(workflow).not.toContain("curl -fsSL");
		expect(workflow).not.toContain("tar -xzf");
		const releaseValidationStep =
			workflow.match(
				/- name: Validate exact source and artifact[\s\S]*?(?=\n {6}- name:|\n\S|$)/,
			)?.[0] ?? "";
		expect(releaseValidationStep).toContain("bun run validate:release");
		expect(releaseValidationStep).not.toContain("continue-on-error: true");
		expect(workflow).toContain(
			"uses: anchore/sbom-action@57aae528053a48a3f6235f2d9461b05fbcb7366d # v0.23.1",
		);
		expect(workflow).toContain(
			"uses: actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d # v4.2.1",
		);
		expect(workflow).toContain("gh release create");
		expect(workflow.indexOf("Set up Go")).toBeLessThan(
			workflow.indexOf("Install pinned security scanners"),
		);
		expect(workflow.indexOf("Install pinned security scanners")).toBeLessThan(
			workflow.indexOf("Validate exact source and artifact"),
		);
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
});
