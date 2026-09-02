import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createPatch } from "diff";
import { DEFAULT_TEMPLATE_FILES } from "../../generated/template";
import {
	ADAPTER_DEFINITIONS,
	ADAPTER_IDS,
	isAdapterPath,
	readAdapterConfigState,
} from "../adapter/antigravity";
import {
	type BootstrapManifestEntry,
	type ManagedOwnership,
	planBootstrapOperations,
	planCompletionLockGitignoreOperation,
} from "../bootstrap/planner";
import { resolveProjectWritePath } from "../project/root";
import {
	isTemplatePathMatch,
	manifestTemplatePatterns,
	resolveManifestTemplatePath,
} from "../template/manifest-paths";
import type { TemplateFileMap } from "../template/payload";

type RawManifest = Record<string, unknown>;

type UpdateMode = "check" | "preview" | "apply";

type UpdateFilePath = string;

const SPECIAL_UPDATE_TARGETS = new Set<UpdateFilePath>([
	".agents/lock.json",
	".agents/manifest.json",
]);

const UPDATE_TARGETS: UpdateFilePath[] = Object.keys(
	DEFAULT_TEMPLATE_FILES,
).sort();

const REMOVED_TEMPLATE_PATHS: readonly UpdateFilePath[] = [
	".agents/skills/agentic-folder-sys",
	".agents/source/universal-skills/skills/agentic-folder-sys",
	".afol/adm/source/universal-skills/skills/agentic-folder-sys",
];

const MANAGED_OWNERSHIP: ReadonlyArray<ManagedOwnership> = [
	"managed",
	"project-owned",
	"generated",
	"ignored",
	"conflict",
];

export type OwnershipCounts = Record<ManagedOwnership, number>;

export type UpdateFilePreview = {
	path: string;
	owner: ManagedOwnership;
	reason: string;
	diff: string;
};

type UpdateOperationBase = {
	path: UpdateFilePath;
	owner: ManagedOwnership;
	reason: string;
};

type UpdateDiffOperation = UpdateOperationBase & {
	diff: string;
};

export type UpdateOperation =
	| (UpdateOperationBase & {
			kind: "skip-identical";
	  })
	| (UpdateOperationBase & {
			kind: "preserve-project-owned";
	  })
	| (UpdateDiffOperation & {
			kind: "conflict";
	  })
	| (UpdateDiffOperation & {
			kind: "create";
			nextContent: string;
	  })
	| (UpdateDiffOperation & {
			kind: "update-managed";
			nextContent: string;
	  })
	| (UpdateDiffOperation & {
			kind: "remove-stale";
	  });

export type UpdateCheckResult = {
	hasSource: boolean;
	currentRevision: string;
	sourceRevision: string;
	upToDate: boolean;
	changes: string[];
	ownershipSource: OwnershipCounts;
	ownershipCurrent: OwnershipCounts;
	filePreviews: UpdateFilePreview[];
	operations: UpdateOperation[];
};

function zeroOwnershipCounts(): OwnershipCounts {
	return {
		managed: 0,
		"project-owned": 0,
		generated: 0,
		ignored: 0,
		conflict: 0,
	};
}

function readText(path: string): string {
	return existsSync(path)
		? readFileSync(path, "utf8").replaceAll("\r\n", "\n")
		: "";
}

function planCompletionLockGitignore(projectRoot: string): UpdateOperation {
	const resolved = resolveProjectWritePath(projectRoot, ".gitignore");
	if (!resolved.ok) {
		return toUpdateGitignoreOperation(
			planCompletionLockGitignoreOperation({
				state: "unsafe",
				reason: "project-owned-gitignore-unsafe-path",
			}),
		);
	}
	try {
		const stats = lstatSync(resolved.value.path);
		return toUpdateGitignoreOperation(
			planCompletionLockGitignoreOperation(
				stats.isFile()
					? {
							state: "regular",
							content: readFileSync(resolved.value.path, "utf8"),
						}
					: {
							state: "unsafe",
							reason: stats.isSymbolicLink()
								? "project-owned-gitignore-symlink"
								: "project-owned-gitignore-non-regular",
						},
			),
		);
	} catch (error) {
		return toUpdateGitignoreOperation(
			planCompletionLockGitignoreOperation(
				(error as { code?: string }).code === "ENOENT"
					? { state: "absent" }
					: { state: "unsafe", reason: "project-owned-gitignore-unreadable" },
			),
		);
	}
}

function toUpdateGitignoreOperation(
	operation: ReturnType<typeof planCompletionLockGitignoreOperation>,
): UpdateOperation {
	if (operation.kind === "update-managed") {
		return {
			...operation,
			kind: "update-managed",
			nextContent: operation.nextContent ?? "",
			diff: operation.diffPreview ?? "",
		};
	}
	if (operation.kind === "conflict") {
		return {
			...operation,
			kind: "conflict",
			diff: operation.diffPreview ?? "",
		};
	}
	return {
		kind: "skip-identical",
		path: operation.path,
		owner: operation.owner,
		reason: operation.reason,
	};
}

function readJsonText(content: string): RawManifest | null {
	if (content.length === 0) {
		return null;
	}
	try {
		const parsed = JSON.parse(content);
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
		) {
			return parsed as RawManifest;
		}
	} catch {
		return null;
	}
	return null;
}

function readEmbeddedTemplateText(path: UpdateFilePath): string {
	const entry = DEFAULT_TEMPLATE_FILES[path];
	return entry
		? Buffer.from(entry.contentBase64, "base64").toString("utf8")
		: "";
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function isManagedOwnership(value: unknown): value is ManagedOwnership {
	return (
		typeof value === "string" &&
		(MANAGED_OWNERSHIP as readonly string[]).includes(value)
	);
}

function collectOwnershipFromManifest(
	manifest: RawManifest | null,
): OwnershipCounts {
	const counts = zeroOwnershipCounts();
	const counted = new Set<string>();
	const ownership = manifest?.ownership;
	if (ownership && typeof ownership === "object" && !Array.isArray(ownership)) {
		for (const [rawOwner, rawPaths] of Object.entries(ownership)) {
			if (!isManagedOwnership(rawOwner) || !Array.isArray(rawPaths)) {
				continue;
			}
			for (const rawPath of rawPaths) {
				if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
					continue;
				}
				const key = `${rawOwner}:${rawPath}`;
				if (!counted.has(key)) {
					counted.add(key);
					counts[rawOwner] += 1;
				}
			}
		}
	}

	const managedHashes = manifest?.managed_hashes;
	if (
		managedHashes &&
		typeof managedHashes === "object" &&
		!Array.isArray(managedHashes)
	) {
		for (const rawPath of Object.keys(managedHashes)) {
			if (rawPath.trim().length === 0) {
				continue;
			}
			const key = `managed:${rawPath}`;
			if (!counted.has(key)) {
				counted.add(key);
				counts.managed += 1;
			}
		}
	}
	return counts;
}

function collectCurrentManifestEntries(
	currentManifest: RawManifest | null,
	currentLock: RawManifest | null,
	targetPaths: UpdateFilePath[],
): Record<string, BootstrapManifestEntry> {
	const manifest: Record<string, BootstrapManifestEntry> = {};
	const templatePathSet = new Set(targetPaths);

	const assignManagedHashes = (raw: RawManifest | null): void => {
		const managedHashes = raw?.managed_hashes;
		if (
			!managedHashes ||
			typeof managedHashes !== "object" ||
			Array.isArray(managedHashes)
		) {
			return;
		}
		for (const [path, hash] of Object.entries(managedHashes)) {
			if (typeof hash !== "string" || hash.trim().length === 0) {
				continue;
			}
			const resolvedPath = resolveManifestTemplatePath(path, templatePathSet);
			if (!resolvedPath) {
				continue;
			}
			manifest[resolvedPath] = {
				owner: manifest[resolvedPath]?.owner ?? "managed",
				hash,
			};
		}
	};

	assignManagedHashes(currentManifest);
	assignManagedHashes(currentLock);

	const ownership = currentManifest?.ownership;
	if (!ownership || typeof ownership !== "object" || Array.isArray(ownership)) {
		return manifest;
	}

	for (const [ownerName, rawPaths] of Object.entries(ownership)) {
		if (!isManagedOwnership(ownerName) || !Array.isArray(rawPaths)) {
			continue;
		}
		for (const rawPath of rawPaths) {
			if (typeof rawPath !== "string") {
				continue;
			}
			const exactOwnershipPath = resolveManifestTemplatePath(
				rawPath,
				templatePathSet,
			);
			const patterns = manifestTemplatePatterns(rawPath);
			for (const templatePath of targetPaths) {
				if (
					!patterns.some((pattern) =>
						isTemplatePathMatch(pattern, templatePath),
					)
				) {
					continue;
				}
				if (
					manifest[templatePath]?.hash &&
					(ownerName === "managed" || exactOwnershipPath !== templatePath)
				) {
					continue;
				}
				manifest[templatePath] =
					ownerName === "managed"
						? { ...manifest[templatePath], owner: ownerName }
						: { owner: ownerName };
			}
		}
	}

	return manifest;
}

function safeEqual(valueA: unknown, valueB: unknown): boolean {
	return JSON.stringify(valueA) === JSON.stringify(valueB);
}

function isObject(value: unknown): value is RawManifest {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function revisionOf(lock: RawManifest | null): string {
	return typeof lock?.revision === "string" ? lock.revision : "unknown";
}

function commandsOf(manifest: RawManifest | null): string[] {
	const raw = manifest?.commands;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return [];
	}
	return Object.keys(raw).sort();
}

function hasUnsafeLockEdits(sourceText: string, currentText: string): boolean {
	const source = (() => {
		try {
			return JSON.parse(sourceText) as RawManifest;
		} catch {
			return null;
		}
	})();
	const current = (() => {
		try {
			return JSON.parse(currentText) as RawManifest;
		} catch {
			return null;
		}
	})();
	if (
		!source ||
		!current ||
		typeof source !== "object" ||
		typeof current !== "object" ||
		Array.isArray(source) ||
		Array.isArray(current)
	) {
		return true;
	}

	const allowedMutable = new Set(["project", "revision", "managed_hashes"]);
	for (const [key, currentValue] of Object.entries(current)) {
		if (allowedMutable.has(key)) {
			continue;
		}
		if (!(key in source)) {
			return true;
		}
		if (!safeEqual(currentValue, source[key])) {
			return true;
		}
	}
	return false;
}

function hasUnsafeManifestEdits(
	sourceText: string,
	currentText: string,
): boolean {
	const source = (() => {
		try {
			return JSON.parse(sourceText) as RawManifest;
		} catch {
			return null;
		}
	})();
	const current = (() => {
		try {
			return JSON.parse(currentText) as RawManifest;
		} catch {
			return null;
		}
	})();
	if (
		!source ||
		!current ||
		typeof source !== "object" ||
		typeof current !== "object" ||
		Array.isArray(source) ||
		Array.isArray(current)
	) {
		return true;
	}

	const sourceCommands = source.commands;
	const currentCommands = current.commands;
	if (sourceCommands === undefined && currentCommands === undefined) {
		return false;
	}
	if (
		!sourceCommands ||
		!currentCommands ||
		typeof sourceCommands !== "object" ||
		typeof currentCommands !== "object" ||
		Array.isArray(sourceCommands) ||
		Array.isArray(currentCommands)
	) {
		return true;
	}

	for (const [key, currentValue] of Object.entries(current)) {
		if (!(key in source)) {
			return true;
		}
		if (key === "managed_hashes") {
			continue;
		}
		if (key === "ownership") {
			const sourceOwnership = source[key];
			if (!isObject(sourceOwnership) || !isObject(currentValue)) {
				return true;
			}
			for (const [owner, currentPaths] of Object.entries(currentValue)) {
				const sourcePaths = sourceOwnership[owner];
				if (
					!Array.isArray(sourcePaths) ||
					!Array.isArray(currentPaths) ||
					!currentPaths.every((path) => typeof path === "string") ||
					!sourcePaths.every(
						(path) => typeof path === "string" && currentPaths.includes(path),
					)
				) {
					return true;
				}
			}
			continue;
		}
		if (key === "commands") {
			if (!isObject(currentValue)) {
				return true;
			}
			for (const [commandName, commandValue] of Object.entries(
				currentCommands,
			)) {
				if (!(commandName in sourceCommands)) {
					return true;
				}
				const sourceCommandValue = (sourceCommands as RawManifest)[commandName];
				if (!safeEqual(commandValue, sourceCommandValue)) {
					return true;
				}
			}
			continue;
		}
		if (!safeEqual(currentValue, source[key])) {
			return true;
		}
	}

	return false;
}

function safeManagedContent(
	path: UpdateFilePath,
	currentText: string,
	sourceText: string,
): string {
	if (path === ".agents/lock.json") {
		let source: RawManifest | null = null;
		let current: RawManifest | null = null;
		try {
			source = JSON.parse(sourceText) as RawManifest;
		} catch {
			return sourceText;
		}
		try {
			current = JSON.parse(currentText) as RawManifest;
		} catch {
			return sourceText;
		}
		if (
			!source ||
			typeof source !== "object" ||
			Array.isArray(source) ||
			!current ||
			typeof current !== "object" ||
			Array.isArray(current)
		) {
			return sourceText;
		}
		if (typeof current.project === "string") {
			source.project = current.project;
		}
		return `${JSON.stringify(source, null, 2)}\n`;
	}
	return sourceText;
}

function buildPatch(path: string, before: string, after: string): string {
	return createPatch(path, before, after, "current", "template");
}

function makeSummaryChanges(
	currentManifest: RawManifest | null,
	sourceManifest: RawManifest | null,
	currentLock: RawManifest | null,
	sourceLock: RawManifest | null,
	operations: UpdateOperation[],
): string[] {
	const changes: string[] = [];
	const currentRevision = revisionOf(currentLock);
	const sourceRevision = revisionOf(sourceLock);
	const currentCommands = commandsOf(currentManifest);
	const sourceCommands = commandsOf(sourceManifest);
	if (!currentRevision || currentRevision === "unknown") {
		if (typeof sourceRevision === "string" && sourceRevision !== "unknown") {
			changes.push(`create .agents/lock.json`);
		}
	} else if (currentRevision !== sourceRevision) {
		changes.push(`revision ${currentRevision} -> ${sourceRevision}`);
	}
	if (currentManifest === null && sourceManifest !== null) {
		changes.push("create .agents/manifest.json");
	}
	changes.push(...diffManifestCommands(currentCommands, sourceCommands));
	for (const operation of operations) {
		if (
			operation.kind === "skip-identical" ||
			SPECIAL_UPDATE_TARGETS.has(operation.path)
		) {
			continue;
		}
		if (operation.kind === "create") {
			changes.push(`create ${operation.path}`);
			continue;
		}
		if (operation.kind === "update-managed") {
			changes.push(`update ${operation.path}`);
			continue;
		}
		if (operation.kind === "remove-stale") {
			changes.push(`remove ${operation.path}`);
			continue;
		}
		if (operation.kind === "preserve-project-owned") {
			changes.push(`preserve ${operation.path}`);
			continue;
		}
		if (operation.kind === "conflict") {
			changes.push(`conflict ${operation.path}`);
		}
	}
	return changes;
}

function diffManifestCommands(current: string[], source: string[]): string[] {
	const currentSet = new Set(current);
	const sourceSet = new Set(source);
	const changes: string[] = [];
	for (const command of source) {
		if (!currentSet.has(command)) {
			changes.push(`add command ${command}`);
		}
	}
	for (const command of current) {
		if (!sourceSet.has(command)) {
			changes.push(`remove command ${command}`);
		}
	}
	return changes;
}

function buildFilePreviews(operations: UpdateOperation[]): UpdateFilePreview[] {
	return operations
		.filter(
			(operation): operation is Extract<UpdateOperation, { diff: string }> =>
				"diff" in operation,
		)
		.map((operation) => ({
			path: operation.path,
			owner: operation.owner,
			reason: operation.reason,
			diff: operation.diff,
		}));
}

function planUpdateOperations(
	currentManifest: RawManifest | null,
	currentLock: RawManifest | null,
	sourceLockContent: string,
	sourceManifestContent: string,
	currentFiles: Record<string, string>,
	updateTargets: UpdateFilePath[],
): UpdateOperation[] {
	const operations: UpdateOperation[] = [];
	const currentManifestEntries = collectCurrentManifestEntries(
		currentManifest,
		currentLock,
		updateTargets,
	);

	const entries = [
		{
			path: ".agents/lock.json" as UpdateFilePath,
			sourceContent: sourceLockContent,
			currentContent: currentFiles[".agents/lock.json"] ?? "",
			hasConflict: (source: string, current: string): boolean =>
				hasUnsafeLockEdits(source, current),
			managedReason: "revision changed",
			defaultReason: "revision changed",
		},
		{
			path: ".agents/manifest.json" as UpdateFilePath,
			sourceContent: sourceManifestContent,
			currentContent: currentFiles[".agents/manifest.json"] ?? "",
			hasConflict: (source: string, current: string): boolean =>
				hasUnsafeManifestEdits(source, current),
			managedReason: "manifest commands changed",
			defaultReason: "manifest commands changed",
		},
	];

	for (const entry of entries) {
		const manifestEntry = currentManifestEntries[entry.path];
		const manifestOwner = manifestEntry?.owner ?? "managed";
		const owner =
			entry.path === ".agents/lock.json" &&
			manifestOwner === "project-owned" &&
			!entry.hasConflict(entry.sourceContent, entry.currentContent)
				? "managed"
				: manifestOwner;
		if (entry.sourceContent.length === 0) {
			continue;
		}

		const targetExists = Object.hasOwn(currentFiles, entry.path);
		if (!targetExists) {
			if (owner === "project-owned" || owner === "ignored") {
				operations.push({
					kind: "preserve-project-owned",
					path: entry.path,
					owner,
					reason:
						owner === "project-owned"
							? "manifest-owner-project-owned-missing"
							: "manifest-owner-ignored-missing",
				});
				continue;
			}
			operations.push({
				kind: "create",
				path: entry.path,
				owner,
				reason: "missing-target-file",
				nextContent: entry.sourceContent,
				diff: buildPatch(entry.path, "", entry.sourceContent),
			});
			continue;
		}

		if (entry.currentContent === entry.sourceContent) {
			operations.push({
				kind: "skip-identical",
				path: entry.path,
				owner,
				reason: "same-content",
			});
			continue;
		}

		if (
			(owner === "project-owned" || owner === "ignored") &&
			entry.hasConflict(entry.sourceContent, entry.currentContent)
		) {
			operations.push({
				kind: "conflict",
				path: entry.path,
				owner: "conflict",
				reason: "local-user-edit-or-unsafe",
				diff: buildPatch(entry.path, entry.currentContent, entry.sourceContent),
			});
			continue;
		}

		if (owner === "project-owned" || owner === "ignored") {
			operations.push({
				kind: "preserve-project-owned",
				path: entry.path,
				owner,
				reason: `manifest-owner-${owner}`,
			});
			continue;
		}

		if (owner === "conflict") {
			operations.push({
				kind: "conflict",
				path: entry.path,
				owner: "conflict",
				reason: "manifest-owner-conflict",
				diff: buildPatch(entry.path, entry.currentContent, entry.sourceContent),
			});
			continue;
		}

		const managedHash = manifestEntry?.hash;
		const currentHash = sha256Hex(entry.currentContent);
		if (managedHash !== undefined && currentHash !== managedHash) {
			operations.push({
				kind: "conflict",
				path: entry.path,
				owner,
				reason: "managed-hash-mismatch",
				diff: buildPatch(entry.path, entry.currentContent, entry.sourceContent),
			});
			continue;
		}

		if (
			managedHash === undefined &&
			entry.hasConflict(entry.sourceContent, entry.currentContent)
		) {
			operations.push({
				kind: "conflict",
				path: entry.path,
				owner,
				reason: "local-user-edit-or-unsafe",
				diff: buildPatch(entry.path, entry.currentContent, entry.sourceContent),
			});
			continue;
		}

		if (managedHash !== undefined && currentHash === managedHash) {
			const nextContent = safeManagedContent(
				entry.path,
				entry.currentContent,
				entry.sourceContent,
			);
			operations.push({
				kind: "update-managed",
				path: entry.path,
				owner,
				reason: entry.managedReason,
				nextContent,
				diff: buildPatch(entry.path, entry.currentContent, nextContent),
			});
			continue;
		}

		if (managedHash === undefined) {
			const nextContent = safeManagedContent(
				entry.path,
				entry.currentContent,
				entry.sourceContent,
			);
			operations.push({
				kind: "update-managed",
				path: entry.path,
				owner,
				reason: entry.defaultReason,
				nextContent,
				diff: buildPatch(entry.path, entry.currentContent, nextContent),
			});
		}
	}

	const templateFiles: TemplateFileMap = {};
	const genericCurrentFiles: Record<string, string> = {};
	const genericPaths = updateTargets.filter(
		(path) => !SPECIAL_UPDATE_TARGETS.has(path),
	);

	for (const path of genericPaths) {
		const templateEntry = DEFAULT_TEMPLATE_FILES[path];
		if (!templateEntry) {
			continue;
		}
		templateFiles[path] = templateEntry;
		if (Object.hasOwn(currentFiles, path)) {
			genericCurrentFiles[path] = currentFiles[path] ?? "";
		}
	}

	const genericManifest: Record<string, BootstrapManifestEntry> = {};
	for (const path of genericPaths) {
		const manifestEntry = currentManifestEntries[path];
		if (manifestEntry) {
			genericManifest[path] = manifestEntry;
		}
	}

	const genericPlan = planBootstrapOperations({
		templateFiles,
		currentFiles: genericCurrentFiles,
		manifest: genericManifest,
	});

	for (const operation of genericPlan.operations) {
		const templateEntry = templateFiles[operation.path];
		if (!templateEntry) {
			continue;
		}
		const currentContent = genericCurrentFiles[operation.path] ?? "";
		const nextContent = Buffer.from(
			templateEntry.contentBase64,
			"base64",
		).toString("utf8");
		const diff =
			operation.diffPreview ??
			(operation.kind === "create" ||
			operation.kind === "update-managed" ||
			operation.kind === "conflict"
				? buildPatch(operation.path, currentContent, nextContent)
				: undefined);
		let updateOperation: UpdateOperation;
		if (operation.kind === "create" || operation.kind === "update-managed") {
			updateOperation = {
				kind: operation.kind,
				path: operation.path,
				owner: operation.owner,
				reason: operation.reason,
				nextContent,
				diff: diff ?? buildPatch(operation.path, currentContent, nextContent),
			};
		} else if (operation.kind === "conflict") {
			updateOperation = {
				kind: "conflict",
				path: operation.path,
				owner: operation.owner,
				reason: operation.reason,
				diff: diff ?? buildPatch(operation.path, currentContent, nextContent),
			};
		} else {
			updateOperation = {
				kind: operation.kind,
				path: operation.path,
				owner: operation.owner,
				reason: operation.reason,
			};
		}
		operations.push(updateOperation);
	}

	return operations.sort((left, right) => left.path.localeCompare(right.path));
}

function collectRemovedTemplateOperations(
	projectRoot: string,
	removedPaths: readonly UpdateFilePath[],
): UpdateOperation[] {
	const manifest = readJsonText(
		readText(join(projectRoot, ".agents/manifest.json")),
	);
	const entries = collectCurrentManifestEntries(manifest, null, [
		...removedPaths,
	]);
	return removedPaths
		.filter((path) => existsSync(join(projectRoot, path)))
		.map((path) => {
			const entry = entries[path];
			const managedHashes = manifest?.managed_hashes;
			const directHash =
				managedHashes &&
				typeof managedHashes === "object" &&
				!Array.isArray(managedHashes) &&
				typeof (managedHashes as RawManifest)[path] === "string"
					? ((managedHashes as RawManifest)[path] as string)
					: undefined;
			if (entry?.owner === "project-owned" || entry?.owner === "ignored") {
				return {
					kind: "preserve-project-owned",
					path,
					owner: entry.owner,
					reason: "removed-template-project-owned",
				};
			}
			const absolutePath = join(projectRoot, path);
			if (
				(entry?.owner === "managed" || (!entry && directHash !== undefined)) &&
				(entry?.hash ?? directHash) !== undefined &&
				!statSync(absolutePath).isDirectory() &&
				sha256Hex(readText(absolutePath)) === (entry?.hash ?? directHash)
			) {
				return {
					kind: "remove-stale",
					path,
					owner: "managed",
					reason: "removed-from-template-managed-hash-match",
					diff: `remove stale managed template file: ${path}\n`,
				};
			}
			return {
				kind: "conflict",
				path,
				owner: "conflict",
				reason: "removed-template-missing-managed-hash",
				diff: `cannot safely remove stale template path without last managed hash: ${path}\n`,
			};
		});
}

function serializeOwnership(counts: OwnershipCounts): string {
	return MANAGED_OWNERSHIP.map((owner) => `${owner}:${counts[owner]}`).join(
		", ",
	);
}

export function checkTemplateUpdate(
	projectRoot: string,
	removedPaths: readonly UpdateFilePath[] = REMOVED_TEMPLATE_PATHS,
): UpdateCheckResult {
	const disabledAdapters = new Set(
		ADAPTER_IDS.filter(
			(id) => readAdapterConfigState(projectRoot, id) !== "enabled",
		).map((id) => ADAPTER_DEFINITIONS[id].mirrorPath),
	);
	const updateTargets = UPDATE_TARGETS.filter(
		(path) => !isAdapterPath(path) || !disabledAdapters.has(path),
	);
	const currentFiles: Record<string, string> = {};
	for (const path of updateTargets) {
		const absolutePath = join(projectRoot, path);
		if (existsSync(absolutePath)) {
			currentFiles[path] = readText(absolutePath);
		}
	}

	const currentLockContent = currentFiles[".agents/lock.json"] ?? "";
	const currentManifestContent = currentFiles[".agents/manifest.json"] ?? "";
	const currentLock = readJsonText(currentLockContent);
	const currentManifest = readJsonText(currentManifestContent);
	const sourceLockContent = readEmbeddedTemplateText(".agents/lock.json");
	const sourceManifestContent = readEmbeddedTemplateText(
		".agents/manifest.json",
	);
	const sourceLock = readJsonText(sourceLockContent);
	const sourceManifest = readJsonText(sourceManifestContent);

	const operations = planUpdateOperations(
		currentManifest,
		currentLock,
		sourceLockContent,
		sourceManifestContent,
		currentFiles,
		updateTargets,
	)
		.concat(collectRemovedTemplateOperations(projectRoot, removedPaths))
		.concat(planCompletionLockGitignore(projectRoot));

	const hasSource = updateTargets.length > 0;
	const currentRevision = revisionOf(currentLock);
	const sourceRevision = revisionOf(sourceLock);
	const ownershipCurrent = collectOwnershipFromManifest(currentManifest);
	const ownershipSource = collectOwnershipFromManifest(sourceManifest);
	const changes = makeSummaryChanges(
		currentManifest,
		sourceManifest,
		currentLock,
		sourceLock,
		operations,
	);
	const filePreviews = buildFilePreviews(operations);

	return {
		hasSource,
		currentRevision,
		sourceRevision,
		upToDate:
			hasSource &&
			operations.every((operation) => operation.kind === "skip-identical"),
		changes,
		ownershipSource,
		ownershipCurrent,
		filePreviews,
		operations,
	};
}

type FormatUpdateCheckOptions = {
	verbose?: boolean;
};

function operationSummary(result: UpdateCheckResult): {
	total: number;
	create: number;
	update: number;
	remove: number;
	conflict: number;
	preserve: number;
	conflictPaths: string[];
} {
	const summary = {
		total: 0,
		create: 0,
		update: 0,
		remove: 0,
		conflict: 0,
		preserve: 0,
		conflictPaths: [] as string[],
	};
	for (const operation of result.operations) {
		if (operation.kind === "skip-identical") {
			continue;
		}
		summary.total += 1;
		if (operation.kind === "create") {
			summary.create += 1;
			continue;
		}
		if (operation.kind === "update-managed") {
			summary.update += 1;
			continue;
		}
		if (operation.kind === "remove-stale") {
			summary.remove += 1;
			continue;
		}
		if (operation.kind === "conflict") {
			summary.conflict += 1;
			summary.conflictPaths.push(operation.path);
			continue;
		}
		if (operation.kind === "preserve-project-owned") {
			summary.preserve += 1;
		}
	}
	return summary;
}

function limitedPathLines(paths: string[], limit: number): string[] {
	const lines = paths.slice(0, limit).map((path) => `- ${path}`);
	const remaining = paths.length - lines.length;
	if (remaining > 0) {
		lines.push(`... ${remaining} more`);
	}
	return lines;
}

function limitedChangeLines(changes: string[], limit: number): string[] {
	const lines = changes.slice(0, limit).map((change) => `- ${change}`);
	const remaining = changes.length - lines.length;
	if (remaining > 0) {
		lines.push(`... ${remaining} more`);
	}
	return lines;
}

export function formatUpdateCheck(
	result: UpdateCheckResult,
	mode: UpdateMode,
	options: FormatUpdateCheckOptions = {},
): string {
	const lines: string[] = [
		`update ${mode}: ${result.upToDate ? "up-to-date" : result.hasSource ? "changes available" : "no-source"}`,
		`current revision: ${result.currentRevision}`,
		`source revision: ${result.sourceRevision}`,
		`ownership(current): ${serializeOwnership(result.ownershipCurrent)}`,
		`ownership(source): ${serializeOwnership(result.ownershipSource)}`,
	];

	if (mode === "check" && !options.verbose) {
		const summary = operationSummary(result);
		lines.push(
			`operations: total=${summary.total} create=${summary.create} update=${summary.update} remove=${summary.remove} conflict=${summary.conflict} preserve=${summary.preserve}`,
		);
		if (summary.conflictPaths.length > 0) {
			lines.push("conflicts:");
			lines.push(...limitedPathLines(summary.conflictPaths, 20));
		}
		if (summary.total > 0) {
			lines.push(
				"hint: run afol update preview --verbose for diff previews or afol update check --verbose for full details",
			);
		}
		return `${lines.join("\n")}\n`;
	}

	if ((mode === "preview" || mode === "apply") && !options.verbose) {
		const summary = operationSummary(result);
		lines.push(
			`operations: total=${summary.total} create=${summary.create} update=${summary.update} remove=${summary.remove} conflict=${summary.conflict} preserve=${summary.preserve}`,
		);
		if (summary.conflictPaths.length > 0) {
			lines.push("conflicts:");
			lines.push(...limitedPathLines(summary.conflictPaths, 20));
		}
	}

	if (result.changes.length > 0) {
		const label =
			mode === "preview"
				? "preview operations:"
				: mode === "apply"
					? "apply operations:"
					: "changes:";
		lines.push(label);
		lines.push(
			...limitedChangeLines(
				result.changes,
				options.verbose ? Number.MAX_SAFE_INTEGER : 80,
			),
		);
	}

	if (result.filePreviews.length > 0) {
		if (options.verbose) {
			lines.push("diff previews:");
			for (const preview of result.filePreviews) {
				lines.push(
					`${preview.path} [owner=${preview.owner}] ${preview.reason}`,
				);
				lines.push(preview.diff.trimEnd());
			}
		} else {
			lines.push(
				`diff previews: omitted in compact ${mode}; run afol update ${mode} --verbose for full diffs`,
			);
		}
	}

	if (mode === "apply") {
		const operations = options.verbose
			? result.operations
			: result.operations.filter(
					(operation) => operation.kind !== "skip-identical",
				);
		lines.push(`apply details (${operations.length} operations):`);
		const visibleOperations = options.verbose
			? operations
			: operations.slice(0, 80);
		for (const operation of visibleOperations) {
			lines.push(`${operation.kind} ${operation.path} ${operation.reason}`);
		}
		const remaining = operations.length - visibleOperations.length;
		if (remaining > 0) {
			lines.push(`... ${remaining} more`);
		}
	}

	return `${lines.join("\n")}\n`;
}
