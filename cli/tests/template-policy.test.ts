import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

import {
	matchesTemplateForbiddenPattern,
	scanProjectTemplateForbiddenPaths,
	scanProjectTemplateForbiddenTextReferences,
	scanProjectTemplateUnknownAllowedPaths,
	scanTemplateForbiddenPaths,
	scanTemplateToolchainClaims,
} from "../schemas/template-policy";

function toPosixPath(path: string): string {
	return path.split(sep).join("/");
}

async function collectJsonFiles(root: string): Promise<string[]> {
	const paths: string[] = [];

	async function walk(currentDir: string): Promise<void> {
		const entries = await readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const absolutePath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await walk(absolutePath);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(".json")) {
				paths.push(toPosixPath(relative(root, absolutePath)));
			}
		}
	}

	await walk(root);
	return paths.sort();
}

describe("template forbidden-content policy", () => {
	test("matches expected forbidden patterns in a small fixture", async () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), "template-policy-fixture-"));
		try {
			mkdirSync(join(fixtureRoot, ".agents", "runtime"), { recursive: true });
			mkdirSync(join(fixtureRoot, "docs", "standards"), { recursive: true });
			mkdirSync(join(fixtureRoot, "docs", "arc"), { recursive: true });
			mkdirSync(join(fixtureRoot, "docs", "templates"), { recursive: true });
			mkdirSync(join(fixtureRoot, "tests"), { recursive: true });

			writeFileSync(
				join(fixtureRoot, ".agents", "runtime", "main.py"),
				"print('x')\n",
				"utf8",
			);
			writeFileSync(join(fixtureRoot, "a"), "#!/usr/bin/env bash\n", "utf8");
			writeFileSync(join(fixtureRoot, "afol"), "#!/usr/bin/env bash\n", "utf8");
			writeFileSync(join(fixtureRoot, "Justfile"), "validate:\n", "utf8");
			writeFileSync(
				join(fixtureRoot, "docs", "standards", "policy.md"),
				"x\n",
				"utf8",
			);
			writeFileSync(
				join(fixtureRoot, "docs", "arc", "README.md"),
				"x\n",
				"utf8",
			);
			writeFileSync(join(fixtureRoot, "tests", "sample.txt"), "x\n", "utf8");
			writeFileSync(
				join(fixtureRoot, "docs", "templates", "ok.md"),
				"x\n",
				"utf8",
			);

			const matches = await scanTemplateForbiddenPaths(fixtureRoot);

			expect(matches).toContain(".agents/runtime/main.py");
			expect(matches).toContain("a");
			expect(matches).toContain("afol");
			expect(matches).toContain("Justfile");
			expect(matches).not.toContain("docs/standards/policy.md");
			expect(matches).toContain("docs/arc/README.md");
			expect(matches).toContain("tests/sample.txt");
			expect(matches).not.toContain("docs/templates/ok.md");
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	test("blocks secret-bearing template payload paths", () => {
		for (const path of [
			".env",
			".env.local",
			"nested/.env.production",
			"certs/private.key",
			"certs/private.pem",
			"certs/bundle.p12",
			"certs/bundle.pfx",
		]) {
			expect(matchesTemplateForbiddenPattern(path)).toBe(true);
		}

		expect(matchesTemplateForbiddenPattern(".env.example")).toBe(false);
		expect(matchesTemplateForbiddenPattern("docs/.env.example")).toBe(false);
	});

	test("live src/project-template has no forbidden content", async () => {
		const matches = await scanProjectTemplateForbiddenPaths(process.cwd());

		if (matches.length > 0) {
			throw new Error(
				[
					`Forbidden content found in src/project-template (${matches.length}):`,
					...matches.map((path) => ` - ${path}`),
				].join("\n"),
			);
		}

		expect(matches).toEqual([]);
	});

	test("live src/project-template only uses explicit allowed payload classes", async () => {
		const matches = await scanProjectTemplateUnknownAllowedPaths(process.cwd());

		if (matches.length > 0) {
			throw new Error(
				[
					`Unexpected template payload paths in src/project-template (${matches.length}):`,
					...matches.map((path) => ` - ${path}`),
				].join("\n"),
			);
		}

		expect(matches).toEqual([]);
	});

	test("live src/project-template instructions do not reference removed or unsupported runtime surfaces", () => {
		const matches = scanProjectTemplateForbiddenTextReferences(process.cwd());

		if (matches.length > 0) {
			throw new Error(
				[
					`Forbidden text references found in src/project-template instructions (${matches.length}):`,
					...matches.map((match) => ` - ${match}`),
				].join("\n"),
			);
		}

		expect(matches).toEqual([]);
	});

	test("live src/project-template does not describe workbench lifecycle as checklist marking", async () => {
		const templateRoot = join(process.cwd(), "src/project-template");
		const files = ["AGENTS.md", "docs/templates/task.md"];
		const forbiddenMatches: string[] = [];

		for (const file of files) {
			const content = await readFile(join(templateRoot, file), "utf8");
			for (const forbidden of [
				"mark `[x]`",
				"mark [x]",
				"State marker rules",
			]) {
				if (content.includes(forbidden)) {
					forbiddenMatches.push(`${file}: ${forbidden}`);
				}
			}
		}

		expect(forbiddenMatches).toEqual([]);
	});

	test("live src/project-template JSON files parse", async () => {
		const templateRoot = join(process.cwd(), "src/project-template");
		const jsonFiles = await collectJsonFiles(templateRoot);
		const failures: string[] = [];

		for (const relativePath of jsonFiles) {
			const absolutePath = join(templateRoot, relativePath);
			try {
				JSON.parse(await readFile(absolutePath, "utf8"));
			} catch (error) {
				failures.push(`${relativePath}: ${(error as Error).message}`);
			}
		}

		if (failures.length > 0) {
			throw new Error(
				[
					`Invalid JSON in src/project-template (${failures.length}):`,
					...failures,
				].join("\n"),
			);
		}

		expect(jsonFiles.length).toBeGreaterThan(0);
		expect(failures).toEqual([]);
	});

	test("live src/project-template manifest covers documented payload roots", async () => {
		const manifest = JSON.parse(
			await readFile(
				join(process.cwd(), "src/project-template/.agents/manifest.json"),
				"utf8",
			),
		);
		const projectOwned = manifest.ownership?.["project-owned"] ?? [];
		const ignored = manifest.ownership?.ignored ?? [];

		for (const path of [
			".afol/config.json",
			".agents/lock.json",
			".agents/manifest.json",
			".agents/skills",
			".afol/adm",
			".afol/data/benchmarks",
			".afol/data/telemetry",
			".afol/library",
			".afol/memory",
			".afol/wb",
			"AGENTS.md",
			"docs/lessons",
			"docs/standards",
			"docs/telemetry",
			"docs/templates",
		]) {
			expect(projectOwned).toContain(path);
		}

		for (const path of [".afol/data/README.md", ".afol/pstr/README.md"]) {
			expect(ignored).toContain(path);
		}
	});

	test("live src/project-template carries current AFOL tools catalog", async () => {
		const projectRoot = process.cwd();
		const rootCatalog = JSON.parse(
			await readFile(join(projectRoot, ".afol/adm/tools.json"), "utf8"),
		);
		const templateCatalog = JSON.parse(
			await readFile(
				join(projectRoot, "src/project-template/.afol/adm/tools.json"),
				"utf8",
			),
		);

		expect(templateCatalog).toEqual(rootCatalog);
	});

	test("live src/project-template carries current benchmark registry", async () => {
		const projectRoot = process.cwd();
		const rootRegistry = JSON.parse(
			await readFile(
				join(projectRoot, ".afol/data/benchmarks/catalog/registry.json"),
				"utf8",
			),
		);
		const templateRegistry = JSON.parse(
			await readFile(
				join(
					projectRoot,
					"src/project-template/.afol/data/benchmarks/catalog/registry.json",
				),
				"utf8",
			),
		);

		expect(templateRegistry).toEqual(rootRegistry);
		expect(templateRegistry.coverage?.exemptions).toEqual([]);
		expect(templateRegistry.coverage?.subcommand_exemptions).toEqual([]);
	});

	test("live repo and src/project-template do not vendor global agentic-folder-sys skill", async () => {
		const projectRoot = process.cwd();
		const forbiddenPaths = [
			".agents/skills/agentic-folder-sys",
			".afol/adm/source/universal-skills/skills/agentic-folder-sys",
			"src/project-template/.agents/skills/agentic-folder-sys",
			"src/project-template/.afol/adm/source/universal-skills/skills/agentic-folder-sys",
		];
		const existingForbiddenPaths = forbiddenPaths.filter((path) =>
			existsSync(join(projectRoot, path)),
		);

		const metadataFiles = [
			".agents/manifest.json",
			".agents/lock.json",
			".afol/adm/source/universal-skills/index.json",
			".afol/adm/source/universal-skills/profiles/core.json",
			"src/project-template/.afol/adm/source/universal-skills/index.json",
			"src/project-template/.afol/adm/source/universal-skills/profiles/core.json",
		];
		const metadataMatches: string[] = [];
		for (const relativePath of metadataFiles) {
			const content = await readFile(join(projectRoot, relativePath), "utf8");
			if (content.includes("agentic-folder-sys")) {
				metadataMatches.push(relativePath);
			}
		}

		const manifest = JSON.parse(
			await readFile(
				join(projectRoot, "src/project-template/.agents/manifest.json"),
				"utf8",
			),
		);
		const managedHashes = Object.keys(manifest.managed_hashes ?? {}).filter(
			(path) => path.includes("agentic-folder-sys"),
		);
		const lock = JSON.parse(
			await readFile(
				join(projectRoot, "src/project-template/.agents/lock.json"),
				"utf8",
			),
		);
		const lockManagedHashes = Object.keys(lock.managed_hashes ?? {}).filter(
			(path) => path.includes("agentic-folder-sys"),
		);

		expect(existingForbiddenPaths).toEqual([]);
		expect(metadataMatches).toEqual([]);
		expect(managedHashes).toEqual([]);
		expect(lockManagedHashes).toEqual([]);
	});
});

describe("scanTemplateToolchainClaims", () => {
	test("returns claims for bun and afol", () => {
		const claims = scanTemplateToolchainClaims();
		expect(claims.length).toBeGreaterThanOrEqual(2);
		const bun = claims.find((claim) => claim.tool === "bun");
		const afol = claims.find((claim) => claim.tool === "afol");
		if (!bun || !afol) {
			throw new Error("expected bun and afol toolchain claims");
		}
		expect(bun.critical).toBe(true);
		expect(afol.critical).toBe(false);
		// bun should be available in this test environment
		expect(bun.available).toBe(true);
	});
});
