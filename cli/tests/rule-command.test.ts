import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRuleCommand } from "../commands/catalog";

function mkRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "rule-command-"));
	mkdirSync(join(root, ".agents", "rules"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "rules", "index.json"),
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
		join(root, ".agents", "rules", "RULE-001-tool-discovery.md"),
		"# Rule 1\n",
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "rules", "RULE-004-validation-linting.md"),
		"# Rule 4\n",
		"utf8",
	);
	return root;
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

			const show = capture();
			expect(await runRuleCommand(["show", "RULE-004"], root, show.io)).toBe(0);
			expect(show.stdout.join("\n")).toContain("rule: RULE-004");
			expect(show.stdout.join("\n")).toContain("surfaces: testing,validation");
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
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back to rule files when rules index JSON is invalid", async () => {
		const root = mkRoot();
		try {
			writeFileSync(
				join(root, ".agents", "rules", "index.json"),
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
});
