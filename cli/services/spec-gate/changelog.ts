import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteText } from "../io/atomic";

const CHANGELOG_FILE = "CHANGELOG.md";

export type ChangelogEntryType = "decision" | "behavior" | "breaking" | "fix";

function now(): string {
	return new Date().toISOString();
}

function changelogPath(root: string): string {
	return join(root, "docs", "arc", CHANGELOG_FILE);
}

export function addChangelogEntry(
	root: string,
	type: ChangelogEntryType,
	message: string,
): string {
	const path = changelogPath(root);
	const heading = `## ${now()}`;
	const entry = `- ${type}: ${message.trim().replace(/\s+/g, " ")}`;
	const existing = existsSync(path)
		? readFileSync(path, "utf8").replace(/\n*$/g, "")
		: "# Changelog";
	const prefix = existing.length > 0 ? `${existing}\n\n` : "";
	atomicWriteText(path, `${prefix}${heading}\n${entry}\n`);
	return path;
}
