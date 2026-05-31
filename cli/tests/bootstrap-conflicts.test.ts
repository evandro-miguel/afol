import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { TemplateFileMap } from "../services/template/payload";
import { planBootstrapOperations } from "../services/bootstrap/planner";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function templateFileMap(entries: Record<string, string>): TemplateFileMap {
  const files: TemplateFileMap = {};
  for (const [path, content] of Object.entries(entries)) {
    files[path] = {
      path,
      contentBase64: Buffer.from(content, "utf8").toString("base64"),
      sha256: sha256Hex(content),
      bytes: Buffer.byteLength(content),
    };
  }
  return files;
}

describe("bootstrap planner conflict handling", () => {
  test("marks conflict when managed file drifted from manifest hash", () => {
    const templateFiles = templateFileMap({
      "managed-drift.md": "template-new",
    });
    const plan = planBootstrapOperations({
      templateFiles,
      currentFiles: {
        "managed-drift.md": "user-edited",
      },
      manifest: {
        "managed-drift.md": { owner: "managed", hash: sha256Hex("managed-old") },
      },
    });

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.kind).toBe("conflict");
    expect(plan.operations[0]?.owner).toBe("conflict");
    expect(plan.operations[0]?.diffPreview?.length).toBeGreaterThan(0);
    expect(plan.operations[0]?.diffPreview).toContain("@@");
  });

  test("marks conflict when ownership is unknown and content differs", () => {
    const templateFiles = templateFileMap({
      "unknown-owner.md": "template-v2",
    });
    const plan = planBootstrapOperations({
      templateFiles,
      currentFiles: {
        "unknown-owner.md": "project-version",
      },
      manifest: {},
    });

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.kind).toBe("conflict");
    expect(plan.operations[0]?.owner).toBe("conflict");
    expect(plan.operations[0]?.diffPreview?.length).toBeGreaterThan(0);
    expect(plan.operations[0]?.diffPreview).toContain("@@");
  });

  test("filters forbidden paths even if input map is contaminated", () => {
    const templateFiles = templateFileMap({
      ".agents/runtime/server.py": "print('x')",
      "docs/standards/policy.md": "x",
      "safe/readme.md": "ok",
    });
    const plan = planBootstrapOperations({
      templateFiles,
      currentFiles: {},
      manifest: {},
    });

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.path).toBe("safe/readme.md");
    expect(plan.filteredForbiddenCount).toBe(2);
  });
});
