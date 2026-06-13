import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveProjectPaths } from "../project/paths";

export type AdmPaths = {
	admDir: string;
	roadmapDir: string;
	specsDir: string;
	decisionsDir: string;
	changelogFile: string;
	doctrineDir: string;
	archiveDir: string;
	migrationsDir: string;
	routingDir: string;
	schemaDir: string;
};

function walkFiles(root: string, current: string, files: string[]): void {
	const entries = readdirSync(current, { withFileTypes: true }).sort(
		(left, right) => left.name.localeCompare(right.name),
	);
	for (const entry of entries) {
		const absolute = join(current, entry.name);
		if (entry.isDirectory()) {
			walkFiles(root, absolute, files);
			continue;
		}
		if (entry.isFile()) {
			files.push(relative(root, absolute));
		}
	}
}

export function resolveAdmPaths(root: string): AdmPaths {
	const admDir = resolveProjectPaths(root).abs.admDir;
	return {
		admDir,
		roadmapDir: join(admDir, "roadmap"),
		specsDir: join(admDir, "specs"),
		decisionsDir: join(admDir, "decisions"),
		changelogFile: join(admDir, "changelog", "CHANGELOG.md"),
		doctrineDir: join(admDir, "doctrine"),
		archiveDir: join(admDir, "archive"),
		migrationsDir: join(admDir, "migrations"),
		routingDir: join(admDir, "routing"),
		schemaDir: join(admDir, "schema"),
	};
}

export function listAdmFiles(root: string): string[] {
	const admDir = resolveAdmPaths(root).admDir;
	if (!existsSync(admDir)) {
		return [];
	}
	const files: string[] = [];
	walkFiles(root, admDir, files);
	return files;
}
