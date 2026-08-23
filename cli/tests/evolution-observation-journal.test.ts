import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultOperationContext } from "../core/operation-context";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution/db";
import { checkEvolutionDbHealth } from "../services/evolution/health";
import { appendProductionDayAllocation } from "../services/evolution/journal";
import {
	appendObservationJournalEvent,
	appendRecurrenceDecisionReceipt,
	observationJournalPath,
	readObservationJournal,
	rebuildObservationProjection,
	validateObservationProjection,
} from "../services/evolution/observation-journal";
import {
	normalizeObservationRecord,
	OBSERVATION_FINGERPRINT_VERSION,
} from "../services/evolution/observation-model";
import { writeEvolutionProjectionCheckpoint } from "../services/evolution/projection-checkpoint";
import { dispatchRecurrenceDecision } from "../services/evolution/recurrence-authority";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";

function observation(id: string, sessionId: string, day: number) {
	return normalizeObservationRecord({
		project_id: PROJECT_ID,
		id,
		kind: "test_failure",
		session_id: sessionId,
		production_day_sequence: day,
		task_type: "test",
		impact: "failed test",
		error_code: "E-REPEAT",
		test: "suite/a",
		command: "bun test",
		path_module: "cli/services/evolution",
		operation: "run",
		workflow_step: "verify",
		stack_digest: "stack-a",
		provider: "codex",
		created_at: `2026-07-${String(10 + day).padStart(2, "0")}T00:00:00.000Z`,
		journal_event_id: `OBS-${id}`,
		source_refs: [{ id: `E-${id}`, kind: "evidence" }],
	});
}

function setup(timezone = "UTC") {
	const root = mkdtempSync(join(tmpdir(), "evolution-observation-journal-"));
	const db = openEvolutionDb(evolutionDbPath(root));
	const sessionId = "S-production";
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	const evidence = [1, 2].map((day) => ({
		id: `E-production-${day}`,
		project_id: PROJECT_ID,
		session_id: sessionId,
		created_at: `2026-07-${String(10 + day).padStart(2, "0")}T00:00:00.000Z`,
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
			timezone,
			sessionId,
			evidenceId: row.id,
		});
	return { root, db };
}

function configureEvolution(
	root: string,
	timezone: string,
	thresholds: {
		minimum_occurrences: number;
		minimum_distinct_sessions: number;
		minimum_distinct_production_days: number;
	},
): void {
	const source = JSON.parse(
		readFileSync(
			join(
				import.meta.dir,
				"..",
				"..",
				"src",
				"project-template",
				".afol",
				"config.json",
			),
			"utf8",
		),
	) as {
		project: Record<string, unknown>;
		evolution: Record<string, unknown>;
	};
	source.project = { ...source.project, id: PROJECT_ID, timezone };
	source.evolution = {
		...source.evolution,
		recurrence: thresholds,
	};
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(source, null, 2)}\n`,
		"utf8",
	);
}

describe("observation journal", () => {
	test("appends full payloads, derives clusters, and replays idempotently", () => {
		const { root, db } = setup();
		try {
			for (const [id, session, day] of [
				["01", "S-01", 1],
				["02", "S-02", 1],
				["03", "S-02", 2],
			] as const)
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					observation: observation(id, session, day),
				});
			const duplicate = appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: observation("01", "S-01", 1),
			});
			expect(duplicate.event_id).toBe("OBS-01");
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(3);
			expect(
				db
					.query(
						"SELECT fingerprint_version, state, occurrence_count, distinct_session_count, distinct_production_day_count FROM issue_clusters WHERE project_id = ?",
					)
					.get(PROJECT_ID),
			).toMatchObject({
				fingerprint_version: OBSERVATION_FINGERPRINT_VERSION,
				state: "recurring",
				occurrence_count: 3,
				distinct_session_count: 2,
				distinct_production_day_count: 2,
			});
			validateObservationProjection({ root, db, projectId: PROJECT_ID });
			rebuildObservationProjection({ root, db, projectId: PROJECT_ID });
			validateObservationProjection({ root, db, projectId: PROJECT_ID });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed on missing production ordinals and conflicting occurrence ids", () => {
		const { root, db } = setup();
		try {
			const missingDay = observation("missing", "S-03", 3);
			expect(() =>
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					observation: missingDay,
				}),
			).toThrow("missing production ordinal 3");
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(0);

			const first = observation("01", "S-01", 1);
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: first,
			});
			const conflicting = normalizeObservationRecord({
				...first,
				journal_event_id: "OBS-conflict",
				source_refs: [{ id: "E-conflict", kind: "evidence" }],
			});
			expect(() =>
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					observation: conflicting,
				}),
			).toThrow(/already exists with different content/);
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(1);
			expect(
				db.query("SELECT COUNT(*) AS count FROM observations").get(),
			).toEqual({ count: 1 });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("rolls back journal creation when durability or projection fails", () => {
		const { root, db } = setup();
		try {
			const row = observation("01", "S-01", 1);
			expect(() =>
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					observation: row,
					syncDirectory: () => {
						throw new Error("injected directory sync failure");
					},
				}),
			).toThrow("injected directory sync failure");
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(0);
			expect(
				db.query("SELECT COUNT(*) AS count FROM observations").get(),
			).toEqual({ count: 0 });

			db.exec(
				"CREATE TRIGGER fail_observation_insert BEFORE INSERT ON observations BEGIN SELECT RAISE(ABORT, 'injected projection failure'); END;",
			);
			expect(() =>
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					observation: row,
				}),
			).toThrow("injected projection failure");
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(0);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("restores observation and recurrence projections when checkpoint persistence fails", () => {
		const { root, db } = setup();
		try {
			const first = observation("01", "S-01", 1);
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: first,
			});
			const before = JSON.stringify({
				observations: db.query("SELECT * FROM observations").all(),
				clusters: db.query("SELECT * FROM issue_clusters").all(),
				decisions: db.query("SELECT * FROM recurrence_decisions").all(),
			});
			const checkpointPath = join(
				root,
				".afol/data/events/evolution/projection-checkpoints.jsonl",
			);
			const checkpointBefore = readFileSync(checkpointPath, "utf8");
			expect(() =>
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					observation: observation("02", "S-02", 2),
					checkpointWriter: (input) =>
						writeEvolutionProjectionCheckpoint({
							...input,
							writeBytes: (fd, value) =>
								writeSync(fd, value.slice(0, 16), null, "utf8"),
						}),
				}),
			).toThrow("checkpoint journal write was incomplete");
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(1);
			expect(readFileSync(checkpointPath, "utf8")).toBe(checkpointBefore);
			expect(
				JSON.stringify({
					observations: db.query("SELECT * FROM observations").all(),
					clusters: db.query("SELECT * FROM issue_clusters").all(),
					decisions: db.query("SELECT * FROM recurrence_decisions").all(),
				}),
			).toBe(before);

			const authority = dispatchRecurrenceDecision({
				projectId: PROJECT_ID,
				fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
				fingerprint: first.fingerprint,
				action: "confirm",
				observationIds: ["01"],
				sourceDecisionRef: "U-checkpoint",
				operationContext: defaultOperationContext(),
				decisionId: "DEC-checkpoint",
			});
			expect(() =>
				appendRecurrenceDecisionReceipt({
					root,
					db,
					projectId: PROJECT_ID,
					clusterId: first.fingerprint,
					action: "confirm",
					authority,
					fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
					observationIds: ["01"],
					sourceDecisionRef: "U-checkpoint",
					sourceRefs: [{ id: "U-checkpoint", kind: "decision" }],
					checkpointWriter: (input) =>
						writeEvolutionProjectionCheckpoint({
							...input,
							syncFile: () => {
								throw new Error("injected checkpoint fsync failure");
							},
						}),
				}),
			).toThrow("injected checkpoint fsync failure");
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(1);
			expect(readFileSync(checkpointPath, "utf8")).toBe(checkpointBefore);
			expect(
				db.query("SELECT COUNT(*) AS count FROM recurrence_decisions").get(),
			).toEqual({ count: 0 });
			validateObservationProjection({ root, db, projectId: PROJECT_ID });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("detects and rebuilds derived cluster drift", () => {
		const { root, db } = setup();
		try {
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: observation("01", "S-01", 1),
			});
			db.exec("UPDATE issue_clusters SET occurrence_count = 99");
			expect(() =>
				validateObservationProjection({ root, db, projectId: PROJECT_ID }),
			).toThrow(/issue_clusters projection differs/);
			const unhealthy = checkEvolutionDbHealth(
				evolutionDbPath(root),
				PROJECT_ID,
				{ root, projectId: PROJECT_ID, timezone: "UTC" },
			);
			expect(unhealthy.ok).toBe(false);
			expect(
				unhealthy.findings.map((finding) => finding.message).join(" "),
			).toMatch(/issue_clusters projection differs/);
			rebuildObservationProjection({ root, db, projectId: PROJECT_ID });
			validateObservationProjection({ root, db, projectId: PROJECT_ID });
			expect(
				checkEvolutionDbHealth(evolutionDbPath(root), PROJECT_ID, {
					root,
					projectId: PROJECT_ID,
					timezone: "UTC",
				}).ok,
			).toBe(true);
			expect(
				db.query("SELECT occurrence_count FROM issue_clusters").get(),
			).toEqual({ occurrence_count: 1 });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("records trusted recurrence decision and rejects journal tampering", () => {
		const { root, db } = setup();
		try {
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: observation("01", "S-01", 1),
			});
			const fingerprint = observation("01", "S-01", 1).fingerprint;
			const authority = dispatchRecurrenceDecision({
				projectId: PROJECT_ID,
				fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
				fingerprint,
				action: "confirm",
				observationIds: ["01"],
				sourceDecisionRef: "U-01",
				operationContext: defaultOperationContext(),
				decisionId: "DEC-01",
			});
			const decision = appendRecurrenceDecisionReceipt({
				root,
				db,
				projectId: PROJECT_ID,
				clusterId: fingerprint,
				action: "confirm",
				authority,
				fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
				observationIds: ["01"],
				sourceDecisionRef: "U-01",
				sourceRefs: [{ id: "U-01", kind: "decision" }],
			});
			expect(decision.event_type).toBe("recurrence_decision");
			expect(
				db
					.query("SELECT action FROM recurrence_decisions WHERE project_id = ?")
					.get(PROJECT_ID),
			).toMatchObject({ action: "confirm" });
			expect(
				db
					.query(
						"SELECT state, user_confirmed_recurrence, priority FROM issue_clusters WHERE project_id = ?",
					)
					.get(PROJECT_ID),
			).toMatchObject({
				state: "recurring",
				user_confirmed_recurrence: 1,
				priority: 3,
			});
			for (const [action, ref, expected] of [
				["dismiss", "U-02", "dismissed"],
				["reopen", "U-03", "reopened"],
			] as const) {
				const nextAuthority = dispatchRecurrenceDecision({
					projectId: PROJECT_ID,
					fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
					fingerprint,
					action,
					observationIds: ["01"],
					sourceDecisionRef: ref,
					operationContext: defaultOperationContext(),
					decisionId: `DEC-${action}`,
				});
				appendRecurrenceDecisionReceipt({
					root,
					db,
					projectId: PROJECT_ID,
					clusterId: fingerprint,
					action,
					authority: nextAuthority,
					fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
					observationIds: ["01"],
					sourceDecisionRef: ref,
					sourceRefs: [{ id: ref, kind: "decision" }],
				});
				expect(
					db
						.query("SELECT state FROM issue_clusters WHERE project_id = ?")
						.get(PROJECT_ID),
				).toMatchObject({ state: expected });
			}
			validateObservationProjection({ root, db, projectId: PROJECT_ID });
			const path = observationJournalPath(root);
			const text = readFileSync(path, "utf8");
			writeFileSync(path, text.replace("e-repeat", "e-tamper"));
			expect(() => readObservationJournal(root, PROJECT_ID)).toThrow(
				/digest|hash chain|payload/,
			);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("validates production days using the configured IANA timezone", () => {
		const { root, db } = setup("America/Asuncion");
		try {
			expect(() =>
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					observation: observation("tz-missing", "S-tz", 1),
				}),
			).toThrow("production-day journal timezone mismatch");
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "America/Asuncion",
				observation: observation("tz-ok", "S-tz", 1),
			});
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(1);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("resolves omitted journal context from project configuration", () => {
		const { root, db } = setup("America/Asuncion");
		try {
			configureEvolution(root, "America/Asuncion", {
				minimum_occurrences: 2,
				minimum_distinct_sessions: 2,
				minimum_distinct_production_days: 2,
			});
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: observation("configured-01", "S-configured-1", 1),
			});
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: observation("configured-02", "S-configured-2", 2),
			});
			expect(
				db
					.query("SELECT state FROM issue_clusters WHERE project_id = ?")
					.get(PROJECT_ID),
			).toMatchObject({ state: "recurring" });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("replays a journal-ahead observation before the next DB-backed append", () => {
		const { root, db } = setup();
		try {
			appendObservationJournalEvent({
				root,
				projectId: PROJECT_ID,
				observation: observation("ahead-01", "S-ahead-1", 1),
			});
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: observation("ahead-02", "S-ahead-2", 2),
			});
			expect(
				db.query("SELECT COUNT(*) AS count FROM observations").get(),
			).toEqual({ count: 2 });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects stale recurrence membership before a DB-less append", () => {
		const { root, db } = setup();
		try {
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: observation("membership-01", "S-membership", 1),
			});
			const fingerprint = observation(
				"membership-01",
				"S-membership",
				1,
			).fingerprint;
			const authority = dispatchRecurrenceDecision({
				projectId: PROJECT_ID,
				fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
				fingerprint,
				action: "dismiss",
				observationIds: ["missing-observation"],
				sourceDecisionRef: "U-stale",
				operationContext: defaultOperationContext(),
				decisionId: "DEC-stale",
			});
			expect(() =>
				appendRecurrenceDecisionReceipt({
					root,
					projectId: PROJECT_ID,
					clusterId: fingerprint,
					action: "dismiss",
					authority,
					fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
					observationIds: ["missing-observation"],
					sourceDecisionRef: "U-stale",
					sourceRefs: [{ id: "U-stale", kind: "decision" }],
				}),
			).toThrow("membership differs from canonical observations");
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(1);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("automatically reopens a dismissed cluster only after a later observation", () => {
		const { root, db } = setup();
		try {
			const first = observation("reopen-01", "S-reopen", 1);
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: first,
			});
			const authority = dispatchRecurrenceDecision({
				projectId: PROJECT_ID,
				fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
				fingerprint: first.fingerprint,
				action: "dismiss",
				observationIds: [first.id],
				sourceDecisionRef: "U-dismiss",
				operationContext: defaultOperationContext(),
				decisionId: "DEC-dismiss",
			});
			appendRecurrenceDecisionReceipt({
				root,
				db,
				projectId: PROJECT_ID,
				clusterId: first.fingerprint,
				action: "dismiss",
				authority,
				fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
				observationIds: [first.id],
				sourceDecisionRef: "U-dismiss",
				sourceRefs: [{ id: "U-dismiss", kind: "decision" }],
			});
			expect(
				db
					.query("SELECT state FROM issue_clusters WHERE project_id = ?")
					.get(PROJECT_ID),
			).toMatchObject({ state: "dismissed" });

			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: observation("reopen-02", "S-reopen-2", 2),
			});
			expect(
				db
					.query(
						"SELECT state, user_confirmed_recurrence, priority FROM issue_clusters WHERE project_id = ?",
					)
					.get(PROJECT_ID),
			).toMatchObject({
				state: "reopened",
				user_confirmed_recurrence: 0,
				priority: 2,
			});
			expect(
				db
					.query(
						"SELECT journal_event_id FROM issue_clusters WHERE project_id = ?",
					)
					.get(PROJECT_ID),
			).toEqual({ journal_event_id: "OBS-reopen-02" });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("returns the same event for an exact recurrence decision retry", () => {
		const { root, db } = setup();
		try {
			const first = observation("retry-01", "S-retry", 1);
			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				observation: first,
			});
			const authority = dispatchRecurrenceDecision({
				projectId: PROJECT_ID,
				fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
				fingerprint: first.fingerprint,
				action: "confirm",
				observationIds: [first.id],
				sourceDecisionRef: "U-retry",
				operationContext: defaultOperationContext(),
				decisionId: "DEC-retry",
			});
			const input = {
				root,
				db,
				projectId: PROJECT_ID,
				clusterId: first.fingerprint,
				action: "confirm" as const,
				authority,
				fingerprintVersion: OBSERVATION_FINGERPRINT_VERSION,
				observationIds: [first.id],
				sourceDecisionRef: "U-retry",
				sourceRefs: [{ id: "U-retry", kind: "decision" }],
				eventId: "REC-retry",
				now: new Date("2026-07-20T00:00:00.000Z"),
			};
			const firstEvent = appendRecurrenceDecisionReceipt(input);
			const retryEvent = appendRecurrenceDecisionReceipt(input);
			expect(retryEvent).toEqual(firstEvent);
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(2);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects hostile source references and duplicate journal identities", () => {
		const { root, db } = setup();
		try {
			const row = observation("hostile-01", "S-hostile", 1);
			for (const sourceRefs of [
				[{ id: "E-hostile", kind: "evidence", secret: "redacted" }],
				[{ id: "E-hostile?query=1", kind: "evidence" }],
				[{ id: "I-hostile", kind: "import" }],
				[{ id: "E-hostile", kind: "evidence", digest: "not-a-digest" }],
			])
				expect(() =>
					appendObservationJournalEvent({
						root,
						db,
						projectId: PROJECT_ID,
						observation: row,
						sourceRefs,
					}),
				).toThrow("observation source ref is invalid");
			expect(readObservationJournal(root, PROJECT_ID)).toHaveLength(0);

			appendObservationJournalEvent({
				root,
				db,
				projectId: PROJECT_ID,
				eventId: "OBS-shared",
				observation: row,
			});
			expect(() =>
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					eventId: "OBS-shared",
					observation: observation("hostile-02", "S-hostile-2", 2),
				}),
			).toThrow("observation journal event id already exists");
			expect(() =>
				appendObservationJournalEvent({
					root,
					db,
					projectId: PROJECT_ID,
					observation: observation("hostile-01", "S-hostile-3", 2),
				}),
			).toThrow("observation id already exists with different content");
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});
});
