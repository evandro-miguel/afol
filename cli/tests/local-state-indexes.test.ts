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
import { dirname, join } from "node:path";
import { runLocalStateCommand } from "../commands/local-state";
import { agentOperationContext } from "../core/operation-context";
import {
	buildCoordinationRadar,
	type CoordinationWarningId,
	loadCoordinationRadar,
} from "../services/local-state/coordination-radar";
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
import {
	rebuildWorkBenchIndex,
	validateWorkBenchIndex,
} from "../services/local-state/workbench-index";
import {
	appendMutationRecord,
	type MutationRecord,
} from "../services/mutations/journal";

function buildFixture() {
	const root = mkdtempSync(join(tmpdir(), "proj-indexes-"));

	const rulesDir = join(root, ".afol", "adm", "rules");
	const skillsDir = join(root, ".agents", "skills");
	const specsDir = join(root, ".afol", "adm", "specs");

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
	test("missing index snapshots are non-green and point to rebuild", () => {
		const root = buildFixture();
		try {
			for (const result of [
				validateWorkBenchIndex(root),
				validateRulesIndex(root),
				validateSkillsIndex(root),
				validateSpecsIndex(root),
				validateFilesIndex(root),
			]) {
				expect(result.ok).toBe(false);
				expect(result.message).toContain("run afol local-state rebuild");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildProjectIndexes builds ordered snapshots and omits .afol/data/index", () => {
		const root = buildFixture();
		try {
			const snapshot = rebuildProjectIndexes(root);
			expect(snapshot.rules.kind).toBe("rules_index_v1");
			expect(snapshot.rules.version).toBe(1);
			expect(snapshot.rules.rules).toEqual([
				{
					id: "RULE-010",
					name: "rule-010",
					path: ".afol/adm/rules/RULE-010.md",
					surfaces: [],
					work_types: [],
					priority: 50,
					touched_at: expect.any(String),
				},
				{
					id: "RULE-200",
					name: "rule-200",
					path: ".afol/adm/rules/RULE-200.md",
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
				".afol/adm/specs/001-spec.md",
				".afol/adm/specs/002-spec.md",
			]);
			expect(snapshot.specs.kind).toBe("specs_index_v1");
			expect(snapshot.specs.version).toBe(1);

			const rulesPath = join(root, ".afol", "data", "index", "rules.json");
			const parsedRulesSnapshot = JSON.parse(
				readFileSync(rulesPath, "utf8"),
			) as { rules: { id: string }[] };
			expect(parsedRulesSnapshot.rules.map((rule) => rule.id)).toEqual([
				"RULE-010",
				"RULE-200",
			]);

			const filesPath = join(root, ".afol", "data", "index", "files.json");
			const filesSnapshot = JSON.parse(
				readFileSync(filesPath, "utf8"),
			) as FilesIndexSnapshot;
			const sorted = filesSnapshot.files
				.map((file) => file.path)
				.sort((a, b) => a.localeCompare(b));
			expect(filesSnapshot.files.map((file) => file.path)).toEqual(sorted);

			const skillsPath = join(root, ".afol", "data", "index", "skills.json");
			const specsPath = join(root, ".afol", "data", "index", "specs.json");
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
				".afol/adm/specs/001-spec.md",
				".afol/adm/specs/002-spec.md",
			]);

			const blocked = join(root, ".afol", "data", "index", "ignore.txt");
			mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
			writeFileSync(blocked, "ignore", "utf8");
			mkdirSync(join(root, ".afol", "tmp"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "tmp", "scratch.txt"),
				"ignore",
				"utf8",
			);
			const blockedSnapshot = rebuildFilesIndex(root);
			expect(
				blockedSnapshot.files.some(
					(entry) => entry.path === ".afol/data/index/ignore.txt",
				),
			).toBe(false);
			expect(
				blockedSnapshot.files.some(
					(entry) => entry.path === ".afol/tmp/scratch.txt",
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
					path: ".afol/adm/specs/001-spec.md",
					title: "Local rules",
					touched_at: expect.any(String),
					status: "draft",
					theme: "local-state",
				},
				{
					id: "S-002",
					path: ".afol/adm/specs/002-spec.md",
					title: "Second",
					touched_at: expect.any(String),
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildWorkBenchIndex parses explicit planned and touched file claims", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-claims-"));
		try {
			const multiSessionDir = join(root, ".afol", "wb", "260618_multi");
			const singleSessionDir = join(root, ".afol", "wb", "260618_single");
			mkdirSync(multiSessionDir, { recursive: true });
			mkdirSync(singleSessionDir, { recursive: true });

			writeFileSync(
				join(multiSessionDir, "260618_multi_task_01.md"),
				[
					"# Tasks: multi",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | in_progress | alice | data model |",
					"| T-02 | done | bob | closed |",
					"",
					"## Coordination Claims",
					"",
					"### T-01 Data Model",
					"",
					"- Files planned:",
					"  - `cli/services/local-state/workbench-index.ts`",
					"  - `cli/services/local-state/*coordination*.ts`",
					"- Files touched:",
					"  - `cli/tests/local-state-indexes.test.ts`",
					"",
					"### T-02 Closed",
					"",
					"- Files planned:",
					"  - N/A",
					"",
					"## Implementation Checkpoint",
					"",
					"- Files touched:",
					"  - `cli/commands/session.ts`",
				].join("\n"),
				"utf8",
			);

			writeFileSync(
				join(singleSessionDir, "260618_single_task_01.md"),
				[
					"# Tasks: single",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | implemented_untested | carol | verify touched parsing |",
					"",
					"## Implementation Checkpoint",
					"",
					"- Files touched:",
					"  - `cli/services/mutations/journal.ts`",
				].join("\n"),
				"utf8",
			);

			const snapshot = rebuildWorkBenchIndex(root);
			const multiTask = snapshot.tasks.find(
				(task) => task.session === "260618_multi" && task.task_id === "T-01",
			);
			const closedTask = snapshot.tasks.find(
				(task) => task.session === "260618_multi" && task.task_id === "T-02",
			);
			const singleTask = snapshot.tasks.find(
				(task) => task.session === "260618_single" && task.task_id === "T-01",
			);

			expect(multiTask?.planned_files).toEqual([
				{
					path: "cli/services/local-state/*coordination*.ts",
					kind: "glob",
					source: "planned",
					line: 16,
				},
				{
					path: "cli/services/local-state/workbench-index.ts",
					kind: "exact",
					source: "planned",
					line: 15,
				},
			]);
			expect(multiTask?.touched_files).toEqual([
				{
					path: "cli/tests/local-state-indexes.test.ts",
					kind: "exact",
					source: "touched",
					line: 18,
				},
			]);
			expect(closedTask?.planned_files).toEqual([]);
			expect(closedTask?.touched_files).toEqual([]);
			expect(singleTask?.touched_files).toEqual([
				{
					path: "cli/services/mutations/journal.ts",
					kind: "exact",
					source: "touched",
					line: 12,
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildWorkBenchIndex(sessionScope) updates only scoped session", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-scope-update-"));
		try {
			const sessionA = join(root, ".afol", "wb", "260618_alpha");
			const sessionB = join(root, ".afol", "wb", "260618_beta");
			mkdirSync(sessionA, { recursive: true });
			mkdirSync(sessionB, { recursive: true });

			writeFileSync(
				join(sessionA, "260618_alpha_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | alice | baseline |",
				].join("\n"),
				"utf8",
			);

			writeFileSync(
				join(sessionB, "260618_beta_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | in_progress | bob | before |",
				].join("\n"),
				"utf8",
			);

			const first = rebuildWorkBenchIndex(root);
			expect(first.sessions.map((session) => session.session)).toEqual([
				"260618_alpha",
				"260618_beta",
			]);

			writeFileSync(
				join(sessionB, "260618_beta_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | bob | after |",
					"| T-02 | in_progress | bob | added |",
				].join("\n"),
				"utf8",
			);

			const second = rebuildWorkBenchIndex(root, "260618_beta");
			const alphaTasks = second.tasks.filter(
				(task) => task.session === "260618_alpha",
			);
			const betaTasks = second.tasks.filter(
				(task) => task.session === "260618_beta",
			);

			expect(second.sessions).toHaveLength(2);
			expect(
				second.sessions.find((session) => session.session === "260618_alpha")
					?.task_count,
			).toBe(1);
			expect(
				second.sessions.find((session) => session.session === "260618_beta")
					?.task_count,
			).toBe(2);
			expect(alphaTasks).toHaveLength(1);
			expect(betaTasks.map((task) => task.task_id)).toEqual(["T-01", "T-02"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildWorkBenchIndex(sessionScope) drops removed session from snapshot", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-scope-removed-"));
		try {
			const sessionA = join(root, ".afol", "wb", "260618_alpha");
			const sessionB = join(root, ".afol", "wb", "260618_beta");
			mkdirSync(sessionA, { recursive: true });
			mkdirSync(sessionB, { recursive: true });

			writeFileSync(
				join(sessionA, "260618_alpha_task_01.md"),
				"| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n| T-01 | done | alice | done |",
				"utf8",
			);
			writeFileSync(
				join(sessionB, "260618_beta_task_01.md"),
				"| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n| T-01 | in_progress | bob | working |",
				"utf8",
			);

			rebuildWorkBenchIndex(root);
			rmSync(sessionB, { recursive: true, force: true });
			const snapshot = rebuildWorkBenchIndex(root, "260618_beta");

			expect(snapshot.sessions).toHaveLength(1);
			expect(snapshot.sessions[0]?.session).toBe("260618_alpha");
			expect(
				snapshot.tasks.some((task) => task.session === "260618_beta"),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("loadCoordinationRadar derives open tasks, mutation touches, and warning ids", () => {
		const root = mkdtempSync(join(tmpdir(), "coordination-radar-"));
		try {
			const sessionA = join(root, ".afol", "wb", "260618_alpha");
			const sessionB = join(root, ".afol", "wb", "260618_beta");
			const sessionC = join(root, ".afol", "wb", "260618_gamma");
			const sessionD = join(root, ".afol", "wb", "260618_delta");
			const archived = join(root, ".afol", "wb", "_archive", "260618_archived");
			for (const dir of [sessionA, sessionB, sessionC, sessionD, archived]) {
				mkdirSync(dir, { recursive: true });
			}

			writeFileSync(
				join(sessionA, "260618_alpha_task_01.md"),
				[
					"# Tasks: alpha",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | in_progress | alice | plan coordination service |",
					"",
					"## Coordination Claims",
					"",
					"### T-01 Data Model",
					"",
					"- Files planned:",
					"  - `cli/services/local-state/*coordination*.ts`",
				].join("\n"),
				"utf8",
			);

			writeFileSync(
				join(sessionB, "260618_beta_task_01.md"),
				[
					"# Tasks: beta",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | implemented_untested | bob | touched shared files |",
					"",
					"## Coordination Claims",
					"",
					"### T-01 Builder",
					"",
					"- Files planned:",
					"  - `cli/services/local-state/coordination-radar.ts`",
					"- Files touched:",
					"  - `cli/services/local-state/workbench-index.ts`",
				].join("\n"),
				"utf8",
			);

			writeFileSync(
				join(sessionC, "260618_gamma_task_01.md"),
				[
					"# Tasks: gamma",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | in_progress |  | missing intent |",
				].join("\n"),
				"utf8",
			);

			writeFileSync(
				join(sessionD, "260618_delta_task_01.md"),
				[
					"# Tasks: delta",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | in_progress | carol | exact overlap |",
					"",
					"## Coordination Claims",
					"",
					"### T-01 Validator",
					"",
					"- Files planned:",
					"  - `cli/services/local-state/workbench-index.ts`",
				].join("\n"),
				"utf8",
			);

			writeFileSync(
				join(archived, "260618_archived_task_01.md"),
				[
					"# Tasks: archived",
					"",
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | in_progress | ghost | should be ignored |",
					"",
					"## Coordination Claims",
					"",
					"### T-01 Archived",
					"",
					"- Files planned:",
					"  - `cli/services/local-state/workbench-index.ts`",
				].join("\n"),
				"utf8",
			);

			const staleTime = new Date("2026-06-15T12:00:00.000Z");
			const gammaTaskPath = join(sessionC, "260618_gamma_task_01.md");
			utimesSync(gammaTaskPath, staleTime, staleTime);

			const mutation: MutationRecord = {
				id: "M-1",
				ts: "2026-06-18T16:00:00.000Z",
				kind: "patch",
				status: "applied",
				dryRun: false,
				session: "260618_beta",
				taskId: "T-01",
				reason: "shared file changed",
				sourcePath: "cli/services/local-state/coordination-radar.ts",
				afterHash: "after",
			};
			appendMutationRecord(root, mutation);

			const radar = loadCoordinationRadar(root, {
				now: new Date("2026-06-18T18:00:00.000Z"),
			});
			const warningIds = new Set(
				radar.warnings.map((warning) => warning.id),
			) as Set<CoordinationWarningId>;

			expect(radar.kind).toBe("coordination_radar_v1");
			expect(radar.source.workbench_status).toBe("missing");
			expect(radar.open_tasks).toHaveLength(4);
			expect(
				radar.open_tasks.some((task) => task.session === "260618_archived"),
			).toBe(false);
			expect(warningIds).toEqual(
				new Set<CoordinationWarningId>([
					"path_overlap_planned",
					"path_overlap_touched",
					"mutation_overlap",
					"missing_file_intent",
					"missing_owner",
					"stale_task_context",
					"stale_coordination_index",
				]),
			);

			const alphaTask = radar.open_tasks.find(
				(task) => task.session === "260618_alpha",
			);
			const betaTask = radar.open_tasks.find(
				(task) => task.session === "260618_beta",
			);
			const gammaTask = radar.open_tasks.find(
				(task) => task.session === "260618_gamma",
			);
			const deltaTask = radar.open_tasks.find(
				(task) => task.session === "260618_delta",
			);

			expect(alphaTask?.warning_ids).toContain("path_overlap_planned");
			expect(alphaTask?.warning_ids).toContain("mutation_overlap");
			expect(
				betaTask?.touched_files.some((path) => path.source === "mutation"),
			).toBe(true);
			expect(gammaTask?.warning_ids).toEqual([
				"missing_file_intent",
				"missing_owner",
				"stale_task_context",
			]);
			expect(deltaTask?.warning_ids).toContain("path_overlap_touched");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("coordination radar tolerates legacy workbench tasks without file claim arrays", () => {
		const root = mkdtempSync(join(tmpdir(), "coordination-radar-legacy-"));
		try {
			const legacySnapshot = {
				kind: "workbench_index_v1",
				version: 1,
				generated_at: "2026-06-18T18:00:00.000Z",
				source: {
					wb_dir: ".afol/wb",
					event_log: ".afol/data/events/workbench.jsonl",
				},
				sessions: [
					{
						session: "260618_legacy",
						task_count: 1,
						completed: 0,
						open: 1,
						problem: 0,
						touched_at: "2026-06-18T18:00:00.000Z",
					},
				],
				tasks: [
					{
						session: "260618_legacy",
						task_id: "T-01",
						state: "in_progress",
						owner: "legacy",
						notes: "old snapshot",
						file: ".afol/wb/260618_legacy/260618_legacy_task_01.md",
						line: 7,
						touched_at: "2026-06-18T18:00:00.000Z",
					},
				],
			};

			const injected = buildCoordinationRadar(root, {
				now: new Date("2026-06-18T19:00:00.000Z"),
				workbench: legacySnapshot as never,
				workbenchStatus: { ok: true, message: "fresh workbench index" },
			});

			expect(injected.open_tasks).toHaveLength(1);
			expect(injected.open_tasks[0]?.planned_files).toEqual([]);
			expect(injected.open_tasks[0]?.touched_files).toEqual([]);
			expect(injected.warnings.map((warning) => warning.id)).toContain(
				"missing_file_intent",
			);

			const workbenchIndexPath = join(
				root,
				".afol",
				"data",
				"index",
				"workbench.json",
			);
			mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
			writeFileSync(
				workbenchIndexPath,
				`${JSON.stringify(legacySnapshot)}\n`,
				"utf8",
			);

			const loaded = loadCoordinationRadar(root, {
				now: new Date("2026-06-18T19:00:00.000Z"),
			});
			expect(loaded.open_tasks).toHaveLength(1);
			expect(loaded.open_tasks[0]?.planned_files).toEqual([]);
			expect(loaded.open_tasks[0]?.touched_files).toEqual([]);
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

			const rulePath = join(root, ".afol", "adm", "rules", "RULE-010.md");
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
				join(root, ".afol", "adm", "rules", "index.json"),
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

	test("files index staleness: root dir mtime change does not invalidate snapshot", () => {
		const root = buildFixture();
		try {
			rebuildFilesIndex(root);
			// Simulate the scenario that caused the bug: writing index files
			// updates the root directory mtime, which would make the snapshot
			// appear stale if root itself were included in latestFilesSource.
			const future = new Date(Date.now() + 60_000);
			utimesSync(root, future, future);
			expect(validateFilesIndex(root).ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("files index excludes generated version source", () => {
		const root = buildFixture();
		try {
			writeFileSync(
				join(root, ".git"),
				"gitdir: ../.git/worktrees/example\n",
				"utf8",
			);
			const generatedDir = join(root, "cli", "generated");
			mkdirSync(generatedDir, { recursive: true });
			const templatePath = join(generatedDir, "template.ts");
			const versionPath = join(generatedDir, "version.ts");
			writeFileSync(templatePath, "template", "utf8");
			writeFileSync(versionPath, "version", "utf8");

			const snapshot = rebuildFilesIndex(root);
			expect(
				snapshot.files.some(
					(entry) => entry.path === "cli/generated/template.ts",
				),
			).toBe(true);
			expect(
				snapshot.files.some(
					(entry) => entry.path === "cli/generated/version.ts",
				),
			).toBe(false);
			expect(snapshot.files.some((entry) => entry.path === ".git")).toBe(false);

			const future = new Date(Date.now() + 60_000);
			utimesSync(versionPath, future, future);
			expect(validateFilesIndex(root).ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("files index excludes local runtime cache and scratch directories", () => {
		const root = buildFixture();
		try {
			const excludedPaths = [
				".codex/session.json",
				".coverage-trace/agent_memory_system.cover",
				".memory/graph-cache/cache.json",
				".qwen/history.json",
				".tools/uv-cache/archive",
				".venv/lib/site-packages/pkg.py",
				"tmp/repo-canibalize/snapshot.md",
				"src/__pycache__/module.pyc",
			];

			for (const relativePath of excludedPaths) {
				const fullPath = join(root, ...relativePath.split("/"));
				mkdirSync(dirname(fullPath), { recursive: true });
				writeFileSync(fullPath, "runtime", "utf8");
			}

			const snapshot = rebuildFilesIndex(root);
			const indexedPaths = snapshot.files.map((entry) => entry.path);

			for (const relativePath of excludedPaths) {
				expect(indexedPaths).not.toContain(relativePath);
			}

			const future = new Date(Date.now() + 60_000);
			utimesSync(join(root, ".tools", "uv-cache", "archive"), future, future);
			expect(validateFilesIndex(root).ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("files index excludes private and sensitive named paths", () => {
		const root = buildFixture();
		try {
			const excludedPaths = [
				"anotacoes_ozy_d_v2/20_areas/21-Evandro-Miguel/private/Chave Caixa.md",
				"anotacoes_ozy_d_v2/20_areas/21-Evandro-Miguel/private/Endereco Casa.md",
				"anotacoes_ozy_d_v2/90_archive/93-Legacy/Xurupita - Archive.md",
				"docs/Private/client.md",
				"docs/PRIVATE/upper.md",
				"docs/Chave/client.md",
				"docs/Endereco/data.md",
				"archive/Xurupita/note.md",
				"docs/credentials.prod.md",
				"src/agent_memory_system.egg-info/PKG-INFO",
			];
			const safePath = "docs/security/secret-scan-runbook.md";

			for (const relativePath of [...excludedPaths, safePath]) {
				const fullPath = join(root, ...relativePath.split("/"));
				mkdirSync(dirname(fullPath), { recursive: true });
				writeFileSync(fullPath, "content", "utf8");
			}

			const snapshot = rebuildFilesIndex(root);
			const indexedPaths = snapshot.files.map((entry) => entry.path);

			for (const relativePath of excludedPaths) {
				expect(indexedPaths).not.toContain(relativePath);
			}
			expect(indexedPaths).toContain(safePath);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("files index keeps authored files under ambiguous directory names", () => {
		const root = buildFixture();
		try {
			const authoredPath = join(root, "docs", "logs", "decision.md");
			mkdirSync(dirname(authoredPath), { recursive: true });
			writeFileSync(authoredPath, "# Decision\n", "utf8");

			const snapshot = rebuildFilesIndex(root);
			const indexedPaths = snapshot.files.map((entry) => entry.path);
			expect(indexedPaths).toContain("docs/logs/decision.md");

			const future = new Date(Date.now() + 60_000);
			utimesSync(authoredPath, future, future);
			expect(validateFilesIndex(root).ok).toBe(false);
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
					path: ".afol/adm/specs/001-spec.md",
					title: "Local rules",
					touched_at: expect.any(String),
					status: "draft",
					theme: "local-state",
				},
				{
					id: "S-002",
					path: ".afol/adm/specs/002-spec.md",
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

	test("local-state rebuild keeps JSON compact by default and exposes snapshots only with --verbose", async () => {
		const root = buildFixture();
		try {
			const bulkDir = join(root, "bulk");
			mkdirSync(bulkDir, { recursive: true });
			for (let index = 0; index < 50; index += 1) {
				writeFileSync(join(bulkDir, `file-${index}.txt`), "indexed\n");
			}
			const sessionDir = join(root, ".afol", "wb", "260616_token_budget");
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, "260616_token_budget_task_01.md"),
				[
					"# Tasks",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | codex | rebuilt |",
					"| T-02 | blocked | codex | waiting |",
					"| T-03 | moved | codex | covered elsewhere |",
					"",
				].join("\n"),
				"utf8",
			);

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
				schema: string;
				ok: boolean;
				exit_code: number;
				command: string;
				summary?: {
					workbench?: {
						sessions?: number;
						tasks?: number;
						open_tasks?: number;
						problem_tasks?: number;
					};
					rules?: { count?: number };
					skills?: { count?: number };
					specs?: { count?: number };
					files?: { count?: number };
				};
				output?: string;
				hint?: string;
				snapshot?: unknown;
				data?: {
					command?: string;
					output?: string;
					summary?: {
						workbench?: {
							sessions?: number;
							tasks?: number;
							open_tasks?: number;
							problem_tasks?: number;
						};
						rules?: { count?: number };
						skills?: { count?: number };
						specs?: { count?: number };
						files?: { count?: number };
					};
					snapshot?: unknown;
				};
			};
			expect(rebuildPayload.schema).toBe("afol.result/v1");
			expect(rebuildPayload.ok).toBe(true);
			expect(rebuildPayload.exit_code).toBe(0);
			expect(rebuildPayload.command).toBe("rebuild");
			expect(rebuildPayload.output).toBe("compact");
			expect(rebuildPayload.summary?.workbench?.sessions).toBe(1);
			expect(rebuildPayload.summary?.workbench?.tasks).toBe(3);
			expect(rebuildPayload.summary?.workbench?.open_tasks).toBe(1);
			expect(rebuildPayload.summary?.workbench?.problem_tasks).toBe(1);
			expect(rebuildPayload.summary?.rules?.count).toBe(2);
			expect(rebuildPayload.summary?.skills?.count).toBe(2);
			expect(rebuildPayload.summary?.specs?.count).toBe(2);
			expect(rebuildPayload.summary?.files?.count).toBeGreaterThan(50);
			expect(rebuildPayload.snapshot).toBeUndefined();
			expect(rebuildPayload.data?.snapshot).toBeUndefined();
			expect(rebuildPayload.hint).toContain("--verbose");
			expect(stdout.at(-1)?.length ?? 0).toBeLessThan(2000);
			expect(stdout.at(-1)).not.toContain("workbench_index_v1");
			expect(rebuildPayload.data?.command).toBe("rebuild");
			expect(rebuildPayload.data?.output).toBe("compact");
			expect(rebuildPayload.data?.summary?.workbench?.sessions).toBe(1);
			expect(rebuildPayload.data?.summary?.workbench?.tasks).toBe(3);
			expect(rebuildPayload.data?.summary?.workbench?.open_tasks).toBe(1);
			expect(rebuildPayload.data?.summary?.workbench?.problem_tasks).toBe(1);
			expect(rebuildPayload.data?.summary?.rules?.count).toBe(2);
			expect(rebuildPayload.data?.summary?.skills?.count).toBe(2);
			expect(rebuildPayload.data?.summary?.specs?.count).toBe(2);
			expect(rebuildPayload.data?.summary?.files?.count).toBeGreaterThan(50);
			expect(validateWorkBenchIndex(root).ok).toBe(true);

			expect(
				await runLocalStateCommand(
					["rebuild", "--json", "--verbose"],
					root,
					io,
				),
			).toBe(0);
			const verbosePayload = JSON.parse(stdout.at(-1) ?? "{}") as {
				output?: string;
				snapshot?: {
					workbench?: {
						kind?: string;
						sessions?: unknown[];
						tasks?: unknown[];
					};
					rules?: { rules?: unknown[] };
					skills?: { skills?: unknown[] };
					specs?: { specs?: unknown[] };
					files?: { files?: unknown[] };
				};
				data?: {
					snapshot?: {
						workbench?: {
							kind?: string;
							sessions?: unknown[];
							tasks?: unknown[];
						};
						rules?: { rules?: unknown[] };
						skills?: { skills?: unknown[] };
						specs?: { specs?: unknown[] };
						files?: { files?: unknown[] };
					};
				};
			};
			expect(verbosePayload.output).toBe("verbose");
			expect(verbosePayload.snapshot?.workbench?.kind).toBe(
				"workbench_index_v1",
			);
			expect(verbosePayload.snapshot?.workbench?.sessions).toHaveLength(1);
			expect(verbosePayload.snapshot?.workbench?.tasks).toHaveLength(3);
			expect(verbosePayload.snapshot?.rules?.rules).toHaveLength(2);
			expect(verbosePayload.snapshot?.skills?.skills).toHaveLength(2);
			expect(verbosePayload.snapshot?.specs?.specs).toHaveLength(2);
			expect(verbosePayload.snapshot?.files?.files?.length).toBeGreaterThan(50);
			expect(verbosePayload.data?.snapshot?.workbench?.kind).toBe(
				"workbench_index_v1",
			);
			expect(verbosePayload.data?.snapshot?.workbench?.sessions).toHaveLength(
				1,
			);
			expect(verbosePayload.data?.snapshot?.workbench?.tasks).toHaveLength(3);
			expect(verbosePayload.data?.snapshot?.rules?.rules).toHaveLength(2);
			expect(verbosePayload.data?.snapshot?.skills?.skills).toHaveLength(2);
			expect(verbosePayload.data?.snapshot?.specs?.specs).toHaveLength(2);
			expect(
				verbosePayload.data?.snapshot?.files?.files?.length,
			).toBeGreaterThan(50);

			expect(
				await runLocalStateCommand(["freshness", "--json"], root, io),
			).toBe(0);
			const freshnessPayload = JSON.parse(stdout.at(-1) ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				checks: unknown[];
				data?: { checks?: unknown[] };
			};
			expect(freshnessPayload.schema).toBe("afol.result/v1");
			expect(freshnessPayload.ok).toBe(true);
			expect(freshnessPayload.exit_code).toBe(0);
			expect(Array.isArray(freshnessPayload.checks)).toBe(true);
			expect(freshnessPayload.data?.checks).toBeDefined();

			expect(await runLocalStateCommand(["freshness"], root, io)).toBe(0);
			expect(stdout.at(-1)).toContain("local-state freshness: ok");
			expect(stdout.at(-1)).toContain("ok workbench");
			expect(stderr).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("local-state rebuild --json is denied in restricted context", async () => {
		const root = buildFixture();
		try {
			const stdout: string[] = [];
			const io = {
				stdout: (message: string) => stdout.push(message),
				stderr: () => undefined,
			};

			expect(
				await runLocalStateCommand(
					["rebuild", "--json"],
					root,
					io,
					agentOperationContext(),
				),
			).toBe(2);
			const payload = JSON.parse(stdout.at(-1) ?? "{}") as {
				ok: boolean;
				action: string;
				error: { code: string };
			};
			expect(payload.ok).toBe(false);
			expect(payload.action).toBe("local-state.rebuild");
			expect(payload.error.code).toBe("approval-required");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validateWorkBenchIndex fails malformed generated_at", () => {
		const root = buildFixture();
		try {
			mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "data", "index", "workbench.json"),
				JSON.stringify({
					kind: "workbench_index_v1",
					version: 1,
					generated_at: "not-a-date",
					source: {
						wb_dir: ".afol/wb",
						event_log: ".afol/data/events/events.jsonl",
					},
					sessions: [],
					tasks: [],
				}),
				"utf8",
			);

			expect(validateWorkBenchIndex(root)).toEqual({
				ok: false,
				message: expect.stringContaining("invalid workbench index snapshot"),
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
