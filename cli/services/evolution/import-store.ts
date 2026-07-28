import { Database } from "bun:sqlite";
import {
	appendImportJournalEventUnlocked,
	type ExternalImportManifest,
	type ImportAcceptanceEvent,
	type ImportAcceptancePayload,
	type ImportCheckpoint,
	importDigest,
	readImportJournal,
	truncateImportJournal,
	withImportMutationLock,
} from "./import-journal";
import { applyMigrations } from "./migrations";

export type AcceptExternalImportInput = {
	root: string;
	db: Database;
	projectId: string;
	payload: ImportAcceptancePayload;
	eventId?: string;
	now?: Date;
	eventsDir?: string;
	/** Called only after journal and projection commit. */
	commitCursor?: () => void;
	/** Narrow seam for proving transaction rollback and journal truncation. */
	beforeCommit?: () => void;
};

export type AcceptedExternalImport = {
	event: ImportAcceptanceEvent;
	checkpoint: ImportCheckpoint | null;
	duplicate: boolean;
};

export type ExternalImportRow = ExternalImportManifest & {
	project_id: string;
	trust: "untrusted";
	link_status: "unlinked" | "pending" | "linked";
	journal_event_id: string;
	created_at: string;
	updated_at: string;
};

function json(value: unknown): string {
	return JSON.stringify(value);
}

function projectImport(db: Database, event: ImportAcceptanceEvent): void {
	const {
		project_id: projectId,
		manifest,
		sessions,
		links,
		checkpoint,
	} = event.payload;
	const createdAt = event.timestamp;
	db.prepare(
		`INSERT INTO external_imports
		(project_id,import_id,provider,adapter_version,source_format,source_path,imported_at,content_digest,session_count,message_count,redaction_policy_version,project_detected,link_status,warnings,files_ignored,trust,raw_stored,journal_event_id,created_at,updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
	).run(
		projectId,
		manifest.import_id,
		manifest.provider,
		manifest.adapter_version,
		manifest.source_format,
		manifest.source_path ?? null,
		manifest.imported_at,
		manifest.content_digest,
		manifest.session_count,
		manifest.message_count,
		manifest.redaction_policy_version,
		manifest.project_detected ?? null,
		links?.length ? "pending" : "unlinked",
		json(manifest.warnings),
		json(manifest.files_ignored),
		"untrusted",
		0,
		event.event_id,
		createdAt,
		createdAt,
	);
	for (const session of sessions)
		db.prepare(
			`INSERT INTO external_sessions
			(project_id,external_session_id,import_id,provider_session_id,content_digest,started_at,ended_at,record_count,normalized_digest,trust,journal_event_id,created_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		).run(
			projectId,
			session.external_session_id,
			manifest.import_id,
			session.provider_session_id,
			session.content_digest,
			session.started_at ?? null,
			session.ended_at ?? null,
			session.record_count,
			session.normalized_digest,
			"untrusted",
			event.event_id,
			createdAt,
		);
	for (const link of links ?? [])
		db.prepare(
			`INSERT INTO session_links
			(project_id,external_session_id,afol_session_id,link_state,confidence,evidence,verified_commit,canonical_decision_ref,confirmation_required,eligible_for_learning,journal_event_id,created_at,updated_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		).run(
			projectId,
			link.external_session_id,
			link.afol_session_id ?? null,
			link.link_state,
			link.confidence,
			json(link.evidence),
			link.verified_commit ?? null,
			link.canonical_decision_ref ?? null,
			link.confirmation_required ? 1 : 0,
			link.eligible_for_learning ? 1 : 0,
			event.event_id,
			createdAt,
			createdAt,
		);
	if (checkpoint)
		db.prepare(
			`INSERT INTO import_checkpoints
			(project_id,import_id,cursor,status,content_digest,updated_at,journal_event_id)
			VALUES (?,?,?,?,?,?,?)`,
		).run(
			projectId,
			manifest.import_id,
			checkpoint.cursor,
			checkpoint.status,
			checkpoint.content_digest,
			createdAt,
			event.event_id,
		);
}

export function projectImportAcceptanceEvent(
	db: Database,
	event: ImportAcceptanceEvent,
): void {
	applyMigrations(db);
	projectImport(db, event);
}

/** Caller must hold the shared evolution import mutation lock. */
export function acceptExternalImportUnderLock(
	input: AcceptExternalImportInput,
): AcceptedExternalImport {
	applyMigrations(input.db);
	const journalEvent = readImportJournal(
		input.root,
		input.projectId,
		input.eventsDir,
	).find(
		(event) =>
			event.payload.manifest.import_id === input.payload.manifest.import_id,
	);
	const existing = input.db
		.query(
			"SELECT journal_event_id FROM external_imports WHERE project_id = ? AND import_id = ?",
		)
		.get(input.projectId, input.payload.manifest.import_id) as {
		journal_event_id?: string;
	} | null;
	if (existing) {
		if (
			!journalEvent ||
			existing.journal_event_id !== journalEvent.event_id ||
			importDigest(journalEvent.payload) !== importDigest(input.payload)
		)
			throw new Error("import projection and journal disagree");
		return {
			event: journalEvent,
			checkpoint: readImportCheckpoint(
				input.db,
				input.projectId,
				input.payload.manifest.import_id,
			),
			duplicate: true,
		};
	}
	if (journalEvent) {
		if (importDigest(journalEvent.payload) !== importDigest(input.payload))
			throw new Error("import projection and journal disagree");
		rebuildExternalImportProjection({
			root: input.root,
			projectId: input.projectId,
			db: input.db,
			...(input.eventsDir ? { eventsDir: input.eventsDir } : {}),
		});
		input.commitCursor?.();
		return {
			event: journalEvent,
			checkpoint: readImportCheckpoint(
				input.db,
				input.projectId,
				input.payload.manifest.import_id,
			),
			duplicate: true,
		};
	}
	const append = appendImportJournalEventUnlocked({
		root: input.root,
		projectId: input.projectId,
		payload: input.payload,
		...(input.eventsDir ? { eventsDir: input.eventsDir } : {}),
		...(input.eventId ? { eventId: input.eventId } : {}),
		...(input.now ? { now: input.now } : {}),
	});
	try {
		input.db.exec("BEGIN IMMEDIATE");
		try {
			projectImport(input.db, append.event);
			input.beforeCommit?.();
			input.db.exec("COMMIT");
		} catch (error) {
			try {
				input.db.exec("ROLLBACK");
			} catch {}
			throw error;
		}
	} catch (error) {
		try {
			truncateImportJournal(append.path, append.previous_size);
		} catch {}
		throw error;
	}
	// Advancing a provider cursor is deliberately outside the transaction. If
	// it fails, retrying with the same idempotency key reuses this event.
	input.commitCursor?.();
	return {
		event: append.event,
		checkpoint: readImportCheckpoint(
			input.db,
			input.projectId,
			input.payload.manifest.import_id,
		),
		duplicate: false,
	};
}

export function acceptExternalImport(
	input: AcceptExternalImportInput,
): AcceptedExternalImport {
	return withImportMutationLock(input.root, () =>
		acceptExternalImportUnderLock(input),
	);
}

export function listExternalImports(
	db: Database,
	projectId: string,
): ExternalImportRow[] {
	return db
		.query(
			"SELECT * FROM external_imports WHERE project_id = ? ORDER BY imported_at DESC, import_id",
		)
		.all(projectId)
		.map((row) => {
			const value = row as Record<string, unknown>;
			return {
				project_id: String(value.project_id),
				import_id: String(value.import_id),
				provider: String(value.provider),
				adapter_version: String(value.adapter_version),
				source_format: String(value.source_format),
				source_path:
					value.source_path === null ? null : String(value.source_path),
				imported_at: String(value.imported_at),
				content_digest: String(value.content_digest),
				session_count: Number(value.session_count),
				message_count: Number(value.message_count),
				redaction_policy_version: String(value.redaction_policy_version),
				project_detected:
					value.project_detected === null
						? null
						: String(value.project_detected),
				link_status: String(
					value.link_status,
				) as ExternalImportRow["link_status"],
				warnings: JSON.parse(String(value.warnings)) as string[],
				files_ignored: JSON.parse(String(value.files_ignored)) as string[],
				redacted: true,
				raw_stored: false,
				trust: "untrusted" as const,
				journal_event_id: String(value.journal_event_id),
				created_at: String(value.created_at),
				updated_at: String(value.updated_at),
			} as ExternalImportRow;
		});
}

export function readImportCheckpoint(
	db: Database,
	projectId: string,
	importId: string,
): ImportCheckpoint | null {
	const row = db
		.query(
			"SELECT cursor,status,content_digest FROM import_checkpoints WHERE project_id = ? AND import_id = ?",
		)
		.get(projectId, importId) as Record<string, unknown> | null;
	if (!row) return null;
	return {
		cursor: String(row.cursor),
		status: String(row.status) as ImportCheckpoint["status"],
		content_digest: String(row.content_digest),
	};
}

const IMPORT_PROJECTION_TABLES = [
	"external_imports",
	"external_sessions",
	"session_links",
	"import_checkpoints",
] as const;

function projectionRows(db: Database, projectId: string): unknown[] {
	return IMPORT_PROJECTION_TABLES.map((table) =>
		db
			.query(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY rowid`)
			.all(projectId),
	);
}

export function validateExternalImportProjection(input: {
	root: string;
	projectId: string;
	db: Database;
	eventsDir?: string;
}): void {
	const expected = new Database(":memory:");
	try {
		applyMigrations(expected);
		for (const event of readImportJournal(
			input.root,
			input.projectId,
			input.eventsDir,
		))
			projectImport(expected, event);
		if (
			importDigest(projectionRows(input.db, input.projectId)) !==
			importDigest(projectionRows(expected, input.projectId))
		)
			throw new Error(
				"evolution db external import projection differs from canonical journal",
			);
	} finally {
		expected.close();
	}
}

export function rebuildExternalImportProjection(input: {
	root: string;
	projectId: string;
	db: Database;
	eventsDir?: string;
}): void {
	const events = readImportJournal(
		input.root,
		input.projectId,
		input.eventsDir,
	);
	input.db.exec("BEGIN IMMEDIATE");
	try {
		input.db
			.prepare("DELETE FROM session_links WHERE project_id = ?")
			.run(input.projectId);
		input.db
			.prepare("DELETE FROM import_checkpoints WHERE project_id = ?")
			.run(input.projectId);
		input.db
			.prepare("DELETE FROM external_sessions WHERE project_id = ?")
			.run(input.projectId);
		input.db
			.prepare("DELETE FROM external_imports WHERE project_id = ?")
			.run(input.projectId);
		for (const event of events) projectImport(input.db, event);
		input.db.exec("COMMIT");
	} catch (error) {
		try {
			input.db.exec("ROLLBACK");
		} catch {}
		throw error;
	}
}
