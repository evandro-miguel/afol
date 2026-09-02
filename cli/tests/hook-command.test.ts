import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHookCommand } from "../commands/catalog";
import {
	getHookResolverConfig,
	listHooks,
	resolveHooks,
} from "../services/catalog/hooks";

function mkRoot(config?: {
	maxMessageChars?: number;
	maxMessageCharsTotal?: number;
}): string {
	const root = mkdtempSync(join(tmpdir(), "hook-command-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "hooks"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "hook-command-test" },
			hooks: {
				resolver: {
					max_chars_per_message: config?.maxMessageChars ?? 1000,
					max_chars_total: config?.maxMessageCharsTotal ?? 3000,
				},
			},
		}),
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "hooks", "index.json"),
		JSON.stringify({
			hooks: [
				{
					id: "HOOK-ALPHA",
					name: "alpha bundle",
					path: "alpha.md",
					events: ["context.bundle"],
					roles: ["designer"],
					surfaces: ["alpha"],
					work_types: ["delivery"],
					languages: ["ts"],
					file_globs: ["cli/**/*.ts"],
					priority: 80,
					contributions: {
						messages: ["Use the alpha hook."],
						tools: ["afol hook resolve --event context.bundle"],
						validation_commands: ["bun test"],
						pstr_refs: ["pstr:alpha-map"],
						memory_refs: ["memory:alpha"],
						library_refs: ["library:alpha"],
						do_not_load: ["raw plugin payloads"],
					},
				},
				{
					id: "HOOK-BETA",
					name: "beta bundle",
					events: ["context.bundle"],
					roles: ["reviewer"],
					surfaces: ["beta"],
					work_types: ["delivery"],
					priority: 10,
					contributions: {
						messages: ["Use the beta hook."],
					},
				},
			],
		}),
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

describe("hook command", () => {
	test("lists and shows hook metadata", async () => {
		const root = mkRoot();
		try {
			const list = capture();
			expect(await runHookCommand(["list"], root, list.io)).toBe(0);
			expect(list.stdout.join("\n")).toContain("hooks: 2");
			expect(list.stdout.join("\n")).toContain("HOOK-ALPHA alpha bundle");
			const jsonList = capture();
			expect(await runHookCommand(["list", "--json"], root, jsonList.io)).toBe(
				0,
			);
			const jsonListPayload = JSON.parse(jsonList.stdout[0] ?? "{}") as {
				ok: boolean;
				data: { count: number };
			};
			expect(jsonListPayload.ok).toBe(true);
			expect(jsonListPayload.data.count).toBe(2);

			const show = capture();
			expect(await runHookCommand(["show", "HOOK-ALPHA"], root, show.io)).toBe(
				0,
			);
			expect(show.stdout.join("\n")).toContain("hook: HOOK-ALPHA");
			expect(show.stdout.join("\n")).toContain("events: context.bundle");
			expect(show.stdout.join("\n")).toContain("messages: 1");
			expect(show.stdout.join("\n")).toContain("validation_commands: 1");
			const jsonShow = capture();
			expect(
				await runHookCommand(
					["show", "HOOK-ALPHA", "--json"],
					root,
					jsonShow.io,
				),
			).toBe(0);
			const jsonShowPayload = JSON.parse(jsonShow.stdout[0] ?? "{}") as {
				ok: boolean;
				data: { hook: { id: string } };
			};
			expect(jsonShowPayload.ok).toBe(true);
			expect(jsonShowPayload.data.hook.id).toBe("HOOK-ALPHA");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolves hooks by event role surface work type language and file", async () => {
		const root = mkRoot();
		try {
			const output = capture();
			expect(
				await runHookCommand(
					[
						"resolve",
						"--event",
						"context.bundle",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--work-type",
						"delivery",
						"--language",
						"ts",
						"--file",
						"cli/commands/catalog.ts",
					],
					root,
					output.io,
				),
			).toBe(0);
			expect(output.stdout.join("\n")).toContain("resolved hooks: 1");
			expect(output.stdout.join("\n")).toContain("HOOK-ALPHA");
			expect(output.stdout.join("\n")).not.toContain("HOOK-BETA");
			const jsonOutput = capture();
			expect(
				await runHookCommand(
					[
						"resolve",
						"--json",
						"--event",
						"context.bundle",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--work-type",
						"delivery",
						"--language",
						"ts",
						"--file",
						"cli/commands/catalog.ts",
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

	test("normalizes hook entries and enforces configured message limits", () => {
		const root = mkRoot({ maxMessageChars: 8, maxMessageCharsTotal: 20 });
		try {
			const hooks = listHooks(root);
			expect(hooks).toHaveLength(2);
			expect(hooks[0]?.path).toBe(".afol/adm/hooks/alpha.md");
			expect(hooks[0]?.contributions.tools).toEqual([
				"afol hook resolve --event context.bundle",
			]);
			expect(getHookResolverConfig(root)).toEqual({
				maxMessageChars: 8,
				maxTotalMessageChars: 20,
			});

			const resolved = resolveHooks(root, {
				event: "context.bundle",
				roles: ["designer"],
				surfaces: ["alpha"],
				workType: "delivery",
				languages: ["ts"],
				filePath: "cli/commands/catalog.ts",
			});
			expect(resolved).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects invalid resolve file paths", () => {
		const root = mkRoot();
		try {
			expect(() =>
				resolveHooks(root, {
					event: "context.bundle",
					roles: ["designer"],
					surfaces: ["alpha"],
					workType: "delivery",
					filePath: "../secret.txt",
				}),
			).toThrow("Invalid hook resolve file path");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
