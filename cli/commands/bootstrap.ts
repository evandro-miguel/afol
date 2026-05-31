import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";
import type { BootstrapManifestEntry, ManagedOwnership } from "../services/bootstrap/planner";
import { cleanupBootstrapObsolete, planBootstrapCleanup } from "../services/bootstrap/cleanup";
import { planBootstrapOperations } from "../services/bootstrap/planner";

type BootstrapArgs = {
  targetRoot: string;
  dryRun: boolean;
  forceManaged: boolean;
  cleanupObsolete: boolean;
};

type RawManifest = Record<string, unknown>;

function parseBootstrapArgs(args: string[]): BootstrapArgs {
  let targetRoot = "";
  let dryRun = false;
  let forceManaged = false;
  let cleanupObsolete = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--cleanup-obsolete") {
      cleanupObsolete = true;
      continue;
    }
    if (arg === "--force-managed") {
      forceManaged = true;
      continue;
    }
    if (arg === "--partial") {
      continue;
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

  return {
    targetRoot: resolve(targetRoot),
    dryRun,
    forceManaged,
    cleanupObsolete,
  };
}

function readTargetFiles(targetRoot: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const path of Object.keys(DEFAULT_TEMPLATE_FILES)) {
    const absolutePath = join(targetRoot, path);
    if (existsSync(absolutePath)) {
      files[path] = readFileSync(absolutePath, "utf8");
    }
  }
  return files;
}

function normalizeManifestPath(path: string): string {
  const cleaned = path.trim().replace(/^[.\\/]+/, "").replace(/\\+/g, "/");
  return cleaned;
}

function isTemplatePathMatch(pattern: string, path: string): boolean {
  return path === pattern || path.startsWith(`${pattern}/`);
}

function hasOwnershipOwner(value: unknown): value is ManagedOwnership {
  return value === "managed" || value === "project-owned" || value === "generated" || value === "ignored" || value === "conflict";
}

function loadManifest(targetRoot: string, templatePaths: string[]): Record<string, BootstrapManifestEntry> {
  const manifestPath = join(targetRoot, ".agents", "manifest.json");
  if (!existsSync(manifestPath)) {
    return {};
  }

  const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as RawManifest;
  const manifest: Record<string, BootstrapManifestEntry> = {};
  const templatePathSet = new Set(templatePaths);

  const managedHashes = raw.managed_hashes;
  if (managedHashes !== undefined && managedHashes !== null && typeof managedHashes === "object" && !Array.isArray(managedHashes)) {
    for (const [path, hash] of Object.entries(managedHashes)) {
      if (typeof hash === "string") {
        const normalized = normalizeManifestPath(path);
        if (!normalized || !templatePathSet.has(normalized)) {
          continue;
        }
        manifest[normalized] = { owner: "managed", hash };
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
      const normalized = normalizeManifestPath(rawPath);
      for (const templatePath of templatePaths) {
        if (!isTemplatePathMatch(normalized, templatePath)) {
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

function loadBootstrapManifest(targetRoot: string, templatePaths: string[]): Record<string, BootstrapManifestEntry> {
  return loadManifest(targetRoot, templatePaths);
}

function writeTemplateFile(
  targetRoot: string,
  path: string,
): Promise<void> {
  const entry = DEFAULT_TEMPLATE_FILES[path];
  if (!entry) {
    throw new Error(`Missing generated template entry: ${path}`);
  }
  const absolutePath = join(targetRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return Bun.write(absolutePath, Buffer.from(entry.contentBase64, "base64")).then(() => {
    if (path === "a" || path === "afol") {
      chmodSync(absolutePath, 0o755);
    }
  });
}

export async function runBootstrapCommand(args: string[]): Promise<number> {
  let parsed: BootstrapArgs;
  try {
    parsed = parseBootstrapArgs(args);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  const templatePaths = Object.keys(DEFAULT_TEMPLATE_FILES).sort();
  const currentFiles = readTargetFiles(parsed.targetRoot);
  const manifest = loadBootstrapManifest(parsed.targetRoot, templatePaths);
  const plan = planBootstrapOperations({
    templateFiles: DEFAULT_TEMPLATE_FILES,
    currentFiles,
    manifest,
  });
  const cleanupPlan = planBootstrapCleanup(parsed.targetRoot);

  const conflicts = plan.operations.filter((operation) => operation.kind === "conflict");
  const writable = plan.operations.filter((operation) =>
    operation.kind === "create" || operation.kind === "update-managed",
  );

  console.log(
    [
      `bootstrap: target=${parsed.targetRoot}`,
      `mode=${parsed.dryRun ? "dry-run" : "apply"}`,
      `files=${Object.keys(DEFAULT_TEMPLATE_FILES).length}`,
      `operations=${plan.operations.length}`,
      `conflicts=${conflicts.length}`,
      `cleanup=${cleanupPlan.candidates.length}`,
    ].join(" "),
  );

  for (const operation of plan.operations) {
    console.log(`${operation.kind} ${operation.path} ${operation.reason}`);
  }
  for (const candidate of cleanupPlan.candidates) {
    console.log(`cleanup-pending ${candidate.path} ${candidate.reason}`);
  }

  if (parsed.dryRun) {
    return conflicts.length > 0 ? 4 : 0;
  }

  if (conflicts.length > 0 && !parsed.forceManaged) {
    console.error("Bootstrap has conflicts. Re-run with --force-managed to overwrite managed files.");
    return 4;
  }

  for (const operation of writable) {
    await writeTemplateFile(parsed.targetRoot, operation.path);
  }
  if (parsed.cleanupObsolete && cleanupPlan.candidates.length > 0) {
    cleanupBootstrapObsolete(parsed.targetRoot, cleanupPlan.candidates);
    for (const candidate of cleanupPlan.candidates) {
      console.log(`cleanup-removed ${candidate.path} ${candidate.reason}`);
    }
  }
  if (parsed.forceManaged) {
    for (const operation of conflicts) {
      await writeTemplateFile(parsed.targetRoot, operation.path);
    }
  }

  return 0;
}
