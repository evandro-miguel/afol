import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillCommand } from "../commands/catalog";
import { symlinkTestSupport } from "./symlink-test-support";

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
	test("curated AFOL skills preserve runtime and retirement boundaries", () => {
		const integration = readFileSync(
			join(
				process.cwd(),
				".agents",
				"skills",
				"afol-integration-test",
				"SKILL.md",
			),
			"utf8",
		);
		const benchmarking = readFileSync(
			join(
				process.cwd(),
				".agents",
				"skills",
				"agentic-benchmarking",
				"SKILL.md",
			),
			"utf8",
		);

		expect(integration).not.toContain("installed globally and pointing");
		expect(integration).toContain("Never replace, repoint");
		expect(integration).toContain(
			"AFOL never selects, calls, schedules, retries, or supervises models",
		);
		expect(integration).toContain("receipt ingest --file <receipt.json>");
		expect(benchmarking).toContain("external harness");
		expect(benchmarking).toContain(
			"afol validate bench --pack <pack-id> --json",
		);
		expect(benchmarking).toContain("above 10,000 fails");
		expect(
			existsSync(
				join(
					process.cwd(),
					".agents",
					"skills",
					"agentic-scaffold-mcp",
					"SKILL.md",
				),
			),
		).toBe(false);
	});

	test("AFOL skill evals expose provisional evidence and a frozen case matrix", () => {
		const skillNames = [
			"afol-integration-test",
			"agentic-benchmarking",
			"afol-maintenance",
			"afol-memory",
			"afol-library",
			"afol-rules",
		];
		for (const skillName of skillNames) {
			const evalRoot = join(
				process.cwd(),
				".agents",
				"skills",
				skillName,
				"evals",
			);
			const payload = JSON.parse(
				readFileSync(join(evalRoot, "evals.json"), "utf8"),
			) as {
				skill_name: string;
				evaluation_contract: {
					status: string;
					threshold: number;
					agent_visible_files: string[];
					heldout_ids: number[];
				};
				evals: Array<{
					id: number;
					case_type: string;
					phase: string;
					lanes: string[];
					prompt: string;
					expectations: string[];
					should_trigger: boolean;
				}>;
			};

			expect(payload.skill_name).toBe(skillName);
			expect(payload.evaluation_contract).toMatchObject({
				status: "inconclusive",
				threshold: 0.9,
				agent_visible_files: ["SKILL.md"],
				heldout_ids: [4],
			});
			expect(
				payload.evals.map(({ id, case_type, phase }) => ({
					id,
					case_type,
					phase,
				})),
			).toEqual([
				{ id: 1, case_type: "positive", phase: "regression" },
				{ id: 2, case_type: "pressure", phase: "regression" },
				{ id: 3, case_type: "negative", phase: "regression" },
				{ id: 4, case_type: "collision", phase: "heldout" },
			]);
			for (const evalCase of payload.evals) {
				expect(evalCase.prompt.length).toBeGreaterThan(0);
				expect(evalCase.expectations.length).toBeGreaterThan(0);
				expect(evalCase.lanes.length).toBeGreaterThan(0);
				expect(typeof evalCase.should_trigger).toBe("boolean");
			}

			const ledger = readFileSync(
				join(evalRoot, "improvement-log.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(ledger.at(-1)).toMatchObject({
				skill: skillName,
				outcome: "inconclusive",
			});
			expect(String(ledger.at(-1)?.evidence)).toContain(
				"Supersedes classification",
			);
		}
	});

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
			const jsonList = capture();
			expect(await runSkillCommand(["list", "--json"], root, jsonList.io)).toBe(
				0,
			);
			const jsonListPayload = JSON.parse(jsonList.stdout[0] ?? "{}") as {
				ok: boolean;
				data: { count: number };
			};
			expect(jsonListPayload.ok).toBe(true);
			expect(jsonListPayload.data.count).toBe(2);

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
			const jsonShow = capture();
			expect(
				await runSkillCommand(
					["show", "typescript-expert", "--json"],
					root,
					jsonShow.io,
				),
			).toBe(0);
			const jsonShowPayload = JSON.parse(jsonShow.stdout[0] ?? "{}") as {
				ok: boolean;
				data: { name: string };
			};
			expect(jsonShowPayload.ok).toBe(true);
			expect(jsonShowPayload.data.name).toBe("typescript-expert");

			const search = capture();
			expect(await runSkillCommand(["search", "bun"], root, search.io)).toBe(0);
			expect(search.stdout.join("\n")).toContain("skill matches: 1");
			expect(search.stdout.join("\n")).toContain("bun-development");
			const jsonSearch = capture();
			expect(
				await runSkillCommand(["search", "bun", "--json"], root, jsonSearch.io),
			).toBe(0);
			const jsonSearchPayload = JSON.parse(jsonSearch.stdout[0] ?? "{}") as {
				ok: boolean;
				data: { count: number; query: string };
			};
			expect(jsonSearchPayload.ok).toBe(true);
			expect(jsonSearchPayload.data.query).toBe("bun");
			expect(jsonSearchPayload.data.count).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("discovers skills nested under grouping directories", async () => {
		const root = mkRoot();
		try {
			const skillDir = join(root, ".agents", "skills", "group", "nested-skill");
			mkdirSync(skillDir, { recursive: true });
			writeFileSync(
				join(skillDir, "SKILL.md"),
				"---\nname: nested-skill\ndescription: Nested skill discovery.\n---\n\n# Nested skill\n",
				"utf8",
			);

			const list = capture();
			expect(await runSkillCommand(["list"], root, list.io)).toBe(0);
			expect(list.stdout.join("\n")).toContain("skills: 3");
			expect(list.stdout.join("\n")).toContain(
				"nested-skill .agents/skills/group/nested-skill/SKILL.md",
			);

			const show = capture();
			expect(
				await runSkillCommand(["show", "nested-skill"], root, show.io),
			).toBe(0);
			expect(show.stdout.join("\n")).toContain("Nested skill discovery.");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"ignores non-directory skill entries without aborting discovery",
		async () => {
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
		},
	);

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
