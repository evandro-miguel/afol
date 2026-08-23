#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_OUTFILE = "dist/afol";
const ENTRY = "cli/main.ts";

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

export function writeCompiledReleaseBuildReceipt(
	outfile: string,
	buildArgs: string[],
): string {
	const receiptPath = compiledReleaseBuildReceiptPath(outfile);
	writeFileSync(
		receiptPath,
		`${JSON.stringify(
			{
				artifact_sha256: sha256Hex(readFileSync(outfile)),
				build_args: buildArgs,
			},
			null,
			2,
		)}\n`,
		"utf8",
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
	const outfile = resolve(cwd, options.outfile ?? DEFAULT_OUTFILE);
	const entry = join(cwd, ENTRY);
	if (!existsSync(entry)) {
		throw new Error(`missing release entrypoint: ${entry}`);
	}
	mkdirSync(dirname(outfile), { recursive: true });
	const entryArgument = relative(cwd, entry) || ENTRY;
	const outfileArgument = relative(cwd, outfile) || outfile;

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

	const sha256 = sha256Hex(readFileSync(outfile));
	const receiptPath = writeCompiledReleaseBuildReceipt(
		outfile,
		compiledReleaseBuildArgs(entryArgument, outfileArgument),
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
