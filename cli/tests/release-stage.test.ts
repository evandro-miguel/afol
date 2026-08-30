import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageRelease } from "../dev/stage-release";

function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixture(): {
	root: string;
	artifactHash: string;
	stageDir: string;
} {
	const root = mkdtempSync(join(tmpdir(), "afol-release-stage-"));
	const dist = join(root, "dist");
	const compliance = join(root, "release", "compliance", "linux-x64");
	mkdirSync(dist, { recursive: true });
	mkdirSync(compliance, { recursive: true });
	const artifact = Buffer.from("deterministic-afol-binary\n");
	const artifactHash = sha256(artifact);
	writeFileSync(join(dist, "afol"), artifact);
	writeJson(join(root, "package.json"), {
		name: "@evandro/afol",
		version: "0.1.0-alpha.1",
		license: "MIT",
		dependencies: { diff: "9.0.0", valibot: "1.4.2" },
	});
	for (const [name, version, license] of [
		["diff", "9.0.0", "BSD-3-Clause"],
		["valibot", "1.4.2", "MIT"],
	] as const) {
		const packageDir = join(root, "node_modules", name);
		mkdirSync(packageDir, { recursive: true });
		writeJson(join(packageDir, "package.json"), { name, version, license });
	}
	writeJson(join(dist, "afol.provenance.json"), {
		artifact: "dist/afol",
		package_name: "@evandro/afol",
		version: "0.1.0-alpha.1",
		sha256: artifactHash,
		size_bytes: artifact.byteLength,
		bun: "1.4.0",
		generated_at: "2026-08-30T12:00:00.000Z",
		commit_sha: "a".repeat(40),
		platform: "linux",
		arch: "x64",
		build_target: "bun-linux-x64",
	});
	writeJson(join(dist, "security-scan.release.json"), {
		generated_at: "2026-08-30T11:59:00.000Z",
		mode: "release",
		target: {
			artifact: "dist/afol",
			artifact_sha256: artifactHash,
			commit_sha: "a".repeat(40),
			lockfile: "bun.lock",
			lock_sha256: "b".repeat(64),
		},
		scans: [
			{ tool: "osv-scanner", kind: "deps", status: "passed" },
			{ tool: "gitleaks", kind: "secrets", status: "passed" },
		],
	});
	writeFileSync(join(compliance, "AFOL-LICENSE.txt"), "MIT\n", "utf8");
	writeFileSync(
		join(compliance, "BUN-LICENSE.md"),
		"Reviewed Bun notices\n",
		"utf8",
	);
	writeJson(join(compliance, "compliance-review.json"), {
		schema: "afol.release-compliance/v1",
		status: "approved",
		artifact_sha256: artifactHash,
		source_commit_sha: "a".repeat(40),
		bun_version: "1.4.0",
		reviewed_at: "2026-08-30T12:05:00.000Z",
		reviewer: "fixture-reviewer",
		license_files: ["AFOL-LICENSE.txt", "BUN-LICENSE.md"],
	});
	return {
		root,
		artifactHash,
		stageDir: join(dist, "release", "afol-linux-x64"),
	};
}

function snapshotFiles(root: string): Record<string, string> {
	const result: Record<string, string> = {};
	const visit = (dir: string, prefix = "") => {
		for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) visit(path, relative);
			else result[relative] = sha256(readFileSync(path));
		}
	};
	visit(root);
	return result;
}

describe("release staging", () => {
	test("stages final asset names, bound evidence, SPDX, licenses, and deterministic manifest", () => {
		const fixtureState = fixture();
		try {
			const first = stageRelease({ cwd: fixtureState.root });
			expect(first.stageDir).toBe(fixtureState.stageDir);
			expect(
				readFileSync(join(first.stageDir, "afol-linux-x64.sha256"), "utf8"),
			).toBe(`${fixtureState.artifactHash}  afol-linux-x64\n`);
			const provenance = JSON.parse(
				readFileSync(join(first.stageDir, "provenance.json"), "utf8"),
			);
			expect(provenance).toMatchObject({
				artifact: "afol-linux-x64",
				sha256: fixtureState.artifactHash,
				commit_sha: "a".repeat(40),
			});
			const security = JSON.parse(
				readFileSync(join(first.stageDir, "security-scan.json"), "utf8"),
			);
			expect(security.target).toMatchObject({
				artifact: "afol-linux-x64",
				artifact_sha256: fixtureState.artifactHash,
			});
			const sbom = JSON.parse(
				readFileSync(join(first.stageDir, "sbom.spdx.json"), "utf8"),
			);
			expect(sbom.spdxVersion).toBe("SPDX-2.3");
			expect(sbom.packages[0].checksums).toContainEqual({
				algorithm: "SHA256",
				checksumValue: fixtureState.artifactHash,
			});
			expect(sbom.packages.map((pkg: { name: string }) => pkg.name)).toEqual([
				"@evandro/afol",
				"Bun runtime",
				"diff",
				"valibot",
			]);
			const manifest = JSON.parse(
				readFileSync(join(first.stageDir, "manifest.json"), "utf8"),
			);
			const stagedWithoutManifest = Object.keys(
				snapshotFiles(first.stageDir),
			).filter((path) => path !== "manifest.json");
			expect(manifest.files.map((file: { path: string }) => file.path)).toEqual(
				stagedWithoutManifest,
			);
			const before = snapshotFiles(first.stageDir);
			stageRelease({ cwd: fixtureState.root });
			expect(snapshotFiles(first.stageDir)).toEqual(before);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("fails closed before staging without an artifact-bound approval", () => {
		const fixtureState = fixture();
		try {
			const reviewPath = join(
				fixtureState.root,
				"release/compliance/linux-x64/compliance-review.json",
			);
			const review = JSON.parse(readFileSync(reviewPath, "utf8"));
			review.status = "pending";
			writeJson(reviewPath, review);
			expect(() => stageRelease({ cwd: fixtureState.root })).toThrow(
				"compliance review is not approved",
			);
			expect(existsSync(fixtureState.stageDir)).toBe(false);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("rejects an incomplete or unreviewed license set", () => {
		const fixtureState = fixture();
		try {
			rmSync(
				join(fixtureState.root, "release/compliance/linux-x64/BUN-LICENSE.md"),
			);
			expect(() => stageRelease({ cwd: fixtureState.root })).toThrow(
				"reviewed license set does not match",
			);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test.skipIf(process.platform === "win32")(
		"rejects a staging parent that escapes dist through a symlink",
		() => {
			const fixtureState = fixture();
			const outside = mkdtempSync(
				join(tmpdir(), "afol-release-stage-outside-"),
			);
			try {
				symlinkSync(outside, join(fixtureState.root, "dist", "release"));
				expect(() => stageRelease({ cwd: fixtureState.root })).toThrow(
					"release path uses a symlink",
				);
				expect(readdirSync(outside)).toEqual([]);
			} finally {
				rmSync(fixtureState.root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);
});
