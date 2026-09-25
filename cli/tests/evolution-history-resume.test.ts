import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveTelemetryEventPath } from "../services/events/telemetry";
import { openEvolutionDb } from "../services/evolution/db";
import {
	HISTORY_BACKFILL_EXTRACTOR_VERSION,
	previewHistoryBackfill,
	runHistoryBackfill,
} from "../services/evolution/history-backfill";
import { readHistoryBackfillCursor } from "../services/evolution/history-cursor";
import { enumerateEvolutionHistorySessions } from "../services/evolution/history-sessions";
import {
	productionDayJournalPath,
	readProductionDayJournal,
	resolveProductionDayReceipt,
} from "../services/evolution/journal";
import {
	observationJournalPath,
	readObservationJournal,
} from "../services/evolution/observation-journal";
import { resolveEvolutionRuntime } from "../services/evolution/runtime-config";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "7c1f42ab-2ba7-4d9e-9a10-52d84c1b3a6f";
const T1 = new Date("2026-08-11T10:00:00.000Z");
const T2 = new Date("2026-08-11T11:00:00.000Z");
const T3 = new Date("2026-08-11T12:00:00.000Z");
const EVIDENCE_AT = "2026-08-11T12:00:00.000Z";

function taskDocument(session: string, closed: boolean): string {
	return `---\ndoc_type: "workbench_task"\nid: "${session}_task_01"\nsession_id: "${session}"\nstatus: "${closed ? "closed" : "open"}"\ncreated_at: "2026-08-11T12:00:00.000Z"\nupdated_at: "2026-08-11T12:00:00.000Z"${closed ? '\nclosed_at: "2026-08-11T12:00:00.000Z"' : ""}\n---\n\n## State Board\n\n| Task | State | Owner | Notes |\n| --- | --- | --- | --- |\n| T-01 | ${closed ? "done" : "in_progress"} | agent | complete |\n`;
}

function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "evolution-history-resume-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb", ".locks"));
	mkdirSync(join(root, ".afol", "wb", "_archive"));
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "fixture", id: PROJECT_ID, timezone: "UTC" },
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
	return root;
}

function sessionDirectory(
	root: string,
	session: string,
	location: "live" | "archived" = "live",
): string {
	return location === "archived"
		? join(root, ".afol", "wb", "_archive", session)
		: join(root, ".afol", "wb", session);
}

type EvidenceSpec = {
	id: string;
	session: string;
	result?: "passed" | "failed";
	provenance?: "observed" | "declared";
	exit_code?: number;
};

function evidenceLine(spec: EvidenceSpec): string {
	return `${JSON.stringify({
		id: spec.id,
		task_id: "T-01",
		project_id: PROJECT_ID,
		session_id: spec.session,
		result: spec.result ?? "failed",
		provenance: spec.provenance ?? "observed",
		purpose: "completion",
		authorization_type: "execution",
		command: "bun test",
		exit_code: spec.exit_code ?? 1,
		created_at: EVIDENCE_AT,
	})}\n`;
}

function writeSession(
	root: string,
	session: string,
	options: {
		location?: "live" | "archived";
		closed?: boolean;
		evidence?: EvidenceSpec[];
	} = {},
): string {
	const dir = sessionDirectory(root, session, options.location ?? "live");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${session}_task_01.md`),
		taskDocument(session, options.closed ?? true),
	);
	if (options.evidence && options.evidence.length > 0)
		writeFileSync(
			join(dir, ".evidence.jsonl"),
			options.evidence.map((spec) => evidenceLine(spec)).join(""),
		);
	return dir;
}

function telemetryLine(input: {
	id: string;
	session: string;
	note?: string;
}): string {
	return `${JSON.stringify({
		schema_version: "1",
		id: input.id,
		ts: EVIDENCE_AT,
		source: "afol-cli",
		event_type: "error",
		session_id: input.session,
		...(input.note ? { note: input.note } : {}),
	})}\n`;
}

function writeTelemetry(root: string, lines: string[]): void {
	const path = resolveTelemetryEventPath(root);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, lines.join(""));
}

function journalText(root: string): string | null {
	const path = observationJournalPath(root);
	return existsSync(path) ? readFileSync(path, "utf8") : null;
}

type ObservationView = {
	id: string;
	session_id: string;
	source_ids: string[];
	production_day_sequence: number;
};

function observationViews(root: string): ObservationView[] {
	if (!existsSync(observationJournalPath(root))) return [];
	return readObservationJournal(root, PROJECT_ID)
		.filter((event) => event.event_type === "observation")
		.map((event) => {
			const observation = event.payload.observation as Record<string, unknown>;
			return {
				id: String(observation.id),
				session_id: String(observation.session_id),
				production_day_sequence: Number(
					observation.production_day_sequence ?? 0,
				),
				source_ids: (
					observation.source_refs as Array<Record<string, string>>
				).map((ref) => ref.id as string),
			};
		});
}

function cursorFor(root: string, session: string) {
	const db = openEvolutionDb(resolveEvolutionRuntime(root).dbPath);
	try {
		return readHistoryBackfillCursor(
			db,
			PROJECT_ID,
			session,
			HISTORY_BACKFILL_EXTRACTOR_VERSION,
		);
	} finally {
		db.close();
	}
}

describe("evolution history enumerator", () => {
	test("enumerates open, closed, and archived sessions and reports one conflict identity", () => {
		const root = fixtureRoot();
		try {
			writeSession(root, "S-open", { closed: false });
			writeSession(root, "S-closed");
			writeSession(root, "S-both");
			writeSession(root, "S-arch", { location: "archived" });
			writeSession(root, "S-both", { location: "archived" });
			mkdirSync(join(root, ".afol", "wb", "screenshots"), {
				recursive: true,
			});
			mkdirSync(join(root, ".afol", "wb", "_archive", "screenshots"), {
				recursive: true,
			});
			mkdirSync(join(root, ".afol", "wb", ".hidden"), { recursive: true });
			const enumeration = enumerateEvolutionHistorySessions(root);
			expect(enumeration.conflicts).toEqual(["S-both"]);
			expect(enumeration.sessions).toEqual([
				{ session_id: "S-arch", location: "archived" },
				{ session_id: "S-closed", location: "live" },
				{ session_id: "S-open", location: "live" },
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preview counts archived sessions in coverage without opening the evolution db", () => {
		const root = fixtureRoot();
		try {
			writeSession(root, "S-live-closed", {
				evidence: [{ id: "E-live", session: "S-live-closed" }],
			});
			writeSession(root, "S-arch-closed", {
				location: "archived",
				evidence: [{ id: "E-arch", session: "S-arch-closed" }],
			});
			const preview = previewHistoryBackfill({ root, limit: 10 });
			expect(preview.read_only).toBe(true);
			expect(preview.coverage).toMatchObject({
				session_dirs: 2,
				archived: 1,
				conflicts: 0,
				canonical_closed: 2,
				eligible: 2,
			});
			expect(
				preview.sources.sessions.map((session) => session.session_id).sort(),
			).toEqual(["S-arch-closed", "S-live-closed"]);
			expect(
				preview.sources.sessions.find(
					(session) => session.session_id === "S-arch-closed",
				),
			).toMatchObject({ observation: { pending: 1, observed: 0 } });
			expect(existsSync(join(root, ".afol", "state", "evolution.db"))).toBe(
				false,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("evolution history backfill resume", () => {
	test("ingests observed failures from an open session without changing workbench state or allocating a production day", () => {
		const root = fixtureRoot();
		try {
			const sessionDir = writeSession(root, "S-open", {
				closed: false,
				evidence: [
					{
						id: "E-open-pass",
						session: "S-open",
						result: "passed",
						exit_code: 0,
					},
					{ id: "E-open-fail", session: "S-open" },
				],
			});
			const taskPath = join(sessionDir, "S-open_task_01.md");
			const originalTask = readFileSync(taskPath, "utf8");
			const first = runHistoryBackfill({ root, now: T1 });
			expect(first.coverage).toMatchObject({ open: 1, eligible: 1 });
			expect(first.sessions[0]).toMatchObject({
				session_id: "S-open",
				outcome: "ingested",
				appended: 1,
				cursor: { status: "complete" },
			});
			expect(observationViews(root)).toMatchObject([
				{ session_id: "S-open", source_ids: ["E-open-fail"] },
			]);
			expect(existsSync(productionDayJournalPath(root))).toBe(false);
			expect(readFileSync(taskPath, "utf8")).toBe(originalTask);

			const second = runHistoryBackfill({ root, now: T2 });
			expect(second.sessions[0]).toMatchObject({ outcome: "unchanged" });
			expect(observationViews(root)).toHaveLength(1);
			expect(readFileSync(taskPath, "utf8")).toBe(originalTask);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("ingests an archived session and an unchanged rerun writes nothing", () => {
		const root = fixtureRoot();
		try {
			writeSession(root, "S-arch", {
				location: "archived",
				evidence: [{ id: "E-arch", session: "S-arch" }],
			});
			const first = runHistoryBackfill({ root, now: T1 });
			expect(first.sessions).toEqual([
				{
					session_id: "S-arch",
					location: "archived",
					outcome: "ingested",
					appended: 1,
					duplicates: 0,
					cursor: { status: "complete", byte_offset: 0 },
				},
			]);
			expect(first.totals).toEqual({
				appended: 1,
				duplicates: 0,
				unchanged: 0,
				pending: 0,
				failed: 0,
			});
			const cursor = cursorFor(root, "S-arch");
			expect(cursor).toMatchObject({
				source_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
				status: "complete",
				byte_offset: 0,
				updated_at: T1.toISOString(),
			});
			expect(observationViews(root)).toEqual([
				{
					id: expect.stringMatching(/^O-/),
					session_id: "S-arch",
					source_ids: ["E-arch"],
					production_day_sequence: 0,
				},
			]);
			const journalAfterFirst = journalText(root);
			const second = runHistoryBackfill({ root, now: T2 });
			expect(second.sessions[0]).toMatchObject({
				session_id: "S-arch",
				location: "archived",
				outcome: "unchanged",
				appended: 0,
			});
			expect(second.totals).toMatchObject({
				appended: 0,
				unchanged: 1,
				failed: 0,
			});
			expect(journalText(root)).toBe(journalAfterFirst);
			expect(cursorFor(root, "S-arch")?.updated_at).toBe(T1.toISOString());
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("moving a session to the archive keeps one identity and one observation row", () => {
		const root = fixtureRoot();
		try {
			const live = writeSession(root, "S-moved", {
				evidence: [{ id: "E-moved", session: "S-moved" }],
			});
			const first = runHistoryBackfill({ root, now: T1 });
			expect(first.sessions[0]).toMatchObject({
				session_id: "S-moved",
				location: "live",
				outcome: "ingested",
				appended: 1,
			});
			rmSync(live, { recursive: true, force: true });
			writeSession(root, "S-moved", {
				location: "archived",
				evidence: [{ id: "E-moved", session: "S-moved" }],
			});
			const second = runHistoryBackfill({ root, now: T2 });
			expect(second.sessions[0]).toMatchObject({
				session_id: "S-moved",
				location: "archived",
				outcome: "unchanged",
				appended: 0,
			});
			expect(observationViews(root)).toHaveLength(1);
			const db = openEvolutionDb(resolveEvolutionRuntime(root).dbPath);
			try {
				const rows = db
					.query(
						"SELECT COUNT(*) AS count FROM history_backfill_cursors WHERE session_id = ?",
					)
					.get("S-moved") as { count: number };
				expect(rows.count).toBe(1);
			} finally {
				db.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("records one conflict and leaves both trees untouched", () => {
		const root = fixtureRoot();
		try {
			const liveEvidence = evidenceLine({
				id: "E-conflict-live",
				session: "S-both",
			});
			const archivedEvidence = evidenceLine({
				id: "E-conflict-arch",
				session: "S-both",
			});
			const live = writeSession(root, "S-both");
			writeFileSync(join(live, ".evidence.jsonl"), liveEvidence);
			const archived = writeSession(root, "S-both", { location: "archived" });
			writeFileSync(join(archived, ".evidence.jsonl"), archivedEvidence);
			writeSession(root, "S-ok", {
				evidence: [{ id: "E-ok", session: "S-ok" }],
			});
			const run = runHistoryBackfill({ root, limit: 10, now: T1 });
			expect(run.conflicts).toEqual(["S-both"]);
			expect(run.sessions.map((session) => session.session_id)).toEqual([
				"S-ok",
			]);
			expect(run.sessions[0]).toMatchObject({
				outcome: "ingested",
				appended: 1,
			});
			expect(cursorFor(root, "S-both")).toBeNull();
			expect(
				observationViews(root).filter(
					(observation) => observation.session_id === "S-both",
				),
			).toEqual([]);
			expect(readFileSync(join(live, ".evidence.jsonl"), "utf8")).toBe(
				liveEvidence,
			);
			expect(readFileSync(join(archived, ".evidence.jsonl"), "utf8")).toBe(
				archivedEvidence,
			);
			const preview = previewHistoryBackfill({ root, limit: 10 });
			expect(preview.conflicts).toEqual(["S-both"]);
			expect(preview.coverage).toMatchObject({ conflicts: 1, eligible: 1 });
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("a changed source reprocesses only the changed session", () => {
		const root = fixtureRoot();
		try {
			writeSession(root, "S-a", {
				evidence: [{ id: "E-a-1", session: "S-a" }],
			});
			writeSession(root, "S-b", {
				evidence: [{ id: "E-b-1", session: "S-b" }],
			});
			const first = runHistoryBackfill({ root, limit: 10, now: T1 });
			expect(first.totals).toMatchObject({ appended: 2, unchanged: 0 });
			writeFileSync(
				join(sessionDirectory(root, "S-a"), ".evidence.jsonl"),
				`${evidenceLine({ id: "E-a-1", session: "S-a" })}${evidenceLine({
					id: "E-a-2",
					session: "S-a",
				})}`,
			);
			const second = runHistoryBackfill({ root, limit: 10, now: T2 });
			expect(second.sessions).toEqual([
				expect.objectContaining({
					session_id: "S-a",
					outcome: "ingested",
					appended: 1,
					duplicates: 1,
				}),
				expect.objectContaining({
					session_id: "S-b",
					outcome: "unchanged",
					appended: 0,
				}),
			]);
			expect(observationViews(root)).toHaveLength(3);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("an oversized telemetry source stays pending and resumes by page without duplicate ids", () => {
		const root = fixtureRoot();
		try {
			const sessionDir = writeSession(root, "S-big", { closed: false });
			const taskPath = join(sessionDir, "S-big_task_01.md");
			const originalTask = readFileSync(taskPath, "utf8");
			// 110 matched lines of ~10.4KB exceed the 1MB telemetry byte limit,
			// so each call may only drain one bounded page.
			const eventCount = 110;
			writeTelemetry(
				root,
				Array.from({ length: eventCount }, (_, index) =>
					telemetryLine({
						id: `TEL-big-${index}`,
						session: "S-big",
						note: "x".repeat(10 * 1024),
					}),
				),
			);
			const preview = previewHistoryBackfill({ root, limit: 10 });
			expect(preview.skip_reasons.telemetry_limit_exceeded).toBe(1);
			expect(preview.coverage).toMatchObject({ eligible: 1 });
			const first = runHistoryBackfill({ root, now: T1 });
			expect(first.sessions[0]).toMatchObject({
				session_id: "S-big",
				outcome: "pending",
			});
			const pendingCursor = cursorFor(root, "S-big");
			expect(pendingCursor).toMatchObject({
				status: "pending",
				source_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
			});
			if (!pendingCursor) throw new Error("expected pending cursor");
			expect(pendingCursor.byte_offset).toBeGreaterThan(0);
			expect(first.sessions[0]?.appended).toBeGreaterThan(0);
			expect(first.sessions[0]?.appended ?? 0).toBeLessThan(eventCount);
			// The gap between calls is a kill between two pages: the second call
			// resumes after the cursor and must not duplicate observation ids.
			const second = runHistoryBackfill({ root, now: T2 });
			expect(second.sessions[0]).toMatchObject({
				session_id: "S-big",
				outcome: "ingested",
			});
			const completeCursor = cursorFor(root, "S-big");
			expect(completeCursor).toMatchObject({
				status: "complete",
				updated_at: T2.toISOString(),
			});
			const views = observationViews(root);
			expect(views).toHaveLength(eventCount);
			expect(new Set(views.map((view) => view.id)).size).toBe(eventCount);
			expect(views.every((view) => view.session_id === "S-big")).toBe(true);
			expect(existsSync(productionDayJournalPath(root))).toBe(false);
			expect(readFileSync(taskPath, "utf8")).toBe(originalTask);
			const third = runHistoryBackfill({ root, now: T3 });
			expect(third.sessions[0]).toMatchObject({
				outcome: "unchanged",
				appended: 0,
			});
			expect(observationViews(root)).toHaveLength(eventCount);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("does not complete a cursor after an observation projection warning and retries the failed append", () => {
		const root = fixtureRoot();
		try {
			writeSession(root, "S-retry", {
				evidence: [{ id: "E-retry", session: "S-retry" }],
			});
			const db = openEvolutionDb(resolveEvolutionRuntime(root).dbPath);
			try {
				db.exec(
					"CREATE TRIGGER retry_projection_failure BEFORE INSERT ON observations BEGIN SELECT RAISE(ABORT, 'transient projection failure'); END",
				);
			} finally {
				db.close();
			}

			const first = runHistoryBackfill({ root, now: T1 });
			expect(first.sessions[0]).toMatchObject({
				outcome: "error",
				cursor: null,
			});
			expect(cursorFor(root, "S-retry")).toBeNull();
			expect(observationViews(root)).toEqual([]);

			const recoveredDb = openEvolutionDb(resolveEvolutionRuntime(root).dbPath);
			try {
				recoveredDb.exec("DROP TRIGGER retry_projection_failure");
			} finally {
				recoveredDb.close();
			}
			const second = runHistoryBackfill({ root, now: T2 });
			expect(second.sessions[0]).toMatchObject({
				outcome: "ingested",
				appended: 1,
				cursor: { status: "complete" },
			});
			expect(cursorFor(root, "S-retry")?.status).toBe("complete");
			expect(observationViews(root)).toHaveLength(1);
			const third = runHistoryBackfill({ root, now: T3 });
			expect(third.sessions[0]).toMatchObject({ outcome: "unchanged" });
			expect(observationViews(root)).toHaveLength(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects mixed-owner duplicate evidence before normal or paged writes", () => {
		for (const oversized of [false, true]) {
			const root = fixtureRoot();
			try {
				const session = "S-mixed-owner";
				const sessionDir = writeSession(root, session, {
					closed: false,
				});
				writeFileSync(
					join(sessionDir, ".evidence.jsonl"),
					[
						evidenceLine({ id: "E-mixed-owner", session }),
						evidenceLine({ id: "E-mixed-owner", session: "S-foreign" }),
					].join(""),
				);
				if (oversized) {
					const note = "x".repeat(10_200);
					writeTelemetry(
						root,
						Array.from({ length: 110 }, (_, index) =>
							telemetryLine({
								id: `E-mixed-telemetry-${index}`,
								session,
								note,
							}),
						),
					);
				}

				const result = runHistoryBackfill({ root, now: T1 });
				expect(result.sessions[0]).toMatchObject({
					outcome: "error",
					reason: "evidence id has conflicting ownership",
					cursor: null,
				});
				expect(cursorFor(root, session)).toBeNull();
				expect(observationViews(root)).toEqual([]);
				expect(existsSync(observationJournalPath(root))).toBe(false);
				expect(existsSync(productionDayJournalPath(root))).toBe(false);
			} finally {
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("normal and oversized ingestion allocate the same production day and observation ordinal", () => {
		const sequenceFor = (oversized: boolean) => {
			const root = fixtureRoot();
			try {
				const session = oversized ? "S-large-complete" : "S-small-complete";
				const sessionDir = writeSession(root, session, {
					closed: false,
					evidence: [
						{
							id: `E-pass-${session}`,
							session,
							result: "passed",
							exit_code: 0,
						},
					],
				});
				const taskPath = join(sessionDir, `${session}_task_01.md`);
				writeFileSync(
					taskPath,
					readFileSync(taskPath, "utf8").replace(
						"| T-01 | in_progress |",
						"| T-01 | done |",
					),
				);
				if (oversized) {
					const note = "x".repeat(10_200);
					writeTelemetry(
						root,
						Array.from({ length: 110 }, (_, index) =>
							telemetryLine({
								id: `E-large-complete-${index}`,
								session,
								note,
							}),
						),
					);
				} else {
					writeTelemetry(root, [
						telemetryLine({ id: "E-small-complete", session }),
					]);
				}
				const result = runHistoryBackfill({ root, now: T1 });
				expect(result.coverage.legacy_terminal).toBe(1);
				expect(result.sessions[0]?.outcome).toBe(
					oversized ? "pending" : "ingested",
				);
				const productionDays = readProductionDayJournal(
					root,
					PROJECT_ID,
					"UTC",
				);
				expect(productionDays).toHaveLength(1);
				const receipt = resolveProductionDayReceipt({
					root,
					projectId: PROJECT_ID,
					timezone: "UTC",
					evidenceId: `E-pass-${session}`,
				});
				expect(receipt?.ordinal_sequence).toBe(1);
				const observations = observationViews(root);
				expect(observations.length).toBeGreaterThan(0);
				expect(
					observations.every(
						(observation) =>
							observation.production_day_sequence === receipt?.ordinal_sequence,
					),
				).toBe(true);
				return observations[0]?.production_day_sequence;
			} finally {
				removeEvolutionTestRoot(root);
			}
		};

		expect(sequenceFor(false)).toBe(sequenceFor(true));
	});

	test("declared successes and declared failures never become observations", () => {
		const root = fixtureRoot();
		try {
			writeSession(root, "S-declared", {
				evidence: [
					{
						id: "E-decl-pass",
						session: "S-declared",
						result: "passed",
						provenance: "declared",
						exit_code: 0,
					},
					{
						id: "E-decl-fail",
						session: "S-declared",
						result: "failed",
						provenance: "declared",
						exit_code: 1,
					},
					{ id: "E-obs-fail", session: "S-declared", exit_code: 1 },
				],
			});
			const run = runHistoryBackfill({ root, now: T1 });
			expect(run.sessions[0]).toMatchObject({
				session_id: "S-declared",
				outcome: "ingested",
				appended: 1,
			});
			const views = observationViews(root);
			expect(views.map((view) => view.source_ids[0])).toEqual(["E-obs-fail"]);
			expect(journalText(root)).not.toContain("E-decl-pass");
			expect(journalText(root)).not.toContain("E-decl-fail");
			expect(cursorFor(root, "S-declared")?.status).toBe("complete");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
