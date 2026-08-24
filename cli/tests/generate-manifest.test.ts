import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isTemplateManifestPath,
	managedHashRoot,
	refreshManagedHashes,
} from "../dev/generate-manifest";

function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function writeFixtureFile(root: string, path: string, content: string): void {
	const target = join(root, path);
	mkdirSync(join(target, ".."), { recursive: true });
	writeFileSync(target, content, "utf8");
}

describe("generate manifest template path classification", () => {
	test("recognizes only the template prefix with forward or Windows separators", () => {
		expect(
			isTemplateManifestPath("src/project-template/.agents/manifest.json"),
		).toBe(true);
		expect(
			isTemplateManifestPath("src\\project-template\\.agents\\manifest.json"),
		).toBe(true);
		expect(
			isTemplateManifestPath(
				"src/project-template-shadow/.agents/manifest.json",
			),
		).toBe(false);
		expect(
			isTemplateManifestPath(
				"other/src/project-template/.agents/manifest.json",
			),
		).toBe(false);
	});

	test("selects the template root only for normalized template paths", () => {
		const repoRoot = "C:\\repo";

		expect(
			managedHashRoot(repoRoot, "src/project-template/.agents/manifest.json"),
		).toBe(join(repoRoot, "src/project-template"));
		expect(
			managedHashRoot(
				repoRoot,
				"src\\project-template\\.agents\\manifest.json",
			),
		).toBe(join(repoRoot, "src/project-template"));
		expect(() =>
			managedHashRoot(
				repoRoot,
				"src/project-template-shadow/.agents/manifest.json",
			),
		).toThrow(/managed hash path must belong to the public template/);
		expect(() =>
			managedHashRoot(
				repoRoot,
				"other/src/project-template/.agents/manifest.json",
			),
		).toThrow(/managed hash path must belong to the public template/);
	});

	test("collects template-managed hashes and reads template bytes for Windows paths", () => {
		const repoRoot = mkdtempSync(join(tmpdir(), "afol-manifest-paths-"));
		try {
			writeFixtureFile(
				repoRoot,
				"src/project-template/.afol/adm/tools.json",
				"template bytes",
			);
			writeFixtureFile(
				repoRoot,
				"src/project-template/.afol/adm/rules/recovery.md",
				"template rule",
			);

			expect(
				refreshManagedHashes(
					repoRoot,
					"src\\project-template\\.agents\\manifest.json",
					{},
				),
			).toEqual({
				".afol/adm/rules/recovery.md": sha256("template rule"),
				".afol/adm/tools.json": sha256("template bytes"),
			});
			expect(() =>
				refreshManagedHashes(repoRoot, ".agents\\manifest.json", {
					".afol/adm/tools.json": "stale",
				}),
			).toThrow(/managed hash path must belong to the public template/);
		} finally {
			rmSync(repoRoot, { recursive: true, force: true });
		}
	});
});
