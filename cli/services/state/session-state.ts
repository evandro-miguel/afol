import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
} from "node:fs";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { computeSourceHash, type SourceHash } from "../../core/source-hash";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectPaths } from "../project/paths";
import {
	closeDb,
	openDb,
	type StoredEvidenceRow,
	type StoredSessionRow,
	type StoredSourceFile,
	type StoredTaskRow,
} from "./db";

const SESSION_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const TASK_ROW_RE =
	/^\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|$/;
const STATE_READ_BUFFER_BYTES = 64 * 1024;
const MAX_STATE_SOURCE_LINE_CHARS = 1_000_000;

type StateSourceKind = "plan" | "task" | "log" | "evidence";

export type StateSourceFile = {
	path: string;
	kind: StateSourceKind;
	hash: SourceHash;
};

export type SessionStateSummary = {
	planFiles: number;
	taskFiles: number;
	logFiles: number;
	evidenceEntries: number;
	taskRows: number;
	openTasks: number;
	doneTasks: number;
	activeSession: string | null;
};

export type SessionStateSnapshot = {
	kind: "afol_session_state_v1";
	sessionId: string;
	sessionPath: string;
	hydratedAt: string;
	sourceFiles: StateSourceFile[];
	summary: SessionStateSummary;
};

export type SessionStateMismatch = {
	path: string;
	stored: string;
	current: string;
};

export type SessionStateValidation = {
	ok: boolean;
	sessionId: string;
	sessionPath: string;
	message: string;
	hydratedAt: string | null;
	mismatches: SessionStateMismatch[];
	storedSourceCount: number;
	currentSourceCount: number;
};

function assertSessionId(sessionId: string): string {
	const normalized = sessionId.trim();
	if (
		!SESSION_NAME_RE.test(normalized) ||
		normalized.includes("..") ||
		normalized.length === 0
	) {
		throw new Error(`Invalid session identifier: ${sessionId}`);
	}
	return normalized;
}

function sessionDir(root: string, sessionId: string): string {
	return join(resolveProjectPaths(root).abs.wbDir, assertSessionId(sessionId));
}

function activeSession(root: string): string | null {
	const path = resolveProjectPaths(root).abs.activeSessionFile;
	if (!existsSync(path)) {
		return null;
	}
	const value = readFileSync(path, "utf8").trim();
	return value.length > 0 ? value : null;
}

function readText(path: string): string {
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function computeFileSourceHash(path: string): SourceHash {
	const hash = createHash("sha256");
	const decoder = new StringDecoder("utf8");
	const buffer = Buffer.allocUnsafe(STATE_READ_BUFFER_BYTES);
	const fd = openSync(path, "r");
	try {
		for (;;) {
			const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;
			hash.update(decoder.write(buffer.subarray(0, bytesRead)), "utf8");
		}
		hash.update(decoder.end(), "utf8");
		return { algorithm: "sha256", hash: hash.digest("hex") };
	} finally {
		closeSync(fd);
	}
}

function* readTextLines(
	path: string,
): Generator<{ line: string; lineNumber: number }> {
	const decoder = new StringDecoder("utf8");
	const buffer = Buffer.allocUnsafe(STATE_READ_BUFFER_BYTES);
	const fd = openSync(path, "r");
	let pending = "";
	let lineNumber = 0;
	try {
		for (;;) {
			const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;
			pending += decoder.write(buffer.subarray(0, bytesRead));
			let newline = pending.indexOf("\n");
			while (newline >= 0) {
				lineNumber += 1;
				const rawLine = pending.slice(0, newline);
				yield {
					line: rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine,
					lineNumber,
				};
				pending = pending.slice(newline + 1);
				newline = pending.indexOf("\n");
			}
			if (pending.length > MAX_STATE_SOURCE_LINE_CHARS) {
				throw new Error(
					`State source line exceeds ${MAX_STATE_SOURCE_LINE_CHARS} characters at ${path}:${lineNumber + 1}`,
				);
			}
		}
		pending += decoder.end();
		if (pending.length > MAX_STATE_SOURCE_LINE_CHARS) {
			throw new Error(
				`State source line exceeds ${MAX_STATE_SOURCE_LINE_CHARS} characters at ${path}:${lineNumber + 1}`,
			);
		}
		if (pending.length > 0) {
			yield { line: pending, lineNumber: lineNumber + 1 };
		}
	} finally {
		closeSync(fd);
	}
}

function classify(name: string): StateSourceKind | null {
	if (name === ".evidence.jsonl") return "evidence";
	if (name === "plan.md" || name.includes("_plan_")) return "plan";
	if (name === "task.md" || name.includes("_task_")) return "task";
	if (name === "log.md" || name.includes("_log_")) return "log";
	return null;
}

function sourceFilesForSession(
	root: string,
	sessionId: string,
): StateSourceFile[] {
	const base = sessionDir(root, sessionId);
	if (!existsSync(base)) {
		throw new Error(`Session folder not found: ${base}`);
	}
	const files: StateSourceFile[] = [];
	for (const entry of readdirSync(base, { withFileTypes: true })) {
		if (!entry.isFile()) {
			continue;
		}
		const kind = classify(entry.name);
		if (!kind) {
			continue;
		}
		const path = join(base, entry.name);
		files.push({
			path: entry.name,
			kind,
			hash: computeFileSourceHash(path),
		});
	}
	return files.sort((a, b) => a.path.localeCompare(b.path));
}

function parseTaskStats(content: string): {
	taskRows: number;
	openTasks: number;
	doneTasks: number;
} {
	let taskRows = 0;
	let openTasks = 0;
	let doneTasks = 0;
	for (const line of content.split(/\r?\n/)) {
		const match = line.trim().match(TASK_ROW_RE);
		if (!match?.[2]) {
			continue;
		}
		taskRows += 1;
		const state = match[2].trim().toLowerCase();
		if (state === "done") {
			doneTasks += 1;
		} else if (state !== "moved") {
			openTasks += 1;
		}
	}
	return { taskRows, openTasks, doneTasks };
}

function countEvidenceEntries(path: string): number {
	if (!existsSync(path)) {
		return 0;
	}
	let count = 0;
	for (const { line } of readTextLines(path)) {
		if (line.trim()) count += 1;
	}
	return count;
}

function sourceHash(files: readonly StateSourceFile[]): SourceHash {
	return computeSourceHash(
		files.map((file) => `${file.path}\0${file.hash.hash}`).join("\n"),
	);
}

function buildSnapshotFromFiles(
	root: string,
	sessionId: string,
): SessionStateSnapshot {
	const normalizedSessionId = assertSessionId(sessionId);
	const base = sessionDir(root, normalizedSessionId);
	if (!existsSync(base)) {
		throw new Error(`Session folder not found: ${base}`);
	}
	const sourceFiles = sourceFilesForSession(root, normalizedSessionId);
	const taskFiles = sourceFiles.filter((file) => file.kind === "task");
	const planFiles = sourceFiles.filter((file) => file.kind === "plan");
	const logFiles = sourceFiles.filter((file) => file.kind === "log");
	const evidencePath = join(base, ".evidence.jsonl");
	let taskRows = 0;
	let openTasks = 0;
	let doneTasks = 0;
	for (const file of taskFiles) {
		const stats = parseTaskStats(readText(join(base, file.path)));
		taskRows += stats.taskRows;
		openTasks += stats.openTasks;
		doneTasks += stats.doneTasks;
	}
	return {
		kind: "afol_session_state_v1",
		sessionId: normalizedSessionId,
		sessionPath: base,
		hydratedAt: new Date().toISOString(),
		sourceFiles,
		summary: {
			planFiles: planFiles.length,
			taskFiles: taskFiles.length,
			logFiles: logFiles.length,
			evidenceEntries: countEvidenceEntries(evidencePath),
			taskRows,
			openTasks,
			doneTasks,
			activeSession: activeSession(root),
		},
	};
}

function storeSnapshot(root: string, snapshot: SessionStateSnapshot): void {
	const seenTaskIds = new Map<string, string>();
	for (const file of snapshot.sourceFiles.filter(
		(sourceFile) => sourceFile.kind === "task",
	)) {
		for (const [lineIndex, line] of readText(
			join(snapshot.sessionPath, file.path),
		)
			.split(/\r?\n/)
			.entries()) {
			const match = line.trim().match(TASK_ROW_RE);
			const taskId = match?.[1];
			if (!taskId) continue;
			const location = `${file.path}:${lineIndex + 1}`;
			const previous = seenTaskIds.get(taskId);
			if (previous) {
				throw new Error(
					`Duplicate task id ${taskId} in session ${snapshot.sessionId}: ${previous} and ${location}`,
				);
			}
			seenTaskIds.set(taskId, location);
		}
	}
	const db = openDb(root);
	try {
		db.exec("BEGIN");
		try {
			db.query("DELETE FROM evidence WHERE session_id = ?").run(
				snapshot.sessionId,
			);
			db.query("DELETE FROM tasks WHERE session_id = ?").run(
				snapshot.sessionId,
			);
			db.query("DELETE FROM source_files WHERE session_id = ?").run(
				snapshot.sessionId,
			);
			db.query("DELETE FROM sessions WHERE session_id = ?").run(
				snapshot.sessionId,
			);

			const storedHash = sourceHash(snapshot.sourceFiles);
			db.query(
				`INSERT INTO sessions (session_id, hydrated_at, source_algorithm, source_hash, session_path) VALUES (?, ?, ?, ?, ?)`,
			).run(
				snapshot.sessionId,
				snapshot.hydratedAt,
				storedHash.algorithm,
				storedHash.hash,
				snapshot.sessionPath,
			);

			for (const file of snapshot.sourceFiles) {
				db.query(
					`INSERT INTO source_files (session_id, path, kind, source_hash) VALUES (?, ?, ?, ?)`,
				).run(snapshot.sessionId, file.path, file.kind, file.hash.hash);
			}

			for (const file of snapshot.sourceFiles.filter(
				(sourceFile) => sourceFile.kind === "task",
			)) {
				for (const line of readText(
					join(snapshot.sessionPath, file.path),
				).split(/\r?\n/)) {
					const match = line.trim().match(TASK_ROW_RE);
					if (!match?.[1] || !match[2] || !match[3]) {
						continue;
					}
					db.query(
						`INSERT INTO tasks (session_id, task_id, state, owner, notes) VALUES (?, ?, ?, ?, ?)`,
					).run(
						snapshot.sessionId,
						match[1],
						match[2].trim().toLowerCase(),
						match[3].trim(),
						(match[4] ?? "").trim(),
					);
				}
			}

			const evidencePath = join(snapshot.sessionPath, ".evidence.jsonl");
			if (existsSync(evidencePath)) {
				for (const { line, lineNumber } of readTextLines(evidencePath)) {
					const trimmed = line.trim();
					if (!trimmed) {
						continue;
					}
					let parsed: Record<string, unknown>;
					try {
						parsed = JSON.parse(trimmed) as Record<string, unknown>;
					} catch {
						throw new Error(
							`Invalid evidence JSON at ${evidencePath}:${lineNumber}`,
						);
					}
					const evidenceId = typeof parsed.id === "string" ? parsed.id : null;
					const taskId =
						typeof parsed.task_id === "string"
							? parsed.task_id
							: typeof parsed.taskId === "string"
								? parsed.taskId
								: null;
					const createdAt =
						typeof parsed.created_at === "string"
							? parsed.created_at
							: typeof parsed.createdAt === "string"
								? parsed.createdAt
								: null;
					const command =
						typeof parsed.command === "string" ? parsed.command : null;
					const result =
						typeof parsed.result === "string" ? parsed.result : null;
					if (!evidenceId || !taskId || !createdAt || !command || !result) {
						throw new Error(
							`Incomplete evidence at ${evidencePath}:${lineNumber}`,
						);
					}
					db.query(
						`INSERT INTO evidence (session_id, evidence_id, task_id, created_at, command, result, exit_code, artifact, note, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					).run(
						snapshot.sessionId,
						evidenceId,
						taskId,
						createdAt,
						command,
						result,
						typeof parsed.exit_code === "number" ? parsed.exit_code : null,
						typeof parsed.artifact === "string" ? parsed.artifact : null,
						typeof parsed.note === "string" ? parsed.note : null,
						trimmed,
					);
				}
			}

			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	} finally {
		closeDb(db);
	}
}

function loadSnapshotFromDb(
	root: string,
	sessionId: string,
): SessionStateSnapshot | null {
	const normalizedSessionId = assertSessionId(sessionId);
	const db = openDb(root);
	try {
		const sessionRow = db
			.query(
				`SELECT session_id, hydrated_at, source_algorithm, source_hash, session_path FROM sessions WHERE session_id = ?`,
			)
			.get(normalizedSessionId) as StoredSessionRow | null;
		if (!sessionRow) {
			return null;
		}
		const sourceRows = db
			.query(
				`SELECT path, kind, source_hash FROM source_files WHERE session_id = ? ORDER BY path ASC`,
			)
			.all(normalizedSessionId) as StoredSourceFile[];
		const taskRows = db
			.query(
				`SELECT session_id, task_id, state, owner, notes FROM tasks WHERE session_id = ? ORDER BY task_id ASC`,
			)
			.all(normalizedSessionId) as StoredTaskRow[];
		const evidenceRows = db
			.query(
				`SELECT session_id, evidence_id, task_id, created_at, command, result, exit_code, artifact, note, raw_json FROM evidence WHERE session_id = ? ORDER BY id ASC`,
			)
			.all(normalizedSessionId) as StoredEvidenceRow[];

		return {
			kind: "afol_session_state_v1",
			sessionId: normalizedSessionId,
			sessionPath: sessionRow.session_path,
			hydratedAt: sessionRow.hydrated_at,
			sourceFiles: sourceRows.map((row) => ({
				path: row.path,
				kind: row.kind,
				hash: { algorithm: "sha256", hash: row.source_hash },
			})),
			summary: {
				planFiles: sourceRows.filter((row) => row.kind === "plan").length,
				taskFiles: sourceRows.filter((row) => row.kind === "task").length,
				logFiles: sourceRows.filter((row) => row.kind === "log").length,
				evidenceEntries: evidenceRows.length,
				taskRows: taskRows.length,
				openTasks: taskRows.filter(
					(row) => row.state !== "done" && row.state !== "moved",
				).length,
				doneTasks: taskRows.filter((row) => row.state === "done").length,
				activeSession: activeSession(root),
			},
		};
	} finally {
		closeDb(db);
	}
}

function compareSnapshots(
	stored: SessionStateSnapshot,
	current: SessionStateSnapshot,
): SessionStateMismatch[] {
	const mismatches: SessionStateMismatch[] = [];
	const storedHashes = new Map(
		stored.sourceFiles.map((file) => [file.path, file.hash.hash]),
	);
	const currentHashes = new Map(
		current.sourceFiles.map((file) => [file.path, file.hash.hash]),
	);
	const paths = new Set([...storedHashes.keys(), ...currentHashes.keys()]);
	for (const path of [...paths].sort()) {
		const storedHash = storedHashes.get(path);
		const currentHash = currentHashes.get(path);
		if (storedHash !== currentHash) {
			mismatches.push({
				path,
				stored: storedHash ?? "missing",
				current: currentHash ?? "missing",
			});
		}
	}
	return mismatches;
}

export function hydrateSession(
	root: string,
	sessionId: string,
): SessionStateSnapshot {
	const normalizedSessionId = assertSessionId(sessionId);
	return withSessionLock(root, normalizedSessionId, () => {
		const snapshot = buildSnapshotFromFiles(root, normalizedSessionId);
		storeSnapshot(root, snapshot);
		return snapshot;
	});
}

export function loadSessionState(
	root: string,
	sessionId: string,
): SessionStateSnapshot | null {
	return loadSnapshotFromDb(root, sessionId);
}

export function exportSessionState(
	root: string,
	sessionId: string,
): SessionStateSnapshot | null {
	return loadSessionState(root, sessionId);
}

export function validateSessionState(
	root: string,
	sessionId: string,
): SessionStateValidation {
	const normalizedSessionId = assertSessionId(sessionId);
	const stored = loadSessionState(root, normalizedSessionId);
	if (!stored) {
		return {
			ok: false,
			sessionId: normalizedSessionId,
			sessionPath: sessionDir(root, normalizedSessionId),
			message: `No hydrated state found for ${normalizedSessionId}. Run afol hydrate -S ${normalizedSessionId}.`,
			hydratedAt: null,
			mismatches: [],
			storedSourceCount: 0,
			currentSourceCount: 0,
		};
	}
	const current = buildSnapshotFromFiles(root, normalizedSessionId);
	const mismatches = compareSnapshots(stored, current);
	return {
		ok: mismatches.length === 0,
		sessionId: normalizedSessionId,
		sessionPath: stored.sessionPath,
		message:
			mismatches.length === 0
				? `Hydrated state is current for ${normalizedSessionId}.`
				: `Hydrated state drift detected for ${normalizedSessionId}.`,
		hydratedAt: stored.hydratedAt,
		mismatches,
		storedSourceCount: stored.sourceFiles.length,
		currentSourceCount: current.sourceFiles.length,
	};
}

export function isStale(root: string, sessionId: string): boolean {
	return !validateSessionState(root, sessionId).ok;
}

export function sessionSnapshot(
	root: string,
	sessionId: string,
): SessionStateSnapshot | null {
	return loadSessionState(root, sessionId);
}
