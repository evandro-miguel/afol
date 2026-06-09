import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPatch } from "diff";
import { DEFAULT_TEMPLATE_FILES } from "../../generated/template";
import {
	type BootstrapManifestEntry,
	type ManagedOwnership,
	planBootstrapOperations,
} from "../bootstrap/planner";
import type { TemplateFileMap } from "../template/payload";

type RawManifest = Record<string, unknown>;

type UpdateMode = "check" | "preview" | "apply";

type UpdateFilePath = string;

type UpdateOperationKind =
	| "create"
	| "skip-identical"
	| "update-managed"
	| "preserve-project-owned"
	| "conflict";

const SPECIAL_UPDATE_TARGETS = new Set<UpdateFilePath>([
	".agents/lock.json",
	".agents/manifest.json",
]);

const UPDATE_TARGETS: UpdateFilePath[] = Object.keys(
	DEFAULT_TEMPLATE_FILES,
).sort();

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

export type UpdateOperation = {
	kind: UpdateOperationKind;
	path: UpdateFilePath;
	owner: ManagedOwnership;
	reason: string;
	diff?: string;
	nextContent?: string;
};

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
	return existsSync(path) ? readFileSync(path, "utf8") : "";
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

function normalizeManifestPath(value: string): string {
	return value
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\.\/+/, "")
		.replace(/^\/+/, "")
		.replace(/\/+/g, "/");
}

function manifestTemplatePatterns(path: string): string[] {
	const normalized = normalizeManifestPath(path);
	if (!normalized) {
		return [];
	}
	return normalized.startsWith(".agents/")
		? [normalized]
		: [normalized, `.agents/${normalized}`];
}

function resolveManifestTemplatePath(
	path: string,
	templatePathSet: Set<string>,
): string | undefined {
	return manifestTemplatePatterns(path).find((candidate) =>
		templatePathSet.has(candidate),
	);
}

function isTemplatePathMatch(pattern: string, path: string): boolean {
	return path === pattern || path.startsWith(`${pattern}/`);
}

function collectOwnershipFromManifest(
	manifest: RawManifest | null,
): OwnershipCounts {
	const counts = zeroOwnershipCounts();
	const ownership = manifest?.ownership;
	if (!ownership || typeof ownership !== "object" || Array.isArray(ownership)) {
		return counts;
	}

	for (const [rawOwner, rawPaths] of Object.entries(ownership)) {
		if (!isManagedOwnership(rawOwner) || !Array.isArray(rawPaths)) {
			continue;
		}
		for (const rawPath of rawPaths) {
			if (typeof rawPath === "string" && rawPath.trim().length > 0) {
				counts[rawOwner] += 1;
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
			const patterns = manifestTemplatePatterns(rawPath);
			for (const templatePath of targetPaths) {
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
		.filter((operation) => operation.diff !== undefined)
		.map((operation) => ({
			path: operation.path,
			owner: operation.owner,
			reason: operation.reason,
			diff: operation.diff ?? "",
		}));
}

function planUpdateOperations(
	currentManifest: RawManifest | null,
	currentLock: RawManifest | null,
	sourceLockContent: string,
	sourceManifestContent: string,
	currentFiles: Record<string, string>,
): UpdateOperation[] {
	const operations: UpdateOperation[] = [];
	const currentManifestEntries = collectCurrentManifestEntries(
		currentManifest,
		currentLock,
		UPDATE_TARGETS,
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
		const owner = manifestEntry?.owner ?? "managed";
		if (entry.sourceContent.length === 0) {
			continue;
		}

		if (entry.currentContent.length === 0) {
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
			operations.push({
				kind: "update-managed",
				path: entry.path,
				owner,
				reason: entry.managedReason,
				nextContent: safeManagedContent(
					entry.path,
					entry.currentContent,
					entry.sourceContent,
				),
				diff: buildPatch(
					entry.path,
					entry.currentContent,
					safeManagedContent(
						entry.path,
						entry.currentContent,
						entry.sourceContent,
					),
				),
			});
			continue;
		}

		if (managedHash === undefined) {
			operations.push({
				kind: "update-managed",
				path: entry.path,
				owner,
				reason: entry.defaultReason,
				nextContent: safeManagedContent(
					entry.path,
					entry.currentContent,
					entry.sourceContent,
				),
				diff: buildPatch(
					entry.path,
					entry.currentContent,
					safeManagedContent(
						entry.path,
						entry.currentContent,
						entry.sourceContent,
					),
				),
			});
		}
	}

	const templateFiles: TemplateFileMap = {};
	const genericCurrentFiles: Record<string, string> = {};
	const genericPaths = UPDATE_TARGETS.filter(
		(path) => !SPECIAL_UPDATE_TARGETS.has(path),
	);

	for (const path of genericPaths) {
		const templateEntry = DEFAULT_TEMPLATE_FILES[path];
		if (!templateEntry) {
			continue;
		}
		templateFiles[path] = templateEntry;
		if (typeof currentFiles[path] === "string") {
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
		const updateOperation: UpdateOperation = {
			kind: operation.kind,
			path: operation.path,
			owner: operation.owner,
			reason: operation.reason,
		};
		const diff =
			operation.diffPreview ??
			(operation.kind === "create" ||
			operation.kind === "update-managed" ||
			operation.kind === "conflict"
				? buildPatch(operation.path, currentContent, nextContent)
				: undefined);
		if (diff !== undefined) {
			updateOperation.diff = diff;
		}
		if (operation.kind === "create" || operation.kind === "update-managed") {
			updateOperation.nextContent = nextContent;
		}
		operations.push(updateOperation);
	}

	return operations.sort((left, right) => left.path.localeCompare(right.path));
}

function serializeOwnership(counts: OwnershipCounts): string {
	return MANAGED_OWNERSHIP.map((owner) => `${owner}:${counts[owner]}`).join(
		", ",
	);
}

export function checkTemplateUpdate(projectRoot: string): UpdateCheckResult {
	const currentFiles: Record<string, string> = {};
	for (const path of UPDATE_TARGETS) {
		const content = readText(join(projectRoot, path));
		if (content.length > 0) {
			currentFiles[path] = content;
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
	);

	const hasSource = UPDATE_TARGETS.length > 0;
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

export function formatUpdateCheck(
	result: UpdateCheckResult,
	mode: UpdateMode,
): string {
	const lines: string[] = [
		`update ${mode}: ${result.upToDate ? "up-to-date" : result.hasSource ? "changes available" : "no-source"}`,
		`current revision: ${result.currentRevision}`,
		`source revision: ${result.sourceRevision}`,
		`ownership(current): ${serializeOwnership(result.ownershipCurrent)}`,
		`ownership(source): ${serializeOwnership(result.ownershipSource)}`,
	];

	if (result.changes.length > 0) {
		const label =
			mode === "preview"
				? "preview operations:"
				: mode === "apply"
					? "apply operations:"
					: "changes:";
		lines.push(label);
		for (const change of result.changes) {
			lines.push(`- ${change}`);
		}
	}

	if (result.filePreviews.length > 0) {
		lines.push("diff previews:");
		for (const preview of result.filePreviews) {
			lines.push(`${preview.path} [owner=${preview.owner}] ${preview.reason}`);
			lines.push(preview.diff.trimEnd());
		}
	}

	if (mode === "apply") {
		lines.push(`apply details (${result.operations.length} operations):`);
		for (const operation of result.operations) {
			lines.push(`${operation.kind} ${operation.path} ${operation.reason}`);
		}
	}

	return `${lines.join("\n")}\n`;
}
