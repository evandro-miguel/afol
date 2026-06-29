export function normalizeManifestPath(value: string): string {
	return value
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\.\/+/, "")
		.replace(/^\/+/, "")
		.replace(/\/+/g, "/");
}

export function manifestTemplatePatterns(path: string): string[] {
	const normalized = normalizeManifestPath(path);
	if (!normalized) {
		return [];
	}
	if (normalized.startsWith(".agents/") || normalized.startsWith(".afol/")) {
		return [normalized];
	}

	const legacyAfolAdmPrefixes = ["hooks/", "rules/", "source/"];
	for (const prefix of legacyAfolAdmPrefixes) {
		if (normalized.startsWith(prefix)) {
			return [`.afol/adm/${normalized}`, normalized, `.agents/${normalized}`];
		}
	}

	if (normalized === "tools.json") {
		return [".afol/adm/tools.json", normalized, `.agents/${normalized}`];
	}
	if (normalized.startsWith("data/") || normalized.startsWith("tmp/")) {
		return [`.afol/${normalized}`, normalized, `.agents/${normalized}`];
	}

	return [normalized, `.agents/${normalized}`];
}

export function resolveManifestTemplatePath(
	path: string,
	templatePathSet: Set<string>,
): string | undefined {
	return manifestTemplatePatterns(path).find((candidate) =>
		templatePathSet.has(candidate),
	);
}

export function isTemplatePathMatch(pattern: string, path: string): boolean {
	return path === pattern || path.startsWith(`${pattern}/`);
}
