import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveProjectWritePath } from "../project/root";
import { applyMigrations } from "./migrations";

export const EVOLUTION_DB_RELATIVE_PATH = ".afol/state/evolution.db";
const BUSY_TIMEOUT_MS = 5000;
const BUSY_RETRY_MS = 25;

function ensurePrivatePermissions(dbPath: string): void {
	if (process.platform === "win32") return;
	const stateDir = dirname(dbPath);
	chmodSync(stateDir, 0o700);
	for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
		if (existsSync(path)) chmodSync(path, 0o600);
	}
}

function withBusyRetry(operation: () => void): void {
	const deadline = Date.now() + BUSY_TIMEOUT_MS;
	for (;;) {
		try {
			operation();
			return;
		} catch (error) {
			const code =
				error instanceof Error
					? String((error as NodeJS.ErrnoException).code ?? "")
					: "";
			if (
				(code !== "SQLITE_BUSY" && code !== "SQLITE_LOCKED") ||
				Date.now() >= deadline
			)
				throw error;
			Bun.sleepSync(BUSY_RETRY_MS);
		}
	}
}

export function evolutionDbPath(
	root: string,
	configuredPath = EVOLUTION_DB_RELATIVE_PATH,
): string {
	const resolved = resolveProjectWritePath(root, configuredPath);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}

export function openEvolutionDb(dbPath: string): Database {
	mkdirSync(dirname(dbPath), { recursive: true });
	ensurePrivatePermissions(dbPath);
	const db = new Database(dbPath);
	try {
		ensurePrivatePermissions(dbPath);
		db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS};`);
		withBusyRetry(() => db.exec("PRAGMA journal_mode=WAL;"));
		ensurePrivatePermissions(dbPath);
		const mode = Object.values(
			(db.query("PRAGMA journal_mode").get() as Record<
				string,
				unknown
			> | null) ?? {},
		).find((value) => typeof value === "string");
		if (String(mode ?? "").toLowerCase() !== "wal") {
			throw new Error("evolution db requires WAL journal mode");
		}
		db.exec("PRAGMA foreign_keys=ON;");
		applyMigrations(db);
		ensurePrivatePermissions(dbPath);
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}

export function closeEvolutionDb(db: Database): void {
	db.close();
}
