import { describe, expect, test } from "bun:test";
import {
	appendFileSync,
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
	normalizeObservationRecord,
	openEvolutionDb,
	previewEvolutionDerivedState,
	repairEvolutionDerivedState,
} from "../services/evolution";
import { appendObservationJournalEvent } from "../services/evolution/observation-journal";
import {
	acknowledgeDailySuggestion,
	claimDailySuggestion,
} from "../services/evolution/suggestion-journal";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const DIGEST = "a".repeat(64);

function configure(root: string): void {
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: PROJECT_ID, name: "repair-fixture", timezone: "UTC" },
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
}

describe("evolution derived-state repair", () => {
	test("preview is read-only and repair replays canonical projections idempotently", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-derived-repair-"));
		configure(root);
		const observation = normalizeObservationRecord({
			project_id: PROJECT_ID,
			id: "O-1",
			kind: "tool_failure",
			session_id: "S-1",
			production_day_sequence: 0,
			task_type: "repair",
			impact: "rework",
			created_at: "2026-07-17T12:00:00.000Z",
			journal_event_id: "J-1",
			source_refs: [{ id: "E-1", kind: "evidence" }],
			command: "bun test",
		});
		try {
			const preview = previewEvolutionDerivedState({ root });
			expect(preview.mode).toBe("preview");
			expect(existsSync(evolutionDbPath(root))).toBe(false);

			const db = openEvolutionDb(evolutionDbPath(root));
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation,
			});
			const claim = claimDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				suggestionId: "SUG-1",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:01:00.000Z"),
			});
			acknowledgeDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				suggestionId: "SUG-1",
				claimedBy: "codex",
				claimToken: claim.claim_token,
				generation: claim.generation,
				evidenceDigest: DIGEST,
				action: "shown",
				now: new Date("2026-07-17T12:01:01.000Z"),
			});
			db.exec(
				"UPDATE observations SET impact = 'tampered'; UPDATE daily_suggestion_receipts SET suggestion_id = 'tampered'",
			);
			db.close();

			const repaired = repairEvolutionDerivedState({ root });
			expect(repaired.changed).toBe(true);
			expect(repaired.observation_projection_rebuilt).toBe(true);
			expect(repaired.receipt_projection_rebuilt).toBe(true);
			const checkpointPath = join(
				root,
				".afol/data/events/evolution/projection-checkpoints.jsonl",
			);
			const checkpointCount = readFileSync(checkpointPath, "utf8")
				.trim()
				.split("\n").length;
			const second = repairEvolutionDerivedState({ root });
			expect(second.changed).toBe(false);
			expect(
				readFileSync(checkpointPath, "utf8").trim().split("\n").length,
			).toBe(checkpointCount);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("explicit repair removes only a torn checkpoint tail", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-checkpoint-tail-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: normalizeObservationRecord({
					project_id: PROJECT_ID,
					id: "O-tail",
					kind: "tool_failure",
					session_id: "S-tail",
					production_day_sequence: 0,
					task_type: "repair",
					impact: "rework",
					created_at: "2026-07-17T12:00:00.000Z",
					journal_event_id: "J-tail",
					source_refs: [{ id: "E-tail", kind: "evidence" }],
				}),
			});
		} finally {
			db.close();
		}
		try {
			const checkpointPath = join(
				root,
				".afol/data/events/evolution/projection-checkpoints.jsonl",
			);
			appendFileSync(checkpointPath, '{"sequence":');
			const repaired = repairEvolutionDerivedState({ root });
			expect(repaired.changed).toBe(true);
			expect(repaired.checkpoint_tail_repaired).toBe(true);
			expect(readFileSync(checkpointPath, "utf8").endsWith("\n")).toBeTrue();
			expect(repairEvolutionDerivedState({ root }).changed).toBe(false);
			appendFileSync(checkpointPath, '{"invalid":true}\n');
			const invalidCheckpoint = readFileSync(checkpointPath, "utf8");
			expect(() => repairEvolutionDerivedState({ root })).toThrow(
				/checkpoint (?:chain|digest)/,
			);
			expect(readFileSync(checkpointPath, "utf8")).toBe(invalidCheckpoint);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("repair preserves foreign-project production and receipt rows", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-derived-foreign-"));
		configure(root);
		const foreignProject = "foreign-project";
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			db.query(
				"INSERT INTO evolution_metadata(key,value) VALUES ('project_id',?)",
			).run(PROJECT_ID);
			db.query(
				"INSERT INTO production_days(project_id,local_date,ordinal_sequence,ordinal,created_at,qualifying_events,journal_event_id) VALUES (?,?,?,?,?,?,?)",
			).run(
				foreignProject,
				"2026-07-17",
				99,
				"PD-0099",
				"2026-07-17T12:00:00.000Z",
				JSON.stringify(["foreign-evidence"]),
				"FOREIGN-PD",
			);
			db.query(
				"INSERT INTO daily_suggestion_receipts(project_id,local_date,suggestion_id,receipt_status,claimed_by,claim_token_digest,generation,claim_expires_at,reject_reason,evidence_digest,journal_sequence,journal_event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
			).run(
				foreignProject,
				"2026-07-17",
				"SUG-foreign",
				"shown",
				"codex",
				"a".repeat(64),
				1,
				"2026-07-17T12:05:00.000Z",
				null,
				"b".repeat(64),
				1,
				"FOREIGN-REC",
			);
			db.close();

			repairEvolutionDerivedState({ root });

			const checked = openEvolutionDb(evolutionDbPath(root));
			try {
				expect(
					checked
						.query("SELECT ordinal FROM production_days WHERE project_id = ?")
						.get(foreignProject),
				).toEqual({ ordinal: "PD-0099" });
				expect(
					checked
						.query(
							"SELECT suggestion_id FROM daily_suggestion_receipts WHERE project_id = ?",
						)
						.get(foreignProject),
				).toEqual({ suggestion_id: "SUG-foreign" });
			} finally {
				checked.close();
			}
		} finally {
			try {
				db.close();
			} catch {}
			removeEvolutionTestRoot(root);
		}
	});
});
