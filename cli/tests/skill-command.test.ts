import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillCommand } from "../commands/catalog";

function mkRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "skill-command-"));
	const skillsRoot = join(root, ".afol", "skills");
	mkdirSync(join(skillsRoot, "bun-development"), { recursive: true });
	mkdirSync(join(skillsRoot, "typescript-expert"), { recursive: true });
	writeFileSync(
		join(skillsRoot, "bun-development", "SKILL.md"),
		"---\nname: bun-development\ndescription: Fast Bun TypeScript workflows.\n---\n\n# Bun\n",
		"utf8",
	);
	writeFileSync(
		join(skillsRoot, "typescript-expert", "SKILL.md"),
		"---\nname: typescript-expert\ndescription: TypeScript migration guidance.\n---\n\n# TS\n",
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

describe("skill command", () => {
	test("lists, shows, and searches local skills", async () => {
		const root = mkRoot();
		try {
			const list = capture();
			expect(await runSkillCommand(["list"], root, list.io)).toBe(0);
			expect(list.stdout.join("\n")).toContain("skills: 2");
			expect(list.stdout.join("\n")).toContain("bun-development");

			const show = capture();
			expect(
				await runSkillCommand(["show", "typescript-expert"], root, show.io),
			).toBe(0);
			expect(show.stdout.join("\n")).toContain("skill: typescript-expert");
			expect(show.stdout.join("\n")).toContain(
				"TypeScript migration guidance.",
			);

			const search = capture();
			expect(await runSkillCommand(["search", "bun"], root, search.io)).toBe(0);
			expect(search.stdout.join("\n")).toContain("skill matches: 1");
			expect(search.stdout.join("\n")).toContain("bun-development");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back to directory metadata when frontmatter YAML is invalid", async () => {
		const root = mkRoot();
		try {
			writeFileSync(
				join(root, ".afol", "skills", "typescript-expert", "SKILL.md"),
				"---\nname: [broken\ndescription: nope\n---\n\n# TS\n",
				"utf8",
			);

			const list = capture();
			expect(await runSkillCommand(["list"], root, list.io)).toBe(0);
			expect(list.stderr).toEqual([]);
			expect(list.stdout.join("\n")).toContain(
				"typescript-expert .afol/skills/typescript-expert/SKILL.md",
			);

			const show = capture();
			expect(
				await runSkillCommand(["show", "typescript-expert"], root, show.io),
			).toBe(0);
			expect(show.stdout.join("\n")).toContain("skill: typescript-expert");
			expect(show.stdout.join("\n")).toContain("description: none");

			const search = capture();
			expect(
				await runSkillCommand(["search", "typescript-expert"], root, search.io),
			).toBe(0);
			expect(search.stdout.join("\n")).toContain("skill matches: 1");
			expect(search.stdout.join("\n")).toContain("typescript-expert");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
