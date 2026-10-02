import { Database } from "bun:sqlite";
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
	appendProductionDayAllocation,
	evolutionDbPath,
	normalizeObservationRecord,
	openEvolutionDb,
	previewEvolutionDerivedState,
	repairEvolutionDerivedState,
} from "../services/evolution";
import { ingestObservationsForSession } from "../services/evolution/observation-ingest";
import {
	appendObservationJournalEvent,
	appendObservationJournalEventWithStatus,
	observationJournalPath,
	readObservationJournal,
} from "../services/evolution/observation-journal";
import type { ObservationRecord } from "../services/evolution/observation-model";
import { observationFromEvidence } from "../services/evolution/observation-sources";
import {
	projectionCheckpointPath,
	validateEvolutionProjectionCheckpoint,
} from "../services/evolution/projection-checkpoint";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "3e6a9f52-8b4d-4c1e-a7d2-9f0b1c2d3e4f";
const CUSTOM_DB = ".afol/state/custom/evolution.db";
const CUSTOM_EVENTS_DIR = ".afol/data/events/custom-evolution";
const TIMEZONE = "Asia/Taipei";
const T1 = new Date("2026-07-20T10:00:00.000Z");
const T2 = new Date("2026-07-20T18:30:00.000Z");
const DURABILITY_CHILD = "--afol-derived-state-durability-child";

if (process.argv[2] === DURABILITY_CHILD) {
	const mode = process.argv[3];
	const root = process.cwd();
	const waitFor = (name: string) => {
		const path = join(root, name);
		const deadline = Date.now() + 10_000;
		while (!existsSync(path) && Date.now() < deadline) Bun.sleepSync(10);
		if (!existsSync(path)) throw new Error(`missing coordination file ${name}`);
	};
	switch (mode) {
		case "ingest-two": {
			writeFileSync(join(root, "writer-a-ready"), "ready");
			waitFor("writers-go");
			for (const session of ["S-con-a", "S-con-b"]) {
				const result = ingestObservationsForSession({
					root,
					projectId: PROJECT_ID,
					session,
					now: T2,
				});
				if (result.appended !== 1)
					throw new Error(
						`ingest ${session} appended ${result.appended}: ${result.warnings.join("; ")}`,
					);
			}
			break;
		}
		case "repair-twice": {
			writeFileSync(join(root, "writer-b-ready"), "ready");
			waitFor("writers-go");
			repairEvolutionDerivedState({ root, projectId: PROJECT_ID });
			repairEvolutionDerivedState({ root, projectId: PROJECT_ID });
			break;
		}
		default:
			throw new Error(`unknown derived-state durability child mode: ${mode}`);
	}
	process.exit(0);
}

function evolutionConfig(): Record<string, unknown> {
	return {
		schema_version: 1,
		project: { name: "durability-fixture", id: PROJECT_ID, timezone: TIMEZONE },
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
	const root = mkdtempSync(join(tmpdir(), "evolution-durability-"));
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
	session: string,
	failedEvidenceId: string,
	createdAt: Date,
): void {
	const dir = join(root, ".afol", "wb", session);
	mkdirSync(dir, { recursive: true });
	const content = `# Tasks\n\n## State Board\n\n| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n| T-01 | done | test | completion_policy=execution |\n`;
	writeFileSync(join(dir, `${session}_task_01.md`), content, "utf8");
	const entry = (
		id: string,
		result: "passed" | "failed",
		exitCode: number,
	): Record<string, unknown> => ({
		id,
		task_id: "T-01",
		project_id: PROJECT_ID,
		session_id: session,
		created_at: createdAt.toISOString(),
		command: "bun test",
		result,
		provenance: "observed",
		exit_code: exitCode,
		purpose: "completion",
		authorization_type: "execution",
	});
	writeFileSync(
		join(dir, ".evidence.jsonl"),
		`${JSON.stringify(entry(`E-${session}-passed`, "passed", 0))}\n${JSON.stringify(entry(failedEvidenceId, "failed", 1))}\n`,
		"utf8",
	);
}

function crashedObservation(
	session: string,
	failedEvidenceId: string,
	createdAt: Date,
	productionDaySequence: number,
): ObservationRecord {
	const candidate = observationFromEvidence(
		{
			id: failedEvidenceId,
			created_at: createdAt.toISOString(),
			result: "failed",
			exit_code: 1,
			command: "bun test",
		},
		{
			projectId: PROJECT_ID,
			sessionId: session,
			taskType: "T-01",
			productionDaySequence,
		},
	);
	if (!candidate) throw new Error("fixture produced no observation candidate");
	return normalizeObservationRecord({
		...candidate,
		productionDaySequence,
	});
}

function configuredDbPath(root: string): string {
	return join(root, CUSTOM_DB);
}

function observationRows(dbPath: string): Array<Record<string, unknown>> {
	const db = new Database(dbPath, { readonly: true });
	try {
		return db
			.query(
				"SELECT id, kind, fingerprint, fingerprint_version, occurrence_identity, session_id, production_day_sequence, created_at FROM observations WHERE project_id = ? ORDER BY id",
			)
			.all(PROJECT_ID) as Array<Record<string, unknown>>;
	} finally {
		db.close();
	}
}

function observationCount(dbPath: string): number {
	return observationRows(dbPath).length;
}

function journalLines(root: string): number {
	const text = readFileSync(
		observationJournalPath(root, CUSTOM_EVENTS_DIR),
		"utf8",
	);
	return text.trimEnd().split("\n").filter(Boolean).length;
}

function checkpointLines(root: string): number {
	const path = projectionCheckpointPath(root, CUSTOM_EVENTS_DIR);
	if (!existsSync(path)) return 0;
	return readFileSync(path, "utf8").trimEnd().split("\n").filter(Boolean)
		.length;
}

function assertCheckpointValid(root: string): void {
	const db = new Database(configuredDbPath(root), { readonly: true });
	try {
		validateEvolutionProjectionCheckpoint({
			root,
			db,
			projectId: PROJECT_ID,
			eventsDir: CUSTOM_EVENTS_DIR,
		});
	} finally {
		db.close();
	}
}

function occurrenceIdentities(root: string): string[] {
	return readObservationJournal(root, PROJECT_ID, CUSTOM_EVENTS_DIR)
		.filter((event) => event.event_type === "observation")
		.map((event) =>
			String(
				(event.payload.observation as Record<string, unknown>)
					.occurrence_identity,
			),
		)
		.sort();
}

describe("evolution derived-state durability", () => {
	test("journal written without its projection recovers on repair and matches a clean rebuild", () => {
		const root = fixtureRoot();
		try {
			seedSession(root, "S-one", "E-S-one-fail", T1);
			seedSession(root, "S-two", "E-S-two-fail", T2);
			expect(
				ingestObservationsForSession({
					root,
					projectId: PROJECT_ID,
					session: "S-one",
					now: T1,
				}).appended,
			).toBe(1);

			// Simulate a crash after the durable journal append but before the
			// projection transaction: ingest already allocated S-two's production
			// day, so replay the allocation, then append with no db handle.
			const allocationDb = openEvolutionDb(configuredDbPath(root));
			try {
				appendProductionDayAllocation({
					root,
					db: allocationDb,
					projectId: PROJECT_ID,
					timezone: TIMEZONE,
					sessionId: "S-two",
					evidenceId: "E-S-two-passed",
					evolutionEventsDir: CUSTOM_EVENTS_DIR,
					now: T2,
				});
			} finally {
				allocationDb.close();
			}
			appendObservationJournalEvent({
				root,
				projectId: PROJECT_ID,
				timezone: TIMEZONE,
				evolutionEventsDir: CUSTOM_EVENTS_DIR,
				observation: crashedObservation("S-two", "E-S-two-fail", T2, 2),
				eventId: "OBS-crash-journal-projection",
				now: T2,
			});
			expect(journalLines(root)).toBe(2);
			expect(observationCount(configuredDbPath(root))).toBe(1);

			const repaired = repairEvolutionDerivedState({
				root,
				projectId: PROJECT_ID,
			});
			expect(repaired.observation_events).toBe(2);
			expect(repaired.observation_projection_rebuilt).toBe(true);
			expect(repaired.checkpoint_written).toBe(true);
			expect(observationCount(configuredDbPath(root))).toBe(2);
			expect(journalLines(root)).toBe(2);
			assertCheckpointValid(root);
			expect(
				repairEvolutionDerivedState({ root, projectId: PROJECT_ID }).changed,
			).toBe(false);

			// A clean single rebuild of the same inputs must produce the same
			// stable projection rows and the same journal sequence.
			const clean = fixtureRoot();
			try {
				seedSession(clean, "S-one", "E-S-one-fail", T1);
				seedSession(clean, "S-two", "E-S-two-fail", T2);
				expect(
					ingestObservationsForSession({
						root: clean,
						projectId: PROJECT_ID,
						session: "S-one",
						now: T1,
					}).appended,
				).toBe(1);
				expect(
					ingestObservationsForSession({
						root: clean,
						projectId: PROJECT_ID,
						session: "S-two",
						now: T2,
					}).appended,
				).toBe(1);
				expect(observationRows(configuredDbPath(clean))).toEqual(
					observationRows(configuredDbPath(root)),
				);
				expect(journalLines(clean)).toBe(journalLines(root));
				expect(occurrenceIdentities(clean)).toEqual(occurrenceIdentities(root));
				assertCheckpointValid(clean);
			} finally {
				removeEvolutionTestRoot(clean);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("interrupted checkpoint write compensates and repeating the append finishes idempotently", () => {
		const root = fixtureRoot();
		try {
			seedSession(root, "S-one", "E-S-one-fail", T1);
			seedSession(root, "S-two", "E-S-two-fail", T2);
			expect(
				ingestObservationsForSession({
					root,
					projectId: PROJECT_ID,
					session: "S-one",
					now: T1,
				}).appended,
			).toBe(1);

			const interruptedInput = {
				root,
				projectId: PROJECT_ID,
				timezone: TIMEZONE,
				evolutionEventsDir: CUSTOM_EVENTS_DIR,
				observation: crashedObservation("S-two", "E-S-two-fail", T2, 1),
				eventId: "OBS-crash-checkpoint",
				now: T2,
			};
			const interruptedDb = openEvolutionDb(configuredDbPath(root));
			try {
				expect(() =>
					appendObservationJournalEvent({
						...interruptedInput,
						db: interruptedDb,
						checkpointWriter: () => {
							throw new Error("checkpoint writer interrupted");
						},
					}),
				).toThrow("checkpoint writer interrupted");
			} finally {
				interruptedDb.close();
			}

			// The journal and projection were rolled back to the last durable
			// state and the existing checkpoint still validates.
			expect(journalLines(root)).toBe(1);
			expect(observationCount(configuredDbPath(root))).toBe(1);
			expect(checkpointLines(root)).toBe(1);
			assertCheckpointValid(root);

			// Repeating the operation finishes it exactly once.
			const db = openEvolutionDb(configuredDbPath(root));
			let appended: boolean;
			try {
				appended = appendObservationJournalEventWithStatus({
					...interruptedInput,
					db,
				}).appended;
			} finally {
				db.close();
			}
			expect(appended).toBe(true);
			expect(journalLines(root)).toBe(2);
			expect(observationCount(configuredDbPath(root))).toBe(2);
			const checkpointCount = checkpointLines(root);
			assertCheckpointValid(root);

			// Re-running the same append duplicates neither journal nor rows.
			const dbAgain = openEvolutionDb(configuredDbPath(root));
			try {
				expect(
					appendObservationJournalEventWithStatus({
						...interruptedInput,
						db: dbAgain,
					}).appended,
				).toBe(false);
			} finally {
				dbAgain.close();
			}
			expect(journalLines(root)).toBe(2);
			expect(observationCount(configuredDbPath(root))).toBe(2);
			expect(checkpointLines(root)).toBe(checkpointCount);
			expect(
				repairEvolutionDerivedState({ root, projectId: PROJECT_ID }).changed,
			).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("concurrent ingest and repair writers serialize and converge", async () => {
		const root = fixtureRoot();
		try {
			seedSession(root, "S-con-a", "E-S-con-a-fail", T1);
			seedSession(root, "S-con-b", "E-S-con-b-fail", T2);
			const spawn = (mode: string) =>
				Bun.spawn(
					[process.execPath, import.meta.filename, DURABILITY_CHILD, mode],
					{ cwd: root, stdout: "pipe", stderr: "pipe" },
				);
			const writerA = spawn("ingest-two");
			const writerB = spawn("repair-twice");
			const waitFor = (name: string) => {
				const path = join(root, name);
				const deadline = Date.now() + 10_000;
				while (!existsSync(path) && Date.now() < deadline) Bun.sleepSync(10);
				expect(existsSync(path)).toBe(true);
			};
			try {
				waitFor("writer-a-ready");
				waitFor("writer-b-ready");
				writeFileSync(join(root, "writers-go"), "go");
				for (const child of [writerA, writerB]) {
					const exitCode = await child.exited;
					if (exitCode !== 0) {
						const stderr = child.stderr
							? await new Response(child.stderr).text()
							: "";
						throw new Error(
							`durability child failed (${exitCode}): ${stderr.trim()}`,
						);
					}
				}
			} finally {
				for (const child of [writerA, writerB]) {
					try {
						child.kill();
					} catch {}
				}
			}

			expect(previewEvolutionDerivedState({ root }).observation_events).toBe(2);
			const final = repairEvolutionDerivedState({
				root,
				projectId: PROJECT_ID,
			});
			expect(final.changed).toBe(false);
			expect(journalLines(root)).toBe(2);
			expect(observationCount(configuredDbPath(root))).toBe(2);
			expect(new Set(occurrenceIdentities(root)).size).toBe(2);
			assertCheckpointValid(root);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("invalid observation journal blocks recovery and leaves journal bytes unchanged", () => {
		const root = fixtureRoot();
		try {
			seedSession(root, "S-one", "E-S-one-fail", T1);
			expect(
				ingestObservationsForSession({
					root,
					projectId: PROJECT_ID,
					session: "S-one",
					now: T1,
				}).appended,
			).toBe(1);

			const journalPath = observationJournalPath(root, CUSTOM_EVENTS_DIR);
			appendFileSync(journalPath, '{"broken":true}\n');
			const before = readFileSync(journalPath, "utf8");

			expect(() =>
				repairEvolutionDerivedState({ root, projectId: PROJECT_ID }),
			).toThrow("invalid observation journal event at line 2");
			expect(readFileSync(journalPath, "utf8")).toBe(before);
			expect(observationCount(configuredDbPath(root))).toBe(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("a default-path project keeps ingesting and repairing", () => {
		const root = fixtureRoot();
		try {
			// Rewrite the config to the default paths and UTC.
			const config = evolutionConfig();
			config.project = {
				name: "durability-fixture",
				id: PROJECT_ID,
				timezone: "UTC",
			};
			config.paths = {
				external_dir: ".afol/external",
				evolution_db: ".afol/state/evolution.db",
				evolution_data_dir: ".afol/data/evolution",
				evolution_events_dir: ".afol/data/events/evolution",
			};
			writeFileSync(
				join(root, ".afol", "config.json"),
				`${JSON.stringify(config, null, 2)}\n`,
				"utf8",
			);
			seedSession(root, "S-default", "E-S-default-fail", T1);

			const result = ingestObservationsForSession({
				root,
				projectId: PROJECT_ID,
				session: "S-default",
				now: T1,
			});
			expect(result.appended).toBe(1);
			expect(existsSync(evolutionDbPath(root))).toBe(true);
			const repaired = repairEvolutionDerivedState({
				root,
				projectId: PROJECT_ID,
			});
			expect(repaired.db_path).toBe(evolutionDbPath(root));
			expect(repaired.observation_events).toBe(1);
			expect(repaired.changed).toBe(false);
			expect(
				repairEvolutionDerivedState({ root, projectId: PROJECT_ID }).changed,
			).toBe(false);
			const db = new Database(evolutionDbPath(root), { readonly: true });
			try {
				validateEvolutionProjectionCheckpoint({
					root,
					db,
					projectId: PROJECT_ID,
				});
			} finally {
				db.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
