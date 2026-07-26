import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fchmodSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmdirSync,
	rmSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { type WriteBufferSync, writeBufferFullySync } from "../io/full-write";
import { readProjectConfig } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import { isValidProjectUuid } from "./config";
import {
	assertSafeEvolutionProjectRoot,
	evolutionDbPath,
	openEvolutionDb,
} from "./db";
import type {
	ExternalImportManifest,
	ExternalSessionLink,
	ExternalSessionRecord,
	ImportAcceptancePayload,
} from "./import-journal";
import { readImportJournal, withImportMutationLock } from "./import-journal";
import { evaluateSessionLink } from "./import-linking";
import {
	type AcceptedExternalImport,
	acceptExternalImportUnderLock,
} from "./import-store";
import {
	evolutionImportAdapters,
	type ImportPreview,
	type ImportProvider,
	type ImportSource,
	type JsonlNormalizationState,
	type NormalizedRecord,
} from "./imports";
import { digestJson, sha256 } from "./imports/digest";
import { redactImported, redactImportedPath } from "./imports/redaction";
import { resolveEvolutionConfig } from "./runtime-config";

const REDACTION_POLICY_VERSION = "v1";
const ARTIFACT_VERSION = "normalized-import-v1";
const MAX_EXTERNAL_SESSIONS = 2_000;

type DirectoryIdentity = { dev: number; ino: number; canonical: string };

function pathInside(root: string, target: string): boolean {
	const offset = relative(root, target);
	return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

function secureDirectoryIdentity(
	path: string,
	root: string,
	expected?: DirectoryIdentity,
): DirectoryIdentity {
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink())
		throw new Error("external import destination must be a real directory");
	if (typeof process.getuid === "function" && stat.uid !== process.getuid())
		throw new Error("external import destination has an unexpected owner");
	if ((stat.mode & 0o022) !== 0)
		throw new Error("external import destination is group/world writable");
	const canonicalRoot = realpathSync(root);
	const canonical = realpathSync(path);
	if (!pathInside(canonicalRoot, canonical))
		throw new Error("external import destination escapes the project root");
	const identity = { dev: Number(stat.dev), ino: Number(stat.ino), canonical };
	if (
		expected &&
		(identity.dev !== expected.dev || identity.ino !== expected.ino)
	)
		throw new Error("external import destination identity changed");
	return identity;
}

function assertOpenedArtifactFile(fd: number, parent: DirectoryIdentity): void {
	const stat = fstatSync(fd);
	if (!stat.isFile() || stat.nlink !== 1)
		throw new Error("external import artifact must be a single-link file");
	if (process.platform === "linux") {
		const canonical = realpathSync(`/proc/self/fd/${fd}`);
		if (dirname(canonical) !== parent.canonical)
			throw new Error("external import artifact escaped its staging directory");
	}
}

export type ImportSourceInput = string | ImportSource;

export type ExternalImportPreview = ImportPreview & {
	projectId: string;
	importId: string;
	adapterVersion: string;
	normalizedRecords: readonly NormalizedRecord[];
	sessionRecords: readonly ExternalSessionRecord[];
	links: readonly ExternalSessionLink[];
	manifest: ExternalImportManifest;
};

export type ConfirmExternalImportInput = {
	root: string;
	provider: ImportProvider;
	source: ImportSourceInput;
	projectId?: string;
	db?: Database;
	eventsDir?: string;
	now?: Date;
	/** Narrow test seam; never used by normal callers. */
	beforeCommit?: () => void;
	/** Narrow fault-injection seam for proving checked artifact writes. */
	artifactWrite?: WriteBufferSync;
};

export type ConfirmedExternalImport = AcceptedExternalImport & {
	artifactPath: string;
	preview: ExternalImportPreview;
};

function sourceInput(
	provider: ImportProvider,
	source: ImportSourceInput,
): ImportSource {
	if (typeof source !== "string" && source.provider !== provider)
		throw new Error(`source provider must be ${provider}`);
	return typeof source === "string"
		? { provider, path: source }
		: { ...source, provider };
}

function projectIdFor(
	root: string,
	source: ImportSource,
	requested?: string,
): string {
	const configured = resolveEvolutionConfig(readProjectConfig(root)).projectId;
	const projectId = requested ?? source.projectId ?? configured;
	if (!projectId)
		throw new Error("external import requires an exact project UUID");
	if (!isValidProjectUuid(projectId))
		throw new Error("external import requires an exact project UUID");
	if (configured && configured !== projectId)
		throw new Error(
			"external import project UUID does not match configuration",
		);
	if (source.projectId && source.projectId !== projectId)
		throw new Error("external import source belongs to another project");
	return projectId;
}

function externalSessionId(
	provider: ImportProvider,
	providerSessionId: string,
	importContentDigest: string,
): string {
	const namespace =
		providerSessionId === "unscoped" ? `:${importContentDigest}` : "";
	return `EXT-${sha256(`${provider}:${providerSessionId}${namespace}`).slice(0, 32)}`;
}

function collectSessions(
	provider: ImportProvider,
	records: readonly NormalizedRecord[],
	importContentDigest: string,
): ExternalSessionRecord[] {
	const grouped = new Map<string, NormalizedRecord[]>();
	for (const record of records) {
		const providerSessionId = record.sessionId ?? "unscoped";
		const list = grouped.get(providerSessionId) ?? [];
		list.push(record);
		grouped.set(providerSessionId, list);
	}
	if (grouped.size > MAX_EXTERNAL_SESSIONS)
		throw new Error("external import exceeds maximum session count");
	return [...grouped.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([providerSessionId, sessionRecords]) => {
			const ordered = sessionRecords.map((record) => record.recordDigest);
			const normalizedDigest = digestJson(sessionRecords);
			return {
				external_session_id: externalSessionId(
					provider,
					providerSessionId,
					importContentDigest,
				),
				provider_session_id: String(redactImported(providerSessionId)),
				content_digest: digestJson(ordered),
				record_count: sessionRecords.length,
				normalized_digest: normalizedDigest,
			};
		});
}

function structuralString(
	metadata: Record<string, unknown>,
	...keys: string[]
): string | undefined {
	for (const key of keys) {
		const value = metadata[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function autoLinks(
	root: string,
	records: readonly NormalizedRecord[],
	sessions: readonly ExternalSessionRecord[],
): ExternalSessionLink[] {
	const grouped = new Map<string, NormalizedRecord[]>();
	for (const record of records) {
		const providerSessionId = record.sessionId ?? "unscoped";
		const list = grouped.get(providerSessionId) ?? [];
		list.push(record);
		grouped.set(providerSessionId, list);
	}
	return sessions.map((session) => {
		const providerSessionId = session.provider_session_id;
		const sessionRecords = grouped.get(providerSessionId) ?? [];
		const metadata = sessionRecords[0]?.metadata ?? {};
		const candidateProject = structuralString(
			metadata,
			"project_id",
			"projectId",
		);
		const afolSessionId = structuralString(
			metadata,
			"afol_session_id",
			"afolSessionId",
		);
		const commit = structuralString(
			metadata,
			"commit_sha",
			"commitSha",
			"verified_commit",
		);
		const link =
			candidateProject && afolSessionId && commit
				? evaluateSessionLink({
						root,
						projectId: candidateProject,
						externalSessionId: session.external_session_id,
						afolSessionId,
						verifiedCommit: commit,
					})
				: {
						external_session_id: session.external_session_id,
						afol_session_id: null,
						link_state: "pending" as const,
						confidence: 0,
						evidence: [{ kind: "structural_link_fields_missing" }],
						confirmation_required: true,
						eligible_for_learning: false,
					};
		return link;
	});
}

function normalizedRecordsFor(
	provider: ImportProvider,
	records: readonly NormalizedRecord[],
): NormalizedRecord[] {
	return records.map((record) => {
		const adapter = evolutionImportAdapters[provider];
		return adapter.redact(record);
	});
}

async function readNormalized(
	provider: ImportProvider,
	source: ImportSource,
): Promise<{
	first: ImportPreview;
	last: ImportPreview;
	records: NormalizedRecord[];
	normalizedDigest: string;
}> {
	const adapter = evolutionImportAdapters[provider];
	const detection = await adapter.detect(source);
	if (detection.confidence < 0.5)
		throw new Error(`unsupported or ambiguous ${provider} import format`);
	const first = await adapter.preview(source);
	const records: NormalizedRecord[] = [];
	const normalizationState: JsonlNormalizationState = {
		bytes: 0,
		lines: 0,
		contentDigest: "",
	};
	for await (const record of adapter.normalize(source, normalizationState))
		records.push(record);
	const last = await adapter.preview(source);
	if (
		first.contentDigest !== last.contentDigest ||
		normalizationState.contentDigest !== last.contentDigest
	)
		throw new Error("external import source content changed during preview");
	const redactedRecords = normalizedRecordsFor(provider, records);
	return {
		first,
		last,
		records: redactedRecords,
		normalizedDigest: digestJson(redactedRecords),
	};
}

function artifactPath(
	root: string,
	provider: ImportProvider,
	importId: string,
): string {
	assertSafeEvolutionProjectRoot(root);
	const configured = resolveEvolutionConfig(readProjectConfig(root)).paths
		.externalDir;
	const resolved = resolveProjectWritePath(
		root,
		join(configured, "imports", provider, importId),
	);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}

function manifestFor(
	projectId: string,
	provider: ImportProvider,
	preview: ImportPreview,
	sessions: readonly ExternalSessionRecord[],
	now: Date,
	importId: string,
): ExternalImportManifest {
	return {
		import_id: importId,
		provider,
		adapter_version: preview.format,
		source_format: preview.format,
		source_path: redactImportedPath(preview.sourcePath),
		imported_at: now.toISOString(),
		content_digest: preview.contentDigest,
		session_count: sessions.length,
		message_count: preview.records,
		redaction_policy_version: REDACTION_POLICY_VERSION,
		redacted: true,
		raw_stored: false,
		project_detected: projectId,
		warnings: preview.warnings,
		files_ignored: [],
	};
}

function buildPreview(
	projectId: string,
	provider: ImportProvider,
	read: Awaited<ReturnType<typeof readNormalized>>,
	now = new Date(),
	links: readonly ExternalSessionLink[] = [],
): ExternalImportPreview {
	const importId = `IMP-${provider}-${read.normalizedDigest}`;
	const sessions = collectSessions(
		provider,
		read.records,
		read.normalizedDigest,
	);
	const normalizedPreview = {
		...read.first,
		contentDigest: read.normalizedDigest,
		sessions: sessions.length,
	};
	const manifest = manifestFor(
		projectId,
		provider,
		normalizedPreview,
		sessions,
		now,
		importId,
	);
	return {
		...normalizedPreview,
		projectId,
		importId,
		adapterVersion: read.first.format,
		normalizedRecords: read.records,
		sessionRecords: sessions,
		links,
		manifest,
	};
}

export async function previewExternalImport(
	root: string,
	provider: ImportProvider,
	source: ImportSourceInput,
	options: { projectId?: string } = {},
): Promise<ExternalImportPreview> {
	assertSafeEvolutionProjectRoot(root);
	const input = sourceInput(provider, source);
	const projectId = projectIdFor(root, input, options.projectId);
	const preview = buildPreview(
		projectId,
		provider,
		await readNormalized(provider, input),
	);
	return {
		...preview,
		links: autoLinks(root, preview.normalizedRecords, preview.sessionRecords),
	};
}

function writeArtifact(
	path: string,
	preview: ExternalImportPreview,
	links: readonly ExternalSessionLink[],
	root: string,
	parent: DirectoryIdentity,
	write?: WriteBufferSync,
): DirectoryIdentity {
	secureDirectoryIdentity(dirname(path), root, parent);
	mkdirSync(path, { recursive: true, mode: 0o700 });
	const stage = secureDirectoryIdentity(path, root);
	const files = artifactFiles(preview, links);
	for (const [name, content] of Object.entries(files)) {
		secureDirectoryIdentity(dirname(path), root, parent);
		secureDirectoryIdentity(path, root, stage);
		const target = join(path, name);
		const fd = openSync(
			target,
			fsConstants.O_WRONLY |
				fsConstants.O_CREAT |
				fsConstants.O_EXCL |
				(fsConstants.O_NOFOLLOW ?? 0),
			0o600,
		);
		try {
			assertOpenedArtifactFile(fd, stage);
			if (process.platform !== "win32") fchmodSync(fd, 0o600);
			writeBufferFullySync(fd, Buffer.from(content, "utf8"), write);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
	}
	secureDirectoryIdentity(path, root, stage);
	fsyncDirectoryChain(path, root);
	return stage;
}

function artifactFiles(
	preview: ExternalImportPreview,
	links: readonly ExternalSessionLink[],
): Readonly<Record<string, string>> {
	const records = preview.normalizedRecords.map((record) => ({
		...record,
		external_session_id: externalSessionId(
			preview.provider,
			record.sessionId ?? "unscoped",
			preview.contentDigest,
		),
	}));
	return {
		"manifest.json": `${JSON.stringify(preview.manifest)}\n`,
		"sessions.jsonl": preview.sessionRecords
			.map((session) => `${JSON.stringify(session)}\n`)
			.join(""),
		"segments.jsonl": records
			.map((record) => `${JSON.stringify(record)}\n`)
			.join(""),
		"links.jsonl": links
			.map((link) => `${JSON.stringify(redactImported(link))}\n`)
			.join(""),
		"summary.md": [
			`# External import ${preview.importId}`,
			"",
			`- Version: ${ARTIFACT_VERSION}`,
			`- Project: ${preview.projectId}`,
			`- Provider: ${preview.provider}`,
			`- Content digest: ${preview.contentDigest}`,
			`- Records: ${preview.records}`,
			`- Sessions: ${preview.sessions}`,
			"- Redacted: true",
			"- Raw stored: false",
			"",
		].join("\n"),
	};
}

function fsyncDirectoryChain(start: string, root: string): void {
	if (process.platform === "win32") return;
	const stop = resolve(root);
	let current = resolve(start);
	while (current.startsWith(`${stop}/`) || current === stop) {
		const fd = openSync(current, fsConstants.O_RDONLY);
		try {
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		if (current === stop) break;
		current = dirname(current);
	}
}

function readArtifactImportedAt(
	path: string,
	preview: ExternalImportPreview,
	links: readonly ExternalSessionLink[],
): string {
	try {
		const stat = lstatSync(path);
		if (!stat.isDirectory() || stat.isSymbolicLink())
			throw new Error("external import artifact directory is unsafe");
		const manifest = JSON.parse(
			readFileSync(join(path, "manifest.json"), "utf8"),
		) as Record<string, unknown>;
		if (
			manifest.import_id !== preview.importId ||
			manifest.content_digest !== preview.contentDigest ||
			manifest.redacted !== true ||
			manifest.raw_stored !== false
		)
			throw new Error("external import artifact identity is invalid");
		if (typeof manifest.imported_at !== "string")
			throw new Error("external import artifact manifest timestamp is invalid");
		const timestamp = new Date(manifest.imported_at);
		if (
			!Number.isFinite(timestamp.getTime()) ||
			timestamp.toISOString() !== manifest.imported_at
		)
			throw new Error("external import artifact manifest timestamp is invalid");
		const persistedPreview = {
			...preview,
			manifest: { ...preview.manifest, imported_at: manifest.imported_at },
		};
		const expected = artifactFiles(persistedPreview, links);
		const expectedNames = Object.keys(expected).sort();
		if (
			JSON.stringify(readdirSync(path).sort()) !== JSON.stringify(expectedNames)
		)
			throw new Error("external import artifact file set is invalid");
		for (const name of expectedNames) {
			const target = join(path, name);
			const file = lstatSync(target);
			if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1)
				throw new Error("external import artifact file is unsafe");
			const expectedContent = expected[name];
			if (
				expectedContent === undefined ||
				readFileSync(target, "utf8") !== expectedContent
			)
				throw new Error("external import artifact content is invalid");
		}
		return manifest.imported_at;
	} catch {
		throw new Error("external import artifact manifest is invalid");
	}
}

function removeStage(path: string): void {
	rmSync(path, { recursive: true, force: true });
	let current = dirname(path);
	for (let index = 0; index < 3; index += 1) {
		try {
			rmdirSync(current);
		} catch {
			break;
		}
		current = dirname(current);
	}
}

export async function confirmExternalImport(
	input: ConfirmExternalImportInput,
): Promise<ConfirmedExternalImport>;
export async function confirmExternalImport(
	root: string,
	provider: ImportProvider,
	source: ImportSourceInput,
	options?: Omit<ConfirmExternalImportInput, "root" | "provider" | "source">,
): Promise<ConfirmedExternalImport>;
export async function confirmExternalImport(
	inputOrRoot: ConfirmExternalImportInput | string,
	providerArg?: ImportProvider,
	sourceArg?: ImportSourceInput,
	optionsArg: Omit<
		ConfirmExternalImportInput,
		"root" | "provider" | "source"
	> = {},
): Promise<ConfirmedExternalImport> {
	const input: ConfirmExternalImportInput =
		typeof inputOrRoot === "string"
			? {
					root: inputOrRoot,
					provider: providerArg as ImportProvider,
					source: sourceArg as ImportSourceInput,
					...optionsArg,
				}
			: inputOrRoot;
	assertSafeEvolutionProjectRoot(input.root);
	const source = sourceInput(input.provider, input.source);
	const projectId = projectIdFor(input.root, source, input.projectId);
	const read = await readNormalized(input.provider, source);
	let preview = buildPreview(
		projectId,
		input.provider,
		read,
		input.now ?? new Date(),
		[],
	);
	const links = autoLinks(
		input.root,
		preview.normalizedRecords,
		preview.sessionRecords,
	).map((link) => ({
		...(redactImported(link) as ExternalSessionLink),
		eligible_for_learning: false,
	}));
	preview = { ...preview, links };
	let db = input.db;
	let ownedDb = false;
	try {
		if (!db) {
			db = openEvolutionDb(
				evolutionDbPath(
					input.root,
					resolveEvolutionConfig(readProjectConfig(input.root)).paths
						.evolutionDb,
				),
			);
			ownedDb = true;
		}
		const activeDb = db;
		if (!activeDb) throw new Error("evolution import database is unavailable");
		return withImportMutationLock(input.root, () => {
			const finalPath = artifactPath(
				input.root,
				input.provider,
				preview.importId,
			);
			const providerPath = dirname(finalPath);
			mkdirSync(providerPath, { recursive: true, mode: 0o700 });
			const provider = secureDirectoryIdentity(providerPath, input.root);
			const existed = existsSync(finalPath);
			if (existed) secureDirectoryIdentity(finalPath, input.root);
			if (existed) {
				const importedAt = readArtifactImportedAt(finalPath, preview, links);
				preview = {
					...preview,
					manifest: { ...preview.manifest, imported_at: importedAt },
				};
			}
			const existingEvent = readImportJournal(
				input.root,
				projectId,
				input.eventsDir,
			).find((event) => event.payload.manifest.import_id === preview.importId);
			if (existingEvent)
				preview = { ...preview, manifest: existingEvent.payload.manifest };
			const stagePath = existed ? null : `${finalPath}.stage-${randomUUID()}`;
			let installed = false;
			try {
				if (stagePath) {
					const stage = writeArtifact(
						stagePath,
						preview,
						links,
						input.root,
						provider,
						input.artifactWrite,
					);
					secureDirectoryIdentity(providerPath, input.root, provider);
					secureDirectoryIdentity(stagePath, input.root, stage);
					renameSync(stagePath, finalPath);
					installed = true;
					secureDirectoryIdentity(finalPath, input.root, stage);
					fsyncDirectoryChain(dirname(finalPath), input.root);
				}
				const payload: ImportAcceptancePayload = {
					project_id: projectId,
					manifest: preview.manifest,
					sessions: preview.sessionRecords,
					links,
					checkpoint: {
						cursor: String(preview.lines),
						status: "complete",
						content_digest: preview.contentDigest,
					},
				};
				const accepted = acceptExternalImportUnderLock({
					root: input.root,
					db: activeDb,
					projectId,
					payload,
					...(input.eventsDir ? { eventsDir: input.eventsDir } : {}),
					...(input.now ? { now: input.now } : {}),
					...(input.beforeCommit ? { beforeCommit: input.beforeCommit } : {}),
				});
				return { ...accepted, artifactPath: finalPath, preview };
			} catch (error) {
				if (stagePath) {
					if (installed) removeStage(finalPath);
					else removeStage(stagePath);
				}
				throw error;
			}
		});
	} finally {
		if (ownedDb) db?.close();
	}
}
