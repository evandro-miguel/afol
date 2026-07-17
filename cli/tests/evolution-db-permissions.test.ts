import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evolutionDbPath, openEvolutionDb } from "../services/evolution";

function mode(path: string): number {
	return statSync(path).mode & 0o777;
}

describe("Evolution DB permissions", () => {
	test("repairs existing permissive state and database files on POSIX", () => {
		if (process.platform === "win32") return;
		const root = mkdtempSync(join(tmpdir(), "evolution-db-permissions-"));
		const dbPath = evolutionDbPath(root);
		const stateDir = join(root, ".afol", "state");
		const companions = [`${dbPath}-wal`, `${dbPath}-shm`];
		const first = openEvolutionDb(dbPath);
		first.exec("CREATE TABLE IF NOT EXISTS permission_probe (id INTEGER)");
		first.close();
		try {
			chmodSync(stateDir, 0o755);
			chmodSync(dbPath, 0o644);
			for (const path of companions) {
				if (existsSync(path)) chmodSync(path, 0o644);
			}
			const second = openEvolutionDb(dbPath);
			try {
				expect(mode(stateDir)).toBe(0o700);
				expect(mode(dbPath)).toBe(0o600);
				for (const path of companions) {
					if (existsSync(path)) expect(mode(path)).toBe(0o600);
				}
			} finally {
				second.close();
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
