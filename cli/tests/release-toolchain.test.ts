import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReleaseProvenance } from "../dev/release-provenance";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";

const repoRoot = join(import.meta.dir, "..", "..");
const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

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

describe("release and toolchain contracts", () => {
	test("package scripts keep informative local lanes and strict release gates", () => {
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as {
			scripts?: Record<string, string>;
		};
		const scripts = pkg.scripts ?? {};

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
		expect(scripts["validate:release"]).toContain(
			"bun run validate:security:release",
		);
		expect(scripts["validate:release"]).not.toContain(
			"bun run validate:security:required",
		);
		expect(scripts["validate:release"]).toContain("bun run coverage:check");
		expect(scripts["validate:release"]).toContain("bun run smoke:clean");
		expect(scripts["validate:release"]).toContain(
			"bun run release:provenance:release",
		);
		expect(scripts["coverage:check"]).toBe(
			"bun run cli/dev/coverage-check.ts --include cli/dev/coverage-check.ts --include cli/dev/dist-smoke.ts --include cli/dev/generate-version.ts --include cli/dev/release-provenance.ts --include cli/dev/toolchain-smoke.ts --include cli/commands/bootstrap.ts --include cli/commands/project-benchmark.ts --include cli/commands/validate.ts --include cli/services/project-benchmark",
		);
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

	test("CI provisions pinned security scanners before release validation", () => {
		const workflow = readFileSync(
			join(repoRoot, ".github", "workflows", "agents-scaffold-ci.yml"),
			"utf8",
		);

		expect(workflow).toContain('OSV_SCANNER_VERSION: "2.3.8"');
		expect(workflow).toContain('GITLEAKS_VERSION: "8.24.2"');
		expect(workflow).toContain("Install pinned security scanners");
		expect(workflow).toContain("continue-on-error: true");
		expect(workflow).toContain(
			"https://github.com/google/osv-scanner/releases/download/v",
		);
		expect(workflow).toContain("osv-scanner_linux_amd64");
		expect(workflow).toContain(
			"https://github.com/gitleaks/gitleaks/releases/download/v",
		);
		expect(workflow).toContain("_linux_x64.tar.gz");
		expect(workflow.indexOf("Install pinned security scanners")).toBeLessThan(
			workflow.indexOf("Release validation"),
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
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");
		writeFileSync(join(root, "bun.lock"), "", "utf8");
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
			const result = spawnSync("git", ["init"], {
				cwd: root,
				encoding: "utf8",
				env: gitEnv,
				shell: false,
			});
			if (result.error) {
				throw result.error;
			}
			expect(result.status).toBe(0);

			const addResult = spawnSync("git", ["add", "dist/afol"], {
				cwd: root,
				encoding: "utf8",
				env: gitEnv,
				shell: false,
			});
			if (addResult.error) {
				throw addResult.error;
			}
			expect(addResult.status).toBe(0);

			const commitResult = spawnSync(
				"git",
				["commit", "--no-verify", "-m", "test release provenance"],
				{
					cwd: root,
					encoding: "utf8",
					env: gitEnv,
					shell: false,
				},
			);
			if (commitResult.error) {
				throw commitResult.error;
			}
			expect(commitResult.status).toBe(0);

			const provenance = buildReleaseProvenance({
				cwd: root,
				releaseMode: true,
				env: gitEnv,
			});
			expect(provenance.security_scanners).toHaveLength(2);
			expect(provenance.security_scanners).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						tool: "osv-scanner",
						kind: "deps",
						status: "waived",
						reason: expect.stringContaining("missing binary"),
						waiver_required: true,
					}),
					expect.objectContaining({
						tool: "gitleaks",
						kind: "secrets",
						status: "waived",
						reason: expect.stringContaining("missing binary"),
						waiver_required: true,
					}),
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("release provenance uses GitHub head ref in detached PR checkout", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-detached-"));
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
			for (const args of [
				["init"],
				["add", "dist/afol", "bun.lock"],
				["commit", "--no-verify", "-m", "test release provenance"],
			]) {
				const result = spawnSync("git", args, {
					cwd: root,
					encoding: "utf8",
					env: gitEnv,
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

	test("release provenance fails release mode when required fields are unknown", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-"));
		const distDir = join(root, "dist");
		mkdirSync(distDir, { recursive: true });
		writeReleaseVersionRegistry(root);
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");

		try {
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true }),
			).toThrow(/release provenance missing required fields/);
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
});
