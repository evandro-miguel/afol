import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	evolutionDbPath,
	openEvolutionDb,
	openEvolutionDbSnapshot,
} from "../services/evolution";

function waitForFile(path: string, timeoutMs = 5_000): void {
	const deadline = Date.now() + timeoutMs;
	while (!existsSync(path)) {
		if (Date.now() >= deadline)
			throw new Error(`timed out waiting for ${path}`);
		Bun.sleepSync(10);
	}
}

describe("evolution DB snapshots", () => {
	test("uses committed same-isolate state without mutating WAL files", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-db-snapshot-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		db.exec("CREATE TABLE snapshot_probe (id INTEGER PRIMARY KEY)");
		db.exec("INSERT INTO snapshot_probe VALUES (1)");
		const sourceState = () =>
			[dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map((path) => ({
				path,
				mtime: statSync(path).mtimeMs,
				bytes: readFileSync(path).toString("base64"),
			}));
		try {
			const before = sourceState();
			const snapshot = openEvolutionDbSnapshot(dbPath);
			try {
				expect(
					snapshot.db
						.query("SELECT count(*) AS count FROM snapshot_probe")
						.get(),
				).toEqual({ count: 1 });
			} finally {
				snapshot.close();
			}
			expect(sourceState()).toEqual(before);
		} finally {
			db.close();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("waits for writable handles before copying a WAL snapshot", async () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-db-snapshot-"));
		const dbPath = evolutionDbPath(root);
		const db = openEvolutionDb(dbPath);
		db.exec("CREATE TABLE snapshot_probe (id INTEGER PRIMARY KEY)");
		db.exec("INSERT INTO snapshot_probe VALUES (1)");
		const ready = join(root, "snapshot-ready");
		const result = join(root, "snapshot-result");
		const modulePath = join(import.meta.dir, "../services/evolution");
		const child = Bun.spawn(
			[
				"bun",
				"-e",
				`import { openEvolutionDbSnapshot } from ${JSON.stringify(modulePath)}; import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(ready)}, "ready"); const snapshot=openEvolutionDbSnapshot(${JSON.stringify(dbPath)}); try { const row=snapshot.db.query("SELECT count(*) AS count FROM snapshot_probe").get(); writeFileSync(${JSON.stringify(result)}, JSON.stringify(row)); } finally { snapshot.close(); }`,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		try {
			waitForFile(ready);
			Bun.sleepSync(500);
			expect(existsSync(result)).toBe(false);
			db.close();
			expect(await child.exited).toBe(0);
			waitForFile(result);
			expect(Bun.file(result).json()).resolves.toEqual({ count: 1 });
		} finally {
			db.close();
			if (child.exitCode === null) child.kill();
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("snapshot helper remains directly usable after writers close", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-db-snapshot-"));
		const dbPath = evolutionDbPath(root);
		openEvolutionDb(dbPath).close();
		try {
			const snapshot = openEvolutionDbSnapshot(dbPath);
			snapshot.close();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
