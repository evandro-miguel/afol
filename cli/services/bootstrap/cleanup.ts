import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export type BootstrapCleanupCandidate = {
	path: string;
	reason: string;
};

type BootstrapCleanupPlan = {
	candidates: BootstrapCleanupCandidate[];
};

const LEGACY_ROOTS = [".agents/scripts", ".agents/runtime"] as const;
const LEGACY_EXACT_FILES = [".agents/agents", ".agents/agents-mcp"] as const;
const LEGACY_FILE_NAMES = [
	"uv.lock",
	"pyproject.toml",
	".python-version",
] as const;

function isLegacyDirectory(path: string): boolean {
	return LEGACY_ROOTS.includes(path as (typeof LEGACY_ROOTS)[number]);
}

function isLegacyExactFile(path: string): boolean {
	return LEGACY_EXACT_FILES.includes(
		path as (typeof LEGACY_EXACT_FILES)[number],
	);
}

function isLegacyFileName(path: string): boolean {
	const base = path.split(/[/\\]/).pop() ?? "";
	if (!base) {
		return false;
	}
	return LEGACY_FILE_NAMES.includes(base as (typeof LEGACY_FILE_NAMES)[number]);
}

function hasPathSegment(path: string, segment: string): boolean {
	return (
		path === segment ||
		path.startsWith(`${segment}/`) ||
		path.endsWith(`/${segment}`) ||
		path.includes(`/${segment}/`)
	);
}

function isPycacheCandidate(path: string): boolean {
	return (
		hasPathSegment(path, "__pycache__") &&
		(path.startsWith(".agents/scripts") ||
			path.startsWith(".agents/runtime") ||
			hasPathSegment(path, ".venv"))
	);
}

function isLegacyPath(path: string): boolean {
	if (isLegacyDirectory(path)) {
		return true;
	}
	if (isLegacyExactFile(path)) {
		return true;
	}
	if (isLegacyFileName(path)) {
		return true;
	}
	if (path.endsWith("/.venv")) {
		return true;
	}
	return isPycacheCandidate(path);
}

function cleanupReason(path: string): string {
	if (path === ".agents/agents" || path === ".agents/agents-mcp") {
		return "legacy-python-wrapper";
	}
	if (path === ".agents/scripts" || path.startsWith(".agents/scripts/")) {
		return "legacy-script-root";
	}
	if (path === ".agents/runtime" || path.startsWith(".agents/runtime/")) {
		return "legacy-runtime-root";
	}
	if (path.endsWith("/.venv") || path.includes("/.venv/")) {
		return "legacy-venv";
	}
	if (path.endsWith("/__pycache__") || path.includes("/__pycache__/")) {
		return "legacy-pycache";
	}
	return "legacy-python-metadata";
}

function collectLegacyCandidates(root: string): string[] {
	const agentsRoot = join(root, ".agents");
	if (!existsSync(agentsRoot)) {
		return [];
	}

	const candidates = new Set<string>();
	const walk = (current: string, relative: string): void => {
		const entries = readdirSync(current, { withFileTypes: true });

		for (const entry of entries) {
			const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
			const nextAbsolute = join(current, entry.name);

			if (entry.isDirectory()) {
				if (isLegacyPath(nextRelative)) {
					candidates.add(nextRelative);
					continue;
				}
				walk(nextAbsolute, nextRelative);
				continue;
			}

			if (isLegacyPath(nextRelative)) {
				candidates.add(nextRelative);
			}
		}
	};

	walk(agentsRoot, ".agents");
	return [...candidates].sort();
}

export function planBootstrapCleanup(targetRoot: string): BootstrapCleanupPlan {
	const candidates = collectLegacyCandidates(targetRoot);
	return {
		candidates: candidates.map((path) => ({
			path,
			reason: cleanupReason(path),
		})),
	};
}

export function cleanupBootstrapObsolete(
	targetRoot: string,
	candidates: readonly BootstrapCleanupCandidate[],
): void {
	for (const candidate of candidates) {
		const absolute = join(targetRoot, candidate.path);
		rmSync(absolute, { recursive: true, force: true });
	}
}
