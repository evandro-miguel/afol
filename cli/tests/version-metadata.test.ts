import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";

type PackageMetadata = {
	name: string;
	version: string;
};

const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

describe("CLI version metadata", () => {
	test("matches package metadata", () => {
		const raw = JSON.parse(
			readFileSync("package.json", "utf8"),
		) as Partial<PackageMetadata>;
		if (typeof raw.name !== "string" || typeof raw.version !== "string") {
			throw new Error("package.json must include string name and version");
		}
		const metadata: PackageMetadata = { name: raw.name, version: raw.version };

		expect(CLI_PACKAGE_NAME).toBe(metadata.name);
		expect(CLI_VERSION).toBe(metadata.version);
	});

	test("uses a real prerelease semver instead of the placeholder version", () => {
		expect(CLI_VERSION).toMatch(SEMVER_PATTERN);
		expect(CLI_VERSION).toContain("-");
		expect(CLI_VERSION).not.toBe("0.0.0");
	});
});
