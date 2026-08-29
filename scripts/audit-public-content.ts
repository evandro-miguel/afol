#!/usr/bin/env bun

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? process.cwd());
const findings: string[] = [];
const patterns: Array<[string, RegExp]> = [
	["linux-home-path", /\/home\/[A-Za-z0-9._-]+\//u],
	["mac-home-path", /\/Users\/[A-Za-z0-9._-]+\//u],
	["windows-home-path", /[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z0-9._ -]+[\\/]/u],
	["private-repository-name", /[A-Za-z0-9._-]+-pvt\b/u],
	["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
	["bearer-token", /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/u],
	[
		"github-token",
		/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
	],
	["openai-api-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u],
	["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
	["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/u],
	["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u],
	["stripe-live-key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/u],
	["credentialed-url", /\bhttps?:\/\/[^/\s:@]+:[^/\s@]+@/u],
];

const sensitiveFileNames = new Set([
	".netrc",
	".npmrc",
	".pypirc",
	"id_ed25519",
	"id_rsa",
]);

function sensitiveFileFinding(name: string): string | null {
	const fileName = basename(name);
	if (
		/^\.env(?:\..+)?$/u.test(fileName) &&
		!/^\.env\.(?:example|sample|template)$/u.test(fileName)
	) {
		return "environment-file";
	}
	if (sensitiveFileNames.has(fileName)) return "credential-file";
	if (/\.(?:key|p12|pfx|pem)$/iu.test(fileName)) return "key-material-file";
	return null;
}

function visit(path: string): void {
	const stats = lstatSync(path);
	const name = relative(root, path).split("\\").join("/") || ".";
	if (stats.isSymbolicLink()) {
		findings.push(`${name}: symlink`);
		return;
	}
	if (stats.isDirectory()) {
		if (name === ".afol") {
			findings.push(`${name}: private-state-directory`);
			return;
		}
		if (name === ".agents") {
			findings.push(`${name}: factory-only-directory`);
			return;
		}
		if ([".git", "node_modules", "dist", "coverage"].includes(name)) return;
		for (const entry of readdirSync(path)) visit(join(path, entry));
		return;
	}
	const sensitiveName = sensitiveFileFinding(name);
	if (sensitiveName) findings.push(`${name}: ${sensitiveName}`);
	if (stats.size > 10 * 1024 * 1024) {
		findings.push(`${name}: file-larger-than-10MiB`);
		return;
	}
	const bytes = readFileSync(path);
	if (bytes.includes(0)) {
		findings.push(`${name}: binary-file`);
		return;
	}
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
