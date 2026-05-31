import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Result } from "../../core/result";
import { err, ok } from "../../core/result";
import { loadJsonObject, loadYamlObject, type SchemaObject } from "../../core/schema";

const PROJECT_CONFIG_CANDIDATES = ["config.json", "agents.config"] as const;

export type LoadedProjectRoot = {
  root: string;
  configPath: string;
  config: SchemaObject;
  lock: SchemaObject;
  manifest?: SchemaObject;
};

export type ProjectPath = {
  path: string;
  relativePath: string;
};

function pathIsInsideRoot(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function findProjectRoot(startPath: string): { root: string; configPath: string } | null {
  let current = resolve(startPath);
  while (true) {
    for (const configName of PROJECT_CONFIG_CANDIDATES) {
      const configPath = join(current, ".agents", configName);
      if (existsSync(configPath)) {
        return { root: current, configPath };
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function loadProjectConfig(path: string): Result<SchemaObject, string> {
  if (path.endsWith("agents.config")) {
    return loadYamlObject(path);
  }
  return loadJsonObject(path);
}

export function loadProjectRoot(startPath: string): Result<LoadedProjectRoot, { code: number; message: string }> {
  const found = findProjectRoot(startPath);
  if (!found) {
    return err({
      code: 3,
      message: "❌ Could not detect project root: .agents/config.json or .agents/agents.config not found.",
    });
  }

  const configResult = loadProjectConfig(found.configPath);
  if (!configResult.ok) {
    return err({ code: 2, message: configResult.error });
  }

  const lockPath = join(found.root, ".agents", "lock.json");
  const lockResult = loadJsonObject(lockPath);
  if (!lockResult.ok) {
    return err({ code: 2, message: lockResult.error });
  }

  const manifestPath = join(found.root, ".agents", "manifest.json");
  let manifest: SchemaObject | undefined;
  if (existsSync(manifestPath)) {
    const manifestResult = loadJsonObject(manifestPath);
    if (!manifestResult.ok) {
      return err({ code: 2, message: manifestResult.error });
    }
    manifest = manifestResult.value;
  }

  const loaded = {
    root: found.root,
    configPath: found.configPath,
    config: configResult.value,
    lock: lockResult.value,
  };

  return ok(manifest === undefined ? loaded : { ...loaded, manifest });
}

export function resolveProjectPath(projectRoot: string, targetPath: string): Result<ProjectPath, string> {
  const root = realpathSync(projectRoot);

  if (isAbsolute(targetPath)) {
    return err(`Path escapes project root: ${targetPath}`);
  }

  let candidate = root;
  for (const rawPart of targetPath.split(/[\\/]+/).filter((part) => part.length > 0)) {
    if (rawPart === ".") {
      continue;
    }
    if (rawPart === "..") {
      candidate = dirname(candidate);
      if (!pathIsInsideRoot(root, candidate)) {
        return err(`Path escapes project root: ${targetPath}`);
      }
      continue;
    }

    const next = join(candidate, rawPart);
    if (existsSync(next)) {
      const realNext = realpathSync(next);
      if (!pathIsInsideRoot(root, realNext)) {
        return err(`Path crosses symlink outside project root: ${targetPath}`);
      }
    }
    candidate = next;
  }

  candidate = resolve(root, targetPath);
  if (!pathIsInsideRoot(root, candidate)) {
    return err(`Path escapes project root: ${targetPath}`);
  }

  return ok({
    path: candidate,
    relativePath: relative(root, candidate).split(sep).join("/"),
  });
}
