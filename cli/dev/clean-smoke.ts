#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import {
	cpSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readlinkSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseArtifactPath } from "./build-release";

const REPO_ROOT = resolve(
	join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
);

function commandOutput(result: ReturnType<typeof spawnSync>): string {
	return (result.stderr?.toString("utf8") ?? "").trim();
}

function run(command: string, args: string[], cwd: string): void {
	const result = spawnSync(command, args, { cwd, stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed with status ${result.status}`,
		);
	}
}

function runCompiledHelp(artifact: string, cwd: string): void {
	const result = spawnSync(artifact, ["--help"], {
		cwd,
		stdio: ["ignore", "ignore", "pipe"],
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${artifact} --help failed with status ${result.status}: ${commandOutput(result)}`,
		);
	}
}

function sourceFiles(root: string): string[] {
	const result = spawnSync(
		"git",
		["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
		{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
	);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`git ls-files failed with status ${result.status}: ${commandOutput(result)}`,
		);
	}
	return (result.stdout?.toString("utf8") ?? "").split("\0").filter(Boolean);
}

export function isCleanSmokeExcluded(path: string): boolean {
	return path
		.split(/[\\/]/)
		.some(
			(segment) =>
				segment === ".git" ||
				segment === "node_modules" ||
				segment === "dist" ||
				segment.startsWith(".bun-build"),
		);
}

function isInside(root: string, candidate: string): boolean {
	const pathFromRoot = relative(root, candidate);
	return (
		pathFromRoot === "" ||
		(!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
	);
}

export function assertCleanSmokeSymlinkTarget(
	sourceRoot: string,
	sourcePath: string,
	target: string,
	resolveRealPath: (path: string) => string = realpathSync,
): void {
	if (isAbsolute(target)) {
		throw new Error(
			`clean smoke rejects absolute symlink target: ${sourcePath}`,
		);
	}
	const source = resolve(sourceRoot);
	const lexicalTarget = resolve(dirname(sourcePath), target);
	if (!isInside(source, lexicalTarget)) {
		throw new Error(
			`clean smoke rejects escaping symlink target: ${sourcePath}`,
		);
	}
	let realSource: string;
	let realTarget: string;
	try {
		realSource = resolveRealPath(source);
		realTarget = resolveRealPath(lexicalTarget);
	} catch (error: unknown) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`clean smoke rejects broken symlink target: ${sourcePath}: ${reason}`,
		);
	}
	if (!isInside(realSource, realTarget)) {
		throw new Error(
			`clean smoke rejects escaping symlink target: ${sourcePath}`,
		);
	}
}

export function copyCleanCheckout(sourceRoot: string, checkout: string): void {
	const source = resolve(sourceRoot);
	const target = resolve(checkout);
	mkdirSync(target, { recursive: true });

	for (const sourceRelativePath of sourceFiles(source)) {
		if (isCleanSmokeExcluded(sourceRelativePath)) continue;
		if (isAbsolute(sourceRelativePath)) {
			throw new Error(
				`git listed an absolute source path: ${sourceRelativePath}`,
			);
		}
		const sourcePath = resolve(source, sourceRelativePath);
		if (relative(source, sourcePath).startsWith("..")) {
			throw new Error(
				`git listed a source path outside the repository: ${sourceRelativePath}`,
			);
		}
		let sourceStat: ReturnType<typeof lstatSync>;
		try {
			sourceStat = lstatSync(sourcePath);
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		if (sourceStat.isSymbolicLink()) {
			assertCleanSmokeSymlinkTarget(
				source,
				sourcePath,
				readlinkSync(sourcePath),
			);
		}
		const targetPath = join(target, sourceRelativePath);
		mkdirSync(dirname(targetPath), { recursive: true });
		cpSync(sourcePath, targetPath, {
			force: true,
			verbatimSymlinks: true,
		});
	}
}

export function runCleanSmoke(sourceRoot = process.cwd()): void {
	const sandbox = mkdtempSync(join(tmpdir(), "afol-clean-smoke-"));
	try {
		const checkout = join(sandbox, "checkout");
		copyCleanCheckout(sourceRoot, checkout);
		run("bun", ["install", "--frozen-lockfile"], checkout);
		run("bun", ["run", "build"], checkout);
		runCompiledHelp(
			releaseArtifactPath(join(checkout, "dist", "afol")),
			checkout,
		);
	} finally {
		rmSync(sandbox, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	runCleanSmoke(REPO_ROOT);
}
