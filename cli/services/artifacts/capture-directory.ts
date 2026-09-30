import { randomUUID } from "node:crypto";
import {
	closeSync,
	constants,
	fstatSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readlinkSync,
	readSync,
	realpathSync,
	renameSync,
	type Stats,
	unlinkSync,
	writeSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";

function sameFile(left: Stats, right: Stats): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.size === right.size &&
		left.mtimeMs === right.mtimeMs &&
		left.ctimeMs === right.ctimeMs
	);
}

/** Capture-only Linux directory handles: every IO leaf stays under an admitted parent. */
export class CaptureDirectory {
	private readonly fd: number;
	private readonly expectedPath: string;
	private constructor(fd: number, expectedPath: string) {
		this.fd = fd;
		this.expectedPath = expectedPath;
	}

	static open(
		root: string,
		relativeDir: string,
		create: boolean,
	): CaptureDirectory | null {
		if (process.platform !== "linux")
			throw new Error(
				"durable artifact capture requires Linux directory handles; other platforms are experimental",
			);
		const parts = relativeDir
			.split("/")
			.filter((part) => part !== "." && part.length > 0);
		if (
			isAbsolute(relativeDir) ||
			relativeDir.includes("\\") ||
			parts.includes("..")
		)
			throw new Error("artifact directory is outside the project root");
		let expected = realpathSync(root);
		let fd = openSync(
			expected,
			constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
		);
		try {
			for (const part of parts) {
				if (readlinkSync(`/proc/self/fd/${fd}`) !== expected)
					throw new Error("artifact directory identity changed");
				const next = `/proc/self/fd/${fd}/${part}`;
				if (create) {
					try {
						mkdirSync(next);
						fsyncSync(fd);
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
					}
				}
				let nextFd: number;
				try {
					nextFd = openSync(
						next,
						constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
					);
				} catch (error) {
					if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") {
						closeSync(fd);
						return null;
					}
					throw error;
				}
				closeSync(fd);
				fd = nextFd;
				expected = join(expected, part);
			}
			const directory = new CaptureDirectory(fd, expected);
			directory.assertAttached();
			return directory;
		} catch (error) {
			closeSync(fd);
			throw error;
		}
	}

	close(): void {
		closeSync(this.fd);
	}

	assertAttached(): void {
		if (
			readlinkSync(`/proc/self/fd/${this.fd}`) !== this.expectedPath ||
			realpathSync(this.expectedPath) !== this.expectedPath
		)
			throw new Error("artifact directory identity changed");
	}

	private leaf(name: string): string {
		if (!name || name === "." || name === ".." || /[\\/\0]/.test(name))
			throw new Error("artifact file name is invalid");
		this.assertAttached();
		return `/proc/self/fd/${this.fd}/${name}`;
	}

	stat(name: string): Stats | null {
		try {
			return lstatSync(this.leaf(name));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	}

	read(
		name: string,
		limit: number,
		allowedLinks: readonly number[] = [1],
	): { bytes: Buffer; stat: Stats } | null {
		const path = this.leaf(name);
		const before = this.stat(name);
		if (!before) return null;
		if (
			!before.isFile() ||
			!allowedLinks.includes(before.nlink) ||
			before.size > limit
		)
			throw new Error(
				"artifact source integrity requires a bounded regular file without unexpected links",
			);
		const fd = openSync(
			path,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		try {
			const opened = fstatSync(fd);
			if (
				!opened.isFile() ||
				!sameFile(before, opened) ||
				!allowedLinks.includes(opened.nlink)
			)
				throw new Error("artifact source integrity changed during open");
			const bytes = Buffer.allocUnsafe(limit + 1);
			let offset = 0;
			while (offset < bytes.length) {
				const count = readSync(fd, bytes, offset, bytes.length - offset, null);
				if (!count) break;
				offset += count;
			}
			const after = fstatSync(fd);
			const current = this.stat(name);
			if (
				offset > limit ||
				!sameFile(opened, after) ||
				!current ||
				!sameFile(after, current) ||
				after.nlink !== opened.nlink
			)
				throw new Error("artifact source integrity changed during read");
			this.assertAttached();
			return { bytes: bytes.subarray(0, offset), stat: after };
		} finally {
			closeSync(fd);
		}
	}

	unlinkOwned(name: string, expected: Stats): void {
		const current = this.stat(name);
		if (
			!current ||
			!sameFile(current, expected) ||
			current.nlink !== expected.nlink
		)
			throw new Error("artifact temp integrity changed before cleanup");
		unlinkSync(this.leaf(name));
		fsyncSync(this.fd);
	}

	private write(fd: number, bytes: Buffer): void {
		let offset = 0;
		while (offset < bytes.length) {
			const written = writeSync(fd, bytes, offset, bytes.length - offset);
			if (written <= 0) throw new Error("artifact write made no progress");
			offset += written;
		}
		fsyncSync(fd);
	}

	writeAtomic(name: string, content: string): void {
		const temp = `.${name}.${randomUUID()}.tmp`;
		const fd = openSync(
			this.leaf(temp),
			constants.O_WRONLY |
				constants.O_CREAT |
				constants.O_EXCL |
				constants.O_NOFOLLOW,
		);
		try {
			this.write(fd, Buffer.from(content));
			const current = this.stat(temp);
			if (!current || !sameFile(current, fstatSync(fd)))
				throw new Error("artifact marker temp integrity changed");
			renameSync(this.leaf(temp), this.leaf(name));
			fsyncSync(this.fd);
			this.assertAttached();
		} finally {
			try {
				const current = this.stat(temp);
				if (current && sameFile(current, fstatSync(fd)))
					this.unlinkOwned(temp, current);
			} finally {
				closeSync(fd);
			}
		}
	}

	publish(
		name: string,
		content: string,
		afterTempOpen?: (fd: number) => void,
	): void {
		const temp = `.${name}.tmp`;
		const fd = openSync(
			this.leaf(temp),
			constants.O_WRONLY |
				constants.O_CREAT |
				constants.O_EXCL |
				constants.O_NOFOLLOW,
		);
		try {
			afterTempOpen?.(fd);
			this.write(fd, Buffer.from(content));
			const written = fstatSync(fd);
			const tempStat = this.stat(temp);
			if (!tempStat || !sameFile(written, tempStat) || tempStat.nlink !== 1)
				throw new Error("artifact publication temp integrity changed");
			linkSync(this.leaf(temp), this.leaf(name));
			const published = this.stat(name);
			const linked = fstatSync(fd);
			if (!published || !sameFile(published, linked) || linked.nlink !== 2)
				throw new Error("artifact publication identity changed");
			this.unlinkOwned(temp, linked);
			this.assertAttached();
		} finally {
			closeSync(fd);
		}
	}
}
