#!/usr/bin/env bun

import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

type ExportConfig = {
	files: string[];
	directories: string[];
	mapped_directories: Record<string, string>;
	exclude: string[];
};

type PackageManifest = {
	scripts?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

const factoryOnlyScripts = [
	"coverage:project-benchmarks",
	"validate:mutation-performance",
	"benchmark:multitask",
	"benchmark:multitask:smoke",
	"benchmark:multitask:json",
	"validate:project-benchmarks",
	"validate:ux-governance",
] as const;

const factoryOnlyDevDependencies = ["ajv", "ajv-formats"] as const;

const repoRoot = resolve(import.meta.dir, "..");
const config = JSON.parse(
	readFileSync(join(import.meta.dir, "public-files.json"), "utf8"),
) as ExportConfig;
const targetArg = process.argv[2];

if (!targetArg) {
	throw new Error("usage: bun run public:export -- <empty-target-directory>");
}

const targetRoot = resolve(targetArg);
if (targetRoot === repoRoot || targetRoot.startsWith(`${repoRoot}/.git`)) {
	throw new Error("public export target must not be the source repository");
}
if (existsSync(targetRoot) && readdirSync(targetRoot).length > 0) {
	throw new Error(`public export target must be empty: ${targetRoot}`);
}
mkdirSync(targetRoot, { recursive: true });

const excluded = new Set(config.exclude);
function isExcluded(relativePath: string): boolean {
	return [...excluded].some(
		(entry) => relativePath === entry || relativePath.startsWith(`${entry}/`),
	);
}

function copyEntry(sourcePath: string, destinationPath: string): void {
	const sourceRelative = relative(repoRoot, sourcePath).split("\\").join("/");
	if (isExcluded(sourceRelative)) return;

	const stats = lstatSync(sourcePath);
	if (stats.isSymbolicLink()) {
		const target = readlinkSync(sourcePath);
		if (isAbsolute(target)) {
			throw new Error(`absolute symlink is forbidden in public export: ${sourceRelative}`);
		}
		mkdirSync(dirname(destinationPath), { recursive: true });
		symlinkSync(target, destinationPath);
		return;
	}
	if (stats.isDirectory()) {
		mkdirSync(destinationPath, { recursive: true });
		for (const entry of readdirSync(sourcePath)) {
			copyEntry(join(sourcePath, entry), join(destinationPath, entry));
		}
		return;
	}
	mkdirSync(dirname(destinationPath), { recursive: true });
	cpSync(sourcePath, destinationPath, { preserveTimestamps: true });
}

for (const path of config.files) {
	const source = join(repoRoot, path);
	if (!existsSync(source)) throw new Error(`missing public file: ${path}`);
	copyEntry(source, join(targetRoot, path));
}
for (const path of config.directories) {
	const source = join(repoRoot, path);
	if (!existsSync(source)) throw new Error(`missing public directory: ${path}`);
	copyEntry(source, join(targetRoot, path));
}
for (const [sourcePath, destinationPath] of Object.entries(
	config.mapped_directories,
)) {
	const source = join(repoRoot, sourcePath);
	if (!existsSync(source)) {
		throw new Error(`missing mapped public directory: ${sourcePath}`);
	}
	copyEntry(source, join(targetRoot, destinationPath));
}

const packagePath = join(targetRoot, "package.json");
const packageManifest = JSON.parse(
	readFileSync(packagePath, "utf8"),
) as PackageManifest;
for (const script of factoryOnlyScripts) {
	delete packageManifest.scripts?.[script];
}
for (const dependency of factoryOnlyDevDependencies) {
	delete packageManifest.devDependencies?.[dependency];
}
writeFileSync(packagePath, `${JSON.stringify(packageManifest, null, "\t")}\n`);

const lockfileResult = Bun.spawnSync(
	["bun", "install", "--lockfile-only", "--no-progress"],
	{
		cwd: targetRoot,
		stdout: "pipe",
		stderr: "pipe",
	},
);
if (lockfileResult.exitCode !== 0) {
	throw new Error(
		`failed to generate public lockfile: ${lockfileResult.stderr.toString().trim()}`,
	);
}

console.log(`public export created: ${targetRoot}`);
