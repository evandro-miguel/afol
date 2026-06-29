import { describe, expect, test } from "bun:test";
import {
	isTemplatePathMatch,
	manifestTemplatePatterns,
	normalizeManifestPath,
	resolveManifestTemplatePath,
} from "../services/template/manifest-paths";

describe("template manifest path helpers", () => {
	test("normalizes manifest paths for stable matching", () => {
		expect(normalizeManifestPath(" ./hooks//index.json ")).toBe(
			"hooks/index.json",
		);
		expect(normalizeManifestPath("\\rules\\core.md")).toBe("rules/core.md");
		expect(normalizeManifestPath("/.afol/adm/tools.json")).toBe(
			".afol/adm/tools.json",
		);
	});

	test("maps legacy governance and mutable paths to template candidates", () => {
		expect(manifestTemplatePatterns("rules/core.md")).toEqual([
			".afol/adm/rules/core.md",
			"rules/core.md",
			".agents/rules/core.md",
		]);
		expect(manifestTemplatePatterns("tools.json")).toEqual([
			".afol/adm/tools.json",
			"tools.json",
			".agents/tools.json",
		]);
		expect(manifestTemplatePatterns("data/index.json")).toEqual([
			".afol/data/index.json",
			"data/index.json",
			".agents/data/index.json",
		]);
	});

	test("resolves the first existing template candidate", () => {
		const paths = new Set([".agents/rules/core.md", ".afol/adm/tools.json"]);

		expect(resolveManifestTemplatePath("rules/core.md", paths)).toBe(
			".agents/rules/core.md",
		);
		expect(resolveManifestTemplatePath("tools.json", paths)).toBe(
			".afol/adm/tools.json",
		);
		expect(resolveManifestTemplatePath("missing.md", paths)).toBeUndefined();
	});

	test("matches exact paths and descendant paths only", () => {
		expect(
			isTemplatePathMatch("docs/templates", "docs/templates/spec.md"),
		).toBe(true);
		expect(isTemplatePathMatch("docs/templates", "docs/templates")).toBe(true);
		expect(isTemplatePathMatch("docs/templates", "docs/templates-old")).toBe(
			false,
		);
	});
});
