#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	syncDirectoryDurablyIfSupported,
	syncFileDurably,
} from "../services/io/durable-sync";
import {
	assertReleaseOutputFileStable,
	prepareReleaseOutputFile,
} from "./release-output";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_OUTFILE = "dist/afol";
const ENTRY = "cli/main.ts";

/** Bun appends .exe to compiled output on Windows when it is not supplied. */
export function releaseArtifactPath(outfile: string): string {
	if (
		process.platform !== "win32" ||
		basename(outfile).toLowerCase().endsWith(".exe")
	) {
		return outfile;
	}
	return `${outfile}.exe`;
}

export const DEFAULT_BUILD_COMMAND = "bun run build:deterministic";

export function compiledReleaseBuildArgs(
	entry: string,
	outfile: string,
): string[] {
	return [
		"build",
		"--compile",
		"--minify",
		"--format=esm",
		"--no-compile-autoload-dotenv",
		"--no-compile-autoload-bunfig",
		entry,
		"--outfile",
		outfile,
	];
}

function portableRelativePath(from: string, to: string): string {
	return relative(from, to).replaceAll("\\", "/");
}

export type BuildReleaseArtifactOptions = {
	cwd?: string;
	outfile?: string;
};

export type BuildReleaseArtifactResult = {
	outfile: string;
	sha256: string;
	receiptPath: string;
};

export type CompiledReleaseBuildReceipt = {
	artifact_sha256: string;
	build_args: string[];
};

function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function compiledReleaseBuildReceiptPath(outfile: string): string {
	return `${outfile}.build.json`;
}

function canonicalizeCompilerPathArgument(value: string): string {
	return value.replaceAll("\\", "/");
}

function canonicalizeCompiledReleaseBuildArgs(args: string[]): string[] {
	const outfileIndex = args.indexOf("--outfile");
	return args.map((argument, index) =>
		index === outfileIndex - 1 || index === outfileIndex + 1
			? canonicalizeCompilerPathArgument(argument)
			: argument,
	);
}

function writeTextAtomically(
	outfilePath: string,
	outputGuard: ReturnType<typeof prepareReleaseOutputFile> | null,
	cwd: string,
	content: string,
): void {
	const tempPath = `${outfilePath}.tmp-${process.pid}-${Date.now()}`;
	const tempGuard = outputGuard
		? prepareReleaseOutputFile(cwd, tempPath)
		: null;
	try {
		writeFileSync(tempPath, content, "utf8");
		if (tempGuard) {
			assertReleaseOutputFileStable(tempGuard, true);
		}
		syncFileDurably(tempPath);
		renameSync(tempPath, outfilePath);
		syncDirectoryDurablyIfSupported(dirname(outfilePath));
		if (outputGuard) {
			assertReleaseOutputFileStable(outputGuard, true);
		}
	} finally {
		if (existsSync(tempPath)) {
			rmSync(tempPath, { force: true });
		}
	}
}

export function writeCompiledReleaseBuildReceipt(
	outfile: string,
	buildArgs: string[],
	cwd?: string,
): string {
	const receiptPath = compiledReleaseBuildReceiptPath(outfile);
	const outputGuard = cwd ? prepareReleaseOutputFile(cwd, receiptPath) : null;
	writeTextAtomically(
		receiptPath,
		outputGuard,
		cwd ?? process.cwd(),
		`${JSON.stringify(
			{
				artifact_sha256: sha256Hex(readFileSync(outfile)),
				build_args: buildArgs,
			},
			null,
			2,
		)}\n`,
	);
	return receiptPath;
}

export function readMinifiedCompiledReleaseBuildReceipt(
	outfile: string,
	expectedBuildArgs: string[],
): CompiledReleaseBuildReceipt | null {
	const receiptPath = compiledReleaseBuildReceiptPath(outfile);
	if (!existsSync(receiptPath)) return null;
	let receipt: CompiledReleaseBuildReceipt;
	try {
		receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
	} catch {
		throw new Error(`invalid compiled release build receipt: ${receiptPath}`);
	}
	if (
		!receipt ||
		typeof receipt.artifact_sha256 !== "string" ||
		!Array.isArray(receipt.build_args) ||
		receipt.artifact_sha256 !== sha256Hex(readFileSync(outfile))
	) {
		throw new Error(
			`compiled release build receipt does not bind artifact: ${outfile}`,
		);
	}
	if (
		JSON.stringify(canonicalizeCompiledReleaseBuildArgs(receipt.build_args)) !==
		JSON.stringify(canonicalizeCompiledReleaseBuildArgs(expectedBuildArgs))
	) {
		throw new Error(
			`compiled release build receipt has noncanonical flags: ${receiptPath}`,
		);
	}
	return receipt;
}

export function buildReleaseArtifact(
	options: BuildReleaseArtifactOptions = {},
): BuildReleaseArtifactResult {
	const cwd = resolve(options.cwd ?? REPO_ROOT);
	const outfile = releaseArtifactPath(
		resolve(cwd, options.outfile ?? DEFAULT_OUTFILE),
	);
	const entry = join(cwd, ENTRY);
	if (!existsSync(entry)) {
		throw new Error(`missing release entrypoint: ${entry}`);
	}
	const artifactGuard = prepareReleaseOutputFile(cwd, outfile);
	const entryArgument = portableRelativePath(cwd, entry) || ENTRY;
	const outfileArgument = portableRelativePath(cwd, outfile) || outfile;

	const result = spawnSync(
		"bun",
		compiledReleaseBuildArgs(entryArgument, outfileArgument),
		{
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			[
				"release build failed",
				`status=${result.status}`,
				`stdout=${(result.stdout as string).trim()}`,
				`stderr=${(result.stderr as string).trim()}`,
			].join("\n"),
		);
	}

	assertReleaseOutputFileStable(artifactGuard, true);
	const sha256 = sha256Hex(readFileSync(outfile));
	const receiptPath = writeCompiledReleaseBuildReceipt(
		outfile,
		compiledReleaseBuildArgs(entryArgument, outfileArgument),
		cwd,
	);
	return { outfile, sha256, receiptPath };
}

function main(): void {
	const { outfile, sha256 } = buildReleaseArtifact();
	console.log(`release build: ${outfile} ${sha256}`);
}

if (import.meta.main) {
	main();
}
