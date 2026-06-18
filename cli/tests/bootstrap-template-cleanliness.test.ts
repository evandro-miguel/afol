import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import {
	DEFAULT_TEMPLATE_FILES,
	DEFAULT_TEMPLATE_METADATA,
} from "../generated/template";
import { matchesTemplateForbiddenPattern } from "../schemas/template-policy";
import { planBootstrapOperations } from "../services/bootstrap/planner";

describe("generated template cleanliness", () => {
	test("generated payload excludes forbidden paths", () => {
		const paths = Object.keys(DEFAULT_TEMPLATE_FILES);
		const forbidden = paths.filter((path) =>
			matchesTemplateForbiddenPattern(path),
		);

		expect(DEFAULT_TEMPLATE_METADATA.excludedForbiddenCount).toBe(0);
		expect(DEFAULT_TEMPLATE_METADATA.generatedAt).toBe(
			"1970-01-01T00:00:00.000Z",
		);
		expect(forbidden).toEqual([]);
		expect(paths.some((path) => path.startsWith(".agents/scripts/"))).toBe(
			false,
		);
		expect(paths.some((path) => path.startsWith(".agents/runtime/"))).toBe(
			false,
		);
		expect(paths).not.toContain(".agents/agents");
		expect(paths).not.toContain(".agents/agents-mcp");
		expect(paths).not.toContain("a");
		expect(paths).not.toContain("Justfile");
		expect(paths.some((path) => path.endsWith(".py"))).toBe(false);
		expect(paths.some((path) => path.startsWith("docs/standards/"))).toBe(
			false,
		);
		expect(paths.some((path) => path.startsWith("docs/agentic/"))).toBe(false);
	});

	test("generated payload keeps project skills under .agents/skills", () => {
		const paths = Object.keys(DEFAULT_TEMPLATE_FILES);
		const configEntry = DEFAULT_TEMPLATE_FILES[".agents/config.json"];
		expect(configEntry).toBeDefined();
		expect(paths.some((path) => path.startsWith(".afol/skills/"))).toBe(false);
		expect(paths).not.toContain(".afol/skills");

		const config = JSON.parse(
			Buffer.from(configEntry?.contentBase64 ?? "", "base64").toString("utf8"),
		) as {
			paths: { skills_dir: string };
			skills_sync: { project_dir: string };
		};
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
});
