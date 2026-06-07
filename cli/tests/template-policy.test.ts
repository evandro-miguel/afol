import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  scanProjectTemplateForbiddenTextReferences,
  scanProjectTemplateForbiddenPaths,
  scanProjectTemplateUnknownAllowedPaths,
  scanTemplateForbiddenPaths,
} from "../schemas/template-policy";

describe("template forbidden-content policy", () => {
  test("matches expected forbidden patterns in a small fixture", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "template-policy-fixture-"));
    try {
      mkdirSync(join(fixtureRoot, ".agents", "runtime"), { recursive: true });
      mkdirSync(join(fixtureRoot, "docs", "standards"), { recursive: true });
      mkdirSync(join(fixtureRoot, "docs", "templates"), { recursive: true });
      mkdirSync(join(fixtureRoot, "tests"), { recursive: true });

      writeFileSync(join(fixtureRoot, ".agents", "runtime", "main.py"), "print('x')\n", "utf8");
      writeFileSync(join(fixtureRoot, "docs", "standards", "policy.md"), "x\n", "utf8");
      writeFileSync(join(fixtureRoot, "tests", "sample.txt"), "x\n", "utf8");
      writeFileSync(join(fixtureRoot, "docs", "templates", "ok.md"), "x\n", "utf8");

      const matches = await scanTemplateForbiddenPaths(fixtureRoot);

      expect(matches).toContain(".agents/runtime/main.py");
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
});
