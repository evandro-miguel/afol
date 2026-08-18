import { removeTestRoot } from "./windows-test-support";

/**
 * Bun's SQLite statement finalizers run after a synchronous test body on
 * Windows. Collect them before deleting an isolated test project so a closed
 * database cannot leave a transient locked WAL/SHM handle behind.
 */
export function removeEvolutionTestRoot(root: string): void {
	removeTestRoot(root);
}

/** Releases closed native SQLite statements before a test mutates its database files. */
export function releaseEvolutionTestHandles(): void {
	if (process.platform === "win32") Bun.gc(true);
}
