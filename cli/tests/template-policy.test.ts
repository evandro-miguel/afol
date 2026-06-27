import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

async function collectFiles(root: string): Promise<string[]> {
	const paths: string[] = [];

	async function walk(currentDir: string): Promise<void> {
		const entries = await readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const absolutePath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await walk(absolutePath);
				continue;
			}
			if (entry.isFile()) {
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

	test("live src/project-template carries current agentic-folder-sys skill source", async () => {
		const projectRoot = process.cwd();
		const activeSkillRoot = join(
			projectRoot,
			".agents/skills/agentic-folder-sys",
		);
		const templateSkillRoot = join(
			projectRoot,
			"src/project-template/.afol/adm/source/universal-skills/skills/agentic-folder-sys",
		);
		const activeFiles = await collectFiles(activeSkillRoot);
		const templateFiles = await collectFiles(templateSkillRoot);
		const mismatches: string[] = [];

		expect(templateFiles).toEqual(activeFiles);

		for (const relativePath of activeFiles) {
			const activeContent = await readFile(
				join(activeSkillRoot, relativePath),
				"utf8",
			);
			const templateContent = await readFile(
				join(templateSkillRoot, relativePath),
				"utf8",
			);
			if (templateContent !== activeContent) {
				mismatches.push(relativePath);
			}
		}

		expect(mismatches).toEqual([]);
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
