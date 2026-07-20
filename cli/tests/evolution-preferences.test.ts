import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyMigrations,
	createPreference,
	EVOLUTION_MIGRATIONS,
	EVOLUTION_SCHEMA_VERSION,
	effectivePreferenceConfidence,
	evolutionDbPath,
	openEvolutionDb,
	preferenceDigest,
	preferenceFreshness,
	preferenceJournalPath,
	preferencePrecedence,
	readPreferenceJournal,
	recordPreferenceEvidence,
	refreshPreferenceProjection,
} from "../services/evolution";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const OTHER_PROJECT_ID = "7b7d91ca-496b-4f0c-8537-5c4993810d15";

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "evolution-preferences-"));
	const db = openEvolutionDb(evolutionDbPath(root));
	return { root, db };
}

describe("Evolution preference projection", () => {
	test("applies migration v2 and records checksums", () => {
		const { root, db } = fixture();
		try {
			const migration2 = EVOLUTION_MIGRATIONS.find(
				(migration) => migration.version === 2,
			);
			if (!migration2) throw new Error("missing migration v2");
			expect(EVOLUTION_SCHEMA_VERSION).toBe(2);
			expect(
				(db.query("PRAGMA user_version").get() as { user_version: number })
					.user_version,
			).toBe(2);
			expect(
				EVOLUTION_MIGRATIONS.map((migration) => migration.version),
			).toEqual([1, 2]);
			expect(
				db
					.query("SELECT checksum FROM evolution_migrations WHERE version = 2")
					.get(),
			).toMatchObject({ checksum: migration2.checksum });
			expect(
				db
					.query(
						"SELECT name FROM sqlite_master WHERE name IN ('preferences','preference_evidence') ORDER BY name",
					)
					.all(),
			).toHaveLength(2);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("upgrades a v1 database in place", () => {
		const db = new Database(":memory:");
		try {
			const migration1 = EVOLUTION_MIGRATIONS.find(
				(migration) => migration.version === 1,
			);
			if (!migration1) throw new Error("missing migration v1");
			db.exec(
				"CREATE TABLE evolution_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);",
			);
			db.prepare("INSERT INTO evolution_migrations VALUES (1, ?, ?)").run(
				migration1.checksum,
				new Date().toISOString(),
			);
			db.exec(
				"CREATE TABLE evolution_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE production_days(project_id TEXT NOT NULL, local_date TEXT NOT NULL, ordinal_sequence INTEGER NOT NULL, ordinal TEXT NOT NULL, created_at TEXT NOT NULL, qualifying_events TEXT NOT NULL, journal_event_id TEXT NOT NULL, PRIMARY KEY(project_id,local_date)); PRAGMA user_version=1;",
			);
			applyMigrations(db);
			expect(
				(db.query("PRAGMA user_version").get() as { user_version: number })
					.user_version,
			).toBe(2);
			expect(
				db
					.query("SELECT name FROM sqlite_master WHERE name = 'preferences'")
					.get(),
			).toBeTruthy();
		} finally {
			db.close();
		}
	});

	test("uses production ordinal freshness boundaries", () => {
		expect(preferenceFreshness(6)).toBe(1);
		expect(preferenceFreshness(7)).toBe(1);
		expect(preferenceFreshness(19)).toBeCloseTo(1 / 13);
		expect(preferenceFreshness(20)).toBe(0);
		expect(effectivePreferenceConfidence(0.8, 1, 21)).toBe(0);
	});

	test("reactivates aged preferences and applies explicit contradiction", () => {
		const { root, db } = fixture();
		try {
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-slices",
				statement: "Use small slices",
				provenance: "explicit",
				productionDaySequence: 1,
				sourceRefs: [{ id: "S-1", kind: "session" }],
			});
			const aging = refreshPreferenceProjection(db, PROJECT_ID, 8)[0];
			expect(aging?.status).toBe("aging");
			const reactivated = recordPreferenceEvidence({
				root,
				db,
				projectId: PROJECT_ID,
				preferenceId: "P-slices",
				evidenceId: "PE-reinforce",
				kind: "explicit",
				weight: 0.1,
				productionDaySequence: 21,
				sourceRefs: [{ id: "D-1", kind: "decision" }],
			});
			expect(reactivated.status).toBe("active");
			expect(reactivated.last_reinforced_production_day).toBe(21);
			const contradicted = recordPreferenceEvidence({
				root,
				db,
				projectId: PROJECT_ID,
				preferenceId: "P-slices",
				evidenceId: "PE-contradict",
				kind: "contradiction",
				weight: 0.2,
				productionDaySequence: 22,
				sourceRefs: [{ id: "D-2", kind: "decision" }],
			});
			expect(contradicted.confidence).toBeLessThan(reactivated.confidence);
			expect(contradicted.negative_evidence).toBe(1);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps structural over explicit over inferred precedence", () => {
		expect(preferencePrecedence("structural")).toBeGreaterThan(
			preferencePrecedence("explicit"),
		);
		expect(preferencePrecedence("explicit")).toBeGreaterThan(
			preferencePrecedence("inferred"),
		);
	});

	test("is idempotent for duplicate evidence and retains refs", () => {
		const { root, db } = fixture();
		try {
			const first = createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-idempotent",
				statement: "Keep docs current",
				provenance: "explicit",
				productionDaySequence: 1,
				sourceRefs: [{ id: "S-2", kind: "session" }],
				evidenceId: "PE-same",
				evidenceKind: "explicit",
				weight: 0.1,
			});
			const duplicate = recordPreferenceEvidence({
				root,
				db,
				projectId: PROJECT_ID,
				preferenceId: "P-idempotent",
				evidenceId: "PE-same",
				kind: "explicit",
				weight: 0.1,
				productionDaySequence: 1,
				sourceRefs: [{ id: "S-2", kind: "session" }],
			});
			expect(duplicate.journal_event_id).toBe(first.journal_event_id);
			db.exec("DELETE FROM preference_evidence; DELETE FROM preferences;");
			const replayed = recordPreferenceEvidence({
				root,
				db,
				projectId: PROJECT_ID,
				preferenceId: "P-idempotent",
				evidenceId: "PE-same",
				kind: "explicit",
				weight: 0.1,
				productionDaySequence: 1,
				sourceRefs: [{ id: "S-2", kind: "session" }],
			});
			expect(replayed.id).toBe("P-idempotent");
			expect(
				db
					.query(
						"SELECT COUNT(*) AS count FROM preference_evidence WHERE project_id = ?",
					)
					.get(PROJECT_ID),
			).toMatchObject({ count: 1 });
			expect(
				db
					.query(
						"SELECT journal_event_id, source_refs FROM preferences WHERE project_id = ? AND id = ?",
					)
					.get(PROJECT_ID, "P-idempotent"),
			).toMatchObject({ journal_event_id: first.journal_event_id });
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed for tampered or cross-project journals", () => {
		const { root, db } = fixture();
		try {
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-tamper",
				statement: "Validate",
				provenance: "inferred",
				productionDaySequence: 1,
				sourceRefs: [{ id: "S-3", kind: "session" }],
			});
			const path = join(
				root,
				".afol",
				"data",
				"events",
				"evolution",
				"preferences.jsonl",
			);
			const original = readFileSync(path, "utf8");
			writeFileSync(path, original.replace("Validate", "Tampered"));
			expect(() => readPreferenceJournal(root, PROJECT_ID)).toThrow(
				/digest mismatch/,
			);
			writeFileSync(path, original);
			expect(() => readPreferenceJournal(root, OTHER_PROJECT_ID)).toThrow(
				/another project/,
			);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects recomputed authority drift and enforces external trust", () => {
		const { root, db } = fixture();
		try {
			expect(() =>
				createPreference({
					root,
					db,
					projectId: PROJECT_ID,
					id: "P-ext",
					statement: "External",
					provenance: "inferred",
					productionDaySequence: 1,
					sourceRefs: [{ id: "I-1", kind: "import" }],
					evidenceId: "PE-ext",
					evidenceKind: "external",
					trust: "local",
				}),
			).toThrow(/external preference evidence/);
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-ext",
				statement: "External",
				provenance: "inferred",
				productionDaySequence: 1,
				sourceRefs: [{ id: "I-1", kind: "import" }],
				evidenceId: "PE-ext",
				evidenceKind: "external",
				trust: "untrusted",
			});
			const path = preferenceJournalPath(root);
			const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<
				string,
				unknown
			>;
			parsed.authority_kind = "explicit_project_user";
			const { event_digest: _old, ...withoutDigest } = parsed;
			parsed.event_digest = preferenceDigest(withoutDigest);
			writeFileSync(path, `${JSON.stringify(parsed)}\n`);
			expect(() => readPreferenceJournal(root, PROJECT_ID)).toThrow(
				/authority/,
			);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
