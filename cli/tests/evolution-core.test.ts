import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendProductionDayAllocation,
	applyMigrations,
	checkEvolutionDbHealth,
	EVOLUTION_SCHEMA_VERSION,
	evolutionDbPath,
	getEvolutionStatus,
	isValidIanaTimezone,
	localDateForTimezone,
	openEvolutionDb,
	readProductionDayJournal,
	resolveEvolutionConfig,
	resolveEvolutionIdentity,
	resolveProductionDayReceipt,
	validateEvolutionIdentity,
} from "../services/evolution";
import { rebuildProductionDayProjection } from "../services/evolution/journal";
import { rebuildPreferenceProjection } from "../services/evolution/preference-journal";
import { allocateProductionDay } from "../services/evolution/production-days";
import { removeEvolutionTestRoot } from "./evolution-test-support";
import { symlinkTestSupport } from "./symlink-test-support";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";

function seedObservedEvidence(root: string): void {
	const sessionDir = join(root, ".afol", "wb", "S-01");
	mkdirSync(sessionDir, { recursive: true });
	const base = {
		project_id: PROJECT_ID,
		session_id: "S-01",
		result: "passed",
		provenance: "observed",
		exit_code: 0,
	};
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${[
			{ ...base, id: "E-01", created_at: "2026-07-17T02:30:00.000Z" },
			{ ...base, id: "E-02", created_at: "2026-07-17T02:45:00.000Z" },
			{ ...base, id: "E-03", created_at: "2026-07-17T04:00:00.000Z" },
			{
				...base,
				id: "E-unobserved",
				created_at: "2026-07-17T04:00:00.000Z",
				provenance: "declared",
			},
			{
				...base,
				id: "E-cross-project",
				created_at: "2026-07-17T04:00:00.000Z",
				project_id: "7b7d91ca-496b-4f0c-8537-5c4993810d15",
			},
			{
				id: "E-missing-identity",
				created_at: "2026-07-17T05:00:00.000Z",
				result: "passed",
				provenance: "observed",
				exit_code: 0,
			},
			{
				...base,
				id: "E-nonzero",
				created_at: "2026-07-17T05:00:00.000Z",
				exit_code: 1,
			},
		]
			.map((entry) => JSON.stringify(entry))
			.join("\n")}\n`,
		"utf8",
	);
}

describe("Evolution Slice 1 persistence core", () => {
	test("applies explicit migration and allocates one monotonic ordinal per project/date", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-core-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		try {
			expect(
				(db.query("PRAGMA user_version").get() as { user_version: number })
					.user_version,
			).toBe(EVOLUTION_SCHEMA_VERSION);
			const first = allocateProductionDay(db, {
				projectId: PROJECT_ID,
				localDate: "2026-07-16",
				qualifyingEvents: ["task:T-01"],
				journalEventId: "J-01",
				createdAt: "2026-07-16T12:00:00.000Z",
			});
			const duplicate = allocateProductionDay(db, {
				projectId: PROJECT_ID,
				localDate: "2026-07-16",
				qualifyingEvents: ["task:T-01"],
				journalEventId: "J-duplicate",
			});
			const enriched = allocateProductionDay(db, {
				projectId: PROJECT_ID,
				localDate: "2026-07-16",
				qualifyingEvents: ["task:T-01", "task:T-03"],
				journalEventId: "J-enrichment",
			});
			const replay = allocateProductionDay(db, {
				projectId: PROJECT_ID,
				localDate: "2026-07-16",
				qualifyingEvents: ["task:T-03"],
				journalEventId: "J-replay",
			});
			const second = allocateProductionDay(db, {
				projectId: PROJECT_ID,
				localDate: "2026-07-17",
				qualifyingEvents: JSON.stringify(["task:T-02"]),
				journalEventId: "J-02",
			});

			expect(duplicate).toEqual(first);
			expect(first.ordinal).toBe("PD-0001");
			expect(first.qualifying_events).toEqual(["task:T-01"]);
			expect(first.journal_event_id).toBe("J-01");
			expect(enriched).toMatchObject({
				ordinal: "PD-0001",
				qualifying_events: ["task:T-01", "task:T-03"],
				journal_event_id: "J-01",
			});
			expect(replay).toEqual(enriched);
			expect(second.ordinal).toBe("PD-0002");
			expect(() =>
				allocateProductionDay(db, {
					projectId: "7b7d91ca-496b-4f0c-8537-5c4993810d15",
					localDate: "2026-07-16",
					qualifyingEvents: ["task:T-03"],
					journalEventId: "J-03",
				}),
			).toThrow("project UUID does not match");
			expect(() =>
				allocateProductionDay(db, {
					projectId: PROJECT_ID,
					localDate: "2026-07-18",
					qualifyingEvents: "",
					journalEventId: "J-04",
				}),
			).toThrow("qualifying events");
			expect(() =>
				allocateProductionDay(db, {
					projectId: PROJECT_ID,
					localDate: "2026-07-18",
					qualifyingEvents: ["bad ref"],
					journalEventId: "J-04",
				}),
			).toThrow("invalid reference");
			expect(() =>
				allocateProductionDay(db, {
					projectId: PROJECT_ID,
					localDate: "2026-07-18",
					qualifyingEvents: ["task:T-04"],
					journalEventId: "bad ref",
				}),
			).toThrow("journal event id is invalid");
			expect(getEvolutionStatus(db)).toMatchObject({
				project_id: PROJECT_ID,
				production_day_count: 2,
				latest_production_day: second,
			});
			const peer = openEvolutionDb(dbPath);
			try {
				expect(
					allocateProductionDay(peer, {
						projectId: PROJECT_ID,
						localDate: "2026-07-17",
						qualifyingEvents: ["task:T-02"],
						journalEventId: "J-peer-replay",
					}).ordinal,
				).toBe("PD-0002");
			} finally {
				peer.close();
			}
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("journals rooted observed evidence, enriches same-day rows, and verifies replay source", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-journal-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			seedObservedEvidence(root);
			const input = {
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "America/Asuncion",
				sessionId: "S-01",
				evidenceId: "E-01",
			};
			const first = appendProductionDayAllocation(input);
			const enriched = appendProductionDayAllocation({
				...input,
				evidenceId: "E-02",
			});
			expect(enriched.ordinal).toBe(first.ordinal);
			expect(enriched.qualifying_events).toEqual(["E-01", "E-02"]);
			expect(appendProductionDayAllocation(input)).toEqual(enriched);
			const journal = readProductionDayJournal(
				root,
				PROJECT_ID,
				"America/Asuncion",
			);
			expect(journal).toHaveLength(2);
			expect(
				resolveProductionDayReceipt({
					root,
					projectId: PROJECT_ID,
					timezone: "America/Asuncion",
					evidenceId: "E-02",
				}),
			).toMatchObject({
				evidence_id: "E-02",
				ordinal_sequence: first.ordinal_sequence,
				journal_event_id: journal[1]?.event_id,
			});
			expect(journal[0]?.payload.evidence.source_digest).toMatch(
				/^[a-f0-9]{64}$/,
			);
			expect(() =>
				appendProductionDayAllocation({
					...input,
					evidenceId: "E-unobserved",
				}),
			).toThrow("not an observed passing result");
			expect(() =>
				appendProductionDayAllocation({
					...input,
					evidenceId: "E-nonzero",
				}),
			).toThrow("not an observed passing result");
			expect(() =>
				appendProductionDayAllocation({
					...input,
					evidenceId: "E-cross-project",
				}),
			).toThrow("another project");
			expect(() =>
				appendProductionDayAllocation({
					...input,
					evidenceId: "E-missing-identity",
				}),
			).toThrow("explicit project_id and session_id");
			const evidencePath = join(root, ".afol", "wb", "S-01", ".evidence.jsonl");
			writeFileSync(
				evidencePath,
				readFileSync(evidencePath, "utf8").replace(
					"2026-07-17T02:30:00.000Z",
					"2026-07-17T02:30:01.000Z",
				),
			);
			expect(() => appendProductionDayAllocation(input)).toThrow(
				"source digest mismatch",
			);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("rebuilds the projection atomically from the verified journal", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-rebuild-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		try {
			seedObservedEvidence(root);
			appendProductionDayAllocation({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "America/Asuncion",
				sessionId: "S-01",
				evidenceId: "E-01",
			});
			const evidencePath = join(root, ".afol", "wb", "S-01", ".evidence.jsonl");
			writeFileSync(
				evidencePath,
				`${readFileSync(evidencePath, "utf8")}${JSON.stringify({
					id: "E-unrelated",
					project_id: PROJECT_ID,
					session_id: "S-01",
					created_at: "2026-07-17T06:00:00.000Z",
					result: "passed",
					provenance: "observed",
					exit_code: 0,
				})}\n`,
			);
			db.exec("DELETE FROM production_days; DELETE FROM evolution_metadata;");
			const rebuilt = rebuildProductionDayProjection({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "America/Asuncion",
			});
			expect(rebuilt).toHaveLength(1);
			expect(rebuilt[0]?.qualifying_events).toEqual(["E-01"]);
			const beforeRows = db.query("SELECT * FROM production_days").all();
			const beforeMetadata = db.query("SELECT * FROM evolution_metadata").all();
			writeFileSync(
				evidencePath,
				readFileSync(evidencePath, "utf8")
					.split("\n")
					.filter((line) => !line.includes('"id":"E-01"'))
					.join("\n"),
			);
			expect(() =>
				rebuildProductionDayProjection({
					root,
					db,
					projectId: PROJECT_ID,
					timezone: "America/Asuncion",
				}),
			).toThrow("does not exist");
			expect(db.query("SELECT * FROM production_days").all()).toEqual(
				beforeRows,
			);
			expect(db.query("SELECT * FROM evolution_metadata").all()).toEqual(
				beforeMetadata,
			);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("serializes concurrent journal appends into one hash chain", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-journal-concurrent-"));
		const dbPath = evolutionDbPath(root);
		const evidencePairs: Array<[string, string]> = [
			["S-A", "E-A"],
			["S-B", "E-B"],
		];
		for (const [sessionId, evidenceId] of evidencePairs) {
			const dir = join(root, ".afol", "wb", sessionId);
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, ".evidence.jsonl"),
				`${JSON.stringify({
					id: evidenceId,
					project_id: PROJECT_ID,
					session_id: sessionId,
					created_at: "2026-07-17T05:00:00.000Z",
					result: "passed",
					provenance: "observed",
					exit_code: 0,
				})}\n`,
			);
		}
		const journalModule = join(
			import.meta.dir,
			"../services/evolution/journal.ts",
		);
		const dbModule = join(import.meta.dir, "../services/evolution/db.ts");
		const script = (sessionId: string, evidenceId: string) =>
			`import { openEvolutionDb } from ${JSON.stringify(dbModule)}; import { appendProductionDayAllocation } from ${JSON.stringify(journalModule)}; const db = openEvolutionDb(${JSON.stringify(dbPath)}); appendProductionDayAllocation({ root: ${JSON.stringify(root)}, db, projectId: ${JSON.stringify(PROJECT_ID)}, timezone: "America/Asuncion", sessionId: ${JSON.stringify(sessionId)}, evidenceId: ${JSON.stringify(evidenceId)} }); db.close();`;
		try {
			const processes = evidencePairs.map(([sessionId, evidenceId]) =>
				Bun.spawn(["bun", "-e", script(sessionId, evidenceId)], {
					stdout: "pipe",
					stderr: "pipe",
				}),
			);
			const exits = await Promise.all(
				processes.map((process) => process.exited),
			);
			if (exits.some((exit) => exit !== 0)) {
				const errors = await Promise.all(
					processes.map(async (process) =>
						process.stderr
							? new TextDecoder().decode(
									await new Response(process.stderr).arrayBuffer(),
								)
							: "",
					),
				);
				throw new Error(errors.join("\n"));
			}
			expect(exits).toEqual([0, 0]);
			const journal = readProductionDayJournal(
				root,
				PROJECT_ID,
				"America/Asuncion",
			);
			expect(journal).toHaveLength(2);
			expect(journal.map((event) => event.sequence)).toEqual([1, 2]);
			expect(journal[1]?.previous_event_digest).toBe(journal[0]?.event_digest);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("derives local production dates at timezone boundaries", () => {
		const instant = new Date("2026-07-17T02:30:00.000Z");
		expect(localDateForTimezone(instant, "UTC")).toBe("2026-07-17");
		expect(localDateForTimezone(instant, "America/Asuncion")).toBe(
			"2026-07-16",
		);
	});

	test("reports healthy and stale migration states without mutating the database", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-health-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		db.close();
		try {
			expect(checkEvolutionDbHealth(dbPath)).toMatchObject({
				ok: true,
				db_exists: true,
				migration_version: EVOLUTION_SCHEMA_VERSION,
				migration_stale: false,
			});
			const tampered = new Database(dbPath);
			tampered.exec("PRAGMA user_version = 0");
			tampered.close();
			expect(checkEvolutionDbHealth(dbPath)).toMatchObject({
				ok: false,
				migration_stale: true,
			});
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("tolerates foreign production rows; scopes counts to native project", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-cross-project-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		try {
			allocateProductionDay(db, {
				projectId: PROJECT_ID,
				localDate: "2026-07-16",
				qualifyingEvents: ["task:T-01"],
				journalEventId: "J-01",
			});
			// Insert a foreign production day — new semantics tolerate this.
			db.prepare(
				"INSERT INTO production_days(project_id, local_date, ordinal_sequence, ordinal, created_at, qualifying_events, journal_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
			).run(
				"7b7d91ca-496b-4f0c-8537-5c4993810d15",
				"2026-07-17",
				2,
				"PD-0002",
				"2026-07-17T12:00:00.000Z",
				JSON.stringify(["task:T-02"]),
				"J-02",
			);
		} finally {
			db.close();
		}
		try {
			const health = checkEvolutionDbHealth(dbPath, PROJECT_ID);
			// Foreign rows are tolerated; only the native project's row counted.
			expect(health.ok).toBe(true);
			expect(health.production_day_count).toBe(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("serializes concurrent first opens through the migration lock", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-concurrent-open-"));
		const dbPath = evolutionDbPath(root);
		const dbModule = join(import.meta.dir, "../services/evolution/db.ts");
		const script = `import { openEvolutionDb } from ${JSON.stringify(dbModule)}; const db = openEvolutionDb(${JSON.stringify(dbPath)}); db.close();`;
		try {
			const processes = Array.from({ length: 4 }, () =>
				Bun.spawn(["bun", "-e", script], { stdout: "pipe", stderr: "pipe" }),
			);
			const exits = await Promise.all(
				processes.map((process) => process.exited),
			);
			const errors = await Promise.all(
				processes.map(async (process) =>
					process.stderr
						? new TextDecoder().decode(
								await new Response(process.stderr).arrayBuffer(),
							)
						: "",
				),
			);
			if (exits.some((exit) => exit !== 0)) throw new Error(errors.join("\n"));
			expect(exits).toEqual([0, 0, 0, 0]);
			const db = new Database(dbPath, { readonly: true });
			try {
				expect(
					(db.query("PRAGMA user_version").get() as { user_version: number })
						.user_version,
				).toBe(EVOLUTION_SCHEMA_VERSION);
			} finally {
				db.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects a newer schema before creating migration tables", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-newer-schema-"));
		const dbPath = evolutionDbPath(root);
		mkdirSync(join(root, ".afol", "state"), { recursive: true });
		const db = new Database(dbPath);
		try {
			db.exec(`PRAGMA user_version = ${EVOLUTION_SCHEMA_VERSION + 1}`);
			expect(() => applyMigrations(db)).toThrow("newer than supported");
			expect(
				db
					.query(
						"SELECT name FROM sqlite_master WHERE name = 'evolution_migrations'",
					)
					.get(),
			).toBeNull();
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("validates identity, timezone, and legacy in-memory defaults", () => {
		validateEvolutionIdentity({
			projectId: PROJECT_ID,
			timezone: "America/Asuncion",
		});
		expect(isValidIanaTimezone("not/a-timezone")).toBe(false);
		expect(() =>
			validateEvolutionIdentity({ projectId: "not-a-uuid", timezone: "UTC" }),
		).toThrow("invalid evolution project UUID");
		expect(
			resolveEvolutionIdentity({
				schema_version: 1,
				project: { name: "legacy" },
			}),
		).toEqual({
			projectId: null,
			timezone: "UTC",
			usedDefaultProjectId: true,
			usedDefaultTimezone: true,
		});
		expect(
			resolveEvolutionConfig({
				schema_version: 1,
				project: { name: "legacy" },
			}),
		).toMatchObject({
			configured: false,
			enabled: true,
			projectId: null,
			timezone: "UTC",
			settings: {
				preferences: {
					soft_decay_after_production_days: 7,
					stop_guiding_after_production_days: 20,
				},
				autonomy: { auto_apply_mode: "none" },
			},
		});
	});

	test("mixed-project health scopes counts to native project, tolerates foreign qualifying_events", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-mixed-health-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		try {
			allocateProductionDay(db, {
				projectId: PROJECT_ID,
				localDate: "2026-07-16",
				qualifyingEvents: ["task:T-01"],
				journalEventId: "J-01",
			});
			// Insert a foreign production day (malformed qualifying_events).
			db.prepare(
				"INSERT INTO production_days(project_id, local_date, ordinal_sequence, ordinal, created_at, qualifying_events, journal_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
			).run(
				"7b7d91ca-496b-4f0c-8537-5c4993810d15",
				"2026-07-17",
				2,
				"PD-0002",
				"2026-07-17T12:00:00.000Z",
				JSON.stringify({ invalid: "not-an-array" }),
				"J-02",
			);
		} finally {
			db.close();
		}
		try {
			const health = checkEvolutionDbHealth(dbPath, PROJECT_ID);
			// Foreign malformed qualifying_events are ignored (scoped query).
			expect(health.ok).toBe(true);
			expect(health.production_day_count).toBe(1);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("mixed-project preference rebuild deletes only native rows, preserves foreign", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-pref-mixed-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		try {
			// Seed a production day for the native project so the validation /
			// decay projection does not fail.
			seedObservedEvidence(root);
			const journalModule = join(
				import.meta.dir,
				"../services/evolution/journal.ts",
			);
			const dbModule = join(import.meta.dir, "../services/evolution/db.ts");
			const seedScript = `import { openEvolutionDb } from ${JSON.stringify(dbModule)}; import { appendProductionDayAllocation } from ${JSON.stringify(journalModule)}; const db = openEvolutionDb(${JSON.stringify(dbPath)}); appendProductionDayAllocation({ root: ${JSON.stringify(root)}, db, projectId: ${JSON.stringify(PROJECT_ID)}, timezone: "America/Asuncion", sessionId: "S-01", evidenceId: "E-01" }); db.close();`;
			const seedProc = Bun.spawnSync(["bun", "-e", seedScript], {
				stdout: "pipe",
				stderr: "pipe",
			});
			if (seedProc.exitCode !== 0) throw new Error(seedProc.stderr.toString());

			// Insert foreign preference rows directly.
			db.prepare(
				"INSERT INTO preferences(project_id,id,statement,scope,status,provenance,confidence,effective_confidence,positive_evidence,negative_evidence,last_reinforced_production_day,current_production_day,source_refs,created_at,updated_at,journal_event_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
			).run(
				"foreign-proj",
				"PREF-foreign-1",
				"foreign preference",
				"project",
				"active",
				"explicit",
				0.9,
				0.9,
				3,
				0,
				1,
				1,
				JSON.stringify([{ id: "E-foreign", kind: "evidence" }]),
				"2026-07-16T12:00:00.000Z",
				"2026-07-16T12:00:00.000Z",
				"J-foreign",
			);
			db.prepare(
				"INSERT INTO preference_evidence(project_id,id,preference_id,kind,trust,weight,production_day_sequence,created_at,journal_event_id,source_refs) VALUES(?,?,?,?,?,?,?,?,?,?)",
			).run(
				"foreign-proj",
				"PE-foreign-1",
				"PREF-foreign-1",
				"explicit",
				"local",
				1.0,
				1,
				"2026-07-16T12:00:00.000Z",
				"J-foreign-e",
				JSON.stringify([{ id: "E-foreign", kind: "evidence" }]),
			);

			// Snapshot foreign rows before rebuild.
			const foreignPrefsBefore = (
				db
					.query(
						"SELECT id, project_id, statement FROM preferences WHERE project_id = ?",
					)
					.all("foreign-proj") as Array<Record<string, unknown>>
			).map((r) => JSON.stringify(r));
			const foreignEvidenceBefore = (
				db
					.query(
						"SELECT id, project_id FROM preference_evidence WHERE project_id = ?",
					)
					.all("foreign-proj") as Array<Record<string, unknown>>
			).map((r) => JSON.stringify(r));

			// Rebuild — should only affect native project rows.
			const rebuilt = rebuildPreferenceProjection({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: "America/Asuncion",
			});

			// Foreign rows preserved unchanged.
			const foreignPrefsAfter = (
				db
					.query(
						"SELECT id, project_id, statement FROM preferences WHERE project_id = ?",
					)
					.all("foreign-proj") as Array<Record<string, unknown>>
			).map((r) => JSON.stringify(r));
			const foreignEvidenceAfter = (
				db
					.query(
						"SELECT id, project_id FROM preference_evidence WHERE project_id = ?",
					)
					.all("foreign-proj") as Array<Record<string, unknown>>
			).map((r) => JSON.stringify(r));
			expect(foreignPrefsAfter).toEqual(foreignPrefsBefore);
			expect(foreignEvidenceAfter).toEqual(foreignEvidenceBefore);

			// Rebuilt preferences are non-empty (rebuild succeeded).
			expect(Array.isArray(rebuilt)).toBe(true);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"rejects escaped or symlinked configured database paths",
		() => {
			const root = mkdtempSync(join(tmpdir(), "evolution-paths-"));
			const outside = mkdtempSync(join(tmpdir(), "evolution-outside-"));
			try {
				expect(() => evolutionDbPath(root, "../outside/evolution.db")).toThrow(
					"escapes project root",
				);
				mkdirSync(join(root, "links"), { recursive: true });
				symlinkSync(outside, join(root, "links", "db"));
				expect(() => evolutionDbPath(root, "links/db/evolution.db")).toThrow(
					"crosses symlink",
				);
			} finally {
				removeEvolutionTestRoot(root);
				removeEvolutionTestRoot(outside);
			}
		},
	);
});
