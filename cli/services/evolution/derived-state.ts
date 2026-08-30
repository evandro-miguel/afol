import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { withSessionLock } from "../io/session-lock";
import { readProjectConfig } from "../project/paths";
import {
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
	evolutionDbPath,
	openEvolutionDb,
	withEvolutionDbSnapshot,
} from "./db";
import {
	readEvaluationJournal,
	rebuildEvaluationProjection,
	validateEvaluationProjection,
} from "./evaluation-journal";
import { readImportJournal } from "./import-journal";
import {
	rebuildExternalImportProjection,
	validateExternalImportProjection,
} from "./import-store";
import {
	rebuildProductionDayProjection,
	validateProductionDayProjection,
} from "./journal";
import {
	applyMigrations,
	EVOLUTION_SCHEMA_VERSION,
	readUserVersion,
} from "./migrations";
import {
	type ObservationJournalContext,
	readObservationJournal,
	rebuildObservationProjection,
	validateObservationProjection,
} from "./observation-journal";
import {
	assertEvolutionProjectionCheckpoint,
	repairEvolutionProjectionCheckpointTail,
} from "./projection-checkpoint";
import { resolveEvolutionConfig } from "./runtime-config";
import {
	readSuggestionReceiptJournal,
	rebuildSuggestionReceiptProjection,
	validateSuggestionReceiptProjection,
} from "./suggestion-journal";

const JOURNAL_LOCK = "__evolution-journal__";

export type EvolutionDerivedStateInput = {
	root: string;
	projectId?: string;
	db?: Database;
	dbPath?: string;
	eventsDir?: string;
	timezone?: string;
	preview?: boolean;
	dryRun?: boolean;
};

export type EvolutionDerivedStateResult = {
	mode: "preview" | "repair";
	project_id: string;
	db_path: string;
	migration_version: number;
	expected_migration_version: number;
	observation_events: number;
	receipt_events: number;
	import_events: number;
	evaluation_events: number;
	production_projection_rebuilt: boolean;
	observation_projection_rebuilt: boolean;
	receipt_projection_rebuilt: boolean;
	import_projection_rebuilt: boolean;
	evaluation_projection_rebuilt: boolean;
	checkpoint_tail_repaired: boolean;
	checkpoint_written: boolean;
	changed: boolean;
};

type ResolvedInput = {
	root: string;
	projectId: string;
	dbPath: string;
	eventsDir: string;
	timezone: string;
};

function resolveInput(input: EvolutionDerivedStateInput): ResolvedInput {
	assertSafeEvolutionProjectRoot(input.root);
	const config = resolveEvolutionConfig(readProjectConfig(input.root));
	const projectId = input.projectId ?? config.projectId;
	if (!projectId) throw new Error("evolution project identity is required");
	return {
		root: input.root,
		projectId,
		dbPath:
			input.dbPath ?? evolutionDbPath(input.root, config.paths.evolutionDb),
		eventsDir: input.eventsDir ?? config.paths.evolutionEventsDir,
		timezone: input.timezone ?? config.timezone,
	};
}

function observationContext(
	resolved: ResolvedInput,
	db: Database,
): ObservationJournalContext & { db: Database } {
	return {
		root: resolved.root,
		projectId: resolved.projectId,
		db,
		evolutionEventsDir: resolved.eventsDir,
		timezone: resolved.timezone,
	};
}

function baseResult(
	mode: "preview" | "repair",
	resolved: ResolvedInput,
	observationEvents: number,
	receiptEvents: number,
	importEvents: number,
	evaluationEvents: number,
	migrationVersion: number,
): EvolutionDerivedStateResult {
	return {
		mode,
		project_id: resolved.projectId,
		db_path: resolved.dbPath,
		migration_version: migrationVersion,
		expected_migration_version: EVOLUTION_SCHEMA_VERSION,
		observation_events: observationEvents,
		receipt_events: receiptEvents,
		import_events: importEvents,
		evaluation_events: evaluationEvents,
		production_projection_rebuilt: false,
		observation_projection_rebuilt: false,
		receipt_projection_rebuilt: false,
		import_projection_rebuilt: false,
		evaluation_projection_rebuilt: false,
		checkpoint_tail_repaired: false,
		checkpoint_written: false,
		changed: false,
	};
}

function readVersion(db: Database | null): number {
	if (!db) return 0;
	return readUserVersion(db);
}

/**
 * Read the canonical journals and existing derived DB without creating or
 * mutating any state. This is intentionally separate from repair so callers
 * can safely use it for status/preview flows.
 */
export function previewEvolutionDerivedState(
	input: EvolutionDerivedStateInput,
): EvolutionDerivedStateResult {
	const resolved = resolveInput(input);
	const observationEvents = readObservationJournal(
		resolved.root,
		resolved.projectId,
		resolved.eventsDir,
	).length;
	const receiptEvents = readSuggestionReceiptJournal(
		resolved.root,
		resolved.projectId,
		resolved.eventsDir,
	).length;
	const importEvents = readImportJournal(
		resolved.root,
		resolved.projectId,
		resolved.eventsDir,
	).length;
	const evaluationEvents = readEvaluationJournal(
		resolved.root,
		resolved.projectId,
		resolved.eventsDir,
	).length;

	const render = (db: Database | null) =>
		baseResult(
			"preview",
			resolved,
			observationEvents,
			receiptEvents,
			importEvents,
			evaluationEvents,
			readVersion(db),
		);
	if (input.db) return render(input.db);
	if (!existsSync(resolved.dbPath)) return render(null);
	assertSafeEvolutionTarget(resolved.dbPath, "evolution db", false);
	return withEvolutionDbSnapshot(resolved.dbPath, render);
}

/** Rebuild all evolution projections needed by suggestion reads. */
export function repairEvolutionDerivedState(
	input: EvolutionDerivedStateInput,
): EvolutionDerivedStateResult {
	if (input.preview === true || input.dryRun === true)
		return previewEvolutionDerivedState(input);
	const resolved = resolveInput(input);
	return withSessionLock(resolved.root, JOURNAL_LOCK, () => {
		const checkpointTailRepaired = repairEvolutionProjectionCheckpointTail({
			root: resolved.root,
			eventsDir: resolved.eventsDir,
		});
		const db = input.db ?? openEvolutionDb(resolved.dbPath);
		const owned = !input.db;
		try {
			applyMigrations(db);
			const observationEvents = readObservationJournal(
				resolved.root,
				resolved.projectId,
				resolved.eventsDir,
			).length;
			const receiptEvents = readSuggestionReceiptJournal(
				resolved.root,
				resolved.projectId,
				resolved.eventsDir,
			).length;
			const importEvents = readImportJournal(
				resolved.root,
				resolved.projectId,
				resolved.eventsDir,
			).length;
			const evaluationEvents = readEvaluationJournal(
				resolved.root,
				resolved.projectId,
				resolved.eventsDir,
			).length;
			const result = baseResult(
				"repair",
				resolved,
				observationEvents,
				receiptEvents,
				importEvents,
				evaluationEvents,
				readVersion(db),
			);

			try {
				validateObservationProjection(observationContext(resolved, db));
				validateSuggestionReceiptProjection({
					root: resolved.root,
					projectId: resolved.projectId,
					eventsDir: resolved.eventsDir,
					db,
				});
				validateExternalImportProjection({
					root: resolved.root,
					projectId: resolved.projectId,
					eventsDir: resolved.eventsDir,
					db,
				});
				validateEvaluationProjection({
					root: resolved.root,
					projectId: resolved.projectId,
					eventsDir: resolved.eventsDir,
					db,
				});
				assertEvolutionProjectionCheckpoint({
					root: resolved.root,
					db,
					projectId: resolved.projectId,
					eventsDir: resolved.eventsDir,
				});
				return checkpointTailRepaired
					? {
							...result,
							checkpoint_tail_repaired: true,
							changed: true,
						}
					: result;
			} catch {
				// A failed validation is the explicit repair trigger. Canonical
				// journal readers above still fail closed on malformed input.
			}

			let productionProjectionRebuilt = false;
			try {
				validateProductionDayProjection({
					root: resolved.root,
					projectId: resolved.projectId,
					timezone: resolved.timezone,
					evolutionEventsDir: resolved.eventsDir,
					db,
				});
			} catch {
				rebuildProductionDayProjection({
					root: resolved.root,
					projectId: resolved.projectId,
					timezone: resolved.timezone,
					evolutionEventsDir: resolved.eventsDir,
					db,
				});
				productionProjectionRebuilt = true;
			}

			rebuildObservationProjection(observationContext(resolved, db));
			rebuildSuggestionReceiptProjection({
				root: resolved.root,
				projectId: resolved.projectId,
				eventsDir: resolved.eventsDir,
				db,
			});
			rebuildExternalImportProjection({
				root: resolved.root,
				projectId: resolved.projectId,
				eventsDir: resolved.eventsDir,
				db,
			});
			rebuildEvaluationProjection({
				root: resolved.root,
				projectId: resolved.projectId,
				eventsDir: resolved.eventsDir,
				db,
			});
			return {
				...result,
				production_projection_rebuilt: productionProjectionRebuilt,
				observation_projection_rebuilt: true,
				receipt_projection_rebuilt: true,
				import_projection_rebuilt: true,
				evaluation_projection_rebuilt: true,
				checkpoint_tail_repaired: checkpointTailRepaired,
				checkpoint_written: true,
				changed: true,
			};
		} finally {
			if (owned) db.close();
		}
	});
}
