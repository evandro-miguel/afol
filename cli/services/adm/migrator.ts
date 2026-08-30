import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWriteBytes, atomicWriteText } from "../io/atomic";
import { resolveProjectPath, resolveProjectWritePath } from "../project/root";
import { type AdmManifestEntry, buildAdmMigrationPlan } from "./planner";

export type AdmMigrationArchive = {
	generated_at: string;
	count: number;
	manifest: AdmManifestEntry[];
};

export type AdmMigrationResult = AdmMigrationArchive & {
	archive_path: string;
};

type ArchivePath = {
	relativePath: string;
	path: string;
};

function formatTimestamp(now: Date): string {
	const date = [
		now.getUTCFullYear(),
		String(now.getUTCMonth() + 1).padStart(2, "0"),
		String(now.getUTCDate()).padStart(2, "0"),
	].join("");
	const time = [
		String(now.getUTCHours()).padStart(2, "0"),
		String(now.getUTCMinutes()).padStart(2, "0"),
		String(now.getUTCSeconds()).padStart(2, "0"),
		String(now.getUTCMilliseconds()).padStart(3, "0"),
	].join("");
	return `${date}T${time}Z`;
}

function resolveReadTarget(root: string, relativePath: string): string {
	const resolved = resolveProjectPath(root, relativePath);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	return resolved.value.path;
}

function resolveWriteTarget(root: string, relativePath: string): string {
	const resolved = resolveProjectWritePath(root, relativePath);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	return resolved.value.path;
}

function nextArchivePath(root: string, now = new Date()): ArchivePath {
	const base = `${formatTimestamp(now)}_adm-migration`;
	let candidate = `.afol/adm/migrations/${base}.json`;
	let suffix = 1;
	let resolved = resolveWriteTarget(root, candidate);
	while (existsSync(resolved)) {
		candidate = `.afol/adm/migrations/${base}-${suffix}.json`;
		suffix += 1;
		resolved = resolveWriteTarget(root, candidate);
	}
	mkdirSync(dirname(resolved), { recursive: true });
	return { relativePath: candidate, path: resolved };
}

export function migrateAdm(root: string, now = new Date()): AdmMigrationResult {
	const plan = buildAdmMigrationPlan(root);
	for (const entry of plan.manifest) {
		const absoluteTarget = resolveWriteTarget(root, entry.target_path);
		const absoluteSource = resolveReadTarget(root, entry.source_path);
		atomicWriteBytes(absoluteTarget, readFileSync(absoluteSource));
	}

	const archivePath = nextArchivePath(root, now);
	const archive: AdmMigrationArchive = {
		generated_at: now.toISOString(),
		count: plan.manifest.length,
		manifest: plan.manifest,
	};
	atomicWriteText(archivePath.path, `${JSON.stringify(archive, null, 2)}\n`);

	return {
		...archive,
		archive_path: archivePath.relativePath,
	};
}
