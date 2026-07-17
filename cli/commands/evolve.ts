import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	assertSafeEvolutionProjectRoot,
	checkEvolutionDbHealth,
	type EvolutionDbHealth,
	type EvolutionStatus,
	evolutionDbPath,
	getEvolutionStatus,
	observationJournalPath,
	preferenceJournalPath,
	productionDayJournalPath,
	type RecurrenceThresholds,
	readObservationJournal,
	readPreferenceJournal,
	readProductionDayJournal,
	resolveEvolutionConfig,
} from "../services/evolution";
import { observeSessionLock } from "../services/io/session-lock";
import { readProjectConfig } from "../services/project/paths";
import { type CommandIo, DEFAULT_IO } from "./io";

type EvolutionStatusState =
	| "disabled"
	| "healthy"
	| "legacy_unconfigured"
	| "needs_project_id"
	| "reconciling"
	| "rebuild_required"
	| "ready_uninitialized"
	| "unhealthy";

type EvolutionJournalHealth = {
	exists: boolean;
	valid: boolean | null;
	error: string | null;
};

type EvolutionStatusData = {
	configured: boolean;
	enabled: boolean;
	state: EvolutionStatusState;
	project_id: string | null;
	timezone: string;
	db_path: string;
	db_health: EvolutionDbHealth | null;
	db_status: EvolutionStatus | null;
	journal_health: EvolutionJournalHealth;
	analysis_available: false;
};

function parseArgs(args: readonly string[]): { json: boolean } {
	let json = false;
	for (const arg of args) {
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		throw new Error(`Unknown evolve argument: ${arg}`);
	}
	return { json };
}

function readDbStatus(
	path: string,
	expectedProjectId: string,
	canonicalContext: {
		root: string;
		projectId: string;
		timezone: string;
		evolutionEventsDir?: string;
		recurrenceThresholds?: RecurrenceThresholds;
	},
): EvolutionStatus {
	const db = new Database(path, { readonly: true });
	try {
		return getEvolutionStatus(db, expectedProjectId, canonicalContext);
	} finally {
		db.close();
	}
}

function recurrenceThresholds(
	settings: Record<string, unknown>,
): RecurrenceThresholds {
	const recurrence = settings.recurrence as Record<string, unknown>;
	return {
		minimum_occurrences: Number(recurrence.minimum_occurrences),
		minimum_distinct_sessions: Number(recurrence.minimum_distinct_sessions),
		minimum_distinct_production_days: Number(
			recurrence.minimum_distinct_production_days,
		),
	};
}

function statusState(
	configured: boolean,
	enabled: boolean,
	projectId: string | null,
	dbExists: boolean,
	dbHealthy: boolean,
	dbNeedsRebuild: boolean,
	journalExists: boolean,
	journalValid: boolean | null,
	journalLockActive: boolean,
): EvolutionStatusState {
	if (!configured) return "legacy_unconfigured";
	if (!enabled) return "disabled";
	if (!projectId) return "needs_project_id";
	if (journalExists && journalValid === false) return "unhealthy";
	if (dbNeedsRebuild && journalLockActive) return "reconciling";
	if (!dbExists && journalExists && journalValid === true)
		return "rebuild_required";
	if (!dbExists) return "ready_uninitialized";
	if (dbNeedsRebuild && journalExists && journalValid === true)
		return "rebuild_required";
	return dbHealthy ? "healthy" : "unhealthy";
}

function buildStatus(projectRoot: string): EvolutionStatusData {
	assertSafeEvolutionProjectRoot(projectRoot);
	const resolved = resolveEvolutionConfig(readProjectConfig(projectRoot));
	const thresholds = recurrenceThresholds(resolved.settings);
	const journalLockActiveBefore = observeSessionLock(
		projectRoot,
		"__evolution-journal__",
	).active;
	const dbPath = evolutionDbPath(projectRoot, resolved.paths.evolutionDb);
	const journalPaths =
		resolved.configured && resolved.projectId
			? [
					{
						label: "production-days",
						path: productionDayJournalPath(
							projectRoot,
							resolved.paths.evolutionEventsDir,
						),
						read: () =>
							readProductionDayJournal(
								projectRoot,
								resolved.projectId as string,
								resolved.timezone,
								resolved.paths.evolutionEventsDir,
							),
					},
					{
						label: "preferences",
						path: preferenceJournalPath(
							projectRoot,
							resolved.paths.evolutionEventsDir,
						),
						read: () =>
							readPreferenceJournal(
								projectRoot,
								resolved.projectId as string,
								resolved.paths.evolutionEventsDir,
							),
					},
					{
						label: "observations",
						path: observationJournalPath(
							projectRoot,
							resolved.paths.evolutionEventsDir,
						),
						read: () =>
							readObservationJournal(
								projectRoot,
								resolved.projectId as string,
								resolved.paths.evolutionEventsDir,
							),
					},
				]
			: [];
	const existingJournals = journalPaths.filter((journal) =>
		existsSync(journal.path),
	);
	const journalExists = existingJournals.length > 0;
	let journalValid: boolean | null = journalExists ? true : null;
	let journalError: string | null = null;
	for (const journal of existingJournals) {
		try {
			journal.read();
		} catch (error) {
			journalValid = false;
			journalError = `${journal.label}: ${(error as Error).message}`;
			break;
		}
	}
	const dbExists = existsSync(dbPath);
	const dbHealth =
		dbExists && resolved.configured && resolved.projectId
			? checkEvolutionDbHealth(dbPath, resolved.projectId, {
					root: projectRoot,
					projectId: resolved.projectId,
					timezone: resolved.timezone,
					evolutionEventsDir: resolved.paths.evolutionEventsDir,
					recurrenceThresholds: thresholds,
				})
			: null;
	const dbNeedsRebuild =
		dbHealth?.findings.length === 1 &&
		dbHealth.findings[0]?.severity === "fail" &&
		dbHealth.findings[0]?.message.includes("projection differs");
	const journalLockActive =
		journalLockActiveBefore ||
		observeSessionLock(projectRoot, "__evolution-journal__").active;
	const state = statusState(
		resolved.configured,
		resolved.enabled,
		resolved.projectId,
		dbExists,
		dbHealth?.ok ?? false,
		dbNeedsRebuild,
		journalExists,
		journalValid,
		journalLockActive,
	);
	return {
		configured: resolved.configured,
		enabled: resolved.enabled,
		state,
		project_id: resolved.projectId,
		timezone: resolved.timezone,
		db_path: dbPath,
		db_health: dbHealth,
		db_status:
			dbHealth?.ok && resolved.projectId
				? readDbStatus(dbPath, resolved.projectId, {
						root: projectRoot,
						projectId: resolved.projectId,
						timezone: resolved.timezone,
						evolutionEventsDir: resolved.paths.evolutionEventsDir,
						recurrenceThresholds: thresholds,
					})
				: null,
		journal_health: {
			exists: journalExists,
			valid: journalValid,
			error: journalError,
		},
		analysis_available: false,
	};
}

function formatStatus(data: EvolutionStatusData): string {
	return [
		`evolution status: ${data.state}`,
		`configured=${data.configured} enabled=${data.enabled} project_id=${data.project_id ?? "missing"} timezone=${data.timezone}`,
		`db=${data.db_health?.db_exists ?? false} migration=${data.db_health?.migration_version ?? 0}/${data.db_health?.expected_migration_version ?? 1} production_days=${data.db_status?.production_day_count ?? 0}`,
		`journal=${data.journal_health.exists ? (data.journal_health.valid ? "valid" : "invalid") : "absent"}`,
		data.analysis_available
			? "analysis=available"
			: "analysis=planned-for-slice-5",
	].join("\n");
}

export async function runEvolveCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	const jsonRequested = args.some((arg) => arg === "--json" || arg === "-j");
	try {
		if (action && action !== "status") {
			throw new Error(`Unknown evolve action: ${action}`);
		}
		const parsed = parseArgs(args);
		const data = buildStatus(projectRoot);
		const exitCode = data.state === "unhealthy" ? 1 : 0;
		if (parsed.json) {
			const envelope =
				exitCode === 0
					? envelopeOk(data, {
							action: "evolve.status",
							exitCode,
						})
					: (envelopeErr(
							"EVOLUTION_UNHEALTHY",
							"evolution state is unhealthy",
							{
								action: "evolve.status",
								exitCode,
							},
						) as ResultEnvelope<EvolutionStatusData>);
			if (!envelope.ok) envelope.data = data;
			io.stdout(stringifyEnvelope(envelope));
		} else {
			io.stdout(formatStatus(data));
		}
		return exitCode;
	} catch (error) {
		const message = (error as Error).message;
		if (jsonRequested) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("EVOLUTION_STATUS_FAILED", message, {
						action: "evolve.status",
						exitCode: 2,
					}),
				),
			);
		} else {
			io.stderr(message);
		}
		return 2;
	}
}
