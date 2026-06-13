import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { atomicWriteText } from "../io/atomic";
import { resolveAdmPaths } from "../adm";
import { resolveProjectPaths } from "../project/paths";
import type { SpecCheckResult } from "./types";

type Frontmatter = Record<string, unknown>;

type SpecStore = {
	version: 1;
	results: Record<string, SpecCheckResult>;
};

type TaskMetadata = {
	featureId: string;
	parentSpec: string;
};

type TaskFrontmatter = {
	doc_type?: unknown;
	feature_id?: unknown;
	roadmap_feature?: unknown;
	parent_spec?: unknown;
};

type SpecFrontmatter = {
	doc_type?: unknown;
	id?: unknown;
	status?: unknown;
};

const SESSION_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const ALLOWED_SPEC_STATUSES = new Set(["active", "final"]);
const STORE_FILE = "spec-gate.json";

function now(): string {
	return new Date().toISOString();
}

function storePath(root: string): string {
	return join(dirname(resolveProjectPaths(root).abs.stateDb), STORE_FILE);
}

function storeKey(sessionId: string, taskId: string): string {
	return `${sessionId}::${taskId}`;
}

function parseFrontmatter(content: string): Frontmatter | null {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
	if (!match?.[1]) {
		return null;
	}
	try {
		const parsed = Bun.YAML.parse(match[1]);
		return parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as Frontmatter)
			: null;
	} catch {
		return null;
	}
}

function readString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function taskPathForSession(root: string, sessionId: string): string {
	const normalized = sessionId.trim();
	if (
		!normalized ||
		!SESSION_NAME_RE.test(normalized) ||
		normalized.includes("..")
	) {
		throw new Error(`Invalid session identifier: ${sessionId}`);
	}
	return join(resolveProjectPaths(root).abs.wbDir, normalized);
}

function findTaskFile(sessionDir: string, taskId: string): string | null {
	if (!existsSync(sessionDir)) {
		return null;
	}
	for (const entry of readdirSync(sessionDir, { withFileTypes: true })) {
		if (
			!entry.isFile() ||
			!entry.name.endsWith(".md") ||
			!/_task_\d+\.md$/.test(entry.name)
		) {
			continue;
		}
		const taskPath = join(sessionDir, entry.name);
		const content = readFileSync(taskPath, "utf8");
		if (
			new RegExp(`^\\|\\s*${escapeRegExp(taskId)}\\s*\\|`, "m").test(content)
		) {
			return taskPath;
		}
	}
	return null;
}

function findTaskMetadata(
	root: string,
	sessionId: string,
	taskId: string,
): TaskMetadata {
	const sessionDir = taskPathForSession(root, sessionId);
	const taskPath = findTaskFile(sessionDir, taskId);
	if (!taskPath) {
		throw new Error(
			`Task ${taskId} not found in any task file under ${sessionDir}`,
		);
	}
	const content = readFileSync(taskPath, "utf8");
	if (
		!new RegExp(`^\\|\\s*${escapeRegExp(taskId)}\\s*\\|`, "m").test(content)
	) {
		throw new Error(`Task ${taskId} not found in ${taskPath}`);
	}
	const parsed = parseFrontmatter(content);
	if (!parsed) {
		throw new Error(`Missing task frontmatter: ${taskPath}`);
	}
	const frontmatter = parsed as TaskFrontmatter;
	return {
		featureId:
			readString(frontmatter.feature_id) ||
			readString(frontmatter.roadmap_feature),
		parentSpec: readString(frontmatter.parent_spec),
	};
}

function collectMarkdownFiles(rootDir: string): string[] {
	const out: string[] = [];
	const stack = [rootDir];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (!dir || !existsSync(dir)) {
			continue;
		}
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const entryPath = join(dir, entry.name);
			if (entry.isSymbolicLink()) {
				continue;
			}
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(".md")) {
				out.push(entryPath);
			}
		}
	}
	return out;
}

function findSpecFile(root: string, specId: string): string | null {
	for (const specsRoot of [resolveAdmPaths(root).specsDir, join(root, "docs", "arc", "SPECS")]) {
		for (const specPath of collectMarkdownFiles(specsRoot)) {
			const parsed = parseFrontmatter(readFileSync(specPath, "utf8"));
			if (!parsed) {
				continue;
			}
			const frontmatter = parsed as SpecFrontmatter;
			if (readString(frontmatter.doc_type) !== "spec") {
				continue;
			}
			if (readString(frontmatter.id) === specId) {
				return specPath;
			}
			if (basename(specPath) === `${specId}.md`) {
				return specPath;
			}
		}
	}
	return null;
}

function readStore(root: string): SpecStore {
	const path = storePath(root);
	if (!existsSync(path)) {
		return { version: 1, results: {} };
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed) &&
			(parsed as { version?: unknown }).version === 1 &&
			parsed !== null &&
			typeof (parsed as { results?: unknown }).results === "object" &&
			(parsed as { results?: unknown }).results !== null &&
			!Array.isArray((parsed as { results?: unknown }).results)
		) {
			return parsed as SpecStore;
		}
	} catch {
		// Ignore malformed state.
	}
	return { version: 1, results: {} };
}

function writeStore(root: string, store: SpecStore): void {
	const path = storePath(root);
	mkdirSync(dirname(path), { recursive: true });
	atomicWriteText(path, `${JSON.stringify(store, null, 2)}\n`);
}

function saveResult(root: string, result: SpecCheckResult): SpecCheckResult {
	const store = readStore(root);
	store.results[storeKey(result.session_id, result.task_id)] = result;
	writeStore(root, store);
	return result;
}

function buildResult(
	input: Pick<
		SpecCheckResult,
		"session_id" | "task_id" | "spec_id" | "checked_at" | "status"
	>,
	patch: Partial<Pick<SpecCheckResult, "waiver_reason" | "adr_ref">> = {},
): SpecCheckResult {
	return {
		task_id: input.task_id,
		session_id: input.session_id,
		spec_id: input.spec_id,
		status: input.status,
		checked_at: input.checked_at,
		...(patch.waiver_reason ? { waiver_reason: patch.waiver_reason } : {}),
		...(patch.adr_ref ? { adr_ref: patch.adr_ref } : {}),
	};
}

export function getSpecCheck(
	root: string,
	sessionId: string,
	taskId: string,
): SpecCheckResult | null {
	return readStore(root).results[storeKey(sessionId, taskId)] ?? null;
}

export function checkSpecCompatibility(
	root: string,
	sessionId: string,
	taskId: string,
): SpecCheckResult {
	const metadata = findTaskMetadata(root, sessionId, taskId);
	const checkedAt = now();
	if (!metadata.parentSpec) {
		return saveResult(
			root,
			buildResult({
				session_id: sessionId,
				task_id: taskId,
				spec_id: "",
				checked_at: checkedAt,
				status: "not_applicable",
			}),
		);
	}
	const specPath = findSpecFile(root, metadata.parentSpec);
	if (!specPath) {
		return saveResult(
			root,
			buildResult({
				session_id: sessionId,
				task_id: taskId,
				spec_id: metadata.parentSpec,
				checked_at: checkedAt,
				status: "conflict",
			}),
		);
	}
	const parsed = parseFrontmatter(readFileSync(specPath, "utf8"));
	const frontmatter =
		parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as SpecFrontmatter)
			: null;
	const status = frontmatter
		? readString(frontmatter.status).toLowerCase()
		: "";
	return saveResult(
		root,
		buildResult({
			session_id: sessionId,
			task_id: taskId,
			spec_id: metadata.parentSpec,
			checked_at: checkedAt,
			status: ALLOWED_SPEC_STATUSES.has(status) ? "compatible" : "conflict",
		}),
	);
}

export function waiveSpecCheck(
	root: string,
	sessionId: string,
	taskId: string,
	reason: string,
	adrRef?: string,
): SpecCheckResult {
	const current =
		getSpecCheck(root, sessionId, taskId) ??
		checkSpecCompatibility(root, sessionId, taskId);
	if (current.status !== "conflict") {
		return current;
	}
	return saveResult(
		root,
		buildResult(
			{
				session_id: sessionId,
				task_id: taskId,
				spec_id: current.spec_id,
				checked_at: now(),
				status: "waived",
			},
			{
				waiver_reason: reason.trim(),
				...(adrRef?.trim() ? { adr_ref: adrRef.trim() } : {}),
			},
		),
	);
}
