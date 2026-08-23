import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import { defaultOperationContext } from "../core/operation-context";
import {
	appendProductionDayAllocation,
	applyMigrations,
	buildSuggestionCandidate,
	deriveSuggestionCandidates,
	evolutionDbPath,
	normalizeObservationRecord,
	openEvolutionDb,
	previewDailySuggestion,
	readSuggestionReceiptJournal,
	validateSuggestionReceiptProjection,
} from "../services/evolution";
import { appendObservationJournalEvent } from "../services/evolution/observation-journal";
import { projectionCheckpointPath } from "../services/evolution/projection-checkpoint";
import { dispatchSuggestionDecision } from "../services/evolution/suggestion-authority";
import {
	acknowledgeDailySuggestion,
	claimDailySuggestion,
} from "../services/evolution/suggestion-journal";
import {
	applyRejectionNegativeEvidence,
	suggestionClusterKey,
} from "../services/evolution/suggestion-model";
import { readActiveSuggestionProjection } from "../services/evolution/suggestion-projection";
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

function observations(kind = "tool_failure") {
	return [1, 2, 3].map((index) =>
		normalizeObservationRecord({
			project_id: PROJECT_ID,
			id: `O-${index}`,
			kind,
			session_id: `S-${index % 2}`,
			production_day_sequence: index,
			task_type: "bug-fix",
			impact: "rework",
			created_at: `2026-07-1${index}T12:00:00.000Z`,
			journal_event_id: `J-${index}`,
			source_refs: [{ id: `E-${index}`, kind: "evidence" }],
			command: "bun test",
		}),
	);
}

function seedCanonicalCandidate(root: string, db: Database): void {
	const sessionId = "S-production";
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	const evidence = [1, 2, 3].map((index) => ({
		id: `E-production-${index}`,
		project_id: PROJECT_ID,
		session_id: sessionId,
		created_at: `2026-07-1${index}T00:00:00.000Z`,
		result: "passed",
		provenance: "observed",
		exit_code: 0,
	}));
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${evidence.map((row) => JSON.stringify(row)).join("\n")}\n`,
	);
	for (const row of evidence)
		appendProductionDayAllocation({
			root,
			db,
			projectId: PROJECT_ID,
			timezone: "UTC",
			sessionId,
			evidenceId: row.id,
		});
	for (const row of observations())
		appendObservationJournalEvent({
			root,
			db,
			projectId: PROJECT_ID,
			observation: row,
		});
}

describe("evolution suggestion model", () => {
	test("excludes v1 issue clusters from the active daily suggestion projection", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db);
			const fingerprint = "legacy-fingerprint";
			const insertObservation = db.prepare(
				`INSERT INTO observations(project_id,id,kind,fingerprint,fingerprint_version,occurrence_identity,session_id,production_day_sequence,task_type,impact,normalized_fields,source_refs,created_at,journal_sequence,journal_event_id)
				 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			);
			for (const index of [1, 2, 3])
				insertObservation.run(
					PROJECT_ID,
					`O-v1-${index}`,
					"workflow_friction",
					fingerprint,
					1,
					`occurrence-v1-${index}`,
					`S-v1-${index}`,
					index,
					"bug-fix",
					"rework",
					JSON.stringify({ kind: "workflow_friction", command: "bun test" }),
					JSON.stringify([{ id: `E-v1-${index}`, kind: "evidence" }]),
					`2026-07-1${index}T12:00:00.000Z`,
					index,
					`J-v1-${index}`,
				);
			db.prepare(
				`INSERT INTO issue_clusters(project_id,fingerprint_version,fingerprint,state,occurrence_count,distinct_session_count,distinct_production_day_count,user_confirmed_recurrence,first_seen_at,last_seen_at,priority,source_refs,updated_at,journal_event_id)
				 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			).run(
				PROJECT_ID,
				1,
				fingerprint,
				"recurring",
				3,
				3,
				3,
				0,
				"2026-07-11T12:00:00.000Z",
				"2026-07-13T12:00:00.000Z",
				1,
				JSON.stringify([{ id: "E-v1-cluster", kind: "evidence" }]),
				"2026-07-13T12:00:00.000Z",
				"J-v1-cluster",
			);
			const projection = readActiveSuggestionProjection(db, PROJECT_ID);
			expect(projection.clusters).toEqual([]);
			expect(projection.observations).toEqual([]);
			expect(projection.candidateIds).toEqual([]);
			expect(
				db
					.query(
						"SELECT COUNT(*) AS count FROM issue_clusters WHERE fingerprint_version = 1",
					)
					.get() as { count: number },
			).toEqual({ count: 1 });
		} finally {
			db.close();
		}
	});

	test("uses fingerprint version in deterministic suggestion identities", () => {
		const observation = observations()[0];
		if (!observation) throw new Error("fixture observation is required");
		const fingerprint = "shared-fingerprint";
		const baseCluster = {
			fingerprint,
			state: "recurring" as const,
			occurrence_count: 3,
			distinct_session_count: 2,
			distinct_production_day_count: 2,
			priority: 1,
		};
		const v1 = buildSuggestionCandidate({
			projectId: PROJECT_ID,
			localDate: "2026-07-13",
			cluster: { ...baseCluster, fingerprint_version: 1 },
			observations: [{ ...observation, fingerprint, fingerprint_version: 1 }],
		});
		const v2 = buildSuggestionCandidate({
			projectId: PROJECT_ID,
			localDate: "2026-07-13",
			cluster: { ...baseCluster, fingerprint_version: 2 },
			observations: [{ ...observation, fingerprint, fingerprint_version: 2 }],
		});
		expect(v1.id).not.toBe(v2.id);
		expect(
			buildSuggestionCandidate({
				projectId: PROJECT_ID,
				localDate: "2026-07-13",
				cluster: { ...baseCluster, fingerprint_version: 2 },
				observations: [{ ...observation, fingerprint, fingerprint_version: 2 }],
			}).id,
		).toBe(v2.id);
	});

	test("suggest is a no-write empty preview when no DB candidate exists", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-cli-empty-"));
		configure(root);
		try {
			const output: string[] = [];
			const exitCode = await runEvolveCommand(
				"suggest",
				["--first-session", "--json"],
				root,
				{ stdout: (value) => output.push(value), stderr: () => {} },
			);
			expect(exitCode).toBe(0);
			expect(output.join("\n")).toContain('"suggestion":null');
			expect(existsSync(join(root, ".afol", "data", "events"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("daily suggest claims and shows one DB-derived candidate", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-cli-show-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			seedCanonicalCandidate(root, db);
		} finally {
			db.close();
		}
		try {
			const output: string[] = [];
			const exitCode = await runEvolveCommand(
				"suggest",
				["--first-session", "--claimed-by", "codex", "--json"],
				root,
				{ stdout: (value) => output.push(value), stderr: () => {} },
			);
			expect(exitCode).toBe(0);
			expect(output.join("\n")).toContain('"suggestion"');
			expect(output.join("\n")).not.toContain("claim_token_digest");
			expect(output.join("\n")).not.toContain("evidence_digest");
			expect(previewDailySuggestion(root).daily_status).toBe("shown");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("preview fails closed when an active cluster or observation projection is changed", () => {
		for (const target of ["cluster", "observation"] as const) {
			const root = mkdtempSync(join(tmpdir(), `evolution-active-${target}-`));
			configure(root);
			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				seedCanonicalCandidate(root, db);
				expect(previewDailySuggestion(root).daily_status).toBe("available");
				if (target === "cluster")
					db.exec("UPDATE issue_clusters SET priority = priority + 1");
				else db.exec("UPDATE observations SET impact = 'regression'");
				expect(() => previewDailySuggestion(root)).toThrow(
					"evolution active projection differs from checkpoint",
				);
			} finally {
				db.close();
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("preview fails closed when the current shown receipt is deleted", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-active-receipt-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			seedCanonicalCandidate(root, db);
		} finally {
			db.close();
		}
		try {
			expect(
				await runEvolveCommand("suggest", ["--first-session", "--json"], root, {
					stdout: () => {},
					stderr: () => {},
				}),
			).toBe(0);
			const tampered = openEvolutionDb(evolutionDbPath(root));
			try {
				tampered.exec("DELETE FROM daily_suggestion_receipts");
			} finally {
				tampered.close();
			}
			expect(() => previewDailySuggestion(root)).toThrow(
				"evolution active projection differs from checkpoint",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("preview rejects a modified canonical projection checkpoint", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-checkpoint-tamper-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			seedCanonicalCandidate(root, db);
		} finally {
			db.close();
		}
		try {
			const path = projectionCheckpointPath(root);
			const rows = readFileSync(path, "utf8").trimEnd().split("\n");
			const latest = JSON.parse(rows.at(-1) ?? "{}") as Record<string, unknown>;
			latest.active_projection_digest = "0".repeat(64);
			rows[rows.length - 1] = JSON.stringify(latest);
			writeFileSync(path, `${rows.join("\n")}\n`);
			expect(() => previewDailySuggestion(root)).toThrow(
				"evolution projection checkpoint digest is invalid",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("mutating suggest repairs a missing checkpoint while preview stays read-only", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-checkpoint-repair-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			seedCanonicalCandidate(root, db);
		} finally {
			db.close();
		}
		try {
			const path = projectionCheckpointPath(root);
			unlinkSync(path);
			expect(() => previewDailySuggestion(root)).toThrow(
				"evolution projection checkpoint is missing",
			);
			expect(existsSync(path)).toBeFalse();
			expect(
				await runEvolveCommand("suggest", ["--first-session", "--json"], root, {
					stdout: () => {},
					stderr: () => {},
				}),
			).toBe(0);
			expect(existsSync(path)).toBeTrue();
			expect(previewDailySuggestion(root).daily_status).toBe("shown");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("mutating suggest upgrades a populated v4 projection", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-v4-repair-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			seedCanonicalCandidate(root, db);
			db.exec(`
				DROP TABLE daily_suggestion_receipts;
				DELETE FROM evolution_migrations WHERE version > 4;
				PRAGMA user_version = 4;
			`);
		} finally {
			db.close();
		}
		try {
			expect(
				await runEvolveCommand("suggest", ["--first-session", "--json"], root, {
					stdout: () => {},
					stderr: () => {},
				}),
			).toBe(0);
			const upgraded = openEvolutionDb(evolutionDbPath(root));
			try {
				expect(
					(
						upgraded.query("PRAGMA user_version").get() as {
							user_version: number;
						}
					).user_version,
				).toBe(10);
			} finally {
				upgraded.close();
			}
			expect(previewDailySuggestion(root).daily_status).toBe("shown");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("mutating suggest repairs a journal-ahead crash without duplicating the claim", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-journal-ahead-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			seedCanonicalCandidate(root, db);
		} finally {
			db.close();
		}
		const now = new Date("2026-07-18T12:00:00.000Z");
		try {
			claimDailySuggestion({
				root,
				projectId: PROJECT_ID,
				localDate: "2026-07-18",
				suggestionId: "SUG-crash",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now,
			});
			expect(
				await runEvolveCommand(
					"suggest",
					["--first-session", "--json"],
					root,
					{ stdout: () => {}, stderr: () => {} },
					defaultOperationContext(),
					now,
				),
			).toBe(0);
			const repaired = openEvolutionDb(evolutionDbPath(root));
			try {
				expect(
					repaired
						.query(
							"SELECT COUNT(*) AS count FROM daily_suggestion_receipts WHERE project_id = ? AND local_date = ? AND receipt_status = 'claimed'",
						)
						.get(PROJECT_ID, "2026-07-18"),
				).toEqual({ count: 1 });
			} finally {
				repaired.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("upgrades a v4 database with only the receipt projection", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db, 4);
			expect(
				db
					.query(
						"SELECT name FROM sqlite_master WHERE type='table' AND name='daily_suggestion_receipts'",
					)
					.get(),
			).toBeNull();
			applyMigrations(db);
			expect(
				db
					.query(
						"SELECT name FROM sqlite_master WHERE type='table' AND name='daily_suggestion_receipts'",
					)
					.get(),
			).toEqual({ name: "daily_suggestion_receipts" });
		} finally {
			db.close();
		}
	});

	test("daily suggestion lookups use bounded projection indexes", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db);
			const plans = [
				db
					.query(
						`EXPLAIN QUERY PLAN SELECT fingerprint FROM issue_clusters
						 WHERE project_id = ? AND state IN ('observed','candidate','recurring','reopened')
						 ORDER BY priority DESC,occurrence_count DESC,fingerprint LIMIT 256`,
					)
					.all(PROJECT_ID),
				db
					.query(
						`EXPLAIN QUERY PLAN SELECT * FROM observations
						 WHERE project_id = ? AND fingerprint_version = ? AND fingerprint = ?
						 ORDER BY journal_sequence DESC,id DESC LIMIT 8`,
					)
					.all(PROJECT_ID, 1, "fingerprint"),
				db
					.query(
						`EXPLAIN QUERY PLAN SELECT * FROM daily_suggestion_receipts
						 WHERE project_id = ? AND suggestion_id = ? AND receipt_status = ?
						 ORDER BY local_date DESC,journal_sequence DESC LIMIT 32`,
					)
					.all(PROJECT_ID, "SUG-index", "rejected"),
			]
				.flat()
				.map((row) => String((row as { detail?: unknown }).detail));
			expect(plans.join("\n")).toContain(
				"issue_clusters_active_suggestion_idx",
			);
			expect(plans.join("\n")).toContain("observations_suggestion_tail_idx");
			expect(plans.join("\n")).toContain(
				"daily_suggestion_receipts_feedback_tail_idx",
			);
			expect(
				plans.some((detail) =>
					/SCAN (?:issue_clusters|observations|daily_suggestion_receipts)/.test(
						detail,
					),
				),
			).toBeFalse();
		} finally {
			db.close();
		}
	});
	test("ranks normal candidates, separates critical alerts, and suppresses identical rejection evidence", () => {
		const rows = observations();
		const first = rows[0];
		if (!first) throw new Error("missing fixture observation");
		const cluster = {
			fingerprint: first.fingerprint,
			state: "recurring" as const,
			occurrence_count: 3,
			distinct_session_count: 2,
			distinct_production_day_count: 3,
			priority: 2,
			source_refs: [],
		};
		const result = deriveSuggestionCandidates({
			projectId: PROJECT_ID,
			localDate: "2026-07-17",
			clusters: [cluster],
			observationsByFingerprint: new Map([
				[suggestionClusterKey(undefined, cluster.fingerprint), rows],
			]),
		});
		expect(result.suggestions).toHaveLength(1);
		expect(result.suggestions[0]).toMatchObject({
			pending_count: 0,
			critical: false,
		});
		const criticalRows = observations("integrity_error");
		const criticalFirst = criticalRows[0];
		if (!criticalFirst) throw new Error("missing critical fixture observation");
		const critical = buildSuggestionCandidate({
			projectId: PROJECT_ID,
			localDate: "2026-07-17",
			cluster: { ...cluster, fingerprint: criticalFirst.fingerprint },
			observations: criticalRows,
		});
		expect(critical.critical).toBe(true);
		expect(result.critical_alerts).toHaveLength(0);
	});

	test("splits a mixed-task fingerprint into deterministic task-scoped cohorts", () => {
		const rows = observations();
		const first = rows[0];
		if (!first) throw new Error("missing fixture observation");
		const mixed = rows.map((row, index) => ({
			...row,
			task_type: index === rows.length - 1 ? "documentation" : "bug-fix",
			source_refs: [{ id: `E-task-${index}`, kind: "evidence" }],
		}));
		const cluster = {
			fingerprint: first.fingerprint,
			state: "recurring" as const,
			occurrence_count: mixed.length,
			distinct_session_count: 2,
			distinct_production_day_count: 3,
			priority: 2,
			source_refs: [{ id: "E-mixed-cluster", kind: "evidence" }],
		};
		const result = deriveSuggestionCandidates({
			projectId: PROJECT_ID,
			localDate: "2026-07-17",
			clusters: [cluster],
			observationsByFingerprint: new Map([
				[suggestionClusterKey(undefined, cluster.fingerprint), mixed],
			]),
		});
		expect(result.suggestions).toHaveLength(2);
		expect(result.suggestions.map((candidate) => candidate.task_type)).toEqual([
			"bug-fix",
			"documentation",
		]);
		expect(
			new Set(result.suggestions.map((candidate) => candidate.id)).size,
		).toBe(2);
		expect(
			new Set(result.suggestions.map((candidate) => candidate.evidence_digest))
				.size,
		).toBe(2);
		for (const candidate of result.suggestions) {
			const cohort = mixed.filter(
				(observation) => observation.task_type === candidate.task_type,
			);
			expect(candidate.occurrence_count).toBe(cohort.length);
			expect(candidate.related_session_ids).toEqual(
				[
					...new Set(cohort.map((observation) => observation.session_id)),
				].sort(),
			);
			expect(candidate.validation).toContain(candidate.task_type);
			expect(candidate.recommendation).toContain(candidate.task_type);
			expect(candidate.source_refs).not.toContainEqual({
				id: "E-mixed-cluster",
				kind: "evidence",
			});
		}
	});

	test("surfaces observed and candidate critical clusters without recurrence gating", () => {
		const criticalRows = observations("integrity_error");
		const first = criticalRows[0];
		if (!first) throw new Error("missing critical fixture observation");
		const base = {
			fingerprint: first.fingerprint,
			occurrence_count: 1,
			distinct_session_count: 1,
			distinct_production_day_count: 1,
			priority: 1,
			source_refs: [],
		};
		for (const state of ["observed", "candidate"] as const) {
			const result = deriveSuggestionCandidates({
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				clusters: [{ ...base, state }],
				observationsByFingerprint: new Map([
					[suggestionClusterKey(undefined, first.fingerprint), criticalRows],
				]),
			});
			expect(result.suggestions).toHaveLength(0);
			expect(result.critical_alerts).toHaveLength(1);
			expect(result.critical_alerts[0]).toMatchObject({ critical: true });
		}
	});

	test("applies rejection evidence as a pure, auditable derived penalty", () => {
		const input = {
			base_score: 100,
			base_confidence: 0.9,
			rejected_receipt_count: 2,
		};
		const result = applyRejectionNegativeEvidence(input);
		expect(result).toMatchObject({
			base_score: 100,
			base_confidence: 0.9,
			rejected_receipt_count: 2,
			penalty_per_rejection: 0.1,
			score_penalty: 20,
			confidence_penalty: 0.2,
			score: 80,
			confidence: 0.7,
		});
		expect(input).toEqual({
			base_score: 100,
			base_confidence: 0.9,
			rejected_receipt_count: 2,
		});
		expect(result.reason).toContain("2 rejected receipt(s)");
		const unchanged = applyRejectionNegativeEvidence({
			base_score: 4,
			base_confidence: 0.5,
			rejected_receipt_count: 0,
		});
		expect(unchanged.score).toBe(4);
		expect(unchanged.confidence).toBe(0.5);
	});

	test("allows an authority-bound decision after shown without exposing the claim token", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-decision-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const now = new Date("2026-07-17T12:00:00.000Z");
			const claim = claimDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				suggestionId: "SUG-decision",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now,
			});
			acknowledgeDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				suggestionId: "SUG-decision",
				claimedBy: "codex",
				claimToken: claim.claim_token,
				generation: claim.generation,
				evidenceDigest: DIGEST,
				action: "shown",
				now: new Date("2026-07-17T12:00:01.000Z"),
			});
			const authority = dispatchSuggestionDecision({
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-decision",
				evidenceDigest: DIGEST,
				action: "skipped",
				sourceDecisionRef: "USER-skip",
				operationContext: defaultOperationContext(),
			});
			const decision = acknowledgeDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				suggestionId: "SUG-decision",
				claimedBy: "codex",
				generation: claim.generation,
				evidenceDigest: DIGEST,
				action: "skipped",
				authority,
				now: new Date("2026-07-17T13:00:00.000Z"),
			});
			expect(decision.action).toBe("skipped");
			expect(JSON.stringify(decision)).not.toContain(claim.claim_token);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});
});

describe("daily suggestion receipts", () => {
	test("CLI decision uses the shown receipt without exposing token or digest", async () => {
		const root = mkdtempSync(
			join(tmpdir(), "evolution-suggestion-cli-decision-"),
		);
		configure(root);
		try {
			const claim = claimDailySuggestion({
				root,
				projectId: PROJECT_ID,
				suggestionId: "SUG-cli",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				localDate: "2026-07-17",
				now: new Date("2026-07-17T12:00:00.000Z"),
			});
			acknowledgeDailySuggestion({
				root,
				projectId: PROJECT_ID,
				suggestionId: "SUG-cli",
				claimedBy: "codex",
				claimToken: claim.claim_token,
				generation: claim.generation,
				evidenceDigest: DIGEST,
				action: "shown",
				localDate: "2026-07-17",
				now: new Date("2026-07-17T12:00:01.000Z"),
			});
			const output: string[] = [];
			const exitCode = await runEvolveCommand(
				"skip",
				["SUG-cli", "--json"],
				root,
				{ stdout: (value) => output.push(value), stderr: () => {} },
				defaultOperationContext(),
				new Date("2026-07-17T12:00:02.000Z"),
			);
			expect(exitCode).toBe(0);
			expect(output.join("\n")).not.toContain(claim.claim_token);
			expect(output.join("\n")).not.toContain("claim_token_digest");
			expect(output.join("\n")).not.toContain("evidence_digest");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("deduplicates a day, fences stale tokens, and replays canonical journal", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-receipt-"));
		configure(root);
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			const claim = claimDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-1",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:00:00.000Z"),
			});
			expect(() =>
				claimDailySuggestion({
					root,
					projectId: PROJECT_ID,
					localDate: "2026-07-17",
					suggestionId: "SUG-1",
					claimedBy: "pi",
					evidenceDigest: DIGEST,
					now: new Date("2026-07-17T12:01:00.000Z"),
				}),
			).toThrow("active");
			acknowledgeDailySuggestion({
				root,
				db,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-1",
				claimedBy: "codex",
				claimToken: claim.claim_token,
				generation: claim.generation,
				evidenceDigest: DIGEST,
				action: "shown",
				now: new Date("2026-07-17T12:00:01.000Z"),
			});
			expect(() =>
				acknowledgeDailySuggestion({
					root,
					projectId: PROJECT_ID,
					localDate: "2026-07-17",
					suggestionId: "SUG-1",
					claimedBy: "codex",
					generation: claim.generation + 1,
					evidenceDigest: DIGEST,
					action: "accepted",
					authority: dispatchSuggestionDecision({
						projectId: PROJECT_ID,
						localDate: "2026-07-17",
						suggestionId: "SUG-1",
						evidenceDigest: DIGEST,
						action: "accepted",
						sourceDecisionRef: "D-1",
						operationContext: defaultOperationContext(),
					}),
					now: new Date("2026-07-17T12:00:02.000Z"),
				}),
			).toThrow("claim fence");
			validateSuggestionReceiptProjection({ root, projectId: PROJECT_ID, db });
			expect(readSuggestionReceiptJournal(root, PROJECT_ID)).toHaveLength(2);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects require a bounded reason and material evidence is caller-visible", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-suggestion-reject-"));
		configure(root);
		try {
			const claim = claimDailySuggestion({
				root,
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				suggestionId: "SUG-2",
				claimedBy: "codex",
				evidenceDigest: DIGEST,
				now: new Date("2026-07-17T12:00:00.000Z"),
			});
			expect(() =>
				acknowledgeDailySuggestion({
					root,
					projectId: PROJECT_ID,
					localDate: "2026-07-17",
					suggestionId: "SUG-2",
					claimedBy: "codex",
					claimToken: claim.claim_token,
					generation: claim.generation,
					evidenceDigest: DIGEST,
					action: "rejected",
					now: new Date("2026-07-17T12:00:01.000Z"),
				}),
			).toThrow("requires a reason");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
