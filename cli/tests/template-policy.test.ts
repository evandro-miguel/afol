import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

import {
  scanProjectTemplateForbiddenTextReferences,
  scanProjectTemplateForbiddenPaths,
  scanProjectTemplateUnknownAllowedPaths,
  scanTemplateForbiddenPaths,
} from "../schemas/template-policy";

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

async function collectJsonFiles(root: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".json")) {
        paths.push(toPosixPath(relative(root, absolutePath)));
      }
    }
  }

  await walk(root);
  return paths.sort();
}

describe("template forbidden-content policy", () => {
  test("matches expected forbidden patterns in a small fixture", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "template-policy-fixture-"));
    try {
      mkdirSync(join(fixtureRoot, ".agents", "runtime"), { recursive: true });
      mkdirSync(join(fixtureRoot, "docs", "standards"), { recursive: true });
      mkdirSync(join(fixtureRoot, "docs", "templates"), { recursive: true });
      mkdirSync(join(fixtureRoot, "tests"), { recursive: true });

      writeFileSync(join(fixtureRoot, ".agents", "runtime", "main.py"), "print('x')\n", "utf8");
      writeFileSync(join(fixtureRoot, "a"), "#!/usr/bin/env bash\n", "utf8");
      writeFileSync(join(fixtureRoot, "Justfile"), "validate:\n", "utf8");
      writeFileSync(join(fixtureRoot, "docs", "standards", "policy.md"), "x\n", "utf8");
      writeFileSync(join(fixtureRoot, "tests", "sample.txt"), "x\n", "utf8");
      writeFileSync(join(fixtureRoot, "docs", "templates", "ok.md"), "x\n", "utf8");

      const matches = await scanTemplateForbiddenPaths(fixtureRoot);

      expect(matches).toContain(".agents/runtime/main.py");
      expect(matches).toContain("a");
      expect(matches).toContain("Justfile");
      expect(matches).toContain("docs/standards/policy.md");
      expect(matches).toContain("tests/sample.txt");
      expect(matches).not.toContain("docs/templates/ok.md");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("live src/project-template has no forbidden content", async () => {
    const matches = await scanProjectTemplateForbiddenPaths(process.cwd());

    if (matches.length > 0) {
      throw new Error(
        [
          `Forbidden content found in src/project-template (${matches.length}):`,
          ...matches.map((path) => ` - ${path}`),
        ].join("\n"),
      );
    }

    expect(matches).toEqual([]);
  });

  test("live src/project-template only uses explicit allowed payload classes", async () => {
    const matches = await scanProjectTemplateUnknownAllowedPaths(process.cwd());

    if (matches.length > 0) {
      throw new Error(
        [
          `Unexpected template payload paths in src/project-template (${matches.length}):`,
          ...matches.map((path) => ` - ${path}`),
        ].join("\n"),
      );
    }

    expect(matches).toEqual([]);
  });

  test("live src/project-template instructions do not reference removed or unsupported runtime surfaces", () => {
    const matches = scanProjectTemplateForbiddenTextReferences(process.cwd());

    if (matches.length > 0) {
      throw new Error(
        [
          `Forbidden text references found in src/project-template instructions (${matches.length}):`,
          ...matches.map((match) => ` - ${match}`),
        ].join("\n"),
      );
    }

    expect(matches).toEqual([]);
  });

  test("live src/project-template JSON files parse", async () => {
    const templateRoot = join(process.cwd(), "src/project-template");
    const jsonFiles = await collectJsonFiles(templateRoot);
    const failures: string[] = [];

    for (const relativePath of jsonFiles) {
      const absolutePath = join(templateRoot, relativePath);
      try {
        JSON.parse(await readFile(absolutePath, "utf8"));
      } catch (error) {
        failures.push(`${relativePath}: ${(error as Error).message}`);
      }
    }

    if (failures.length > 0) {
      throw new Error([`Invalid JSON in src/project-template (${failures.length}):`, ...failures].join("\n"));
    }

    expect(jsonFiles.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});

describe("scanTemplateToolchainClaims", () => {
  test("returns claims for bun and afol", () => {
    // Import is at top level; we test the function directly
    const { scanTemplateToolchainClaims } = require("../schemas/template-policy");
    const claims = scanTemplateToolchainClaims();
    expect(claims.length).toBeGreaterThanOrEqual(2);
    const bun = claims.find((c: any) => c.tool === "bun");
    const afol = claims.find((c: any) => c.tool === "afol");
    expect(bun).toBeDefined();
    expect(bun.critical).toBe(true);
    expect(afol).toBeDefined();
    expect(afol.critical).toBe(false);
    // bun should be available in this test environment
    expect(bun.available).toBe(true);
  });
});
