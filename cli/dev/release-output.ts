import {
	existsSync,
	lstatSync,
	mkdirSync,
	realpathSync,
	type Stats,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

type PathIdentity = {
	path: string;
	dev: string;
	ino: string;
};

export type ReleaseOutputGuard = {
	root: PathIdentity;
	directories: PathIdentity[];
	outputPath: string;
};

function samePath(left: string, right: string): boolean {
	const a = resolve(left);
	const b = resolve(right);
	return process.platform === "win32"
		? a.toLowerCase() === b.toLowerCase()
		: a === b;
}

function identity(path: string, stat: Stats): PathIdentity {
	return { path, dev: String(stat.dev), ino: String(stat.ino) };
}

function sameIdentity(left: PathIdentity, right: PathIdentity): boolean {
	return (
		samePath(left.path, right.path) &&
		left.dev === right.dev &&
		left.ino === right.ino
	);
}

function assertRealDirectory(path: string, label: string): PathIdentity {
	const stat = lstatSync(path);
	if (stat.isSymbolicLink() || !stat.isDirectory()) {
		throw new Error(`${label} must be a real directory`);
	}
	if (!samePath(realpathSync(path), path)) {
		throw new Error(`${label} must not cross a reparse point`);
	}
	return identity(path, stat);
}

function assertRealFile(path: string, label: string): void {
	const stat = lstatSync(path);
	if (stat.isSymbolicLink() || !stat.isFile() || Number(stat.nlink) !== 1) {
		throw new Error(`${label} must be a regular, unlinked file`);
	}
	if (!samePath(realpathSync(path), path)) {
		throw new Error(`${label} must not cross a reparse point`);
	}
}

function assertContained(root: string, target: string): void {
	const relation = relative(root, target);
	if (
		relation.length === 0 ||
		relation === ".." ||
		relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
		isAbsolute(relation)
	) {
		throw new Error("release output must stay inside the release root");
	}
}

function ensureRealDirectory(path: string, label: string): PathIdentity {
	if (!existsSync(path)) {
		const parent = dirname(path);
		assertRealDirectory(parent, "release output parent directory");
		mkdirSync(path);
	}
	return assertRealDirectory(path, label);
}

/**
 * Prepare an output path without following directory reparse points. Call the
 * paired stability assertion immediately after a write or subprocess build.
 */
export function prepareReleaseOutputFile(
	cwd: string,
	outputPath: string,
): ReleaseOutputGuard {
	const rootPath = resolve(cwd);
	const targetPath = resolve(outputPath);
	assertContained(rootPath, targetPath);
	const root = assertRealDirectory(rootPath, "release root");
	const directories = [root];
	const parent = dirname(targetPath);
	const segments = relative(rootPath, parent).split(/[\\/]/).filter(Boolean);
	let current = rootPath;
	for (const segment of segments) {
		current = join(current, segment);
		directories.push(ensureRealDirectory(current, "release output directory"));
	}
	if (existsSync(targetPath)) {
		assertRealFile(targetPath, "release output file");
	}
	return { root, directories, outputPath: targetPath };
}

/** Re-check directory identities and the written output after every write. */
export function assertReleaseOutputFileStable(
	guard: ReleaseOutputGuard,
	requireOutputFile = false,
): void {
	for (const expected of guard.directories) {
		const actual = assertRealDirectory(
			expected.path,
			"release output directory",
		);
		if (!sameIdentity(expected, actual)) {
			throw new Error("release output directory changed during write");
		}
	}
	if (requireOutputFile || existsSync(guard.outputPath)) {
		assertRealFile(guard.outputPath, "release output file");
	}
}

/** Validate an already-existing release artifact before it is read or hashed. */
export function assertSafeReleaseArtifact(
	cwd: string,
	artifactPath: string,
): void {
	const guard = prepareReleaseOutputFile(cwd, artifactPath);
	assertReleaseOutputFileStable(guard, true);
}
