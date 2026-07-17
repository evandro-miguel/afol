import { Database } from "bun:sqlite";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	realpathSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveProjectWritePath } from "../project/root";
import { applyMigrations } from "./migrations";

export const EVOLUTION_DB_RELATIVE_PATH = ".afol/state/evolution.db";
const BUSY_TIMEOUT_MS = 5000;
const BUSY_RETRY_MS = 25;
const WINDOWS_RESERVED_DEVICE_NAMES =
	/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

type EvolutionFileStat = NonNullable<ReturnType<typeof lstatSync>>;

/**
 * Evolution state is project-local. Reject Windows namespaces and alternate
 * data streams before any path helper can inspect the filesystem.
 */
export function assertSafeEvolutionProjectRoot(root: string): void {
	if (typeof root !== "string" || root.length === 0)
		throw new Error("evolution project root must be a non-empty path");
	const normalized = root.replaceAll("/", "\\");
	if (
		normalized.startsWith("\\\\") ||
		normalized.startsWith("\\?\\") ||
		normalized.startsWith("\\.\\") ||
		normalized.startsWith("\\??\\")
	)
		throw new Error(
			"evolution project root must not use UNC, device, or extended path syntax",
		);
	const firstColon = root.indexOf(":");
	if (firstColon !== -1) {
		const isDriveRoot = /^[A-Za-z]:[\\/]/.test(root);
		const hasAdditionalColon = root.indexOf(":", firstColon + 1) !== -1;
		if (!isDriveRoot || hasAdditionalColon)
			throw new Error(
				"evolution project root must not use drive-relative or ADS path syntax",
			);
	}
	const withoutDrive = normalized.replace(/^[A-Za-z]:[\\/]?/, "");
	for (const component of withoutDrive.split(/[\\/]+/)) {
		const normalizedComponent = component.replace(/[ .]+$/, "");
		const deviceName = (normalizedComponent.split(".", 1)[0] ?? "").replace(
			/[ .]+$/,
			"",
		);
		if (WINDOWS_RESERVED_DEVICE_NAMES.test(deviceName)) {
			throw new Error(
				"evolution project root must not contain Windows reserved device components",
			);
		}
	}
}

function samePath(left: string, right: string): boolean {
	const normalizedLeft = resolve(left);
	const normalizedRight = resolve(right);
	return process.platform === "win32"
		? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
		: normalizedLeft === normalizedRight;
}

function inspectExistingParent(path: string): void {
	let current = dirname(path);
	while (true) {
		try {
			const stat = lstatSync(current);
			if (stat.isSymbolicLink() || !stat.isDirectory())
				throw new Error("evolution state parent must be a real directory");
			const real = realpathSync(current);
			if (!samePath(real, current))
				throw new Error("evolution state parent crosses a reparse point");
			return;
		} catch (error) {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				(error as { code?: unknown }).code === "ENOENT"
			) {
				const parent = dirname(current);
				if (parent === current) throw error;
				current = parent;
				continue;
			}
			throw error;
		}
	}
}

export function assertSafeEvolutionTarget(
	path: string,
	label: string,
	allowMissing = true,
): EvolutionFileStat | null {
	inspectExistingParent(path);
	try {
		const stat = lstatSync(path);
		if (stat.isSymbolicLink() || !stat.isFile())
			throw new Error(`${label} must be a regular file`);
		if (stat.nlink !== 1) throw new Error(`${label} must not be hardlinked`);
		const real = realpathSync(path);
		if (!samePath(real, path))
			throw new Error(`${label} crosses a reparse point`);
		return stat;
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT" &&
			allowMissing
		)
			return null;
		throw error;
	}
}

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
	assertSafeEvolutionProjectRoot(root);
	const resolved = resolveProjectWritePath(root, configuredPath);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}

export function openEvolutionDb(dbPath: string): Database {
	inspectExistingParent(dbPath);
	mkdirSync(dirname(dbPath), { recursive: true });
	inspectExistingParent(dbPath);
	assertSafeEvolutionTarget(dbPath, "evolution db");
	assertSafeEvolutionTarget(`${dbPath}-wal`, "evolution db WAL");
	assertSafeEvolutionTarget(`${dbPath}-shm`, "evolution db SHM");
	ensurePrivatePermissions(dbPath);
	const db = new Database(dbPath);
	try {
		assertSafeEvolutionTarget(dbPath, "evolution db", false);
		ensurePrivatePermissions(dbPath);
		db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS};`);
		withBusyRetry(() => db.exec("PRAGMA journal_mode=WAL;"));
		assertSafeEvolutionTarget(dbPath, "evolution db", false);
		assertSafeEvolutionTarget(`${dbPath}-wal`, "evolution db WAL");
		assertSafeEvolutionTarget(`${dbPath}-shm`, "evolution db SHM");
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
