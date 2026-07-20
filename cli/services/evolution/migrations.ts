import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";

export const EVOLUTION_SCHEMA_VERSION = 2;

const MIGRATIONS = [
	{
		version: 1,
		sql: `
CREATE TABLE IF NOT EXISTS evolution_metadata (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_days (
	project_id TEXT NOT NULL,
	local_date TEXT NOT NULL,
	ordinal_sequence INTEGER NOT NULL CHECK (ordinal_sequence > 0),
	ordinal TEXT NOT NULL,
	created_at TEXT NOT NULL,
	qualifying_events TEXT NOT NULL CHECK (length(trim(qualifying_events)) > 0),
	journal_event_id TEXT NOT NULL CHECK (length(trim(journal_event_id)) > 0),
	PRIMARY KEY (project_id, local_date),
	UNIQUE (project_id, ordinal_sequence),
	UNIQUE (project_id, ordinal)
);

CREATE INDEX IF NOT EXISTS production_days_project_sequence_idx
	ON production_days(project_id, ordinal_sequence);
		`,
	},
	{
		version: 2,
		sql: `
CREATE TABLE IF NOT EXISTS preferences (
	project_id TEXT NOT NULL,
	id TEXT NOT NULL,
	statement TEXT NOT NULL CHECK (length(trim(statement)) > 0),
	scope TEXT NOT NULL CHECK (scope = 'project'),
	status TEXT NOT NULL CHECK (status IN ('active', 'aging', 'dormant', 'rejected')),
	provenance TEXT NOT NULL CHECK (provenance IN ('explicit', 'inferred', 'structural')),
	confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
	effective_confidence REAL NOT NULL CHECK (effective_confidence >= 0 AND effective_confidence <= 1),
	positive_evidence INTEGER NOT NULL CHECK (positive_evidence >= 0),
	negative_evidence INTEGER NOT NULL CHECK (negative_evidence >= 0),
	last_reinforced_production_day INTEGER NOT NULL CHECK (last_reinforced_production_day >= 0),
	current_production_day INTEGER NOT NULL CHECK (current_production_day >= 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	journal_event_id TEXT NOT NULL CHECK (length(trim(journal_event_id)) > 0),
	source_refs TEXT NOT NULL CHECK (length(trim(source_refs)) > 0),
	PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS preference_evidence (
	project_id TEXT NOT NULL,
	id TEXT NOT NULL,
	preference_id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('explicit', 'inferred', 'structural', 'external', 'accepted', 'rejected', 'contradiction')),
	trust TEXT NOT NULL CHECK (trust IN ('local', 'untrusted')),
	weight REAL NOT NULL,
	production_day_sequence INTEGER NOT NULL CHECK (production_day_sequence >= 0),
	created_at TEXT NOT NULL,
	journal_event_id TEXT NOT NULL CHECK (length(trim(journal_event_id)) > 0),
	source_refs TEXT NOT NULL CHECK (length(trim(source_refs)) > 0),
	PRIMARY KEY (project_id, id),
	FOREIGN KEY (project_id, preference_id) REFERENCES preferences(project_id, id)
);

CREATE INDEX IF NOT EXISTS preferences_project_status_idx
	ON preferences(project_id, status);
CREATE INDEX IF NOT EXISTS preference_evidence_project_preference_idx
	ON preference_evidence(project_id, preference_id, production_day_sequence);
`,
	},
] as const;

export type EvolutionMigration = { version: number; checksum: string };

function migrationChecksum(sql: string): string {
	return createHash("sha256").update(sql).digest("hex");
}

export const EVOLUTION_MIGRATIONS: readonly EvolutionMigration[] =
	MIGRATIONS.map((migration) => ({
		version: migration.version,
		checksum: migrationChecksum(migration.sql),
	}));

export function readUserVersion(db: Database): number {
	const row = db.query("PRAGMA user_version").get() as Record<
		string,
		unknown
	> | null;
	const value = row
		? Object.values(row).find((item) => typeof item === "number")
		: 0;
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function ensureMigrationTable(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS evolution_migrations (
			version INTEGER PRIMARY KEY,
			checksum TEXT NOT NULL,
			applied_at TEXT NOT NULL
		);
	`);
}

export function applyMigrations(db: Database): void {
	for (const migration of MIGRATIONS) {
		db.exec("BEGIN IMMEDIATE");
		try {
			// Re-read after acquiring the write lock. Another opener may have
			// completed this migration while this connection was waiting.
			const currentVersion = readUserVersion(db);
			if (currentVersion > EVOLUTION_SCHEMA_VERSION) {
				throw new Error(
					`evolution db schema ${currentVersion} is newer than supported ${EVOLUTION_SCHEMA_VERSION}`,
				);
			}
			ensureMigrationTable(db);
			if (migration.version <= currentVersion) {
				const row = db
					.query("SELECT checksum FROM evolution_migrations WHERE version = ?")
					.get(migration.version) as { checksum?: unknown } | null;
				if (!row || row.checksum !== migrationChecksum(migration.sql)) {
					throw new Error(
						`evolution migration checksum mismatch at version ${migration.version}`,
					);
				}
				db.exec("COMMIT");
				continue;
			}
			db.exec(migration.sql);
			db.prepare(
				"INSERT INTO evolution_migrations(version, checksum, applied_at) VALUES (?, ?, ?)",
			).run(
				migration.version,
				migrationChecksum(migration.sql),
				new Date().toISOString(),
			);
			db.exec(`PRAGMA user_version = ${migration.version}`);
			db.exec("COMMIT");
		} catch (error) {
			try {
				db.exec("ROLLBACK");
			} catch {
				/* preserve migration failure */
			}
			throw error;
		}
	}
}
