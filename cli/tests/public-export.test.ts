import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");
const exportScript = join(repoRoot, "scripts", "export-public.ts");
const auditScript = join(repoRoot, "scripts", "audit-public-content.ts");

function runBun(script: string, args: string[], cwd: string) {
	return spawnSync("bun", [script, ...args], {
		cwd,
		encoding: "utf8",
	});
}

function outputOf(result: ReturnType<typeof runBun>): string {
	return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

describe("public export boundary", () => {
	test("maps the public governance instructions to the export root", () => {
		const config = JSON.parse(
			readFileSync(join(repoRoot, "scripts", "public-files.json"), "utf8"),
		) as { mapped_files?: Record<string, string> };

		expect(config.mapped_files).toEqual({
			"docs/public/AGENTS.md": "AGENTS.md",
		});
	});

	test("keeps smoke:example while exporting mapped files", () => {
		const root = mkdtempSync(join(tmpdir(), "public-export-mapped-"));
		try {
			const scriptsDir = join(root, "scripts");
			const sourceDir = join(root, "docs", "public");
			const target = join(root, "export");
			mkdirSync(scriptsDir, { recursive: true });
			mkdirSync(sourceDir, { recursive: true });
			cpSync(exportScript, join(scriptsDir, "export-public.ts"));
			writeFileSync(
				join(scriptsDir, "public-files.json"),
				JSON.stringify({
					files: ["package.json"],
					directories: [],
					mapped_directories: { "docs/public": "docs" },
					mapped_files: { "docs/public/AGENTS.md": "AGENTS.md" },
					exclude: [],
				}),
			);
			writeFileSync(
				join(root, "package.json"),
				JSON.stringify({
					name: "public-export-fixture",
					version: "0.0.0",
					scripts: {
						"smoke:example": "echo smoke",
						"public:export": "echo factory",
					},
				}),
			);
			writeFileSync(join(sourceDir, "AGENTS.md"), "public instructions\n");

			const result = runBun(
				join(scriptsDir, "export-public.ts"),
				[target],
				root,
			);
			expect(result.status).toBe(0);
			expect(readFileSync(join(target, "AGENTS.md"), "utf8")).toBe(
				"public instructions\n",
			);
			expect(existsSync(join(target, "docs", "AGENTS.md"))).toBe(false);
			const manifest = JSON.parse(
				readFileSync(join(target, "package.json"), "utf8"),
			) as { scripts?: Record<string, string> };
			expect(manifest.scripts?.["smoke:example"]).toBe("echo smoke");
			expect(manifest.scripts?.["public:export"]).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(process.platform === "win32")(
		"rejects relative and absolute symlinks during export",
		() => {
			for (const targetType of ["relative", "absolute"] as const) {
				const root = mkdtempSync(
					join(tmpdir(), `public-export-${targetType}-`),
				);
				try {
					const scriptsDir = join(root, "scripts");
					const sourceDir = join(root, "source");
					mkdirSync(scriptsDir, { recursive: true });
					mkdirSync(sourceDir, { recursive: true });
					cpSync(exportScript, join(scriptsDir, "export-public.ts"));
					writeFileSync(
						join(scriptsDir, "public-files.json"),
						JSON.stringify({
							files: ["package.json"],
							directories: ["source"],
							mapped_directories: {},
							mapped_files: {},
							exclude: [],
						}),
					);
					writeFileSync(join(root, "package.json"), "{}\n");
					const target = join(sourceDir, "target.txt");
					writeFileSync(target, "target\n");
					symlinkSync(
						targetType === "relative" ? "target.txt" : target,
						join(sourceDir, "linked.txt"),
					);

					const result = runBun(
						join(scriptsDir, "export-public.ts"),
						[join(root, "export")],
						root,
					);
					expect(result.status).not.toBe(0);
					expect(outputOf(result)).toContain("symlink is forbidden");
				} finally {
					rmSync(root, { recursive: true, force: true });
				}
			}
		},
	);

	test.skipIf(process.platform === "win32")(
		"audit rejects every symlink while retaining generic privacy checks",
		() => {
			const root = mkdtempSync(join(tmpdir(), "public-audit-"));
			try {
				writeFileSync(
					join(root, "path.txt"),
					["/", "home", "/", "generic", "/"].join(""),
				);
				writeFileSync(join(root, "target.txt"), "target\n");
				symlinkSync("target.txt", join(root, "linked.txt"));

				const result = runBun(auditScript, [root], repoRoot);
				expect(result.status).not.toBe(0);
				expect(outputOf(result)).toContain("linked.txt: symlink");
				expect(outputOf(result)).toContain("path.txt: linux-home-path");
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);
});
