import { randomUUID } from "node:crypto";
import {
	chmodSync,
	chownSync,
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

export function atomicWriteTextPreservingMetadata(
	path: string,
	content: string,
	metadata: { mode: number; uid: number; gid: number },
): void {
	atomicWrite(path, content, metadata);
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
	options: {
		syncDirectory?: boolean;
		mode?: number;
		uid?: number;
		gid?: number;
	} = {},
): void {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });
	const tempPath = join(
		dir,
		`.${sanitizeTempLabel(basename(path)).slice(0, 64)}.${process.pid}.${randomUUID()}.tmp`,
	);
	try {
		writeFileSync(tempPath, content, {
			flag: "wx",
			...(options.mode === undefined ? {} : { mode: options.mode & 0o7777 }),
		});
		if (
			options.uid !== undefined &&
			options.gid !== undefined &&
			process.platform !== "win32"
		)
			chownSync(tempPath, options.uid, options.gid);
		if (options.mode !== undefined) chmodSync(tempPath, options.mode & 0o7777);
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
