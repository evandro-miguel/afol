#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_OUTFILE = "dist/afol";
const ENTRY = "cli/main.ts";

export const DEFAULT_BUILD_COMMAND = "bun run build:deterministic";

export type BuildReleaseArtifactOptions = {
	cwd?: string;
	outfile?: string;
};

export type BuildReleaseArtifactResult = {
	outfile: string;
	sha256: string;
};

function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
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
		[
			"build",
			"--compile",
			"--format=esm",
			"--no-compile-autoload-dotenv",
			"--no-compile-autoload-bunfig",
			entryArgument,
			"--outfile",
			outfileArgument,
		],
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

	return { outfile, sha256: sha256Hex(readFileSync(outfile)) };
}

function main(): void {
	const { outfile, sha256 } = buildReleaseArtifact();
	console.log(`release build: ${outfile} ${sha256}`);
}

if (import.meta.main) {
	main();
}
