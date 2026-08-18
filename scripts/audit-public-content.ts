#!/usr/bin/env bun

import { lstatSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? process.cwd());
const findings: string[] = [];
const patterns: Array<[string, RegExp]> = [
	["linux-home-path", /\/home\/[A-Za-z0-9._-]+\//u],
	["mac-home-path", /\/Users\/[A-Za-z0-9._-]+\//u],
	["windows-drive-path", /[A-Za-z]:\\Users\\/u],
	["private-repository-name", /[A-Za-z0-9._-]+-pvt\b/u],
	["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
	["bearer-token", /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/u],
];

function visit(path: string): void {
	const stats = lstatSync(path);
	const name = relative(root, path).split("\\").join("/") || ".";
	if (stats.isSymbolicLink()) {
		const target = readlinkSync(path);
		if (isAbsolute(target)) findings.push(`${name}: absolute-symlink`);
		return;
	}
	if (stats.isDirectory()) {
		if ([".git", "node_modules", "dist", "coverage"].includes(name)) return;
		for (const entry of readdirSync(path)) visit(join(path, entry));
		return;
	}
	if (stats.size > 10 * 1024 * 1024) {
		findings.push(`${name}: file-larger-than-10MiB`);
		return;
	}
	const bytes = readFileSync(path);
	if (bytes.includes(0)) return;
	const content = bytes.toString("utf8");
	for (const [id, pattern] of patterns) {
		if (content.includes(`public-audit-allow: ${id}`)) continue;
		if (pattern.test(content)) findings.push(`${name}: ${id}`);
	}
}

visit(root);
if (findings.length > 0) {
	throw new Error(`public content audit failed:\n${findings.join("\n")}`);
}
console.log(`public content audit passed: ${root}`);
