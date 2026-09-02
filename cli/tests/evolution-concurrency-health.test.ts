import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	existsSync,
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
	evolutionDbPath,
	getEvolutionStatus,
	openEvolutionDb,
	productionDayJournalPath,
	validateProductionDayProjection,
} from "../services/evolution";
import { rebuildProductionDayProjection } from "../services/evolution/journal";
import { validateEvolutionProjectionCheckpoint } from "../services/evolution/projection-checkpoint";
import { withSessionLock } from "../services/io/session-lock";
import { removeEvolutionTestRoot } from "./evolution-test-support";
import { symlinkTestSupport } from "./symlink-test-support";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const TIMEZONE = "America/Asuncion";
const JOURNAL_LOCK = "__evolution-journal__";

function seedEvidence(
	root: string,
	sessionId: string,
	evidenceId: string,
): void {
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

function append(
	root: string,
	db: Database,
	sessionId: string,
	evidenceId: string,
) {
	return appendProductionDayAllocation({
		root,
		db,
		projectId: PROJECT_ID,
		timezone: TIMEZONE,
		sessionId,
		evidenceId,
	});
}

function waitForFile(path: string): void {
	const deadline = Date.now() + 5_000;
	while (!existsSync(path) && Date.now() < deadline) Bun.sleepSync(10);
	expect(existsSync(path)).toBe(true);
}

describe("Evolution canonical projection and concurrency", () => {
	test("serializes concurrent projection checkpoint writers", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-checkpoint-lock-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		const go = join(root, "checkpoint-go");
		const ready = [
			join(root, "checkpoint-ready-1"),
			join(root, "checkpoint-ready-2"),
		];
		const modulePath = join(
			import.meta.dir,
			"../services/evolution/projection-checkpoint",
		);
		const children = ready.map((marker, index) =>
			Bun.spawn(
				[
					"bun",
					"-e",
					`import { existsSync, writeFileSync } from "node:fs"; import { Database } from "bun:sqlite"; import { writeEvolutionProjectionCheckpoint } from ${JSON.stringify(modulePath)}; const db=new Database(${JSON.stringify(dbPath)}); writeFileSync(${JSON.stringify(marker)},"ready"); while(!existsSync(${JSON.stringify(go)})) Bun.sleepSync(5); writeEvolutionProjectionCheckpoint({root:${JSON.stringify(root)},db,projectId:${JSON.stringify(PROJECT_ID)},now:new Date(${JSON.stringify(`2026-07-18T12:00:0${index}.000Z`)})}); db.close();`,
				],
				{ stdout: "pipe", stderr: "pipe" },
			),
		);
		try {
			for (const marker of ready) waitForFile(marker);
			writeFileSync(go, "go");
			expect(await Promise.all(children.map((child) => child.exited))).toEqual([
				0, 0,
			]);
			validateEvolutionProjectionCheckpoint({
				root,
				db,
				projectId: PROJECT_ID,
			});
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("checkpoint validation waits for an in-flight checkpoint writer", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-checkpoint-reader-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		const writerReady = join(root, "checkpoint-writer-ready");
		const writerGo = join(root, "checkpoint-writer-go");
		const readerReady = join(root, "checkpoint-reader-ready");
		const readerDone = join(root, "checkpoint-reader-done");
		const modulePath = join(
			import.meta.dir,
			"../services/evolution/projection-checkpoint",
		);
		try {
			const writer = Bun.spawn(
				[
					"bun",
					"-e",
					`import { existsSync, writeFileSync, writeSync } from "node:fs"; import { Database } from "bun:sqlite"; import { writeEvolutionProjectionCheckpoint } from ${JSON.stringify(modulePath)}; const db=new Database(${JSON.stringify(dbPath)}); try { writeEvolutionProjectionCheckpoint({root:${JSON.stringify(root)},db,projectId:${JSON.stringify(PROJECT_ID)},writeBytes:(fd,line)=>{writeFileSync(${JSON.stringify(writerReady)},"ready"); while(!existsSync(${JSON.stringify(writerGo)})) Bun.sleepSync(5); return writeSync(fd,line,null,"utf8");}}); } finally { db.close(); }`,
				],
				{ stdout: "pipe", stderr: "pipe" },
			);
			waitForFile(writerReady);
			const reader = Bun.spawn(
				[
					"bun",
					"-e",
					`import { writeFileSync } from "node:fs"; import { Database } from "bun:sqlite"; import { validateEvolutionProjectionCheckpoint } from ${JSON.stringify(modulePath)}; const db=new Database(${JSON.stringify(dbPath)}); try { writeFileSync(${JSON.stringify(readerReady)},"ready"); validateEvolutionProjectionCheckpoint({root:${JSON.stringify(root)},db,projectId:${JSON.stringify(PROJECT_ID)}}); writeFileSync(${JSON.stringify(readerDone)},"done"); } finally { db.close(); }`,
				],
				{ stdout: "pipe", stderr: "pipe" },
			);
			waitForFile(readerReady);
			Bun.sleepSync(100);
			expect(existsSync(readerDone)).toBe(false);
			writeFileSync(writerGo, "go");
			expect(await writer.exited).toBe(0);
			expect(await reader.exited).toBe(0);
			expect(existsSync(readerDone)).toBe(true);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("rebuild takes the same journal lock as append", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-rebuild-lock-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		seedEvidence(root, "S-01", "E-01");
		append(root, db, "S-01", "E-01");
		const marker = join(root, "rebuild.marker");
		const journalModulePath = join(
			import.meta.dir,
			"../services/evolution/journal",
		);
		const dbModulePath = join(import.meta.dir, "../services/evolution");
		const child = Bun.spawn(
			[
				"bun",
				"-e",
				`import { openEvolutionDb } from ${JSON.stringify(dbModulePath)}; import { rebuildProductionDayProjection } from ${JSON.stringify(journalModulePath)}; import { writeFileSync } from "node:fs"; const db=openEvolutionDb(${JSON.stringify(dbPath)}); rebuildProductionDayProjection({root:${JSON.stringify(root)},db,projectId:${JSON.stringify(PROJECT_ID)},timezone:${JSON.stringify(TIMEZONE)}}); writeFileSync(${JSON.stringify(marker)},"done"); db.close();`,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		try {
			withSessionLock(root, JOURNAL_LOCK, () => {
				Bun.sleepSync(100);
				expect(existsSync(marker)).toBe(false);
			});
			expect(await child.exited).toBe(0);
			expect(existsSync(marker)).toBe(true);
			validateProductionDayProjection({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: TIMEZONE,
			});
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("journal-only rebuild does not depend on preference module registration", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-journal-only-rebuild-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		seedEvidence(root, "S-journal-only", "E-journal-only");
		append(root, db, "S-journal-only", "E-journal-only");
		db.close();
		const journalModulePath = join(
			import.meta.dir,
			"../services/evolution/journal",
		);
		const dbModulePath = join(import.meta.dir, "../services/evolution/db");
		const child = Bun.spawn(
			[
				"bun",
				"-e",
				`import { openEvolutionDb } from ${JSON.stringify(dbModulePath)}; import { rebuildProductionDayProjection } from ${JSON.stringify(journalModulePath)}; const db=openEvolutionDb(${JSON.stringify(dbPath)}); try { rebuildProductionDayProjection({root:${JSON.stringify(root)},db,projectId:${JSON.stringify(PROJECT_ID)},timezone:${JSON.stringify(TIMEZONE)}}); } finally { db.close(); }`,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		try {
			const exitCode = await child.exited;
			if (exitCode !== 0) {
				const stderr = child.stderr
					? await new Response(child.stderr).text()
					: "";
				throw new Error(
					`journal-only rebuild failed (${exitCode}): ${stderr.trim()}`,
				);
			}
			const rebuilt = openEvolutionDb(dbPath);
			try {
				validateProductionDayProjection({
					root,
					db: rebuilt,
					projectId: PROJECT_ID,
					timezone: TIMEZONE,
				});
			} finally {
				rebuilt.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("health and status fail closed when the DB projection drifts", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-projection-drift-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		seedEvidence(root, "S-01", "E-01");
		append(root, db, "S-01", "E-01");
		db.exec("UPDATE production_days SET qualifying_events='[\"tampered\"]'");
		db.close();
		const context = { root, projectId: PROJECT_ID, timezone: TIMEZONE };
		try {
			const health = checkEvolutionDbHealth(
				evolutionDbPath(root),
				PROJECT_ID,
				context,
			);
			expect(health.ok).toBe(false);
			expect(health.findings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						message: expect.stringContaining("projection differs"),
					}),
				]),
			);
			const readonly = new Database(evolutionDbPath(root), { readonly: true });
			try {
				expect(() => getEvolutionStatus(readonly, PROJECT_ID, context)).toThrow(
					"projection differs",
				);
			} finally {
				readonly.close();
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("append rejects drift without extending the canonical journal", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-append-drift-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		seedEvidence(root, "S-01", "E-01");
		seedEvidence(root, "S-02", "E-02");
		append(root, db, "S-01", "E-01");
		const journalPath = productionDayJournalPath(root);
		const before = readFileSync(journalPath, "utf8");
		db.exec("UPDATE production_days SET qualifying_events='[\"tampered\"]'");
		try {
			expect(() => append(root, db, "S-02", "E-02")).toThrow(
				"projection differs",
			);
			expect(readFileSync(journalPath, "utf8")).toBe(before);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("append rolls back the journal when projection insertion fails", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-append-rollback-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		seedEvidence(root, "S-01", "E-01");
		db.exec(
			"CREATE TRIGGER reject_evolution_insert BEFORE INSERT ON production_days BEGIN SELECT RAISE(ABORT, 'projection insert rejected'); END",
		);
		try {
			expect(() => append(root, db, "S-01", "E-01")).toThrow(
				"projection insert rejected",
			);
			expect(existsSync(productionDayJournalPath(root))).toBe(true);
			expect(readFileSync(productionDayJournalPath(root), "utf8")).toBe("");
			expect(
				db.query("SELECT COUNT(*) AS count FROM production_days").get(),
			).toEqual({ count: 0 });
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("BEGIN failure rolls back the journal append", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-begin-rollback-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		seedEvidence(root, "S-01", "E-01");
		db.exec("BEGIN IMMEDIATE");
		try {
			expect(() => append(root, db, "S-01", "E-01")).toThrow(
				"cannot start a transaction within a transaction",
			);
			expect(readFileSync(productionDayJournalPath(root), "utf8")).toBe("");
		} finally {
			try {
				db.exec("ROLLBACK");
			} catch {}
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("BEGIN failure does not roll back a caller transaction", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-begin-caller-tx-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		seedEvidence(root, "S-01", "E-01");
		db.exec("BEGIN IMMEDIATE");
		db.prepare(
			"INSERT INTO evolution_metadata(key, value) VALUES ('caller_sentinel', 'preserve')",
		).run();
		try {
			expect(() => append(root, db, "S-01", "E-01")).toThrow(
				"cannot start a transaction within a transaction",
			);
			expect(
				db
					.query(
						"SELECT value FROM evolution_metadata WHERE key = 'caller_sentinel'",
					)
					.get(),
			).toEqual({ value: "preserve" });
		} finally {
			try {
				db.exec("ROLLBACK");
			} catch {}
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"journal rejects a final symlink without touching its target",
		() => {
			const root = mkdtempSync(join(tmpdir(), "evolution-journal-symlink-"));
			const db = openEvolutionDb(evolutionDbPath(root));
			seedEvidence(root, "S-01", "E-01");
			const journalPath = productionDayJournalPath(root);
			const externalPath = join(root, "outside.jsonl");
			mkdirSync(join(root, ".afol", "data", "events", "evolution"), {
				recursive: true,
			});
			writeFileSync(externalPath, "external sentinel\n");
			symlinkSync(externalPath, journalPath);
			try {
				expect(() => append(root, db, "S-01", "E-01")).toThrow(
					"production-day journal target must be a regular file",
				);
				expect(readFileSync(externalPath, "utf8")).toBe("external sentinel\n");
			} finally {
				db.close();
				removeEvolutionTestRoot(root);
			}
		},
	);

	test("health waits for an in-flight append and avoids false projection drift", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-health-inflight-"));
		const dbPath = evolutionDbPath(root);
		const holdDb = openEvolutionDb(dbPath);
		seedEvidence(root, "S-01", "E-01");
		seedEvidence(root, "S-02", "E-02");
		append(root, holdDb, "S-01", "E-01");
		const appendReady = join(root, "append-ready");
		const appendGo = join(root, "append-go");
		const healthReady = join(root, "health-ready");
		const healthResult = join(root, "health-result.json");
		const modulePath = join(import.meta.dir, "../services/evolution");
		const appendChild = Bun.spawn(
			[
				"bun",
				"-e",
				`import { appendProductionDayAllocation, evolutionDbPath, openEvolutionDb } from ${JSON.stringify(modulePath)}; import { existsSync, writeFileSync } from "node:fs"; const root=${JSON.stringify(root)}; const db=openEvolutionDb(evolutionDbPath(root)); writeFileSync(${JSON.stringify(appendReady)},"ready"); while (!existsSync(${JSON.stringify(appendGo)})) Bun.sleepSync(10); try { appendProductionDayAllocation({root,db,projectId:${JSON.stringify(PROJECT_ID)},timezone:${JSON.stringify(TIMEZONE)},sessionId:"S-02",evidenceId:"E-02"}); } finally { db.close(); }`,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		try {
			waitForFile(appendReady);
			holdDb.exec("BEGIN IMMEDIATE");
			writeFileSync(appendGo, "go");
			// The append has durably written the journal and is blocked at BEGIN.
			waitForFile(productionDayJournalPath(root));
			const healthChild = Bun.spawn(
				[
					"bun",
					"-e",
					`import { checkEvolutionDbHealth, evolutionDbPath } from ${JSON.stringify(modulePath)}; import { writeFileSync } from "node:fs"; const root=${JSON.stringify(root)}; writeFileSync(${JSON.stringify(healthReady)},"ready"); const result=checkEvolutionDbHealth(evolutionDbPath(root),${JSON.stringify(PROJECT_ID)},{root,projectId:${JSON.stringify(PROJECT_ID)},timezone:${JSON.stringify(TIMEZONE)}}); writeFileSync(${JSON.stringify(healthResult)},JSON.stringify(result));`,
				],
				{ stdout: "pipe", stderr: "pipe" },
			);
			waitForFile(healthReady);
			Bun.sleepSync(100);
			expect(existsSync(healthResult)).toBe(false);
			holdDb.exec("COMMIT");
			holdDb.close();
			expect(await appendChild.exited).toBe(0);
			expect(await healthChild.exited).toBe(0);
			expect(JSON.parse(readFileSync(healthResult, "utf8"))).toMatchObject({
				ok: true,
				production_day_count: 1,
			});
		} finally {
			try {
				holdDb.exec("ROLLBACK");
			} catch {}
			holdDb.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("health treats non-WAL databases as unhealthy", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-wal-health-"));
		const dbPath = evolutionDbPath(root);
		mkdirSync(join(root, ".afol", "state"), { recursive: true });
		const mutable = new Database(dbPath);
		mutable.exec("PRAGMA journal_mode=DELETE");
		applyMigrations(mutable);
		mutable.close();
		try {
			const health = checkEvolutionDbHealth(dbPath, PROJECT_ID);
			expect(health.ok).toBe(false);
			expect(health.wal_enabled).toBe(false);
			expect(health.findings).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						severity: "fail",
						message: expect.stringContaining("WAL not enabled"),
					}),
				]),
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("rebuild repairs projection drift atomically before a later append", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-rebuild-repair-"));
		const db = openEvolutionDb(evolutionDbPath(root));
		seedEvidence(root, "S-01", "E-01");
		seedEvidence(root, "S-02", "E-02");
		append(root, db, "S-01", "E-01");
		db.exec("UPDATE production_days SET qualifying_events='[\"tampered\"]'");
		try {
			expect(() => append(root, db, "S-02", "E-02")).toThrow(
				"projection differs",
			);
			rebuildProductionDayProjection({
				root,
				db,
				projectId: PROJECT_ID,
				timezone: TIMEZONE,
			});
			expect(append(root, db, "S-02", "E-02").qualifying_events).toEqual([
				"E-01",
				"E-02",
			]);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});
});
