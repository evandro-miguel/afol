import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	isMainThread,
	parentPort,
	Worker,
	workerData,
} from "node:worker_threads";
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
	detectSessionHealth,
	loadWorkBenchIndexSnapshot,
	rebuildWorkBenchIndex,
	validateWorkBenchIndex,
} from "../services/local-state/workbench-index";
import {
	appendMutationRecord,
	type MutationRecord,
} from "../services/mutations/journal";

if (!isMainThread) {
	if (workerData?.kind !== "workbench-rebuild") {
		process.exit(0);
	}

	const { root, sessionScope, coordination } = workerData as {
		kind: string;
		root: string;
		sessionScope: string;
		coordination: SharedArrayBuffer;
	};
	const signals = new Int32Array(coordination);
	const arrival = Atomics.add(signals, 0, 1) + 1;
	if (arrival === 1) {
		const waitStatus = Atomics.wait(signals, 1, 0, 5_000);
		if (waitStatus === "timed-out") {
			throw new Error(
				"rebuildWorkBenchIndex concurrency test barrier timed out waiting for peer",
			);
		}
	} else {
		Atomics.store(signals, 1, 1);
		Atomics.notify(signals, 1, 1);
	}

	rebuildWorkBenchIndex(root, sessionScope);
	parentPort?.postMessage("done");
	process.exit(0);
}

function runRebuildInWorker(
	root: string,
	sessionScope: string,
	coordination: SharedArrayBuffer,
	kind = "workbench-rebuild",
) {
	return new Promise<void>((resolve, reject) => {
		const worker = new Worker(new URL(import.meta.url), {
			workerData: {
				kind,
				root,
				sessionScope,
				coordination,
			},
		});
		worker.on("error", reject);
		worker.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Worker exited with code ${code}`));
			}
		});
	});
}

function runRebuildInWorkerForKind(
	root: string,
	sessionScope: string,
	coordination: SharedArrayBuffer,
	kind: string,
) {
	return new Promise<{ message: unknown }>((resolve, reject) => {
		const worker = new Worker(new URL(import.meta.url), {
			workerData: {
				kind,
				root,
				sessionScope,
				coordination,
			},
		});
		let message: unknown;
		worker.on("message", (value) => {
			message = value;
		});
		worker.on("error", reject);
		worker.on("exit", (code) => {
			if (code === 0) {
				resolve({ message });
			} else {
				reject(new Error(`Worker exited with code ${code}`));
			}
		});
	});
}

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

	test("rebuildWorkBenchIndex parses legacy State Board table shapes conservatively", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-legacy-state-board-"));
		try {
			const expandedSession = join(root, ".afol", "wb", "260618_expanded");
			const noNotesSession = join(root, ".afol", "wb", "260618_no-notes");
			const pstrToolingSession = join(
				root,
				".afol",
				"wb",
				"260618_pstr-tooling-watch",
			);
			const releaseGovernanceSession = join(
				root,
				".afol",
				"wb",
				"260620_release-version-governance",
			);
			const testGateSession = join(
				root,
				".afol",
				"wb",
				"260619_test-gate-hardening",
			);
			const partialSession = join(root, ".afol", "wb", "260618_partial");
			const malformedSession = join(root, ".afol", "wb", "260618_malformed");
			for (const sessionDir of [
				expandedSession,
				noNotesSession,
				pstrToolingSession,
				releaseGovernanceSession,
				testGateSession,
				partialSession,
				malformedSession,
			]) {
				mkdirSync(sessionDir, { recursive: true });
			}

			writeFileSync(
				join(expandedSession, "260618_expanded_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Target files | Notes | Commands |",
					"|------|-------|-------|--------------|-------|----------|",
					"| T-01 | done | alice | cli/a.ts | expanded notes | bun test |",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(noNotesSession, "260618_no-notes_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | Target files | State | Owner |",
					"|------|--------------|-------|-------|",
					"| T-01 | cli/a.ts | in_progress | bob |",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(pstrToolingSession, "260618_pstr-tooling-watch_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Write Scope | Validation Target | Evidence |",
					"|------|-------|-------|-------------|-------------------|----------|",
					"| T-01 | done | planner | .afol/wb/** | freeze contract | plan docs |",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(
					releaseGovernanceSession,
					"260620_release-version-governance_task_01.md",
				),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Write scope | Validate | Evidence |",
					"|------|-------|-------|-------------|----------|----------|",
					"| T-01 | done | worker | package.json | bun test | evidence entry |",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(testGateSession, "260619_test-gate-hardening_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Target files | Commands | Output contract | Notes |",
					"|------|-------|-------|--------------|----------|-----------------|-------|",
					"| T-01 | done | worker | cli/dev/coverage-check.ts | bun test | gate passes | explicit notes |",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(partialSession, "260618_partial_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes | Extra |",
					"|------|-------|-------|-------|-------|",
					"| T-01 | done | carol | keep valid task | value |",
					"| T-02 | blocked |",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(malformedSession, "260618_malformed_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | State | Notes |",
					"|------|-------|-------|",
					"| T-01 | done | missing owner column |",
				].join("\n"),
				"utf8",
			);

			const snapshot = rebuildWorkBenchIndex(root);
			const expandedTask = snapshot.tasks.find(
				(task) => task.session === "260618_expanded" && task.task_id === "T-01",
			);
			const noNotesTask = snapshot.tasks.find(
				(task) => task.session === "260618_no-notes" && task.task_id === "T-01",
			);
			const pstrToolingTask = snapshot.tasks.find(
				(task) =>
					task.session === "260618_pstr-tooling-watch" &&
					task.task_id === "T-01",
			);
			const releaseGovernanceTask = snapshot.tasks.find(
				(task) =>
					task.session === "260620_release-version-governance" &&
					task.task_id === "T-01",
			);
			const testGateTask = snapshot.tasks.find(
				(task) =>
					task.session === "260619_test-gate-hardening" &&
					task.task_id === "T-01",
			);
			const partialTasks = snapshot.tasks.filter(
				(task) => task.session === "260618_partial",
			);

			expect(expandedTask).toMatchObject({
				state: "done",
				owner: "alice",
				notes: "expanded notes",
			});
			expect(noNotesTask?.notes).toBe("");
			expect(pstrToolingTask?.notes).toBe("");
			expect(releaseGovernanceTask?.notes).toBe("");
			expect(testGateTask?.notes).toBe("explicit notes");
			expect(partialTasks.map((task) => task.task_id)).toEqual(["T-01"]);
			expect(
				snapshot.sessions.find(
					(session) => session.session === "260618_partial",
				)?.degraded,
			).toBe(true);
			expect(
				snapshot.sessions.find(
					(session) => session.session === "260618_malformed",
				)?.degraded,
			).toBe(true);
			expect(
				snapshot.sessions.find(
					(session) => session.session === "260618_malformed",
				)?.task_count,
			).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("loaded workbench snapshots reject deeply malformed entries", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-malformed-snapshot-"));
		const sessionA = "260618_alpha";
		const sessionB = "260618_beta";
		try {
			for (const session of [sessionA, sessionB]) {
				mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			}
			for (const [session, owner] of [
				[sessionA, "alice"],
				[sessionB, "bob"],
			] as const) {
				writeFileSync(
					join(root, ".afol", "wb", session, `${session}_task_01.md`),
					[
						"| Task | State | Owner | Notes |",
						"|------|-------|-------|-------|",
						`| T-01 | done | ${owner} | valid |`,
					].join("\n"),
					"utf8",
				);
			}

			rebuildWorkBenchIndex(root);
			const touchedAt = new Date().toISOString();
			const malformedSnapshot = {
				kind: "workbench_index_v1",
				version: 1,
				generated_at: touchedAt,
				source: { wb_dir: ".afol/wb", event_log: ".afol/events.jsonl" },
				sessions: [
					{
						session: sessionA,
						task_count: 1,
						completed: 1,
						open: 0,
						problem: 0,
						touched_at: touchedAt,
					},
					{
						session: null,
						task_count: 0,
						completed: 0,
						open: 0,
						problem: 0,
						touched_at: touchedAt,
					},
				],
				tasks: [
					{
						session: sessionA,
						task_id: "T-01",
						state: "done",
						owner: "alice",
						notes: "valid",
						file: join(root, ".afol", "wb", sessionA, `${sessionA}_task_01.md`),
						line: 3,
						touched_at: touchedAt,
						planned_files: [
							{
								path: "cli/a.ts",
								kind: "exact",
								source: "planned",
								line: "bad",
							},
						],
						touched_files: [],
					},
				],
			};
			const indexPath = join(root, ".afol", "data", "index", "workbench.json");
			writeFileSync(
				indexPath,
				`${JSON.stringify(malformedSnapshot)}\n`,
				"utf8",
			);

			expect(loadWorkBenchIndexSnapshot(root)).toBeNull();
			const rebuilt = rebuildWorkBenchIndex(root, sessionB);
			expect(rebuilt.sessions.map((session) => session.session)).toEqual([
				sessionA,
				sessionB,
			]);
			expect(rebuilt.tasks).toHaveLength(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("loaded workbench snapshots reject duplicate identities and inconsistent counters", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-inconsistent-snapshot-"));
		const session = "260618_alpha";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, `${session}_task_01.md`),
				[
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | alice | valid |",
				].join("\n"),
				"utf8",
			);

			const valid = rebuildWorkBenchIndex(root);
			const corruptSnapshots = [
				{
					...valid,
					sessions: [{ ...valid.sessions[0], task_count: 0 }],
				},
				{
					...valid,
					sessions: [...valid.sessions, { ...valid.sessions[0] }],
				},
				{
					...valid,
					tasks: [...valid.tasks, { ...valid.tasks[0] }],
				},
			];
			const indexPath = join(root, ".afol", "data", "index", "workbench.json");
			for (const corruptSnapshot of corruptSnapshots) {
				writeFileSync(
					indexPath,
					`${JSON.stringify(corruptSnapshot)}\n`,
					"utf8",
				);
				expect(loadWorkBenchIndexSnapshot(root)).toBeNull();
				expect(validateWorkBenchIndex(root).ok).toBe(false);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuild omits duplicate source task IDs and marks the session degraded", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-duplicate-source-task-"));
		const session = "260618_duplicate";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, `${session}_task_01.md`),
				[
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | alice | first |",
					"| T-01 | problem | bob | duplicate |",
				].join("\n"),
				"utf8",
			);

			const rebuilt = rebuildWorkBenchIndex(root);
			expect(rebuilt.tasks).toHaveLength(1);
			expect(rebuilt.tasks[0]).toMatchObject({
				task_id: "T-01",
				state: "done",
				owner: "alice",
			});
			expect(rebuilt.sessions[0]).toMatchObject({
				task_count: 1,
				completed: 1,
				problem: 0,
				degraded: true,
			});
			expect(loadWorkBenchIndexSnapshot(root)).not.toBeNull();
			const validation = validateWorkBenchIndex(root);
			expect(validation.ok).toBe(false);
			expect(validation.message).toContain("duplicate task IDs");
			expect(validation.message).toContain(
				"Repair the named session task source",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("empty State rows are rejected while empty Owner rows remain valid", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-empty-state-"));
		const session = "260618_empty-state";
		try {
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, `${session}_task_01.md`),
				[
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 |  | alice | malformed state |",
					"| T-02 | done |  | empty owner is allowed |",
				].join("\n"),
				"utf8",
			);

			const snapshot = rebuildWorkBenchIndex(root);
			expect(snapshot.tasks).toHaveLength(1);
			expect(snapshot.tasks[0]).toMatchObject({
				task_id: "T-02",
				state: "done",
				owner: "",
			});
			expect(snapshot.sessions[0]).toMatchObject({
				task_count: 1,
				degraded: true,
			});
			expect(validateWorkBenchIndex(root).ok).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("scoped rebuild preserves peer data while validation reports peer drift", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-scope-stale-peer-"));
		const sessionA = "260618_alpha";
		const sessionB = "260618_beta";
		try {
			for (const session of [sessionA, sessionB]) {
				mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			}
			const taskRows = (owner: string, notes: string) =>
				[
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					`| T-01 | done | ${owner} | ${notes} |`,
				].join("\n");
			writeFileSync(
				join(root, ".afol", "wb", sessionA, `${sessionA}_task_01.md`),
				taskRows("alice", "baseline"),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", sessionB, `${sessionB}_task_01.md`),
				taskRows("bob", "baseline"),
				"utf8",
			);
			const unchangedMtime = new Date("2026-01-01T00:00:00.000Z");
			const sessionATaskPath = join(
				root,
				".afol",
				"wb",
				sessionA,
				`${sessionA}_task_01.md`,
			);
			utimesSync(sessionATaskPath, unchangedMtime, unchangedMtime);
			rebuildWorkBenchIndex(root);

			writeFileSync(
				sessionATaskPath,
				[
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 |  | alice | corrupted state |",
				].join("\n"),
				"utf8",
			);
			utimesSync(sessionATaskPath, unchangedMtime, unchangedMtime);
			writeFileSync(
				join(root, ".afol", "wb", sessionB, `${sessionB}_task_01.md`),
				taskRows("bob", "scoped rebuild"),
				"utf8",
			);

			const snapshot = rebuildWorkBenchIndex(root, sessionB);
			expect(snapshot.sessions).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						session: sessionA,
						task_count: 1,
					}),
					expect.objectContaining({ session: sessionB, task_count: 1 }),
				]),
			);
			expect(validateWorkBenchIndex(root).ok).toBe(false);

			const repaired = rebuildWorkBenchIndex(root);
			expect(repaired.sessions).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						session: sessionA,
						task_count: 0,
						degraded: true,
					}),
					expect.objectContaining({ session: sessionB, task_count: 1 }),
				]),
			);
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

	test("rebuildWorkBenchIndex(sessionScope) preserves concurrent scoped updates", async () => {
		const root = mkdtempSync(join(tmpdir(), "wb-scope-concurrent-"));
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
					"| T-01 | in_progress | bob | baseline |",
				].join("\n"),
				"utf8",
			);
			rebuildWorkBenchIndex(root);

			writeFileSync(
				join(sessionA, "260618_alpha_task_01.md"),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | alice | baseline |",
					"| T-02 | implemented_untested | alice | concurrent |",
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
					"| T-01 | in_progress | bob | baseline |",
					"| T-02 | implemented_untested | bob | concurrent |",
				].join("\n"),
				"utf8",
			);

			const coordination = new SharedArrayBuffer(
				Int32Array.BYTES_PER_ELEMENT * 2,
			);
			const alphaRunner = runRebuildInWorker(
				root,
				"260618_alpha",
				coordination,
			);
			const betaRunner = runRebuildInWorker(root, "260618_beta", coordination);

			await Promise.all([alphaRunner, betaRunner]);

			const snapshot = loadWorkBenchIndexSnapshot(root);
			if (!snapshot) {
				throw new Error("Expected persisted workbench index snapshot");
			}
			const alphaSession = snapshot.sessions.find(
				(session) => session.session === "260618_alpha",
			);
			const betaSession = snapshot.sessions.find(
				(session) => session.session === "260618_beta",
			);
			expect(alphaSession?.task_count).toBe(2);
			expect(betaSession?.task_count).toBe(2);

			const alphaTasks = snapshot.tasks
				.filter((task) => task.session === "260618_alpha")
				.map((task) => task.task_id)
				.sort();
			const betaTasks = snapshot.tasks
				.filter((task) => task.session === "260618_beta")
				.map((task) => task.task_id)
				.sort();
			expect(alphaTasks).toEqual(["T-01", "T-02"]);
			expect(betaTasks).toEqual(["T-01", "T-02"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("worker harness ignores non-workbench-rebuild worker kinds", async () => {
		const root = mkdtempSync(join(tmpdir(), "wb-scope-worker-kind-"));
		try {
			const coordination = new SharedArrayBuffer(
				Int32Array.BYTES_PER_ELEMENT * 2,
			);
			const result = await runRebuildInWorkerForKind(
				root,
				"260618_alpha",
				coordination,
				"unrelated-worker",
			);

			expect(result).toEqual({ message: undefined });
			expect(loadWorkBenchIndexSnapshot(root)).toBeNull();
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

	test("files index excludes gitignored files but keeps tracked and unignored files", () => {
		const root = buildFixture();
		try {
			writeFileSync(
				join(root, ".gitignore"),
				"ignored.txt\nignored-dir/\ntracked-ignored.txt\n",
				"utf8",
			);
			writeFileSync(join(root, "ignored.txt"), "ignored", "utf8");
			mkdirSync(join(root, "ignored-dir"), { recursive: true });
			writeFileSync(join(root, "ignored-dir", "nested.txt"), "ignored", "utf8");
			writeFileSync(join(root, "tracked.txt"), "tracked", "utf8");
			writeFileSync(join(root, "tracked-ignored.txt"), "tracked", "utf8");

			expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
			expect(
				spawnSync("git", ["add", "tracked.txt"], { cwd: root }).status,
			).toBe(0);
			expect(
				spawnSync("git", ["add", "-f", "tracked-ignored.txt"], { cwd: root })
					.status,
			).toBe(0);

			const snapshot = rebuildFilesIndex(root);
			const paths = snapshot.files.map((entry) => entry.path);
			expect(paths).toContain("tracked.txt");
			expect(paths).toContain("tracked-ignored.txt");
			expect(paths).toContain("a.txt");
			expect(paths).not.toContain("ignored.txt");
			expect(paths).not.toContain("ignored-dir/nested.txt");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("files index handles Git output larger than the child-process buffer", () => {
		const root = buildFixture();
		try {
			writeFileSync(join(root, ".gitignore"), "ignored.txt\n", "utf8");
			writeFileSync(join(root, "ignored.txt"), "ignored", "utf8");
			const bulkDir = join(root, "bulk");
			mkdirSync(bulkDir, { recursive: true });
			for (let index = 0; index < 10_000; index += 1) {
				const name = `file-${"x".repeat(90)}-${index}.txt`;
				writeFileSync(join(bulkDir, name), "bulk", "utf8");
			}

			expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
			const snapshot = rebuildFilesIndex(root);
			expect(snapshot.files.length).toBeGreaterThan(10_000);
			expect(snapshot.files.some((entry) => entry.path === "ignored.txt")).toBe(
				false,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("files index filters a project nested under a Git root", () => {
		const gitRoot = mkdtempSync(join(tmpdir(), "nested-git-root-"));
		const root = join(gitRoot, "project");
		try {
			mkdirSync(join(root, ".afol", "adm", "rules"), { recursive: true });
			mkdirSync(join(root, ".agents", "skills"), { recursive: true });
			mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
			writeFileSync(join(root, "kept.txt"), "kept", "utf8");
			writeFileSync(join(root, "ignored.txt"), "ignored", "utf8");
			writeFileSync(
				join(gitRoot, ".gitignore"),
				"project/ignored.txt\n",
				"utf8",
			);

			expect(spawnSync("git", ["init", "-q"], { cwd: gitRoot }).status).toBe(0);
			const snapshot = rebuildFilesIndex(root);
			const paths = snapshot.files.map((entry) => entry.path);
			expect(paths).toContain("kept.txt");
			expect(paths).not.toContain("ignored.txt");
		} finally {
			rmSync(gitRoot, { recursive: true, force: true });
		}
	});

	test("files index fails closed when Git listing fails", () => {
		const root = buildFixture();
		try {
			writeFileSync(join(root, "visible.txt"), "visible", "utf8");
			expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
			mkdirSync(join(root, ".git", "index"));

			const snapshot = rebuildFilesIndex(root);
			expect(snapshot.files).toEqual([]);
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
				"notes/private/bank-key.md",
				"notes/private/home-address.md",
				"docs/Private/client.md",
				"docs/PRIVATE/upper.md",
				"docs/Chave/client.md",
				"docs/Endereco/data.md",
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

	test("bounds verbose rebuild snapshots and reports omitted entries", async () => {
		const root = buildFixture();
		try {
			const bulkDir = join(root, "bulk");
			mkdirSync(bulkDir, { recursive: true });
			for (let index = 0; index < 500; index += 1) {
				writeFileSync(
					join(bulkDir, `file-${index}.txt`),
					`${"indexed ".repeat(20)}\n`,
					"utf8",
				);
			}
			const stdout: string[] = [];
			const io = {
				stdout: (message: string) => stdout.push(message),
				stderr: () => {},
			};

			expect(
				await runLocalStateCommand(
					["rebuild", "--json", "--verbose"],
					root,
					io,
				),
			).toBe(0);
			const payload = JSON.parse(stdout.at(-1) ?? "{}") as {
				snapshot_truncated?: boolean;
				snapshot_omitted?: number;
			};
			expect(payload.snapshot_truncated).toBe(true);
			expect(payload.snapshot_omitted).toBeGreaterThan(0);
			expect(stdout.at(-1)?.length ?? 0).toBeLessThan(40_000);
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

	test("rebuildWorkBenchIndex marks session degraded when task files exist but have no parseable tasks", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-degraded-"));
		const session = "260714_1200_degraded-test";
		const emptyBoardSession = "260714_1200_empty-board";
		try {
			mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", emptyBoardSession), {
				recursive: true,
			});
			mkdirSync(join(root, ".afol", "state"), { recursive: true });
			mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
			mkdirSync(join(root, ".afol", "memory"), { recursive: true });
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			// Write a task file that parseTaskRows cannot parse (no state board)
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_task_01.md`),
				"# Tasks\n\nNo state board here.\n",
				"utf8",
			);
			// Another task file with no state board rows
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_task_02.md`),
				"# More tasks\n\nStill no state board.\n",
				"utf8",
			);
			writeFileSync(
				join(
					root,
					".afol",
					"wb",
					emptyBoardSession,
					`${emptyBoardSession}_task_01.md`,
				),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
				].join("\n"),
				"utf8",
			);

			// Full rebuild — the sessions should appear but degraded
			const snapshot = rebuildWorkBenchIndex(root);
			const degradedSession = snapshot.sessions.find(
				(s) => s.session === session,
			);
			expect(degradedSession).toBeDefined();
			expect(degradedSession?.degraded).toBe(true);
			expect(degradedSession?.task_count).toBe(0);
			const emptyBoardEntry = snapshot.sessions.find(
				(s) => s.session === emptyBoardSession,
			);
			expect(emptyBoardEntry).toMatchObject({
				session: emptyBoardSession,
				task_count: 0,
				degraded: true,
			});
			expect(validateWorkBenchIndex(root).ok).toBe(false);

			// Also verify a healthy session is not degraded
			const healthy = "260714_1200_healthy";
			mkdirSync(join(root, ".afol", "wb", healthy), { recursive: true });
			writeFileSync(
				join(root, ".afol", "wb", healthy, `${healthy}_task_01.md`),
				[
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | fine |",
				].join("\n"),
				"utf8",
			);

			const fullSnapshot = rebuildWorkBenchIndex(root);
			const healthyEntry = fullSnapshot.sessions.find(
				(s) => s.session === healthy,
			);
			expect(healthyEntry).toBeDefined();
			expect(healthyEntry?.degraded).toBeUndefined();
			expect(healthyEntry?.task_count).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildWorkBenchIndex scoped rebuild falls back to full when no existing snapshot", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-scoped-fallback-"));
		const session = "260714_1200_scoped-test";
		const other = "260714_1200_other";
		try {
			mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			mkdirSync(join(root, ".afol", "wb", other), { recursive: true });
			mkdirSync(join(root, ".afol", "state"), { recursive: true });
			mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
			mkdirSync(join(root, ".afol", "memory"), { recursive: true });
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_task_01.md`),
				[
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | fine |",
				].join("\n"),
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "wb", other, `${other}_task_01.md`),
				[
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					"| T-01 | done | worker | also fine |",
				].join("\n"),
				"utf8",
			);

			// Scoped rebuild with no existing snapshot — must fall back to full
			// rebuild so unaffected sessions ("other") are not dropped.
			const beforeWriteScopes: (string | undefined)[] = [];
			const scopedResult = rebuildWorkBenchIndex(root, session, {
				beforeWrite: (scope) => beforeWriteScopes.push(scope),
			});
			expect(scopedResult.sessions.length).toBe(2);
			expect(scopedResult.sessions.map((s) => s.session).sort()).toEqual([
				other,
				session,
			]);
			expect(scopedResult.tasks.length).toBe(2);
			expect(beforeWriteScopes).toEqual([session]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validateWorkBenchIndex flags degraded sessions", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-validatedegraded-"));
		const session = "260715_1200_degraded-validate";
		try {
			mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			mkdirSync(join(root, ".afol", "state"), { recursive: true });
			mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
			mkdirSync(join(root, ".afol", "memory"), { recursive: true });
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			// Task files with no parseable state board
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_task_01.md`),
				"# No state board\n",
				"utf8",
			);

			// Rebuild to populate the index with degraded flag
			rebuildWorkBenchIndex(root);

			// Validation must flag degraded sessions
			const result = validateWorkBenchIndex(root);
			expect(result.ok).toBe(false);
			expect(result.message).toContain("degraded sessions");
			expect(result.message).toContain(session);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(process.platform === "win32")(
		"rebuildWorkBenchIndex marks unreadable session directories degraded",
		() => {
			const root = mkdtempSync(join(tmpdir(), "wb-unreadable-session-"));
			const session = "260715_1300_unreadable-session";
			const sessionDir = join(root, ".afol", "wb", session);
			try {
				mkdirSync(sessionDir, { recursive: true });
				mkdirSync(join(root, ".afol", "state"), { recursive: true });
				mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
				mkdirSync(join(root, ".afol", "memory"), { recursive: true });
				mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
				chmodSync(sessionDir, 0o000);

				const snapshot = rebuildWorkBenchIndex(root);
				const indexedSession = snapshot.sessions.find(
					(entry) => entry.session === session,
				);
				expect(indexedSession?.degraded).toBe(true);
				expect(validateWorkBenchIndex(root).ok).toBe(false);
				expect(detectSessionHealth(root)).toContainEqual(
					expect.objectContaining({
						type: "unreadable_session_directory",
						session,
					}),
				);
			} finally {
				chmodSync(sessionDir, 0o700);
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test("rebuildWorkBenchIndex preserves escaped pipes in state board cells (odd backslash)", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-escaped-pipes-"));
		const session = "260618_escaped-pipes";
		try {
			mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			mkdirSync(join(root, ".afol", "state"), { recursive: true });
			mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
			mkdirSync(join(root, ".afol", "memory"), { recursive: true });
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_task_01.md`),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					String.raw`| T-01 | done | worker | ref\|42 |`,
					"| T-02 | in_progress | me | note |",
					String.raw`| T-03 | pending | worker | note\|`,
				].join("\n"),
				"utf8",
			);
			const snapshot = rebuildWorkBenchIndex(root);
			expect(snapshot.tasks).toHaveLength(3);
			const t1 = snapshot.tasks.find((task) => task.task_id === "T-01");
			expect(t1?.notes).toBe(String.raw`ref\|42`);
			const t2 = snapshot.tasks.find((task) => task.task_id === "T-02");
			expect(t2?.notes).toBe("note");
			const t3 = snapshot.tasks.find((task) => task.task_id === "T-03");
			expect(t3?.notes).toBe(String.raw`note\|`);
			// No degradation from escaped-pipe parsing
			expect(
				snapshot.sessions.find((s) => s.session === session)?.degraded,
			).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildWorkBenchIndex handles even backslash before pipe as column delimiter", () => {
		const root = mkdtempSync(join(tmpdir(), "wb-escaped-pipes-even-"));
		const session = "260618_escaped-pipes-even";
		try {
			mkdirSync(join(root, ".afol", "wb", session), { recursive: true });
			mkdirSync(join(root, ".afol", "state"), { recursive: true });
			mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
			mkdirSync(join(root, ".afol", "memory"), { recursive: true });
			mkdirSync(join(root, ".afol", "data", "events"), { recursive: true });
			// Two backslashes before pipe: even count, so pipe is a real delimiter.
			// "worker\\|owner" splits into cells: "worker\\" and "owner".
			// So owner column (index 2) = "worker\\", notes column (index 3) = "owner",
			// and "the note" is an extra column (index 4) ignored by parser.
			writeFileSync(
				join(root, ".afol", "wb", session, `${session}_task_01.md`),
				[
					"## State Board",
					"",
					"| Task | State | Owner | Notes |",
					"|------|-------|-------|-------|",
					String.raw`| T-01 | done | worker\\|owner | the note |`,
				].join("\n"),
				"utf8",
			);
			const snapshot = rebuildWorkBenchIndex(root);
			expect(snapshot.tasks).toHaveLength(1);
			const t1 = snapshot.tasks.find((task) => task.task_id === "T-01");
			// Even backslashes: pipe at column boundary splits into two cells:
			// owner column gets "worker\\" (two backslashes preserved)
			expect(t1?.owner).toBe(String.raw`worker\\`);
			// notes column gets the cell that was meant as "owner"
			expect(t1?.notes).toBe("owner");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
