import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";
import type { BootstrapManifestEntry } from "../services/bootstrap/planner";
import { planBootstrapOperations } from "../services/bootstrap/planner";

type BootstrapArgs = {
  targetRoot: string;
  dryRun: boolean;
  forceManaged: boolean;
};

function parseBootstrapArgs(args: string[]): BootstrapArgs {
  let targetRoot = "";
  let dryRun = false;
  let forceManaged = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
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

function loadManifest(targetRoot: string): Record<string, BootstrapManifestEntry> {
  const manifestPath = join(targetRoot, ".agents", "manifest.json");
  if (!existsSync(manifestPath)) {
    return {};
  }

  const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const managedHashes = raw.managed_hashes;
  if (!managedHashes || typeof managedHashes !== "object" || Array.isArray(managedHashes)) {
    return {};
  }

  const manifest: Record<string, BootstrapManifestEntry> = {};
  for (const [path, hash] of Object.entries(managedHashes)) {
    if (typeof hash === "string") {
      manifest[`.agents/${path}`] = { owner: "managed", hash };
    }
  }
  return manifest;
}

async function writeTemplateFile(targetRoot: string, path: string): Promise<void> {
  const entry = DEFAULT_TEMPLATE_FILES[path];
  if (!entry) {
    throw new Error(`Missing generated template entry: ${path}`);
  }
  const absolutePath = join(targetRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  await Bun.write(absolutePath, Buffer.from(entry.contentBase64, "base64"));
  if (path === "a" || path === "afol") {
    chmodSync(absolutePath, 0o755);
  }
}

export async function runBootstrapCommand(args: string[]): Promise<number> {
  let parsed: BootstrapArgs;
  try {
    parsed = parseBootstrapArgs(args);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  const currentFiles = readTargetFiles(parsed.targetRoot);
  const manifest = loadManifest(parsed.targetRoot);
  const plan = planBootstrapOperations({
    templateFiles: DEFAULT_TEMPLATE_FILES,
    currentFiles,
    manifest,
  });

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
    ].join(" "),
  );

  for (const operation of plan.operations) {
    console.log(`${operation.kind} ${operation.path} ${operation.reason}`);
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
  if (parsed.forceManaged) {
    for (const operation of conflicts) {
      await writeTemplateFile(parsed.targetRoot, operation.path);
    }
  }

  return 0;
}
