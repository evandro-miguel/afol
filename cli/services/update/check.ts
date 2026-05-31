import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type UpdateCheckResult = {
  hasSource: boolean;
  currentRevision: string;
  sourceRevision: string;
  upToDate: boolean;
  changes: string[];
};

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
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

export function checkTemplateUpdate(projectRoot: string): UpdateCheckResult {
  const currentLock = readJson(join(projectRoot, ".agents", "lock.json"));
  const currentManifest = readJson(join(projectRoot, ".agents", "manifest.json"));
  const sourceLock = readJson(join(projectRoot, "src", "project-template", ".agents", "lock.json"));
  const sourceManifest = readJson(join(projectRoot, "src", "project-template", ".agents", "manifest.json"));
  const hasSource = sourceLock !== null || sourceManifest !== null;

  const currentRevision = revisionOf(currentLock);
  const sourceRevision = revisionOf(sourceLock);
  const changes: string[] = [];
  if (!hasSource) {
    changes.push("no local template source found");
  }
  if (hasSource && currentRevision !== sourceRevision) {
    changes.push(`revision ${currentRevision} -> ${sourceRevision}`);
  }
  if (sourceManifest !== null) {
    changes.push(...diffCommands(commandsOf(currentManifest), commandsOf(sourceManifest)));
  }

  return {
    hasSource,
    currentRevision,
    sourceRevision,
    upToDate: hasSource && changes.length === 0,
    changes,
  };
}

export function formatUpdateCheck(result: UpdateCheckResult, mode: "check" | "preview"): string {
  const lines = [
    `update ${mode}: ${result.upToDate ? "up-to-date" : result.hasSource ? "changes available" : "no-source"}`,
    `current revision: ${result.currentRevision}`,
    `source revision: ${result.sourceRevision}`,
  ];
  if (result.changes.length > 0) {
    lines.push(mode === "preview" ? "preview operations:" : "changes:");
    for (const change of result.changes) {
      lines.push(`- ${change}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
