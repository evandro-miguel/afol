import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";

type PackageMetadata = {
  name: string;
  version: string;
};

describe("CLI version metadata", () => {
  test("matches package metadata", () => {
    const raw = JSON.parse(readFileSync("package.json", "utf8")) as Partial<PackageMetadata>;
    if (typeof raw.name !== "string" || typeof raw.version !== "string") {
      throw new Error("package.json must include string name and version");
    }
    const metadata: PackageMetadata = { name: raw.name, version: raw.version };

    expect(CLI_PACKAGE_NAME).toBe(metadata.name);
    expect(CLI_VERSION).toBe(metadata.version);
  });
});
