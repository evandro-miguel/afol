import { createPatch } from "diff";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ManagedOwnership } from "../bootstrap/planner";

type UpdateMode = "check" | "preview";

export type OwnershipCounts = Record<ManagedOwnership, number>;

export type UpdateFilePreview = {
  path: string;
  owner: ManagedOwnership;
  reason: string;
  diff: string;
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
};

const managedOwnership: ReadonlyArray<ManagedOwnership> = [
  "managed",
  "project-owned",
  "generated",
  "ignored",
  "conflict",
];

function zeroOwnershipCounts(): OwnershipCounts {
  return {
    managed: 0,
    "project-owned": 0,
    generated: 0,
    ignored: 0,
    conflict: 0,
  };
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function revisionOf(value: Record<string, unknown> | null): string {
  return typeof value?.revision === "string" ? value.revision : "unknown";
}

function commandsOf(value: Record<string, unknown> | null): string[] {
  const raw = value?.commands;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).sort();
}

function diffCommands(current: string[], source: string[]): string[] {
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

function isManagedOwnership(value: unknown): value is ManagedOwnership {
  return typeof value === "string" && managedOwnership.includes(value as ManagedOwnership);
}

function collectOwnershipFromManifest(value: Record<string, unknown> | null): OwnershipCounts {
  const counts = zeroOwnershipCounts();
  const raw = value?.ownership;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return counts;
  }

  for (const [rawOwner, rawPaths] of Object.entries(raw)) {
    if (!isManagedOwnership(rawOwner) || !Array.isArray(rawPaths)) {
      continue;
    }
    for (const rawPath of rawPaths) {
      if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
        continue;
      }
      counts[rawOwner] += 1;
    }
  }
  return counts;
}

function serializeOwnership(counts: OwnershipCounts): string {
  return managedOwnership.map((owner) => `${owner}:${counts[owner]}`).join(", ");
}

function makePatch(path: string, current: string, source: string): string {
  return createPatch(path, current, source, "current", "template");
}

export function checkTemplateUpdate(projectRoot: string): UpdateCheckResult {
  const currentLock = readJson(join(projectRoot, ".agents", "lock.json"));
  const currentManifest = readJson(join(projectRoot, ".agents", "manifest.json"));
  const sourceLock = readJson(join(projectRoot, "src", "project-template", ".agents", "lock.json"));
  const sourceManifest = readJson(join(projectRoot, "src", "project-template", ".agents", "manifest.json"));
  const hasSource = sourceLock !== null || sourceManifest !== null;

  const currentRevision = revisionOf(currentLock);
  const sourceRevision = revisionOf(sourceLock);
  const changes: string[] = [];
  const filePreviews: UpdateFilePreview[] = [];

  if (!hasSource) {
    changes.push("no local template source found");
  }

  const currentOwnership = collectOwnershipFromManifest(currentManifest);
  const sourceOwnership = collectOwnershipFromManifest(sourceManifest);
  const ownershipCurrent = currentOwnership;
  const ownershipSource = sourceOwnership;

  if (hasSource && currentRevision !== sourceRevision) {
    changes.push(`revision ${currentRevision} -> ${sourceRevision}`);
    filePreviews.push({
      path: ".agents/lock.json",
      owner: "managed",
      reason: "revision changed",
      diff: makePatch(
        ".agents/lock.json",
        readText(join(projectRoot, ".agents", "lock.json")),
        readText(join(projectRoot, "src", "project-template", ".agents", "lock.json")),
      ),
    });
  }

  if (sourceManifest !== null) {
    const diff = diffCommands(commandsOf(currentManifest), commandsOf(sourceManifest));
    changes.push(...diff);
    if (diff.length > 0) {
      filePreviews.push({
        path: ".agents/manifest.json",
        owner: "managed",
        reason: "manifest commands changed",
        diff: makePatch(
          ".agents/manifest.json",
          readText(join(projectRoot, ".agents", "manifest.json")),
          readText(join(projectRoot, "src", "project-template", ".agents", "manifest.json")),
        ),
      });
    }
  }

  return {
    hasSource,
    currentRevision,
    sourceRevision,
    upToDate: hasSource && changes.length === 0,
    changes,
    ownershipSource,
    ownershipCurrent,
    filePreviews,
  };
}

export function formatUpdateCheck(result: UpdateCheckResult, mode: UpdateMode): string {
  const lines = [
    `update ${mode}: ${result.upToDate ? "up-to-date" : result.hasSource ? "changes available" : "no-source"}`,
    `current revision: ${result.currentRevision}`,
    `source revision: ${result.sourceRevision}`,
    `ownership(current): ${serializeOwnership(result.ownershipCurrent)}`,
    `ownership(source): ${serializeOwnership(result.ownershipSource)}`,
  ];
  if (result.changes.length > 0) {
    lines.push(mode === "preview" ? "preview operations:" : "changes:");
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

  return `${lines.join("\n")}\n`;
}
