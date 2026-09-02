#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseArtifactPath } from "./build-release";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifact = join(repoRoot, releaseArtifactPath("dist/afol"));

if (!existsSync(artifact)) {
	throw new Error(`Missing ${artifact}. Run bun run build first.`);
}

const sandbox = mkdtempSync(join(tmpdir(), "afol-example-"));

function run(command: string, args: string[], cwd: string): void {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		throw new Error(
			[
				`${command} ${args.join(" ")} failed with status ${result.status}`,
				`stdout=${(result.stdout ?? "").trim() || "<empty>"}`,
				`stderr=${(result.stderr ?? "").trim() || "<empty>"}`,
			].join("\n"),
		);
	}
}

try {
	run("git", ["init", "minimal-project"], sandbox);
	const project = join(sandbox, "minimal-project");
	run(artifact, ["init"], project);
	run(
		artifact,
		[
			"qt",
			"verified-change",
			"-t",
			"Make one verified change",
			"-c",
			"git diff --check",
		],
		project,
	);
	run(artifact, ["status"], project);
	console.log("public example smoke passed");
} finally {
	rmSync(sandbox, { recursive: true, force: true });
}
