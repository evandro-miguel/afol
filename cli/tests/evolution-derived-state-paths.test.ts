import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	evolutionDbPath,
	readProductionDayJournal,
	repairEvolutionDerivedState,
} from "../services/evolution";
import { ingestObservationsForSession } from "../services/evolution/observation-ingest";
import { readObservationJournal } from "../services/evolution/observation-journal";
import { projectionCheckpointPath } from "../services/evolution/projection-checkpoint";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "3e6a9f52-8b4d-4c1e-a7d2-9f0b1c2d3e4f";
const CUSTOM_DB = ".afol/state/custom/evolution.db";
const CUSTOM_EVENTS_DIR = ".afol/data/events/custom-evolution";
const TIMEZONE = "Asia/Taipei";
const SESSION = "S-paths";
const NOW = new Date("2026-07-20T18:30:00.000Z");

function evolutionConfig(): Record<string, unknown> {
	return {
		schema_version: 1,
		project: { name: "paths-fixture", id: PROJECT_ID, timezone: TIMEZONE },
		paths: {
			external_dir: ".afol/external",
			evolution_db: CUSTOM_DB,
			evolution_data_dir: ".afol/data/evolution",
			evolution_events_dir: CUSTOM_EVENTS_DIR,
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
	};
}

function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "evolution-paths-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(evolutionConfig(), null, 2)}\n`,
		"utf8",
	);
	return root;
}

function seedSession(
	root: string,
	entries: Array<Record<string, unknown>>,
): void {
	const dir = join(root, ".afol", "wb", SESSION);
	mkdirSync(dir, { recursive: true });
	const content = `# Tasks\n\n## State Board\n\n| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n| T-01 | done | test | completion_policy=execution |\n`;
	writeFileSync(join(dir, `${SESSION}_task_01.md`), content, "utf8");
	writeFileSync(
		join(dir, ".evidence.jsonl"),
		`${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
		"utf8",
	);
}

function evidenceEntry(
	id: string,
	result: "passed" | "failed",
	exitCode: number,
): Record<string, unknown> {
	return {
		id,
		task_id: "T-01",
		project_id: PROJECT_ID,
		session_id: SESSION,
		created_at: NOW.toISOString(),
		command: "bun test",
		result,
		provenance: "observed",
		exit_code: exitCode,
		purpose: "completion",
		authorization_type: "execution",
	};
}

function observationRows(dbPath: string): number {
	const db = new Database(dbPath, { readonly: true });
	try {
		const row = db
			.query("SELECT COUNT(*) AS n FROM observations WHERE project_id = ?")
			.get(PROJECT_ID) as { n: number };
		return Number(row.n);
	} finally {
		db.close();
	}
}

function checkpointLines(root: string): number {
	return readFileSync(projectionCheckpointPath(root, CUSTOM_EVENTS_DIR), "utf8")
		.trim()
		.split("\n").length;
}

describe("evolution configured-path agreement", () => {
	test("ingest and derived-state repair share the configured evolution paths", () => {
		const root = fixtureRoot();
		try {
			seedSession(root, [
				evidenceEntry("E-paths-passed", "passed", 0),
				evidenceEntry("E-paths-failed", "failed", 1),
			]);

			const result = ingestObservationsForSession({
				root,
				projectId: PROJECT_ID,
				session: SESSION,
				now: NOW,
			});
			expect(result).toMatchObject({ appended: 1, duplicates: 0, skipped: 0 });
			expect(result.warnings).toEqual([]);

			const configuredDb = join(root, CUSTOM_DB);
			const defaultDb = join(root, ".afol", "state", "evolution.db");

			// The canonical observation journal lives in the configured events dir.
			const events = readObservationJournal(
				root,
				PROJECT_ID,
				CUSTOM_EVENTS_DIR,
			);
			expect(events).toHaveLength(1);
			expect(events[0]?.event_type).toBe("observation");
			expect(events[0]?.payload.project_id).toBe(PROJECT_ID);

			// Ingest must project into the configured db, not the default path.
			expect(existsSync(configuredDb)).toBe(true);
			expect(existsSync(defaultDb)).toBe(false);
			expect(observationRows(configuredDb)).toBe(1);

			// Production-day allocation respects the configured events dir and
			// the configured timezone: 2026-07-20T18:30Z is 2026-07-21 in Taipei.
			const productionDays = readProductionDayJournal(
				root,
				PROJECT_ID,
				TIMEZONE,
				CUSTOM_EVENTS_DIR,
			);
			expect(productionDays).toHaveLength(1);
			expect(productionDays[0]?.payload.timezone).toBe(TIMEZONE);
			expect(productionDays[0]?.payload.local_date).toBe("2026-07-21");

			const db = new Database(configuredDb, { readonly: true });
			let day: unknown;
			try {
				day = db
					.query(
						"SELECT local_date, ordinal_sequence FROM production_days WHERE project_id = ?",
					)
					.get(PROJECT_ID);
			} finally {
				db.close();
			}
			expect(day).toEqual({ local_date: "2026-07-21", ordinal_sequence: 1 });

			// Repair resolves the same configured paths and confirms the state
			// ingest left behind without rebuilding anything.
			const first = repairEvolutionDerivedState({
				root,
				projectId: PROJECT_ID,
			});
			expect(first.db_path).toBe(evolutionDbPath(root, CUSTOM_DB));
			expect(first.observation_events).toBe(1);
			expect(first.production_projection_rebuilt).toBe(false);
			expect(first.observation_projection_rebuilt).toBe(false);
			expect(first.changed).toBe(false);

			const checkpointCount = checkpointLines(root);
			const second = repairEvolutionDerivedState({
				root,
				projectId: PROJECT_ID,
			});
			expect(second.changed).toBe(false);
			expect(checkpointLines(root)).toBe(checkpointCount);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
