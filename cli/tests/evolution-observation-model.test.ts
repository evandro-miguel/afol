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

function observation(id: string, sessionId: string, day: number) {
	return normalizeObservationRecord({
		projectId: PROJECT_ID,
		id,
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
	test("adds migration v3 projections without scorecard tables", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db);
			expect(EVOLUTION_SCHEMA_VERSION).toBe(3);
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
		expect(observationFingerprint(first.normalized_fields)).toBe(
			first.fingerprint,
		);
	});

	test("derives observed, candidate, and exact 3/2/2 recurring states", () => {
		const one = observation("O-1", "S-1", 1);
		const two = observation("O-2", "S-2", 1);
		const three = observation("O-3", "S-2", 2);
		expect(deriveRecurrenceDecision([one]).state).toBe("observed");
		expect(deriveRecurrenceDecision([one, two]).state).toBe("candidate");
		expect(deriveRecurrenceDecision([one, two, three])).toMatchObject({
			state: "recurring",
			occurrence_count: 3,
			distinct_session_count: 2,
			distinct_production_day_count: 2,
		});
		expect(deriveRecurrenceDecision([one], true).state).toBe("recurring");
	});

	test("projects observations idempotently and keeps scorecard dimensions independent", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db);
			const row = observation("O-1", "S-1", 1);
			projectObservation(db, row);
			projectObservation(db, row);
			expect(projectObservations(db, PROJECT_ID)).toHaveLength(1);
			const cohort = comparableCohort([row], "validation");
			expect(
				compareScorecards(
					{
						rework: 1,
						regressions: 0,
						user_load: 1,
						outcome: 1,
						efficiency: 1,
					},
					{
						rework: 0,
						regressions: 0,
						user_load: 1,
						outcome: 1,
						efficiency: 2,
					},
					cohort,
				).comparable,
			).toBe(false);
			const enough = comparableCohort(
				[row, { ...row, id: "O-2" }],
				"validation",
			);
			expect(
				compareScorecards(
					{
						rework: 1,
						regressions: 0,
						user_load: 1,
						outcome: 1,
						efficiency: 1,
					},
					{
						rework: 1,
						regressions: 0,
						user_load: 1,
						outcome: 1,
						efficiency: 2,
					},
					enough,
				).accepted,
			).toBe(true);
			expect(
				compareScorecards(
					{
						rework: 1,
						regressions: 0,
						user_load: 1,
						outcome: 1,
						efficiency: 1,
					},
					{
						rework: 2,
						regressions: 0,
						user_load: 1,
						outcome: 1,
						efficiency: 2,
					},
					enough,
				).accepted,
			).toBe(false);
		} finally {
			db.close();
		}
	});
});
