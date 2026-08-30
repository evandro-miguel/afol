import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { observeSessionLock } from "../io/session-lock";
import { unmatchedApplyPrepares } from "./apply-journal";
import { assertSafeEvolutionTarget, withEvolutionDbSnapshot } from "./db";
import {
	evaluationJournalPath,
	validateEvaluationProjection,
} from "./evaluation-journal";
import {
	type EvolutionJournalContext,
	validateProductionDayProjection,
} from "./journal";
import {
	EVOLUTION_MIGRATIONS,
	EVOLUTION_SCHEMA_VERSION,
	readUserVersion,
} from "./migrations";
import { validateObservationProjection } from "./observation-journal";
import type { RecurrenceThresholds } from "./observation-model";
import { validatePreferenceProjection } from "./preference-journal";
import type { ProductionDay } from "./production-days";
import { validateEvolutionProjectionCheckpoint } from "./projection-checkpoint";
import { validateSuggestionReceiptProjection } from "./suggestion-journal";

const EVOLUTION_JOURNAL_LOCK = "__evolution-journal__";
const EVOLUTION_HEALTH_WAIT_MS = 5_000;
const EVOLUTION_HEALTH_RETRY_MS = 25;

function waitForEvolutionJournalIdle(root: string): void {
	const deadline = Date.now() + EVOLUTION_HEALTH_WAIT_MS;
	for (;;) {
		const observed = observeSessionLock(root, EVOLUTION_JOURNAL_LOCK);
		if (!observed.active || observed.pid === process.pid) return;
		if (Date.now() >= deadline)
			throw new Error("timed out waiting for evolution journal update");
		Bun.sleepSync(EVOLUTION_HEALTH_RETRY_MS);
	}
}

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
	observation_count: number;
	recurring_cluster_count: number;
	daily_suggestion_receipt_count: number;
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
	observation_count: number;
	recurring_cluster_count: number;
	daily_suggestion_receipt_count: number;
	latest_production_day: ProductionDay | null;
};
export type EvolutionHealthContext = Omit<EvolutionJournalContext, "db"> & {
	recurrenceThresholds?: RecurrenceThresholds;
};

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
	// Configured-expected vs metadata mismatch: fail closed.
	if (
		expectedProjectId &&
		metadataProjectId &&
		metadataProjectId !== expectedProjectId
	)
		throw new Error(
			"evolution db project UUID does not match configured project",
		);
	// Metadata missing but rows exist: fail closed (can't determine ownership).
	if (metadataProjectId === null) {
		const tables = new Set(
			(
				db
					.query("SELECT name FROM sqlite_master WHERE type = 'table'")
					.all() as Array<{ name: string }>
			).map((row) => row.name),
		);
		const recurrenceTables = [
			"production_days",
			"preferences",
			"preference_evidence",
			"observations",
			"recurrence_decisions",
			"issue_clusters",
		].filter((table) => tables.has(table));
		const anyRow = db
			.query(
				recurrenceTables.length > 0
					? `${recurrenceTables
							.map((table) => `SELECT 1 AS found FROM ${table}`)
							.join(" UNION ")} LIMIT 1`
					: "SELECT NULL AS found WHERE 0",
			)
			.get() as { found?: unknown } | null;
		if (anyRow)
			throw new Error("evolution db project UUID metadata is missing");
	}
	// Foreign rows from other projects are tolerated — queries are scoped to
	// the asserted projectId.
	return metadataProjectId ?? expectedProjectId ?? null;
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
		validateObservationProjection({
			...canonicalContext,
			db,
			projectId,
		});
		const tables = new Set(
			(
				db
					.query("SELECT name FROM sqlite_master WHERE type = 'table'")
					.all() as Array<{ name: string }>
			).map((row) => row.name),
		);
		if (tables.has("daily_suggestion_receipts"))
			validateSuggestionReceiptProjection({
				root: canonicalContext.root,
				projectId,
				db,
				...(canonicalContext.evolutionEventsDir
					? { eventsDir: canonicalContext.evolutionEventsDir }
					: {}),
			});
		const suggestionState = tables.has("daily_suggestion_receipts")
			? scalarNumber(
					db
						.query(
							"SELECT EXISTS(SELECT 1 FROM observations WHERE project_id = ?) OR EXISTS(SELECT 1 FROM daily_suggestion_receipts WHERE project_id = ?) AS present",
						)
						.get(projectId, projectId) as Record<string, unknown>,
				)
			: 0;
		const evaluationState = tables.has("evaluations")
			? scalarNumber(
					db
						.query(
							"SELECT COUNT(*) AS count FROM evaluations WHERE project_id = ?",
						)
						.get(projectId) as Record<string, unknown>,
				)
			: 0;
		const evaluationJournalExists = existsSync(
			evaluationJournalPath(
				canonicalContext.root,
				canonicalContext.evolutionEventsDir,
			),
		);
		if (
			tables.has("evaluations") &&
			(evaluationState > 0 || evaluationJournalExists)
		)
			validateEvaluationProjection({
				root: canonicalContext.root,
				projectId,
				db,
				...(canonicalContext.evolutionEventsDir
					? { eventsDir: canonicalContext.evolutionEventsDir }
					: {}),
			});
		if (suggestionState > 0 || evaluationState > 0 || evaluationJournalExists)
			validateEvolutionProjectionCheckpoint({
				root: canonicalContext.root,
				db,
				projectId,
				...(canonicalContext.evolutionEventsDir
					? { eventsDir: canonicalContext.evolutionEventsDir }
					: {}),
			});
	}
	if (!projectId) {
		return {
			schema_version: EVOLUTION_SCHEMA_VERSION,
			migration_version: readUserVersion(db),
			project_id: null,
			production_day_count: 0,
			preference_count: 0,
			observation_count: 0,
			recurring_cluster_count: 0,
			daily_suggestion_receipt_count: 0,
			latest_production_day: null,
		};
	}
	const latest = db
		.query(
			"SELECT * FROM production_days WHERE project_id = ? ORDER BY ordinal_sequence DESC LIMIT 1",
		)
		.get(projectId) as Record<string, unknown> | null;
	const count = db
		.query("SELECT COUNT(*) AS count FROM production_days WHERE project_id = ?")
		.get(projectId) as Record<string, unknown>;
	const preferenceCount = db
		.query("SELECT COUNT(*) AS count FROM preferences WHERE project_id = ?")
		.get(projectId) as Record<string, unknown>;
	const observationCount = db
		.query("SELECT COUNT(*) AS count FROM observations WHERE project_id = ?")
		.get(projectId) as Record<string, unknown>;
	const recurringClusterCount = db
		.query(
			"SELECT COUNT(*) AS count FROM issue_clusters WHERE project_id = ? AND state IN ('recurring','reopened','proposal_open','mitigation_canary')",
		)
		.get(projectId) as Record<string, unknown>;
	const hasSuggestionReceipts =
		db
			.query(
				"SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'daily_suggestion_receipts'",
			)
			.get() !== null;
	const dailySuggestionReceiptCount = hasSuggestionReceipts
		? (db
				.query(
					"SELECT COUNT(*) AS count FROM daily_suggestion_receipts WHERE project_id = ?",
				)
				.get(projectId) as Record<string, unknown>)
		: { count: 0 };
	return {
		schema_version: EVOLUTION_SCHEMA_VERSION,
		migration_version: readUserVersion(db),
		project_id: projectId,
		production_day_count: scalarNumber(count),
		preference_count: scalarNumber(preferenceCount),
		observation_count: scalarNumber(observationCount),
		recurring_cluster_count: scalarNumber(recurringClusterCount),
		daily_suggestion_receipt_count: scalarNumber(dailySuggestionReceiptCount),
		latest_production_day: latest ? rowToProductionDay(latest) : null,
	};
}

export function checkEvolutionDbHealth(
	dbPath: string,
	expectedProjectId?: string,
	canonicalContext?: EvolutionHealthContext,
	existingDb?: Database,
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
			observation_count: 0,
			recurring_cluster_count: 0,
			daily_suggestion_receipt_count: 0,
			project_id: null,
			size_bytes: 0,
			findings: [
				{ severity: "fail", message: `missing evolution db: ${dbPath}` },
			],
		};
	const findings: EvolutionDbFinding[] = [];
	const db: Database | null = existingDb ?? null;
	const ownsDb = existingDb === undefined;
	let schemaOk = true;
	let walEnabled = false;
	let migrationVersion = 0;
	let productionDayCount = 0;
	let preferenceCount = 0;
	let observationCount = 0;
	let recurringClusterCount = 0;
	let dailySuggestionReceiptCount = 0;
	let evaluationCount = 0;
	let projectId: string | null = null;
	try {
		assertSafeEvolutionTarget(dbPath, "evolution db", false);
		assertSafeEvolutionTarget(`${dbPath}-wal`, "evolution db WAL");
		assertSafeEvolutionTarget(`${dbPath}-shm`, "evolution db SHM");
		if (db === null) {
			if (canonicalContext) waitForEvolutionJournalIdle(canonicalContext.root);
			return withEvolutionDbSnapshot(dbPath, (snapshotDb) =>
				checkEvolutionDbHealth(
					dbPath,
					expectedProjectId,
					canonicalContext,
					snapshotDb,
				),
			);
		}
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
		if (
			!tables.has("observations") ||
			!tables.has("recurrence_decisions") ||
			!tables.has("issue_clusters")
		) {
			schemaOk = false;
			findings.push({
				severity: "fail",
				message: "observation schema is stale or incomplete",
			});
		}
		if (migrationVersion >= 5 && !tables.has("daily_suggestion_receipts")) {
			schemaOk = false;
			findings.push({
				severity: "fail",
				message: "suggestion receipt schema is stale or incomplete",
			});
		}
		if (migrationVersion >= 8 && !tables.has("evaluations")) {
			schemaOk = false;
			findings.push({
				severity: "fail",
				message: "evaluation schema is stale or incomplete",
			});
		}
		if (
			migrationVersion >= 7 &&
			(!tables.has("external_imports") ||
				!tables.has("external_sessions") ||
				!tables.has("session_links") ||
				!tables.has("import_checkpoints"))
		) {
			schemaOk = false;
			findings.push({
				severity: "fail",
				message: "external import schema is stale or incomplete",
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
		const recurrenceTables = [
			"production_days",
			"preferences",
			"preference_evidence",
			"observations",
			"recurrence_decisions",
			"issue_clusters",
		];
		let identityValid = true;
		if (recurrenceTables.some((table) => tables.has(table))) {
			try {
				projectId = assertProjectIdentity(db, expectedProjectId);
			} catch (error) {
				identityValid = false;
				schemaOk = false;
				findings.push({ severity: "fail", message: (error as Error).message });
			}
		}
		if (tables.has("production_days") && identityValid && projectId) {
			productionDayCount = scalarNumber(
				db
					.query(
						"SELECT COUNT(*) AS count FROM production_days WHERE project_id = ?",
					)
					.get(projectId) as Record<string, unknown>,
			);
			if (tables.has("preferences")) {
				preferenceCount = scalarNumber(
					db
						.query(
							"SELECT COUNT(*) AS count FROM preferences WHERE project_id = ?",
						)
						.get(projectId) as Record<string, unknown>,
				);
			}
			if (tables.has("observations")) {
				observationCount = scalarNumber(
					db
						.query(
							"SELECT COUNT(*) AS count FROM observations WHERE project_id = ?",
						)
						.get(projectId) as Record<string, unknown>,
				);
			}
			if (tables.has("issue_clusters")) {
				recurringClusterCount = scalarNumber(
					db
						.query(
							"SELECT COUNT(*) AS count FROM issue_clusters WHERE project_id = ? AND state IN ('recurring','reopened','proposal_open','mitigation_canary')",
						)
						.get(projectId) as Record<string, unknown>,
				);
			}
			if (tables.has("daily_suggestion_receipts")) {
				dailySuggestionReceiptCount = scalarNumber(
					db
						.query(
							"SELECT COUNT(*) AS count FROM daily_suggestion_receipts WHERE project_id = ?",
						)
						.get(projectId) as Record<string, unknown>,
				);
			}
			if (tables.has("evaluations")) {
				evaluationCount = scalarNumber(
					db
						.query(
							"SELECT COUNT(*) AS count FROM evaluations WHERE project_id = ?",
						)
						.get(projectId) as Record<string, unknown>,
				);
			}
			for (const row of db
				.query(
					"SELECT qualifying_events FROM production_days WHERE project_id = ?",
				)
				.all(projectId) as Array<{
				qualifying_events: unknown;
			}>) {
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
					const danglingApplies = unmatchedApplyPrepares(
						canonicalContext.root,
						canonicalContext.evolutionEventsDir,
					);
					if (danglingApplies.length > 0)
						findings.push({
							severity: "warn",
							message: `evolution apply recovery required (${danglingApplies.length} pending)`,
						});
				} catch (error) {
					schemaOk = false;
					findings.push({
						severity: "fail",
						message: (error as Error).message,
					});
				}
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
				if (schemaOk) {
					try {
						validateObservationProjection({
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
				if (schemaOk && tables.has("daily_suggestion_receipts")) {
					try {
						validateSuggestionReceiptProjection({
							root: canonicalContext.root,
							projectId: expectedProjectId,
							db,
							...(canonicalContext.evolutionEventsDir
								? { eventsDir: canonicalContext.evolutionEventsDir }
								: {}),
						});
					} catch (error) {
						schemaOk = false;
						findings.push({
							severity: "fail",
							message: (error as Error).message,
						});
					}
				}
				const evaluationJournalExists = existsSync(
					evaluationJournalPath(
						canonicalContext.root,
						canonicalContext.evolutionEventsDir,
					),
				);
				if (
					schemaOk &&
					tables.has("evaluations") &&
					(evaluationCount > 0 || evaluationJournalExists)
				) {
					try {
						validateEvaluationProjection({
							root: canonicalContext.root,
							projectId: expectedProjectId,
							db,
							...(canonicalContext.evolutionEventsDir
								? { eventsDir: canonicalContext.evolutionEventsDir }
								: {}),
						});
					} catch (error) {
						schemaOk = false;
						findings.push({
							severity: "fail",
							message: (error as Error).message,
						});
					}
				}
				if (
					schemaOk &&
					(observationCount > 0 ||
						dailySuggestionReceiptCount > 0 ||
						evaluationCount > 0 ||
						evaluationJournalExists)
				) {
					try {
						validateEvolutionProjectionCheckpoint({
							root: canonicalContext.root,
							projectId: expectedProjectId,
							db,
							...(canonicalContext.evolutionEventsDir
								? { eventsDir: canonicalContext.evolutionEventsDir }
								: {}),
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
		if (ownsDb) db?.close();
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
		observation_count: observationCount,
		recurring_cluster_count: recurringClusterCount,
		daily_suggestion_receipt_count: dailySuggestionReceiptCount,
		project_id: projectId,
		size_bytes: Bun.file(dbPath).size,
		findings,
	};
}
