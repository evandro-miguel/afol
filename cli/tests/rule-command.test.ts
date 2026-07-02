import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRuleCommand } from "../commands/catalog";
import {
	getRuleResolverConfig,
	listRules,
	resolveRules,
	resolveRulesWithDiagnostics,
} from "../services/catalog/rules";

function mkRoot(config?: {
	maxCharsPerRule?: number;
	maxCharsTotal?: number;
}): string {
	const root = mkdtempSync(join(tmpdir(), "rule-command-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "rules"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "rule-command-test" },
			rules: {
				resolver: {
					max_chars_per_rule: config?.maxCharsPerRule ?? 2000,
					max_chars_total: config?.maxCharsTotal ?? 4000,
				},
			},
		}),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "rules", "index.json"),
		JSON.stringify({
			rules: [
				{
					id: "RULE-001",
					name: "tool-discovery",
					path: "RULE-001-tool-discovery.md",
					surfaces: ["routing", "tools"],
					work_types: ["delivery"],
					priority: 20,
				},
				{
					id: "RULE-004",
					name: "validation-linting",
					path: "RULE-004-validation-linting.md",
					surfaces: ["testing", "validation"],
					work_types: ["delivery", "validation"],
					priority: 100,
				},
			],
		}),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "rules", "RULE-001-tool-discovery.md"),
		"# Rule 1\n",
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "rules", "RULE-004-validation-linting.md"),
		"# Rule 4\n",
		"utf8",
	);
	return root;
}

function writeRuleFixture(
	root: string,
	options: {
		id: string;
		name: string;
		path: string;
		content: string;
		scope?: string;
		required?: boolean;
		domains?: string[];
		surfaces?: string[];
		workTypes?: string[];
		languages?: string[];
		fileGlobs?: string[];
		exactFiles?: string[];
		inject?: string;
		priority?: number;
	},
): void {
	writeFileSync(
		join(root, ".afol", "adm", "rules", options.path),
		options.content,
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "rules", "index.json"),
		JSON.stringify({
			rules: [
				{
					id: options.id,
					name: options.name,
					path: options.path,
					scope: options.scope,
					required: options.required,
					domains: options.domains,
					surfaces: options.surfaces,
					work_types: options.workTypes,
					languages: options.languages,
					file_globs: options.fileGlobs,
					exact_files: options.exactFiles,
					inject: options.inject,
					priority: options.priority ?? 50,
				},
			],
		}),
		"utf8",
	);
}

function capture() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => stdout.push(message),
			stderr: (message: string) => stderr.push(message),
		},
	};
}

describe("rule command", () => {
	test("lists and shows rule metadata", async () => {
		const root = mkRoot();
		try {
			const list = capture();
			expect(await runRuleCommand(["list"], root, list.io)).toBe(0);
			expect(list.stdout.join("\n")).toContain("rules: 2");
			expect(list.stdout.join("\n")).toContain("RULE-004 validation-linting");
			const jsonList = capture();
			expect(await runRuleCommand(["list", "--json"], root, jsonList.io)).toBe(
				0,
			);
			const jsonListPayload = JSON.parse(jsonList.stdout[0] ?? "{}") as {
				ok: boolean;
				data: { count: number };
			};
			expect(jsonListPayload.ok).toBe(true);
			expect(jsonListPayload.data.count).toBe(2);

			const show = capture();
			expect(await runRuleCommand(["show", "RULE-004"], root, show.io)).toBe(0);
			expect(show.stdout.join("\n")).toContain("rule: RULE-004");
			expect(show.stdout.join("\n")).toContain("surfaces: testing,validation");
			const jsonShow = capture();
			expect(
				await runRuleCommand(["show", "RULE-004", "--json"], root, jsonShow.io),
			).toBe(0);
			const jsonShowPayload = JSON.parse(jsonShow.stdout[0] ?? "{}") as {
				ok: boolean;
				data: { rule: { id: string } };
			};
			expect(jsonShowPayload.ok).toBe(true);
			expect(jsonShowPayload.data.rule.id).toBe("RULE-004");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolves rules by surface and work type", async () => {
		const root = mkRoot();
		try {
			const output = capture();
			expect(
				await runRuleCommand(
					["resolve", "--surface", "testing", "--work-type", "validation"],
					root,
					output.io,
				),
			).toBe(0);
			expect(output.stdout.join("\n")).toContain("resolved rules: 1");
			expect(output.stdout.join("\n")).toContain("RULE-004");
			expect(output.stdout.join("\n")).not.toContain("RULE-001");
			const jsonOutput = capture();
			expect(
				await runRuleCommand(
					[
						"resolve",
						"--json",
						"--surface",
						"testing",
						"--work-type",
						"validation",
					],
					root,
					jsonOutput.io,
				),
			).toBe(0);
			const jsonResolvePayload = JSON.parse(jsonOutput.stdout[0] ?? "{}") as {
				ok: boolean;
				data: { count: number };
			};
			expect(jsonResolvePayload.ok).toBe(true);
			expect(jsonResolvePayload.data.count).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back to rule files when rules index JSON is invalid", async () => {
		const root = mkRoot();
		try {
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				"{invalid-json",
				"utf8",
			);

			const list = capture();
			expect(await runRuleCommand(["list"], root, list.io)).toBe(0);
			expect(list.stderr).toEqual([]);
			expect(list.stdout.join("\n")).toContain("rules: 2");
			expect(list.stdout.join("\n")).toContain("RULE-001");
			expect(list.stdout.join("\n")).toContain("RULE-004");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fallback ignores README frontmatter and only loads RULE markdown", async () => {
		const root = mkRoot();
		try {
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				"{invalid-json",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "README.md"),
				["---", `summary: ${"x".repeat(120)}`, "---", "", "# Rules"].join("\n"),
				"utf8",
			);

			const rules = listRules(root);
			expect(rules.map((rule) => rule.id)).toEqual(["RULE-001", "RULE-004"]);

			const list = capture();
			expect(await runRuleCommand(["list"], root, list.io)).toBe(0);
			expect(list.stdout.join("\n")).toContain("rules: 2");
			expect(list.stdout.join("\n")).not.toContain("README");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolves extended rule metadata and enforces configured char limits", async () => {
		const root = mkRoot({ maxCharsPerRule: 20, maxCharsTotal: 30 });
		try {
			writeRuleFixture(root, {
				id: "RULE-011",
				name: "surface-domain-rule",
				path: "RULE-011-surface-domain-rule.md",
				content: "alpha matching rule",
				scope: "catalog",
				required: true,
				domains: ["cli"],
				surfaces: ["routing"],
				workTypes: ["delivery"],
				languages: ["ts"],
				fileGlobs: ["cli/**/*.ts"],
				exactFiles: ["cli/commands/catalog.ts"],
				inject: "always",
				priority: 100,
			});
			const rules = listRules(root);
			expect(rules).toHaveLength(1);
			expect(rules[0]?.required).toBe(true);
			expect(rules[0]?.path).toBe(
				".afol/adm/rules/RULE-011-surface-domain-rule.md",
			);
			expect(rules[0]?.charCount).toBe("alpha matching rule".length);
			expect(getRuleResolverConfig(root)).toEqual({
				maxCharsPerRule: 20,
				maxCharsTotal: 30,
			});

			writeFileSync(
				join(root, ".afol", "adm", "rules", "RULE-012-big-rule.md"),
				"x".repeat(25),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-011",
							name: "surface-domain-rule",
							path: "RULE-011-surface-domain-rule.md",
							scope: "catalog",
							required: true,
							domains: ["cli"],
							surfaces: ["routing"],
							work_types: ["delivery"],
							languages: ["ts"],
							file_globs: ["cli/**/*.ts"],
							exact_files: ["cli/commands/catalog.ts"],
							inject: "always",
							priority: 100,
						},
						{
							id: "RULE-012",
							name: "too-big-rule",
							path: "RULE-012-big-rule.md",
							domains: ["cli"],
							surfaces: ["routing"],
							work_types: ["delivery"],
							languages: ["ts"],
							file_globs: ["cli/**/*.ts"],
							inject: "always",
							priority: 90,
						},
					],
				}),
				"utf8",
			);

			const resolved = resolveRules(root, {
				domains: ["cli"],
				surfaces: ["routing"],
				workType: "delivery",
				languages: ["ts"],
				filePath: "cli/commands/catalog.ts",
				scope: "catalog",
				inject: "always",
			});
			expect(resolved.map((rule) => rule.id)).toEqual(["RULE-011"]);
			const diagnostic = resolveRulesWithDiagnostics(root, {
				domains: ["cli"],
				surfaces: ["routing"],
				workType: "delivery",
				languages: ["ts"],
				filePath: "cli/commands/catalog.ts",
				scope: "catalog",
				inject: "always",
			});
			expect(diagnostic.rules.map((rule) => rule.id)).toEqual(["RULE-011"]);
			expect(diagnostic.warnings).toEqual([
				{
					id: "RULE-012",
					path: ".afol/adm/rules/RULE-012-big-rule.md",
					reason: "rule exceeds max_chars_per_rule (25/20)",
				},
			]);

			const output = capture();
			expect(
				await runRuleCommand(
					[
						"resolve",
						"--domain",
						"cli",
						"--surface",
						"routing",
						"--work-type",
						"delivery",
						"--language",
						"ts",
						"--file",
						"cli/commands/catalog.ts",
						"--scope",
						"catalog",
						"--inject",
						"always",
					],
					root,
					output.io,
				),
			).toBe(0);
			expect(output.stdout.join("\n")).toContain("resolved rules: 1");
			expect(output.stdout.join("\n")).toContain("RULE-011");
			expect(output.stdout.join("\n")).toContain(
				"warning RULE-012: rule exceeds max_chars_per_rule (25/20)",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("counts rule body without YAML frontmatter", () => {
		const root = mkRoot({ maxCharsPerRule: 20, maxCharsTotal: 30 });
		try {
			const body = "# Body\nsmall\n";
			writeRuleFixture(root, {
				id: "RULE-013",
				name: "frontmatter-heavy",
				path: "RULE-013-frontmatter-heavy.md",
				content: [
					"---",
					`summary: ${"x".repeat(80)}`,
					"status: active",
					"---",
					"",
					body,
				].join("\n"),
				domains: ["cli"],
				surfaces: ["routing"],
				workTypes: ["delivery"],
				languages: ["ts"],
				fileGlobs: ["cli/**/*.ts"],
				inject: "always",
			});

			const rules = listRules(root);
			expect(rules[0]?.charCount).toBe(body.length);
			const diagnostic = resolveRulesWithDiagnostics(root, {
				domains: ["cli"],
				surfaces: ["routing"],
				workType: "delivery",
				languages: ["ts"],
				filePath: "cli/commands/catalog.ts",
				inject: "always",
			});
			expect(diagnostic.rules.map((rule) => rule.id)).toEqual(["RULE-013"]);
			expect(diagnostic.warnings).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails loudly when a required rule exceeds max_chars_per_rule", async () => {
		const root = mkRoot({ maxCharsPerRule: 20, maxCharsTotal: 100 });
		try {
			writeRuleFixture(root, {
				id: "RULE-021",
				name: "required-too-big",
				path: "RULE-021-required-too-big.md",
				content: "x".repeat(25),
				required: true,
				domains: ["cli"],
				surfaces: ["routing"],
				workTypes: ["delivery"],
				languages: ["ts"],
				fileGlobs: ["cli/**/*.ts"],
				priority: 100,
			});

			expect(() =>
				resolveRules(root, {
					domains: ["cli"],
					surfaces: ["routing"],
					workType: "delivery",
					languages: ["ts"],
					filePath: "cli/commands/catalog.ts",
				}),
			).toThrow(
				"Required rule RULE-021 cannot be resolved: rule exceeds max_chars_per_rule (25/20)",
			);

			const output = capture();
			expect(
				await runRuleCommand(
					[
						"resolve",
						"--domain",
						"cli",
						"--surface",
						"routing",
						"--work-type",
						"delivery",
						"--language",
						"ts",
						"--file",
						"cli/commands/catalog.ts",
						"--required",
					],
					root,
					output.io,
				),
			).toBe(2);
			expect(output.stderr).toContain(
				"Required rule RULE-021 cannot be resolved: rule exceeds max_chars_per_rule (25/20)",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails loudly when required rules exceed max_total_chars", () => {
		const root = mkRoot({ maxCharsPerRule: 20, maxCharsTotal: 30 });
		try {
			writeFileSync(
				join(root, ".afol", "adm", "rules", "RULE-031-required-a.md"),
				"a".repeat(18),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "RULE-032-required-b.md"),
				"b".repeat(18),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-031",
							name: "required-a",
							path: "RULE-031-required-a.md",
							required: true,
							domains: ["cli"],
							surfaces: ["routing"],
							work_types: ["delivery"],
							languages: ["ts"],
							file_globs: ["cli/**/*.ts"],
							priority: 100,
						},
						{
							id: "RULE-032",
							name: "required-b",
							path: "RULE-032-required-b.md",
							required: true,
							domains: ["cli"],
							surfaces: ["routing"],
							work_types: ["delivery"],
							languages: ["ts"],
							file_globs: ["cli/**/*.ts"],
							priority: 90,
						},
					],
				}),
				"utf8",
			);

			expect(() =>
				resolveRules(root, {
					domains: ["cli"],
					surfaces: ["routing"],
					workType: "delivery",
					languages: ["ts"],
					filePath: "cli/commands/catalog.ts",
				}),
			).toThrow(
				"Required rule RULE-032 cannot be resolved: rule exceeds max_total_chars (36/30)",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects invalid file paths for rule resolve API and CLI", async () => {
		const root = mkRoot();
		try {
			expect(() =>
				resolveRules(root, {
					surfaces: ["testing"],
					workType: "validation",
					filePath: "../escape.ts",
				}),
			).toThrow("Invalid rule resolve file path: ../escape.ts");

			const output = capture();
			expect(
				await runRuleCommand(
					[
						"resolve",
						"--surface",
						"testing",
						"--work-type",
						"validation",
						"--file",
						"../escape.ts",
					],
					root,
					output.io,
				),
			).toBe(2);
			expect(output.stderr).toContain(
				"Invalid rule resolve file path: ../escape.ts",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps unsafe rule paths inside rules_dir", () => {
		const root = mkRoot();
		try {
			writeFileSync(
				join(root, ".afol", "adm", "rules", "RULE-099-safe-name.md"),
				"safe path rule",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "rules", "index.json"),
				JSON.stringify({
					rules: [
						{
							id: "RULE-099",
							name: "safe-name",
							path: "../RULE-099-safe-name.md",
						},
					],
				}),
				"utf8",
			);
			const rule = listRules(root)[0];
			expect(rule?.path).toBe(".afol/adm/rules/RULE-099-safe-name.md");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
