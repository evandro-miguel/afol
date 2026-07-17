import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";

export const EVOLUTION_SCHEMA_VERSION = 4;

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
	{
		version: 3,
		sql: `
CREATE TABLE IF NOT EXISTS observations (
	project_id TEXT NOT NULL,
	id TEXT NOT NULL,
	fingerprint TEXT NOT NULL,
	fingerprint_version INTEGER NOT NULL CHECK (fingerprint_version = 1),
	occurrence_identity TEXT NOT NULL,
	session_id TEXT NOT NULL CHECK (length(trim(session_id)) > 0),
	production_day_sequence INTEGER NOT NULL CHECK (production_day_sequence >= 0),
	task_type TEXT NOT NULL CHECK (length(trim(task_type)) > 0),
	impact TEXT NOT NULL CHECK (length(trim(impact)) > 0),
	normalized_fields TEXT NOT NULL CHECK (length(trim(normalized_fields)) > 0),
	source_refs TEXT NOT NULL CHECK (length(trim(source_refs)) > 0),
	created_at TEXT NOT NULL,
	journal_event_id TEXT NOT NULL CHECK (length(trim(journal_event_id)) > 0),
	PRIMARY KEY (project_id, id),
	UNIQUE (project_id, occurrence_identity)
);

CREATE TABLE IF NOT EXISTS recurrence_decisions (
	project_id TEXT NOT NULL,
	id TEXT NOT NULL,
	fingerprint TEXT NOT NULL,
	state TEXT NOT NULL CHECK (state IN ('observed', 'candidate', 'recurring')),
	occurrence_count INTEGER NOT NULL CHECK (occurrence_count >= 0),
	distinct_session_count INTEGER NOT NULL CHECK (distinct_session_count >= 0),
	distinct_production_day_count INTEGER NOT NULL CHECK (distinct_production_day_count >= 0),
	trusted_confirmation INTEGER NOT NULL CHECK (trusted_confirmation IN (0, 1)),
	reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
	source_refs TEXT NOT NULL CHECK (length(trim(source_refs)) > 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	journal_event_id TEXT NOT NULL CHECK (length(trim(journal_event_id)) > 0),
	PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS issue_clusters (
	project_id TEXT NOT NULL,
	fingerprint TEXT NOT NULL,
	state TEXT NOT NULL CHECK (state IN ('observed', 'candidate', 'recurring')),
	occurrence_count INTEGER NOT NULL CHECK (occurrence_count >= 0),
	distinct_session_count INTEGER NOT NULL CHECK (distinct_session_count >= 0),
	distinct_production_day_count INTEGER NOT NULL CHECK (distinct_production_day_count >= 0),
	first_seen_at TEXT NOT NULL,
	last_seen_at TEXT NOT NULL,
	priority INTEGER NOT NULL CHECK (priority >= 0),
	source_refs TEXT NOT NULL CHECK (length(trim(source_refs)) > 0),
	updated_at TEXT NOT NULL,
	PRIMARY KEY (project_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS observations_project_fingerprint_idx
	ON observations(project_id, fingerprint, production_day_sequence);
CREATE INDEX IF NOT EXISTS recurrence_decisions_project_fingerprint_idx
	ON recurrence_decisions(project_id, fingerprint, updated_at);
CREATE INDEX IF NOT EXISTS issue_clusters_project_state_idx
	ON issue_clusters(project_id, state, priority DESC);
		`,
	},
	{
		version: 4,
		sql: `
DROP INDEX IF EXISTS observations_project_fingerprint_idx;
DROP INDEX IF EXISTS recurrence_decisions_project_fingerprint_idx;
DROP INDEX IF EXISTS issue_clusters_project_state_idx;

ALTER TABLE observations RENAME TO observations_v3;
ALTER TABLE recurrence_decisions RENAME TO recurrence_decisions_v3;
ALTER TABLE issue_clusters RENAME TO issue_clusters_v3;

CREATE TABLE observation_legacy_archive AS
	SELECT * FROM observations_v3;

CREATE TABLE observations (
	project_id TEXT NOT NULL,
	id TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (length(trim(kind)) > 0),
	fingerprint TEXT NOT NULL,
	fingerprint_version INTEGER NOT NULL CHECK (fingerprint_version = 1),
	occurrence_identity TEXT NOT NULL,
	session_id TEXT NOT NULL CHECK (length(trim(session_id)) > 0),
	production_day_sequence INTEGER NOT NULL CHECK (production_day_sequence >= 0),
	task_type TEXT NOT NULL CHECK (length(trim(task_type)) > 0),
	impact TEXT NOT NULL CHECK (length(trim(impact)) > 0),
	normalized_fields TEXT NOT NULL CHECK (length(trim(normalized_fields)) > 0),
	source_refs TEXT NOT NULL CHECK (length(trim(source_refs)) > 0),
	created_at TEXT NOT NULL,
	journal_sequence INTEGER NOT NULL CHECK (journal_sequence > 0),
	journal_event_id TEXT NOT NULL CHECK (length(trim(journal_event_id)) > 0),
	PRIMARY KEY (project_id, id),
	UNIQUE (project_id, occurrence_identity)
);

INSERT INTO observations (
	project_id,id,kind,fingerprint,fingerprint_version,occurrence_identity,
	session_id,production_day_sequence,task_type,impact,normalized_fields,
	source_refs,created_at,journal_sequence,journal_event_id
)
SELECT
	project_id,id,
	COALESCE(NULLIF(json_extract(normalized_fields, '$.kind'), ''), 'unknown'),
	fingerprint,fingerprint_version,occurrence_identity,session_id,
	production_day_sequence,task_type,impact,normalized_fields,source_refs,
	created_at,
	ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at,id),
	journal_event_id
FROM observations_v3;

CREATE TABLE recurrence_decisions (
	project_id TEXT NOT NULL,
	id TEXT NOT NULL,
	fingerprint_version INTEGER NOT NULL CHECK (fingerprint_version = 1),
	fingerprint TEXT NOT NULL,
	action TEXT NOT NULL CHECK (action IN ('confirm', 'dismiss', 'reopen')),
	observation_ids TEXT NOT NULL CHECK (length(trim(observation_ids)) > 0),
	observation_membership_digest TEXT NOT NULL CHECK (length(trim(observation_membership_digest)) > 0),
	source_decision_ref TEXT NOT NULL CHECK (length(trim(source_decision_ref)) > 0),
	decision_digest TEXT NOT NULL CHECK (length(trim(decision_digest)) > 0),
	source_refs TEXT NOT NULL CHECK (length(trim(source_refs)) > 0),
	created_at TEXT NOT NULL,
	journal_sequence INTEGER NOT NULL CHECK (journal_sequence > 0),
	journal_event_id TEXT NOT NULL CHECK (length(trim(journal_event_id)) > 0),
	PRIMARY KEY (project_id, id)
);

CREATE TABLE issue_clusters (
	project_id TEXT NOT NULL,
	fingerprint_version INTEGER NOT NULL CHECK (fingerprint_version = 1),
	fingerprint TEXT NOT NULL,
	state TEXT NOT NULL CHECK (state IN ('observed', 'candidate', 'recurring', 'proposal_open', 'mitigation_canary', 'resolved', 'reopened', 'dismissed')),
	occurrence_count INTEGER NOT NULL CHECK (occurrence_count >= 0),
	distinct_session_count INTEGER NOT NULL CHECK (distinct_session_count >= 0),
	distinct_production_day_count INTEGER NOT NULL CHECK (distinct_production_day_count >= 0),
	user_confirmed_recurrence INTEGER NOT NULL CHECK (user_confirmed_recurrence IN (0, 1)),
	first_seen_at TEXT NOT NULL,
	last_seen_at TEXT NOT NULL,
	priority INTEGER NOT NULL CHECK (priority >= 0),
	source_refs TEXT NOT NULL CHECK (length(trim(source_refs)) > 0),
	updated_at TEXT NOT NULL,
	journal_event_id TEXT NOT NULL CHECK (length(trim(journal_event_id)) > 0),
	PRIMARY KEY (project_id, fingerprint_version, fingerprint)
);

DROP TABLE observations_v3;
DROP TABLE recurrence_decisions_v3;
DROP TABLE issue_clusters_v3;

CREATE INDEX observations_project_fingerprint_idx
	ON observations(project_id, fingerprint_version, fingerprint, production_day_sequence);
CREATE INDEX recurrence_decisions_project_fingerprint_idx
	ON recurrence_decisions(project_id, fingerprint_version, fingerprint, journal_sequence);
CREATE INDEX issue_clusters_project_state_idx
	ON issue_clusters(project_id, state, priority DESC);
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

export function applyMigrations(
	db: Database,
	targetVersion = EVOLUTION_SCHEMA_VERSION,
): void {
	if (
		!Number.isInteger(targetVersion) ||
		targetVersion < 1 ||
		targetVersion > EVOLUTION_SCHEMA_VERSION
	)
		throw new Error("invalid evolution migration target version");
	for (const migration of MIGRATIONS) {
		if (migration.version > targetVersion) break;
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
