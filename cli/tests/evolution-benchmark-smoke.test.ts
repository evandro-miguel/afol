import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("evolution benchmark smoke uses public assets from outside a project", () => {
	const root = mkdtempSync(join(tmpdir(), "evolution-public-smoke-"));
	try {
		const result = spawnSync(
			process.execPath,
			[resolve(import.meta.dir, "../dev/evolve-benchmark-smoke.ts")],
			{ cwd: root, encoding: "utf8", timeout: 30_000 },
		);
		expect(result.status, result.stderr).toBe(0);
		expect(result.signal).toBeNull();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 35_000);
