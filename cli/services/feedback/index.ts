import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type FeedbackMode = "off" | "local";

export type FeedbackInput = {
	kind?: string;
	message?: string;
	error_code?: string;
	stack?: string;
	metadata?: Record<string, unknown>;
};

export type FeedbackReport = {
	report_id: string;
	created_at: string;
	kind: string;
	message: string;
	error_code: string | null;
	metadata: Record<string, unknown>;
	stack_digest: string | null;
	last_note: string | null;
	last_note_at: string | null;
};

export type FeedbackStatus = {
	mode: FeedbackMode;
	enabled: boolean;
	database_path: string;
	count: number;
	last_created_at: string | null;
};

const BUSY_TIMEOUT_MS = 250;
const MAX_RETRIES = 3;
const MAX_TEXT = 4000;
const MAX_METADATA = 2000;
const SECRET_KEY =
	/(token|password|passphrase|pwd|secret|cookie|authorization|api[_-]?key|credential|private[_-]?key|salt|cert(?:ificate)?|jwt)/i;
const SECRET_VALUE = /(bearer\s+)[a-z0-9._~+/=-]+/gi;
const KEYED_SECRET =
	/(token|password|passphrase|pwd|secret|cookie|authorization|api[_-]?key|credential|private[_-]?key|salt|cert(?:ificate)?|jwt)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const CONTROL_CHARACTER = /\p{Cc}/gu;

function cap(value: string, max = MAX_TEXT): string {
	return value.length > max ? `${value.slice(0, max)}…` : value;
}

function redactString(value: string): string {
	return cap(
		value
			.replace(CONTROL_CHARACTER, " ")
			.replace(SECRET_VALUE, "$1[REDACTED]")
			.replace(KEYED_SECRET, "$1$2[REDACTED]"),
	);
}

export function redactFeedbackValue(value: unknown, depth = 0): unknown {
	if (depth > 4) return "[REDACTED]";
	if (typeof value === "string") return redactString(value);
	if (typeof value === "number" || typeof value === "boolean" || value === null)
		return value;
	if (Array.isArray(value))
		return value
			.slice(0, 20)
			.map((item) => redactFeedbackValue(item, depth + 1));
	if (typeof value !== "object") return "[REDACTED]";
	const result: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (SECRET_KEY.test(key) || /^(env|environment|process_env)$/i.test(key)) {
			result[key] = "[REDACTED]";
		} else {
			result[key] = redactFeedbackValue(item, depth + 1);
		}
	}
	return result;
}

export function redactFeedbackInput(input: FeedbackInput): FeedbackInput {
	const metadata = redactFeedbackValue(input.metadata ?? {}) as Record<
		string,
		unknown
	>;
	const clean: FeedbackInput = {
		kind: cap(redactString(input.kind?.trim() || "unexpected"), 120),
		message: cap(redactString(input.message?.trim() || "local feedback")),
		metadata:
			JSON.stringify(metadata).length > MAX_METADATA
				? { truncated: true }
				: metadata,
	};
	if (input.error_code)
		clean.error_code = cap(redactString(input.error_code.trim()), 120);
	// Keep only a digest: raw stacks are never persisted or displayed.
	if (input.stack)
		clean.stack = cap(
			createHash("sha256").update(input.stack).digest("hex"),
			64,
		);
	return clean;
}

export function resolveFeedbackStateHome(
	env: NodeJS.ProcessEnv = process.env,
): string {
	const configured = env.AFOL_STATE_HOME?.trim();
	if (configured) return resolve(configured);
	const xdg = env.XDG_STATE_HOME?.trim();
	if (xdg) return resolve(xdg, "afol");
	return join(homedir(), ".local", "state", "afol");
}

export function resolveFeedbackDbPath(
	env: NodeJS.ProcessEnv = process.env,
): string {
	return join(resolveFeedbackStateHome(env), "feedback.db");
}

export function feedbackMode(
	env: NodeJS.ProcessEnv = process.env,
): FeedbackMode {
	return env.AFOL_FEEDBACK_MODE?.trim().toLowerCase() === "local"
		? "local"
		: "off";
}

function isBusy(error: unknown): boolean {
	const code =
		error instanceof Error
			? String((error as NodeJS.ErrnoException).code ?? "")
			: "";
	return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED";
}

function withRetry<T>(operation: () => T): T {
	let last: unknown;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
		try {
			return operation();
		} catch (error) {
			last = error;
			if (!isBusy(error)) {
				throw error;
			}
			if (attempt === MAX_RETRIES - 1) break;
		}
	}
	throw new Error(
		`feedback storage contention exceeded ${BUSY_TIMEOUT_MS * MAX_RETRIES}ms: ${last instanceof Error ? last.message : String(last)}`,
	);
}

function ensureSchema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS feedback_reports (
			report_id TEXT PRIMARY KEY,
			created_at TEXT NOT NULL,
			kind TEXT NOT NULL,
			message TEXT NOT NULL,
			error_code TEXT,
			metadata_json TEXT NOT NULL,
			stack_digest TEXT,
			last_note TEXT,
			last_note_at TEXT
		);
		CREATE TABLE IF NOT EXISTS feedback_annotations (
			report_id TEXT NOT NULL REFERENCES feedback_reports(report_id) ON DELETE CASCADE,
			note_hash TEXT NOT NULL,
			note TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY(report_id, note_hash)
		);
	`);
}

export function openFeedbackDb(env: NodeJS.ProcessEnv = process.env): Database {
	const path = resolveFeedbackDbPath(env);
	mkdirSync(dirname(path), { recursive: true });
	const db = new Database(path);
	try {
		db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS};`);
		withRetry(() =>
			db.exec(
				"PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;",
			),
		);
		withRetry(() => ensureSchema(db));
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}

function openExistingFeedbackDb(
	env: NodeJS.ProcessEnv = process.env,
): Database | null {
	const path = resolveFeedbackDbPath(env);
	if (!existsSync(path)) return null;
	const db = new Database(path, { readonly: true });
	try {
		const table = db
			.query(
				"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'feedback_reports'",
			)
			.get();
		if (!table) {
			db.close();
			return null;
		}
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}

function id(): string {
	return `FB-${Date.now()}-${randomUUID()}`;
}

function rowToReport(row: Record<string, unknown>): FeedbackReport {
	let metadata: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(String(row.metadata_json));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			metadata = parsed;
		} else {
			metadata = { malformed: true };
		}
	} catch {
		metadata = { malformed: true };
	}
	return {
		report_id: String(row.report_id),
		created_at: String(row.created_at),
		kind: String(row.kind),
		message: String(row.message),
		error_code: row.error_code === null ? null : String(row.error_code),
		metadata,
		stack_digest: row.stack_digest === null ? null : String(row.stack_digest),
		last_note: row.last_note === null ? null : String(row.last_note),
		last_note_at: row.last_note_at === null ? null : String(row.last_note_at),
	};
}

export function previewFeedback(
	input: FeedbackInput,
	reportId = id(),
): FeedbackReport {
	const clean = redactFeedbackInput(input);
	return {
		report_id: reportId,
		created_at: new Date().toISOString(),
		kind: clean.kind ?? "unexpected",
		message: clean.message ?? "local feedback",
		error_code: clean.error_code ?? null,
		metadata: clean.metadata ?? {},
		stack_digest: clean.stack ?? null,
		last_note: null,
		last_note_at: null,
	};
}

export function recordFeedback(
	input: FeedbackInput,
	env: NodeJS.ProcessEnv = process.env,
	reportId?: string,
): FeedbackReport | null {
	if (feedbackMode(env) !== "local") return null;
	const report = previewFeedback(input, reportId);
	const db = openFeedbackDb(env);
	try {
		withRetry(() => {
			db.exec("BEGIN IMMEDIATE");
			try {
				db.query(
					"INSERT INTO feedback_reports (report_id,created_at,kind,message,error_code,metadata_json,stack_digest,last_note,last_note_at) VALUES (?,?,?,?,?,?,?,?,?)",
				).run(
					report.report_id,
					report.created_at,
					report.kind,
					report.message,
					report.error_code,
					JSON.stringify(report.metadata),
					report.stack_digest,
					null,
					null,
				);
				db.exec("COMMIT");
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		});
		return report;
	} finally {
		db.close();
	}
}

export const saveFeedback = recordFeedback;

export function listFeedback(
	limit = 50,
	env: NodeJS.ProcessEnv = process.env,
): FeedbackReport[] {
	if (feedbackMode(env) !== "local") return [];
	const db = openExistingFeedbackDb(env);
	if (!db) return [];
	try {
		const bounded = Math.max(1, Math.min(1000, Math.floor(limit)));
		return db
			.query(
				"SELECT * FROM feedback_reports ORDER BY created_at DESC, rowid DESC LIMIT ?",
			)
			.all(bounded)
			.map((row) => rowToReport(row as Record<string, unknown>));
	} finally {
		db.close();
	}
}

export function getFeedback(
	reportId: string,
	env: NodeJS.ProcessEnv = process.env,
): FeedbackReport | null {
	if (feedbackMode(env) !== "local") return null;
	const db = openExistingFeedbackDb(env);
	if (!db) return null;
	try {
		const row = db
			.query("SELECT * FROM feedback_reports WHERE report_id = ?")
			.get(reportId) as Record<string, unknown> | null;
		return row ? rowToReport(row) : null;
	} finally {
		db.close();
	}
}

export function annotateFeedback(
	reportId: string | "last",
	note: string,
	env: NodeJS.ProcessEnv = process.env,
): FeedbackReport | null {
	if (feedbackMode(env) !== "local") return null;
	const cleanNote = cap(redactString(note.trim()), MAX_TEXT);
	if (!cleanNote) throw new Error("Feedback note cannot be empty.");
	const db = openFeedbackDb(env);
	try {
		return withRetry(() => {
			db.exec("BEGIN IMMEDIATE");
			try {
				const target =
					reportId === "last"
						? (db
								.query(
									"SELECT report_id FROM feedback_reports ORDER BY created_at DESC, rowid DESC LIMIT 1",
								)
								.get() as { report_id?: string } | null)
						: (db
								.query(
									"SELECT report_id FROM feedback_reports WHERE report_id = ?",
								)
								.get(reportId) as { report_id?: string } | null);
				if (!target?.report_id) {
					db.exec("ROLLBACK");
					return null;
				}
				const now = new Date().toISOString();
				const hash = createHash("sha256").update(cleanNote).digest("hex");
				db.query(
					"INSERT OR IGNORE INTO feedback_annotations (report_id,note_hash,note,created_at) VALUES (?,?,?,?)",
				).run(target.report_id, hash, cleanNote, now);
				db.query(
					"UPDATE feedback_reports SET last_note = ?, last_note_at = ? WHERE report_id = ?",
				).run(cleanNote, now, target.report_id);
				const row = db
					.query("SELECT * FROM feedback_reports WHERE report_id = ?")
					.get(target.report_id) as Record<string, unknown> | null;
				db.exec("COMMIT");
				return row ? rowToReport(row) : null;
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		});
	} finally {
		db.close();
	}
}

export const addFeedbackNote = annotateFeedback;

export function purgeFeedback(
	options: { reportId?: string; all?: boolean; confirm?: boolean },
	env: NodeJS.ProcessEnv = process.env,
): number {
	if (feedbackMode(env) !== "local") return 0;
	if (!options.confirm) throw new Error("Feedback purge requires --confirm.");
	if (!options.reportId && !options.all)
		throw new Error("Feedback purge requires --id or --all.");
	const db = openFeedbackDb(env);
	try {
		return withRetry(() => {
			db.exec("BEGIN IMMEDIATE");
			try {
				const result = options.all
					? db.query("DELETE FROM feedback_reports").run()
					: db
							.query("DELETE FROM feedback_reports WHERE report_id = ?")
							.run(options.reportId as string);
				db.exec("COMMIT");
				return result.changes;
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		});
	} finally {
		db.close();
	}
}

export function feedbackStatus(
	env: NodeJS.ProcessEnv = process.env,
): FeedbackStatus {
	const mode = feedbackMode(env);
	const database_path = resolveFeedbackDbPath(env);
	if (mode !== "local")
		return {
			mode,
			enabled: false,
			database_path,
			count: 0,
			last_created_at: null,
		};
	const db = openExistingFeedbackDb(env);
	if (!db)
		return {
			mode,
			enabled: true,
			database_path,
			count: 0,
			last_created_at: null,
		};
	try {
		const row = db
			.query(
				"SELECT COUNT(*) AS count, MAX(created_at) AS last_created_at FROM feedback_reports",
			)
			.get() as { count: number; last_created_at: string | null };
		return {
			mode,
			enabled: true,
			database_path,
			count: Number(row.count),
			last_created_at: row.last_created_at,
		};
	} finally {
		db.close();
	}
}

export const lastFeedbackNote = (
	env: NodeJS.ProcessEnv = process.env,
): string | null => {
	const report = listFeedback(1, env)[0];
	return report?.last_note ?? null;
};
