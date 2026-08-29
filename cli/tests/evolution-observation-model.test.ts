import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	applyMigrations,
	EVOLUTION_MIGRATIONS,
	EVOLUTION_SCHEMA_VERSION,
} from "../services/evolution/migrations";
import {
	comparableCohort,
	compareScorecards,
	deriveRecurrenceDecision,
	normalizeObservation,
	normalizeObservationRecord,
	observationFingerprint,
	projectObservation,
	projectObservations,
} from "../services/evolution/observation-model";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const lower = (value: number | null) => ({ value, better: "lower" as const });
const higher = (value: number | null) => ({ value, better: "higher" as const });

function observation(id: string, sessionId: string, day: number) {
	return normalizeObservationRecord({
		projectId: PROJECT_ID,
		id,
		kind: "failure",
		sessionId,
		productionDaySequence: day,
		taskType: "validation",
		impact: "regression",
		createdAt: `2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`,
		journalEventId: `J-${id}`,
		sourceRefs: [{ id: `E-${id}`, kind: "evidence" }],
		errorCode: "E_FAIL",
		test: "bun test cli/tests/example.test.ts",
		command: "OPENAI_API_KEY=sk-secret-value bun test",
		pathModule: "cli\\services\\example.ts",
		operation: "run",
		workflowStep: "verify",
		stackDigest: "STACK-1",
		provider: "codex",
	});
}

describe("evolution observation model", () => {
	test("pins the release checksum for migration v9", () => {
		expect(EVOLUTION_MIGRATIONS.find(({ version }) => version === 9)).toEqual({
			version: 9,
			checksum:
				"98d222b4f763eee60c0b63a838212a02dfa66bf8bccf9e4b7f97cf0cfd7bb1ad",
		});
	});

	test("pins the release checksum for migration v10", () => {
		expect(EVOLUTION_MIGRATIONS.find(({ version }) => version === 10)).toEqual({
			version: 10,
			checksum:
				"70b7d4b60d7a759cc00251a6b983260a694405753052f238805a97cb5a6276b9",
		});
	});

	test("pins v10 projection index definitions and retires superseded indexes", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db, 9);
			applyMigrations(db, 10);

			const indexes = db
				.query(
					"SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name IN ('observations_suggestion_tail_idx', 'recurrence_decisions_project_fingerprint_idx', 'issue_clusters_active_suggestion_idx') ORDER BY name",
				)
				.all() as Array<{ name: string; sql: string }>;
			expect(indexes.map(({ name }) => name)).toEqual([
				"issue_clusters_active_suggestion_idx",
				"observations_suggestion_tail_idx",
				"recurrence_decisions_project_fingerprint_idx",
			]);

			const normalizedSql = new Map(
				indexes.map(({ name, sql }) => [
					name,
					sql.replace(/\s+/g, " ").trim().toLowerCase(),
				]),
			);
			expect(normalizedSql.get("observations_suggestion_tail_idx")).toBe(
				"create index observations_suggestion_tail_idx on observations(project_id,fingerprint_version,fingerprint,journal_sequence desc,id desc)",
			);
			expect(
				normalizedSql.get("recurrence_decisions_project_fingerprint_idx"),
			).toBe(
				"create index recurrence_decisions_project_fingerprint_idx on recurrence_decisions(project_id,fingerprint_version,fingerprint,journal_sequence)",
			);
			expect(normalizedSql.get("issue_clusters_active_suggestion_idx")).toBe(
				"create index issue_clusters_active_suggestion_idx on issue_clusters(project_id,priority desc,occurrence_count desc,fingerprint) where state in ('observed', 'candidate', 'recurring', 'reopened')",
			);

			const indexColumns = (name: string) =>
				(
					db.query(`PRAGMA index_info(${name})`).all() as Array<{
						name: string;
					}>
				).map(({ name: column }) => column);
			expect(indexColumns("observations_suggestion_tail_idx")).toEqual([
				"project_id",
				"fingerprint_version",
				"fingerprint",
				"journal_sequence",
				"id",
			]);
			expect(
				indexColumns("recurrence_decisions_project_fingerprint_idx"),
			).toEqual([
				"project_id",
				"fingerprint_version",
				"fingerprint",
				"journal_sequence",
			]);
			expect(indexColumns("issue_clusters_active_suggestion_idx")).toEqual([
				"project_id",
				"priority",
				"occurrence_count",
				"fingerprint",
			]);

			expect(
				db
					.query(
						"SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('observations_project_fingerprint_idx', 'issue_clusters_project_state_idx') ORDER BY name",
					)
					.all(),
			).toEqual([]);
		} finally {
			db.close();
		}
	});

	test("upgrades an existing v3 observation projection without checksum drift", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db, 3);
			db.query(
				`INSERT INTO observations(project_id,id,fingerprint,fingerprint_version,occurrence_identity,session_id,production_day_sequence,task_type,impact,normalized_fields,source_refs,created_at,journal_event_id)
				VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			).run(
				PROJECT_ID,
				"O-v3",
				"fingerprint-v3",
				1,
				"occurrence-v3",
				"S-v3",
				0,
				"validation",
				"failed operation",
				JSON.stringify({ kind: "tool_failure" }),
				JSON.stringify([{ id: "E-v3", kind: "evidence" }]),
				"2026-07-17T00:00:00.000Z",
				"EV-v3",
			);
			expect(
				(db.query("PRAGMA user_version").get() as { user_version: number })
					.user_version,
			).toBe(3);
			applyMigrations(db);
			expect(
				(db.query("PRAGMA user_version").get() as { user_version: number })
					.user_version,
			).toBe(EVOLUTION_SCHEMA_VERSION);
			expect(
				db
					.query(
						"SELECT kind, journal_sequence FROM observations WHERE id = 'O-v3'",
					)
					.get(),
			).toEqual({ kind: "tool_failure", journal_sequence: 1 });
			expect(
				db.query("SELECT COUNT(*) AS count FROM recurrence_decisions").get(),
			).toEqual({ count: 0 });
		} finally {
			db.close();
		}
	});

	test("preserves legacy v3 observations that shared a journal event id", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db, 3);
			const insert = db.query(
				`INSERT INTO observations(project_id,id,fingerprint,fingerprint_version,occurrence_identity,session_id,production_day_sequence,task_type,impact,normalized_fields,source_refs,created_at,journal_event_id)
				 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			);
			for (const id of ["O-v3-a", "O-v3-b"])
				insert.run(
					PROJECT_ID,
					id,
					`fingerprint-${id}`,
					1,
					`occurrence-${id}`,
					`S-${id}`,
					0,
					"validation",
					"failed operation",
					JSON.stringify({ kind: "tool_failure" }),
					JSON.stringify([{ id: `E-${id}`, kind: "evidence" }]),
					"2026-07-17T00:00:00.000Z",
					"EV-shared-v3",
				);
			applyMigrations(db);
			expect(
				db.query("SELECT COUNT(*) AS count FROM observations").get(),
			).toEqual({ count: 2 });
			db.query("DELETE FROM observations").run();
			expect(
				db
					.query("SELECT COUNT(*) AS count FROM observation_legacy_archive")
					.get(),
			).toEqual({ count: 2 });
		} finally {
			db.close();
		}
	});

	test("preserves v8 projection rows through the v9 and v10 fingerprint upgrade", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db, 8);
			db.prepare(
				`INSERT INTO observations(project_id,id,kind,fingerprint,fingerprint_version,occurrence_identity,session_id,production_day_sequence,task_type,impact,normalized_fields,source_refs,created_at,journal_sequence,journal_event_id)
				 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			).run(
				PROJECT_ID,
				"O-v8",
				"failure",
				"fingerprint-v8",
				1,
				"occurrence-v8",
				"S-v8",
				1,
				"validation",
				"regression",
				'{"kind":"failure"}',
				"[]",
				"2026-07-17T00:00:00.000Z",
				1,
				"J-v8",
			);
			db.prepare(
				`INSERT INTO recurrence_decisions(project_id,id,fingerprint_version,fingerprint,action,observation_ids,observation_membership_digest,source_decision_ref,decision_digest,source_refs,created_at,journal_sequence,journal_event_id)
				 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			).run(
				PROJECT_ID,
				"R-v8",
				1,
				"fingerprint-v8",
				"confirm",
				'["O-v8"]',
				"membership-v8",
				"source-v8",
				"decision-v8",
				"[]",
				"2026-07-17T00:00:00.000Z",
				1,
				"J-decision-v8",
			);
			db.prepare(
				`INSERT INTO issue_clusters(project_id,fingerprint_version,fingerprint,state,occurrence_count,distinct_session_count,distinct_production_day_count,user_confirmed_recurrence,first_seen_at,last_seen_at,priority,source_refs,updated_at,journal_event_id)
				 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			).run(
				PROJECT_ID,
				1,
				"fingerprint-v8",
				"recurring",
				1,
				1,
				1,
				1,
				"2026-07-17T00:00:00.000Z",
				"2026-07-17T00:00:00.000Z",
				1,
				"[]",
				"2026-07-17T00:00:00.000Z",
				"J-cluster-v8",
			);
			applyMigrations(db);
			expect(
				db
					.query(
						"SELECT fingerprint_version, kind, journal_sequence FROM observations",
					)
					.get(),
			).toEqual({
				fingerprint_version: 1,
				kind: "failure",
				journal_sequence: 1,
			});
			expect(
				db
					.query(
						"SELECT fingerprint_version, action, journal_sequence FROM recurrence_decisions",
					)
					.get(),
			).toEqual({
				fingerprint_version: 1,
				action: "confirm",
				journal_sequence: 1,
			});
			expect(
				db
					.query(
						"SELECT fingerprint_version, state, priority FROM issue_clusters",
					)
					.get(),
			).toEqual({ fingerprint_version: 1, state: "recurring", priority: 1 });
		} finally {
			db.close();
		}
	});

	test("retains SQLite projection constraints while allowing fingerprint versions one and two", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db);
			expect(() =>
				db.exec(
					"INSERT INTO observations(project_id,id,kind,fingerprint,fingerprint_version,occurrence_identity,session_id,production_day_sequence,task_type,impact,normalized_fields,source_refs,created_at,journal_sequence,journal_event_id) VALUES ('p','bad-observation','','f',2,'o','s',0,'t','i','{}','[]','now',1,'j')",
				),
			).toThrow();
			expect(() =>
				db.exec(
					"INSERT INTO recurrence_decisions(project_id,id,fingerprint_version,fingerprint,action,observation_ids,observation_membership_digest,source_decision_ref,decision_digest,source_refs,created_at,journal_sequence,journal_event_id) VALUES ('p','bad-decision',2,'f','invalid','[]','membership','source','decision','[]','now',1,'j')",
				),
			).toThrow();
			expect(() =>
				db.exec(
					"INSERT INTO issue_clusters(project_id,fingerprint_version,fingerprint,state,occurrence_count,distinct_session_count,distinct_production_day_count,user_confirmed_recurrence,first_seen_at,last_seen_at,priority,source_refs,updated_at,journal_event_id) VALUES ('p',2,'f','recurring',-1,0,0,0,'now','now',0,'[]','now','j')",
				),
			).toThrow();
		} finally {
			db.close();
		}
	});

	test("adds current observation projections without scorecard tables", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db);
			expect(EVOLUTION_SCHEMA_VERSION).toBe(10);
			expect(
				db
					.query(
						"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('observations','recurrence_decisions','issue_clusters','scorecards') ORDER BY name",
					)
					.all(),
			).toEqual([
				{ name: "issue_clusters" },
				{ name: "observations" },
				{ name: "recurrence_decisions" },
			]);
		} finally {
			db.close();
		}
	});

	test("normalizes and redacts fingerprint fields deterministically", () => {
		const first = observation("O-1", "S-1", 1);
		const equivalent = normalizeObservation({
			id: "equivalent",
			kind: "failure",
			command: "  OPENAI_API_KEY=sk-other-secret bun   test  ",
			errorCode: "E_FAIL",
			test: "bun test cli/tests/example.test.ts",
			pathModule: "cli\\services\\example.ts",
			operation: "run",
			workflowStep: "verify",
			stackDigest: "STACK-1",
			provider: "codex",
		});
		expect(first.normalized_fields.command).toBe(
			"openai_api_key=<redacted> bun test",
		);
		expect(first.normalized_fields.path_module).toBe("cli/services/example.ts");
		expect(first.fingerprint).toBe(observationFingerprint(equivalent));
		expect(first.occurrence_identity).not.toBe(
			normalizeObservationRecord({
				...first,
				id: "O-2",
				journal_event_id: "J-O-2",
			}).occurrence_identity,
		);
		expect(
			normalizeObservationRecord({
				...first,
				journal_event_id: "J-replay",
			}).occurrence_identity,
		).toBe(first.occurrence_identity);
		expect(observationFingerprint(first.normalized_fields)).toBe(
			first.fingerprint,
		);
	});

	test("redacts bearer, separated flags, and sensitive URL query values", () => {
		const normalized = normalizeObservation({
			id: "O-redaction",
			errorCode: ["Authorization:", "Bearer", "REDACTION_CANARY_123456"].join(
				" ",
			),
			command:
				"tool --token REDACTION_CANARY_234567 https://example.invalid/?api_key=REDACTION_CANARY_345678",
		});
		const serialized = JSON.stringify(normalized);
		expect(serialized).not.toContain("redaction_canary");
		expect(normalized.error_code).toBe("authorization=<redacted>");
		expect(normalized.command).toContain("--token <redacted>");
		expect(normalized.command).toContain("api_key=<redacted>");
	});

	test("derives observed, candidate, and exact 3/2/2 recurring states", () => {
		const one = observation("O-1", "S-1", 1);
		const two = observation("O-2", "S-2", 1);
		const three = observation("O-3", "S-2", 2);
		expect(deriveRecurrenceDecision([one]).state).toBe("observed");
		expect(deriveRecurrenceDecision([one, two]).state).toBe("candidate");
		expect(
			deriveRecurrenceDecision([one, two], false, {
				minimum_occurrences: 2,
				minimum_distinct_sessions: 2,
				minimum_distinct_production_days: 1,
			}).state,
		).toBe("recurring");
		expect(deriveRecurrenceDecision([one, two, three])).toMatchObject({
			state: "recurring",
			occurrence_count: 3,
			distinct_session_count: 2,
			distinct_production_day_count: 2,
		});
		expect(deriveRecurrenceDecision([one], true).state).toBe("recurring");
		expect(
			deriveRecurrenceDecision([
				{ ...one, production_day_sequence: 0 },
				{ ...two, production_day_sequence: 0 },
				{ ...three, production_day_sequence: 1 },
			]).state,
		).toBe("candidate");
	});

	test("projects observations idempotently and keeps scorecard dimensions independent", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db);
			const row = observation("O-1", "S-1", 1);
			projectObservation(db, row);
			projectObservation(db, row);
			expect(() =>
				projectObservation(db, { ...row, impact: "different" }),
			).toThrow("different content");
			expect(projectObservations(db, PROJECT_ID)).toHaveLength(1);
			const cohort = comparableCohort([row], "validation");
			expect(
				compareScorecards(
					{
						rework: { issues: lower(1) },
						regressions: { failures: lower(0) },
						user_load: { interventions: lower(1) },
						outcome: { quality: higher(1) },
						efficiency: { duration: lower(2) },
					},
					{
						rework: { issues: lower(0) },
						regressions: { failures: lower(0) },
						user_load: { interventions: lower(1) },
						outcome: { quality: higher(1) },
						efficiency: { duration: lower(1) },
					},
					cohort,
				).comparable,
			).toBe(false);
			const enough = comparableCohort(
				[
					row,
					{ ...row, id: "O-2", production_day_sequence: 2 },
					{ ...row, id: "O-3", production_day_sequence: 3 },
				],
				"validation",
			);
			expect(
				compareScorecards(
					{
						rework: { issues: lower(1) },
						regressions: { failures: lower(0) },
						user_load: { interventions: lower(1) },
						outcome: { quality: higher(1) },
						efficiency: { duration: lower(2) },
					},
					{
						rework: { issues: lower(1) },
						regressions: { failures: lower(0) },
						user_load: { interventions: lower(1) },
						outcome: { quality: higher(1) },
						efficiency: { duration: lower(1) },
					},
					enough,
				).accepted,
			).toBe(true);
			expect(
				compareScorecards(
					{
						rework: { issues: lower(1) },
						regressions: { failures: lower(0) },
						user_load: { interventions: lower(1) },
						outcome: { quality: higher(1) },
						efficiency: { duration: lower(2) },
					},
					{
						rework: { issues: lower(0) },
						regressions: { failures: lower(0) },
						user_load: { interventions: lower(1) },
						outcome: { quality: higher(1) },
						efficiency: { duration: lower(2) },
					},
					enough,
				).accepted,
			).toBe(true);
			expect(
				compareScorecards(
					{
						rework: { issues: lower(1) },
						regressions: { failures: lower(0) },
						user_load: { interventions: lower(1) },
						outcome: { quality: higher(1) },
						efficiency: { duration: lower(2) },
					},
					{
						rework: { issues: lower(2) },
						regressions: { failures: lower(0) },
						user_load: { interventions: lower(1) },
						outcome: { quality: higher(1) },
						efficiency: { duration: lower(1) },
					},
					enough,
				).accepted,
			).toBe(false);
		} finally {
			db.close();
		}
	});
});
