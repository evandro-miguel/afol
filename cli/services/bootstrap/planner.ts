import { createHash } from "node:crypto";
import { matchesTemplateForbiddenPattern } from "../../schemas/template-policy";
import type { TemplateFileMap } from "../template/payload";

export type ManagedOwnership = "managed" | "project-owned" | "generated";

export type BootstrapManifestEntry = {
  owner: ManagedOwnership;
  hash: string;
};

export type BootstrapOperationKind =
  | "create"
  | "skip-identical"
  | "update-managed"
  | "preserve-project-owned"
  | "conflict";

export type BootstrapOperation = {
  kind: BootstrapOperationKind;
  path: string;
  reason: string;
};

export type BootstrapPlanInput = {
  templateFiles: TemplateFileMap;
  currentFiles: Record<string, string>;
  manifest: Record<string, BootstrapManifestEntry>;
};

export type BootstrapPlan = {
  operations: BootstrapOperation[];
  filteredForbiddenCount: number;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function planBootstrapOperations(input: BootstrapPlanInput): BootstrapPlan {
  const operations: BootstrapOperation[] = [];
  const templatePaths = Object.keys(input.templateFiles).sort();
  let filteredForbiddenCount = 0;

  for (const path of templatePaths) {
    if (matchesTemplateForbiddenPattern(path)) {
      filteredForbiddenCount += 1;
      continue;
    }

    const templateEntry = input.templateFiles[path];
    if (!templateEntry) {
      continue;
    }
    const currentContent = input.currentFiles[path];
    const manifestEntry = input.manifest[path];

    if (typeof currentContent !== "string") {
      operations.push({
        kind: "create",
        path,
        reason: "missing-target-file",
      });
      continue;
    }

    const currentHash = sha256Hex(currentContent);
    if (currentHash === templateEntry.sha256) {
      operations.push({
        kind: "skip-identical",
        path,
        reason: "same-content-hash",
      });
      continue;
    }

    if (manifestEntry?.owner === "project-owned") {
      operations.push({
        kind: "preserve-project-owned",
        path,
        reason: "manifest-owner-project-owned",
      });
      continue;
    }

    if (manifestEntry?.owner === "generated") {
      operations.push({
        kind: "update-managed",
        path,
        reason: "manifest-owner-generated",
      });
      continue;
    }

    if (manifestEntry?.owner === "managed" && manifestEntry.hash === currentHash) {
      operations.push({
        kind: "update-managed",
        path,
        reason: "managed-hash-matches-manifest",
      });
      continue;
    }

    operations.push({
      kind: "conflict",
      path,
      reason: "local-drift-or-unknown-ownership",
    });
  }

  return {
    operations,
    filteredForbiddenCount,
  };
}
