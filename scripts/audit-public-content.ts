#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? process.cwd());
const findings: string[] = [];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
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

function auditContent(name: string, bytes: Uint8Array): void {
	const sensitiveName = sensitiveFileFinding(name);
	if (sensitiveName) findings.push(`${name}: ${sensitiveName}`);
	if (bytes.byteLength > MAX_FILE_BYTES) {
		findings.push(`${name}: file-larger-than-10MiB`);
		return;
	}
	if (bytes.includes(0)) {
		findings.push(`${name}: binary-file`);
		return;
	}
	const content = Buffer.from(bytes).toString("utf8");
	for (const [id, pattern] of patterns) {
		if (pattern.test(content)) findings.push(`${name}: ${id}`);
	}
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
	auditContent(name, readFileSync(path));
}

type ReachableBlob = {
	paths: string[];
};

function gitOutput(args: string[], input?: string): Buffer | null {
	try {
		return execFileSync("git", args, {
			cwd: root,
			maxBuffer: 256 * 1024 * 1024,
			...(input === undefined ? {} : { input }),
		});
	} catch {
		return null;
	}
}

function historyPathFinding(path: string): string | null {
	const [rootEntry] = path.split(/[\\/]/u);
	if (rootEntry === ".afol") return "private-state-directory";
	if (rootEntry === ".agents") return "factory-only-directory";
	return sensitiveFileFinding(path);
}

function auditReachableHistory(): void {
	if (!lstatSync(join(root, ".git"), { throwIfNoEntry: false })) return;
	const shallowState = gitOutput(["rev-parse", "--is-shallow-repository"])
		?.toString("utf8")
		.trim();
	if (shallowState === "true") {
		findings.push(".git: shallow-repository");
		return;
	}
	if (shallowState !== "false") {
		findings.push(".git: reachable-history-audit");
		return;
	}
	const listing = gitOutput(["rev-list", "--objects", "--all"]);
	if (!listing) {
		findings.push(".git: reachable-history-audit");
		return;
	}
	const pathsByObject = new Map<string, Set<string>>();
	for (const line of listing.toString("utf8").split("\n")) {
		const separator = line.indexOf(" ");
		if (separator < 1) continue;
		const objectId = line.slice(0, separator);
		const path = line.slice(separator + 1);
		if (!path) continue;
		const paths = pathsByObject.get(objectId) ?? new Set<string>();
		paths.add(path);
		pathsByObject.set(objectId, paths);
	}
	if (pathsByObject.size === 0) return;

	const objectIds = [...pathsByObject.keys()];
	const metadata = gitOutput(
		["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
		`${objectIds.join("\n")}\n`,
	);
	if (!metadata) {
		findings.push(".git: reachable-history-audit");
		return;
	}
	const blobs = new Map<string, ReachableBlob>();
	for (const line of metadata.toString("utf8").split("\n")) {
		const [objectId, type, sizeText] = line.trim().split(" ");
		if (type !== "blob" || !objectId) continue;
		const paths = pathsByObject.get(objectId);
		if (!paths) continue;
		const pathList = [...paths];
		for (const path of pathList) {
			const finding = historyPathFinding(path);
			if (finding) findings.push(`history/${path}: ${finding}`);
		}
		const size = Number(sizeText);
		if (!Number.isSafeInteger(size) || size < 0) {
			findings.push(`history/${pathList[0]}: reachable-history-audit`);
			continue;
		}
		if (size > MAX_FILE_BYTES) {
			findings.push(`history/${pathList[0]}: file-larger-than-10MiB`);
			continue;
		}
		blobs.set(objectId, { paths: pathList });
	}
	if (blobs.size === 0) return;

	const contents = gitOutput(
		["cat-file", "--batch"],
		`${[...blobs.keys()].join("\n")}\n`,
	);
	if (!contents) {
		findings.push(".git: reachable-history-audit");
		return;
	}
	let offset = 0;
	for (const [objectId, blob] of blobs) {
		const headerEnd = contents.indexOf(10, offset);
		if (headerEnd < 0) {
			findings.push(".git: reachable-history-audit");
			return;
		}
		const [reportedId, type, sizeText] = contents
			.subarray(offset, headerEnd)
			.toString("utf8")
			.split(" ");
		const size = Number(sizeText);
		const contentStart = headerEnd + 1;
		const contentEnd = contentStart + size;
		if (
			reportedId !== objectId ||
			type !== "blob" ||
			!Number.isSafeInteger(size) ||
			size < 0 ||
			contentEnd >= contents.length ||
			contents[contentEnd] !== 10
		) {
			findings.push(".git: reachable-history-audit");
			return;
		}
		auditContent(
			`history/${blob.paths[0]}`,
			contents.subarray(contentStart, contentEnd),
		);
		offset = contentEnd + 1;
	}
}

visit(root);
auditReachableHistory();
if (findings.length > 0) {
	throw new Error(`public content audit failed:\n${findings.join("\n")}`);
}
console.log(`public content audit passed: ${root}`);
