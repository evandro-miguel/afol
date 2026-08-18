import { describe, expect, test } from "bun:test";
import {
	appendFileSync,
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import {
	appendProductionDayAllocation,
	checkEvolutionDbHealth,
	evolutionDbPath,
	openEvolutionDb,
	productionDayJournalPath,
} from "../services/evolution";
import { removeEvolutionTestRoot } from "./evolution-test-support";
import { symlinkTestSupport } from "./symlink-test-support";

const PROJECT_ID = "67cfb6af-14a2-4d07-a8e2-9e0be1435844";

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "evolution-static-safety-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: PROJECT_ID, name: "fixture", timezone: "UTC" },
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
		}),
	);
	return root;
}

function seedEvidence(root: string): void {
	const sessionDir = join(root, ".afol", "wb", "S-static");
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: "E-static",
			project_id: PROJECT_ID,
			session_id: "S-static",
			created_at: "2026-07-17T05:00:00.000Z",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
		})}\n`,
	);
}

function seedHealthyState(root: string): void {
	seedEvidence(root);
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		appendProductionDayAllocation({
			root,
			db,
			projectId: PROJECT_ID,
			timezone: "UTC",
			sessionId: "S-static",
			evidenceId: "E-static",
		});
	} finally {
		db.close();
	}
}

describe("evolution static path safety", () => {
	test("status does not create locks or mutate canonical state", async () => {
		const root = fixture();
		try {
			seedHealthyState(root);
			rmSync(join(root, ".afol", "wb", ".locks"), {
				recursive: true,
				force: true,
			});
			const dbPath = evolutionDbPath(root);
			const journalPath = productionDayJournalPath(root);
			const beforeDb = readFileSync(dbPath);
			const beforeJournal = readFileSync(journalPath);
			const beforeDbMtime = statSync(dbPath).mtimeMs;
			const beforeStateEntries = readdirSync(join(root, ".afol", "state"));
			const captured: string[] = [];
			const statusCode = await runEvolveCommand("status", ["--json"], root, {
				stdout: (message) => captured.push(message),
				stderr: () => {},
			});
			expect(statusCode).toBe(0);
			expect(JSON.parse(captured[0] ?? "{}").data.state).toBe("healthy");
			expect(existsSync(join(root, ".afol", "wb", ".locks"))).toBe(false);
			expect(readFileSync(dbPath)).toEqual(beforeDb);
			expect(readFileSync(journalPath)).toEqual(beforeJournal);
			expect(statSync(dbPath).mtimeMs).toBe(beforeDbMtime);
			expect(readdirSync(join(root, ".afol", "state"))).toEqual(
				beforeStateEntries,
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects a hardlinked DB target", () => {
		const root = fixture();
		try {
			const dbPath = evolutionDbPath(root);
			const db = openEvolutionDb(dbPath);
			db.close();
			const alias = join(root, "db-alias");
			linkSync(dbPath, alias);
			expect(() => openEvolutionDb(alias)).toThrow("must not be hardlinked");
			expect(checkEvolutionDbHealth(alias).findings[0]?.message).toContain(
				"must not be hardlinked",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects a hardlinked journal without changing the rollback target", () => {
		const root = fixture();
		try {
			seedHealthyState(root);
			const journalPath = productionDayJournalPath(root);
			const alias = join(root, "journal-alias.jsonl");
			linkSync(journalPath, alias);
			const before = readFileSync(alias);
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				appendFileSync(
					join(root, ".afol", "wb", "S-static", ".evidence.jsonl"),
					`${JSON.stringify({
						id: "E-static-2",
						project_id: PROJECT_ID,
						session_id: "S-static",
						created_at: "2026-07-17T05:00:00.000Z",
						result: "passed",
						provenance: "observed",
						exit_code: 0,
					})}\n`,
				);
				expect(() =>
					appendProductionDayAllocation({
						root,
						db,
						projectId: PROJECT_ID,
						timezone: "UTC",
						sessionId: "S-static",
						evidenceId: "E-static-2",
					}),
				).toThrow("must not be hardlinked");
				expect(readFileSync(alias)).toEqual(before);
			} finally {
				db.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"rejects a symlinked intermediate state directory",
		() => {
			const root = fixture();
			try {
				const outside = join(root, "outside");
				mkdirSync(outside);
				mkdirSync(join(root, ".afol"), { recursive: true });
				symlinkSync(outside, join(root, ".afol", "state"), "dir");
				expect(() =>
					openEvolutionDb(join(root, ".afol", "state", "evolution.db")),
				).toThrow(/parent|reparse|symlink/i);
			} finally {
				removeEvolutionTestRoot(root);
			}
		},
	);
});
