import { randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

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

export function atomicWriteText(
	path: string,
	content: string,
	options: { syncDirectory?: boolean } = {},
): void {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });
	const tempPath = join(
		dir,
		`.${sanitizeTempLabel(basename(path)).slice(0, 64)}.${process.pid}.${randomUUID()}.tmp`,
	);
	try {
		writeFileSync(tempPath, content, "utf8");
		fsyncPath(tempPath);
		renameSync(tempPath, path);
		if (options.syncDirectory !== false) {
			fsyncPath(dir);
		}
	} catch (error) {
		if (existsSync(tempPath)) {
			rmSync(tempPath, { force: true });
		}
		throw error;
	}
}
