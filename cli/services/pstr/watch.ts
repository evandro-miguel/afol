import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { resolvePstrAreas } from "./builder";

const EXCLUDED_DIR_SEGMENTS = new Set([
	"node_modules",
	".git",
	"dist",
	".afol",
	".gitnexus",
	".ruff_cache",
	"coverage",
	".worktree",
	"__pycache__",
]);

function normalizeWatchPath(pathValue: string): string {
	const normalized = pathValue.trim().replace(/\\/g, "/");
	if (!normalized) {
		return "";
	}
	return normalized.startsWith("/")
		? normalized
		: normalized.replace(/^\.\//, "");
}

function resolveWatchAnchor(
	projectRoot: string,
	pathValue: string,
): string | null {
	const root = resolve(projectRoot);
	let candidate = resolve(projectRoot, normalizeWatchPath(pathValue));
	while (
		!existsSync(candidate) &&
		candidate !== root &&
		candidate !== dirname(candidate)
	) {
		candidate = dirname(candidate);
	}
	if (!existsSync(candidate)) {
		return null;
	}
	try {
		const realRoot = realpathSync(root);
		const realCandidate = realpathSync(candidate);
		const realRelative = relative(realRoot, realCandidate).replace(/\\/g, "/");
		if (realRelative === ".." || realRelative.startsWith("../")) {
			return null;
		}
	} catch {
		return null;
	}
	const relativeCandidate = relative(root, candidate).replace(/\\/g, "/");
	if (relativeCandidate === ".." || relativeCandidate.startsWith("../")) {
		return null;
	}
	return statSync(candidate).isDirectory() ? candidate : dirname(candidate);
}

function isExcludedDirectory(
	projectRoot: string,
	directoryPath: string,
): boolean {
	const normalizedPath = relative(projectRoot, directoryPath).replace(
		/\\/g,
		"/",
	);
	if (normalizedPath === "." || normalizedPath.startsWith("..")) {
		return false;
	}
	return normalizedPath
		.split("/")
		.some((segment) => EXCLUDED_DIR_SEGMENTS.has(segment));
}

function collectWatchDirectories(
	projectRoot: string,
	startPath: string,
): string[] {
	if (!existsSync(startPath)) {
		return [];
	}

	const sourceStat = statSync(startPath);
	if (sourceStat.isFile()) {
		return [dirname(startPath)];
	}

	const out = new Set<string>();
	const stack: string[] = [startPath];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || out.has(current)) {
			continue;
		}
		out.add(current);

		const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		for (const entry of entries) {
			if (entry.isSymbolicLink()) {
				continue;
			}
			if (!entry.isDirectory()) {
				continue;
			}
			const entryPath = resolve(current, entry.name);
			if (isExcludedDirectory(projectRoot, entryPath)) {
				continue;
			}
			stack.push(entryPath);
		}
	}

	return [...out].sort((left, right) => left.localeCompare(right));
}

export function getPstrWatchTargets(
	projectRoot: string,
	requestedPaths: string[],
): string[] {
	const seeds =
		requestedPaths.length > 0
			? requestedPaths
			: resolvePstrAreas(projectRoot).flatMap((area) => area.source_roots);
	return [
		...new Set(
			seeds.flatMap((path) => {
				const anchor = resolveWatchAnchor(projectRoot, path);
				if (!anchor) {
					return [];
				}
				return collectWatchDirectories(projectRoot, anchor);
			}),
		),
	].sort((left, right) => left.localeCompare(right));
}
