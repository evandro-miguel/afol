import { describe, expect, test } from "bun:test";
import {
	type DurableSyncOperations,
	syncDirectoryDurablyIfSupported,
	syncFileDurably,
} from "../services/io/durable-sync";

function failure(code: string): NodeJS.ErrnoException {
	return Object.assign(new Error(code), { code });
}

function operations(
	options: {
		openError?: NodeJS.ErrnoException;
		syncError?: NodeJS.ErrnoException;
	} = {},
): { io: DurableSyncOperations; closed: number[]; opened: string[] } {
	const closed: number[] = [];
	const opened: string[] = [];
	return {
		closed,
		opened,
		io: {
			open: (path) => {
				opened.push(path);
				if (options.openError) throw options.openError;
				return 42;
			},
			sync: () => {
				if (options.syncError) throw options.syncError;
			},
			close: (fd) => closed.push(fd),
		},
	};
}

describe("durable sync", () => {
	test("propagates file fsync failures and still closes the descriptor", () => {
		const fake = operations({ syncError: failure("EIO") });
		expect(() => syncFileDurably("artifact", fake.io)).toThrow("EIO");
		expect(fake.opened).toEqual(["artifact"]);
		expect(fake.closed).toEqual([42]);
	});

	test("ignores only Windows file fsync EPERM", () => {
		const windows = operations({ syncError: failure("EPERM") });
		expect(() =>
			syncFileDurably("artifact", windows.io, "win32"),
		).not.toThrow();
		expect(windows.closed).toEqual([42]);

		const linux = operations({ syncError: failure("EPERM") });
		expect(() => syncFileDurably("artifact", linux.io, "linux")).toThrow(
			"EPERM",
		);
		expect(linux.closed).toEqual([42]);
	});

	test("ignores only unsupported directory fsync failures", () => {
		for (const code of ["EBADF", "EINVAL", "ENOTSUP", "EOPNOTSUPP"]) {
			const fake = operations({ syncError: failure(code) });
			expect(() =>
				syncDirectoryDurablyIfSupported("parent", {
					platform: "linux",
					operations: fake.io,
				}),
			).not.toThrow();
			expect(fake.closed).toEqual([42]);
		}
	});

	test("propagates directory I/O failures", () => {
		for (const phase of ["open", "sync"] as const) {
			const fake = operations(
				phase === "open"
					? { openError: failure("EIO") }
					: { syncError: failure("EIO") },
			);
			expect(() =>
				syncDirectoryDurablyIfSupported("parent", {
					platform: "linux",
					operations: fake.io,
				}),
			).toThrow("EIO");
			expect(fake.closed).toEqual(phase === "sync" ? [42] : []);
		}
	});

	test("skips directory fsync on Windows", () => {
		const fake = operations();
		syncDirectoryDurablyIfSupported("parent", {
			platform: "win32",
			operations: fake.io,
		});
		expect(fake.opened).toEqual([]);
		expect(fake.closed).toEqual([]);
	});
});
