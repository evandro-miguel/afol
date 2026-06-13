import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export type AdmManifestEntry = {
	source_path: string;
	target_path: string;
	source_hash: string;
	size_bytes: number;
	status: "planned";
};

export type AdmPlanResult = {
	manifest: AdmManifestEntry[];
};

function sha256Hex(content: Buffer): string {
	return createHash("sha256").update(content).digest("hex");
}

function walkMarkdownFiles(root: string, current: string, files: string[]): void {
	const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
		left.name.localeCompare(right.name),
	);
	for (const entry of entries) {
		const absolute = join(current, entry.name);
		if (entry.isDirectory()) {
			walkMarkdownFiles(root, absolute, files);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(relative(root, absolute));
		}
	}
}

function listArcDocs(root: string): string[] {
	const docsArcDir = join(root, "docs", "arc");
	if (!existsSync(docsArcDir)) {
		return [];
	}
	const files: string[] = [];
	walkMarkdownFiles(root, docsArcDir, files);
	return files.filter((path) => {
		const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
		return (
			normalized === "docs/arc/GENERAL-ROADMAP.md" ||
			normalized === "docs/arc/PROJECT-MANIFESTO.md" ||
			normalized === "docs/arc/ARCHITECTURE.md" ||
			normalized === "docs/arc/CHANGELOG.md" ||
			normalized.startsWith("docs/arc/SPECS/") ||
			normalized.startsWith("docs/arc/DECISIONS/")
		);
	});
}

function targetPathFor(sourcePath: string): string | null {
	const normalized = sourcePath.replace(/\\/g, "/").replace(/^\.\//, "");
	if (normalized === "docs/arc/GENERAL-ROADMAP.md") {
		return ".afol/adm/roadmap/GENERAL-ROADMAP.md";
	}
	if (normalized === "docs/arc/PROJECT-MANIFESTO.md") {
		return ".afol/adm/doctrine/PROJECT-MANIFESTO.md";
	}
	if (normalized === "docs/arc/ARCHITECTURE.md") {
		return ".afol/adm/doctrine/ARCHITECTURE.md";
	}
	if (normalized === "docs/arc/CHANGELOG.md") {
		return ".afol/adm/changelog/CHANGELOG.md";
	}
	if (normalized.startsWith("docs/arc/SPECS/")) {
		return `.afol/adm/specs/${normalized.slice("docs/arc/SPECS/".length)}`;
	}
	if (normalized.startsWith("docs/arc/DECISIONS/")) {
		return `.afol/adm/decisions/${normalized.slice("docs/arc/DECISIONS/".length)}`;
	}
	return null;
}

export function planAdmMigration(root: string): AdmPlanResult {
	const manifest = listArcDocs(root)
		.sort((left, right) => left.localeCompare(right))
		.map((sourcePath) => {
			const targetPath = targetPathFor(sourcePath);
			if (!targetPath) {
				return null;
			}
			const absoluteSource = join(root, sourcePath);
			const content = readFileSync(absoluteSource);
			return {
				source_path: sourcePath,
				target_path: targetPath,
				source_hash: sha256Hex(content),
				size_bytes: content.length,
				status: "planned" as const,
			};
		})
		.filter((entry): entry is AdmManifestEntry => entry !== null);

	return { manifest };
}
