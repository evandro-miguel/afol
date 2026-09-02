import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
	syncDirectoryDurablyIfSupported,
	syncFileDurably,
} from "./durable-sync";

function sanitizeTempLabel(path: string): string {
	return path
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/\.{2,}/g, "_")
		.replace(/\s+/g, "-")
		.replace(/^$/g, "file");
}

export function atomicWriteText(
	path: string,
	content: string,
	options: { syncDirectory?: boolean } = {},
): void {
	atomicWrite(path, content, options);
}

export function atomicWriteBytes(
	path: string,
	content: Uint8Array,
	options: { syncDirectory?: boolean } = {},
): void {
	atomicWrite(path, content, options);
}

function atomicWrite(
	path: string,
	content: string | Uint8Array,
	options: { syncDirectory?: boolean } = {},
): void {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });
	const tempPath = join(
		dir,
		`.${sanitizeTempLabel(basename(path)).slice(0, 64)}.${process.pid}.${randomUUID()}.tmp`,
	);
	try {
		writeFileSync(tempPath, content, { flag: "wx" });
		syncFileDurably(tempPath);
		renameSync(tempPath, path);
		if (options.syncDirectory !== false) {
			syncDirectoryDurablyIfSupported(dir);
		}
	} catch (error) {
		if (existsSync(tempPath)) {
			rmSync(tempPath, { force: true });
		}
		throw error;
	}
}
