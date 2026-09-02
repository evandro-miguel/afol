import { describe, expect, test } from "bun:test";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import { agentOperationContext } from "../core/operation-context";
import {
	appendProductionDayAllocation,
	evolutionDbPath,
	openEvolutionDb,
	productionDayJournalPath,
} from "../services/evolution";
import {
	releaseEvolutionTestHandles,
	removeEvolutionTestRoot,
} from "./evolution-test-support";

const PROJECT_ID = "db97afff-2026-4eb1-a799-5d34fd505267";

function fixture(projectId = PROJECT_ID): string {
	const root = mkdtempSync(join(tmpdir(), "evolve-journal-status-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(
			{
				schema_version: 1,
				project: {
					name: "fixture",
					id: projectId,
					timezone: "America/Asuncion",
				},
				paths: {
					external_dir: ".afol/external",
					evolution_db: ".afol/state/evolution.db",
					evolution_data_dir: ".afol/data/evolution",
					evolution_events_dir: ".afol/data/events/evolution",
				},
				evolution: {
					enabled: true,
					suggestions: {
						first_session_of_day: true,
						dedupe_scope: "project",
						max_visible_per_day: 1,
						remind_skipped_next_day: true,
						deep_review_after_production_days: 5,
					},
					preferences: {
						soft_decay_after_production_days: 7,
						stop_guiding_after_production_days: 20,
						minimum_effective_confidence: 0.65,
						decay_curve: "linear",
					},
					recurrence: {
						minimum_occurrences: 3,
						minimum_distinct_sessions: 2,
						minimum_distinct_production_days: 2,
					},
					large_change: {
						changed_files: 20,
						changed_lines: 1000,
						critical_paths_trigger: true,
					},
					external: {
						mode: "explicit_import_only",
						storage: "normalized_sections",
						store_raw: false,
						redact_before_persist: true,
					},
					autonomy: {
						auto_observe: true,
						auto_refresh_preference_projections: true,
						auto_clean_derived_state: true,
						auto_apply_mode: "none",
					},
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	return root;
}

function captureIo() {
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

function createJournal(root: string, projectId = PROJECT_ID): void {
	const sessionId = "S-journal-status";
	const evidenceId = "E-journal-status";
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: evidenceId,
			project_id: projectId,
			session_id: sessionId,
			created_at: "2026-07-16T12:00:00.000Z",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
		})}\n`,
		"utf8",
	);
	const db = openEvolutionDb(evolutionDbPath(root));
	appendProductionDayAllocation({
		root,
		db,
		projectId,
		timezone: "America/Asuncion",
		sessionId,
		evidenceId,
	});
	db.close();
}

function removeDb(root: string): void {
	releaseEvolutionTestHandles();
	const path = evolutionDbPath(root);
	for (const candidate of [path, `${path}-wal`, `${path}-shm`])
		rmSync(candidate, { force: true });
}

describe("evolve status canonical journal integrity", () => {
	test("reports the safe recovery action in restricted output when projection is absent", async () => {
		const root = fixture();
		try {
			createJournal(root);
			removeDb(root);
			const captured = captureIo();
			expect(
				await runEvolveCommand(
					"status",
					["--json"],
					root,
					captured.io,
					agentOperationContext(),
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "rebuild_required",
				recovery_action: "afol evolve repair --json",
				journal_health: { exists: true, valid: true, error: null },
			});
			expect(payload.data).not.toHaveProperty("project_id");
			expect(existsSync(evolutionDbPath(root))).toBe(false);
			expect(existsSync(`${evolutionDbPath(root)}-wal`)).toBe(false);
			expect(existsSync(`${evolutionDbPath(root)}-shm`)).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reports a stale schema with an approved rebuild recovery action", async () => {
		const root = fixture();
		try {
			createJournal(root);
			const db = openEvolutionDb(evolutionDbPath(root));
			db.exec("PRAGMA user_version = 0");
			db.close();
			const json = captureIo();
			expect(await runEvolveCommand("status", ["--json"], root, json.io)).toBe(
				0,
			);
			const payload = JSON.parse(json.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "rebuild_required",
				recovery_action: "afol evolve repair --json",
				journal_health: { exists: true, valid: true, error: null },
				db_health: { db_exists: true, ok: false },
			});
			const compact = captureIo();
			expect(await runEvolveCommand("status", [], root, compact.io)).toBe(0);
			expect(compact.stdout.join("\n")).toContain(
				"recovery_action=afol evolve repair --json",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("reports no recovery action for a healthy projection", async () => {
		const root = fixture();
		try {
			createJournal(root);
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "healthy",
				recovery_action: null,
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed for a malformed canonical journal without creating a db", async () => {
		const root = fixture();
		try {
			const path = productionDayJournalPath(root);
			mkdirSync(join(root, ".afol", "data", "events", "evolution"), {
				recursive: true,
			});
			writeFileSync(path, "not-json\n", "utf8");
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], root, captured.io),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "unhealthy",
				journal_health: { exists: true, valid: false },
			});
			expect(payload.data.journal_health.error).toContain("JSON");
			expect(existsSync(evolutionDbPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed when a journal is copied from another project", async () => {
		const source = fixture();
		const target = fixture("f4c7c0ae-50c7-4ea7-81c4-bf20e7f3a1a9");
		try {
			createJournal(source);
			const targetPath = productionDayJournalPath(target);
			mkdirSync(join(target, ".afol", "data", "events", "evolution"), {
				recursive: true,
			});
			copyFileSync(productionDayJournalPath(source), targetPath);
			const captured = captureIo();
			expect(
				await runEvolveCommand("status", ["--json"], target, captured.io),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}");
			expect(payload.data).toMatchObject({
				state: "unhealthy",
				journal_health: { exists: true, valid: false },
			});
			expect(payload.data.journal_health.error).toContain("another project");
			expect(existsSync(evolutionDbPath(target))).toBe(false);
		} finally {
			removeEvolutionTestRoot(source);
			removeEvolutionTestRoot(target);
		}
	});
});
