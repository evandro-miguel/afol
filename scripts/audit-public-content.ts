#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";

const root = resolve(process.argv[2] ?? process.cwd());
const findings: string[] = [];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REACHABLE_BLOB_BYTES = 256 * 1024 * 1024;
const MAX_REACHABLE_OBJECTS = 100_000;
const DEFAULT_ALLOWED_ROOT_DIRECTORIES = new Set([
	".github",
	"cli",
	"docs",
	"examples",
	"scripts",
	"src",
]);
const DEFAULT_ALLOWED_ROOT_FILES = new Set([
	".gitattributes",
	".gitignore",
	".gitleaks.toml",
	"AGENTS.md",
	"CHANGELOG.md",
	"CODE_OF_CONDUCT.md",
	"CONTRIBUTING.md",
	"LICENSE",
	"README.md",
	"ROADMAP.md",
	"SECURITY.md",
	"SUPPORT.md",
	"THIRD_PARTY_NOTICES.md",
	"afol",
	"bun.lock",
	"package.json",
	"tsconfig.json",
]);
type PublicFilesPolicy = {
	allowed_root_directories?: unknown;
	allowed_root_files?: unknown;
};

function stringSet(value: unknown, fallback: Set<string>): Set<string> {
	if (
		!Array.isArray(value) ||
		!value.every((entry) => typeof entry === "string")
	) {
		return fallback;
	}
	return new Set(value);
}

const publicFilesPolicyPath = join(root, "scripts", "public-files.json");
const publicFilesPolicy: PublicFilesPolicy = existsSync(publicFilesPolicyPath)
	? JSON.parse(readFileSync(publicFilesPolicyPath, "utf8"))
	: {};
const allowedRootDirectories = stringSet(
	publicFilesPolicy.allowed_root_directories,
	DEFAULT_ALLOWED_ROOT_DIRECTORIES,
);
const allowedRootFiles = stringSet(
	publicFilesPolicy.allowed_root_files,
	DEFAULT_ALLOWED_ROOT_FILES,
);
const SKIPPED_TOP_LEVEL_DIRECTORIES = new Set([
	".git",
	"node_modules",
	"dist",
	"coverage",
	".coverage",
	".tmp",
]);
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
	[
		"stale-public-repository-name",
		new RegExp(`\\b${["afol", "public"].join("-")}\\b`, "u"),
	],
	[["private", "factory", "terminology"].join("-"), /\bprivate[- ]factory\b/iu],
	[
		"retired-public-export",
		new RegExp(
			`\\b(?:afol\\.public|${["public", "export"].join(":")})\\b`,
			"u",
		),
	],
	[
		"retired-hosted-ci-adr",
		new RegExp(`\\b${["ADR", "009"].join("-")}\\b`, "u"),
	],
];
const HISTORY_SYNTHETIC_LITERALS = new Map<string, string[]>([
	[
		"cli/services/evolution/imports/imports.test.ts",
		[["Bearer", "secret-value"].join(" ")],
	],
	[
		"cli/tests/evolution-analysis.test.ts",
		[
			["Bearer", "persisted-secret"].join(" "),
			["Bearer", "json-secret"].join(" "),
			["/", "home", "/", "operator", "/private.txt"].join(""),
			["C:", "\\\\", "Users", "\\\\", "operator", "\\\\private.txt"].join(""),
		],
	],
	[
		"cli/tests/evolution-observation-model.test.ts",
		[["Bearer", "REDACTION_CANARY_123456"].join(" ")],
	],
	[
		"cli/tests/evolution-observation-sources.test.ts",
		[["Bearer", "REDACTION_CANARY_678901"].join(" ")],
	],
	[
		"cli/tests/evolution-suggestion-authority.test.ts",
		[["Bearer", "REDACTION_CANARY_2"].join(" ")],
	],
	[
		"cli/tests/kernel.test.ts",
		[
			["Bearer", "synthetic-bearer"].join(" "),
			[
				"https://",
				"demo-user",
				":",
				"synthetic-password",
				"@",
				"example.test",
			].join(""),
			["https://", "demo-user", ":", "[REDACTED]", "@", "example.test"].join(
				"",
			),
		],
	],
]);

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

function scopedPathFinding(name: string): string | null {
	if (name === "docs" || name.startsWith("docs/")) {
		if (
			name !== "docs" &&
			name !== "docs/public" &&
			!name.startsWith("docs/public/")
		) {
			return "non-public-docs-path";
		}
	}
	if (name === ".github/workflows" || name.startsWith(".github/workflows/")) {
		return "hosted-workflow-path";
	}
	return null;
}

function auditContent(
	name: string,
	bytes: Uint8Array,
	syntheticLiterals: readonly string[] = [],
): void {
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
	let content = Buffer.from(bytes).toString("utf8");
	for (const literal of syntheticLiterals) {
		content = content.replaceAll(literal, "<synthetic-redaction-canary>");
	}
	for (const [id, pattern] of patterns) {
		if (pattern.test(content)) findings.push(`${name}: ${id}`);
	}
}

function visit(path: string): void {
	const stats = lstatSync(path);
	const name = relative(root, path).split("\\").join("/") || ".";
	if (name === ".git") return;
	const scopedFinding = scopedPathFinding(name);
	if (scopedFinding) {
		findings.push(`${name}: ${scopedFinding}`);
		return;
	}
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
		if (SKIPPED_TOP_LEVEL_DIRECTORIES.has(name)) return;
		if (
			name !== "." &&
			!name.includes("/") &&
			!allowedRootDirectories.has(name)
		) {
			findings.push(`${name}: unexpected-root-directory`);
			return;
		}
		for (const entry of readdirSync(path)) visit(join(path, entry));
		return;
	}
	if (!name.includes("/") && !allowedRootFiles.has(name)) {
		findings.push(`${name}: unexpected-root-file`);
	}
	auditContent(name, readFileSync(path));
}

function localLinkTarget(source: string, rawTarget: string): void {
	let target = rawTarget.trim();
	if (target.startsWith("<") && target.endsWith(">")) {
		target = target.slice(1, -1);
	}
	if (
		!target ||
		target.startsWith("#") ||
		/^[a-z][a-z0-9+.-]*:/iu.test(target)
	) {
		return;
	}
	const targetWithoutFragment = target.split(/[?#]/u, 1)[0];
	let decoded: string;
	try {
		decoded = decodeURIComponent(targetWithoutFragment);
	} catch {
		findings.push(`${source}: invalid-local-link`);
		return;
	}
	const candidate = targetWithoutFragment.startsWith("/")
		? resolve(root, decoded.slice(1))
		: resolve(dirname(join(root, source)), decoded);
	const relativeTarget = relative(root, candidate);
	if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
		findings.push(`${source}: link-outside-root:${rawTarget}`);
		return;
	}
	if (!existsSync(candidate)) {
		findings.push(`${source}: missing-local-link:${rawTarget}`);
	}
}

function auditMarkdownLinks(path: string): void {
	const stats = lstatSync(path);
	const name = relative(root, path).split("\\").join("/") || ".";
	if (name === ".git" || name === ".afol" || name === ".agents") return;
	if (SKIPPED_TOP_LEVEL_DIRECTORIES.has(name.split("/", 1)[0] ?? "")) return;
	if (stats.isSymbolicLink()) return;
	if (stats.isDirectory()) {
		for (const entry of readdirSync(path))
			auditMarkdownLinks(join(path, entry));
		return;
	}
	if (!/\.md$/iu.test(name)) return;
	const content = readFileSync(path, "utf8").replace(/```[\s\S]*?```/gu, "");
	for (const [label, pattern] of [
		["unsupported-done-option", /afol\s+(?:done|d)\b[^\n]*--execute\b/iu],
		[
			"unsupported-evidence-option",
			/afol\s+(?:evidence|e)\b[^\n]*--outcome\b/iu,
		],
	] as const) {
		if (pattern.test(content)) findings.push(`${name}: ${label}`);
	}
	const markdownLinks = /\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^)]*)?\)/gu;
	for (const match of content.matchAll(markdownLinks)) {
		if (match[1]) localLinkTarget(name, match[1]);
	}
	const htmlLinks = /\bhref\s*=\s*["']([^"']+)["']/giu;
	for (const match of content.matchAll(htmlLinks)) {
		if (match[1]) localLinkTarget(name, match[1]);
	}
}

function auditPublicExamples(): void {
	const example = join(root, "examples", "README.md");
	if (!existsSync(example)) {
		findings.push("examples/README.md: missing-public-example");
	}
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
	const scopedFinding = scopedPathFinding(path);
	if (scopedFinding) return scopedFinding;
	const [rootEntry] = path.split(/[\\/]/u);
	if (rootEntry === ".afol") return "private-state-directory";
	if (rootEntry === ".agents") return "factory-only-directory";
	if (path.includes("/")) {
		if (!allowedRootDirectories.has(rootEntry)) {
			return "unexpected-root-directory";
		}
	} else if (!allowedRootFiles.has(path)) {
		return "unexpected-root-file";
	}
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
	if (pathsByObject.size > MAX_REACHABLE_OBJECTS) {
		findings.push(".git: reachable-object-limit-exceeded");
		return;
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
	let totalBlobBytes = 0;
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
		totalBlobBytes += size;
		if (totalBlobBytes > MAX_REACHABLE_BLOB_BYTES) {
			findings.push(".git: reachable-blob-bytes-limit-exceeded");
			return;
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
		for (const path of blob.paths) {
			auditContent(
				`history/${path}`,
				contents.subarray(contentStart, contentEnd),
				HISTORY_SYNTHETIC_LITERALS.get(path),
			);
		}
		offset = contentEnd + 1;
	}
}

visit(root);
auditMarkdownLinks(root);
auditPublicExamples();
auditReachableHistory();
if (findings.length > 0) {
	throw new Error(`public content audit failed:\n${findings.join("\n")}`);
}
console.log(`public content audit passed: ${root}`);
