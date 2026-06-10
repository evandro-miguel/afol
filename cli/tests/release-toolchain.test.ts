import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReleaseProvenance } from "../dev/release-provenance";

const repoRoot = join(import.meta.dir, "..", "..");
const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

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
		expect(scripts["validate:release"]).toContain(
			"bun run validate:security:required",
		);
		expect(scripts["validate:release"]).toContain("bun run coverage:check");
		expect(scripts["validate:release"]).toContain(
			"bun run release:provenance:release",
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

	test("release provenance fails release mode when required fields are unknown", () => {
		const root = mkdtempSync(join(tmpdir(), "release-provenance-"));
		const distDir = join(root, "dist");
		mkdirSync(distDir, { recursive: true });
		writeFileSync(join(distDir, "afol"), "artifact", "utf8");

		try {
			expect(() =>
				buildReleaseProvenance({ cwd: root, releaseMode: true }),
			).toThrow(/release provenance missing required fields/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
