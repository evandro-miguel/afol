import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	assertCleanSmokeSymlinkTarget,
	copyCleanCheckout,
	isCleanSmokeExcluded,
} from "../dev/clean-smoke";
import { symlinkTestSupport } from "./symlink-test-support";

function git(root: string, args: string[]): void {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	expect(result.status).toBe(0);
}

describe("clean smoke checkout", () => {
	test("copies the nonignored worktree while excluding release artifacts and dependencies", () => {
		const sandbox = mkdtempSync(join(tmpdir(), "afol-clean-smoke-test-"));
		try {
			const source = join(sandbox, "source");
			const checkout = join(sandbox, "checkout");
			mkdirSync(join(source, "cli"), { recursive: true });
			mkdirSync(join(source, "dist"), { recursive: true });
			mkdirSync(join(source, "node_modules", "package"), { recursive: true });
			mkdirSync(join(source, ".bun-build-cache"), { recursive: true });
			writeFileSync(join(source, ".gitignore"), "ignored.txt\n", "utf8");
			writeFileSync(join(source, "cli", "main.ts"), "export {};\n", "utf8");
			writeFileSync(join(source, "untracked.txt"), "kept\n", "utf8");
			writeFileSync(join(source, "ignored.txt"), "ignored\n", "utf8");
			writeFileSync(join(source, "dist", "afol"), "artifact\n", "utf8");
			writeFileSync(
				join(source, "node_modules", "package", "index.js"),
				"module\n",
				"utf8",
			);
			writeFileSync(
				join(source, ".bun-build-cache", "entry"),
				"cache\n",
				"utf8",
			);
			git(source, ["init", "--quiet"]);
			git(source, ["add", ".gitignore", "cli/main.ts"]);

			copyCleanCheckout(source, checkout);

			expect(readFileSync(join(checkout, "cli", "main.ts"), "utf8")).toBe(
				"export {};\n",
			);
			expect(readFileSync(join(checkout, "untracked.txt"), "utf8")).toBe(
				"kept\n",
			);
			expect(existsSync(join(checkout, "ignored.txt"))).toBe(false);
			expect(existsSync(join(checkout, "dist"))).toBe(false);
			expect(existsSync(join(checkout, "node_modules"))).toBe(false);
			expect(existsSync(join(checkout, ".bun-build-cache"))).toBe(false);
		} finally {
			rmSync(sandbox, { recursive: true, force: true });
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"preserves relative symlink targets inside the isolated checkout",
		() => {
			const sandbox = mkdtempSync(join(tmpdir(), "afol-clean-smoke-link-"));
			try {
				const source = join(sandbox, "source");
				const checkout = join(sandbox, "checkout");
				mkdirSync(join(source, "docs", "templates"), { recursive: true });
				mkdirSync(join(source, "canonical"), { recursive: true });
				writeFileSync(join(source, "canonical", "adr.md"), "adr\n", "utf8");
				symlinkSync(
					"../../canonical/adr.md",
					join(source, "docs", "templates", "adr.md"),
					"file",
				);
				git(source, ["init", "--quiet"]);
				git(source, ["add", "canonical/adr.md", "docs/templates/adr.md"]);

				copyCleanCheckout(source, checkout);

				const copiedLink = join(checkout, "docs", "templates", "adr.md");
				expect(readlinkSync(copiedLink)).toBe("../../canonical/adr.md");
				expect(readFileSync(copiedLink, "utf8")).toBe("adr\n");
			} finally {
				rmSync(sandbox, { recursive: true, force: true });
			}
		},
	);

	test("recognizes every explicit clean-smoke exclusion", () => {
		expect(isCleanSmokeExcluded(".git/config")).toBe(true);
		expect(isCleanSmokeExcluded("nested/node_modules/pkg/index.js")).toBe(true);
		expect(isCleanSmokeExcluded("dist/afol")).toBe(true);
		expect(isCleanSmokeExcluded(".bun-build-cache/entry")).toBe(true);
		expect(isCleanSmokeExcluded("cli/main.ts")).toBe(false);
	});

	test("rejects an escaping symlink target without requiring Windows symlink privileges", () => {
		const source = join(tmpdir(), "afol-clean-smoke-source");
		const link = join(source, "cli", "outside-link");
		expect(() =>
			assertCleanSmokeSymlinkTarget(source, link, "../../outside"),
		).toThrow(/rejects escaping symlink target/);
	});

	test("accepts an internal relative symlink target and rejects a broken target", () => {
		const source = join(tmpdir(), "afol-clean-smoke-source");
		const link = join(source, "cli", "internal-link");
		const internalTarget = join(source, "cli", "target.ts");
		const resolveInternalPath = (path: string): string =>
			path === source ? source : internalTarget;
		expect(() =>
			assertCleanSmokeSymlinkTarget(
				source,
				link,
				"target.ts",
				resolveInternalPath,
			),
		).not.toThrow();
		expect(() =>
			assertCleanSmokeSymlinkTarget(source, link, "missing.ts", () => {
				throw new Error("ENOENT");
			}),
		).toThrow(/rejects broken symlink target/);
	});
});
