import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveProjectPaths, type ResolvedProjectPaths } from "../project/paths";

type RawRule = {
  id?: unknown;
  name?: unknown;
  path?: unknown;
  surfaces?: unknown;
  work_types?: unknown;
  priority?: unknown;
};

export type RuleEntry = {
  id: string;
  name: string;
  path: string;
  surfaces: string[];
  workTypes: string[];
  priority: number;
};

function normalizeTextList(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim().toLowerCase()] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean))].sort();
}

function normalizeRule(raw: RawRule, rulesDir: string): RuleEntry | null {
  const id = typeof raw.id === "string" ? raw.id.trim().toUpperCase() : "";
  if (!id) {
    return null;
  }
  const rawPath = typeof raw.path === "string" ? raw.path.trim() : `${id}.md`;
  const path = rawPath.startsWith(`${rulesDir}/`) ? rawPath : `${rulesDir}/${rawPath}`;
  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id.toLowerCase(),
    path,
    surfaces: normalizeTextList(raw.surfaces),
    workTypes: normalizeTextList(raw.work_types),
    priority: typeof raw.priority === "number" ? raw.priority : 50,
  };
}

function fallbackRules(projectPaths: ResolvedProjectPaths): RuleEntry[] {
  const rulesRoot = projectPaths.abs.rulesDir;
  if (!existsSync(rulesRoot)) {
    return [];
  }
  return readdirSync(rulesRoot)
    .filter((name) => /^RULE-\d+.*\.md$/.test(name))
    .sort()
    .map((name) => {
      const id = name.match(/^(RULE-\d+)/)?.[1] ?? name.replace(/\.md$/, "").toUpperCase();
      return {
        id,
        name: name.replace(/\.md$/, "").toLowerCase(),
        path: `${projectPaths.rulesDir}/${name}`,
        surfaces: [],
        workTypes: [],
        priority: 50,
      };
    });
}

export function listRules(projectRoot: string): RuleEntry[] {
  const projectPaths = resolveProjectPaths(projectRoot);
  const indexPath = join(projectPaths.abs.rulesDir, "index.json");
  if (!existsSync(indexPath)) {
    return fallbackRules(projectPaths);
  }
  const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as { rules?: RawRule[] } | RawRule[];
  const rawRules = Array.isArray(parsed) ? parsed : parsed.rules;
  if (!Array.isArray(rawRules)) {
    return fallbackRules(projectPaths);
  }
  return rawRules
    .map((raw) => normalizeRule(raw, projectPaths.rulesDir))
    .filter((entry): entry is RuleEntry => entry !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function findRule(projectRoot: string, identifier: string): RuleEntry | null {
  const needle = identifier.trim().toLowerCase();
  if (!needle) {
    return null;
  }
  return listRules(projectRoot).find((rule) => rule.id.toLowerCase() === needle || rule.name.toLowerCase() === needle) ?? null;
}

export function resolveRules(
  projectRoot: string,
  options: { surfaces: string[]; workType: string },
): RuleEntry[] {
  const wantedSurfaces = new Set(options.surfaces.map((surface) => surface.trim().toLowerCase()).filter(Boolean));
  const workType = options.workType.trim().toLowerCase() || "delivery";
  return listRules(projectRoot)
    .filter((rule) => {
      const workMatch = rule.workTypes.length === 0 || rule.workTypes.includes(workType) || rule.workTypes.includes("all");
      if (!workMatch) {
        return false;
      }
      if (wantedSurfaces.size === 0 || rule.surfaces.length === 0) {
        return true;
      }
      return rule.surfaces.some((surface) => wantedSurfaces.has(surface));
    })
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
