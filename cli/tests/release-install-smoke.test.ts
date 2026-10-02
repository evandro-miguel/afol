import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageStagedReleaseArchive } from "../dev/release-archive";
import { runReleaseInstallSmoke } from "../dev/release-install-smoke";
import { stageRelease } from "../dev/stage-release";

const VERSION = "0.1.0-alpha.1";
const SOURCE_COMMIT_SHA = "a".repeat(40);
const BASE_URL = "https://downloads.example.invalid/releases/candidate/";
const ARCHIVE_URL =
	"https://downloads.example.invalid/releases/afol-linux-x64.tar.gz";
type FixtureFetch = (input: URL, init?: RequestInit) => Promise<Response>;

function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function fixture(options: { tamperStagedArtifactOnInit?: boolean } = {}): {
	root: string;
	stageDir: string;
	artifactSha256: string;
	markerPath: string;
	mutationFlagPath: string;
} {
	const root = mkdtempSync(join(tmpdir(), "afol-release-install-smoke-"));
	const dist = join(root, "dist");
	const compliance = join(root, "fixture-compliance", "linux-x64");
	const markerPath = join(root, "executed.txt");
	const mutationFlagPath = join(root, "tamper-staged-artifact-on-init");
	const artifactPath = join(dist, "afol");
	const stagedArtifactPath = join(
		root,
		"dist",
		"release",
		"afol-linux-x64",
		"afol-linux-x64",
	);
	const mutationCommand = options.tamperStagedArtifactOnInit
		? `if test -f ${shellQuote(mutationFlagPath)}; then printf '%s\\n' tampered > ${shellQuote(stagedArtifactPath)}; rm ${shellQuote(mutationFlagPath)}; fi`
		: ":";
	const lockText = `${JSON.stringify(
		{
			lockfileVersion: 1,
			workspaces: { "": { dependencies: {}, optionalDependencies: {} } },
			packages: {},
		},
		null,
		2,
	)}\n`;
	mkdirSync(dist, { recursive: true });
	mkdirSync(compliance, { recursive: true });
	writeJson(join(root, "package.json"), {
		name: "@evandro/afol",
		version: VERSION,
		license: "MIT",
		dependencies: {},
	});
	writeFileSync(join(root, "bun.lock"), lockText, "utf8");
	const artifact = `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> ${shellQuote(markerPath)}
case "$1" in
  --version) printf 'afol ${VERSION}\\n' ;;
  init) test -s "\${0%/*}/afol.provenance.json"; mkdir -p .afol; printf 'project-owned data\\n' > .afol/retained.txt; ${mutationCommand} ;;
  qt) printf 'task evidence\\n' >> .afol/retained.txt ;;
  status) test -s .afol/retained.txt ;;
  *) exit 64 ;;
esac
`;
	writeFileSync(artifactPath, artifact, { mode: 0o755 });
	chmodSync(artifactPath, 0o755);
	const artifactSha256 = sha256(readFileSync(artifactPath));
	const lockSha256 = sha256(lockText);
	writeJson(join(dist, "afol.provenance.json"), {
		artifact: "dist/afol",
		package_name: "@evandro/afol",
		version: VERSION,
		sha256: artifactSha256,
		size_bytes: Buffer.byteLength(artifact),
		bun: "1.3.14",
		generated_at: "2026-09-01T12:00:00.000Z",
		commit_sha: SOURCE_COMMIT_SHA,
		platform: "linux",
		arch: "x64",
		build_target: "bun-linux-x64",
		lockfile: "bun.lock",
		lock_sha256: lockSha256,
	});
	writeJson(join(dist, "security-scan.release.json"), {
		generated_at: "2026-09-01T11:59:00.000Z",
		mode: "release",
		target: {
			artifact: "dist/afol",
			artifact_sha256: artifactSha256,
			commit_sha: SOURCE_COMMIT_SHA,
			lockfile: "bun.lock",
			lock_sha256: lockSha256,
		},
		scans: [
			{ tool: "fixture", kind: "deps", status: "passed" },
			{ tool: "fixture", kind: "secrets", status: "passed" },
		],
	});
	const afolNotice = "Synthetic AFOL fixture notice\n";
	const bunNotice = "Synthetic Bun fixture notice\n";
	writeFileSync(join(compliance, "AFOL-LICENSE.txt"), afolNotice, "utf8");
	writeFileSync(join(compliance, "BUN-LICENSE.txt"), bunNotice, "utf8");
	writeJson(join(compliance, "compliance-review.json"), {
		schema: "afol.release-compliance/v2",
		status: "approved",
		artifact_sha256: artifactSha256,
		source_commit_sha: SOURCE_COMMIT_SHA,
		bun_version: "1.3.14",
		reviewed_at: "2026-09-01T12:05:00.000Z",
		reviewer: "synthetic-fixture-only",
		license_files: [
			{ path: "AFOL-LICENSE.txt", sha256: sha256(afolNotice) },
			{ path: "BUN-LICENSE.txt", sha256: sha256(bunNotice) },
		],
		package_notice_files: {
			"SPDXRef-Package-AFOL": ["AFOL-LICENSE.txt"],
			"SPDXRef-Package-Bun-runtime": ["BUN-LICENSE.txt"],
		},
	});
	const staged = stageRelease({
		cwd: root,
		complianceDir: "fixture-compliance/linux-x64",
	});
	return {
		root,
		stageDir: staged.stageDir,
		artifactSha256,
		markerPath,
		mutationFlagPath,
	};
}

function localFetch(
	stageDir: string,
	options: { redirect?: boolean; tamperPath?: string } = {},
): { fetchImpl: FixtureFetch; requests: URL[] } {
	const base = new URL(BASE_URL);
	const cdnBase = new URL("https://cdn.example.invalid/releases/candidate/");
	const requests: URL[] = [];
	const fetchImpl: FixtureFetch = async (input, init) => {
		const url = input;
		requests.push(url);
		expect(init?.credentials).toBe("omit");
		expect(init?.redirect).toBe("manual");
		const headers = new Headers(init?.headers);
		for (const name of ["authorization", "cookie", "referer"]) {
			expect(headers.has(name)).toBe(false);
		}
		if (options.redirect && url.origin === base.origin) {
			const path = url.pathname.slice(base.pathname.length);
			return new Response(null, {
				status: 302,
				headers: {
					location: new URL(`${path}?signature=synthetic`, cdnBase).href,
				},
			});
		}
		const sourceBase = options.redirect ? cdnBase : base;
		if (
			url.origin !== sourceBase.origin ||
			!url.pathname.startsWith(sourceBase.pathname)
		) {
			throw new Error("unexpected fixture URL");
		}
		const path = decodeURIComponent(
			url.pathname.slice(sourceBase.pathname.length),
		);
		const bytes =
			path === options.tamperPath
				? Buffer.from("tampered synthetic fixture\n")
				: readFileSync(join(stageDir, ...path.split("/")));
		return new Response(bytes, { status: 200 });
	};
	return { fetchImpl, requests };
}

function archiveFetch(
	archiveBytes: Uint8Array,
	options: { redirect?: boolean; tamper?: boolean } = {},
): { fetchImpl: FixtureFetch; requests: URL[] } {
	const source = new URL(ARCHIVE_URL);
	const requests: URL[] = [];
	const fetchImpl: FixtureFetch = async (input, init) => {
		requests.push(input);
		expect(init?.credentials).toBe("omit");
		const headers = new Headers(init?.headers);
		for (const name of ["authorization", "cookie", "referer"]) {
			expect(headers.has(name)).toBe(false);
		}
		if (options.redirect && input.origin === source.origin) {
			return new Response(null, {
				status: 302,
				headers: {
					location:
						"https://cdn.example.invalid/releases/afol-linux-x64.tar.gz?signature=synthetic",
				},
			});
		}
		if (options.redirect && input.origin !== "https://cdn.example.invalid") {
			throw new Error("unexpected archive fixture URL");
		}
		if (!options.redirect && input.href !== source.href) {
			throw new Error("unexpected archive fixture URL");
		}
		const bytes = options.tamper
			? Buffer.from("tampered archive\\n")
			: archiveBytes;
		return new Response(bytes, { status: 200 });
	};
	return { fetchImpl, requests };
}

const linuxX64 = process.platform === "linux" && process.arch === "x64";

describe("standalone release install smoke", () => {
	test.skipIf(!linuxX64)(
		"runs the verified candidate lifecycle and preserves the example project",
		async () => {
			const state = fixture();
			try {
				const result = await runReleaseInstallSmoke({
					stageDir: state.stageDir,
					cwd: state.root,
				});
				expect(result).toEqual({
					version: VERSION,
					artifactSha256: state.artifactSha256,
					sourceCommitSha: SOURCE_COMMIT_SHA,
				});
				const executions = readFileSync(state.markerPath, "utf8");
				expect(executions.split("\n")).toContain("init");
				expect(executions).toContain("qt verified-change");
				expect(executions.match(/--version/g)?.length).toBe(3);
			} finally {
				rmSync(state.root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!linuxX64)(
		"refuses a changed stage artifact when copying a later candidate before executing it",
		async () => {
			const state = fixture({ tamperStagedArtifactOnInit: true });
			writeFileSync(
				state.mutationFlagPath,
				"mutate after verified execution\n",
			);
			try {
				await expect(
					runReleaseInstallSmoke({
						stageDir: state.stageDir,
						cwd: state.root,
					}),
				).rejects.toThrow(
					"copied release candidate does not match its verified SHA-256",
				);
				const executions = readFileSync(state.markerPath, "utf8");
				expect(executions.split("\n")).toContain("init");
				expect(executions.match(/--version/g)?.length).toBe(1);
			} finally {
				rmSync(state.root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!linuxX64)(
		"downloads the pinned flat-release archive and verifies its stage before execution",
		async () => {
			const state = fixture();
			try {
				const archive = await packageStagedReleaseArchive({
					cwd: state.root,
					stageDir: state.stageDir,
				});
				const archiveBytes = readFileSync(archive.archivePath);
				const { fetchImpl, requests } = archiveFetch(archiveBytes, {
					redirect: true,
				});
				const result = await runReleaseInstallSmoke({
					archiveUrl: ARCHIVE_URL,
					expectedArchiveSha256: archive.archiveSha256,
					expectedArtifactSha256: state.artifactSha256,
					expectedSourceCommitSha: SOURCE_COMMIT_SHA,
					fetchImpl,
				});
				expect(result.artifactSha256).toBe(state.artifactSha256);
				expect(requests).toHaveLength(2);
				expect(requests[1]?.search).toBe("?signature=synthetic");
				expect(existsSync(state.markerPath)).toBe(true);
			} finally {
				rmSync(state.root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!linuxX64)(
		"refuses an archive with a wrong expected hash before executing its contents",
		async () => {
			const state = fixture();
			try {
				const archive = await packageStagedReleaseArchive({
					cwd: state.root,
					stageDir: state.stageDir,
				});
				const { fetchImpl, requests } = archiveFetch(
					readFileSync(archive.archivePath),
					{ tamper: true },
				);
				await expect(
					runReleaseInstallSmoke({
						archiveUrl: ARCHIVE_URL,
						expectedArchiveSha256: "b".repeat(64),
						expectedArtifactSha256: state.artifactSha256,
						expectedSourceCommitSha: SOURCE_COMMIT_SHA,
						fetchImpl,
					}),
				).rejects.toThrow("downloaded release archive does not match");
				expect(requests).toHaveLength(1);
				expect(existsSync(state.markerPath)).toBe(false);
			} finally {
				rmSync(state.root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!linuxX64)(
		"downloads every pinned manifest file and accepts bounded HTTPS CDN redirects",
		async () => {
			const state = fixture();
			const { fetchImpl, requests } = localFetch(state.stageDir, {
				redirect: true,
			});
			try {
				const result = await runReleaseInstallSmoke({
					baseUrl: BASE_URL,
					expectedArtifactSha256: state.artifactSha256,
					expectedSourceCommitSha: SOURCE_COMMIT_SHA,
					fetchImpl,
				});
				const manifest = JSON.parse(
					readFileSync(join(state.stageDir, "manifest.json"), "utf8"),
				);
				expect(result.artifactSha256).toBe(state.artifactSha256);
				expect(requests).toHaveLength((manifest.files.length + 1) * 2);
				expect(
					requests.some((url) => url.search === "?signature=synthetic"),
				).toBe(true);
				expect(existsSync(state.markerPath)).toBe(true);
			} finally {
				rmSync(state.root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!linuxX64)(
		"refuses a changed manifest-listed file before executing the downloaded binary",
		async () => {
			const state = fixture();
			const { fetchImpl, requests } = localFetch(state.stageDir, {
				tamperPath: "security-scan.json",
			});
			try {
				await expect(
					runReleaseInstallSmoke({
						baseUrl: BASE_URL,
						expectedArtifactSha256: state.artifactSha256,
						expectedSourceCommitSha: SOURCE_COMMIT_SHA,
						fetchImpl,
					}),
				).rejects.toThrow("downloaded release file failed integrity checks");
				expect(requests.length).toBeGreaterThan(1);
				expect(existsSync(state.markerPath)).toBe(false);
			} finally {
				rmSync(state.root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!linuxX64)(
		"refuses a manifest whose declared total exceeds the download limit before fetching files",
		async () => {
			const state = fixture();
			let requests = 0;
			const manifest = JSON.parse(
				readFileSync(join(state.stageDir, "manifest.json"), "utf8"),
			) as { files: Array<Record<string, unknown>> };
			manifest.files = manifest.files.map((entry) => ({
				...entry,
				size_bytes: 600_000_000,
			}));
			const fetchImpl: FixtureFetch = async () => {
				requests += 1;
				return new Response(JSON.stringify(manifest), { status: 200 });
			};
			try {
				await expect(
					runReleaseInstallSmoke({
						baseUrl: BASE_URL,
						expectedArtifactSha256: state.artifactSha256,
						expectedSourceCommitSha: SOURCE_COMMIT_SHA,
						fetchImpl,
					}),
				).rejects.toThrow("release stage exceeds the permitted total size");
				expect(requests).toBe(1);
				expect(existsSync(state.markerPath)).toBe(false);
			} finally {
				rmSync(state.root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!linuxX64)(
		"rejects credential and query-bearing input URLs before making a request",
		async () => {
			const state = fixture();
			let requests = 0;
			const fetchImpl: FixtureFetch = async () => {
				requests += 1;
				return new Response(null, { status: 500 });
			};
			const credentialUrl = new URL(
				"https://downloads.example.invalid/releases/",
			);
			credentialUrl.username = "fixture-user";
			credentialUrl.password = "fixture-password";
			try {
				for (const baseUrl of [
					credentialUrl.href,
					"https://downloads.example.invalid/releases/?token=synthetic-secret",
				]) {
					await expect(
						runReleaseInstallSmoke({
							baseUrl,
							expectedArtifactSha256: state.artifactSha256,
							expectedSourceCommitSha: SOURCE_COMMIT_SHA,
							fetchImpl,
						}),
					).rejects.toThrow("release base URL must be plain HTTPS");
				}
				expect(requests).toBe(0);
				expect(existsSync(state.markerPath)).toBe(false);
			} finally {
				rmSync(state.root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!linuxX64)(
		"rejects an HTTP redirect without following or exposing its target",
		async () => {
			const state = fixture();
			const requests: URL[] = [];
			const fetchImpl: FixtureFetch = async (input) => {
				requests.push(input);
				return new Response(null, {
					status: 302,
					headers: {
						location: "http://invalid.example.invalid/?token=synthetic-secret",
					},
				});
			};
			try {
				let failure: Error | undefined;
				try {
					await runReleaseInstallSmoke({
						baseUrl: BASE_URL,
						expectedArtifactSha256: state.artifactSha256,
						expectedSourceCommitSha: SOURCE_COMMIT_SHA,
						fetchImpl,
					});
				} catch (error) {
					failure = error as Error;
				}
				expect(failure?.message).toContain("redirect must remain HTTPS");
				expect(failure?.message).not.toContain("synthetic-secret");
				expect(requests).toHaveLength(1);
				expect(existsSync(state.markerPath)).toBe(false);
			} finally {
				rmSync(state.root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!linuxX64)(
		"cancels a chunked response as soon as it exceeds the manifest limit",
		async () => {
			let pullCount = 0;
			let cancelled = false;
			const fetchImpl: FixtureFetch = async () =>
				new Response(
					new ReadableStream<Uint8Array>(
						{
							pull(controller) {
								pullCount += 1;
								if (pullCount === 1) {
									controller.enqueue(new Uint8Array(1_000_001));
								} else {
									controller.close();
								}
							},
							cancel() {
								cancelled = true;
							},
						},
						{ highWaterMark: 0 },
					),
					{ status: 200 },
				);
			await expect(
				runReleaseInstallSmoke({
					baseUrl: BASE_URL,
					expectedArtifactSha256: "a".repeat(64),
					expectedSourceCommitSha: SOURCE_COMMIT_SHA,
					fetchImpl,
				}),
			).rejects.toThrow("release download exceeded the permitted file size");
			expect(pullCount).toBe(1);
			expect(cancelled).toBe(true);
		},
	);
});
