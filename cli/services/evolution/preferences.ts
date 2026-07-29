import type { Database } from "bun:sqlite";
import { validateEvolutionIdentity } from "./config";
import { validateProductionDayProjection } from "./journal";
import {
	assertPreferenceAuthority,
	type PreferenceAuthorityCapability,
} from "./preference-authority";
import {
	effectivePreferenceConfidence,
	preferenceFreshness,
	preferenceStatus,
	refreshPreferenceDecayProjection,
} from "./preference-decay";
import type {
	LockedPreferenceAppender,
	PreferenceJournalEvent,
} from "./preference-journal";
import {
	preferenceDigest,
	readPreferenceJournal,
	rebuildPreferenceProjection,
	validatePreferenceProjection,
	withPreferenceMutationLock,
} from "./preference-journal";

export type PreferenceProvenance = "explicit" | "inferred" | "structural";
export type PreferenceStatus = "active" | "aging" | "dormant" | "rejected";
export type PreferenceEvidenceKind =
	| PreferenceProvenance
	| "external"
	| "accepted"
	| "rejected"
	| "contradiction";
export type PreferenceSourceRef = Record<string, string>;

export type PreferenceRecord = {
	project_id: string;
	id: string;
	statement: string;
	scope: "project";
	status: PreferenceStatus;
	provenance: PreferenceProvenance;
	confidence: number;
	effective_confidence: number;
	positive_evidence: number;
	negative_evidence: number;
	last_reinforced_production_day: number;
	current_production_day: number;
	created_at: string;
	updated_at: string;
	journal_event_id: string;
	source_refs: PreferenceSourceRef[];
};

export type PreferenceEvidenceRecord = {
	project_id: string;
	id: string;
	preference_id: string;
	kind: PreferenceEvidenceKind;
	trust: "local" | "untrusted";
	weight: number;
	production_day_sequence: number;
	created_at: string;
	journal_event_id: string;
	source_refs: PreferenceSourceRef[];
};

export type PreferenceCreateInput = {
	root: string;
	db: Database;
	projectId: string;
	id: string;
	statement: string;
	provenance: PreferenceProvenance;
	timezone: string;
	authority?: PreferenceAuthorityCapability;
	confidence?: number;
	sourceRefs: PreferenceSourceRef[];
	evidenceId?: string;
	evidenceKind?: PreferenceEvidenceKind;
	weight?: number;
	trust?: "local" | "untrusted";
	now?: Date;
	evolutionEventsDir?: string;
	syncDirectory?: (directory: string) => void;
};

export type PreferenceEvidenceInput = {
	root: string;
	db: Database;
	projectId: string;
	preferenceId: string;
	evidenceId: string;
	kind: PreferenceEvidenceKind;
	weight: number;
	timezone: string;
	authority?: PreferenceAuthorityCapability;
	sourceRefs: PreferenceSourceRef[];
	trust?: "local" | "untrusted";
	now?: Date;
	evolutionEventsDir?: string;
	syncDirectory?: (directory: string) => void;
};

const PRECEDENCE: Record<PreferenceProvenance, number> = {
	inferred: 1,
	explicit: 2,
	structural: 3,
};

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export { effectivePreferenceConfidence, preferenceFreshness, preferenceStatus };

export function preferencePrecedence(provenance: PreferenceProvenance): number {
	return PRECEDENCE[provenance];
}

export function comparePreferences(
	left: PreferenceRecord,
	right: PreferenceRecord,
): number {
	const precedence =
		preferencePrecedence(left.provenance) -
		preferencePrecedence(right.provenance);
	if (precedence !== 0) return precedence;
	return left.effective_confidence - right.effective_confidence;
}

export function evaluatePreference(
	preference: PreferenceRecord,
	currentProductionDay: number,
): PreferenceRecord {
	return {
		...preference,
		current_production_day: currentProductionDay,
		effective_confidence: effectivePreferenceConfidence(
			preference.confidence,
			preference.last_reinforced_production_day,
			currentProductionDay,
		),
		status: preferenceStatus(
			preference.confidence,
			preference.last_reinforced_production_day,
			currentProductionDay,
			preference.status,
		),
	};
}

/** Refreshes only derived freshness fields; it never appends a journal event. */
export function refreshPreferenceProjection(
	db: Database,
	projectId: string,
	currentProductionDay: number,
): PreferenceRecord[] {
	if (!Number.isInteger(currentProductionDay) || currentProductionDay < 0)
		throw new Error("current production day must be a non-negative integer");
	db.exec("BEGIN IMMEDIATE");
	try {
		refreshPreferenceDecayProjection(db, projectId, currentProductionDay);
		db.exec("COMMIT");
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {}
		throw error;
	}
	return projectPreferenceRows(db, projectId);
}

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

function currentProductionDay(input: {
	root: string;
	db: Database;
	projectId: string;
	timezone: string;
	evolutionEventsDir?: string;
}): number {
	validateProductionDayProjection({
		root: input.root,
		db: input.db,
		projectId: input.projectId,
		timezone: input.timezone,
		...(input.evolutionEventsDir
			? { evolutionEventsDir: input.evolutionEventsDir }
			: {}),
	});
	validatePreferenceProjection({
		root: input.root,
		projectId: input.projectId,
		timezone: input.timezone,
		db: input.db,
		...(input.evolutionEventsDir
			? { evolutionEventsDir: input.evolutionEventsDir }
			: {}),
	});
	const row = input.db
		.query(
			"SELECT MAX(ordinal_sequence) AS sequence FROM production_days WHERE project_id = ?",
		)
		.get(input.projectId) as Record<string, unknown> | null;
	return scalar(row, "sequence");
}

function assertId(value: string, label: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value))
		throw new Error(`${label} is invalid`);
}

function assertProductionDay(value: number): void {
	if (!Number.isInteger(value) || value < 0)
		throw new Error("production day sequence must be a non-negative integer");
}

function assertInput(input: {
	projectId: string;
	id?: string;
	sourceRefs: PreferenceSourceRef[];
}): void {
	validateEvolutionIdentity({ projectId: input.projectId, timezone: "UTC" });
	if (input.id) assertId(input.id, "preference id");
	if (!Array.isArray(input.sourceRefs) || input.sourceRefs.length === 0)
		throw new Error("preference source refs are required");
}

function requiredAuthority(
	kind: PreferenceEvidenceKind | PreferenceProvenance,
): PreferenceAuthorityCapability["kind"] {
	return kind === "structural" ? "policy" : "project_user";
}

function admittedAuthority(
	projectId: string,
	kind: PreferenceEvidenceKind | PreferenceProvenance,
	authority?: PreferenceAuthorityCapability,
	binding?: ReturnType<typeof mutationBinding>,
): PreferenceAuthorityCapability {
	const required = requiredAuthority(kind);
	const admitted = authority;
	assertPreferenceAuthority(admitted, projectId, required, binding);
	return admitted as PreferenceAuthorityCapability;
}

function assertMutationSourceRefs(refs: PreferenceSourceRef[]): void {
	if (
		refs.some((ref) =>
			["external", "import", "external_session"].includes(String(ref.kind)),
		)
	)
		throw new Error("external or imported evidence cannot mutate preferences");
}

function mutationBinding(
	preferenceId: string,
	action: "create" | "reinforce" | "contradict" | "reject" | "reopen",
	provenance: PreferenceProvenance,
) {
	return { preferenceId, action, provenance } as const;
}

export function createPreference(
	input: PreferenceCreateInput,
): PreferenceRecord {
	return withPreferenceMutationLock(input.root, (append) =>
		createPreferenceUnlocked(input, append),
	);
}

function createPreferenceUnlocked(
	input: PreferenceCreateInput,
	append: LockedPreferenceAppender,
): PreferenceRecord {
	assertInput(input);
	if (input.evidenceKind === "external")
		throw new Error("external evidence cannot mutate preferences directly");
	assertMutationSourceRefs(input.sourceRefs);
	const evidenceKind = input.evidenceKind ?? input.provenance;
	const authority = admittedAuthority(
		input.projectId,
		evidenceKind,
		input.authority,
		mutationBinding(input.id, "create", input.provenance),
	);
	const sourceRefs = input.sourceRefs;
	const now = (input.now ?? new Date()).toISOString();
	const productionDay = currentProductionDay(input);
	assertProductionDay(productionDay);
	const existing = getPreference(input.db, input.projectId, input.id);
	if (existing) {
		if (
			existing.statement !== input.statement ||
			existing.provenance !== input.provenance
		)
			throw new Error("preference id already exists with different content");
		return existing;
	}
	const initialConfidence = clamp(
		input.confidence ??
			(input.provenance === "structural"
				? 1
				: input.provenance === "explicit"
					? 0.8
					: 0.5),
	);
	const initialWeight = input.evidenceId ? (input.weight ?? 0) : 0;
	const positive = initialWeight > 0 ? 1 : 0;
	const negative =
		initialWeight < 0 ||
		input.evidenceKind === "contradiction" ||
		input.evidenceKind === "rejected"
			? 1
			: 0;
	const confidence = clamp(initialConfidence + initialWeight);
	const preference: PreferenceRecord = {
		project_id: input.projectId,
		id: input.id,
		statement: input.statement.trim(),
		scope: "project",
		status: "active",
		provenance: input.provenance,
		confidence,
		effective_confidence: effectivePreferenceConfidence(
			confidence,
			productionDay,
			productionDay,
		),
		positive_evidence: positive,
		negative_evidence: negative,
		last_reinforced_production_day: productionDay,
		current_production_day: productionDay,
		created_at: now,
		updated_at: now,
		journal_event_id: "pending",
		source_refs: sourceRefs,
	};
	const evidence = input.evidenceId
		? makeEvidence(
				input.projectId,
				input.evidenceId,
				evidenceKind,
				input.weight ?? 0,
				productionDay,
				input.trust ?? "local",
				sourceRefs,
				now,
				"pending",
			)
		: undefined;
	const event = append({
		root: input.root,
		db: input.db,
		projectId: input.projectId,
		authority,
		preference,
		action: "create",
		sourceRefs,
		...(evidence ? { evidence } : {}),
		...(input.now ? { now: input.now } : {}),
		...(input.evolutionEventsDir
			? { evolutionEventsDir: input.evolutionEventsDir }
			: {}),
		...(input.syncDirectory ? { syncDirectory: input.syncDirectory } : {}),
	});
	return (
		getPreference(input.db, input.projectId, input.id) ??
		event.payload.preference
	);
}

function makeEvidence(
	projectId: string,
	id: string,
	kind: PreferenceEvidenceKind,
	weight: number,
	productionDaySequence: number,
	trust: "local" | "untrusted",
	sourceRefs: PreferenceSourceRef[],
	createdAt: string,
	journalEventId: string,
): PreferenceEvidenceRecord {
	assertId(id, "preference evidence id");
	if (!Number.isFinite(weight))
		throw new Error("preference evidence weight must be finite");
	return {
		project_id: projectId,
		id,
		preference_id: "",
		kind,
		trust,
		weight,
		production_day_sequence: productionDaySequence,
		created_at: createdAt,
		journal_event_id: journalEventId,
		source_refs: sourceRefs,
	};
}

function comparableEvidenceSourceRefs(
	refs: PreferenceSourceRef[],
): PreferenceSourceRef[] {
	return refs.filter((ref) => ref.kind !== "decision");
}

function evidenceSourceRefsMatch(
	stored: unknown,
	input: PreferenceSourceRef[],
): boolean {
	try {
		const parsed = JSON.parse(String(stored));
		return (
			Array.isArray(parsed) &&
			preferenceDigest(comparableEvidenceSourceRefs(parsed)) ===
				preferenceDigest(comparableEvidenceSourceRefs(input))
		);
	} catch {
		return false;
	}
}

export function recordPreferenceEvidence(
	input: PreferenceEvidenceInput,
): PreferenceRecord {
	return withPreferenceMutationLock(input.root, (append) =>
		recordPreferenceEvidenceUnlocked(input, append),
	);
}

function recordPreferenceEvidenceUnlocked(
	input: PreferenceEvidenceInput,
	append: LockedPreferenceAppender,
): PreferenceRecord {
	assertInput({
		projectId: input.projectId,
		id: input.preferenceId,
		sourceRefs: input.sourceRefs,
	});
	if (input.kind === "external")
		throw new Error("external evidence cannot mutate preferences directly");
	assertMutationSourceRefs(input.sourceRefs);
	const current = getPreference(input.db, input.projectId, input.preferenceId);
	const duplicateEvent = !current
		? readPreferenceJournal(
				input.root,
				input.projectId,
				input.evolutionEventsDir,
			).find((event) => event.payload.evidence?.id === input.evidenceId)
		: undefined;
	const existingEvidence = current
		? (input.db
				.query(
					"SELECT kind, trust, weight, preference_id, source_refs FROM preference_evidence WHERE project_id = ? AND id = ?",
				)
				.get(input.projectId, input.evidenceId) as Record<
				string,
				unknown
			> | null)
		: null;
	if (
		input.kind === "accepted" &&
		current?.status !== "rejected" &&
		!duplicateEvent
	)
		throw new Error("preference reopen requires a rejected preference");
	if (
		current?.status === "rejected" &&
		input.kind !== "accepted" &&
		!existingEvidence
	)
		throw new Error(
			"rejected preference can only reopen through accepted evidence",
		);
	const mutationAction =
		input.kind === "contradiction"
			? "contradict"
			: input.kind === "rejected"
				? "reject"
				: input.kind === "accepted"
					? "reopen"
					: "reinforce";
	const authority = admittedAuthority(
		input.projectId,
		input.kind,
		input.authority,
		mutationBinding(
			input.preferenceId,
			mutationAction,
			current?.provenance ??
				duplicateEvent?.payload.preference.provenance ??
				"explicit",
		),
	);
	const sourceRefs = input.sourceRefs;
	if (!current) {
		if (duplicateEvent) {
			if (duplicateEvent.payload.preference.id !== input.preferenceId)
				throw new Error("preference evidence belongs to another preference");
			rebuildPreferenceProjection({
				root: input.root,
				db: input.db,
				projectId: input.projectId,
				timezone: input.timezone,
				...(input.evolutionEventsDir
					? { evolutionEventsDir: input.evolutionEventsDir }
					: {}),
			});
			return getPreference(
				input.db,
				input.projectId,
				input.preferenceId,
			) as PreferenceRecord;
		}
		throw new Error("preference does not exist");
	}
	const productionDay = currentProductionDay(input);
	assertProductionDay(productionDay);
	if (existingEvidence) {
		const expectedWeight =
			input.kind === "contradiction" || input.kind === "rejected"
				? -Math.abs(input.weight)
				: Math.abs(input.weight);
		if (
			String(existingEvidence.preference_id) !== input.preferenceId ||
			String(existingEvidence.kind) !== input.kind ||
			Number(existingEvidence.weight) !== expectedWeight ||
			String(existingEvidence.trust) !== (input.trust ?? "local") ||
			!evidenceSourceRefsMatch(existingEvidence.source_refs, input.sourceRefs)
		)
			throw new Error(
				"preference evidence id already exists with different content",
			);
		return current;
	}
	const now = (input.now ?? new Date()).toISOString();
	const effectiveWeight =
		input.kind === "contradiction" || input.kind === "rejected"
			? -Math.abs(input.weight)
			: Math.abs(input.weight);
	const confidence = clamp(current.confidence + effectiveWeight);
	const reinforces = effectiveWeight > 0;
	const next: PreferenceRecord = {
		...current,
		confidence,
		effective_confidence: effectivePreferenceConfidence(
			confidence,
			reinforces ? productionDay : current.last_reinforced_production_day,
			productionDay,
		),
		positive_evidence: current.positive_evidence + (reinforces ? 1 : 0),
		negative_evidence: current.negative_evidence + (reinforces ? 0 : 1),
		last_reinforced_production_day: reinforces
			? productionDay
			: current.last_reinforced_production_day,
		current_production_day: productionDay,
		updated_at: now,
		status: preferenceStatus(
			confidence,
			reinforces ? productionDay : current.last_reinforced_production_day,
			productionDay,
			input.kind === "rejected"
				? "rejected"
				: reinforces
					? "active"
					: current.status,
		),
		journal_event_id: "pending",
	};
	const evidence = makeEvidence(
		input.projectId,
		input.evidenceId,
		input.kind,
		effectiveWeight,
		productionDay,
		input.trust ?? "local",
		sourceRefs,
		now,
		"pending",
	);
	evidence.preference_id = input.preferenceId;
	const event = append({
		root: input.root,
		db: input.db,
		projectId: input.projectId,
		authority,
		preference: next,
		evidence,
		action: mutationAction,
		sourceRefs,
		...(input.now ? { now: input.now } : {}),
		...(input.evolutionEventsDir
			? { evolutionEventsDir: input.evolutionEventsDir }
			: {}),
		...(input.syncDirectory ? { syncDirectory: input.syncDirectory } : {}),
	});
	return (
		getPreference(input.db, input.projectId, input.preferenceId) ??
		event.payload.preference
	);
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
			const evidenceWithPreference = {
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
