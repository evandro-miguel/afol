import { rmSync } from "node:fs";

/**
 * Collect Bun's native SQLite finalizers before removing an isolated fixture.
 * Windows can otherwise retain a transient WAL/SHM handle after db.close().
 */
export function removeTestRoot(root: string): void {
	if (process.platform === "win32") {
		Bun.gc(true);
		Bun.gc(true);
	}
	rmSync(root, { recursive: true, force: true });
}
