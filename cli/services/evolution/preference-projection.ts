import type { Database } from "bun:sqlite";
import type {
	PreferenceEvidenceRecord,
	PreferenceJournalEvent,
	PreferenceProvenance,
	PreferenceRecord,
	PreferenceSourceRef,
	PreferenceStatus,
} from "./preference-types";

function scalar(row: Record<string, unknown> | null, key: string): number {
	const value = row?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseRefs(value: unknown): PreferenceSourceRef[] {
	try {
		const parsed = JSON.parse(String(value));
		if (!Array.isArray(parsed)) throw new Error();
		return parsed as PreferenceSourceRef[];
	} catch {
		throw new Error("preference source refs must be valid JSON");
	}
}

function rowToPreference(row: Record<string, unknown>): PreferenceRecord {
	return {
		project_id: String(row.project_id),
		id: String(row.id),
		statement: String(row.statement),
		scope: "project",
		status: String(row.status) as PreferenceStatus,
		provenance: String(row.provenance) as PreferenceProvenance,
		confidence: Number(row.confidence),
		effective_confidence: Number(row.effective_confidence),
		positive_evidence: scalar(row, "positive_evidence"),
		negative_evidence: scalar(row, "negative_evidence"),
		last_reinforced_production_day: scalar(
			row,
			"last_reinforced_production_day",
		),
		current_production_day: scalar(row, "current_production_day"),
		created_at: String(row.created_at),
		updated_at: String(row.updated_at),
		journal_event_id: String(row.journal_event_id),
		source_refs: parseRefs(row.source_refs),
	};
}

export function projectPreferenceRows(
	db: Database,
	projectId: string,
): PreferenceRecord[] {
	return db
		.query("SELECT * FROM preferences WHERE project_id = ? ORDER BY id")
		.all(projectId)
		.map((row) => rowToPreference(row as Record<string, unknown>));
}

export function getPreference(
	db: Database,
	projectId: string,
	id: string,
): PreferenceRecord | null {
	const row = db
		.query("SELECT * FROM preferences WHERE project_id = ? AND id = ?")
		.get(projectId, id) as Record<string, unknown> | null;
	return row ? rowToPreference(row) : null;
}

export function applyPreferenceJournalEvent(
	db: Database,
	event: PreferenceJournalEvent,
	inTransaction = false,
): void {
	if (event.payload.preference.project_id !== event.payload.project_id)
		throw new Error("preference journal project mismatch");
	const preference = event.payload.preference;
	const evidence = event.payload.evidence;
	const run = (): void => {
		const existing = getPreference(db, preference.project_id, preference.id);
		if (existing && existing.journal_event_id === event.event_id) return;
		const metadata = db
			.query("SELECT value FROM evolution_metadata WHERE key = 'project_id'")
			.get() as { value?: unknown } | null;
		if (metadata && metadata.value !== preference.project_id)
			throw new Error("evolution db project UUID does not match preference");
		if (!metadata)
			db.prepare(
				"INSERT INTO evolution_metadata(key, value) VALUES ('project_id', ?)",
			).run(preference.project_id);
		db.prepare(`INSERT INTO preferences(project_id,id,statement,scope,status,provenance,confidence,effective_confidence,positive_evidence,negative_evidence,last_reinforced_production_day,current_production_day,created_at,updated_at,journal_event_id,source_refs)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(project_id,id) DO UPDATE SET statement=excluded.statement,scope=excluded.scope,status=excluded.status,provenance=excluded.provenance,confidence=excluded.confidence,effective_confidence=excluded.effective_confidence,positive_evidence=excluded.positive_evidence,negative_evidence=excluded.negative_evidence,last_reinforced_production_day=excluded.last_reinforced_production_day,current_production_day=excluded.current_production_day,updated_at=excluded.updated_at,journal_event_id=excluded.journal_event_id,source_refs=excluded.source_refs`).run(
			preference.project_id,
			preference.id,
			preference.statement,
			preference.scope,
			preference.status,
			preference.provenance,
			preference.confidence,
			preference.effective_confidence,
			preference.positive_evidence,
			preference.negative_evidence,
			preference.last_reinforced_production_day,
			preference.current_production_day,
			preference.created_at,
			preference.updated_at,
			event.event_id,
			JSON.stringify(preference.source_refs),
		);
		if (evidence) {
			const evidenceWithPreference: PreferenceEvidenceRecord = {
				...evidence,
				preference_id: evidence.preference_id || preference.id,
			};
			db.prepare(`INSERT INTO preference_evidence(project_id,id,preference_id,kind,trust,weight,production_day_sequence,created_at,journal_event_id,source_refs)
VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO NOTHING`).run(
				evidenceWithPreference.project_id,
				evidenceWithPreference.id,
				evidenceWithPreference.preference_id,
				evidenceWithPreference.kind,
				evidenceWithPreference.trust,
				evidenceWithPreference.weight,
				evidenceWithPreference.production_day_sequence,
				evidenceWithPreference.created_at,
				event.event_id,
				JSON.stringify(evidenceWithPreference.source_refs),
			);
		}
	};
	if (inTransaction) run();
	else {
		db.exec("BEGIN IMMEDIATE");
		try {
			run();
			db.exec("COMMIT");
		} catch (error) {
			try {
				db.exec("ROLLBACK");
			} catch {}
			throw error;
		}
	}
}
