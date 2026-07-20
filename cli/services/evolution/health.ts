import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { assertSafeEvolutionTarget } from "./db";
import {
	type EvolutionJournalContext,
	validateProductionDayProjection,
} from "./journal";
import {
	EVOLUTION_MIGRATIONS,
	EVOLUTION_SCHEMA_VERSION,
	readUserVersion,
} from "./migrations";
import { validatePreferenceProjection } from "./preference-journal";
import type { ProductionDay } from "./production-days";

export type EvolutionDbFinding = {
	severity: "fail" | "warn" | "info";
	message: string;
};
export type EvolutionDbHealth = {
	ok: boolean;
	db_exists: boolean;
	schema_ok: boolean;
	wal_enabled: boolean;
	migration_version: number;
	expected_migration_version: number;
	migration_stale: boolean;
	production_day_count: number;
	preference_count: number;
	project_id: string | null;
	size_bytes: number;
	findings: EvolutionDbFinding[];
};
export type EvolutionStatus = {
	schema_version: number;
	migration_version: number;
	project_id: string | null;
	production_day_count: number;
	preference_count: number;
	latest_production_day: ProductionDay | null;
};
export type EvolutionHealthContext = Omit<EvolutionJournalContext, "db">;

function scalarNumber(row: Record<string, unknown> | null): number {
	const value = row
		? Object.values(row).find((item) => typeof item === "number")
		: 0;
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function scalarString(row: Record<string, unknown> | null): string {
	const value = row
		? Object.values(row).find((item) => typeof item === "string")
		: "";
	return typeof value === "string" ? value : "";
}

function qualifyingEvents(value: unknown): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(String(value));
	} catch {
		throw new Error("production day qualifying_events is not valid JSON");
	}
	if (
		!Array.isArray(parsed) ||
		parsed.length === 0 ||
		parsed.some((entry) => typeof entry !== "string" || entry.length === 0)
	) {
		throw new Error(
			"production day qualifying_events must be a non-empty string array",
		);
	}
	return parsed;
}

function rowToProductionDay(row: Record<string, unknown>): ProductionDay {
	return {
		project_id: String(row.project_id),
		local_date: String(row.local_date),
		ordinal_sequence: Number(row.ordinal_sequence),
		ordinal: String(row.ordinal),
		created_at: String(row.created_at),
		qualifying_events: qualifyingEvents(row.qualifying_events),
		journal_event_id: String(row.journal_event_id),
	};
}

function readProjectId(db: Database): string | null {
	const project = db
		.query("SELECT value FROM evolution_metadata WHERE key = 'project_id'")
		.get() as { value?: unknown } | null;
	return project && typeof project.value === "string" ? project.value : null;
}

function assertProjectIdentity(
	db: Database,
	expectedProjectId?: string,
): string | null {
	const metadataProjectId = readProjectId(db);
	const rows = db
		.query(
			"SELECT project_id FROM production_days UNION SELECT project_id FROM preferences UNION SELECT project_id FROM preference_evidence",
		)
		.all() as Array<{ project_id?: unknown }>;
	const rowProjectIds = rows.map((row) => String(row.project_id ?? ""));
	const projectId = expectedProjectId ?? metadataProjectId;
	if (
		expectedProjectId &&
		metadataProjectId &&
		metadataProjectId !== expectedProjectId
	)
		throw new Error(
			"evolution db project UUID does not match configured project",
		);
	if (
		rowProjectIds.some(
			(rowProjectId) => !projectId || rowProjectId !== projectId,
		)
	)
		throw new Error(
			"evolution db production day project UUID does not match configured project",
		);
	if (rowProjectIds.length > 0 && !metadataProjectId)
		throw new Error("evolution db project UUID metadata is missing");
	if (
		metadataProjectId &&
		rowProjectIds.some((rowProjectId) => rowProjectId !== metadataProjectId)
	)
		throw new Error(
			"evolution db production day project UUID does not match metadata",
		);
	return metadataProjectId;
}

export function getEvolutionStatus(
	db: Database,
	expectedProjectId?: string,
	canonicalContext?: EvolutionHealthContext,
): EvolutionStatus {
	const projectId = assertProjectIdentity(db, expectedProjectId);
	if (canonicalContext && projectId) {
		validateProductionDayProjection({
			...canonicalContext,
			db,
			projectId,
		});
		validatePreferenceProjection({
			...canonicalContext,
			db,
			projectId,
		});
	}
	const latest = db
		.query(
			"SELECT * FROM production_days ORDER BY ordinal_sequence DESC LIMIT 1",
		)
		.get() as Record<string, unknown> | null;
	const count = db
		.query("SELECT COUNT(*) AS count FROM production_days")
		.get() as Record<string, unknown>;
	const preferenceCount = db
		.query("SELECT COUNT(*) AS count FROM preferences")
		.get() as Record<string, unknown>;
	return {
		schema_version: EVOLUTION_SCHEMA_VERSION,
		migration_version: readUserVersion(db),
		project_id: projectId,
		production_day_count: scalarNumber(count),
		preference_count: scalarNumber(preferenceCount),
		latest_production_day: latest ? rowToProductionDay(latest) : null,
	};
}

export function checkEvolutionDbHealth(
	dbPath: string,
	expectedProjectId?: string,
	canonicalContext?: EvolutionHealthContext,
): EvolutionDbHealth {
	if (!existsSync(dbPath))
		return {
			ok: false,
			db_exists: false,
			schema_ok: false,
			wal_enabled: false,
			migration_version: 0,
			expected_migration_version: EVOLUTION_SCHEMA_VERSION,
			migration_stale: true,
			production_day_count: 0,
			preference_count: 0,
			project_id: null,
			size_bytes: 0,
			findings: [
				{ severity: "fail", message: `missing evolution db: ${dbPath}` },
			],
		};
	const findings: EvolutionDbFinding[] = [];
	let db: Database | null = null;
	let schemaOk = true;
	let walEnabled = false;
	let migrationVersion = 0;
	let productionDayCount = 0;
	let preferenceCount = 0;
	let projectId: string | null = null;
	try {
		assertSafeEvolutionTarget(dbPath, "evolution db", false);
		assertSafeEvolutionTarget(`${dbPath}-wal`, "evolution db WAL");
		assertSafeEvolutionTarget(`${dbPath}-shm`, "evolution db SHM");
		db = new Database(dbPath, { readonly: true });
		migrationVersion = readUserVersion(db);
		const journal = scalarString(
			db.query("PRAGMA journal_mode").get() as Record<string, unknown> | null,
		).toLowerCase();
		walEnabled = journal === "wal";
		if (!walEnabled) {
			schemaOk = false;
			findings.push({
				severity: "fail",
				message: `WAL not enabled (mode=${journal || "unknown"})`,
			});
		}
		const integrity = scalarString(
			db.query("PRAGMA integrity_check").get() as Record<
				string,
				unknown
			> | null,
		);
		if (integrity !== "ok") {
			schemaOk = false;
			findings.push({
				severity: "fail",
				message: `integrity_check failed: ${integrity || "unknown"}`,
			});
		}
		const tables = new Set(
			(
				db
					.query("SELECT name FROM sqlite_master WHERE type = 'table'")
					.all() as Array<{ name: string }>
			).map((row) => row.name),
		);
		if (
			migrationVersion < EVOLUTION_SCHEMA_VERSION ||
			!tables.has("evolution_migrations") ||
			!tables.has("evolution_metadata") ||
			!tables.has("production_days")
		) {
			schemaOk = false;
			findings.push({
				severity: "fail",
				message: "evolution schema is stale or incomplete",
			});
		}
		if (!tables.has("preferences") || !tables.has("preference_evidence")) {
			schemaOk = false;
			findings.push({
				severity: "fail",
				message: "preference schema is stale or incomplete",
			});
		}
		if (migrationVersion > EVOLUTION_SCHEMA_VERSION) {
			schemaOk = false;
			findings.push({
				severity: "fail",
				message: `unsupported evolution schema version ${migrationVersion}`,
			});
		}
		if (tables.has("evolution_migrations"))
			for (const migration of EVOLUTION_MIGRATIONS) {
				const row = db
					.query("SELECT checksum FROM evolution_migrations WHERE version = ?")
					.get(migration.version) as { checksum?: unknown } | null;
				if (
					migration.version <= migrationVersion &&
					(!row || row.checksum !== migration.checksum)
				) {
					schemaOk = false;
					findings.push({
						severity: "fail",
						message: `evolution migration checksum mismatch at version ${migration.version}`,
					});
				}
			}
		if (tables.has("production_days")) {
			try {
				projectId = assertProjectIdentity(db, expectedProjectId);
			} catch (error) {
				schemaOk = false;
				findings.push({ severity: "fail", message: (error as Error).message });
			}
			productionDayCount = scalarNumber(
				db
					.query("SELECT COUNT(*) AS count FROM production_days")
					.get() as Record<string, unknown>,
			);
			if (tables.has("preferences")) {
				preferenceCount = scalarNumber(
					db.query("SELECT COUNT(*) AS count FROM preferences").get() as Record<
						string,
						unknown
					>,
				);
			}
			for (const row of db
				.query("SELECT qualifying_events FROM production_days")
				.all() as Array<{ qualifying_events: unknown }>) {
				try {
					qualifyingEvents(row.qualifying_events);
				} catch (error) {
					schemaOk = false;
					findings.push({
						severity: "fail",
						message: (error as Error).message,
					});
					break;
				}
			}
			if (canonicalContext && expectedProjectId && schemaOk) {
				try {
					validateProductionDayProjection({
						...canonicalContext,
						db,
						projectId: expectedProjectId,
					});
				} catch (error) {
					schemaOk = false;
					findings.push({
						severity: "fail",
						message: (error as Error).message,
					});
				}
				if (schemaOk) {
					try {
						validatePreferenceProjection({
							...canonicalContext,
							db,
							projectId: expectedProjectId,
						});
					} catch (error) {
						schemaOk = false;
						findings.push({
							severity: "fail",
							message: (error as Error).message,
						});
					}
				}
			}
		}
	} catch (error) {
		schemaOk = false;
		findings.push({
			severity: "fail",
			message: `evolution db unavailable: ${(error as Error).message}`,
		});
	} finally {
		db?.close();
	}
	return {
		ok: schemaOk && findings.every((finding) => finding.severity !== "fail"),
		db_exists: true,
		schema_ok: schemaOk,
		wal_enabled: walEnabled,
		migration_version: migrationVersion,
		expected_migration_version: EVOLUTION_SCHEMA_VERSION,
		migration_stale: migrationVersion !== EVOLUTION_SCHEMA_VERSION,
		production_day_count: productionDayCount,
		preference_count: preferenceCount,
		project_id: projectId,
		size_bytes: Bun.file(dbPath).size,
		findings,
	};
}
