#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { verifyStagedRelease } from "./stage-release";

const ASSET_NAME = "afol-linux-x64";
const MAX_MANIFEST_BYTES = 1_000_000;
const MAX_RELEASE_FILE_BYTES = 1_000_000_000;
const MAX_RELEASE_ARCHIVE_BYTES = 1_000_000_000;
const MAX_RELEASE_TOTAL_BYTES = 1_000_000_000;
const MAX_RELEASE_ARCHIVE_EXPANDED_BYTES = MAX_RELEASE_TOTAL_BYTES;
const MAX_REDIRECTS = 5;
const DEFAULT_RESOURCE_TIMEOUT_MS = 60_000;

type JsonRecord = Record<string, unknown>;

type ManifestEntry = {
	path: string;
	sha256: string;
	size_bytes: number;
};

type ReleaseSmokeFetch = (input: URL, init?: RequestInit) => Promise<Response>;

type ReleaseManifest = {
	schema: "afol.release-stage/v1";
	asset: string;
	artifact_sha256: string;
	source_commit_sha: string;
	files: ManifestEntry[];
};

type SmokeOptions = {
	stageDir?: string;
	baseUrl?: string;
	archiveUrl?: string;
	expectedArtifactSha256?: string;
	expectedSourceCommitSha?: string;
	expectedArchiveSha256?: string;
	cwd?: string;
	fetchImpl?: ReleaseSmokeFetch;
	resourceTimeoutMs?: number;
	maxArchiveExpandedBytes?: number;
	now?: () => number;
};

type VerifiedRelease = {
	stageDir: string;
	assetPath: string;
	artifactSha256: string;
	provenanceSha256: string;
	version: string;
	sourceCommitSha: string;
};

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, field: string): string {
	const value = record[field];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`release provenance is missing ${field}`);
	}
	return value;
}

function validSha256(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function validCommitSha(value: unknown): value is string {
	return (
		typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value)
	);
}

function assertPinnedRelease(
	artifactSha256: string,
	sourceCommitSha: string,
	options: SmokeOptions,
): void {
	if (options.expectedArtifactSha256 !== artifactSha256) {
		throw new Error("release artifact does not match the expected SHA-256");
	}
	if (options.expectedSourceCommitSha !== sourceCommitSha) {
		throw new Error(
			"release source commit does not match the expected full SHA",
		);
	}
}

function assertSupportedHost(): void {
	if (process.platform !== "linux" || process.arch !== "x64") {
		throw new Error("standalone release smoke supports Linux x64 only");
	}
}

function parseManifest(text: string): ReleaseManifest {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error("release manifest is invalid JSON");
	}
	if (!isRecord(value)) throw new Error("release manifest must be an object");
	if (
		value.schema !== "afol.release-stage/v1" ||
		value.asset !== ASSET_NAME ||
		!validSha256(value.artifact_sha256) ||
		!validCommitSha(value.source_commit_sha) ||
		!Array.isArray(value.files) ||
		value.files.length === 0
	) {
		throw new Error("release manifest has an unsupported or incomplete shape");
	}

	const seen = new Set<string>();
	const files = value.files.map((raw): ManifestEntry => {
		if (
			!isRecord(raw) ||
			typeof raw.path !== "string" ||
			!validSha256(raw.sha256) ||
			!Number.isSafeInteger(raw.size_bytes) ||
			(raw.size_bytes as number) < 0 ||
			(raw.size_bytes as number) > MAX_RELEASE_FILE_BYTES
		) {
			throw new Error("release manifest contains an invalid file entry");
		}
		assertSafeRelativePath(raw.path);
		if (raw.path === "manifest.json" || seen.has(raw.path)) {
			throw new Error(
				"release manifest contains a duplicate or recursive path",
			);
		}
		seen.add(raw.path);
		return {
			path: raw.path,
			sha256: raw.sha256,
			size_bytes: raw.size_bytes as number,
		};
	});
	if (!seen.has(ASSET_NAME)) {
		throw new Error("release manifest does not list the Linux x64 artifact");
	}
	return {
		schema: "afol.release-stage/v1",
		asset: ASSET_NAME,
		artifact_sha256: value.artifact_sha256,
		source_commit_sha: value.source_commit_sha,
		files,
	};
}

function assertSafeRelativePath(path: string): void {
	if (
		path.length === 0 ||
		path.includes("\\") ||
		path.includes("\0") ||
		/^[A-Za-z]:/u.test(path) ||
		isAbsolute(path) ||
		path
			.split("/")
			.some((part) => part.length === 0 || part === "." || part === "..")
	) {
		throw new Error("release manifest contains an unsafe file path");
	}
}

function parsePlainHttpsUrl(input: string, label: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(input);
	} catch {
		throw new Error(`${label} is invalid`);
	}
	if (
		parsed.protocol !== "https:" ||
		parsed.username.length > 0 ||
		parsed.password.length > 0 ||
		parsed.search.length > 0 ||
		parsed.hash.length > 0
	) {
		throw new Error(
			`${label} must be plain HTTPS without credentials or query data`,
		);
	}
	return parsed;
}

function parseBaseUrl(input: string): URL {
	const parsed = parsePlainHttpsUrl(input, "release base URL");
	if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
	return parsed;
}

function parseArchiveUrl(input: string): URL {
	const parsed = parsePlainHttpsUrl(input, "release archive URL");
	if (parsed.pathname.endsWith("/")) {
		throw new Error("release archive URL must identify a file");
	}
	return parsed;
}

function fileUrl(baseUrl: URL, path: string): URL {
	assertSafeRelativePath(path);
	const encoded = path.split("/").map(encodeURIComponent).join("/");
	return new URL(encoded, baseUrl);
}

function resourceTimeoutMs(options: SmokeOptions): number {
	const timeout = options.resourceTimeoutMs ?? DEFAULT_RESOURCE_TIMEOUT_MS;
	if (
		!Number.isSafeInteger(timeout) ||
		timeout < 1 ||
		timeout > DEFAULT_RESOURCE_TIMEOUT_MS
	) {
		throw new Error("release download timeout is outside its permitted range");
	}
	return timeout;
}

function archiveExpansionLimit(options: SmokeOptions): number {
	const limit =
		options.maxArchiveExpandedBytes ?? MAX_RELEASE_ARCHIVE_EXPANDED_BYTES;
	if (
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > MAX_RELEASE_ARCHIVE_EXPANDED_BYTES
	) {
		throw new Error(
			"release archive expansion limit is outside its permitted range",
		);
	}
	return limit;
}

function cancelWithoutWaiting(
	stream: { cancel(reason?: unknown): Promise<unknown> } | null | undefined,
): void {
	if (!stream) return;
	try {
		void Promise.resolve(stream.cancel()).catch(() => {});
	} catch {}
}

async function readResponse(
	fetchImpl: ReleaseSmokeFetch,
	url: URL,
	maxBytes: number,
	timeoutMs: number,
	now: () => number = Date.now,
): Promise<Uint8Array> {
	let requestUrl = url;
	let response: Response | undefined;
	let cancelActive = () => cancelWithoutWaiting(response?.body);
	let releaseReader = () => {};
	const controller = new AbortController();
	const deadlineAt = now() + timeoutMs;
	const timeoutError = new Error("release download timed out");
	let timedOut = false;
	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timeoutHandle = setTimeout(() => {
			timedOut = true;
			controller.abort();
			reject(timeoutError);
		}, timeoutMs);
	});
	const expireIfNeeded = () => {
		if (now() >= deadlineAt) {
			timedOut = true;
			controller.abort();
			throw timeoutError;
		}
	};
	const beforeDeadline = async <T>(operation: () => Promise<T>): Promise<T> => {
		expireIfNeeded();
		const result = await Promise.race([operation(), deadline]);
		expireIfNeeded();
		return result;
	};
	try {
		for (
			let redirectCount = 0;
			redirectCount <= MAX_REDIRECTS;
			redirectCount += 1
		) {
			const request = Promise.resolve().then(() =>
				fetchImpl(requestUrl, {
					cache: "no-store",
					credentials: "omit",
					headers: {},
					redirect: "manual",
					referrerPolicy: "no-referrer",
					signal: controller.signal,
				}),
			);
			try {
				response = await beforeDeadline(() => request);
			} catch (error) {
				if (error === timeoutError || timedOut) {
					void request
						.then((lateResponse) => cancelWithoutWaiting(lateResponse.body))
						.catch(() => {});
					throw timeoutError;
				}
				throw new Error("release download request failed");
			}
			if (response.status < 300 || response.status >= 400) break;
			if (redirectCount === MAX_REDIRECTS) {
				throw new Error("release download exceeded the redirect limit");
			}
			const location = response.headers.get("location");
			if (!location) {
				throw new Error("release download redirect has no target");
			}
			let redirectUrl: URL;
			try {
				redirectUrl = new URL(location, requestUrl);
			} catch {
				throw new Error("release download redirect target is invalid");
			}
			if (
				redirectUrl.protocol !== "https:" ||
				redirectUrl.username.length > 0 ||
				redirectUrl.password.length > 0 ||
				redirectUrl.hash.length > 0
			) {
				throw new Error(
					"release download redirect must remain HTTPS without credentials",
				);
			}
			cancelWithoutWaiting(response.body);
			response = undefined;
			requestUrl = redirectUrl;
		}
		if (!response?.ok || response?.redirected) {
			throw new Error(
				`release download failed${response ? ` with HTTP ${response.status}` : ""}`,
			);
		}
		if (response.url) {
			let finalUrl: URL;
			try {
				finalUrl = new URL(response.url);
			} catch {
				throw new Error("release download returned an invalid response URL");
			}
			if (
				finalUrl.protocol !== "https:" ||
				finalUrl.username.length > 0 ||
				finalUrl.password.length > 0 ||
				finalUrl.hash.length > 0
			) {
				throw new Error(
					"release download response is not an allowed HTTPS URL",
				);
			}
		}
		const contentLength = response.headers.get("content-length");
		if (contentLength !== null) {
			const declaredBytes = Number(contentLength);
			if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
				throw new Error("release download has an invalid content length");
			}
			if (declaredBytes > maxBytes) {
				throw new Error("release download exceeded the permitted file size");
			}
		}
		const reader = response.body?.getReader();
		if (!reader) {
			expireIfNeeded();
			return new Uint8Array();
		}
		cancelActive = () => cancelWithoutWaiting(reader);
		releaseReader = () => {
			try {
				reader.releaseLock();
			} catch {}
		};
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		let exceededLimit = false;
		while (true) {
			let result: Awaited<ReturnType<typeof reader.read>>;
			try {
				result = await beforeDeadline(() => reader.read());
			} catch (error) {
				if (error === timeoutError || timedOut) throw timeoutError;
				throw new Error("release download response body could not be read");
			}
			const { done, value } = result;
			if (done) break;
			if (value.byteLength > maxBytes - totalBytes) {
				exceededLimit = true;
				break;
			}
			chunks.push(value.slice());
			totalBytes += value.byteLength;
		}
		if (exceededLimit) {
			throw new Error("release download exceeded the permitted file size");
		}
		expireIfNeeded();
		const bytes = new Uint8Array(totalBytes);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		if (bytes.byteLength > maxBytes) {
			throw new Error("release download response body could not be read");
		}
		return bytes;
	} catch (error) {
		cancelActive();
		if (error === timeoutError || timedOut) throw timeoutError;
		throw error;
	} finally {
		if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
		releaseReader();
	}
}

function writeOwnedFile(
	stageDir: string,
	entry: ManifestEntry,
	bytes: Uint8Array,
): void {
	if (bytes.byteLength !== entry.size_bytes || sha256(bytes) !== entry.sha256) {
		throw new Error(
			`downloaded release file failed integrity checks: ${entry.path}`,
		);
	}
	const destination = resolve(stageDir, ...entry.path.split("/"));
	const destinationRelative = relative(stageDir, destination);
	if (
		!destinationRelative ||
		destinationRelative === ".." ||
		destinationRelative.startsWith(
			`..${process.platform === "win32" ? "\\" : "/"}`,
		) ||
		isAbsolute(destinationRelative)
	) {
		throw new Error(
			"release manifest path escaped its owned download directory",
		);
	}
	mkdirSync(dirname(destination), { recursive: true });
	writeFileSync(destination, bytes, { flag: "wx", mode: 0o644 });
	if (entry.path === ASSET_NAME) chmodSync(destination, 0o755);
}

async function downloadVerifiedStage(
	options: SmokeOptions,
	ownedRoot: string,
): Promise<VerifiedRelease> {
	const baseUrl = parseBaseUrl(options.baseUrl ?? "");
	const timeoutMs = resourceTimeoutMs(options);
	if (!validSha256(options.expectedArtifactSha256)) {
		throw new Error(
			"HTTPS release smoke requires an expected artifact SHA-256",
		);
	}
	if (!validCommitSha(options.expectedSourceCommitSha)) {
		throw new Error(
			"HTTPS release smoke requires a full expected source commit SHA",
		);
	}

	const fetchImpl = options.fetchImpl ?? fetch;
	const manifestBytes = await readResponse(
		fetchImpl,
		fileUrl(baseUrl, "manifest.json"),
		MAX_MANIFEST_BYTES,
		timeoutMs,
		options.now,
	);
	const manifest = parseManifest(new TextDecoder().decode(manifestBytes));
	assertPinnedRelease(
		manifest.artifact_sha256,
		manifest.source_commit_sha,
		options,
	);
	const declaredTotalBytes = manifest.files.reduce(
		(total, entry) => total + entry.size_bytes,
		manifestBytes.byteLength,
	);
	if (declaredTotalBytes > MAX_RELEASE_TOTAL_BYTES) {
		throw new Error("release stage exceeds the permitted total size");
	}

	const stageCwd = join(ownedRoot, "download");
	const stageDir = join(stageCwd, "dist", "release", "candidate");
	mkdirSync(stageDir, { recursive: true });
	writeFileSync(join(stageDir, "manifest.json"), manifestBytes, {
		flag: "wx",
		mode: 0o644,
	});
	for (const entry of manifest.files) {
		const bytes = await readResponse(
			fetchImpl,
			fileUrl(baseUrl, entry.path),
			MAX_RELEASE_FILE_BYTES,
			timeoutMs,
			options.now,
		);
		writeOwnedFile(stageDir, entry, bytes);
	}

	return verifiedStage(stageDir, {
		cwd: stageCwd,
		expectedArtifactSha256: options.expectedArtifactSha256,
		expectedSourceCommitSha: options.expectedSourceCommitSha,
	});
}

async function downloadArchiveStage(
	options: SmokeOptions,
	ownedRoot: string,
): Promise<VerifiedRelease> {
	const archiveUrl = parseArchiveUrl(options.archiveUrl ?? "");
	if (!validSha256(options.expectedArchiveSha256)) {
		throw new Error(
			"archive release smoke requires an expected archive SHA-256",
		);
	}
	if (!validSha256(options.expectedArtifactSha256)) {
		throw new Error(
			"archive release smoke requires an expected artifact SHA-256",
		);
	}
	if (!validCommitSha(options.expectedSourceCommitSha)) {
		throw new Error(
			"archive release smoke requires a full expected source commit SHA",
		);
	}
	const timeoutMs = resourceTimeoutMs(options);
	const maxExpandedBytes = archiveExpansionLimit(options);

	const archiveBytes = await readResponse(
		options.fetchImpl ?? fetch,
		archiveUrl,
		MAX_RELEASE_ARCHIVE_BYTES,
		timeoutMs,
		options.now,
	);
	if (sha256(archiveBytes) !== options.expectedArchiveSha256) {
		throw new Error(
			"downloaded release archive does not match the expected SHA-256",
		);
	}

	let archiveContents: Uint8Array;
	try {
		archiveContents = gunzipSync(archiveBytes, {
			maxOutputLength: maxExpandedBytes,
		});
	} catch (error) {
		if (isRecord(error) && error.code === "ERR_BUFFER_TOO_LARGE") {
			throw new Error("release archive expands beyond the permitted size");
		}
		throw new Error("downloaded release archive is invalid");
	}
	if (archiveContents[0] === 0x1f && archiveContents[1] === 0x8b) {
		throw new Error(
			"release archive contains unsupported nested gzip compression",
		);
	}
	let archiveFiles: Map<string, File>;
	try {
		archiveFiles = await new Bun.Archive(archiveContents).files();
	} catch {
		throw new Error("downloaded release archive is invalid");
	}
	const archivePaths = [...archiveFiles.keys()];
	for (const path of archivePaths) assertSafeRelativePath(path);
	const manifestFile = archiveFiles.get("manifest.json");
	if (!manifestFile || manifestFile.size > MAX_MANIFEST_BYTES) {
		throw new Error("release archive has no valid stage manifest");
	}
	const manifestBytes = new Uint8Array(await manifestFile.arrayBuffer());
	const manifest = parseManifest(new TextDecoder().decode(manifestBytes));
	assertPinnedRelease(
		manifest.artifact_sha256,
		manifest.source_commit_sha,
		options,
	);
	const expectedPaths = [
		"manifest.json",
		...manifest.files.map((entry) => entry.path),
	].sort();
	if (
		JSON.stringify([...archivePaths].sort()) !== JSON.stringify(expectedPaths)
	) {
		throw new Error("release archive files do not match the staged manifest");
	}

	const entries = new Map<string, Uint8Array>([
		["manifest.json", manifestBytes],
	]);
	let totalSize = manifestBytes.byteLength;
	for (const entry of manifest.files) {
		const file = archiveFiles.get(entry.path);
		if (
			!file ||
			file.size !== entry.size_bytes ||
			file.size > MAX_RELEASE_FILE_BYTES
		) {
			throw new Error(
				`release archive file does not match the manifest: ${entry.path}`,
			);
		}
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (
			bytes.byteLength !== entry.size_bytes ||
			sha256(bytes) !== entry.sha256
		) {
			throw new Error(
				`release archive file does not match the manifest: ${entry.path}`,
			);
		}
		totalSize += bytes.byteLength;
		if (totalSize > MAX_RELEASE_ARCHIVE_BYTES) {
			throw new Error("release archive expands beyond the permitted size");
		}
		entries.set(entry.path, bytes);
	}

	const stageCwd = join(ownedRoot, "archive");
	const stageDir = join(stageCwd, "dist", "release", "candidate");
	for (const [path, bytes] of entries) {
		const destination = join(stageDir, ...path.split("/"));
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, bytes, {
			flag: "wx",
			mode: path === ASSET_NAME ? 0o755 : 0o644,
		});
	}
	return verifiedStage(stageDir, {
		cwd: stageCwd,
		expectedArtifactSha256: options.expectedArtifactSha256,
		expectedSourceCommitSha: options.expectedSourceCommitSha,
	});
}

function verifiedStage(
	stageDir: string,
	options: Pick<
		SmokeOptions,
		"cwd" | "expectedArtifactSha256" | "expectedSourceCommitSha"
	> = {},
): VerifiedRelease {
	const stage = verifyStagedRelease({
		stageDir,
		...(options.cwd === undefined ? {} : { cwd: options.cwd }),
	});
	if (stage.assetName !== ASSET_NAME) {
		throw new Error(
			"verified release stage does not contain the Linux x64 artifact",
		);
	}
	const version = requiredString(stage.provenance, "version");
	const sourceCommitSha = requiredString(stage.provenance, "commit_sha");
	if (!validSha256(stage.artifactSha256) || !validCommitSha(sourceCommitSha)) {
		throw new Error("verified release stage has invalid provenance pins");
	}
	const manifestBytes = readFileSync(join(stage.stageDir, "manifest.json"));
	if (sha256(manifestBytes) !== stage.manifestSha256) {
		throw new Error("release stage manifest changed after verification");
	}
	const manifest = JSON.parse(manifestBytes.toString("utf8")) as unknown;
	if (
		!isRecord(manifest) ||
		manifest.artifact_sha256 !== stage.artifactSha256 ||
		manifest.source_commit_sha !== sourceCommitSha
	) {
		throw new Error(
			"release stage manifest does not bind its verified provenance",
		);
	}
	const provenanceEntry = Array.isArray(manifest.files)
		? manifest.files.find(
				(entry) => isRecord(entry) && entry.path === "provenance.json",
			)
		: undefined;
	if (!isRecord(provenanceEntry) || !validSha256(provenanceEntry.sha256)) {
		throw new Error("release stage manifest does not bind staged provenance");
	}
	if (options.expectedArtifactSha256 || options.expectedSourceCommitSha) {
		if (!validSha256(options.expectedArtifactSha256)) {
			throw new Error("expected artifact SHA-256 is required");
		}
		if (!validCommitSha(options.expectedSourceCommitSha)) {
			throw new Error("expected source commit must be a full SHA");
		}
		if (
			options.expectedArtifactSha256 !== stage.artifactSha256 ||
			options.expectedSourceCommitSha !== sourceCommitSha
		) {
			throw new Error("release stage does not match the expected SHA pins");
		}
	}
	return {
		stageDir: stage.stageDir,
		assetPath: join(stage.stageDir, stage.assetName),
		artifactSha256: stage.artifactSha256,
		provenanceSha256: provenanceEntry.sha256,
		version,
		sourceCommitSha,
	};
}

function isolatedProcessEnvironment(ownedRoot: string): NodeJS.ProcessEnv {
	const isolatedHome = join(ownedRoot, "home");
	const isolatedTmp = join(ownedRoot, "process-tmp");
	mkdirSync(isolatedHome, { recursive: true });
	mkdirSync(isolatedTmp, { recursive: true });
	return {
		PATH: process.env.PATH ?? "",
		HOME: isolatedHome,
		TMPDIR: isolatedTmp,
		XDG_CACHE_HOME: join(isolatedHome, ".cache"),
		XDG_CONFIG_HOME: join(isolatedHome, ".config"),
		XDG_STATE_HOME: join(isolatedHome, ".local", "state"),
		LANG: "C.UTF-8",
		LC_ALL: "C.UTF-8",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: join(isolatedHome, ".gitconfig"),
		GIT_AUTHOR_NAME: "AFOL Release Smoke",
		GIT_AUTHOR_EMAIL: "afol-release-smoke@example.invalid",
		GIT_COMMITTER_NAME: "AFOL Release Smoke",
		GIT_COMMITTER_EMAIL: "afol-release-smoke@example.invalid",
	};
}

function runCommand(
	command: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): string {
	const result = spawnSync(command, args, {
		cwd,
		env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		timeout: 60_000,
		maxBuffer: 2_000_000,
	});
	if (result.error || result.status !== 0) {
		const label =
			command === "git" ? "fresh project setup" : "AFOL candidate command";
		throw new Error(
			`${label} failed${result.status === null ? " or timed out" : ` with status ${result.status}`}`,
		);
	}
	return result.stdout ?? "";
}

function projectSnapshot(root: string): string {
	const entries: [string, string][] = [];
	const visit = (directory: string, prefix = "") => {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
			(a, b) => a.name.localeCompare(b.name),
		)) {
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			const path = join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				entries.push([relativePath, `link:${readlinkSync(path)}`]);
			} else if (entry.isDirectory()) {
				entries.push([relativePath, "directory"]);
				visit(path, relativePath);
			} else if (entry.isFile()) {
				entries.push([relativePath, `file:${sha256(readFileSync(path))}`]);
			} else {
				throw new Error(
					"example project contains an unsupported filesystem entry",
				);
			}
		}
	};
	visit(root);
	return JSON.stringify(entries);
}

function assertProjectPreserved(
	project: string,
	expectedSnapshot: string,
	phase: string,
): void {
	if (projectSnapshot(project) !== expectedSnapshot) {
		throw new Error(`example project data changed during ${phase}`);
	}
}

function copyCandidate(
	source: string,
	destination: string,
	expectedSha256: string,
): void {
	copyFileSync(source, destination);
	chmodSync(destination, 0o755);
	if (sha256(readFileSync(destination)) !== expectedSha256) {
		throw new Error(
			"copied release candidate does not match its verified SHA-256",
		);
	}
}

function runExample(
	binaryPath: string,
	project: string,
	env: NodeJS.ProcessEnv,
): void {
	runCommand("git", ["init", "--quiet", project], dirname(project), env);
	runCommand(binaryPath, ["init"], project, env);
	runCommand(
		binaryPath,
		[
			"qt",
			"verified-change",
			"-t",
			"Make one verified change",
			"-c",
			"git diff --check",
		],
		project,
		env,
	);
	runCommand(binaryPath, ["status"], project, env);
}

export async function runReleaseInstallSmoke(options: SmokeOptions): Promise<{
	version: string;
	artifactSha256: string;
	sourceCommitSha: string;
}> {
	assertSupportedHost();
	const sourceCount = [
		options.stageDir,
		options.baseUrl,
		options.archiveUrl,
	].filter(Boolean).length;
	if (sourceCount !== 1) {
		throw new Error(
			"provide exactly one of --stage-dir, --base-url, or --archive-url",
		);
	}
	if (
		options.stageDir &&
		(options.expectedArtifactSha256 ||
			options.expectedSourceCommitSha ||
			options.expectedArchiveSha256)
	) {
		throw new Error(
			"expected SHA pins are supported only with --base-url or --archive-url",
		);
	}
	if (
		options.baseUrl &&
		(!options.expectedArtifactSha256 ||
			!options.expectedSourceCommitSha ||
			options.expectedArchiveSha256)
	) {
		throw new Error(
			"HTTPS directory smoke requires artifact and source SHA pins",
		);
	}
	if (
		options.archiveUrl &&
		(!options.expectedArchiveSha256 ||
			!options.expectedArtifactSha256 ||
			!options.expectedSourceCommitSha)
	) {
		throw new Error(
			"HTTPS archive smoke requires archive, artifact, and source SHA pins",
		);
	}

	const ownedRoot = mkdtempSync(join(tmpdir(), "afol-binary-install-"));
	try {
		const release = options.archiveUrl
			? await downloadArchiveStage(options, ownedRoot)
			: options.baseUrl
				? await downloadVerifiedStage(options, ownedRoot)
				: verifiedStage(options.stageDir as string, {
						...(options.cwd === undefined ? {} : { cwd: options.cwd }),
					});
		const prefix = join(ownedRoot, "prefix");
		const binDirectory = join(prefix, "bin");
		const installedBinary = join(binDirectory, "afol");
		const installedProvenance = `${installedBinary}.provenance.json`;
		const rollbackBinary = join(binDirectory, ".afol-known-good");
		const nextBinary = join(binDirectory, ".afol-next");
		const project = join(ownedRoot, "minimal-project");
		const env = isolatedProcessEnvironment(ownedRoot);
		mkdirSync(binDirectory, { recursive: true });
		mkdirSync(project, { recursive: true });
		copyCandidate(release.assetPath, installedBinary, release.artifactSha256);
		copyFileSync(
			join(release.stageDir, "provenance.json"),
			installedProvenance,
		);
		if (
			sha256(readFileSync(installedProvenance)) !== release.provenanceSha256
		) {
			throw new Error(
				"copied release provenance does not match its verified SHA-256",
			);
		}

		const installedVersion = runCommand(
			installedBinary,
			["--version"],
			project,
			env,
		).trim();
		if (installedVersion !== `afol ${release.version}`) {
			throw new Error(
				"installed candidate --version did not match verified provenance",
			);
		}
		runExample(installedBinary, project, env);
		const originalProjectSnapshot = projectSnapshot(project);

		copyCandidate(release.assetPath, nextBinary, release.artifactSha256);
		renameSync(installedBinary, rollbackBinary);
		try {
			renameSync(nextBinary, installedBinary);
		} catch (error) {
			renameSync(rollbackBinary, installedBinary);
			throw error;
		}
		if (sha256(readFileSync(installedBinary)) !== release.artifactSha256) {
			throw new Error(
				"replacement candidate did not retain the verified artifact",
			);
		}
		const replacementVersion = runCommand(
			installedBinary,
			["--version"],
			project,
			env,
		).trim();
		if (replacementVersion !== `afol ${release.version}`) {
			throw new Error(
				"replacement candidate --version did not match verified provenance",
			);
		}
		runCommand(installedBinary, ["status"], project, env);
		assertProjectPreserved(
			project,
			originalProjectSnapshot,
			"local replacement",
		);

		const currentBinary = join(binDirectory, ".afol-rollback-current");
		renameSync(installedBinary, currentBinary);
		try {
			renameSync(rollbackBinary, installedBinary);
		} catch (error) {
			renameSync(currentBinary, installedBinary);
			throw error;
		}
		rmSync(currentBinary, { force: true });
		if (sha256(readFileSync(installedBinary)) !== release.artifactSha256) {
			throw new Error(
				"rollback did not restore the known-good candidate bytes",
			);
		}
		const rollbackVersion = runCommand(
			installedBinary,
			["--version"],
			project,
			env,
		).trim();
		if (rollbackVersion !== `afol ${release.version}`) {
			throw new Error(
				"rolled-back candidate --version did not match verified provenance",
			);
		}
		assertProjectPreserved(project, originalProjectSnapshot, "rollback");

		rmSync(prefix, { recursive: true, force: true });
		if (existsSync(prefix))
			throw new Error("uninstall left the temporary prefix");
		assertProjectPreserved(project, originalProjectSnapshot, "uninstall");
		return {
			version: release.version,
			artifactSha256: release.artifactSha256,
			sourceCommitSha: release.sourceCommitSha,
		};
	} finally {
		rmSync(ownedRoot, { recursive: true, force: true });
	}
}

function valueAfter(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("--"))
		throw new Error(`missing value for ${flag}`);
	return value;
}

function parseArgs(args: string[]): SmokeOptions | "help" {
	const options: SmokeOptions = {};
	const seen = new Set<string>();
	const allowed = new Set([
		"--stage-dir",
		"--base-url",
		"--archive-url",
		"--expected-artifact-sha256",
		"--expected-source-commit-sha",
		"--expected-archive-sha256",
	]);
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) throw new Error("missing release smoke option");
		if (arg === "--help") return "help";
		if (!allowed.has(arg)) throw new Error("unknown release smoke option");
		if (seen.has(arg)) throw new Error(`duplicate option: ${arg}`);
		seen.add(arg);
		const value = valueAfter(args, index++, arg);
		if (arg === "--stage-dir") options.stageDir = value;
		else if (arg === "--base-url") options.baseUrl = value;
		else if (arg === "--archive-url") options.archiveUrl = value;
		else if (arg === "--expected-artifact-sha256") {
			options.expectedArtifactSha256 = value;
		} else if (arg === "--expected-source-commit-sha") {
			options.expectedSourceCommitSha = value;
		} else options.expectedArchiveSha256 = value;
	}
	return options;
}

async function main(args: string[]): Promise<void> {
	try {
		const options = parseArgs(args);
		if (options === "help") {
			console.log(
				"usage: bun run smoke:release-install -- --stage-dir PATH | --base-url HTTPS_DIRECTORY_URL --expected-artifact-sha256 SHA256 --expected-source-commit-sha FULL_SHA | --archive-url HTTPS_FILE_URL --expected-archive-sha256 SHA256 --expected-artifact-sha256 SHA256 --expected-source-commit-sha FULL_SHA",
			);
			return;
		}
		const result = await runReleaseInstallSmoke(options);
		console.log(
			`standalone release install smoke passed version=${result.version} sha256=${result.artifactSha256} source_commit=${result.sourceCommitSha}`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown failure";
		console.error(`standalone release install smoke failed: ${message}`);
		process.exitCode = 1;
	}
}

if (import.meta.main) await main(process.argv.slice(2));
