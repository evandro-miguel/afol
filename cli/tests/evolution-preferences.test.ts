import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	agentOperationContext,
	defaultOperationContext,
} from "../core/operation-context";
import {
	appendProductionDayAllocation,
	applyMigrations,
	EVOLUTION_MIGRATIONS,
	EVOLUTION_SCHEMA_VERSION,
	effectivePreferenceConfidence,
	evolutionDbPath,
	getPreference,
	openEvolutionDb,
	preferenceFreshness,
	preferencePrecedence,
	readPreferenceJournal,
} from "../services/evolution";
import { dispatchPreferenceDecision } from "../services/evolution/preference-authority";
import {
	createPreference,
	recordPreferenceEvidence,
} from "../services/evolution/preferences";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const OTHER_PROJECT_ID = "7b7d91ca-496b-4f0c-8537-5c4993810d15";
const TIMEZONE = "UTC";

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "evolution-preferences-"));
	const db = openEvolutionDb(evolutionDbPath(root));
	return { root, db };
}

function userAuthority(
	_root: string,
	preferenceId: string,
	action: "create" | "reinforce" | "contradict" | "reject" | "reopen",
	provenance: "explicit" | "inferred" = "explicit",
) {
	return dispatchPreferenceDecision({
		projectId: PROJECT_ID,
		preferenceId,
		action,
		provenance,
		operationContext: defaultOperationContext(),
	});
}

function policyAuthority(_root: string, preferenceId: string) {
	return dispatchPreferenceDecision({
		projectId: PROJECT_ID,
		preferenceId,
		action: "create",
		provenance: "structural",
		operationContext: defaultOperationContext(),
	});
}

function appendProductionDays(root: string, db: Database, count: number): void {
	const sessionId = "S-production";
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	const rows = Array.from({ length: count }, (_, index) => ({
		id: `E-prod-${index + 1}`,
		project_id: PROJECT_ID,
		session_id: sessionId,
		created_at: `2026-01-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
		result: "passed",
		provenance: "observed",
		exit_code: 0,
	}));
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
	);
	for (const row of rows)
		appendProductionDayAllocation({
			root,
			db,
			projectId: PROJECT_ID,
			timezone: TIMEZONE,
			sessionId,
			evidenceId: row.id,
		});
}

describe("Evolution preference projection", () => {
	test("applies preference migration and advances to the current schema", () => {
		const { root, db } = fixture();
		try {
			const migration2 = EVOLUTION_MIGRATIONS.find(
				(migration) => migration.version === 2,
			);
			if (!migration2) throw new Error("missing migration v2");
			expect(
				(db.query("PRAGMA user_version").get() as { user_version: number })
					.user_version,
			).toBe(EVOLUTION_SCHEMA_VERSION);
			expect(
				EVOLUTION_MIGRATIONS.map((migration) => migration.version),
			).toEqual(
				Array.from(
					{ length: EVOLUTION_SCHEMA_VERSION },
					(_, index) => index + 1,
				),
			);
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
			removeEvolutionTestRoot(root);
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
			).toBe(EVOLUTION_SCHEMA_VERSION);
			expect(
				db
					.query("SELECT name FROM sqlite_master WHERE name = 'preferences'")
					.get(),
			).toBeTruthy();
		} finally {
			db.close();
		}
	});

	test("rolls back the whole pending migration sequence on failure", () => {
		const db = new Database(":memory:");
		try {
			db.exec(`
				CREATE TABLE evolution_migrations (
					version INTEGER PRIMARY KEY,
					checksum TEXT NOT NULL,
					applied_at TEXT NOT NULL
				);
				CREATE TRIGGER reject_migration_four
				BEFORE INSERT ON evolution_migrations
				WHEN NEW.version = 4
				BEGIN
					SELECT RAISE(ABORT, 'injected migration failure');
				END;
			`);

			expect(() => applyMigrations(db)).toThrow("injected migration failure");
			expect(
				(db.query("PRAGMA user_version").get() as { user_version: number })
					.user_version,
			).toBe(0);
			expect(
				(
					db
						.query("SELECT COUNT(*) AS count FROM evolution_migrations")
						.get() as { count: number }
				).count,
			).toBe(0);
			expect(
				db
					.query(
						"SELECT name FROM sqlite_master WHERE name = 'production_days'",
					)
					.get(),
			).toBeNull();
		} finally {
			db.close();
		}
	});

	test("fast-path migration validation rejects a tampered checksum", () => {
		const db = new Database(":memory:");
		try {
			applyMigrations(db);
			db.exec(
				"UPDATE evolution_migrations SET checksum = 'tampered' WHERE version = 4",
			);
			expect(() => applyMigrations(db)).toThrow(
				"evolution migration checksum mismatch at version 4",
			);
			expect(
				(db.query("PRAGMA user_version").get() as { user_version: number })
					.user_version,
			).toBe(EVOLUTION_SCHEMA_VERSION);
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
			const createAuthority = userAuthority(root, "P-slices", "create");
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-slices",
				statement: "Use small slices",
				provenance: "explicit",
				timezone: TIMEZONE,
				authority: createAuthority,
				sourceRefs: [{ id: "S-1", kind: "session" }],
			});
			appendProductionDays(root, db, 8);
			const aging = getPreference(db, PROJECT_ID, "P-slices");
			expect(aging?.status).toBe("aging");
			const reactivated = recordPreferenceEvidence({
				root,
				db,
				projectId: PROJECT_ID,
				preferenceId: "P-slices",
				evidenceId: "PE-reinforce",
				kind: "explicit",
				weight: 0.1,
				timezone: TIMEZONE,
				authority: userAuthority(root, "P-slices", "reinforce"),
				sourceRefs: [{ id: "D-1", kind: "decision" }],
			});
			expect(reactivated.status).toBe("active");
			expect(reactivated.last_reinforced_production_day).toBe(8);
			const contradicted = recordPreferenceEvidence({
				root,
				db,
				projectId: PROJECT_ID,
				preferenceId: "P-slices",
				evidenceId: "PE-contradict",
				kind: "contradiction",
				weight: 0.2,
				timezone: TIMEZONE,
				authority: userAuthority(root, "P-slices", "contradict"),
				sourceRefs: [{ id: "D-2", kind: "decision" }],
			});
			expect(contradicted.confidence).toBeLessThan(reactivated.confidence);
			expect(contradicted.negative_evidence).toBe(1);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
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
			const createAuthority = userAuthority(root, "P-idempotent", "create");
			const first = createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-idempotent",
				statement: "Keep docs current",
				provenance: "explicit",
				timezone: TIMEZONE,
				authority: createAuthority,
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
				timezone: TIMEZONE,
				authority: userAuthority(root, "P-idempotent", "reinforce"),
				sourceRefs: [{ id: "S-2", kind: "session" }],
			});
			expect(duplicate.journal_event_id).toBe(first.journal_event_id);
			expect(() =>
				recordPreferenceEvidence({
					root,
					db,
					projectId: PROJECT_ID,
					preferenceId: "P-idempotent",
					evidenceId: "PE-same",
					kind: "explicit",
					weight: 0.1,
					trust: "untrusted",
					timezone: TIMEZONE,
					authority: userAuthority(root, "P-idempotent", "reinforce"),
					sourceRefs: [{ id: "S-2", kind: "session" }],
				}),
			).toThrow(/different content/);
			expect(() =>
				recordPreferenceEvidence({
					root,
					db,
					projectId: PROJECT_ID,
					preferenceId: "P-idempotent",
					evidenceId: "PE-same",
					kind: "explicit",
					weight: 0.1,
					timezone: TIMEZONE,
					authority: userAuthority(root, "P-idempotent", "reinforce"),
					sourceRefs: [{ id: "S-other", kind: "session" }],
				}),
			).toThrow(/different content/);
			expect(readPreferenceJournal(root, PROJECT_ID)).toHaveLength(1);
			db.exec("DELETE FROM preference_evidence; DELETE FROM preferences;");
			const replayed = recordPreferenceEvidence({
				root,
				db,
				projectId: PROJECT_ID,
				preferenceId: "P-idempotent",
				evidenceId: "PE-same",
				kind: "explicit",
				weight: 0.1,
				timezone: TIMEZONE,
				authority: userAuthority(root, "P-idempotent", "reinforce"),
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
			removeEvolutionTestRoot(root);
		}
	});

	test("fails closed for tampered or cross-project journals", () => {
		const { root, db } = fixture();
		try {
			const authority = userAuthority(root, "P-tamper", "create", "inferred");
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-tamper",
				statement: "Validate",
				provenance: "inferred",
				timezone: TIMEZONE,
				authority,
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
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects external and imported sources before journal mutation", () => {
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
					timezone: TIMEZONE,
					sourceRefs: [{ id: "I-1", kind: "import" }],
					evidenceId: "PE-ext",
					evidenceKind: "external",
					trust: "local",
				}),
			).toThrow(/external evidence cannot mutate/);
			expect(() =>
				createPreference({
					root,
					db,
					projectId: PROJECT_ID,
					id: "P-import",
					statement: "Imported",
					provenance: "explicit",
					timezone: TIMEZONE,
					sourceRefs: [{ id: "I-1", kind: "import" }],
				}),
			).toThrow(/external or imported/);
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("rejects forged privileged authority and import-to-explicit promotion", () => {
		const { root, db } = fixture();
		try {
			expect(() =>
				dispatchPreferenceDecision({
					projectId: PROJECT_ID,
					preferenceId: "P-restricted",
					action: "create",
					provenance: "explicit",
					operationContext: agentOperationContext(),
				}),
			).toThrow(/trusted local interactive context/);
			expect(() =>
				createPreference({
					root,
					db,
					projectId: PROJECT_ID,
					id: "P-import-explicit",
					statement: "Imported instruction",
					provenance: "explicit",
					timezone: TIMEZONE,
					sourceRefs: [{ id: "I-2", kind: "import" }],
				}),
			).toThrow(/external or imported/);
			expect(() =>
				createPreference({
					root,
					db,
					projectId: PROJECT_ID,
					id: "P-forged-structural",
					statement: "Forged policy",
					provenance: "structural",
					timezone: TIMEZONE,
					authority: { projectId: PROJECT_ID, kind: "policy" } as never,
					sourceRefs: [{ id: "D-fake", kind: "decision" }],
				}),
			).toThrow(/admitted policy authority/);
			const policy = policyAuthority(root, "P-structural");
			const structural = createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-structural",
				statement: "Real policy",
				provenance: "structural",
				timezone: TIMEZONE,
				authority: policy,
				sourceRefs: [{ id: "D-policy", kind: "decision" }],
			});
			expect(structural.provenance).toBe("structural");
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("derives ordinals from production journal and automatically goes dormant", () => {
		const { root, db } = fixture();
		try {
			const authority = userAuthority(root, "P-decay", "create", "inferred");
			const created = createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-decay",
				statement: "Old inferred preference",
				provenance: "inferred",
				timezone: TIMEZONE,
				authority,
				sourceRefs: [{ id: "S-decay", kind: "session" }],
				...({ productionDaySequence: 999 } as Record<string, unknown>),
			});
			expect(created.current_production_day).toBe(0);
			appendProductionDays(root, db, 20);
			const dormant = getPreference(db, PROJECT_ID, "P-decay");
			expect(dormant).toMatchObject({
				current_production_day: 20,
				status: "dormant",
				effective_confidence: 0,
			});
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});

	test("reopens a rejected preference only with admitted positive evidence", () => {
		const { root, db } = fixture();
		try {
			const createAuthority = userAuthority(root, "P-reopen", "create");
			createPreference({
				root,
				db,
				projectId: PROJECT_ID,
				id: "P-reopen",
				statement: "Review before applying",
				provenance: "explicit",
				timezone: TIMEZONE,
				authority: createAuthority,
				sourceRefs: [{ id: "D-user", kind: "decision" }],
			});
			expect(() =>
				recordPreferenceEvidence({
					root,
					db,
					projectId: PROJECT_ID,
					preferenceId: "P-reopen",
					evidenceId: "PE-forged-reject",
					kind: "rejected",
					weight: 0.4,
					timezone: TIMEZONE,
					authority: { projectId: PROJECT_ID, kind: "project_user" } as never,
					sourceRefs: [{ id: "D-fake", kind: "decision" }],
				}),
			).toThrow(/admitted project_user authority/);
			const rejected = recordPreferenceEvidence({
				root,
				db,
				projectId: PROJECT_ID,
				preferenceId: "P-reopen",
				evidenceId: "PE-reject",
				kind: "rejected",
				weight: 0.4,
				timezone: TIMEZONE,
				authority: userAuthority(root, "P-reopen", "reject"),
				sourceRefs: [{ id: "D-user", kind: "decision" }],
			});
			expect(rejected.status).toBe("rejected");
			expect(() =>
				recordPreferenceEvidence({
					root,
					db,
					projectId: PROJECT_ID,
					preferenceId: "P-reopen",
					evidenceId: "PE-explicit-after-reject",
					kind: "explicit",
					weight: 0.2,
					timezone: TIMEZONE,
					authority: userAuthority(root, "P-reopen", "reinforce"),
					sourceRefs: [{ id: "D-user", kind: "decision" }],
				}),
			).toThrow(/only reopen through accepted evidence/);
			expect(() =>
				recordPreferenceEvidence({
					root,
					db,
					projectId: PROJECT_ID,
					preferenceId: "P-reopen",
					evidenceId: "PE-forged-reopen",
					kind: "accepted",
					weight: 0.2,
					timezone: TIMEZONE,
					authority: { projectId: PROJECT_ID, kind: "project_user" } as never,
					sourceRefs: [{ id: "D-fake", kind: "decision" }],
				}),
			).toThrow(/admitted project_user authority/);
			const reopened = recordPreferenceEvidence({
				root,
				db,
				projectId: PROJECT_ID,
				preferenceId: "P-reopen",
				evidenceId: "PE-reopen",
				kind: "accepted",
				weight: 0.2,
				timezone: TIMEZONE,
				authority: userAuthority(root, "P-reopen", "reopen"),
				sourceRefs: [{ id: "D-user", kind: "decision" }],
			});
			expect(reopened.status).toBe("active");
		} finally {
			db.close();
			removeEvolutionTestRoot(root);
		}
	});
});
