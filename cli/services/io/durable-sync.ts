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
): void {
	const fd = operations.open(path);
	try {
		operations.sync(fd);
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
