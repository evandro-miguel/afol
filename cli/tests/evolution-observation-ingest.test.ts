import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	appendTelemetryEvent,
	resolveTelemetryEventPath,
} from "../services/events/telemetry";
import {
	appendProductionDayAllocation,
	evolutionDbPath,
	observationJournalPath,
	openEvolutionDb,
	productionDayJournalPath,
} from "../services/evolution";
import {
	checkEvolutionDbHealth,
	getEvolutionStatus,
} from "../services/evolution/health";
import {
	createObservationIngestPreviewContext,
	ingestObservationsForSession,
	OBSERVE_EVIDENCE_LIMITS,
	OBSERVE_JOURNAL_LIMITS,
	OBSERVE_TASK_LIMITS,
	OBSERVE_TELEMETRY_LIMITS,
	previewObservationIngestForSession,
} from "../services/evolution/observation-ingest";
import { readObservationJournal } from "../services/evolution/observation-journal";
import { feedbackMode, recordFeedback } from "../services/feedback";
import { readBoundedSourceFile } from "../services/io/safe-source";
import { removeEvolutionTestRoot } from "./evolution-test-support";
import { symlinkTestSupport } from "./symlink-test-support";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const OTHER_PROJECT_ID = "7b7d91ca-496b-4f0c-8537-5c4993810d15";

function evolutionConfig(): Record<string, unknown> {
	return {
		schema_version: 1,
		project: { name: "test", id: PROJECT_ID, timezone: "UTC" },
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
	};
}

function fixtureRoot(config = evolutionConfig()): string {
	const root = mkdtempSync(join(tmpdir(), "obs-ingest-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(config, null, 2)}\n`,
		"utf8",
	);
	return root;
}

function makeSessionDir(root: string, session: string): string {
	const dir = join(root, ".afol", "wb", session);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writeEvidence(
	sessionDir: string,
	entries: Array<Record<string, unknown>>,
): void {
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${entries.map((e) => JSON.stringify(e)).join("\n")}\n`,
		"utf8",
	);
}

function seedObservedPassedEvidence(
	root: string,
	session: string,
	evidenceId = "E-passed",
	projectId = PROJECT_ID,
): void {
	const dir = makeSessionDir(root, session);
	writeEvidence(dir, [
		{
			id: evidenceId,
			task_id: "T-01",
			project_id: projectId,
			session_id: session,
			created_at: "2026-07-20T10:00:00.000Z",
			command: "true",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
			purpose: "completion",
			authorization_type: "execution",
		},
	]);
}

function seedFailedEvidence(
	root: string,
	session: string,
	entries: Array<{
		id: string;
		taskId?: string;
		exitCode?: number;
		result?: string;
		extra?: Record<string, unknown>;
	}>,
): void {
	const dir = makeSessionDir(root, session);
	const evidence = entries.map((e) => ({
		id: e.id,
		task_id: e.taskId ?? "T-01",
		project_id: PROJECT_ID,
		session_id: session,
		created_at: "2026-07-20T11:00:00.000Z",
		command: "bun test --filter x",
		result: e.result ?? "failed",
		provenance: "observed",
		exit_code: e.exitCode ?? 1,
		purpose: "completion",
		authorization_type: "execution",
		...e.extra,
	}));
	const existing = existsSync(join(dir, ".evidence.jsonl"))
		? readFileSync(join(dir, ".evidence.jsonl"), "utf8")
				.split(/\r?\n/)
				.filter(Boolean)
				.map((line) => JSON.parse(line) as Record<string, unknown>)
		: [];
	writeEvidence(dir, [...existing, ...evidence]);
}

function telemetry(
	root: string,
	event: {
		event_type: string;
		session_id: string;
		task_id?: string;
		error_type?: string;
		cmd_type?: string;
		outcome?: string;
	},
): void {
	appendTelemetryEvent(root, {
		event_type: event.event_type as "error",
		session_id: event.session_id,
		...(event.task_id !== undefined ? { task_id: event.task_id } : {}),
		...(event.error_type ? { error_type: event.error_type } : {}),
		...(event.cmd_type ? { cmd_type: event.cmd_type } : {}),
		...(event.outcome
			? { outcome: event.outcome as "success" | "failure" }
			: {}),
	});
}

/** Write a completed task file so the session passes the completeness gate. */
function seedCompletedSession(
	root: string,
	session: string,
	...taskIds: string[]
): void {
	const ids = taskIds.length > 0 ? taskIds : ["T-01"];
	const dir = makeSessionDir(root, session);
	const content = `# Tasks\n\n## State Board\n\n| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n${ids.map((id) => `| ${id} | done | test | completion_policy=execution |`).join("\n")}\n`;
	writeFileSync(join(dir, `${session}_task_01.md`), content, "utf8");
}

/** Convenience: seed both passed evidence AND a completed task file. */
function seedCompleteEvidence(
	root: string,
	session: string,
	evidenceId = "E-passed",
	projectId = PROJECT_ID,
): void {
	seedCompletedSession(root, session, "T-01");
	seedObservedPassedEvidence(root, session, evidenceId, projectId);
}

function seededDb(root: string, projectId: string): Database {
	const db = openEvolutionDb(evolutionDbPath(root));
	// Seed one production day so the DB has valid structure
	const sessionDir = makeSessionDir(root, "S-prod");
	writeEvidence(sessionDir, [
		{
			id: "E-prod-seed",
			task_id: "T-01",
			project_id: projectId,
			session_id: "S-prod",
			created_at: "2026-07-19T10:00:00.000Z",
			command: "true",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
		},
	]);
	appendProductionDayAllocation({
		root,
		db,
		projectId,
		timezone: "UTC",
		sessionId: "S-prod",
		evidenceId: "E-prod-seed",
	});
	return db;
}

describe("observation-ingest", () => {
	test("read-only preview reports the same candidate identity ingested later", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-preview");
		seedFailedEvidence(root, "S-preview", [
			{ id: "E-preview-failure", exitCode: 1, result: "failed" },
		]);

		const preview = previewObservationIngestForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-preview",
		});
		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-preview",
		});
		const observation = readObservationJournal(root, PROJECT_ID).find(
			(event) => event.event_type === "observation",
		);
		if (!observation) {
			throw new Error("expected observation journal event");
		}

		expect(preview.eligible).toBe(true);
		expect(preview.candidate_count).toBe(result.appended);
		expect(preview.candidate_occurrence_identities).toEqual([
			String(
				(observation.payload.observation as Record<string, unknown>)
					.occurrence_identity,
			),
		]);
	});

	test("preview source digest changes when bounded evidence changes", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-digest");
		seedFailedEvidence(root, "S-digest", [
			{ id: "E-digest-one", exitCode: 1, result: "failed" },
		]);
		const first = previewObservationIngestForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-digest",
		});
		seedFailedEvidence(root, "S-digest", [
			{ id: "E-digest-two", exitCode: 2, result: "failed" },
		]);
		const second = previewObservationIngestForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-digest",
		});

		expect(second.source_digests.evidence).not.toBe(
			first.source_digests.evidence,
		);
		expect(second.candidate_count).toBe(2);
	});

	test("preview creates no evolution database or observation journal", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-read-only");
		seedFailedEvidence(root, "S-read-only", [
			{ id: "E-read-only", exitCode: 1, result: "failed" },
		]);

		const preview = previewObservationIngestForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-read-only",
		});

		expect(preview.candidate_count).toBe(1);
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
	});

	test("eligible zero-candidate ingest does not create a database or migration", () => {
		const root = fixtureRoot();
		seedCompletedSession(root, "S-zero-candidate");

		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-zero-candidate",
		});

		expect(result).toEqual({
			appended: 0,
			duplicates: 0,
			skipped: 0,
			warnings: [],
			observation_ids: [],
		});
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
	});

	test("preview context reuses one bounded journal view across sessions", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-context-existing");
		seedFailedEvidence(root, "S-context-existing", [
			{ id: "E-context-existing", exitCode: 1, result: "failed" },
		]);
		ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-context-existing",
		});
		seedCompleteEvidence(root, "S-context-new");
		seedFailedEvidence(root, "S-context-new", [
			{ id: "E-context-new", exitCode: 1, result: "failed" },
		]);

		const context = createObservationIngestPreviewContext(root, PROJECT_ID);
		const existing = previewObservationIngestForSession(
			{ root, projectId: PROJECT_ID, session: "S-context-existing" },
			context,
		);
		const fresh = previewObservationIngestForSession(
			{ root, projectId: PROJECT_ID, session: "S-context-new" },
			context,
		);

		expect(context.journalDigest).toMatch(/^[a-f0-9]{64}$/);
		expect(existing).toMatchObject({ candidate_count: 0, duplicate_count: 1 });
		expect(fresh).toMatchObject({ candidate_count: 1, duplicate_count: 0 });
		expect(fresh.source_digests.journal).toBe(context.journalDigest);
	});

	test("preview context derives its journal view from the captured bounded snapshot", () => {
		const root = fixtureRoot();
		const session = "S-context-snapshot";
		seedCompleteEvidence(root, session);
		seedFailedEvidence(root, session, [
			{ id: "E-context-snapshot", exitCode: 1, result: "failed" },
		]);
		ingestObservationsForSession({ root, projectId: PROJECT_ID, session });
		const journalPath = observationJournalPath(root);
		const context = createObservationIngestPreviewContext(
			root,
			PROJECT_ID,
			() => {
				const capturedJournal = readBoundedSourceFile(
					journalPath,
					"observation journal",
					OBSERVE_JOURNAL_LIMITS,
				);
				writeFileSync(
					journalPath,
					"x".repeat(OBSERVE_JOURNAL_LIMITS.maxBytes + 1),
					"utf8",
				);
				return capturedJournal;
			},
		);

		expect(context.journalDigest).toMatch(/^[a-f0-9]{64}$/);
		expect(context.occurrenceIdentities.size).toBe(1);
		expect(readFileSync(journalPath, "utf8").length).toBeGreaterThan(
			OBSERVE_JOURNAL_LIMITS.maxBytes,
		);
	});

	test("explicit session creates observations from failed evidence", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");
		seedFailedEvidence(root, "S-01", [
			{ id: "E-fail-1", exitCode: 1, result: "failed" },
		]);

		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});

		expect(result.appended).toBe(1);
		expect(result.duplicates).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.warnings).toEqual([]);
		expect(result.observation_ids).toHaveLength(1);

		// Verify the observation is persisted
		const journal = readObservationJournal(root, PROJECT_ID);
		const obsEvents = journal.filter((e) => e.event_type === "observation");
		expect(obsEvents).toHaveLength(1);
		const db = new Database(evolutionDbPath(root), { readonly: true });
		try {
			const day = db
				.query(
					"SELECT ordinal_sequence FROM production_days WHERE project_id = ?",
				)
				.get(PROJECT_ID) as { ordinal_sequence: number };
			const observation = obsEvents[0]?.payload.observation as Record<
				string,
				unknown
			>;
			expect(day.ordinal_sequence).toBeGreaterThan(0);
			expect(observation.production_day_sequence).toBe(day.ordinal_sequence);
		} finally {
			db.close();
		}
	});

	test("missing session throws", () => {
		const root = fixtureRoot();
		expect(() =>
			ingestObservationsForSession({
				root,
				projectId: PROJECT_ID,
				session: "does-not-exist",
			}),
		).toThrow("Session folder not found");
	});

	test.each([
		"symlink",
		"hardlink",
	] as const)("rejects an unsafe evidence target (%s) before mutation", (mode) => {
		if (mode === "symlink" && !symlinkTestSupport.available) return;
		const root = fixtureRoot();
		const session = "S-unsafe-evidence";
		seedCompleteEvidence(root, session);
		const evidencePath = join(root, ".afol", "wb", session, ".evidence.jsonl");
		const outside = join(root, "evidence-target.jsonl");
		if (mode === "symlink") {
			writeFileSync(outside, readFileSync(evidencePath));
			rmSync(evidencePath);
			symlinkSync(outside, evidencePath);
		} else {
			linkSync(evidencePath, outside);
		}

		expect(() =>
			ingestObservationsForSession({
				root,
				projectId: PROJECT_ID,
				session,
			}),
		).toThrow(/session evidence ledger|hardlinked/);
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
		expect(existsSync(productionDayJournalPath(root))).toBe(false);
	});

	test.each([
		"symlink",
		"hardlink",
	] as const)("rejects an unsafe task target (%s) before mutation", (mode) => {
		if (mode === "symlink" && !symlinkTestSupport.available) return;
		const root = fixtureRoot();
		const session = "S-unsafe-task";
		seedCompleteEvidence(root, session);
		const taskPath = join(
			root,
			".afol",
			"wb",
			session,
			`${session}_task_01.md`,
		);
		const outside = join(root, "task-target.md");
		if (mode === "symlink") {
			writeFileSync(outside, readFileSync(taskPath));
			rmSync(taskPath);
			symlinkSync(outside, taskPath);
		} else {
			linkSync(taskPath, outside);
		}

		expect(() =>
			ingestObservationsForSession({
				root,
				projectId: PROJECT_ID,
				session,
			}),
		).toThrow(/session task file|hardlinked/);
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
		expect(existsSync(productionDayJournalPath(root))).toBe(false);
	});

	test("rejects an oversized evidence source before parsing or mutation", () => {
		const root = fixtureRoot();
		const session = "S-oversized-evidence";
		const dir = makeSessionDir(root, session);
		seedCompletedSession(root, session);
		writeFileSync(
			join(dir, ".evidence.jsonl"),
			"x".repeat(OBSERVE_EVIDENCE_LIMITS.maxBytes + 1),
			"utf8",
		);
		expect(() =>
			ingestObservationsForSession({ root, projectId: PROJECT_ID, session }),
		).toThrow("session evidence ledger exceeds the byte limit");
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
	});

	test("rejects an oversized canonical task before parsing or mutation", () => {
		const root = fixtureRoot();
		const session = "S-oversized-task";
		seedCompleteEvidence(root, session);
		const taskPath = join(
			root,
			".afol",
			"wb",
			session,
			`${session}_task_01.md`,
		);
		writeFileSync(
			taskPath,
			"x".repeat(OBSERVE_TASK_LIMITS.maxBytes + 1),
			"utf8",
		);

		expect(() =>
			ingestObservationsForSession({ root, projectId: PROJECT_ID, session }),
		).toThrow("session task file exceeds the byte limit");
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
		expect(existsSync(productionDayJournalPath(root))).toBe(false);
	});

	test("missing canonical task remains incomplete and does not mutate", () => {
		const root = fixtureRoot();
		const session = "S-missing-task";
		seedObservedPassedEvidence(root, session);

		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session,
		});
		expect(result).toMatchObject({
			appended: 0,
			duplicates: 0,
			observation_ids: [],
		});
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
	});

	test("fails closed when the captured canonical task identity changes", () => {
		const root = fixtureRoot();
		const session = "S-task-replaced";
		seedCompleteEvidence(root, session);
		const taskPath = join(
			root,
			".afol",
			"wb",
			session,
			`${session}_task_01.md`,
		);
		const replacementPath = join(root, "replacement-task.md");
		writeFileSync(replacementPath, readFileSync(taskPath), "utf8");

		expect(() =>
			readBoundedSourceFile(
				taskPath,
				"session task file",
				OBSERVE_TASK_LIMITS,
				{
					afterOpen: () => {
						// Windows does not allow rename-overwrite while the original
						// descriptor is open. Removing the name first preserves the
						// replacement/identity race this test is exercising.
						rmSync(taskPath);
						renameSync(replacementPath, taskPath);
					},
				},
			),
		).toThrow("session task file changed during read");
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
	});

	test("malformed evidence errors use a stable relative label", () => {
		const root = fixtureRoot();
		const session = "S-malformed-evidence";
		const dir = makeSessionDir(root, session);
		seedCompletedSession(root, session);
		writeFileSync(join(dir, ".evidence.jsonl"), "{not-json}\n", "utf8");
		let message = "";
		try {
			ingestObservationsForSession({ root, projectId: PROJECT_ID, session });
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain("Malformed evidence ledger line 1");
		expect(message).not.toContain(root);
	});

	test("rejects too many telemetry candidates before parsing or mutation", () => {
		const root = fixtureRoot();
		const session = "S-many-telemetry";
		seedCompleteEvidence(root, session);
		const telemetryPath = resolveTelemetryEventPath(root);
		mkdirSync(dirname(telemetryPath), { recursive: true });
		writeFileSync(
			telemetryPath,
			`${Array.from(
				{ length: OBSERVE_TELEMETRY_LIMITS.maxCandidates + 1 },
				(_, index) =>
					JSON.stringify({
						schema_version: "1",
						id: `TEL-${index}`,
						ts: "2026-07-28T20:00:00.000Z",
						source: "afol-cli",
						event_type: "error",
						session_id: session,
					}),
			).join("\n")}\n`,
			"utf8",
		);
		expect(() =>
			ingestObservationsForSession({ root, projectId: PROJECT_ID, session }),
		).toThrow("EVENT_LEDGER_LIMIT_EXCEEDED");
		expect(existsSync(evolutionDbPath(root))).toBe(false);
		expect(existsSync(observationJournalPath(root))).toBe(false);
	});

	test("ignores same-session tool telemetry when enforcing the observation limit", () => {
		const root = fixtureRoot();
		const session = "S-tool-exec-telemetry";
		seedCompleteEvidence(root, session);
		const telemetryPath = resolveTelemetryEventPath(root);
		mkdirSync(dirname(telemetryPath), { recursive: true });
		writeFileSync(
			telemetryPath,
			`${Array.from(
				{ length: OBSERVE_TELEMETRY_LIMITS.maxCandidates + 1 },
				(_, index) =>
					JSON.stringify({
						schema_version: "1",
						id: `TEL-TOOL-${index}`,
						ts: "2026-07-28T20:00:00.000Z",
						source: "afol-cli",
						event_type: "tool_exec",
						session_id: session,
					}),
			).join("\n")}\n`,
			"utf8",
		);

		expect(() =>
			ingestObservationsForSession({ root, projectId: PROJECT_ID, session }),
		).not.toThrow();
	});

	test("allocates production day before telemetry and reuses its receipt", () => {
		const root = fixtureRoot();
		const session = "S-two-phase";
		seedCompleteEvidence(root, session);
		const telemetryPath = resolveTelemetryEventPath(root);
		mkdirSync(dirname(telemetryPath), { recursive: true });
		writeFileSync(telemetryPath, "{malformed\n", "utf8");

		expect(() =>
			ingestObservationsForSession({
				root,
				projectId: PROJECT_ID,
				session,
				mode: "production-day",
			}),
		).not.toThrow();
		const productionPath = productionDayJournalPath(root);
		const allocation = readFileSync(productionPath, "utf8");
		expect(allocation.trim().split("\n")).toHaveLength(1);

		writeFileSync(telemetryPath, "", "utf8");
		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session,
		});
		expect(result).toMatchObject({ appended: 0, skipped: 0 });
		expect(readFileSync(productionPath, "utf8")).toBe(allocation);
	});

	test("ignores unrelated telemetry when enforcing the session limit", () => {
		const root = fixtureRoot();
		const session = "S-filtered-telemetry";
		seedCompleteEvidence(root, session);
		const telemetryPath = resolveTelemetryEventPath(root);
		mkdirSync(dirname(telemetryPath), { recursive: true });
		writeFileSync(
			telemetryPath,
			`${Array.from({ length: 5_000 }, (_, index) =>
				JSON.stringify({
					schema_version: "1",
					id: `TEL-OTHER-${index}`,
					ts: "2026-07-28T20:00:00.000Z",
					source: "afol-cli",
					event_type: "error",
					session_id: "S-OTHER",
				}),
			).join("\n")}\n`,
			"utf8",
		);

		expect(() =>
			ingestObservationsForSession({ root, projectId: PROJECT_ID, session }),
		).not.toThrow();
	});

	test("bounds the observation journal before observe parsing", () => {
		const root = fixtureRoot();
		const session = "S-oversized-journal";
		seedCompleteEvidence(root, session);
		const journalPath = observationJournalPath(root);
		mkdirSync(dirname(journalPath), { recursive: true });
		writeFileSync(
			journalPath,
			"x".repeat(OBSERVE_JOURNAL_LIMITS.maxBytes + 1),
			"utf8",
		);
		expect(() =>
			ingestObservationsForSession({ root, projectId: PROJECT_ID, session }),
		).toThrow("observation journal exceeds the byte limit");
		expect(existsSync(evolutionDbPath(root))).toBe(false);
	});

	test("foreign project identity fails closed", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01", "E-passed", PROJECT_ID);

		expect(() =>
			ingestObservationsForSession({
				root,
				projectId: "wrong-project-id",
				session: "S-01",
			}),
		).toThrow();
	});

	test("error and blocker telemetry become observations", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");
		// Telemetry for a different task than evidence
		telemetry(root, {
			event_type: "error",
			session_id: "S-01",
			task_id: "T-02",
			error_type: "TypeError",
		});
		telemetry(root, {
			event_type: "blocker",
			session_id: "S-01",
			task_id: "T-03",
		});

		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});

		expect(result.appended).toBe(2);
		expect(result.duplicates).toBe(0);
		expect(result.warnings).toEqual([]);
	});

	test("telemetry is isolated to the explicitly supplied project root", () => {
		const rootWithTelemetry = fixtureRoot();
		const isolatedRoot = fixtureRoot();
		seedCompleteEvidence(rootWithTelemetry, "S-01");
		seedCompleteEvidence(isolatedRoot, "S-01");
		telemetry(rootWithTelemetry, {
			event_type: "error",
			session_id: "S-01",
			task_id: "T-02",
			error_type: "TypeError",
		});

		const isolated = ingestObservationsForSession({
			root: isolatedRoot,
			projectId: PROJECT_ID,
			session: "S-01",
		});
		expect(isolated.appended).toBe(0);
		expect(existsSync(observationJournalPath(isolatedRoot))).toBe(false);

		const local = ingestObservationsForSession({
			root: rootWithTelemetry,
			projectId: PROJECT_ID,
			session: "S-01",
		});
		expect(local.appended).toBe(1);
	});

	test("passed evidence does not suppress telemetry error", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");
		// Add passed (non-failed) evidence for a task
		seedFailedEvidence(root, "S-01", [
			{ id: "E-passed-2", taskId: "T-01", exitCode: 0, result: "passed" },
		]);
		// Telemetry error for same task — should NOT be suppressed (no failed evidence)
		telemetry(root, {
			event_type: "error",
			session_id: "S-01",
			task_id: "T-01",
			error_type: "Timeout",
		});

		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});

		expect(result.appended).toBe(1); // Only telemetry error, passed evidence yields nada
		expect(result.duplicates).toBe(0);
	});

	test("failed evidence suppresses only equivalent telemetry (no error_type), retains distinct", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");
		seedFailedEvidence(root, "S-01", [
			{ id: "E-fail-1", taskId: "T-01", exitCode: 1, result: "failed" },
		]);
		// Telemetry WITHOUT error_type for same task → suppressed (truly equivalent)
		telemetry(root, {
			event_type: "error",
			session_id: "S-01",
			task_id: "T-01",
			cmd_type: "bun",
		});
		// Telemetry WITH error_type for same task → retained (distinct failure info)
		telemetry(root, {
			event_type: "error",
			session_id: "S-01",
			task_id: "T-01",
			error_type: "TypeError",
			cmd_type: "bun",
		});

		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});

		expect(result.appended).toBe(2); // evidence + distinct telemetry
		expect(result.duplicates).toBe(0);
	});

	test("blocker telemetry with matching failed evidence never suppressed", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");
		seedFailedEvidence(root, "S-01", [
			{ id: "E-fail-1", taskId: "T-01", exitCode: 1, result: "failed" },
		]);
		// Blocker with same task and cmd_type as failed evidence — never
		// suppressed (workflow_friction is semantically distinct).
		telemetry(root, {
			event_type: "blocker",
			session_id: "S-01",
			task_id: "T-01",
			cmd_type: "bun",
		});

		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});

		expect(result.appended).toBe(2); // evidence + blocker observation
		expect(result.duplicates).toBe(0);
	});

	test("duplicate idempotency: second call increments duplicates", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");
		seedFailedEvidence(root, "S-01", [
			{ id: "E-fail-1", exitCode: 1, result: "failed" },
		]);

		// First call
		const first = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});
		expect(first.appended).toBe(1);
		expect(first.duplicates).toBe(0);

		// Second call — same evidence, same content → duplicates
		const second = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});
		expect(second.appended).toBe(0);
		expect(second.duplicates).toBe(1);
		expect(second.skipped).toBe(0);
	});

	test("same-batch cross-source evidence plus telemetry with error_type retains both", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");
		seedFailedEvidence(root, "S-01", [
			{ id: "E-fail-1", taskId: "T-01", exitCode: 1, result: "failed" },
		]);
		// Telemetry error for same task with error_type → retained (distinct)
		telemetry(root, {
			event_type: "error",
			session_id: "S-01",
			task_id: "T-01",
			error_type: "TypeError",
			cmd_type: "bun",
		});

		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});

		expect(result.appended).toBe(2); // evidence + telemetry retained
		expect(result.duplicates).toBe(0);
	});

	test("same-batch exact evidence duplicate increments duplicates", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");
		seedFailedEvidence(root, "S-01", [
			{ id: "E-fail-1", exitCode: 1, result: "failed" },
			{ id: "E-fail-1", exitCode: 1, result: "failed" },
		]);
		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});
		expect(result.appended).toBe(1);
		expect(result.duplicates).toBe(1);
	});

	test("same-task distinct telemetry remains distinct", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");
		telemetry(root, {
			event_type: "error",
			session_id: "S-01",
			task_id: "T-01",
			cmd_type: "bun",
			error_type: "TypeError",
		});
		telemetry(root, {
			event_type: "error",
			session_id: "S-01",
			task_id: "T-01",
			cmd_type: "node",
			error_type: "Timeout",
		});
		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});
		expect(result.appended).toBe(2);
	});

	test("incomplete session cannot qualify for a production day", () => {
		const root = fixtureRoot();
		const sessionDir = makeSessionDir(root, "S-incomplete");
		writeFileSync(
			join(sessionDir, "S-incomplete_task_01.md"),
			"# Tasks\n\n## State Board\n\n| Task | State | Owner | Notes |\n|------|-------|-------|-------|\n| T-01 | in_progress | worker | incomplete |\n",
			"utf8",
		);
		writeEvidence(sessionDir, [
			{
				id: "E-pass-incomplete",
				task_id: "T-01",
				project_id: PROJECT_ID,
				session_id: "S-incomplete",
				created_at: "2026-07-20T10:00:00.000Z",
				command: "true",
				result: "passed",
				provenance: "observed",
				exit_code: 0,
				purpose: "completion",
				authorization_type: "execution",
			},
		]);
		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-incomplete",
		});
		expect(result.appended).toBe(0);
		expect(existsSync(productionDayJournalPath(root))).toBe(false);
	});

	test("incomplete session with failed evidence rejects zero mutation", () => {
		const root = fixtureRoot();
		const sessionDir = makeSessionDir(root, "S-inc-fail");
		// No task file at all → incomplete
		// Failed evidence that would be observed if session were complete
		writeFileSync(
			join(sessionDir, ".evidence.jsonl"),
			`${[
				JSON.stringify({
					id: "E-fail-inc",
					task_id: "T-01",
					project_id: PROJECT_ID,
					session_id: "S-inc-fail",
					created_at: "2026-07-20T11:00:00.000Z",
					command: "bun test",
					result: "failed",
					provenance: "observed",
					exit_code: 1,
					purpose: "completion",
					authorization_type: "execution",
				}),
			].join("\n")}\n`,
			"utf8",
		);

		// Snapshot journal state before ingest
		const journalPath = observationJournalPath(root);
		const journalBefore = existsSync(journalPath)
			? readFileSync(journalPath, "utf8")
			: null;

		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-inc-fail",
		});

		expect(result).toMatchObject({
			appended: 0,
			duplicates: 0,
			skipped: 0,
			warnings: [],
			observation_ids: [],
		});

		// Journal and production day not created
		const journalAfter = existsSync(journalPath)
			? readFileSync(journalPath, "utf8")
			: null;
		expect(journalAfter).toBe(journalBefore);
		expect(existsSync(productionDayJournalPath(root))).toBe(false);
	});

	test("unqualified failures remain observable without qualifying recurrence", () => {
		const root = fixtureRoot();
		try {
			for (const session of ["S-failed-1", "S-failed-2", "S-failed-3"]) {
				seedCompletedSession(root, session);
				seedFailedEvidence(root, session, [{ id: `E-${session}` }]);
				expect(
					ingestObservationsForSession({
						root,
						projectId: PROJECT_ID,
						session,
					}),
				).toMatchObject({ appended: 1 });
			}

			const observations = readObservationJournal(root, PROJECT_ID).map(
				(event) =>
					event.payload.observation as {
						production_day_sequence: number;
					},
			);
			expect(observations).toHaveLength(3);
			expect(
				observations.every(
					(observation) => observation.production_day_sequence === 0,
				),
			).toBe(true);
			expect(existsSync(productionDayJournalPath(root))).toBe(false);

			const db = openEvolutionDb(evolutionDbPath(root));
			try {
				expect(
					db
						.query(
							"SELECT state, occurrence_count, distinct_session_count, distinct_production_day_count FROM issue_clusters WHERE project_id = ?",
						)
						.get(PROJECT_ID),
				).toMatchObject({
					state: "candidate",
					occurrence_count: 3,
					distinct_session_count: 3,
					distinct_production_day_count: 0,
				});
			} finally {
				db.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("mixed-project qualifying_events do not inflate health counts", () => {
		const root = fixtureRoot();
		// Set up DB with correct project (has metadata)
		const db = seededDb(root, PROJECT_ID);
		db.close();

		// Manually insert a production day row with foreign project_id
		// to simulate mixed-project data
		const dbPath = evolutionDbPath(root);
		const rw = new Database(dbPath);
		try {
			rw.run(
				"INSERT INTO production_days (project_id,local_date,ordinal_sequence,ordinal,created_at,qualifying_events,journal_event_id) VALUES (?,?,?,?,?,?,?)",
				[
					OTHER_PROJECT_ID,
					"2026-07-21",
					2000,
					"2000",
					"2026-07-21T12:00:00.000Z",
					JSON.stringify(["E-foreign"]),
					"J-foreign",
				],
			);
		} finally {
			rw.close();
		}

		// Foreign rows are tolerated; queries scoped to native project.
		const health = checkEvolutionDbHealth(dbPath, PROJECT_ID);
		expect(health.db_exists).toBe(true);
		// Native production day counts only the project's own row (seeded),
		// not the foreign row.
		expect(health.production_day_count).toBe(1);
		// Foreign malformed qualifying_events are NOT checked because the
		// query is scoped to the native project_id.
		expect(health.ok).toBe(true);
	});

	test("explicit feedback without id fails before mutation", () => {
		const root = fixtureRoot();
		seedObservedPassedEvidence(root, "S-01");

		// Feedback is off by default; should fail immediately
		expect(() =>
			ingestObservationsForSession({
				root,
				projectId: PROJECT_ID,
				session: "S-01",
				feedbackId: "FB-nonexistent",
			}),
		).toThrow("Feedback mode is not local");
	});

	test("invalid feedback leaves existing journals and DB unchanged", () => {
		const root = fixtureRoot();
		const db = seededDb(root, PROJECT_ID);
		db.close();
		const productionPath = productionDayJournalPath(root);
		const dbPath = evolutionDbPath(root);
		const productionBefore = readFileSync(productionPath, "utf8");
		const dbBefore = readFileSync(dbPath);
		const observationPath = observationJournalPath(root);
		const originalMode = process.env.AFOL_FEEDBACK_MODE;
		process.env.AFOL_FEEDBACK_MODE = "local";
		try {
			expect(() =>
				ingestObservationsForSession({
					root,
					projectId: PROJECT_ID,
					session: "S-prod",
					feedbackId: "FB-invalid",
				}),
			).toThrow("Feedback report not found");
			expect(readFileSync(productionPath, "utf8")).toBe(productionBefore);
			expect(readFileSync(dbPath)).toEqual(dbBefore);
			expect(existsSync(observationPath)).toBe(false);
		} finally {
			process.env.AFOL_FEEDBACK_MODE = originalMode;
		}
	});

	test("positive explicit feedback-id ingests observation with source refs", () => {
		// Isolate feedback state via environment.
		const origMode = process.env.AFOL_FEEDBACK_MODE;
		const origState = process.env.AFOL_STATE_HOME;
		const fbRoot = mkdtempSync(join(tmpdir(), "obs-ingest-fb-"));
		process.env.AFOL_FEEDBACK_MODE = "local";
		process.env.AFOL_STATE_HOME = fbRoot;
		try {
			expect(feedbackMode()).toBe("local");
			const report = recordFeedback(
				{ kind: "test_feedback", message: "user correction via test" },
				undefined,
				"FB-positive-test-01",
			);
			expect(report).not.toBeNull();
			expect(report?.report_id).toBe("FB-positive-test-01");

			const root = fixtureRoot();
			seedCompleteEvidence(root, "S-01");

			const result = ingestObservationsForSession({
				root,
				projectId: PROJECT_ID,
				session: "S-01",
				feedbackId: "FB-positive-test-01",
			});

			expect(result.appended).toBe(1); // feedback observation
			expect(result.duplicates).toBe(0);
			expect(result.warnings).toEqual([]);

			// Verify the observation journal contains the feedback source ref.
			const journal = readObservationJournal(root, PROJECT_ID);
			const fbObservation = journal.find(
				(e) =>
					e.event_type === "observation" &&
					e.source_refs.some(
						(ref) =>
							ref.kind === "feedback" && ref.id === "FB-positive-test-01",
					),
			);
			expect(fbObservation).toBeDefined();
			expect(fbObservation?.source_refs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "FB-positive-test-01",
						kind: "feedback",
					}),
				]),
			);
		} finally {
			process.env.AFOL_FEEDBACK_MODE = origMode;
			process.env.AFOL_STATE_HOME = origState;
			removeEvolutionTestRoot(fbRoot);
		}
	});

	test("status is read-only (no writes)", () => {
		const root = fixtureRoot();
		seedCompleteEvidence(root, "S-01");

		const db = seededDb(root, PROJECT_ID);
		// Verify initial journal state
		const journalBefore = readObservationJournal(root, PROJECT_ID);
		const obsBefore = journalBefore.filter(
			(e) => e.event_type === "observation",
		);
		expect(obsBefore).toHaveLength(0);

		// Run ingest
		seedFailedEvidence(root, "S-01", [
			{ id: "E-fail-1", exitCode: 1, result: "failed" },
		]);
		const result = ingestObservationsForSession({
			root,
			projectId: PROJECT_ID,
			session: "S-01",
		});
		expect(result.appended).toBe(1);

		// Observations are written to the journal file
		const journalAfter = readObservationJournal(root, PROJECT_ID);
		const obsAfter = journalAfter.filter((e) => e.event_type === "observation");
		expect(obsAfter).toHaveLength(1);

		// Calling status does not write — observation count from DB remains same
		// (DB projection is rebuilt separately; journal is the source of truth)
		const status1 = getEvolutionStatus(db, PROJECT_ID);
		const status2 = getEvolutionStatus(db, PROJECT_ID);
		expect(status2.observation_count).toBe(status1.observation_count);
		db.close();
	});
});

describe("evolve command parsing", () => {
	test("parseObserveArgs rejects missing session", async () => {
		const { parseObserveArgs } = await import("../commands/evolve");
		expect(() => parseObserveArgs([])).toThrow("requires --session");
		expect(() => parseObserveArgs(["--json"])).toThrow("requires --session");
	});

	test("parseObserveArgs returns feedbackId only when provided", async () => {
		const { parseObserveArgs } = await import("../commands/evolve");
		const without = parseObserveArgs(["--session", "S-01"]);
		expect("feedbackId" in without).toBe(false);
		expect(without.session).toBe("S-01");

		const withFb = parseObserveArgs([
			"--session",
			"S-01",
			"--feedback-id",
			"FB-1",
		]);
		expect("feedbackId" in withFb).toBe(true);
		expect("feedbackId" in withFb ? withFb.feedbackId : undefined).toBe("FB-1");
		expect(() =>
			parseObserveArgs(["--session", "S-01", "--feedback-id"]),
		).toThrow("--feedback-id requires a value");
		expect(() => parseObserveArgs(["--session", "S-\n01"])).toThrow(
			"session identifier is invalid",
		);
		expect(() =>
			parseObserveArgs(["--session", "S-01", "--feedback-id", "x".repeat(257)]),
		).toThrow("feedback identifier is invalid");
	});
});

describe("health scoping", () => {
	test("filtered counts match project-specific rows", () => {
		const root = fixtureRoot();
		const db = seededDb(root, PROJECT_ID);

		// Insert a foreign observation row directly
		const dbPath = evolutionDbPath(root);
		const rw = new Database(dbPath);
		try {
			rw.run(
				"INSERT INTO observations (project_id,id,kind,fingerprint,fingerprint_version,occurrence_identity,session_id,production_day_sequence,task_type,impact,normalized_fields,source_refs,created_at,journal_sequence,journal_event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
				[
					PROJECT_ID,
					"O-native",
					"tool_failure",
					"abc",
					1,
					"occ-1",
					"S-01",
					1,
					"test",
					"failed",
					JSON.stringify({ kind: "tool_failure" }),
					JSON.stringify([{ id: "E-1", kind: "evidence" }]),
					"2026-07-20T12:00:00.000Z",
					1,
					"J-obs-1",
				],
			);
			// Insert a foreign observation
			rw.run(
				"INSERT INTO observations (project_id,id,kind,fingerprint,fingerprint_version,occurrence_identity,session_id,production_day_sequence,task_type,impact,normalized_fields,source_refs,created_at,journal_sequence,journal_event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
				[
					OTHER_PROJECT_ID,
					"O-foreign",
					"tool_failure",
					"def",
					1,
					"occ-2",
					"S-foreign",
					1,
					"test",
					"failed",
					JSON.stringify({ kind: "tool_failure" }),
					JSON.stringify([{ id: "E-2", kind: "evidence" }]),
					"2026-07-20T12:00:00.000Z",
					2,
					"J-obs-2",
				],
			);
		} finally {
			rw.close();
		}

		// Foreign rows are tolerated; queries scoped to native project.
		const health = checkEvolutionDbHealth(dbPath, PROJECT_ID);
		expect(health.db_exists).toBe(true);
		// Only the O-native observation is counted.
		expect(health.observation_count).toBe(1);
		expect(health.ok).toBe(true);
		db.close();
	});
});
