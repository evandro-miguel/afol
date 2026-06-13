import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { resolveProjectPaths } from "../project/paths";
import { validateState } from "./validate";

const EXPECTED_TABLES = [
	"sessions",
	"source_files",
	"tasks",
	"evidence",
] as const;

export type DbHealthSeverity = "fail" | "warn" | "info";

export type DbHealthFinding = {
	severity: DbHealthSeverity;
	message: string;
	hint?: string;
};

export type DbHealthReport = {
	ok: boolean;
	schema_ok: boolean;
	db_exists: boolean;
	wal_enabled: boolean;
	fts_ok: boolean;
	orphan_records: number;
	stale_sources: number;
	size_bytes: number;
	findings: DbHealthFinding[];
};

function scalarString(row: Record<string, unknown> | null): string {
	if (!row) {
		return "unknown";
	}
	for (const value of Object.values(row)) {
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}
	return "unknown";
}

function scalarNumber(row: Record<string, unknown> | null): number {
	if (!row) {
		return 0;
	}
	for (const value of Object.values(row)) {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
	}
	return 0;
}

function ftsSupported(db: Database): boolean {
	try {
		const row = db
			.query(`SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled`)
			.get() as Record<string, unknown> | null;
		return scalarNumber(row) === 1;
	} catch {
		return false;
	}
}

function countOrphans(db: Database): number {
	const queries = [
		`SELECT COUNT(*) AS count FROM source_files sf LEFT JOIN sessions s ON s.session_id = sf.session_id WHERE s.session_id IS NULL`,
		`SELECT COUNT(*) AS count FROM tasks t LEFT JOIN sessions s ON s.session_id = t.session_id WHERE s.session_id IS NULL`,
		`SELECT COUNT(*) AS count FROM evidence e LEFT JOIN sessions s ON s.session_id = e.session_id WHERE s.session_id IS NULL`,
	];
	return queries.reduce((total, query) => {
		const row = db.query(query).get() as Record<string, unknown> | null;
		return total + scalarNumber(row);
	}, 0);
}

function countStaleSources(root: string, db: Database): number {
	const rows = db
		.query(`SELECT session_id FROM sessions ORDER BY session_id ASC`)
		.all() as Array<{ session_id: string }>;
	return rows.reduce((total, row) => {
		try {
			const validation = validateState(root, row.session_id);
			return total + validation.mismatches.length;
		} catch {
			return total + 1;
		}
	}, 0);
}

export function checkDbHealth(root: string): DbHealthReport {
	const dbPath = resolveProjectPaths(root).abs.stateDb;
	const dbExists = existsSync(dbPath);
	const size_bytes = dbExists ? statSync(dbPath).size : 0;
	const findings: DbHealthFinding[] = [];

	if (!dbExists) {
		findings.push({ severity: "fail", message: `missing state db: ${dbPath}` });
		return {
			ok: false,
			schema_ok: false,
			db_exists: false,
			wal_enabled: false,
			fts_ok: false,
			orphan_records: 0,
			stale_sources: 0,
			size_bytes,
			findings,
		};
	}

	let db: Database | null = null;
	let schema_ok = true;
	let wal_enabled = false;
	let fts_ok = false;
	let orphan_records = 0;
	let stale_sources = 0;

	try {
		db = new Database(dbPath);
		const journalMode = scalarString(
			db.query(`PRAGMA journal_mode;`).get() as Record<string, unknown> | null,
		).toLowerCase();
		wal_enabled = journalMode === "wal";
		if (!wal_enabled) {
			findings.push({
				severity: "warn",
				message: `WAL not enabled (mode=${journalMode})`,
			});
		}

		const integrity = scalarString(
			db.query(`PRAGMA integrity_check;`).get() as Record<
				string,
				unknown
			> | null,
		);
		if (integrity !== "ok") {
			schema_ok = false;
			findings.push({
				severity: "fail",
				message: `integrity_check failed: ${integrity}`,
			});
		}

		const tables = new Set(
			(
				db
					.query(`SELECT name FROM sqlite_master WHERE type = 'table'`)
					.all() as Array<{ name: string }>
			).map((row) => row.name),
		);
		const missingTables = EXPECTED_TABLES.filter((name) => !tables.has(name));
		if (missingTables.length > 0) {
			schema_ok = false;
			findings.push({
				severity: "fail",
				message: `missing tables: ${missingTables.join(", ")}`,
			});
		}

		fts_ok = tables.has("state_fts");
		if (!fts_ok) {
			findings.push({
				severity: "warn",
				message: ftsSupported(db)
					? "state_fts missing"
					: "fts5 unavailable in this sqlite build",
			});
		}

		orphan_records = countOrphans(db);
		if (orphan_records > 0) {
			findings.push({
				severity: "warn",
				message: `orphan records: ${orphan_records}`,
			});
		}

		stale_sources = countStaleSources(root, db);
		if (stale_sources > 0) {
			findings.push({
				severity: "warn",
				message: `stale sources: ${stale_sources}`,
			});
		}
	} catch (error) {
		schema_ok = false;
		findings.push({ severity: "fail", message: (error as Error).message });
	} finally {
		db?.close();
	}

	return {
		ok: dbExists && schema_ok && orphan_records === 0 && stale_sources === 0,
		schema_ok,
		db_exists: dbExists,
		wal_enabled,
		fts_ok,
		orphan_records,
		stale_sources,
		size_bytes,
		findings,
	};
}
