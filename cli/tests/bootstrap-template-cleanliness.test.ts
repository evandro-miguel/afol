import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_ASSET_FILES } from "../generated/builtin-assets";
import {
	DEFAULT_TEMPLATE_FILES,
	DEFAULT_TEMPLATE_METADATA,
} from "../generated/template";
import {
	matchesTemplateForbiddenPattern,
	scanTemplateForbiddenPaths,
	TEMPLATE_ROOT,
} from "../schemas/template-policy";
import { planBootstrapOperations } from "../services/bootstrap/planner";

describe("generated template cleanliness", () => {
	test("generated payload excludes forbidden paths", async () => {
		const sourceForbiddenPaths = await scanTemplateForbiddenPaths(
			join(process.cwd(), TEMPLATE_ROOT),
		);

		const paths = Object.keys(DEFAULT_TEMPLATE_FILES);
		expect(sourceForbiddenPaths).toEqual([]);
		const forbidden = paths.filter((path) =>
			matchesTemplateForbiddenPattern(path),
		);

		expect(sourceForbiddenPaths.length).toBe(
			DEFAULT_TEMPLATE_METADATA.excludedForbiddenCount,
		);
		expect(DEFAULT_TEMPLATE_METADATA.generatedAt).toBe(
			"1970-01-01T00:00:00.000Z",
		);
		expect(forbidden).toEqual([]);
		expect(paths.some((path) => path.startsWith("docs/arc/"))).toBe(false);
		expect(paths.some((path) => path.startsWith(".agents/scripts/"))).toBe(
			false,
		);
		expect(paths.some((path) => path.startsWith(".agents/runtime/"))).toBe(
			false,
		);
		expect(paths).not.toContain(".agents/agents");
		expect(paths).not.toContain(".agents/agents-mcp");
		expect(paths).not.toContain("CLAUDE.md");
		expect(paths.some((path) => path.startsWith(".claude/"))).toBe(false);
		expect(paths).not.toContain("a");
		expect(paths).not.toContain("afol");
		expect(paths).not.toContain("Justfile");
		expect(paths.some((path) => path.endsWith(".py"))).toBe(false);
		expect(paths).toContain("docs/standards/user-journey-registry.md");
		expect(paths.some((path) => path.startsWith("docs/agentic/"))).toBe(false);
	});

	test("generated payload keeps AFOL hooks and project skills in owned roots", () => {
		const paths = Object.keys(DEFAULT_TEMPLATE_FILES);
		const configEntry = DEFAULT_TEMPLATE_FILES[".afol/config.json"];
		expect(configEntry).toBeDefined();
		expect(paths).not.toContain(".agents/config.json");
		expect(paths).toContain(".afol/adm/hooks/index.json");
		expect(paths).toContain(".afol/adm/hooks/README.md");
		expect(paths).toContain(".afol/adm/source/universal-skills/index.json");
		expect(paths).toContain(".afol/adm/tools.json");
		expect(paths.some((path) => path.startsWith(".afol/skills/"))).toBe(false);
		expect(paths).not.toContain(".afol/skills");
		expect(paths.some((path) => path.startsWith(".agents/hooks/"))).toBe(false);
		expect(paths.some((path) => path.startsWith(".agents/rules/"))).toBe(false);
		expect(paths.some((path) => path.startsWith(".agents/source/"))).toBe(
			false,
		);
		expect(paths).not.toContain(".agents/tools.json");

		for (const metadataPath of [".agents/manifest.json", ".agents/lock.json"]) {
			const metadataEntry = DEFAULT_TEMPLATE_FILES[metadataPath];
			const metadata = JSON.parse(
				Buffer.from(metadataEntry?.contentBase64 ?? "", "base64").toString(
					"utf8",
				),
			) as {
				managed_hashes?: Record<string, string>;
				ownership?: { "project-owned"?: string[] };
			};
			if (metadataPath === ".agents/manifest.json") {
				expect(metadata.ownership?.["project-owned"]).toContain(
					".afol/config.json",
				);
			}
			expect(metadata.managed_hashes?.[".afol/config.json"]).toBeUndefined();
		}

		const config = JSON.parse(
			Buffer.from(configEntry?.contentBase64 ?? "", "base64").toString("utf8"),
		) as {
			paths: {
				adm_dir: string;
				hooks_dir: string;
				rules_dir: string;
				skills_dir: string;
			};
			skills_sync: { project_dir: string };
		};
		expect(config.paths.adm_dir).toBe(".afol/adm");
		expect(config.paths.hooks_dir).toBe(".afol/adm/hooks");
		expect(config.paths.rules_dir).toBe(".afol/adm/rules");
		expect(config.paths.skills_dir).toBe(".agents/skills");
		expect(config.skills_sync.project_dir).toBe(".agents/skills");
	});

	test("exported project skills keep valid discovery metadata and source parity", () => {
		const skillPaths = Object.keys(DEFAULT_TEMPLATE_FILES)
			.filter((path) => /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(path))
			.sort();

		expect(skillPaths).toEqual([
			".agents/skills/afol-library/SKILL.md",
			".agents/skills/afol-maintenance/SKILL.md",
			".agents/skills/afol-memory/SKILL.md",
			".agents/skills/afol-rules/SKILL.md",
		]);

		for (const path of skillPaths) {
			const entry = DEFAULT_TEMPLATE_FILES[path];
			expect(
				entry,
				`${path} must exist in the generated template`,
			).toBeDefined();
			if (!entry) {
				throw new Error(`${path} is missing from the generated template`);
			}
			const content = Buffer.from(entry.contentBase64, "base64").toString(
				"utf8",
			);
			const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
			expect(match, `${path} must have YAML frontmatter`).not.toBeNull();

			const frontmatter = Bun.YAML.parse(match?.[1] ?? "") as {
				name?: string;
				description?: string;
				metadata?: Record<string, unknown>;
			};
			const expectedName = path.split("/").at(-2);
			expect(frontmatter.name).toBe(expectedName);
			expect(frontmatter.description?.startsWith("Use when")).toBe(true);
			expect(typeof frontmatter.metadata?.tags).toBe("string");
			expect(typeof frontmatter.metadata?.triggers).toBe("string");
			expect(typeof frontmatter.metadata?.version).toBe("string");
			expect(typeof frontmatter.metadata?.updated_at).toBe("string");
			expect(frontmatter.metadata?.target_provider).toBe("universal");

			expect(content).toBe(
				readFileSync(join(process.cwd(), "src/project-template", path), "utf8"),
			);
		}
	});

	test("bootstrap planner never emits forbidden operations", () => {
		const plan = planBootstrapOperations({
			templateFiles: DEFAULT_TEMPLATE_FILES,
			currentFiles: {},
			manifest: {},
		});

		const forbiddenOps = plan.operations.filter((operation) =>
			matchesTemplateForbiddenPattern(operation.path),
		);
		expect(forbiddenOps).toEqual([]);
		expect(plan.filteredForbiddenCount).toBe(0);
		expect(plan.operations.some((operation) => operation.path === "a")).toBe(
			false,
		);
		expect(plan.operations.some((operation) => operation.path === "afol")).toBe(
			false,
		);
		expect(
			plan.operations.some((operation) => operation.path === "Justfile"),
		).toBe(false);
	});

	test("generated payload excludes builtin catalogs and generated benchmark state", () => {
		const paths = Object.keys(DEFAULT_TEMPLATE_FILES);

		expect(paths.some((path) => path.includes("benchmarks/catalog"))).toBe(
			false,
		);
		expect(paths.some((path) => path.includes("project-benchmarks"))).toBe(
			false,
		);
		expect(
			BUILTIN_ASSET_FILES["benchmarks/catalog/registry.json"],
		).toBeDefined();
		expect(BUILTIN_ASSET_FILES["project-benchmarks/axes.json"]).toBeDefined();
		expect(paths.length).toBeLessThanOrEqual(100);
		expect(
			Object.values(DEFAULT_TEMPLATE_FILES).reduce(
				(total, entry) => total + entry.bytes,
				0,
			),
		).toBeLessThanOrEqual(256 * 1024);
		const agents = DEFAULT_TEMPLATE_FILES["AGENTS.md"];
		expect(agents).toBeDefined();
		const agentsText = Buffer.from(
			agents?.contentBase64 ?? "",
			"base64",
		).toString("utf8");
		expect(agentsText.split("\n").length).toBeLessThanOrEqual(120);
		expect(Buffer.byteLength(agentsText)).toBeLessThanOrEqual(8_000);
	});

	test("generated payload does not tell agents to mark lifecycle tasks with checkboxes", () => {
		const forbiddenMatches = Object.entries(DEFAULT_TEMPLATE_FILES)
			.filter(([path]) =>
				["AGENTS.md", "docs/templates/task.md"].includes(path),
			)
			.flatMap(([path, entry]) => {
				const content = Buffer.from(entry.contentBase64, "base64").toString(
					"utf8",
				);
				return ["mark `[x]`", "mark [x]", "State marker rules"]
					.filter((forbidden) => content.includes(forbidden))
					.map((forbidden) => `${path}: ${forbidden}`);
			});

		expect(forbiddenMatches).toEqual([]);
	});
});
