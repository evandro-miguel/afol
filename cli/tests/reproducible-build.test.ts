import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { join } from "node:path";
import {
	buildReleaseArtifact,
	compiledReleaseBuildArgs,
	readMinifiedCompiledReleaseBuildReceipt,
	writeCompiledReleaseBuildReceipt,
} from "../dev/build-release";

const repoRoot = join(import.meta.dir, "..", "..");
const scratchRoot = join(repoRoot, ".tmp");

function projectScratch(prefix: string): string {
	mkdirSync(scratchRoot, { recursive: true });
	return mkdtempSync(join(scratchRoot, prefix));
}

function fileSha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function copyCleanSourceRoot(target: string): void {
	cpSync(join(repoRoot, "cli"), join(target, "cli"), { recursive: true });
	for (const file of ["package.json", "bun.lock", "tsconfig.json"]) {
		cpSync(join(repoRoot, file), join(target, file));
	}
	symlinkSync(
		join(repoRoot, "node_modules"),
		join(target, "node_modules"),
		"dir",
	);
}

describe("deterministic release build", () => {
	test("uses the native minified compiler contract without bytecode", () => {
		expect(compiledReleaseBuildArgs("cli/main.ts", "dist/afol")).toEqual([
			"build",
			"--compile",
			"--minify",
			"--format=esm",
			"--no-compile-autoload-dotenv",
			"--no-compile-autoload-bunfig",
			"cli/main.ts",
			"--outfile",
			"dist/afol",
		]);
	});

	test("accepts Windows receipt path separators without weakening compiler flags", () => {
		const root = projectScratch("reproducible-build-windows-receipt-");
		const artifact = join(root, "dist", "afol.exe");
		try {
			mkdirSync(join(root, "dist"), { recursive: true });
			writeFileSync(artifact, "artifact", "utf8");
			writeCompiledReleaseBuildReceipt(artifact, [
				"build",
				"--compile",
				"--minify",
				"--format=esm",
				"--no-compile-autoload-dotenv",
				"--no-compile-autoload-bunfig",
				"cli\\main.ts",
				"--outfile",
				"dist\\afol.exe",
			]);

			expect(
				readMinifiedCompiledReleaseBuildReceipt(
					artifact,
					compiledReleaseBuildArgs("cli/main.ts", "dist/afol.exe"),
				),
			).not.toBeNull();

			writeCompiledReleaseBuildReceipt(
				artifact,
				compiledReleaseBuildArgs("cli/main.ts", "dist/afol.exe"),
			);
			expect(
				readMinifiedCompiledReleaseBuildReceipt(
					artifact,
					compiledReleaseBuildArgs("cli/main.ts", "dist/afol.exe"),
				),
			).toEqual({
				artifact_sha256: fileSha256(artifact),
				build_args: compiledReleaseBuildArgs("cli/main.ts", "dist/afol.exe"),
			});

			writeCompiledReleaseBuildReceipt(artifact, [
				"build",
				"--compile",
				"--minify",
				"--format=cjs",
				"--no-compile-autoload-dotenv",
				"--no-compile-autoload-bunfig",
				"cli/main.ts",
				"--outfile",
				"dist/afol.exe",
			]);
			expect(() =>
				readMinifiedCompiledReleaseBuildReceipt(
					artifact,
					compiledReleaseBuildArgs("cli/main.ts", "dist/afol.exe"),
				),
			).toThrow(/noncanonical flags/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("two independent clean source roots produce identical SHA-256", () => {
		const sandbox = projectScratch("reproducible-build-");
		try {
			const firstRoot = join(sandbox, "first");
			const secondRoot = join(sandbox, "second");
			copyCleanSourceRoot(firstRoot);
			copyCleanSourceRoot(secondRoot);

			const first = buildReleaseArtifact({
				cwd: firstRoot,
				outfile: "dist/afol",
			});
			const second = buildReleaseArtifact({
				cwd: secondRoot,
				outfile: "dist/afol",
			});

			expect(first.outfile).toBe(join(firstRoot, "dist", "afol"));
			expect(second.outfile).toBe(join(secondRoot, "dist", "afol"));
			expect(fileSha256(first.outfile)).toBe(first.sha256);
			expect(first.sha256).toBe(second.sha256);
			expect(existsSync(first.receiptPath)).toBe(true);
			expect(
				readMinifiedCompiledReleaseBuildReceipt(
					first.outfile,
					compiledReleaseBuildArgs("cli/main.ts", "dist/afol"),
				),
			).toEqual({
				artifact_sha256: first.sha256,
				build_args: compiledReleaseBuildArgs("cli/main.ts", "dist/afol"),
			});

			const version = spawnSync(first.outfile, ["--version"], {
				cwd: firstRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			expect(version.status).toBe(0);
			expect(version.stdout as string).toContain("afol");
		} finally {
			rmSync(sandbox, { recursive: true, force: true });
		}
	});

	test("release build binds the entrypoint to the requested source root", () => {
		const sandbox = projectScratch("reproducible-build-entry-");
		try {
			const firstRoot = join(sandbox, "first");
			const secondRoot = join(sandbox, "second");
			mkdirSync(join(firstRoot, "cli"), { recursive: true });
			mkdirSync(join(secondRoot, "cli"), { recursive: true });
			writeFileSync(
				join(firstRoot, "cli", "main.ts"),
				'console.log("root-one");\n',
				"utf8",
			);
			writeFileSync(
				join(secondRoot, "cli", "main.ts"),
				'console.log("root-two");\n',
				"utf8",
			);

			const first = buildReleaseArtifact({
				cwd: firstRoot,
				outfile: "dist/afol",
			});
			const second = buildReleaseArtifact({
				cwd: secondRoot,
				outfile: "dist/afol",
			});
			const firstRun = spawnSync(first.outfile, [], {
				cwd: firstRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
			const secondRun = spawnSync(second.outfile, [], {
				cwd: secondRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});

			expect(firstRun.status).toBe(0);
			expect(secondRun.status).toBe(0);
			expect(firstRun.stdout as string).toContain("root-one");
			expect(secondRun.stdout as string).toContain("root-two");
		} finally {
			rmSync(sandbox, { recursive: true, force: true });
		}
	});

	test("release build fails closed when the source root lacks the entrypoint", () => {
		const root = projectScratch("reproducible-build-missing-");
		try {
			const outfile = join(root, "dist", "afol");
			expect(() =>
				buildReleaseArtifact({ cwd: root, outfile: "dist/afol" }),
			).toThrow(/missing release entrypoint/);
			expect(existsSync(outfile)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
