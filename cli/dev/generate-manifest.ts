#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

import { kernelRegistry } from "../registry";
import { buildManifestCommands } from "../services/manifest/commands";
import { buildToolCatalog } from "../services/manifest/tools";

const MANIFEST_PATHS = [
	".agents/manifest.json",
	"src/project-template/.agents/manifest.json",
] as const;

const TOOL_CATALOG_PATHS = [
	".afol/adm/tools.json",
	"src/project-template/.afol/adm/tools.json",
] as const;

const MANAGED_HASH_PATHS = [
	".agents/manifest.json",
	".agents/lock.json",
	"src/project-template/.agents/manifest.json",
	"src/project-template/.agents/lock.json",
] as const;

const TEMPLATE_MANAGED_HASH_FILES = [
	".afol/adm/tools.json",
	".afol/data/events/README.md",
	".afol/data/index/README.md",
	".afol/data/telemetry/schemas/event.json",
	".afol/tmp/README.md",
	".agents/skills/README.md",
] as const;

const TEMPLATE_MANAGED_HASH_DIRS = [
	".afol/adm/hooks",
	".afol/adm/rules",
	".afol/adm/source/universal-skills",
] as const;

type ManifestPayload = {
	commands?: unknown;
	managed_hashes?: unknown;
	[key: string]: unknown;
};

function formatJson(payload: unknown): string {
	return `${JSON.stringify(payload, null, 2)}\n`;
}

function readJsonObject(path: string): ManifestPayload {
	const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`${path} must contain a JSON object`);
	}
	return parsed as ManifestPayload;
}

function sha256Hex(content: Buffer): string {
	return createHash("sha256").update(content).digest("hex");
}

function managedHashRoot(repoRoot: string, manifestPath: string): string {
	return manifestPath.startsWith("src/project-template/")
		? join(repoRoot, "src/project-template")
		: repoRoot;
}

function toTemplatePath(root: string, absolutePath: string): string {
	return relative(root, absolutePath).split("\\").join("/");
}

function collectFiles(
	root: string,
	relativeDir: string,
	out: Set<string>,
): void {
	const absoluteDir = join(root, relativeDir);
	if (!existsSync(absoluteDir)) {
		return;
	}
	for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
		const absolutePath = join(absoluteDir, entry.name);
		if (entry.isDirectory()) {
			collectFiles(root, toTemplatePath(root, absolutePath), out);
			continue;
		}
		if (entry.isFile()) {
			out.add(toTemplatePath(root, absolutePath));
		}
	}
}

function collectTemplateManagedHashPaths(root: string): string[] {
	const paths = new Set<string>();
	for (const path of TEMPLATE_MANAGED_HASH_FILES) {
		const absolutePath = join(root, path);
		if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
			paths.add(path);
		}
	}
	for (const path of TEMPLATE_MANAGED_HASH_DIRS) {
		collectFiles(root, path, paths);
	}
	return [...paths].sort();
}

function refreshManagedHashes(
	repoRoot: string,
	manifestPath: string,
	managedHashes: unknown,
): Record<string, string> | undefined {
	if (
		!managedHashes ||
		typeof managedHashes !== "object" ||
		Array.isArray(managedHashes)
	) {
		return undefined;
	}

	const root = managedHashRoot(repoRoot, manifestPath);
	const refreshed: Record<string, string> = {};
	const paths = manifestPath.startsWith("src/project-template/")
		? collectTemplateManagedHashPaths(root)
		: Object.keys(managedHashes).sort();
	for (const path of paths) {
		const absolutePath = join(root, path);
		if (!existsSync(absolutePath)) {
			continue;
		}
		refreshed[path] = sha256Hex(readFileSync(absolutePath));
	}
	return refreshed;
}

function refreshManagedHashPayload(path: string): {
	changed: boolean;
	content: string;
} {
	const payload = readJsonObject(path);
	const repoRoot = resolve(import.meta.dir, "..", "..");
	const relativePath = relative(repoRoot, path);
	const managedHashes = refreshManagedHashes(
		repoRoot,
		relativePath,
		payload.managed_hashes,
	);
	const next = {
		...payload,
	};
	if (managedHashes) {
		next.managed_hashes = managedHashes;
	}
	const content = formatJson(next);
	const changed = readFileSync(path, "utf8") !== content;
	return { changed, content };
}

function refreshManifest(path: string): { changed: boolean; content: string } {
	const manifest = readJsonObject(path);
	const next = {
		...manifest,
		commands: buildManifestCommands(kernelRegistry.commands),
	};
	const content = formatJson(next);
	const changed = readFileSync(path, "utf8") !== content;
	return { changed, content };
}

function refreshToolCatalog(path: string): {
	changed: boolean;
	content: string;
} {
	const content = formatJson(buildToolCatalog(kernelRegistry.commands));
	return { changed: readFileSync(path, "utf8") !== content, content };
}

function main(): void {
	const repoRoot = resolve(import.meta.dir, "..", "..");
	const checkOnly = process.argv.includes("--check");
	const changedPaths: string[] = [];

	for (const toolCatalogPath of TOOL_CATALOG_PATHS) {
		const absolutePath = join(repoRoot, toolCatalogPath);
		const result = refreshToolCatalog(absolutePath);
		if (!result.changed) {
			continue;
		}
		changedPaths.push(toolCatalogPath);
		if (!checkOnly) {
			writeFileSync(absolutePath, result.content, "utf8");
		}
	}

	for (const path of MANAGED_HASH_PATHS) {
		const absolutePath = join(repoRoot, path);
		if (!existsSync(absolutePath)) {
			continue;
		}
		const result = refreshManagedHashPayload(absolutePath);
		if (!result.changed) {
			continue;
		}
		changedPaths.push(relative(repoRoot, absolutePath));
		if (!checkOnly) {
			writeFileSync(absolutePath, result.content, "utf8");
		}
	}

	for (const manifestPath of MANIFEST_PATHS) {
		const absolutePath = join(repoRoot, manifestPath);
		const result = refreshManifest(absolutePath);
		if (!result.changed) {
			continue;
		}
		const changedPath = relative(repoRoot, absolutePath);
		if (!changedPaths.includes(changedPath)) {
			changedPaths.push(changedPath);
		}
		if (!checkOnly) {
			writeFileSync(absolutePath, result.content, "utf8");
		}
	}

	if (checkOnly && changedPaths.length > 0) {
		throw new Error(
			[
				"manifest metadata is out of sync with registry/template payload:",
				...changedPaths.map((path) => ` - ${path}`),
				"Run `bun run manifest:generate`.",
			].join("\n"),
		);
	}

	console.log(
		changedPaths.length === 0
			? "manifest metadata already synced"
			: `manifest metadata synced: ${changedPaths.join(", ")}`,
	);
}

if (import.meta.main) {
	main();
}
