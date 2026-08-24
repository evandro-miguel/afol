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
	releaseArtifactPath,
	writeCompiledReleaseBuildReceipt,
} from "../dev/build-release";
import {
	directoryReparseTestSupport,
	symlinkTestSupport,
} from "./symlink-test-support";

const repoRoot = join(import.meta.dir, "..", "..");
const scratchRoot = join(repoRoot, ".tmp");
const NATIVE_BUILD_TIMEOUT_MS = 30_000;

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
	if (symlinkTestSupport.available) {
		symlinkSync(
			join(repoRoot, "node_modules"),
			join(target, "node_modules"),
			process.platform === "win32" ? "junction" : "dir",
		);
	} else {
		cpSync(join(repoRoot, "node_modules"), join(target, "node_modules"), {
			recursive: true,
		});
	}
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

	test(
		"two independent clean source roots produce identical SHA-256",
		() => {
			const sandbox = projectScratch("reproducible-build-");
			try {
				const artifact = releaseArtifactPath("dist/afol");
				const firstRoot = join(sandbox, "first");
				const secondRoot = join(sandbox, "second");
				copyCleanSourceRoot(firstRoot);
				copyCleanSourceRoot(secondRoot);

				const first = buildReleaseArtifact({
					cwd: firstRoot,
					outfile: artifact,
				});
				const second = buildReleaseArtifact({
					cwd: secondRoot,
					outfile: artifact,
				});

				expect(first.outfile).toBe(join(firstRoot, artifact));
				expect(second.outfile).toBe(join(secondRoot, artifact));
				expect(fileSha256(first.outfile)).toBe(first.sha256);
				expect(first.sha256).toBe(second.sha256);
				expect(existsSync(first.receiptPath)).toBe(true);
				expect(
					readMinifiedCompiledReleaseBuildReceipt(
						first.outfile,
						compiledReleaseBuildArgs("cli/main.ts", artifact),
					),
				).toEqual({
					artifact_sha256: first.sha256,
					build_args: compiledReleaseBuildArgs("cli/main.ts", artifact),
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
		},
		NATIVE_BUILD_TIMEOUT_MS,
	);

	test(
		"release build binds the entrypoint to the requested source root",
		() => {
			const sandbox = projectScratch("reproducible-build-entry-");
			try {
				const artifact = releaseArtifactPath("dist/afol");
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
					outfile: artifact,
				});
				const second = buildReleaseArtifact({
					cwd: secondRoot,
					outfile: artifact,
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
		},
		NATIVE_BUILD_TIMEOUT_MS,
	);

	test("release build fails closed when the source root lacks the entrypoint", () => {
		const root = projectScratch("reproducible-build-missing-");
		try {
			const artifact = releaseArtifactPath("dist/afol");
			const outfile = join(root, artifact);
			expect(() =>
				buildReleaseArtifact({ cwd: root, outfile: artifact }),
			).toThrow(/missing release entrypoint/);
			expect(existsSync(outfile)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!directoryReparseTestSupport.available)(
		"release build fails closed when dist is a directory reparse point",
		() => {
			const root = projectScratch("reproducible-build-reparse-root-");
			const external = projectScratch("reproducible-build-reparse-external-");
			const artifact = releaseArtifactPath("dist/afol");
			try {
				mkdirSync(join(root, "cli"), { recursive: true });
				writeFileSync(
					join(root, "cli", "main.ts"),
					"console.log('safe');\n",
					"utf8",
				);
				symlinkSync(
					external,
					join(root, "dist"),
					process.platform === "win32" ? "junction" : "dir",
				);

				expect(() =>
					buildReleaseArtifact({ cwd: root, outfile: artifact }),
				).toThrow(/release output directory/);
				expect(existsSync(join(external, releaseArtifactPath("afol")))).toBe(
					false,
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(external, { recursive: true, force: true });
			}
		},
	);
});
