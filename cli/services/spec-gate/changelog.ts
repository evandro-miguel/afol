import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveAdmPaths } from "../adm";
import { atomicWriteText } from "../io/atomic";

export type ChangelogEntryType = "decision" | "behavior" | "breaking" | "fix";

function now(): string {
	return new Date().toISOString();
}

function changelogPath(root: string): string {
	return resolveAdmPaths(root).changelogFile;
}

export function addChangelogEntry(
	root: string,
	type: ChangelogEntryType,
	message: string,
): string {
	const path = changelogPath(root);
	const heading = `## ${now()}`;
	const entry = `- ${type}: ${message.trim().replace(/\s+/g, " ")}`;
	mkdirSync(dirname(path), { recursive: true });
	const existing = existsSync(path)
		? readFileSync(path, "utf8").replace(/\n*$/g, "")
		: "# Changelog";
	const prefix = existing.length > 0 ? `${existing}\n\n` : "";
	atomicWriteText(path, `${prefix}${heading}\n${entry}\n`);
	return path;
}
