import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TemplateFileMap } from "../services/template/payload";
import { planBootstrapOperations } from "../services/bootstrap/planner";
import { runBootstrapCommand } from "../commands/bootstrap";

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

describe("bootstrap provider-compatible mutable state", () => {
  test("writes mutable state baseline under .afol and configures paths", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-"));
    try {
      const exitCode = await runBootstrapCommand([target, "--provider-compatible"]);

      expect(exitCode).toBe(0);
      expect(existsSync(join(target, ".agents", "config.json"))).toBe(true);
      expect(existsSync(join(target, ".agents", "rules", "index.json"))).toBe(true);
      expect(existsSync(join(target, ".agents", "skills"))).toBe(false);
      expect(existsSync(join(target, ".agents", "wb"))).toBe(false);
      expect(existsSync(join(target, ".agents", "tmp"))).toBe(false);
      expect(existsSync(join(target, ".agents", "data"))).toBe(false);
      expect(existsSync(join(target, ".afol", "skills", "README.md"))).toBe(true);
      expect(existsSync(join(target, ".afol", "wb", "README.md"))).toBe(true);
      expect(existsSync(join(target, ".afol", "tmp", "README.md"))).toBe(true);
      expect(existsSync(join(target, ".afol", "data", "README.md"))).toBe(true);
      expect(existsSync(join(target, ".afol", "data", "events", "README.md"))).toBe(true);
      expect(existsSync(join(target, ".afol", "data", "index", "README.md"))).toBe(true);

      const config = JSON.parse(readFileSync(join(target, ".agents", "config.json"), "utf8")) as {
        paths: Record<string, string>;
        skills_sync: Record<string, string>;
      };
      expect(config.paths.agents_dir).toBe(".agents");
      expect(config.paths.mutable_dir).toBe(".afol");
      expect(config.paths.wb_dir).toBe(".afol/wb");
      expect(config.paths.skills_dir).toBe(".afol/skills");
      expect(config.paths.tmp_dir).toBe(".afol/tmp");
      expect(config.paths.data_dir).toBe(".afol/data");
      expect(config.paths.events_file).toBe(".afol/data/events/events.jsonl");
      expect(config.paths.data_index_dir).toBe(".afol/data/index");
      expect(config.paths.mutations_dir).toBe(".afol/data/mutations");
      expect(config.skills_sync.project_dir).toBe(".afol/skills");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("is idempotent after provider-compatible config transform", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-idempotent-"));
    try {
      expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(0);
      expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(0);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("does not overwrite existing mutable baselines with force-managed", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-baseline-"));
    try {
      expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(0);
      const wbReadme = join(target, ".afol", "wb", "README.md");
      const edited = "custom downstream workbench notes\n";
      writeFileSync(wbReadme, edited, "utf8");

      expect(await runBootstrapCommand([target, "--provider-compatible", "--force-managed"])).toBe(0);
      expect(readFileSync(wbReadme, "utf8")).toBe(edited);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("provider-compatible removes legacy mutable roots from .agents target", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-cleanup-"));
    try {
      for (const relativePath of [
        ".agents/skills/custom.md",
        ".agents/wb/session/task.md",
        ".agents/tmp/scratch.txt",
        ".agents/data/events/events.jsonl",
      ]) {
        const absolutePath = join(target, relativePath);
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, "legacy mutable\n", "utf8");
      }

      expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(0);

      expect(existsSync(join(target, ".agents", "skills"))).toBe(false);
      expect(existsSync(join(target, ".agents", "wb"))).toBe(false);
      expect(existsSync(join(target, ".agents", "tmp"))).toBe(false);
      expect(existsSync(join(target, ".agents", "data"))).toBe(false);
      expect(existsSync(join(target, ".afol", "skills", "README.md"))).toBe(true);
      expect(existsSync(join(target, ".afol", "wb", "README.md"))).toBe(true);
      expect(existsSync(join(target, ".afol", "tmp", "README.md"))).toBe(true);
      expect(existsSync(join(target, ".afol", "data", "README.md"))).toBe(true);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("dry-run reports provider-compatible mutable baseline details", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-dry-run-"));
    const logs: string[] = [];
    const originalLog = console.log;
    try {
      console.log = (...values: unknown[]) => {
        logs.push(values.map(String).join(" "));
      };
      expect(await runBootstrapCommand([target, "--provider-compatible", "--dry-run"])).toBe(0);

      const output = logs.join("\n");
      expect(output).toContain("mutable-baseline-create .afol/skills/README.md source=.agents/skills/README.md missing-target-file");
      expect(output).toContain("mutable-baseline-create .afol/wb/README.md source=.agents/wb/README.md missing-target-file");
      expect(output).toContain("mutable-baseline-create .afol/tmp/README.md source=.agents/tmp/README.md missing-target-file");
      expect(output).toContain("mutable-baseline-create .afol/data/README.md source=.agents/data/README.md missing-target-file");
    } finally {
      console.log = originalLog;
      rmSync(target, { recursive: true, force: true });
    }
  });
});
