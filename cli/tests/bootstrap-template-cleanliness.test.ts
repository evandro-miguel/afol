import { describe, expect, test } from "bun:test";
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
});
