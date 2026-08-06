import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReleaseArtifact } from "../dev/build-release";

function fileSha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("deterministic release build", () => {
	test("two fixed-path plain compiled builds produce identical SHA-256", () => {
		const sandbox = mkdtempSync(join(tmpdir(), "reproducible-build-"));
		try {
			const firstRoot = join(sandbox, "first");
			const secondRoot = join(sandbox, "second");
			mkdirSync(firstRoot, { recursive: true });
			mkdirSync(secondRoot, { recursive: true });

			const first = buildReleaseArtifact({
				cwd: firstRoot,
				outfile: "dist/afol",
			});
			const second = buildReleaseArtifact({
				cwd: secondRoot,
				outfile: "dist/afol",
			});

			expect(first.outfile).toBe(join(firstRoot, "dist", "afol"));
			expect(second.outfile).toBe(join(secondRoot, "dist", "afol"));
			expect(fileSha256(first.outfile)).toBe(first.sha256);
			expect(first.sha256).toBe(second.sha256);

			const version = spawnSync(first.outfile, ["--version"], {
				cwd: firstRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			expect(version.status).toBe(0);
			expect(version.stdout as string).toContain("afol");
		} finally {
			rmSync(sandbox, { recursive: true, force: true });
		}
	});
});
