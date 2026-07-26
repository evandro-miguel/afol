import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	applyMigrations,
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
			).toBe(7);
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

	test("adds current observation projections without scorecard tables", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db);
			expect(EVOLUTION_SCHEMA_VERSION).toBe(7);
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
			errorCode: "Authorization: Bearer REDACTION_CANARY_123456",
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
