import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLocalStateCommand } from "../commands/local-state";
import type {
	FilesIndexSnapshot,
	RulesIndexSnapshot,
	SkillIndexEntry,
	SkillsIndexSnapshot,
	SpecIndexEntry,
	SpecsIndexSnapshot,
} from "../services/local-state/project-indexes";
import {
	rebuildFilesIndex,
	rebuildProjectIndexes,
	rebuildRulesIndex,
	rebuildSkillsIndex,
	rebuildSpecsIndex,
	validateFilesIndex,
	validateRulesIndex,
	validateSkillsIndex,
	validateSpecsIndex,
} from "../services/local-state/project-indexes";
import { validateWorkBenchIndex } from "../services/local-state/workbench-index";

function buildFixture() {
	const root = mkdtempSync(join(tmpdir(), "proj-indexes-"));

	const rulesDir = join(root, ".agents", "rules");
	const skillsDir = join(root, ".agents", "skills");
	const specsDir = join(root, "docs", "arc", "SPECS");

	mkdirSync(rulesDir, { recursive: true });
	mkdirSync(skillsDir, { recursive: true });
	mkdirSync(specsDir, { recursive: true });

	writeFileSync(join(rulesDir, "RULE-200.md"), "# Rule 200\n", "utf8");
	writeFileSync(join(rulesDir, "RULE-010.md"), "# Rule 010\n", "utf8");

	const skillA = join(skillsDir, "skill-a");
	const skillB = join(skillsDir, "skill-b");
	mkdirSync(skillA, { recursive: true });
	mkdirSync(skillB, { recursive: true });
	writeFileSync(
		join(skillA, "SKILL.md"),
		[
			"---",
			"name: alpha skill",
			"description: alpha",
			"---",
			"",
			"payload",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(skillB, "SKILL.md"),
		["---", "name: beta skill", "description: beta", "---", "", "payload"].join(
			"\n",
		),
		"utf8",
	);

	writeFileSync(
		join(specsDir, "001-spec.md"),
		[
			"---",
			"id: S-001",
			"title: Local rules",
			"theme: local-state",
			"status: draft",
			"---",
			"spec body",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(specsDir, "002-spec.md"),
		["---", "id: S-002", "title: Second", "---", "spec body"].join("\n"),
		"utf8",
	);

	writeFileSync(join(root, "a.txt"), "alpha", "utf8");
	writeFileSync(join(root, "b.txt"), "bravo", "utf8");

	return root;
}

describe("local-state project indexer", () => {
	test("rebuildProjectIndexes builds ordered snapshots and omits .agents/data/index", () => {
		const root = buildFixture();
		try {
			const snapshot = rebuildProjectIndexes(root);
			expect(snapshot.rules.kind).toBe("rules_index_v1");
			expect(snapshot.rules.version).toBe(1);
			expect(snapshot.rules.rules).toEqual([
				{
					id: "RULE-010",
					name: "rule-010",
					path: ".agents/rules/RULE-010.md",
					surfaces: [],
					work_types: [],
					priority: 50,
					touched_at: expect.any(String),
				},
				{
					id: "RULE-200",
					name: "rule-200",
					path: ".agents/rules/RULE-200.md",
					surfaces: [],
					work_types: [],
					priority: 50,
					touched_at: expect.any(String),
				},
			]);
			expect(snapshot.skills.kind).toBe("skills_index_v1");
			expect(snapshot.skills.version).toBe(1);
			expect(snapshot.skills.skills.map((skill) => skill.name)).toEqual([
				"alpha skill",
				"beta skill",
			]);
			expect(snapshot.specs.specs.map((spec) => spec.path)).toEqual([
				"docs/arc/SPECS/001-spec.md",
				"docs/arc/SPECS/002-spec.md",
			]);
			expect(snapshot.specs.kind).toBe("specs_index_v1");
			expect(snapshot.specs.version).toBe(1);

			const rulesPath = join(root, ".agents", "data", "index", "rules.json");
			const parsedRulesSnapshot = JSON.parse(
				readFileSync(rulesPath, "utf8"),
			) as { rules: { id: string }[] };
			expect(parsedRulesSnapshot.rules.map((rule) => rule.id)).toEqual([
				"RULE-010",
				"RULE-200",
			]);

			const filesPath = join(root, ".agents", "data", "index", "files.json");
			const filesSnapshot = JSON.parse(
				readFileSync(filesPath, "utf8"),
			) as FilesIndexSnapshot;
			const sorted = filesSnapshot.files
				.map((file) => file.path)
				.sort((a, b) => a.localeCompare(b));
			expect(filesSnapshot.files.map((file) => file.path)).toEqual(sorted);

			const skillsPath = join(root, ".agents", "data", "index", "skills.json");
			const specsPath = join(root, ".agents", "data", "index", "specs.json");
			const skillsSnapshot = JSON.parse(
				readFileSync(skillsPath, "utf8"),
			) as SkillsIndexSnapshot;
			const specsSnapshot = JSON.parse(
				readFileSync(specsPath, "utf8"),
			) as SpecsIndexSnapshot;

			const orderedSkills = skillsSnapshot.skills
				.map((skill) => skill.name)
				.sort((a, b) => a.localeCompare(b));
			expect(skillsSnapshot.skills.map((skill) => skill.name)).toEqual(
				orderedSkills,
			);
			expect(skillsSnapshot.skills.map((skill) => skill.path)).toEqual([
				".agents/skills/skill-a/SKILL.md",
				".agents/skills/skill-b/SKILL.md",
			]);
			expect(specsSnapshot.specs.map((spec) => spec.path)).toEqual([
				"docs/arc/SPECS/001-spec.md",
				"docs/arc/SPECS/002-spec.md",
			]);

			const blocked = join(root, ".agents", "data", "index", "ignore.txt");
			mkdirSync(join(root, ".agents", "data", "index"), { recursive: true });
			writeFileSync(blocked, "ignore", "utf8");
			mkdirSync(join(root, ".agents", "tmp"), { recursive: true });
			writeFileSync(
				join(root, ".agents", "tmp", "scratch.txt"),
				"ignore",
				"utf8",
			);
			const blockedSnapshot = rebuildFilesIndex(root);
			expect(
				blockedSnapshot.files.some(
					(entry) => entry.path === ".agents/data/index/ignore.txt",
				),
			).toBe(false);
			expect(
				blockedSnapshot.files.some(
					(entry) => entry.path === ".agents/tmp/scratch.txt",
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildSpecsIndex extracts deterministic fields", () => {
		const root = buildFixture();
		try {
			const snapshot: SpecsIndexSnapshot = rebuildSpecsIndex(root);
			expect(snapshot.specs).toEqual([
				{
					id: "S-001",
					path: "docs/arc/SPECS/001-spec.md",
					title: "Local rules",
					touched_at: expect.any(String),
					status: "draft",
					theme: "local-state",
				},
				{
					id: "S-002",
					path: "docs/arc/SPECS/002-spec.md",
					title: "Second",
					touched_at: expect.any(String),
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rules index freshness is detected when source changes", () => {
		const root = buildFixture();
		try {
			const rebuilt = rebuildRulesIndex(root) as RulesIndexSnapshot;
			expect(validateRulesIndex(root).ok).toBe(true);
			expect(rebuilt.rules[0]?.path).toContain("RULE-");

			const rulePath = join(root, ".agents", "rules", "RULE-010.md");
			const future = new Date(Date.now() + 60_000);
			utimesSync(rulePath, future, future);

			const stale = validateRulesIndex(root);
			expect(stale.ok).toBe(false);
			expect(stale.message).toContain("stale");

			const now = new Date(Date.now());
			utimesSync(rulePath, now, now);
			rebuildRulesIndex(root);
			expect(validateRulesIndex(root).ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildRulesIndex tolerates invalid rules index JSON", () => {
		const root = buildFixture();
		try {
			writeFileSync(
				join(root, ".agents", "rules", "index.json"),
				"{invalid-json",
				"utf8",
			);

			const snapshot = rebuildRulesIndex(root) as RulesIndexSnapshot;
			expect(snapshot.rules.map((rule) => rule.id)).toEqual([
				"RULE-010",
				"RULE-200",
			]);
			expect(validateRulesIndex(root).ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("files index validates as valid", () => {
		const root = buildFixture();
		try {
			const snapshot = rebuildFilesIndex(root);
			expect(snapshot.files.length).toBeGreaterThan(1);
			expect(validateFilesIndex(root).ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("skills index has deterministic names and freshness check", () => {
		const root = buildFixture();
		try {
			const snapshot = rebuildSkillsIndex(root) as SkillsIndexSnapshot;
			expect(snapshot.skills[0]).toMatchObject({
				name: "alpha skill",
				path: ".agents/skills/skill-a/SKILL.md",
				description: "alpha",
				touched_at: expect.any(String),
			} satisfies Partial<SkillIndexEntry>);

			const skillPath = join(root, ".agents", "skills", "skill-a", "SKILL.md");
			const future = new Date(Date.now() + 60_000);
			utimesSync(skillPath, future, future);

			const stale = validateSkillsIndex(root);
			expect(stale.ok).toBe(false);
			expect(stale.message).toContain("stale");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildSkillsIndex falls back to directory metadata on invalid frontmatter", () => {
		const root = buildFixture();
		try {
			writeFileSync(
				join(root, ".agents", "skills", "skill-a", "SKILL.md"),
				"---\nname: [broken\ndescription: no\n---\n\npayload\n",
				"utf8",
			);

			const snapshot = rebuildSkillsIndex(root) as SkillsIndexSnapshot;
			const fallbackSkill = snapshot.skills.find(
				(skill) => skill.path === ".agents/skills/skill-a/SKILL.md",
			);
			expect(fallbackSkill).toMatchObject({
				name: "skill-a",
				path: ".agents/skills/skill-a/SKILL.md",
				description: "",
			} satisfies Partial<SkillIndexEntry>);
			expect(validateSkillsIndex(root).ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("specs and files snapshots validate with fresh state", () => {
		const root = buildFixture();
		try {
			const specsSnapshot = rebuildSpecsIndex(root) as SpecsIndexSnapshot;
			expect(specsSnapshot.specs).toEqual<SpecIndexEntry[]>([
				{
					id: "S-001",
					path: "docs/arc/SPECS/001-spec.md",
					title: "Local rules",
					touched_at: expect.any(String),
					status: "draft",
					theme: "local-state",
				},
				{
					id: "S-002",
					path: "docs/arc/SPECS/002-spec.md",
					title: "Second",
					touched_at: expect.any(String),
				},
			]);
			expect(validateSpecsIndex(root).ok).toBe(true);

			const filesSnapshot = rebuildFilesIndex(root);
			expect(filesSnapshot.files).toHaveLength(
				new Set(filesSnapshot.files.map((file) => file.path)).size,
			);
			expect(validateFilesIndex(root).ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("local-state command rebuilds indexes and reports freshness", async () => {
		const root = buildFixture();
		try {
			const stdout: string[] = [];
			const stderr: string[] = [];
			const io = {
				stdout: (message: string) => stdout.push(message),
				stderr: (message: string) => stderr.push(message),
			};

			expect(await runLocalStateCommand(["rebuild", "--json"], root, io)).toBe(
				0,
			);
			const rebuildPayload = JSON.parse(stdout.at(-1) ?? "{}") as {
				ok: boolean;
				snapshot?: { workbench?: { kind?: string } };
			};
			expect(rebuildPayload.ok).toBe(true);
			expect(rebuildPayload.snapshot?.workbench?.kind).toBe(
				"workbench_index_v1",
			);
			expect(validateWorkBenchIndex(root).ok).toBe(true);

			expect(await runLocalStateCommand(["freshness"], root, io)).toBe(0);
			expect(stdout.at(-1)).toContain("local-state freshness: ok");
			expect(stdout.at(-1)).toContain("ok workbench");
			expect(stderr).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
