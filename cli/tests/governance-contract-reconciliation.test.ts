import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const repoRoot = process.cwd();
const sourceCommit = "3d24138c77cb73f6f775fdf5799bc3b0e991bfed";
const migrationId = "260726_f29-governance-contract-reconciliation";
const migrationRelativeRoot = `.afol/data/migrations/${migrationId}`;
const migrationRoot = join(repoRoot, migrationRelativeRoot);

type Target = {
	path: string;
	id: string;
	feature: string;
	sha256: string;
	blobOid: string;
	size: number;
	closureMarkers: string[];
};

const targets: Target[] = [
	{
		path: ".afol/adm/specs/260521_0010_universal-agent-cli_spec_01.md",
		id: "260521_0010_universal-agent-cli_spec_01",
		feature: "F-01",
		sha256: "f971065dbffb5babdd1009d13978f500b5d522c47c57ac056e9c0d8189b7f61d",
		blobOid: "eeb645659d7c9a8fb26ae400541a321da180b7e8",
		size: 8976,
		closureMarkers: [
			"E-20260528215311949499",
			"E-20260528220141194181",
			".afol/wb/260528_0722_slice2-cli-kernel-front-door/",
		],
	},
	{
		path: ".afol/adm/specs/260411_agentic-runtime-restructure_spec_01.md",
		id: "260411_agentic-runtime-restructure_spec_01",
		feature: "F-13",
		sha256: "37a1859ed22b775c9ba217e2a9e0165e2afb0c420c1a084b615e21c9349e1d30",
		blobOid: "6575ec5bcb17eb5539b3e7929337e56601fd2166",
		size: 6751,
		closureMarkers: [
			"c24d386",
			"8bd9466",
			".afol/wb/260529_0939_f13-runtime-native-port-closeout/",
		],
	},
	{
		path: ".afol/adm/specs/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md",
		id: "260412_2004_repo-wide-simplification-runtime-parity_spec_01",
		feature: "F-15",
		sha256: "5024757e3db3ff512e59ee80a5680080968eed1c2ee41fe2233c985e9611eb2d",
		blobOid: "44fa7356b726b225587abd993982d69800b76938",
		size: 8966,
		closureMarkers: [
			"260528_1723_map-boundary-cleanup_spec-child_01",
			"260528_1745_runtime-registry-parity_spec-child_01",
			"260528_1759_python-command-simplification_spec-child_01",
		],
	},
	{
		path: ".afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md",
		id: "260521_0110_validation-ci-and-benchmarks_spec_01",
		feature: "F-11",
		sha256: "a61003e1c9cddceab33fe8cecdaa85269d3ed17f627221527d9240ede0604c97",
		blobOid: "6b30d076592d0c9ffbdac27a8cc46c29645a75c3",
		size: 16377,
		closureMarkers: [
			"3a6456e",
			"8dd5e20",
			".afol/data/benchmarks/results/20260529_142633_token-economy.json",
		],
	},
];

type ArchiveArtifact = {
	source?: string;
	destination?: string;
	sha256?: string;
	size?: number;
	source_commit?: string;
	source_mode?: string;
	source_blob_oid?: string;
	reason?: string;
};

type ArchiveManifest = {
	source_commit?: string;
	expected_artifact_count?: number;
	retention_review_at?: string;
	deletion_approved?: boolean;
	artifacts?: ArchiveArtifact[];
};

function read(relativePath: string): string {
	return readFileSync(join(repoRoot, relativePath), "utf8");
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitBlobOid(path: string): string {
	const bytes = readFileSync(path);
	return createHash("sha1")
		.update(`blob ${bytes.byteLength}\0`)
		.update(bytes)
		.digest("hex");
}

function archiveDestination(target: Target): string {
	return `${migrationRelativeRoot}/originals/${target.path}`;
}

function expectTracked(relativePath: string): void {
	const tracked = spawnSync(
		"git",
		["ls-files", "--error-unmatch", "--", relativePath],
		{
			cwd: repoRoot,
			encoding: "utf8",
			shell: false,
		},
	);
	expect(tracked.status, `${relativePath} must be force-tracked`).toBe(0);
}

function expectSafeArchivePath(relativePath: string): void {
	expect(relativePath.includes("\\")).toBe(false);
	expect(isAbsolute(relativePath)).toBe(false);
	expect(relativePath.split("/")).not.toContain(".");
	expect(relativePath.split("/")).not.toContain("..");
	const resolved = resolve(repoRoot, relativePath);
	const insideMigration = relative(migrationRoot, resolved);
	expect(insideMigration).not.toBe("..");
	expect(insideMigration.startsWith("../")).toBe(false);
	expect(isAbsolute(insideMigration)).toBe(false);

	let cursor = repoRoot;
	for (const segment of relativePath.split("/")) {
		cursor = join(cursor, segment);
		const stats = lstatSync(cursor);
		expect(stats.isSymbolicLink(), `${cursor} must not be a symlink`).toBe(
			false,
		);
	}
}

describe("AFOL-only governance contract reconciliation", () => {
	test("keeps final feature identity and closure evidence while stating the current contract", () => {
		const requiredCurrentContract = [
			"## Current AFOL Contract",
			"external `afol` operator",
			"root `./afol`",
			"`cli/**`",
			"`.afol/config.json`",
			"Retired command routing is absent from the active runtime.",
			"`.afol/data/migrations/**`",
			"`bun run typecheck`",
			"`./afol validate project --check-drift --json`",
		];
		const forbiddenActiveLegacy = [
			/\.agents\/agents(?:-mcp)?/,
			/\.agents\/scripts/,
			/\.agents\/runtime/,
			/\.agents\/z-arq/,
			/\bagents\.config\b/,
			/`legacy:`/,
			/\bdelegat(?:e|ed|ion)\b/i,
			/\bPython\b/,
			/\bJust\b/,
		];

		for (const target of targets) {
			const content = read(target.path);
			expect(content).toContain(`id: ${target.id}`);
			expect(content).toContain(`roadmap_feature: ${target.feature}`);
			expect(content).toMatch(/^status: final$/m);
			for (const marker of requiredCurrentContract) {
				expect(content, `${target.path} missing ${marker}`).toContain(marker);
			}
			for (const marker of target.closureMarkers) {
				expect(
					content,
					`${target.path} lost closure marker ${marker}`,
				).toContain(marker);
			}
			for (const pattern of forbiddenActiveLegacy) {
				expect(
					pattern.test(content),
					`${target.path} retains active legacy text matching ${pattern}`,
				).toBe(false);
			}
		}
	});

	test("limits F-11 retired-runtime coverage to explicit compatibility fixtures", () => {
		const f11 = read(
			".afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md",
		);
		expect(f11).toContain(
			"Explicit resolver compatibility fixtures are boundary tests only",
		);
		expect(f11).toContain("| `cli/**` | `cli-kernel-local` |");
		expect(f11).not.toContain("| `.agents/runtime/**` |");
	});

	test("retains exact tracked originals in a safe AFOL migration archive", () => {
		const manifestPath = `${migrationRelativeRoot}/manifest.json`;
		const reviewPath = `${migrationRelativeRoot}/review.md`;
		expect(existsSync(join(repoRoot, manifestPath))).toBe(true);
		expect(existsSync(join(repoRoot, reviewPath))).toBe(true);

		const manifest = JSON.parse(read(manifestPath)) as ArchiveManifest;
		expect(manifest.source_commit).toBe(sourceCommit);
		expect(manifest.expected_artifact_count).toBe(targets.length);
		expect(manifest.retention_review_at).toBe("2026-08-02T18:51:58Z");
		expect(manifest.deletion_approved).toBe(false);
		expect(manifest.artifacts).toHaveLength(targets.length);
		expect(
			(manifest.artifacts ?? []).map((artifact) => artifact.source).sort(),
		).toEqual(targets.map((target) => target.path).sort());
		expect(
			(manifest.artifacts ?? []).map((artifact) => artifact.destination).sort(),
		).toEqual(targets.map(archiveDestination).sort());

		for (const target of targets) {
			const destination = archiveDestination(target);
			const artifact = manifest.artifacts?.find(
				(candidate) => candidate.source === target.path,
			);
			expectSafeArchivePath(destination);
			expect(artifact).toMatchObject({
				source: target.path,
				destination,
				sha256: target.sha256,
				size: target.size,
				source_commit: sourceCommit,
				source_mode: "100644",
				source_blob_oid: target.blobOid,
			});
			expect(artifact?.reason).toContain("active AFOL-only contract");

			const archivedPath = join(repoRoot, destination);
			expect(existsSync(archivedPath)).toBe(true);
			const stats = lstatSync(archivedPath);
			expect(stats.isFile()).toBe(true);
			expect(stats.isSymbolicLink()).toBe(false);
			expect(stats.size).toBe(target.size);
			expect(statSync(archivedPath).size).toBe(target.size);
			expect(sha256(archivedPath)).toBe(target.sha256);
			expect(gitBlobOid(archivedPath)).toBe(target.blobOid);
			expectTracked(destination);
		}

		const review = read(reviewPath);
		expect(review).toContain(sourceCommit);
		expect(review).toContain("2026-08-02T18:51:58Z");
		expect(review).toContain("deletion_approved: false");
		for (const target of targets) {
			expect(review).toContain(target.path);
			expect(review).toContain(target.sha256);
		}
		expectTracked(manifestPath);
		expectTracked(reviewPath);

		const trackedArchive = spawnSync(
			"git",
			["ls-files", "--", migrationRelativeRoot],
			{ cwd: repoRoot, encoding: "utf8", shell: false },
		);
		expect(trackedArchive.status).toBe(0);
		expect(
			trackedArchive.stdout.trim().split("\n").filter(Boolean).sort(),
		).toEqual(
			[manifestPath, reviewPath, ...targets.map(archiveDestination)].sort(),
		);
	});
});
