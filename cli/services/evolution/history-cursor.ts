import type { Database } from "bun:sqlite";

/**
 * Durable history-backfill cursor: `session_id + source hash + extractor
 * version`. A `complete` row whose source hash and extractor version still
 * match means an unchanged rerun writes nothing. A `pending` row keeps the
 * byte offset into the telemetry ledger so an oversized source resumes by
 * page instead of vanishing from coverage.
 */
export type HistoryBackfillCursorStatus = "pending" | "complete";

export type HistoryBackfillCursorRow = {
	project_id: string;
	session_id: string;
	extractor_version: string;
	source_hash: string;
	status: HistoryBackfillCursorStatus;
	byte_offset: number;
	updated_at: string;
};

function isCursorRow(value: unknown): value is HistoryBackfillCursorRow {
	if (typeof value !== "object" || value === null) return false;
	const row = value as Record<string, unknown>;
	return (
		typeof row.project_id === "string" &&
		typeof row.session_id === "string" &&
		typeof row.extractor_version === "string" &&
		typeof row.source_hash === "string" &&
		(row.status === "pending" || row.status === "complete") &&
		typeof row.byte_offset === "number" &&
		Number.isInteger(row.byte_offset) &&
		row.byte_offset >= 0 &&
		typeof row.updated_at === "string"
	);
}

export function readHistoryBackfillCursor(
	db: Database,
	projectId: string,
	sessionId: string,
	extractorVersion: string,
): HistoryBackfillCursorRow | null {
	const row = db
		.query(
			"SELECT project_id, session_id, extractor_version, source_hash, status, byte_offset, updated_at FROM history_backfill_cursors WHERE project_id = ? AND session_id = ? AND extractor_version = ?",
		)
		.get(projectId, sessionId, extractorVersion);
	return row === null || row === undefined
		? null
		: isCursorRow(row)
			? row
			: null;
}

export function writeHistoryBackfillCursor(
	db: Database,
	row: HistoryBackfillCursorRow,
): void {
	if (!isCursorRow(row))
		throw new Error("history backfill cursor row is invalid");
	db.prepare(
		"INSERT INTO history_backfill_cursors (project_id, session_id, extractor_version, source_hash, status, byte_offset, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, session_id, extractor_version) DO UPDATE SET source_hash = excluded.source_hash, status = excluded.status, byte_offset = excluded.byte_offset, updated_at = excluded.updated_at",
	).run(
		row.project_id,
		row.session_id,
		row.extractor_version,
		row.source_hash,
		row.status,
		row.byte_offset,
		row.updated_at,
	);
}
