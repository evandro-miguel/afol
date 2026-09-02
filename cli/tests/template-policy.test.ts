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
	toolProbeSucceeded,
} from "../schemas/template-policy";
import { loadRegistry, validateRegistryContract } from "../validate/registry";

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
			writeFileSync(
				join(fixtureRoot, ".agents", "skills-sync.manifest.json"),
				"{}\n",
				"utf8",
			);
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
			expect(matches).toContain(".agents/skills-sync.manifest.json");
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

	test("keeps the downstream AGENTS.md within its context budget", async () => {
		const content = await readFile(
			join(process.cwd(), "src/project-template/AGENTS.md"),
			"utf8",
		);
		const lineCount = content.endsWith("\n")
			? content.slice(0, -1).split("\n").length
			: content.split("\n").length;
		expect(lineCount).toBeLessThanOrEqual(120);
		expect(Buffer.byteLength(content, "utf8")).toBeLessThanOrEqual(8000);
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

	test("live src/project-template carries a generated AFOL tools catalog", async () => {
		const projectRoot = process.cwd();
		const templateCatalog = JSON.parse(
			await readFile(
				join(projectRoot, "src/project-template/.afol/adm/tools.json"),
				"utf8",
			),
		);

		expect(templateCatalog.generated_from).toBe("cli/registry.ts");
		expect(templateCatalog.tools.length).toBeGreaterThan(0);
		expect(
			templateCatalog.tools.every(
				(entry: { stability?: unknown }) => typeof entry.stability === "string",
			),
		).toBe(true);
	});

	test("builtin assets carry a complete benchmark registry", async () => {
		const projectRoot = process.cwd();
		const templateRegistry = JSON.parse(
			await readFile(
				join(
					projectRoot,
					"src/builtin-assets/benchmarks/catalog/registry.json",
				),
				"utf8",
			),
		);

		expect(templateRegistry.coverage?.exemptions).toEqual([]);
		expect(templateRegistry.coverage?.subcommand_exemptions).toEqual([]);
	});

	test("template benchmark contract has no coverage issues", () => {
		const snapshot = loadRegistry(join(process.cwd(), "src/project-template"));

		expect(validateRegistryContract(snapshot)).toEqual([]);
	});

	test("builtin governance matrix has public command coverage", async () => {
		const projectRoot = process.cwd();
		const readMatrix = (relativePath: string) =>
			readFile(join(projectRoot, relativePath), "utf8").then((content) =>
				JSON.parse(content),
			);
		const templateMatrix = await readMatrix(
			"src/builtin-assets/benchmarks/catalog/scenarios/governance-history/tool-surface-coverage-matrix.json",
		);

		expect(templateMatrix.coverage.commands.length).toBeGreaterThan(0);
		expect(templateMatrix.coverage.subcommands.length).toBeGreaterThan(0);
	});

	test("template PSTR and fleet scenarios use public synthetic fixtures", async () => {
		const projectRoot = process.cwd();
		const scenarioRoots = [
			"src/builtin-assets/benchmarks/catalog/scenarios/pstr-integrity",
			"src/builtin-assets/benchmarks/catalog/scenarios/update-safety",
		];
		const forbiddenReferences = [
			["/", "home", "/", "ozy", "/"].join(""),
			"/tmp/",
			"src/project-template",
			".agents",
		];
		for (const scenarioRoot of scenarioRoots) {
			for (const name of (await readdir(join(projectRoot, scenarioRoot)))
				.filter((entry) => entry.endsWith(".json"))
				.sort()) {
				const isPstr = scenarioRoot.endsWith("pstr-integrity");
				const isFleet = name.startsWith("fleet-");
				if (!isPstr && !isFleet) {
					continue;
				}
				const relativePath = join(scenarioRoot, name);
				const content = await readFile(join(projectRoot, relativePath), "utf8");
				const scenario = JSON.parse(content) as {
					coverage?: { journeys?: string[] };
					sandbox?: boolean;
				};

				expect(
					forbiddenReferences.some((value) => content.includes(value)),
				).toBe(false);
				expect(scenario.coverage?.journeys?.length).toBeGreaterThan(0);
				if (isPstr) {
					expect(scenario.sandbox).toBe(true);
					expect(content).toContain("['cli'");
					expect(content).toContain("'docs'");
				}
			}
		}
	});

	test("route-task scenarios cannot start a task from the current active session", async () => {
		for (const scenarioPath of [
			".afol/data/benchmarks/catalog/scenarios/routing-accuracy/route-task.json",
			"src/builtin-assets/benchmarks/catalog/scenarios/routing-accuracy/route-task.json",
		].filter((path) => existsSync(join(process.cwd(), path)))) {
			const scenario = JSON.parse(
				await readFile(join(process.cwd(), scenarioPath), "utf8"),
			) as Record<string, unknown>;
			expect(scenario.command).toBe(
				"afol st -S benchmark-missing-session -T T-01",
			);
			expect(scenario.expected_exit).toBe(2);
		}
	});

	test("workbench benchmark scenarios are valid public builtin fixtures", async () => {
		const projectRoot = process.cwd();
		const templateCatalog = join(
			projectRoot,
			"src/builtin-assets/benchmarks/catalog/scenarios/workbench-parity",
		);
		const templateFiles = (await readdir(templateCatalog))
			.filter((name) => name.endsWith(".json"))
			.sort();
		expect(templateFiles.length).toBeGreaterThan(0);
		for (const name of templateFiles) {
			const templateScenario = JSON.parse(
				await readFile(join(templateCatalog, name), "utf8"),
			) as Record<string, unknown>;
			expect(typeof templateScenario.scenario_id).toBe("string");
			expect(templateScenario.compiled_binary).toBeUndefined();
		}
	});

	test("src/project-template does not vendor global agentic-folder-sys skill", async () => {
		const projectRoot = process.cwd();
		const forbiddenPaths = [
			".agents/skills/agentic-folder-sys",
			".agents/source/universal-skills/skills/agentic-folder-sys",
			".afol/adm/source/universal-skills/skills/agentic-folder-sys",
			"src/project-template/.agents/skills/agentic-folder-sys",
			"src/project-template/.agents/source/universal-skills/skills/agentic-folder-sys",
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
			"src/project-template/.agents/manifest.json",
			"src/project-template/.agents/lock.json",
			"src/project-template/.afol/adm/source/universal-skills/index.json",
			"src/project-template/.afol/adm/source/universal-skills/profiles/core.json",
		];
		const metadataMatches: string[] = [];
		for (const relativePath of metadataFiles) {
			if (!existsSync(join(projectRoot, relativePath))) continue;
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

	test("template excludes retired agentic-scaffold-mcp seed", async () => {
		const projectRoot = process.cwd();
		const forbiddenPaths = [
			".agents/skills/agentic-scaffold-mcp",
			".afol/adm/source/universal-skills/skills/agentic-scaffold-mcp",
			"src/project-template/.agents/skills/agentic-scaffold-mcp",
			"src/project-template/.afol/adm/source/universal-skills/skills/agentic-scaffold-mcp",
		];
		expect(
			forbiddenPaths.filter((path) => existsSync(join(projectRoot, path))),
		).toEqual([]);

		const metadataFiles = [
			".agents/manifest.json",
			".agents/lock.json",
			".afol/adm/source/universal-skills/index.json",
			".afol/adm/source/universal-skills/profiles/core.json",
			"src/project-template/.agents/manifest.json",
			"src/project-template/.agents/lock.json",
			"src/project-template/.afol/adm/source/universal-skills/index.json",
			"src/project-template/.afol/adm/source/universal-skills/profiles/core.json",
		];
		const matches: string[] = [];
		for (const relativePath of metadataFiles) {
			if (!existsSync(join(projectRoot, relativePath))) continue;
			const content = await readFile(join(projectRoot, relativePath), "utf8");
			if (content.includes("agentic-scaffold-mcp")) {
				matches.push(relativePath);
			}
		}
		expect(matches).toEqual([]);
	});
});

describe("scanTemplateToolchainClaims", () => {
	test("accepts a successful Windows probe with a spurious timeout error", () => {
		const probe = {
			status: 0,
			signal: null,
			error: Object.assign(new Error("spawnSync bun ETIMEDOUT"), {
				code: "ETIMEDOUT",
			}),
		};

		expect(toolProbeSucceeded(probe)).toBe(true);
	});

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
