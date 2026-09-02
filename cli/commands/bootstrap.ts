import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";
import {
	cleanupBootstrapObsolete,
	planBootstrapCleanup,
} from "../services/bootstrap/cleanup";
import type {
	BootstrapManifestEntry,
	ManagedOwnership,
} from "../services/bootstrap/planner";
import {
	planBootstrapOperations,
	planCompletionLockGitignoreOperation,
} from "../services/bootstrap/planner";
import {
	isValidIanaTimezone,
	isValidProjectUuid,
} from "../services/evolution/config";
import { withExternalPathLock } from "../services/io/session-lock";
import { rebuildProjectIndexes } from "../services/local-state/project-indexes";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";
import {
	CANONICAL_PROJECT_CONFIG_PATH,
	normalizeProjectRelativePath,
} from "../services/project/paths";
import { resolveProjectWritePath } from "../services/project/root";
import { validateMutationRuntime } from "../services/state/validate";
import {
	isTemplatePathMatch,
	manifestTemplatePatterns,
	resolveManifestTemplatePath,
} from "../services/template/manifest-paths";
import type { TemplateFileMap } from "../services/template/payload";

type BootstrapArgs = {
	targetRoot: string;
	dryRun: boolean;
	json: boolean;
	forceManaged: boolean;
	cleanupObsolete: boolean;
	cleanupProviderCompatibleMutable: boolean;
	confirmProviderMigration: boolean;
	mutableDir: string;
	withoutClaude: boolean;
	verbose: boolean;
};

type RawManifest = Record<string, unknown>;

type BootstrapRuntime = {
	cliRoot?: string | undefined;
	invocationPath?: string | undefined;
	beforeLockedPlan?: (() => void) | undefined;
	failAfterTemplateWrite?: boolean | undefined;
	failAfterCleanup?: boolean | undefined;
	failAfterMutableBaseline?: boolean | undefined;
	failAfterProviderMigration?: boolean | undefined;
	failLocalStateIndexBuild?: boolean | undefined;
};

function canonicalTargetRoot(targetRoot: string): string {
	let current = resolve(targetRoot);
	const unresolved: string[] = [];
	while (true) {
		try {
			const stats = lstatSync(current);
			if (stats.isSymbolicLink()) {
				throw new Error(`Bootstrap target must not be a symlink: ${current}`);
			}
			return join(realpathSync(current), ...unresolved.reverse());
		} catch (error) {
			if (
				typeof error !== "object" ||
				error === null ||
				!("code" in error) ||
				(error as { code?: unknown }).code !== "ENOENT"
			) {
				throw error;
			}
			const parent = dirname(current);
			if (parent === current) throw error;
			unresolved.push(basename(current));
			current = parent;
		}
	}
}

type TargetSnapshot = {
	container: string;
	existed: boolean;
	snapshotPath: string;
};

function nearestExistingDirectory(path: string): string {
	let current = dirname(resolve(path));
	while (!existsSync(current)) {
		const parent = dirname(current);
		if (parent === current) return current;
		current = parent;
	}
	return realpathSync(current);
}

function snapshotTarget(targetRoot: string): TargetSnapshot {
	const container = mkdtempSync(
		join(nearestExistingDirectory(targetRoot), ".afol-bootstrap-transaction-"),
	);
	try {
		const snapshotPath = join(container, "before");
		const existed = existsSync(targetRoot);
		if (existed) {
			cpSync(targetRoot, snapshotPath, {
				recursive: true,
				preserveTimestamps: true,
			});
		}
		return { container, existed, snapshotPath };
	} catch (error) {
		rmSync(container, { recursive: true, force: true });
		throw error;
	}
}

function restoreTarget(targetRoot: string, snapshot: TargetSnapshot): void {
	rmSync(targetRoot, { recursive: true, force: true });
	if (snapshot.existed) {
		cpSync(snapshot.snapshotPath, targetRoot, {
			recursive: true,
			preserveTimestamps: true,
		});
	}
}

function validateTemplateStaging(
	templateFiles: TemplateFileMap,
	targetRoot: string,
): string {
	const staging = mkdtempSync(
		join(nearestExistingDirectory(targetRoot), ".afol-bootstrap-staging-"),
	);
	try {
		for (const [path, entry] of Object.entries(templateFiles)) {
			const payload = Buffer.from(entry.contentBase64, "base64");
			if (
				sha256Hex(payload) !== entry.sha256 ||
				payload.byteLength !== entry.bytes
			) {
				throw new Error(`Invalid generated template payload: ${path}`);
			}
			const stagedPath = join(staging, path);
			mkdirSync(dirname(stagedPath), { recursive: true });
			writeFileSync(stagedPath, payload);
		}
		return staging;
	} catch (error) {
		rmSync(staging, { recursive: true, force: true });
		throw error;
	}
}

type MutableBaselineOperation = {
	kind: "create" | "skip-existing";
	path: string;
	reason: string;
	sourcePath: string;
};

type ProviderCompatibleCleanupOperation = {
	path: string;
	reason: string;
};

type ProviderCompatibleCleanupArchiveResult =
	ProviderCompatibleCleanupOperation & {
		archivePath: string;
	};

const BASE_MUTABLE_BASELINE_SOURCES = [
	{ suffix: "tmp/README.md", sourcePath: ".afol/tmp/README.md" },
	{ suffix: "data/README.md", sourcePath: ".afol/data/README.md" },
	{
		suffix: "data/events/README.md",
		sourcePath: ".afol/data/events/README.md",
	},
	{
		suffix: "data/index/README.md",
		sourcePath: ".afol/data/index/README.md",
	},
	{
		suffix: "data/telemetry/schemas/event.json",
		sourcePath: ".afol/data/telemetry/schemas/event.json",
	},
] as const;

const MUTABLE_BASELINE_TEMPLATE_PREFIXES = [
	".afol/data/benchmarks/catalog/",
	".afol/data/project-benchmarks/",
] as const;

const PROVIDER_COMPATIBLE_AGENTS_MUTABLE_ROOTS = [
	".agents/data",
	".agents/tmp",
	".agents/wb",
	".agents/z-arq",
] as const;

const MUTABLE_TEMPLATE_SUFFIX_ROOTS = ["data", "skills", "tmp"] as const;

function sha256Hex(content: Buffer): string {
	return createHash("sha256").update(content).digest("hex");
}

function parseBootstrapArgs(args: string[]): BootstrapArgs {
	let targetRoot = "";
	let dryRun = false;
	let json = false;
	let forceManaged = false;
	let cleanupObsolete = false;
	let cleanupProviderCompatibleMutable = false;
	let confirmProviderMigration = false;
	let mutableDir = ".afol";
	let withoutClaude = false;
	let verbose = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) {
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--provider-compatible") {
			mutableDir = ".afol";
			continue;
		}
		if (arg === "--without-claude") {
			withoutClaude = true;
			continue;
		}
		if (arg === "--verbose") {
			verbose = true;
			continue;
		}
		if (arg === "--mutable-dir") {
			const value = args[index + 1];
			if (!value) {
				throw new Error("Missing value for --mutable-dir");
			}
			const normalized = normalizeProjectRelativePath(value, ".afol");
			if (normalized !== ".afol") {
				throw new Error(
					"Unsupported bootstrap argument: --mutable-dir only accepts .afol. Custom mutable roots are not supported.",
				);
			}
			mutableDir = normalized;
			index += 1;
			continue;
		}
		if (arg === "--cleanup-obsolete") {
			cleanupObsolete = true;
			continue;
		}
		if (arg === "--cleanup-provider-compatible-mutable") {
			cleanupProviderCompatibleMutable = true;
			continue;
		}
		if (arg === "--confirm-provider-migration") {
			confirmProviderMigration = true;
			continue;
		}
		if (arg === "--force-managed") {
			forceManaged = true;
			continue;
		}
		if (arg === "--partial") {
			throw new Error(
				"Unsupported bootstrap argument: --partial. Partial install is not supported in this CLI.",
			);
		}
		if (arg.startsWith("-")) {
			throw new Error(`Unknown bootstrap argument: ${arg}`);
		}
		if (!targetRoot) {
			targetRoot = arg;
			continue;
		}
		throw new Error(`Unexpected bootstrap argument: ${arg}`);
	}

	if (!targetRoot) {
		throw new Error("Missing bootstrap target path");
	}
	if (json && !dryRun) {
		throw new Error(
			"Unsupported bootstrap argument: --json requires --dry-run",
		);
	}

	return {
		targetRoot: resolve(targetRoot),
		dryRun,
		json,
		forceManaged,
		cleanupObsolete,
		cleanupProviderCompatibleMutable,
		confirmProviderMigration,
		mutableDir,
		withoutClaude,
		verbose,
	};
}

function mutableConfigPayload(content: Buffer, mutableDir: string): Buffer {
	const config = JSON.parse(content.toString("utf8")) as Record<
		string,
		unknown
	>;
	const paths =
		config.paths !== null &&
		typeof config.paths === "object" &&
		!Array.isArray(config.paths)
			? { ...(config.paths as Record<string, unknown>) }
			: {};
	const dataDir = `${mutableDir}/data`;
	const mutationsDir = `${dataDir}/mutations`;
	config.paths = {
		...paths,
		agents_dir: ".agents",
		mutable_dir: mutableDir,
		adm_dir: ".afol/adm",
		rules_dir: ".afol/adm/rules",
		hooks_dir: ".afol/adm/hooks",
		skills_dir: ".agents/skills",
		wb_dir: ".afol/wb",
		active_session_file: `${mutableDir}/wb/.active_session`,
		tmp_dir: `${mutableDir}/tmp`,
		data_dir: dataDir,
		data_index_dir: `${dataDir}/index`,
		events_file: `${dataDir}/events/events.jsonl`,
		mutations_dir: mutationsDir,
		mutation_backups_dir: `${mutationsDir}/backups`,
		mutation_archives_dir: `${mutationsDir}/archives`,
		lock_file: ".agents/lock.json",
		manifest_file: ".agents/manifest.json",
	};
	config.skills_sync = {
		...(config.skills_sync !== null &&
		typeof config.skills_sync === "object" &&
		!Array.isArray(config.skills_sync)
			? (config.skills_sync as Record<string, unknown>)
			: {}),
		project_dir: ".agents/skills",
	};
	return Buffer.from(`${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function applyAdapterConfigFlag(
	content: Buffer,
	withoutClaude: boolean,
): Buffer {
	if (!withoutClaude) {
		return content;
	}
	const config = JSON.parse(content.toString("utf8")) as Record<
		string,
		unknown
	>;
	const adapters =
		config.adapters !== null &&
		typeof config.adapters === "object" &&
		!Array.isArray(config.adapters)
			? { ...(config.adapters as Record<string, unknown>) }
			: {};
	const claude = adapters.claude
		? { ...(adapters.claude as Record<string, unknown>) }
		: {};
	config.adapters = {
		...adapters,
		claude: { ...claude, enabled: false },
	};
	return Buffer.from(`${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function buildBootstrapTemplateFiles(
	mutableDir: string,
	withoutClaude: boolean,
): TemplateFileMap {
	const templateFiles: TemplateFileMap = { ...DEFAULT_TEMPLATE_FILES };
	const providerMigration = mutableDir !== ".agents";
	if (!providerMigration && !withoutClaude) {
		return templateFiles;
	}

	// Provider-compatible mutable migration strips .agents mutable roots and
	// .afol/* suffix roots. This must NOT run for a plain --without-claude
	// install that keeps mutableDir at .agents.
	if (providerMigration) {
		for (const path of Object.keys(templateFiles)) {
			if (
				PROVIDER_COMPATIBLE_AGENTS_MUTABLE_ROOTS.some(
					(root) => path === root || path.startsWith(`${root}/`),
				)
			) {
				delete templateFiles[path];
			}
		}
		for (const path of Object.keys(templateFiles)) {
			if (
				MUTABLE_TEMPLATE_SUFFIX_ROOTS.some((suffix) => {
					const root = `${mutableDir}/${suffix}`;
					return path === root || path.startsWith(`${root}/`);
				})
			) {
				delete templateFiles[path];
			}
		}
	}

	const configEntry = DEFAULT_TEMPLATE_FILES[CANONICAL_PROJECT_CONFIG_PATH];
	if (configEntry && (providerMigration || withoutClaude)) {
		const basePayload = Buffer.from(configEntry.contentBase64, "base64");
		const afterMutable = providerMigration
			? mutableConfigPayload(basePayload, mutableDir)
			: basePayload;
		const payload = applyAdapterConfigFlag(afterMutable, withoutClaude);
		templateFiles[CANONICAL_PROJECT_CONFIG_PATH] = {
			path: CANONICAL_PROJECT_CONFIG_PATH,
			contentBase64: payload.toString("base64"),
			sha256: sha256Hex(payload),
			bytes: payload.byteLength,
		};
	}

	return templateFiles;
}

function configuredEvolutionIdentity(content: string | undefined): {
	projectId?: string;
	timezone?: string;
} {
	if (!content) return {};
	let config: Record<string, unknown>;
	try {
		config = JSON.parse(content) as Record<string, unknown>;
	} catch {
		return {};
	}
	const project =
		config.project !== null &&
		typeof config.project === "object" &&
		!Array.isArray(config.project)
			? (config.project as Record<string, unknown>)
			: {};
	// Legacy projects may carry a non-UUID project identifier. They are not
	// evolution participants until the user explicitly adds the evolution
	// extension, so bootstrap must leave that identity untouched.
	if (config.evolution === undefined) return {};
	if (project.id !== undefined && !isValidProjectUuid(project.id)) {
		throw new Error("Existing project.id is not a valid stable UUID");
	}
	if (
		project.timezone !== undefined &&
		!isValidIanaTimezone(project.timezone)
	) {
		throw new Error("Existing project.timezone is not a valid IANA timezone");
	}
	return {
		...(isValidProjectUuid(project.id) ? { projectId: project.id } : {}),
		...(isValidIanaTimezone(project.timezone)
			? { timezone: project.timezone }
			: {}),
	};
}

function personalizeEvolutionConfig(
	templateFiles: TemplateFileMap,
	currentFiles: Record<string, string>,
): void {
	const entry = templateFiles[CANONICAL_PROJECT_CONFIG_PATH];
	if (!entry) return;
	const config = JSON.parse(
		Buffer.from(entry.contentBase64, "base64").toString("utf8"),
	) as Record<string, unknown>;
	const project =
		config.project !== null &&
		typeof config.project === "object" &&
		!Array.isArray(config.project)
			? { ...(config.project as Record<string, unknown>) }
			: {};
	const existing = configuredEvolutionIdentity(
		currentFiles[CANONICAL_PROJECT_CONFIG_PATH],
	);
	const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	config.project = {
		...project,
		id: existing.projectId ?? randomUUID(),
		timezone:
			existing.timezone ??
			(isValidIanaTimezone(detectedTimezone) ? detectedTimezone : "UTC"),
	};
	const payload = Buffer.from(`${JSON.stringify(config, null, 2)}\n`, "utf8");
	templateFiles[CANONICAL_PROJECT_CONFIG_PATH] = {
		path: CANONICAL_PROJECT_CONFIG_PATH,
		contentBase64: payload.toString("base64"),
		sha256: sha256Hex(payload),
		bytes: payload.byteLength,
	};
}

function planMutableBaselines(
	targetRoot: string,
	mutableDir: string,
): MutableBaselineOperation[] {
	if (mutableDir === ".agents") {
		return [];
	}

	const operations: MutableBaselineOperation[] = [];
	const baselineSources = [
		...BASE_MUTABLE_BASELINE_SOURCES,
		...Object.keys(DEFAULT_TEMPLATE_FILES)
			.filter((sourcePath) =>
				MUTABLE_BASELINE_TEMPLATE_PREFIXES.some((prefix) =>
					sourcePath.startsWith(prefix),
				),
			)
			.filter((sourcePath) => !sourcePath.includes("/providers/"))
			.sort()
			.map((sourcePath) => ({
				sourcePath,
				suffix: sourcePath.replace(/^\.afol\//, ""),
			})),
	];
	for (const baseline of baselineSources) {
		const source = DEFAULT_TEMPLATE_FILES[baseline.sourcePath];
		if (!source) {
			continue;
		}
		const targetPath = `${mutableDir}/${baseline.suffix}`;
		operations.push({
			kind: existsSync(join(targetRoot, targetPath))
				? "skip-existing"
				: "create",
			path: targetPath,
			reason: existsSync(join(targetRoot, targetPath))
				? "existing-target-file"
				: "missing-target-file",
			sourcePath: baseline.sourcePath,
		});
	}
	return operations;
}

function planProviderCompatibleAgentsMutableCleanup(
	targetRoot: string,
	mutableDir: string,
): ProviderCompatibleCleanupOperation[] {
	if (mutableDir === ".agents") {
		return [];
	}

	return PROVIDER_COMPATIBLE_AGENTS_MUTABLE_ROOTS.filter((path) =>
		existsSync(join(targetRoot, path)),
	).map((path) => ({
		path,
		reason: "provider-compatible-mutable-state-moved-to-afol",
	}));
}

function cleanupProviderCompatibleAgentsMutable(
	targetRoot: string,
	operations: readonly ProviderCompatibleCleanupOperation[],
): ProviderCompatibleCleanupArchiveResult[] {
	if (operations.length === 0) {
		return [];
	}

	const archiveRoot = nextProviderCompatibleArchiveRoot(targetRoot);
	const archived: ProviderCompatibleCleanupArchiveResult[] = [];
	for (const operation of operations) {
		const absolutePath = resolveBootstrapWritePath(targetRoot, operation.path);
		if (existsSync(absolutePath)) {
			const archivePath = join(
				archiveRoot,
				operation.path.replace(/^\.agents\//, ""),
			).replaceAll("\\", "/");
			const absoluteArchivePath = resolveBootstrapWritePath(
				targetRoot,
				archivePath,
			);
			mkdirSync(dirname(absoluteArchivePath), { recursive: true });
			renameSync(absolutePath, absoluteArchivePath);
			archived.push({
				...operation,
				archivePath,
			});
		}
	}
	return archived;
}

function nextProviderCompatibleArchiveRoot(targetRoot: string): string {
	const now = new Date();
	const stamp = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("");
	const time = [
		String(now.getHours()).padStart(2, "0"),
		String(now.getMinutes()).padStart(2, "0"),
		String(now.getSeconds()).padStart(2, "0"),
	].join("");
	const base = `.afol/data/migrations/${stamp}_${time}_provider-compatible-mutable-migration`;
	let candidate = base;
	let suffix = 1;
	while (existsSync(join(targetRoot, candidate))) {
		suffix += 1;
		candidate = `${base}-${suffix}`;
	}
	return candidate;
}

async function writeMutableBaselines(
	targetRoot: string,
	operations: MutableBaselineOperation[],
): Promise<void> {
	for (const operation of operations) {
		if (operation.kind !== "create") {
			continue;
		}
		const source = DEFAULT_TEMPLATE_FILES[operation.sourcePath];
		if (!source) {
			continue;
		}
		const targetPath = operation.path;
		const absolutePath = resolveBootstrapWritePath(targetRoot, targetPath);
		mkdirSync(dirname(absolutePath), { recursive: true });
		await Bun.write(absolutePath, Buffer.from(source.contentBase64, "base64"));
	}
}

function readTargetFiles(
	targetRoot: string,
	templatePaths: string[],
): Record<string, string> {
	const files: Record<string, string> = {};
	for (const path of templatePaths) {
		const absolutePath = join(targetRoot, path);
		if (existsSync(absolutePath)) {
			files[path] = readFileSync(absolutePath, "utf8");
		}
	}
	return files;
}

function planCompletionLockGitignore(targetRoot: string) {
	if (!existsSync(targetRoot)) {
		return planCompletionLockGitignoreOperation({ state: "absent" });
	}
	const resolved = resolveProjectWritePath(targetRoot, ".gitignore");
	if (!resolved.ok) {
		return planCompletionLockGitignoreOperation({
			state: "unsafe",
			reason: "project-owned-gitignore-unsafe-path",
		});
	}
	try {
		const stats = lstatSync(resolved.value.path);
		if (!stats.isFile()) {
			return planCompletionLockGitignoreOperation({
				state: "unsafe",
				reason: stats.isSymbolicLink()
					? "project-owned-gitignore-symlink"
					: "project-owned-gitignore-non-regular",
			});
		}
		return planCompletionLockGitignoreOperation({
			state: "regular",
			content: readFileSync(resolved.value.path, "utf8"),
		});
	} catch (error) {
		if ((error as { code?: string }).code !== "ENOENT") {
			return planCompletionLockGitignoreOperation({
				state: "unsafe",
				reason: "project-owned-gitignore-unreadable",
			});
		}
		return planCompletionLockGitignoreOperation({ state: "absent" });
	}
}

function hasOwnershipOwner(value: unknown): value is ManagedOwnership {
	return (
		value === "managed" ||
		value === "project-owned" ||
		value === "generated" ||
		value === "ignored" ||
		value === "conflict"
	);
}

function loadManifest(
	targetRoot: string,
	templatePaths: string[],
): Record<string, BootstrapManifestEntry> {
	const manifestPath = join(targetRoot, ".agents", "manifest.json");
	if (!existsSync(manifestPath)) {
		return {};
	}

	const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as RawManifest;
	const manifest: Record<string, BootstrapManifestEntry> = {};
	const templatePathSet = new Set(templatePaths);

	const managedHashes = raw.managed_hashes;
	if (
		managedHashes !== undefined &&
		managedHashes !== null &&
		typeof managedHashes === "object" &&
		!Array.isArray(managedHashes)
	) {
		for (const [path, hash] of Object.entries(managedHashes)) {
			if (typeof hash === "string") {
				const resolvedPath = resolveManifestTemplatePath(path, templatePathSet);
				if (!resolvedPath) {
					continue;
				}
				manifest[resolvedPath] = { owner: "managed", hash };
			}
		}
	}

	const ownership = raw.ownership;
	if (!ownership || typeof ownership !== "object" || Array.isArray(ownership)) {
		return manifest;
	}
	for (const [ownerName, rawPaths] of Object.entries(ownership)) {
		if (!hasOwnershipOwner(ownerName) || !Array.isArray(rawPaths)) {
			continue;
		}
		for (const rawPath of rawPaths) {
			if (typeof rawPath !== "string") {
				continue;
			}
			const patterns = manifestTemplatePatterns(rawPath);
			for (const templatePath of templatePaths) {
				if (
					!patterns.some((pattern) =>
						isTemplatePathMatch(pattern, templatePath),
					)
				) {
					continue;
				}
				manifest[templatePath] = {
					...manifest[templatePath],
					owner: ownerName,
				};
			}
		}
	}
	return manifest;
}

function loadBootstrapManifest(
	targetRoot: string,
	templatePaths: string[],
): Record<string, BootstrapManifestEntry> {
	return loadManifest(targetRoot, templatePaths);
}

function writeTemplateFile(
	targetRoot: string,
	path: string,
	templateFiles: TemplateFileMap,
): Promise<void> {
	const entry = templateFiles[path];
	if (path === ".gitignore") {
		throw new Error(".gitignore requires its named policy merge payload");
	}
	if (!entry) {
		throw new Error(`Missing generated template entry: ${path}`);
	}
	const absolutePath = resolveBootstrapWritePath(targetRoot, path);
	mkdirSync(dirname(absolutePath), { recursive: true });
	const payload = Buffer.from(entry.contentBase64, "base64");
	return Bun.write(absolutePath, payload).then(() => {
		if (path === "a" || path === "afol") {
			chmodSync(absolutePath, 0o755);
		}
	});
}

function resolveBootstrapWritePath(targetRoot: string, path: string): string {
	const resolved = resolveProjectWritePath(targetRoot, path);
	if (!resolved.ok) {
		throw new Error(`bootstrap unsafe target path: ${resolved.error}`);
	}
	return resolved.value.path;
}

/**
 * Build local-state indexes once after a successful apply so fresh installs
 * pass `afol validate project` without a manual `afol local-state rebuild`.
 * Index failures must not roll back a completed scaffold.
 */
function buildLocalStateIndexes(
	targetRoot: string,
	runtime: BootstrapRuntime,
): boolean {
	try {
		if (runtime.failLocalStateIndexBuild) {
			throw new Error("Injected bootstrap local-state index build failure");
		}
		rebuildWorkBenchIndex(targetRoot);
		rebuildProjectIndexes(targetRoot);
		return true;
	} catch {
		return false;
	}
}

export async function runBootstrapCommand(
	args: string[],
	runtime: BootstrapRuntime = {},
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		const parsed = parseBootstrapArgs(args);
		if (!parsed.dryRun && requiresApproval(ctx)) {
			throw new Error("bootstrap requires local interactive approval");
		}
		const initialCanonicalTarget = parsed.dryRun
			? ""
			: canonicalTargetRoot(parsed.targetRoot);
		const execute = async (): Promise<number> => {
			runtime.beforeLockedPlan?.();
			if (!parsed.dryRun) {
				let lockedCanonicalTarget = "";
				try {
					lockedCanonicalTarget = canonicalTargetRoot(parsed.targetRoot);
				} catch {
					throw new Error(
						`Bootstrap target changed while waiting for lock: ${parsed.targetRoot}`,
					);
				}
				if (lockedCanonicalTarget !== initialCanonicalTarget) {
					throw new Error(
						`Bootstrap target changed while waiting for lock: ${parsed.targetRoot}`,
					);
				}
			}
			const templateFiles = buildBootstrapTemplateFiles(
				parsed.mutableDir,
				parsed.withoutClaude,
			);
			const templatePaths = Object.keys(templateFiles).sort();
			const currentFiles = readTargetFiles(parsed.targetRoot, templatePaths);
			personalizeEvolutionConfig(templateFiles, currentFiles);
			const manifest = loadBootstrapManifest(parsed.targetRoot, templatePaths);
			const plan = planBootstrapOperations({
				templateFiles,
				currentFiles,
				manifest,
			});
			plan.operations.push(planCompletionLockGitignore(parsed.targetRoot));
			const cleanupPlan = planBootstrapCleanup(parsed.targetRoot);
			const mutableBaselinePlan = planMutableBaselines(
				parsed.targetRoot,
				parsed.mutableDir,
			);
			const providerCompatibleCleanupPlan =
				planProviderCompatibleAgentsMutableCleanup(
					parsed.targetRoot,
					parsed.mutableDir,
				);

			const conflicts = plan.operations.filter(
				(operation) => operation.kind === "conflict",
			);
			const policyConflicts = conflicts.filter(
				(operation) => operation.path === ".gitignore",
			);
			const writable = plan.operations.filter(
				(operation) =>
					operation.kind === "create" || operation.kind === "update-managed",
			);

			const resultData = {
				target: parsed.targetRoot,
				mode: "dry-run",
				dry_run: parsed.dryRun,
				mutable: parsed.mutableDir,
				without_claude: parsed.withoutClaude,
				files: Object.keys(templateFiles).length,
				operations: plan.operations.length,
				conflicts: conflicts.length,
				cleanup: cleanupPlan.candidates.length,
				provider_cleanup: providerCompatibleCleanupPlan.length,
			};
			if (!parsed.json)
				console.log(
					[
						`bootstrap: target=${parsed.targetRoot}`,
						`mode=${parsed.dryRun ? "dry-run" : "apply"}`,
						`mutable=${parsed.mutableDir}`,
						`without-claude=${parsed.withoutClaude}`,
						`files=${Object.keys(templateFiles).length}`,
						`operations=${plan.operations.length}`,
						`conflicts=${conflicts.length}`,
						`cleanup=${cleanupPlan.candidates.length}`,
						`provider_cleanup=${providerCompatibleCleanupPlan.length}`,
						parsed.verbose ? "details=verbose" : "details=run-with---verbose",
					].join(" "),
				);

			if (!parsed.json && parsed.verbose) {
				for (const operation of plan.operations) {
					console.log(
						`${operation.kind} ${operation.path} ${operation.reason}`,
					);
				}
				for (const candidate of cleanupPlan.candidates) {
					console.log(`cleanup-pending ${candidate.path} ${candidate.reason}`);
				}
				for (const operation of mutableBaselinePlan) {
					console.log(
						`mutable-baseline-${operation.kind} ${operation.path} source=${operation.sourcePath} ${operation.reason}`,
					);
				}
				for (const operation of providerCompatibleCleanupPlan) {
					console.log(
						`provider-compatible-cleanup-pending ${operation.path} ${operation.reason}`,
					);
				}
			}

			if (parsed.dryRun) {
				const exitCode = conflicts.length > 0 ? 4 : 0;
				if (parsed.json) {
					console.log(
						stringifyEnvelope(
							exitCode === 0
								? envelopeOk(resultData, {
										action: "bootstrap.preview",
										exitCode,
									})
								: {
										schema: "afol.result/v1",
										ok: false,
										action: "bootstrap.preview",
										exit_code: exitCode,
										data: resultData,
										error: {
											code: "BOOTSTRAP_CONFLICT",
											message:
												"Bootstrap has conflicts. Re-run with --force-managed to overwrite managed files.",
										},
									},
						),
					);
				}
				return exitCode;
			}

			if (
				conflicts.length > 0 &&
				(!parsed.forceManaged || policyConflicts.length > 0)
			) {
				console.error(
					"Bootstrap has conflicts. Re-run with --force-managed to overwrite managed files.",
				);
				return 4;
			}

			const hasRealMutations =
				writable.length > 0 ||
				(parsed.cleanupObsolete && cleanupPlan.candidates.length > 0) ||
				(parsed.forceManaged && conflicts.length > 0) ||
				mutableBaselinePlan.some((operation) => operation.kind === "create") ||
				(parsed.cleanupProviderCompatibleMutable &&
					parsed.confirmProviderMigration &&
					providerCompatibleCleanupPlan.length > 0);
			if (hasRealMutations) {
				const runtimeValidation = validateMutationRuntime({
					cliRoot: runtime.cliRoot,
					invocationPath: runtime.invocationPath,
					operation: "bootstrap",
				});
				if (!runtimeValidation.ok) {
					console.error(runtimeValidation.message);
					return 2;
				}
			}

			if (!hasRealMutations) return 0;
			let snapshot: TargetSnapshot | null = null;
			let staging = "";
			let preserveSnapshot = false;
			try {
				snapshot = snapshotTarget(parsed.targetRoot);
				staging = validateTemplateStaging(templateFiles, parsed.targetRoot);
				if (hasRealMutations) {
					mkdirSync(parsed.targetRoot, { recursive: true });
				}
				for (const operation of writable) {
					if (operation.path === ".gitignore") {
						const target = resolveBootstrapWritePath(
							parsed.targetRoot,
							operation.path,
						);
						await Bun.write(target, operation.nextContent ?? "");
					} else {
						await writeTemplateFile(
							parsed.targetRoot,
							operation.path,
							templateFiles,
						);
					}
					if (runtime.failAfterTemplateWrite)
						throw new Error("Injected bootstrap failure after template write");
				}
				if (parsed.cleanupObsolete && cleanupPlan.candidates.length > 0) {
					cleanupBootstrapObsolete(parsed.targetRoot, cleanupPlan.candidates);
					if (runtime.failAfterCleanup)
						throw new Error("Injected bootstrap failure after cleanup");
					if (parsed.verbose) {
						for (const candidate of cleanupPlan.candidates) {
							console.log(
								`cleanup-removed ${candidate.path} ${candidate.reason}`,
							);
						}
					}
				}
				if (parsed.forceManaged) {
					for (const operation of conflicts) {
						if (operation.path === ".gitignore") continue;
						await writeTemplateFile(
							parsed.targetRoot,
							operation.path,
							templateFiles,
						);
					}
				}
				await writeMutableBaselines(parsed.targetRoot, mutableBaselinePlan);
				if (runtime.failAfterMutableBaseline)
					throw new Error("Injected bootstrap failure after mutable baseline");
				if (
					parsed.cleanupProviderCompatibleMutable &&
					parsed.confirmProviderMigration
				) {
					const archived = cleanupProviderCompatibleAgentsMutable(
						parsed.targetRoot,
						providerCompatibleCleanupPlan,
					);
					if (runtime.failAfterProviderMigration)
						throw new Error(
							"Injected bootstrap failure after provider migration",
						);
					if (parsed.verbose) {
						for (const operation of archived) {
							console.log(
								`provider-compatible-cleanup-archived ${operation.path} archive=${operation.archivePath} ${operation.reason}`,
							);
						}
					}
				} else {
					if (parsed.verbose) {
						for (const operation of providerCompatibleCleanupPlan) {
							console.log(
								`provider-compatible-cleanup-preserved ${operation.path} ${
									parsed.cleanupProviderCompatibleMutable
										? "requires-confirm-provider-migration"
										: "requires-explicit-opt-in"
								}`,
							);
						}
					}
				}
				const indexOk = buildLocalStateIndexes(parsed.targetRoot, runtime);
				console.log(
					indexOk
						? "local_state_index: ok"
						: "local_state_index: failed; next: run afol local-state rebuild",
				);
				return 0;
			} catch (error) {
				if (snapshot !== null) {
					try {
						restoreTarget(parsed.targetRoot, snapshot);
					} catch (rollbackError) {
						preserveSnapshot = true;
						throw new Error(
							`Bootstrap failed and rollback failed; recovery snapshot preserved at ${snapshot.container}: ${(rollbackError as Error).message}`,
							{ cause: error },
						);
					}
				}
				throw error;
			} finally {
				if (staging) rmSync(staging, { recursive: true, force: true });
				if (snapshot !== null && !preserveSnapshot) {
					rmSync(snapshot.container, { recursive: true, force: true });
				}
			}
		};
		return parsed.dryRun
			? await execute()
			: await withExternalPathLock(initialCanonicalTarget, execute);
	} catch (error) {
		const message = (error as Error).message;
		if (args.includes("--json") || args.includes("-j")) {
			console.log(
				stringifyEnvelope(
					envelopeErr("BOOTSTRAP_ERROR", message, {
						action: "bootstrap",
						exitCode: 2,
					}),
				),
			);
		} else console.error(message);
		return 2;
	}
}
