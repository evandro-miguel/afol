import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";

export type StoredSourceFile = {
	path: string;
	kind: "plan" | "task" | "log" | "evidence";
	source_hash: string;
};

export type StoredSessionRow = {
	session_id: string;
	hydrated_at: string;
	source_algorithm: string;
	source_hash: string;
	session_path: string;
};

export type StoredTaskRow = {
	session_id: string;
	task_id: string;
	state: string;
	owner: string;
	notes: string;
};

export type StoredEvidenceRow = {
	session_id: string;
	evidence_id: string;
	task_id: string;
	created_at: string;
	command: string;
	result: string;
	exit_code: number | null;
	artifact: string | null;
	note: string | null;
	raw_json: string;
};

function ensureSchema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			session_id TEXT PRIMARY KEY,
			hydrated_at TEXT NOT NULL,
			source_algorithm TEXT NOT NULL,
			source_hash TEXT NOT NULL,
			session_path TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS source_files (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			path TEXT NOT NULL,
			kind TEXT NOT NULL,
			source_hash TEXT NOT NULL,
			UNIQUE(session_id, path)
		);

		CREATE TABLE IF NOT EXISTS tasks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			task_id TEXT NOT NULL,
			state TEXT NOT NULL,
			owner TEXT NOT NULL,
			notes TEXT NOT NULL,
			UNIQUE(session_id, task_id)
		);

		CREATE TABLE IF NOT EXISTS evidence (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			evidence_id TEXT NOT NULL,
			task_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			command TEXT NOT NULL,
			result TEXT NOT NULL,
			exit_code INTEGER,
			artifact TEXT,
			note TEXT,
			raw_json TEXT NOT NULL,
			UNIQUE(session_id, evidence_id)
		);
	`);
}

function ensureFtsSchema(db: Database): void {
	try {
		db.exec(`
			CREATE VIRTUAL TABLE IF NOT EXISTS state_fts USING fts5(kind, ref, content);
		`);
	} catch (error) {
		const message = (error as Error).message.toLowerCase();
		if (
			message.includes("fts5") ||
			message.includes("no such module") ||
			message.includes("virtual table")
		) {
			return;
		}
		throw error;
	}
}

export function openDb(root: string): Database {
	const projectPaths = resolveProjectPaths(root);
	const resolved = resolveProjectWritePath(root, projectPaths.stateDb);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	const stateDbPath = resolved.value.path;
	mkdirSync(dirname(stateDbPath), { recursive: true });
	const db = new Database(stateDbPath);
	db.exec("PRAGMA journal_mode=WAL;");
	db.exec("PRAGMA busy_timeout=5000;");
	db.exec("PRAGMA foreign_keys = ON;");
	ensureSchema(db);
	ensureFtsSchema(db);
	return db;
}

export function closeDb(db: Database): void {
	db.close();
}
