import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution/db";
import {
	acknowledgeDailySuggestion,
	claimDailySuggestion,
	readSuggestionReceiptJournal,
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
}

describe("suggestion journal DB fast path", () => {
	test("advances the receipt projection without replaying the journal", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-fastpath-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const claim = claimDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-fast",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:00:00.000Z"),
			});
			expect(() =>
				acknowledgeDailySuggestion({
					root,
					db,
					projectId: PROJECT_ID,
					localDate: "2026-07-17",
					suggestionId: "SUG-fast",
					claimedBy: "codex",
					claimToken: claim.claim_token,
					generation: claim.generation,
					evidenceDigest: DIGEST,
					action: "shown",
					now: new Date("2026-07-17T11:59:59.000Z"),
				}),
			).toThrow("clock moved backwards");
			acknowledgeDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-fast",
				claimedBy: "codex",
				claimToken: claim.claim_token,
				generation: claim.generation,
				evidenceDigest: DIGEST,
				action: "shown",
				now: new Date("2026-07-17T12:00:01.000Z"),
			});
			expect(
				db
					.query(
						"SELECT receipt_status,journal_sequence FROM daily_suggestion_receipts WHERE project_id = ?",
					)
					.get(PROJECT_ID),
			).toMatchObject({ receipt_status: "shown", journal_sequence: 2 });
			expect(readSuggestionReceiptJournal(root, PROJECT_ID)).toHaveLength(2);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});
});
