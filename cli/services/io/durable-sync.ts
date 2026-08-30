import { closeSync, fsyncSync, openSync } from "node:fs";

export type DurableSyncOperations = {
	open: (path: string) => number;
	sync: (fd: number) => void;
	close: (fd: number) => void;
};

const systemOperations: DurableSyncOperations = {
	open: (path) => openSync(path, "r"),
	sync: fsyncSync,
	close: closeSync,
};

function isUnsupportedFileSync(
	error: unknown,
	platform: NodeJS.Platform,
): boolean {
	return (
		platform === "win32" &&
		(error as NodeJS.ErrnoException | null)?.code === "EPERM"
	);
}

function isUnsupportedDirectorySync(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code;
	return (
		code === "EBADF" ||
		code === "EINVAL" ||
		code === "ENOTSUP" ||
		code === "EOPNOTSUPP"
	);
}

export function syncFileDurably(
	path: string,
	operations: DurableSyncOperations = systemOperations,
	platform: NodeJS.Platform = process.platform,
): void {
	const fd = operations.open(path);
	try {
		try {
			operations.sync(fd);
		} catch (error) {
			// Bun on Windows can reject regular-file fsync with EPERM after the
			// write succeeds. Preserve atomic replacement while failing closed for
			// every other platform and I/O error.
			if (!isUnsupportedFileSync(error, platform)) throw error;
		}
	} finally {
		operations.close(fd);
	}
}

export function syncDirectoryDurablyIfSupported(
	path: string,
	options: {
		platform?: NodeJS.Platform;
		operations?: DurableSyncOperations;
	} = {},
): void {
	if ((options.platform ?? process.platform) === "win32") return;
	const operations = options.operations ?? systemOperations;
	let fd: number;
	try {
		fd = operations.open(path);
	} catch (error) {
		if (isUnsupportedDirectorySync(error)) return;
		throw error;
	}
	try {
		try {
			operations.sync(fd);
		} catch (error) {
			if (!isUnsupportedDirectorySync(error)) throw error;
		}
	} finally {
		operations.close(fd);
	}
}
