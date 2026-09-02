import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * Schema cache key — a deterministic identifier for the current schema shape.
 *
 * Fields:
 * - `shape_name`: the shape pack name (e.g. "afol-shape")
 * - `shape_version`: the shape pack version string
 * - `source_path`: path within the project that defines the shape
 * - `source_hash`: SHA-256 hex of the serialised shape definition
 *
 * Project-local metadata (resolved from the `cwd` project root):
 * - `git_branch`: current git branch name, or "unknown" if not available
 * - `git_commit`: current git commit hash (short), or "unknown" if not available
 */
export type SchemaCacheKey = {
	shape_name: string;
	shape_version: string;
	source_path: string;
	source_hash: string;
	/** Project-local git branch name, or "unknown". Resolved from the cwd project root. */
	git_branch: string;
	/** Project-local git commit hash (short), or "unknown". Resolved from the cwd project root. */
	git_commit: string;
};

function tryGitBranch(cwd: string): string {
	try {
		const branch =
			execSync("git rev-parse --abbrev-ref HEAD", {
				cwd,
				encoding: "utf8",
				timeout: 2000,
				stdio: ["ignore", "pipe", "pipe"],
			})
				.trim()
				.split("\n")[0]
				?.trim() ?? "";
		return branch && branch !== "HEAD" ? branch : "unknown";
	} catch {
		return "unknown";
	}
}

function tryGitCommit(cwd: string): string {
	try {
		return (
			execSync("git rev-parse --short HEAD", {
				cwd,
				encoding: "utf8",
				timeout: 2000,
				stdio: ["ignore", "pipe", "pipe"],
			})
				.trim()
				.split("\n")[0]
				?.trim() ?? "unknown"
		);
	} catch {
		return "unknown";
	}
}

function normalizeSourcePath(sourcePath: string, cwd: string): string {
	const normalized = isAbsolute(sourcePath)
		? relative(resolve(cwd), resolve(sourcePath))
		: sourcePath;
	const portable = normalized.replaceAll("\\", "/");
	return portable && !portable.startsWith("../") ? portable : sourcePath;
}

/**
 * Build a SchemaCacheKey for the given project root.
 *
 * `shapeIdentifier` should be a deterministic JSON string representing the
 * current schema state (e.g. `JSON.stringify(shapePack)`). `sourcePath` is the
 * relative path where the shape is defined or persisted.
 *
 * `cwd` is the project root directory used to resolve git metadata. Git
 * metadata is resolved silently via `execSync` in the given `cwd`; if git is
 * not available or the directory is not a git repository, "unknown" is used
 * for both branch and commit.
 */
export function buildSchemaCacheKey(
	shapeName: string,
	shapeVersion: string,
	shapeIdentifier: string,
	sourcePath: string,
	cwd: string = process.cwd(),
): SchemaCacheKey {
	const hash = createHash("sha256")
		.update(shapeIdentifier, "utf8")
		.digest("hex");

	return {
		shape_name: shapeName,
		shape_version: shapeVersion,
		source_path: normalizeSourcePath(sourcePath, cwd),
		source_hash: hash,
		git_branch: tryGitBranch(cwd),
		git_commit: tryGitCommit(cwd),
	};
}
