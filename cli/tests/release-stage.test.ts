import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	cpSync,
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
import { gunzipSync } from "node:zlib";
import { packageStagedReleaseArchive } from "../dev/release-archive";
import {
	buildReleaseSpdxSbom,
	writeReleaseSbomDraft,
} from "../dev/release-sbom";
import { stageRelease, verifyStagedRelease } from "../dev/stage-release";

function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function tarHeaderOffsets(tar: Uint8Array): number[] {
	const offsets: number[] = [];
	let offset = 0;
	while (offset + 512 <= tar.byteLength) {
		const header = tar.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		offsets.push(offset);
		const sizeField = new TextDecoder()
			.decode(header.subarray(124, 136))
			.replace(/\0.*$/u, "")
			.trim();
		const size = sizeField ? Number.parseInt(sizeField, 8) : 0;
		if (!Number.isSafeInteger(size) || size < 0) {
			throw new Error("invalid TAR entry size in test archive");
		}
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return offsets;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildFixtureSbom(root: string, artifactHash: string) {
	return buildReleaseSpdxSbom({
		cwd: root,
		assetName: "afol-linux-x64",
		artifactSha256: artifactHash,
		provenance: {
			package_name: "@evandro/afol",
			version: "0.1.0-alpha.1",
			bun: "1.4.0",
			generated_at: "2026-08-30T12:00:00.000Z",
			commit_sha: "a".repeat(40),
		},
	});
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
		dependencies: { diff: "^9.0.0", valibot: "^1.4.2" },
		optionalDependencies: { "root-optional": "1.0.0" },
	});
	const installedPackages: Array<{
		path: string;
		lockKey: string;
		name: string;
		version: string;
		license: string;
		dependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
		peerDependenciesMeta?: Record<string, { optional: boolean }>;
	}> = [
		{
			path: "node_modules/diff",
			lockKey: "diff",
			name: "diff",
			version: "9.0.0",
			license: "BSD-3-Clause",
			dependencies: { "nested-lib": "^1.0.0", shared: "^1.0.0" },
			optionalDependencies: {
				"missing-optional": "^1.0.0",
				"transitive-optional": "^1.0.0",
			},
		},
		{
			path: "node_modules/valibot",
			lockKey: "valibot",
			name: "valibot",
			version: "1.4.2",
			license: "MIT",
			dependencies: { "nested-lib": "^2.0.0", shared: "^2.0.0" },
			peerDependencies: { typescript: "^5.0.0" },
			peerDependenciesMeta: { typescript: { optional: true } },
		},
		{
			path: "node_modules/root-optional",
			lockKey: "root-optional",
			name: "root-optional",
			version: "1.0.0",
			license: "ISC",
		},
		{
			path: "node_modules/diff/node_modules/transitive-optional",
			lockKey: "diff/transitive-optional",
			name: "transitive-optional",
			version: "1.0.0",
			license: "MIT",
		},
		{
			path: "node_modules/diff/node_modules/nested-lib",
			lockKey: "diff/nested-lib",
			name: "nested-lib",
			version: "1.0.0",
			license: "MIT",
		},
		{
			path: "node_modules/valibot/node_modules/nested-lib",
			lockKey: "valibot/nested-lib",
			name: "nested-lib",
			version: "2.0.0",
			license: "BSD-3-Clause",
		},
		{
			path: "node_modules/diff/node_modules/shared",
			lockKey: "diff/shared",
			name: "shared",
			version: "1.0.0",
			license: "ISC",
		},
		{
			path: "node_modules/valibot/node_modules/shared",
			lockKey: "valibot/shared",
			name: "shared",
			version: "2.0.0",
			license: "Apache-2.0",
		},
		{
			path: "node_modules/valibot/node_modules/typescript",
			lockKey: "valibot/typescript",
			name: "typescript",
			version: "5.4.5",
			license: "Apache-2.0",
		},
	];
	for (const item of installedPackages) {
		const packageDir = join(root, item.path);
		mkdirSync(packageDir, { recursive: true });
		writeJson(join(packageDir, "package.json"), {
			name: item.name,
			version: item.version,
			license: item.license,
			...(item.dependencies ? { dependencies: item.dependencies } : {}),
			...(item.optionalDependencies
				? { optionalDependencies: item.optionalDependencies }
				: {}),
			...(item.peerDependencies
				? { peerDependencies: item.peerDependencies }
				: {}),
			...(item.peerDependenciesMeta
				? { peerDependenciesMeta: item.peerDependenciesMeta }
				: {}),
		});
	}
	const lockPackages: Record<string, unknown> = {};
	for (const item of installedPackages) {
		const info: Record<string, unknown> = {};
		if (item.dependencies) info.dependencies = item.dependencies;
		if (item.optionalDependencies) {
			info.optionalDependencies = item.optionalDependencies;
		}
		if (item.peerDependencies) info.peerDependencies = item.peerDependencies;
		if (item.peerDependenciesMeta) {
			info.optionalPeers = Object.entries(item.peerDependenciesMeta)
				.filter(([, metadata]) => metadata.optional)
				.map(([name]) => name);
		}
		lockPackages[item.lockKey] = [
			`${item.name}@${item.version}`,
			"",
			info,
			"sha512-fixture",
		];
	}
	writeJson(join(root, "bun.lock"), {
		lockfileVersion: 1,
		workspaces: {
			"": {
				dependencies: { diff: "^9.0.0", valibot: "^1.4.2" },
				optionalDependencies: { "root-optional": "1.0.0" },
			},
		},
		packages: lockPackages,
	});
	const lockHash = sha256(readFileSync(join(root, "bun.lock")));
	writeJson(join(dist, "afol.provenance.json"), {
		artifact: "dist/afol",
		package_name: "@evandro/afol",
		version: "0.1.0-alpha.1",
		sha256: artifactHash,
		size_bytes: artifact.byteLength,
		bun: "1.4.0",
		generated_at: "2026-08-30T12:00:00.000Z",
		commit_sha: "a".repeat(40),
		lockfile: "bun.lock",
		lock_sha256: lockHash,
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
			lock_sha256: lockHash,
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
	const sbom = buildFixtureSbom(root, artifactHash);
	const licensePaths = new Set(["AFOL-LICENSE.txt", "BUN-LICENSE.md"]);
	const packageNoticeFiles: Record<string, string[]> = {};
	for (const item of sbom.packages as Array<Record<string, unknown>>) {
		const path =
			item.primaryPackagePurpose === "APPLICATION"
				? "AFOL-LICENSE.txt"
				: item.primaryPackagePurpose === "RUNTIME"
					? "BUN-LICENSE.md"
					: `DEPENDENCY-${String(item.licenseDeclared).replaceAll(/[^A-Za-z0-9.-]/gu, "-")}.txt`;
		if (path.startsWith("DEPENDENCY-") && !licensePaths.has(path)) {
			writeFileSync(
				join(compliance, path),
				`Reviewed fixture ${item.licenseDeclared}\n`,
			);
			licensePaths.add(path);
		}
		packageNoticeFiles[String(item.SPDXID)] = [path];
	}
	writeJson(join(compliance, "compliance-review.json"), {
		schema: "afol.release-compliance/v2",
		status: "approved",
		artifact_sha256: artifactHash,
		source_commit_sha: "a".repeat(40),
		bun_version: "1.4.0",
		reviewed_at: "2026-08-30T12:05:00.000Z",
		reviewer: "fixture-reviewer",
		license_files: [...licensePaths].sort().map((path) => ({
			path,
			sha256: sha256(readFileSync(join(compliance, path))),
		})),
		package_notice_files: packageNoticeFiles,
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
	test("accepts mixed-case reviewed license paths with deterministic sorting", () => {
		const fixtureState = fixture();
		try {
			const complianceDir = join(
				fixtureState.root,
				"release/compliance/linux-x64",
			);
			const path = "a-license.txt";
			const bytes = "Reviewed lowercase license\n";
			writeFileSync(join(complianceDir, path), bytes);
			const reviewPath = join(complianceDir, "compliance-review.json");
			const review = JSON.parse(readFileSync(reviewPath, "utf8"));
			review.license_files.push({ path, sha256: sha256(bytes) });
			writeJson(reviewPath, review);
			const result = stageRelease({ cwd: fixtureState.root });
			expect(existsSync(join(result.stageDir, "licenses", path))).toBe(true);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("binds nested dependency versions to their parent lock key", () => {
		const fixtureState = fixture();
		try {
			const lockPath = join(fixtureState.root, "bun.lock");
			const lock = JSON.parse(readFileSync(lockPath, "utf8"));
			lock.packages["unrelated-parent/nested-lib"] = [
				"nested-lib@1.5.0",
				"",
				{},
				"sha512-fixture",
			];
			writeJson(lockPath, lock);
			writeJson(
				join(
					fixtureState.root,
					"node_modules/diff/node_modules/nested-lib/package.json",
				),
				{
					name: "nested-lib",
					version: "1.5.0",
					license: "MIT",
				},
			);
			expect(() =>
				buildFixtureSbom(fixtureState.root, fixtureState.artifactHash),
			).toThrow("runtime dependency does not match its bun.lock resolution");
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("resolves a hoisted package child without inheriting an unrelated ancestor", () => {
		const fixtureState = fixture();
		try {
			const diffMetadataPath = join(
				fixtureState.root,
				"node_modules/diff/package.json",
			);
			const diffMetadata = JSON.parse(readFileSync(diffMetadataPath, "utf8"));
			diffMetadata.dependencies["hoisted-parent"] = "^1.0.0";
			writeJson(diffMetadataPath, diffMetadata);

			const lockPath = join(fixtureState.root, "bun.lock");
			const lock = JSON.parse(readFileSync(lockPath, "utf8"));
			lock.packages.diff[2].dependencies["hoisted-parent"] = "^1.0.0";
			lock.packages["hoisted-parent"] = [
				"hoisted-parent@1.0.0",
				"",
				{ dependencies: { q: "^1.0.0" } },
				"sha512-fixture",
			];
			lock.packages.q = ["q@1.2.0", "", {}, "sha512-fixture"];
			lock.packages["diff/q"] = ["q@1.0.0", "", {}, "sha512-fixture"];
			writeJson(lockPath, lock);
			mkdirSync(join(fixtureState.root, "node_modules/hoisted-parent"), {
				recursive: true,
			});
			writeJson(
				join(fixtureState.root, "node_modules/hoisted-parent/package.json"),
				{
					name: "hoisted-parent",
					version: "1.0.0",
					license: "MIT",
					dependencies: { q: "^1.0.0" },
				},
			);
			mkdirSync(join(fixtureState.root, "node_modules/q"), { recursive: true });
			writeJson(join(fixtureState.root, "node_modules/q/package.json"), {
				name: "q",
				version: "1.2.0",
				license: "MIT",
			});

			const sbom = buildFixtureSbom(
				fixtureState.root,
				fixtureState.artifactHash,
			);
			expect(
				(sbom.packages as Array<{ name: string; versionInfo: string }>)
					.filter((item) => item.name === "q")
					.map((item) => item.versionInfo),
			).toEqual(["1.2.0"]);
			writeJson(join(fixtureState.root, "node_modules/q/package.json"), {
				name: "q",
				version: "1.0.0",
				license: "MIT",
			});
			expect(() =>
				buildFixtureSbom(fixtureState.root, fixtureState.artifactHash),
			).toThrow(
				"runtime dependency does not match its bun.lock resolution: q@1.0.0",
			);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("rejects a root version supplied only by an unrelated lock entry", () => {
		const fixtureState = fixture();
		try {
			const packagePath = join(fixtureState.root, "package.json");
			const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
			packageJson.dependencies.diff = "*";
			writeJson(packagePath, packageJson);
			const lockPath = join(fixtureState.root, "bun.lock");
			const lock = JSON.parse(readFileSync(lockPath, "utf8"));
			lock.workspaces[""].dependencies.diff = "*";
			lock.packages["unrelated-parent/diff"] = [
				"diff@10.0.0",
				"",
				lock.packages.diff[2],
				"sha512-fixture",
			];
			writeJson(lockPath, lock);
			writeJson(join(fixtureState.root, "node_modules/diff/package.json"), {
				name: "diff",
				version: "10.0.0",
				license: "BSD-3-Clause",
				dependencies: { "nested-lib": "^1.0.0", shared: "^1.0.0" },
				optionalDependencies: { "missing-optional": "^1.0.0" },
			});
			expect(() =>
				buildFixtureSbom(fixtureState.root, fixtureState.artifactHash),
			).toThrow("root dependency does not match its bun.lock resolution");
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("rejects lockfile children missing from installed package metadata", () => {
		const fixtureState = fixture();
		try {
			const lockPath = join(fixtureState.root, "bun.lock");
			const lock = JSON.parse(readFileSync(lockPath, "utf8"));
			lock.packages.diff[2].dependencies["locked-only"] = "^1.0.0";
			writeJson(lockPath, lock);
			expect(() =>
				buildFixtureSbom(fixtureState.root, fixtureState.artifactHash),
			).toThrow(
				"installed dependency metadata does not match bun.lock: diff@9.0.0",
			);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("writes an artifact and lock-bound SPDX review draft without approval", () => {
		const fixtureState = fixture();
		try {
			const draft = writeReleaseSbomDraft({ cwd: fixtureState.root });
			const parsed = JSON.parse(readFileSync(draft.path, "utf8"));
			expect(draft.path).toBe(
				join(fixtureState.root, "dist/sbom.spdx.draft.json"),
			);
			expect(draft.artifactSha256).toBe(fixtureState.artifactHash);
			expect(
				parsed.packages.some((item: { name: string }) => item.name === "diff"),
			).toBe(true);
			const cli = spawnSync(
				process.execPath,
				[join(import.meta.dir, "../dev/release-sbom.ts")],
				{ cwd: fixtureState.root, encoding: "utf8" },
			);
			expect(cli.status).toBe(0);
			expect(cli.stdout).toContain("no compliance approval is asserted");
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("refuses an SBOM draft when provenance does not bind the artifact or lock", () => {
		const fixtureState = fixture();
		try {
			writeFileSync(join(fixtureState.root, "dist/afol"), "changed binary\n");
			expect(() => writeReleaseSbomDraft({ cwd: fixtureState.root })).toThrow(
				"release provenance does not bind the artifact",
			);
			expect(
				existsSync(join(fixtureState.root, "dist/sbom.spdx.draft.json")),
			).toBe(false);
			writeFileSync(
				join(fixtureState.root, "dist/afol"),
				"deterministic-afol-binary\n",
			);
			writeFileSync(join(fixtureState.root, "bun.lock"), "{}\n");
			expect(() => writeReleaseSbomDraft({ cwd: fixtureState.root })).toThrow(
				"release provenance does not bind the current bun.lock",
			);
			expect(
				existsSync(join(fixtureState.root, "dist/sbom.spdx.draft.json")),
			).toBe(false);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("binds the stage manifest source commit to provenance", async () => {
		const outcomes: boolean[][] = [];
		for (const mutation of ["missing", "malformed", "different"] as const) {
			const fixtureState = fixture();
			try {
				const stage = stageRelease({ cwd: fixtureState.root });
				const manifestPath = join(stage.stageDir, "manifest.json");
				const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
				if (mutation === "missing") delete manifest.source_commit_sha;
				else if (mutation === "malformed")
					manifest.source_commit_sha = "a".repeat(39);
				else manifest.source_commit_sha = "b".repeat(40);
				writeJson(manifestPath, manifest);
				let verifierRejected = false;
				try {
					verifyStagedRelease({
						cwd: fixtureState.root,
						stageDir: stage.stageDir,
					});
				} catch {
					verifierRejected = true;
				}
				let archiveRejected = false;
				try {
					await packageStagedReleaseArchive({
						cwd: fixtureState.root,
						stageDir: stage.stageDir,
					});
				} catch {
					archiveRejected = true;
				}
				outcomes.push([verifierRejected, archiveRejected]);
			} finally {
				rmSync(fixtureState.root, { recursive: true, force: true });
			}
		}
		expect(outcomes).toEqual([
			[true, true],
			[true, true],
			[true, true],
		]);
	});

	test("archives the exact verified stage reproducibly without overwriting outputs", async () => {
		const firstFixture = fixture();
		const secondFixture = fixture();
		try {
			const firstStage = stageRelease({ cwd: firstFixture.root });
			const first = await packageStagedReleaseArchive({
				cwd: firstFixture.root,
				stageDir: firstStage.stageDir,
			});
			const archiveBytes = readFileSync(first.archivePath);
			const tarBytes = gunzipSync(archiveBytes);
			const headerOffsets = tarHeaderOffsets(tarBytes);
			const archiveFiles = await new Bun.Archive(archiveBytes).files();
			expect(first.archiveName).toBe("afol-linux-x64.tar.gz");
			expect(first.archiveSha256).toBe(sha256(archiveBytes));
			expect(headerOffsets.length).toBeGreaterThan(0);
			for (const offset of headerOffsets) {
				expect([...tarBytes.subarray(offset + 136, offset + 148)]).toEqual([
					...new Uint8Array(11).fill(0x30),
					0,
				]);
			}
			expect(readFileSync(first.checksumPath, "utf8")).toBe(
				`${first.archiveSha256}  ${first.archiveName}\n`,
			);
			expect([...archiveFiles.keys()].sort()).toEqual(firstStage.files);
			for (const path of firstStage.files) {
				const archiveFile = archiveFiles.get(path);
				if (!archiveFile) throw new Error(`missing archive entry: ${path}`);
				expect(sha256(new Uint8Array(await archiveFile.arrayBuffer()))).toBe(
					sha256(readFileSync(join(firstStage.stageDir, ...path.split("/")))),
				);
			}
			const originalArchive = Buffer.from(archiveBytes);
			const originalChecksum = readFileSync(first.checksumPath);
			await expect(
				packageStagedReleaseArchive({
					cwd: firstFixture.root,
					stageDir: firstStage.stageDir,
				}),
			).rejects.toThrow("release archive output already exists");
			expect(readFileSync(first.archivePath)).toEqual(originalArchive);
			expect(readFileSync(first.checksumPath)).toEqual(originalChecksum);

			const secondStage = stageRelease({ cwd: secondFixture.root });
			const second = await packageStagedReleaseArchive({
				cwd: secondFixture.root,
				stageDir: secondStage.stageDir,
			});
			expect(readFileSync(second.archivePath)).toEqual(originalArchive);
		} finally {
			rmSync(firstFixture.root, { recursive: true, force: true });
			rmSync(secondFixture.root, { recursive: true, force: true });
		}
	});

	test("exposes release archive packaging through the --stage-dir CLI", () => {
		const fixtureState = fixture();
		try {
			const stage = stageRelease({ cwd: fixtureState.root });
			const result = spawnSync(
				process.execPath,
				[
					join(import.meta.dir, "../dev/release-archive.ts"),
					"--stage-dir",
					stage.stageDir,
				],
				{ cwd: fixtureState.root, encoding: "utf8" },
			);
			expect(result.status).toBe(0);
			expect(result.stdout).toContain("release archive ready:");
			expect(
				existsSync(
					join(fixtureState.root, "dist/release/afol-linux-x64.tar.gz"),
				),
			).toBe(true);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

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
				"nested-lib",
				"nested-lib",
				"root-optional",
				"shared",
				"shared",
				"transitive-optional",
				"typescript",
				"valibot",
			]);
			const packageIds = new Map(
				(
					sbom.packages as Array<{
						name: string;
						versionInfo?: string;
						SPDXID: string;
					}>
				).map((pkg) => [`${pkg.name}@${pkg.versionInfo ?? ""}`, pkg.SPDXID]),
			);
			const relationships = sbom.relationships as Array<{
				spdxElementId: string;
				relationshipType: string;
				relatedSpdxElement: string;
			}>;
			const packageId = (name: string, version: string) => {
				const id = packageIds.get(`${name}@${version}`);
				if (!id) throw new Error(`missing SPDX package ${name}@${version}`);
				return id;
			};
			const relationship = (
				spdxElementId: string,
				relationshipType: string,
				relatedSpdxElement: string,
			) => ({ spdxElementId, relationshipType, relatedSpdxElement });
			expect(relationships).toContainEqual(
				relationship(
					"SPDXRef-Package-AFOL",
					"DEPENDS_ON",
					packageId("diff", "9.0.0"),
				),
			);
			expect(relationships).toContainEqual(
				relationship(
					packageId("diff", "9.0.0"),
					"DEPENDS_ON",
					packageId("nested-lib", "1.0.0"),
				),
			);
			expect(relationships).toContainEqual(
				relationship(
					packageId("root-optional", "1.0.0"),
					"OPTIONAL_DEPENDENCY_OF",
					"SPDXRef-Package-AFOL",
				),
			);
			expect(relationships).toContainEqual(
				relationship(
					packageId("transitive-optional", "1.0.0"),
					"OPTIONAL_DEPENDENCY_OF",
					packageId("diff", "9.0.0"),
				),
			);
			expect(relationships).toContainEqual(
				relationship(
					packageId("typescript", "5.4.5"),
					"OPTIONAL_DEPENDENCY_OF",
					packageId("valibot", "1.4.2"),
				),
			);
			expect(
				relationships.filter((item) => item.relationshipType === "CONTAINS"),
			).toEqual([
				relationship(
					"SPDXRef-Package-AFOL",
					"CONTAINS",
					"SPDXRef-Package-Bun-runtime",
				),
			]);
			const nested = sbom.packages.filter(
				(pkg: { name: string }) => pkg.name === "nested-lib",
			);
			expect(
				nested.map((pkg: { versionInfo: string }) => pkg.versionInfo),
			).toEqual(["1.0.0", "2.0.0"]);
			expect(
				new Set(nested.map((pkg: { SPDXID: string }) => pkg.SPDXID)).size,
			).toBe(2);
			expect((sbom.comment as string).toLowerCase()).toContain(
				"cannot be inferred",
			);
			const manifest = JSON.parse(
				readFileSync(join(first.stageDir, "manifest.json"), "utf8"),
			);
			const stagedWithoutManifest = Object.keys(
				snapshotFiles(first.stageDir),
			).filter((path) => path !== "manifest.json");
			expect(manifest.files.map((file: { path: string }) => file.path)).toEqual(
				stagedWithoutManifest.sort(),
			);
			const verified = verifyStagedRelease({
				cwd: fixtureState.root,
				stageDir: first.stageDir,
			});
			expect(verified.files).toEqual(first.files);
			expect(verified.provenance.commit_sha).toBe("a".repeat(40));
			const before = snapshotFiles(first.stageDir);
			stageRelease({ cwd: fixtureState.root });
			expect(snapshotFiles(first.stageDir)).toEqual(before);
			const offlineRoot = mkdtempSync(
				join(tmpdir(), "afol-release-stage-verify-"),
			);
			try {
				const offlineStage = join(offlineRoot, "dist/release/afol-linux-x64");
				mkdirSync(join(offlineRoot, "dist/release"), { recursive: true });
				cpSync(first.stageDir, offlineStage, { recursive: true });
				const offlineResult = verifyStagedRelease({
					cwd: offlineRoot,
					stageDir: offlineStage,
				});
				expect(offlineResult.artifactSha256).toBe(fixtureState.artifactHash);
				expect(existsSync(join(offlineRoot, "bun.lock"))).toBe(false);
				expect(existsSync(join(offlineRoot, "node_modules"))).toBe(false);
			} finally {
				rmSync(offlineRoot, { recursive: true, force: true });
			}
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

	test("rejects changed license content after compliance approval", () => {
		const fixtureState = fixture();
		try {
			writeFileSync(
				join(fixtureState.root, "release/compliance/linux-x64/BUN-LICENSE.md"),
				"Changed after review\n",
			);
			expect(() => stageRelease({ cwd: fixtureState.root })).toThrow(
				"reviewed license hash does not match",
			);
			expect(existsSync(fixtureState.stageDir)).toBe(false);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("keeps the last valid stage when a later compliance check fails", () => {
		const fixtureState = fixture();
		try {
			const first = stageRelease({ cwd: fixtureState.root });
			const before = snapshotFiles(first.stageDir);
			writeFileSync(
				join(fixtureState.root, "release/compliance/linux-x64/BUN-LICENSE.md"),
				"Changed after review\n",
			);
			expect(() => stageRelease({ cwd: fixtureState.root })).toThrow(
				"reviewed license hash does not match",
			);
			expect(snapshotFiles(first.stageDir)).toEqual(before);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("rejects a runtime package missing from the installed dependency closure", () => {
		const fixtureState = fixture();
		try {
			rmSync(
				join(fixtureState.root, "node_modules/diff/node_modules/nested-lib"),
				{ recursive: true },
			);
			expect(() => stageRelease({ cwd: fixtureState.root })).toThrow(
				"missing installed runtime dependency nested-lib",
			);
			expect(existsSync(fixtureState.stageDir)).toBe(false);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("rejects a lockfile changed after release evidence was generated", () => {
		const fixtureState = fixture();
		try {
			writeFileSync(join(fixtureState.root, "bun.lock"), "{}\n");
			expect(() => stageRelease({ cwd: fixtureState.root })).toThrow(
				"release provenance does not bind the current bun.lock",
			);
			expect(existsSync(fixtureState.stageDir)).toBe(false);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("rejects a staged tree with an unmanifested file", () => {
		const fixtureState = fixture();
		try {
			const stage = stageRelease({ cwd: fixtureState.root });
			writeFileSync(join(stage.stageDir, "extra.txt"), "unexpected\n");
			expect(() =>
				verifyStagedRelease({
					cwd: fixtureState.root,
					stageDir: stage.stageDir,
				}),
			).toThrow("release stage files do not match the manifest");
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("exposes standalone staged verification through the CLI", () => {
		const fixtureState = fixture();
		try {
			const stage = stageRelease({ cwd: fixtureState.root });
			const result = spawnSync(
				process.execPath,
				[
					join(import.meta.dir, "../dev/stage-release.ts"),
					"--verify-stage",
					stage.stageDir,
				],
				{ cwd: fixtureState.root, encoding: "utf8" },
			);
			expect(result.status).toBe(0);
			expect(result.stdout).toContain("release stage verified:");
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("stages and replaces a release directly under dist", () => {
		const fixtureState = fixture();
		try {
			const options = { cwd: fixtureState.root, stageDir: "dist/candidate" };
			const first = stageRelease(options);
			expect(first.stageDir).toBe(join(fixtureState.root, "dist/candidate"));
			expect(verifyStagedRelease(options).artifactSha256).toBe(
				fixtureState.artifactHash,
			);
			const before = snapshotFiles(first.stageDir);
			stageRelease(options);
			expect(snapshotFiles(first.stageDir)).toEqual(before);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("preserves an unrecognized directory at the stage destination", () => {
		const fixtureState = fixture();
		try {
			mkdirSync(fixtureState.stageDir, { recursive: true });
			writeFileSync(
				join(fixtureState.stageDir, "notes.txt"),
				"user-owned bytes\n",
			);
			const before = snapshotFiles(fixtureState.stageDir);
			expect(() => stageRelease({ cwd: fixtureState.root })).toThrow(
				"refusing to replace an unverified release stage",
			);
			expect(snapshotFiles(fixtureState.stageDir)).toEqual(before);
			expect(readdirSync(join(fixtureState.stageDir, ".."))).toEqual([
				"afol-linux-x64",
			]);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("preserves a modified prior stage instead of deleting extra files", () => {
		const fixtureState = fixture();
		try {
			stageRelease({ cwd: fixtureState.root });
			writeFileSync(
				join(fixtureState.stageDir, "notes.txt"),
				"user-owned bytes\n",
			);
			const before = snapshotFiles(fixtureState.stageDir);
			expect(() => stageRelease({ cwd: fixtureState.root })).toThrow(
				"refusing to replace an unverified release stage",
			);
			expect(snapshotFiles(fixtureState.stageDir)).toEqual(before);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	test("replaces a verified prior stage with a different source and artifact", () => {
		const fixtureState = fixture();
		try {
			stageRelease({ cwd: fixtureState.root });
			const artifact = Buffer.from("new deterministic binary\n");
			const artifactHash = sha256(artifact);
			const commitSha = "b".repeat(40);
			writeFileSync(join(fixtureState.root, "dist/afol"), artifact);
			const provenancePath = join(
				fixtureState.root,
				"dist/afol.provenance.json",
			);
			const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
			writeJson(provenancePath, {
				...provenance,
				sha256: artifactHash,
				size_bytes: artifact.byteLength,
				commit_sha: commitSha,
			});
			const securityPath = join(
				fixtureState.root,
				"dist/security-scan.release.json",
			);
			const security = JSON.parse(readFileSync(securityPath, "utf8"));
			writeJson(securityPath, {
				...security,
				target: {
					...security.target,
					artifact_sha256: artifactHash,
					commit_sha: commitSha,
				},
			});
			const reviewPath = join(
				fixtureState.root,
				"release/compliance/linux-x64/compliance-review.json",
			);
			const review = JSON.parse(readFileSync(reviewPath, "utf8"));
			writeJson(reviewPath, {
				...review,
				artifact_sha256: artifactHash,
				source_commit_sha: commitSha,
			});
			const stage = stageRelease({ cwd: fixtureState.root });
			expect(stage.artifactSha256).toBe(artifactHash);
			expect(stage.artifactSha256).not.toBe(fixtureState.artifactHash);
			const verified = verifyStagedRelease({
				cwd: fixtureState.root,
				stageDir: stage.stageDir,
			});
			expect(verified.provenance.commit_sha).toBe(commitSha);
		} finally {
			rmSync(fixtureState.root, { recursive: true, force: true });
		}
	});

	for (const stageDir of ["dist/release/candidate", "dist/afol"]) {
		test(`preserves an existing file at ${stageDir}`, () => {
			const fixtureState = fixture();
			try {
				const target = join(fixtureState.root, stageDir);
				mkdirSync(join(target, ".."), { recursive: true });
				if (!existsSync(target)) writeFileSync(target, "user-owned bytes\n");
				const before = readFileSync(target);
				expect(() =>
					stageRelease({ cwd: fixtureState.root, stageDir }),
				).toThrow("release stage is not a directory");
				expect(readFileSync(target)).toEqual(before);
				expect(existsSync(fixtureState.stageDir)).toBe(false);
			} finally {
				rmSync(fixtureState.root, { recursive: true, force: true });
			}
		});
	}

	for (const stageDir of ["dist", "outside/candidate"]) {
		test(`rejects a stage outside strict dist containment: ${stageDir}`, () => {
			const fixtureState = fixture();
			try {
				expect(() =>
					stageRelease({ cwd: fixtureState.root, stageDir }),
				).toThrow("release stage must stay inside dist");
				expect(existsSync(join(fixtureState.root, "outside"))).toBe(false);
			} finally {
				rmSync(fixtureState.root, { recursive: true, force: true });
			}
		});
	}

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
