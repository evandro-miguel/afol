import { createHash } from "node:crypto";
import { createPatch } from "diff";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ManagedOwnership } from "../bootstrap/planner";

type RawManifest = Record<string, unknown>;

type UpdateMode = "check" | "preview" | "apply";

type UpdateFilePath = ".agents/lock.json" | ".agents/manifest.json";

type UpdateOperationKind = "create" | "skip-identical" | "update-managed" | "preserve-project-owned" | "conflict";

const UPDATE_TARGETS: UpdateFilePath[] = [
  ".agents/lock.json",
  ".agents/manifest.json",
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

function readJsonFile(path: string): RawManifest | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readText(path));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as RawManifest;
    }
  } catch {
    return null;
  }
  return null;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isManagedOwnership(value: unknown): value is ManagedOwnership {
  return typeof value === "string" && (MANAGED_OWNERSHIP as readonly string[]).includes(value);
}

function normalizeManifestPath(value: string): string {
  return value.trim().replace(/^[.\\/]+/, "").replace(/\\+/g, "/");
}

function isTemplatePathMatch(pattern: string, path: string): boolean {
  return path === pattern || path.startsWith(`${pattern}/`);
}

function collectOwnershipFromManifest(manifest: RawManifest | null): OwnershipCounts {
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

function collectOwnershipForTargets(manifest: RawManifest | null, targetPaths: UpdateFilePath[]): Record<UpdateFilePath, ManagedOwnership> {
  const ownership: Record<string, ManagedOwnership> = {};
  const rawOwnership = manifest?.ownership;

  if (!rawOwnership || typeof rawOwnership !== "object" || Array.isArray(rawOwnership)) {
    return Object.fromEntries(targetPaths.map((path) => [path, "managed"])) as Record<UpdateFilePath, ManagedOwnership>;
  }

  for (const targetPath of targetPaths) {
    const normalizedTarget = normalizeManifestPath(targetPath);
    let owner: ManagedOwnership | undefined;
    for (const [rawOwner, rawPaths] of Object.entries(rawOwnership)) {
      if (!isManagedOwnership(rawOwner) || !Array.isArray(rawPaths)) {
        continue;
      }
      for (const rawPath of rawPaths) {
        if (typeof rawPath !== "string") {
          continue;
        }
        const normalizedPath = normalizeManifestPath(rawPath);
        if (isTemplatePathMatch(normalizedPath, normalizedTarget) || isTemplatePathMatch(normalizedTarget, normalizedPath)) {
          owner = rawOwner;
          break;
        }
      }
      if (owner !== undefined) {
        break;
      }
    }
    ownership[targetPath] = owner ?? "managed";
  }

  return ownership as Record<UpdateFilePath, ManagedOwnership>;
}

function collectManagedHashes(lockManifest: RawManifest | null): Record<string, string> {
  const hashes: Record<string, string> = {};
  const managedHashes = lockManifest?.managed_hashes;
  if (!managedHashes || typeof managedHashes !== "object" || Array.isArray(managedHashes)) {
    return hashes;
  }
  for (const [rawPath, rawHash] of Object.entries(managedHashes)) {
    if (typeof rawHash === "string" && rawHash.trim().length > 0) {
      const normalized = normalizeManifestPath(rawPath);
      hashes[normalized] = rawHash;
    }
  }
  return hashes;
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
  if (!source || !current || typeof source !== "object" || typeof current !== "object" || Array.isArray(source) || Array.isArray(current)) {
    return true;
  }

  const allowedMutable = new Set(["project", "revision"]);
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

function hasUnsafeManifestEdits(sourceText: string, currentText: string): boolean {
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
  if (!source || !current || typeof source !== "object" || typeof current !== "object" || Array.isArray(source) || Array.isArray(current)) {
    return true;
  }

  const sourceCommands = source.commands;
  const currentCommands = current.commands;
  if (sourceCommands === undefined && currentCommands === undefined) {
    return false;
  }
  if (!sourceCommands || !currentCommands || typeof sourceCommands !== "object" || typeof currentCommands !== "object" || Array.isArray(sourceCommands) || Array.isArray(currentCommands)) {
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
      for (const [commandName, commandValue] of Object.entries(currentCommands)) {
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

function safeManagedContent(path: UpdateFilePath, currentText: string, sourceText: string): string {
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
    if (!source || typeof source !== "object" || Array.isArray(source) || !current || typeof current !== "object" || Array.isArray(current)) {
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
  sourceManifest: RawManifest | null,
  sourceLock: RawManifest | null,
  sourceLockContent: string,
  sourceManifestContent: string,
  currentLockContent: string,
  currentManifestContent: string,
): UpdateOperation[] {
  const operations: UpdateOperation[] = [];
  const managedHashes = collectManagedHashes(sourceLock);
  const ownership = collectOwnershipForTargets(sourceManifest, UPDATE_TARGETS);

  const entries = [
    {
      path: ".agents/lock.json" as UpdateFilePath,
      sourceContent: sourceLockContent,
      currentContent: currentLockContent,
      hasConflict: (source: string, current: string): boolean => hasUnsafeLockEdits(source, current),
      managedReason: "revision changed",
      defaultReason: "revision changed",
    },
    {
      path: ".agents/manifest.json" as UpdateFilePath,
      sourceContent: sourceManifestContent,
      currentContent: currentManifestContent,
      hasConflict: (source: string, current: string): boolean => hasUnsafeManifestEdits(source, current),
      managedReason: "manifest commands changed",
      defaultReason: "manifest commands changed",
    },
  ];

  for (const entry of entries) {
    const owner = ownership[entry.path];
    if (entry.sourceContent.length === 0) {
      continue;
    }

    if (entry.currentContent.length === 0) {
      if (owner === "project-owned" || owner === "ignored") {
        operations.push({
          kind: "preserve-project-owned",
          path: entry.path,
          owner,
          reason: owner === "project-owned" ? "manifest-owner-project-owned-missing" : "manifest-owner-ignored-missing",
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

    const managedHash = managedHashes[entry.path];
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

    if (managedHash === undefined && entry.hasConflict(entry.sourceContent, entry.currentContent)) {
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
        nextContent: safeManagedContent(entry.path, entry.currentContent, entry.sourceContent),
        diff: buildPatch(entry.path, entry.currentContent, safeManagedContent(entry.path, entry.currentContent, entry.sourceContent)),
      });
      continue;
    }

    if (managedHash === undefined) {
      operations.push({
        kind: "update-managed",
        path: entry.path,
        owner,
        reason: entry.defaultReason,
        nextContent: safeManagedContent(entry.path, entry.currentContent, entry.sourceContent),
        diff: buildPatch(entry.path, entry.currentContent, safeManagedContent(entry.path, entry.currentContent, entry.sourceContent)),
      });
    }
  }

  return operations;
}

function serializeOwnership(counts: OwnershipCounts): string {
  return MANAGED_OWNERSHIP.map((owner) => `${owner}:${counts[owner]}`).join(", ");
}

export function checkTemplateUpdate(projectRoot: string): UpdateCheckResult {
  const currentLockPath = join(projectRoot, ".agents", "lock.json");
  const currentManifestPath = join(projectRoot, ".agents", "manifest.json");
  const sourceLockPath = join(projectRoot, "src", "project-template", ".agents", "lock.json");
  const sourceManifestPath = join(projectRoot, "src", "project-template", ".agents", "manifest.json");

  const currentLock = readJsonFile(currentLockPath);
  const currentManifest = readJsonFile(currentManifestPath);
  const sourceLock = readJsonFile(sourceLockPath);
  const sourceManifest = readJsonFile(sourceManifestPath);

  const currentLockContent = readText(currentLockPath);
  const sourceLockContent = readText(sourceLockPath);
  const currentManifestContent = readText(currentManifestPath);
  const sourceManifestContent = readText(sourceManifestPath);

  const operations = planUpdateOperations(
    sourceManifest,
    sourceLock,
    sourceLockContent,
    sourceManifestContent,
    currentLockContent,
    currentManifestContent,
  );

  const hasSource = sourceLockContent.length > 0 || sourceManifestContent.length > 0;
  const currentRevision = revisionOf(currentLock);
  const sourceRevision = revisionOf(sourceLock);
  const ownershipCurrent = collectOwnershipFromManifest(currentManifest);
  const ownershipSource = collectOwnershipFromManifest(sourceManifest);
  const changes = makeSummaryChanges(currentManifest, sourceManifest, currentLock, sourceLock);
  const filePreviews = buildFilePreviews(operations);

  return {
    hasSource,
    currentRevision,
    sourceRevision,
    upToDate: hasSource && operations.every((operation) => operation.kind === "skip-identical"),
    changes,
    ownershipSource,
    ownershipCurrent,
    filePreviews,
    operations,
  };
}

export function formatUpdateCheck(result: UpdateCheckResult, mode: UpdateMode): string {
  const lines: string[] = [
    `update ${mode}: ${result.upToDate ? "up-to-date" : result.hasSource ? "changes available" : "no-source"}`,
    `current revision: ${result.currentRevision}`,
    `source revision: ${result.sourceRevision}`,
    `ownership(current): ${serializeOwnership(result.ownershipCurrent)}`,
    `ownership(source): ${serializeOwnership(result.ownershipSource)}`,
  ];

  if (result.changes.length > 0) {
    const label = mode === "preview" ? "preview operations:" : mode === "apply" ? "apply operations:" : "changes:";
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
