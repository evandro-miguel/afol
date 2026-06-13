import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { atomicWriteText } from "../io/atomic";
import { buildAdmMigrationPlan, type AdmManifestEntry } from "./planner";

export type AdmMigrationArchive = {
	generated_at: string;
	count: number;
	manifest: AdmManifestEntry[];
};

export type AdmMigrationResult = AdmMigrationArchive & {
	archive_path: string;
};

function fsyncPath(path: string): void {
	let fd: number | null = null;
	try {
		fd = openSync(path, "r");
		fsyncSync(fd);
	} catch {
		// Some filesystems do not support directory fsync.
	} finally {
		if (fd !== null) {
			closeSync(fd);
		}
	}
}

function sanitizeTempLabel(path: string): string {
	return path
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/\.{2,}/g, "_")
		.replace(/\s+/g, "-")
		.replace(/^$/g, "file");
}

function atomicWriteBytes(path: string, content: Uint8Array): void {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });
	const tempPath = join(
		dir,
		`.${sanitizeTempLabel(path)}.${process.pid}.${Date.now()}.tmp`,
	);
	try {
		writeFileSync(tempPath, content);
		fsyncPath(tempPath);
		renameSync(tempPath, path);
		fsyncPath(dir);
	} catch (error) {
		if (existsSync(tempPath)) {
			rmSync(tempPath, { force: true });
		}
		throw error;
	}
}

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

function nextArchivePath(root: string): string {
	const migrationsDir = join(root, ".afol", "adm", "migrations");
	const base = `${formatTimestamp(new Date())}_adm-migration`;
	let candidate = `.afol/adm/migrations/${base}.json`;
	let suffix = 1;
	while (existsSync(join(root, candidate))) {
		candidate = `.afol/adm/migrations/${base}-${suffix}.json`;
		suffix += 1;
	}
	mkdirSync(migrationsDir, { recursive: true });
	return candidate;
}

export function migrateAdm(root: string): AdmMigrationResult {
	const plan = buildAdmMigrationPlan(root);
	for (const entry of plan.manifest) {
		const absoluteTarget = join(root, entry.target_path);
		mkdirSync(dirname(absoluteTarget), { recursive: true });
		const absoluteSource = join(root, entry.source_path);
		atomicWriteBytes(absoluteTarget, readFileSync(absoluteSource));
	}

	const archive_path = nextArchivePath(root);
	const archive: AdmMigrationArchive = {
		generated_at: new Date().toISOString(),
		count: plan.manifest.length,
		manifest: plan.manifest,
	};
	atomicWriteText(join(root, archive_path), `${JSON.stringify(archive, null, 2)}\n`);

	return {
		...archive,
		archive_path,
	};
}
