import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";

const repoRoot = process.cwd();
const migrationId = "260726_f29-afol-only-active-canon";
const migrationRoot = join(
	repoRoot,
	".afol",
	"data",
	"migrations",
	migrationId,
);
const archivedConfigRelativePath = "originals/.agents/config.json";
const archivedConfigPath = join(migrationRoot, archivedConfigRelativePath);
const archivedConfigSha256 =
	"1b85aba68cb1e25f73a0ea07ecb800e9a67a070c7425e2333f138e108068a178";
const archivedConfigSize = 1041;
const archivedConfigDestination = `.afol/data/migrations/${migrationId}/${archivedConfigRelativePath}`;

type ArchiveArtifact = {
	source?: string;
	destination?: string;
	sha256?: string;
	size?: number;
	reason?: string;
	replacement?: string;
};

type ArchiveManifest = {
	deletion_approved?: boolean;
	retention_review_at?: string;
	artifacts?: ArchiveArtifact[];
};

function readRepoFile(relativePath: string): string {
	return readFileSync(join(repoRoot, relativePath), "utf8");
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readArchiveManifest(): ArchiveManifest {
	return JSON.parse(
		readRepoFile(`.afol/data/migrations/${migrationId}/manifest.json`),
	) as ArchiveManifest;
}

function inspectArchiveArtifacts(artifacts: ArchiveArtifact[]): string[] {
	const issues: string[] = [];
	if (artifacts.length !== 1) {
		issues.push("artifact-count-unexpected");
	}

	for (const artifact of artifacts) {
		const destination = artifact.destination;
		if (typeof destination !== "string" || destination.length === 0) {
			issues.push("artifact-destination-empty");
			continue;
		}

		const hasBackslash = destination.includes("\\");
		const hasAbsoluteShape =
			isAbsolute(destination) || /^[A-Za-z]:\//.test(destination);
		const segments = destination.split("/");
		const hasDotSegment = segments.includes(".");
		const hasTraversal = segments.includes("..");

		if (hasBackslash) {
			issues.push("artifact-destination-backslash");
		}
		if (hasAbsoluteShape) {
			issues.push("artifact-destination-absolute");
		}
		if (hasDotSegment) {
			issues.push("artifact-destination-dot-segment");
		}
		if (hasTraversal) {
			issues.push("artifact-destination-traversal");
		}

		const resolvedDestination = resolve(repoRoot, destination);
		const migrationRelative = relative(migrationRoot, resolvedDestination);
		const remainsInMigration =
			migrationRelative !== ".." &&
			!migrationRelative.startsWith("../") &&
			!migrationRelative.startsWith("..\\") &&
			!isAbsolute(migrationRelative);
		if (!remainsInMigration) {
			issues.push("artifact-destination-outside-migration");
		}
		if (destination !== archivedConfigDestination) {
			issues.push("artifact-destination-unexpected");
		}
		if (artifact.source !== ".agents/config.json") {
			issues.push("artifact-source-unexpected");
		}
		if (artifact.sha256 !== archivedConfigSha256) {
			issues.push("artifact-sha256-metadata-mismatch");
		}
		if (artifact.size !== archivedConfigSize) {
			issues.push("artifact-size-metadata-mismatch");
		}

		const safeToInspect =
			remainsInMigration &&
			!hasBackslash &&
			!hasAbsoluteShape &&
			!hasDotSegment &&
			!hasTraversal;
		if (!safeToInspect) {
			continue;
		}
		if (!existsSync(resolvedDestination)) {
			issues.push("artifact-file-missing");
			continue;
		}
		const stats = lstatSync(resolvedDestination);
		if (!stats.isFile() || stats.isSymbolicLink()) {
			issues.push("artifact-file-not-regular");
			continue;
		}
		if (stats.size !== artifact.size) {
			issues.push("artifact-file-size-mismatch");
		}
		if (sha256(resolvedDestination) !== artifact.sha256) {
			issues.push("artifact-file-sha256-mismatch");
		}
	}

	return issues;
}

describe("AFOL-only active configuration canon", () => {
	test("retires the tracked root legacy config only after a verified archive", () => {
		expect(existsSync(join(repoRoot, ".agents", "config.json"))).toBe(false);
		expect(existsSync(archivedConfigPath)).toBe(true);

		const manifest = readArchiveManifest();
		const artifact = manifest.artifacts?.[0];

		expect(manifest.deletion_approved).toBe(false);
		expect(manifest.retention_review_at).toBe("2026-08-02T17:44:04Z");
		expect(inspectArchiveArtifacts(manifest.artifacts ?? [])).toEqual([]);
		expect(artifact).toMatchObject({
			source: ".agents/config.json",
			destination: archivedConfigDestination,
			sha256: archivedConfigSha256,
			replacement: ".afol/config.json",
		});
		expect(artifact?.reason).toContain("legacy fallback");
		expect(sha256(archivedConfigPath)).toBe(archivedConfigSha256);
	});

	test("rejects malicious archive destinations in every artifact", () => {
		const validArtifact = readArchiveManifest().artifacts?.[0];
		expect(validArtifact).toBeDefined();

		const maliciousSecondArtifact = {
			...validArtifact,
			destination: `.afol/data/migrations/${migrationId}-sibling/outside.json`,
		};
		const secondArtifactIssues = inspectArchiveArtifacts([
			validArtifact ?? {},
			maliciousSecondArtifact,
		]);
		expect(secondArtifactIssues).toContain("artifact-count-unexpected");
		expect(secondArtifactIssues).toContain(
			"artifact-destination-outside-migration",
		);

		const malformedDestinations = [
			["", "artifact-destination-empty"],
			["/tmp/outside.json", "artifact-destination-absolute"],
			["C:/outside.json", "artifact-destination-absolute"],
			["originals\\.agents\\config.json", "artifact-destination-backslash"],
			[
				`.afol/data/migrations/${migrationId}/./config.json`,
				"artifact-destination-dot-segment",
			],
			[
				`.afol/data/migrations/${migrationId}/../outside.json`,
				"artifact-destination-traversal",
			],
			[
				`.afol/data/migrations/${migrationId}-sibling/outside.json`,
				"artifact-destination-outside-migration",
			],
		] as const;

		for (const [destination, expectedIssue] of malformedDestinations) {
			const issues = inspectArchiveArtifacts([
				{ ...validArtifact, destination },
			]);
			expect(issues).toContain(expectedIssue);
		}
	});

	test("generic fixtures source the canonical template config", () => {
		for (const relativePath of [
			"cli/tests/file-command-unit.test.ts",
			"cli/tests/mutation-safety.test.ts",
			"cli/tests/validate-internals.test.ts",
		]) {
			const source = readRepoFile(relativePath);
			expect(
				/join\(\s*process\.cwd\(\),\s*"\.agents",\s*"config\.json"\s*,?\s*\)/.test(
					source,
				),
			).toBe(false);
			expect(
				/join\(\s*process\.cwd\(\),\s*"src",\s*"project-template",\s*"\.afol",\s*"config\.json"\s*,?\s*\)/.test(
					source,
				),
			).toBe(true);
		}
	});

	test("keeps the explicit legacy-only resolver compatibility test", () => {
		const projectRootTest = readRepoFile("cli/tests/project-root.test.ts");
		expect(projectRootTest).toContain(
			'test("falls back to legacy .agents config when canonical config is missing"',
		);
		expect(projectRootTest).toContain(
			'expect(loaded.value.configRelativePath).toBe(".agents/config.json")',
		);
	});

	test("keeps all curated afol-rules copies byte-identical and canonical-first", () => {
		const paths = [
			".afol/adm/source/universal-skills/skills/afol-rules/SKILL.md",
			".agents/skills/afol-rules/SKILL.md",
			"src/project-template/.afol/adm/source/universal-skills/skills/afol-rules/SKILL.md",
			"src/project-template/.agents/skills/afol-rules/SKILL.md",
		];
		const copies = paths.map(readRepoFile);
		const actualHashes = paths.map((path) => sha256(join(repoRoot, path)));
		const managedSkillPath =
			".afol/adm/source/universal-skills/skills/afol-rules/SKILL.md";
		const templateManifest = JSON.parse(
			readRepoFile("src/project-template/.agents/manifest.json"),
		) as { managed_hashes?: Record<string, string> };
		const templateLock = JSON.parse(
			readRepoFile("src/project-template/.agents/lock.json"),
		) as { managed_hashes?: Record<string, string> };

		for (const copy of copies) {
			expect(copy === copies[0]).toBe(true);
			expect(copy.includes("`.afol/config.json`")).toBe(true);
			expect(copy.includes("only when the canonical config is absent")).toBe(
				true,
			);
		}
		expect(new Set(actualHashes).size).toBe(1);
		expect(templateManifest.managed_hashes?.[managedSkillPath]).toBe(
			actualHashes[0],
		);
		expect(templateLock.managed_hashes?.[managedSkillPath]).toBe(
			actualHashes[0],
		);
		expect(DEFAULT_TEMPLATE_FILES[managedSkillPath]?.sha256).toBe(
			actualHashes[0],
		);
		expect(
			DEFAULT_TEMPLATE_FILES[".agents/skills/afol-rules/SKILL.md"]?.sha256,
		).toBe(actualHashes[0]);
	});

	test("never exports the legacy config through source, generated payload, or manifests", () => {
		expect(
			existsSync(
				join(repoRoot, "src", "project-template", ".agents", "config.json"),
			),
		).toBe(false);
		expect(Object.keys(DEFAULT_TEMPLATE_FILES)).not.toContain(
			".agents/config.json",
		);
		expect(Object.keys(DEFAULT_TEMPLATE_FILES)).toContain(".afol/config.json");

		for (const relativePath of [
			".agents/manifest.json",
			"src/project-template/.agents/manifest.json",
		]) {
			const manifest = JSON.parse(readRepoFile(relativePath)) as {
				ownership?: { "project-owned"?: string[] };
				managed_hashes?: Record<string, string>;
			};
			expect(manifest.ownership?.["project-owned"]).toContain(
				".afol/config.json",
			);
			expect(manifest.ownership?.["project-owned"]).not.toContain(
				".agents/config.json",
			);
			expect(manifest.managed_hashes?.[".agents/config.json"]).toBeUndefined();
		}
	});

	test("documents the external operator and downstream no-executable boundary", () => {
		const manifesto = readRepoFile(".afol/adm/doctrine/PROJECT-MANIFESTO.md");

		expect(manifesto.includes("project-local layer\n- .afol/config.json")).toBe(
			true,
		);
		expect(manifesto.includes("external operator command")).toBe(true);
		expect(manifesto.includes("root `./afol`")).toBe(true);
		expect(
			manifesto.includes("project wrapper\n- afol (public local front door)"),
		).toBe(false);
	});
});
