import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { join } from "node:path";
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
		expect(paths.some((path) => path.startsWith("docs/standards/"))).toBe(
			false,
		);
		expect(paths.some((path) => path.startsWith("docs/agentic/"))).toBe(false);
	});

	test("generated payload keeps AFOL hooks and project skills in owned roots", () => {
		const paths = Object.keys(DEFAULT_TEMPLATE_FILES);
		const configEntry = DEFAULT_TEMPLATE_FILES[".agents/config.json"];
		expect(configEntry).toBeDefined();
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

	test("generated payload includes benchmark catalog required by validate bench", () => {
		const paths = Object.keys(DEFAULT_TEMPLATE_FILES);

		expect(paths).toContain(".afol/data/benchmarks/catalog/registry.json");
		expect(paths).toContain(
			".afol/data/benchmarks/catalog/scenarios/cli-kernel-local/cli-help-compact.json",
		);
		expect(paths).toContain(
			".afol/data/benchmarks/catalog/baselines/cli-kernel-local/baseline-v1.json",
		);
		expect(paths).toContain(".afol/adm/project-benchmarks/axes.json");
		expect(paths).toContain(".afol/adm/project-benchmarks/schema.json");
		expect(paths).toContain(".afol/adm/project-benchmarks/projects/aider.json");
		expect(paths).toContain(".afol/data/project-benchmarks/index.json");
		expect(paths).toContain(
			".afol/data/project-benchmarks/similarity-matrix.json",
		);
		expect(paths).toContain(
			".afol/data/project-benchmarks/generated-summary.md",
		);
		expect(paths).toContain(
			".afol/data/project-benchmarks/validation-report.json",
		);
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
