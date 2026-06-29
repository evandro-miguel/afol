import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillCommand } from "../commands/catalog";

function mkRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "skill-command-"));
	const skillsRoot = join(root, ".agents", "skills");
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
			expect(list.stdout.join("\n")).toContain("skill list --verbose");
			expect(list.stdout.join("\n")).not.toContain(
				"Fast Bun TypeScript workflows.",
			);

			const verboseList = capture();
			expect(
				await runSkillCommand(["list", "--verbose"], root, verboseList.io),
			).toBe(0);
			expect(verboseList.stdout.join("\n")).toContain(
				"Fast Bun TypeScript workflows.",
			);

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

	test("discovers skills nested under grouping directories", async () => {
		const root = mkRoot();
		try {
			const skillDir = join(
				root,
				".agents",
				"skills",
				"gitnexus",
				"gitnexus-cli",
			);
			mkdirSync(skillDir, { recursive: true });
			writeFileSync(
				join(skillDir, "SKILL.md"),
				"---\nname: gitnexus-cli\ndescription: GitNexus CLI workflows.\n---\n\n# GitNexus\n",
				"utf8",
			);

			const list = capture();
			expect(await runSkillCommand(["list"], root, list.io)).toBe(0);
			expect(list.stdout.join("\n")).toContain("skills: 3");
			expect(list.stdout.join("\n")).toContain(
				"gitnexus-cli .agents/skills/gitnexus/gitnexus-cli/SKILL.md",
			);

			const show = capture();
			expect(
				await runSkillCommand(["show", "gitnexus-cli"], root, show.io),
			).toBe(0);
			expect(show.stdout.join("\n")).toContain("GitNexus CLI workflows.");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ignores non-directory skill entries without aborting discovery", async () => {
		const root = mkRoot();
		try {
			symlinkSync(
				join(root, ".agents", "skills", "missing-skill"),
				join(root, ".agents", "skills", "broken-skill-link"),
				"dir",
			);

			const list = capture();
			expect(await runSkillCommand(["list"], root, list.io)).toBe(0);
			expect(list.stderr).toEqual([]);
			expect(list.stdout.join("\n")).toContain("skills: 2");
			expect(list.stdout.join("\n")).toContain("bun-development");
			expect(list.stdout.join("\n")).toContain("typescript-expert");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects ambiguous skill names", async () => {
		const root = mkRoot();
		try {
			const skillDir = join(root, ".agents", "skills", "group", "bun-copy");
			mkdirSync(skillDir, { recursive: true });
			writeFileSync(
				join(skillDir, "SKILL.md"),
				"---\nname: bun-development\ndescription: Duplicate Bun skill.\n---\n\n# Bun copy\n",
				"utf8",
			);

			const show = capture();
			expect(
				await runSkillCommand(["show", "bun-development"], root, show.io),
			).toBe(2);
			expect(show.stderr.join("\n")).toContain(
				"Ambiguous skill name: bun-development.",
			);
			expect(show.stderr.join("\n")).toContain(
				".agents/skills/bun-development/SKILL.md",
			);
			expect(show.stderr.join("\n")).toContain(
				".agents/skills/group/bun-copy/SKILL.md",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back to directory metadata when frontmatter YAML is invalid", async () => {
		const root = mkRoot();
		try {
			writeFileSync(
				join(root, ".agents", "skills", "typescript-expert", "SKILL.md"),
				"---\nname: [broken\ndescription: nope\n---\n\n# TS\n",
				"utf8",
			);

			const list = capture();
			expect(await runSkillCommand(["list"], root, list.io)).toBe(0);
			expect(list.stderr).toEqual([]);
			expect(list.stdout.join("\n")).toContain(
				"typescript-expert .agents/skills/typescript-expert/SKILL.md",
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
