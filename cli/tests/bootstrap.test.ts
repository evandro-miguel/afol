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

describe("bootstrap planner ownership policy", () => {
  test("plans create/skip-identical/update-managed/preserve-project-owned", () => {
    const managedCurrent = "managed-old";
    const templateFiles = templateFileMap({
      "new-file.md": "new-content",
      "same-file.md": "same-content",
      "managed-file.md": "managed-new",
      "project-owned.md": "template-new",
      "generated-lock.json": "{\"v\":2}",
      "generated-missing.lock": "generated-fresh",
    });

    const plan = planBootstrapOperations({
      templateFiles,
      currentFiles: {
        "same-file.md": "same-content",
        "managed-file.md": managedCurrent,
        "project-owned.md": "custom-project-content",
        "generated-lock.json": "{\"v\":1}",
      },
      manifest: {
        "managed-file.md": { owner: "managed", hash: sha256Hex(managedCurrent) },
        "project-owned.md": { owner: "project-owned", hash: sha256Hex("custom-project-content") },
        "generated-lock.json": { owner: "generated", hash: sha256Hex("{\"v\":0}") },
        "generated-missing.lock": { owner: "generated", hash: sha256Hex("generated-old") },
      },
    });

    const kindByPath = new Map(plan.operations.map((operation) => [operation.path, operation.kind]));
    expect(kindByPath.get("new-file.md")).toBe("create");
    expect(kindByPath.get("same-file.md")).toBe("skip-identical");
    expect(kindByPath.get("managed-file.md")).toBe("update-managed");
    expect(kindByPath.get("project-owned.md")).toBe("preserve-project-owned");
    expect(kindByPath.get("generated-lock.json")).toBe("update-managed");
    expect(kindByPath.get("generated-missing.lock")).toBe("create");
  });
});
