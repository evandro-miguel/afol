import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readSessionGovernanceMetadata } from "../governance/pending-specs";
import { findCanonicalSpecDocuments } from "../governance/spec-resolver";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import type { SpecCheckResult, SpecCheckStatus } from "./types";

type Frontmatter = Record<string, unknown>;

type SpecStore = {
	version: 1;
	results: Record<string, SpecCheckResult>;
};

type TaskMetadata = {
	featureId: string;
	parentSpec: string;
	pendingSpec: boolean;
};

type TaskFrontmatter = {
	doc_type?: unknown;
	feature_id?: unknown;
	roadmap_feature?: unknown;
	parent_spec?: unknown;
};

const SESSION_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const ALLOWED_SPEC_STATUSES = new Set(["active", "final"]);
const SPEC_CHECK_STATUSES = new Set<SpecCheckStatus>([
	"compatible",
	"conflict",
	"waived",
	"not_applicable",
]);
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
		const metadata = readSessionGovernanceMetadata(root, sessionId, taskId);
		return {
			featureId: metadata.featureId,
			parentSpec: metadata.parentSpec,
			pendingSpec: metadata.pendingSpec,
		};
	}
	const frontmatter = parsed as TaskFrontmatter;
	const metadata = readSessionGovernanceMetadata(root, sessionId, taskId);
	return {
		featureId:
			readString(frontmatter.feature_id) ||
			readString(frontmatter.roadmap_feature) ||
			metadata.featureId,
		parentSpec: readString(frontmatter.parent_spec) || metadata.parentSpec,
		pendingSpec: metadata.pendingSpec,
	};
}

function isSpecCheckResult(value: unknown): value is SpecCheckResult {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const result = value as Record<string, unknown>;
	return (
		typeof result.task_id === "string" &&
		typeof result.session_id === "string" &&
		typeof result.spec_id === "string" &&
		typeof result.status === "string" &&
		SPEC_CHECK_STATUSES.has(result.status as SpecCheckStatus) &&
		typeof result.checked_at === "string" &&
		(result.waiver_reason === undefined ||
			typeof result.waiver_reason === "string") &&
		(result.adr_ref === undefined || typeof result.adr_ref === "string")
	);
}

function readStore(root: string): SpecStore {
	const path = storePath(root);
	if (!existsSync(path)) {
		return { version: 1, results: {} };
	}
	const raw = readFileSync(path, "utf8");
	if (raw.trim().length === 0) {
		// An existing empty file is just as corrupt as malformed JSON — fail closed.
		throw new Error(`Malformed spec-gate store at ${path}: file is empty`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (cause) {
		throw new Error(`Malformed spec-gate store at ${path}: cannot read JSON`, {
			cause,
		});
	}
	if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
		const candidate = parsed as Record<string, unknown>;
		const results = candidate.results;
		if (
			candidate.version === 1 &&
			results !== null &&
			typeof results === "object" &&
			!Array.isArray(results)
		) {
			const validatedResults = Object.create(null) as Record<
				string,
				SpecCheckResult
			>;
			for (const [key, value] of Object.entries(results)) {
				if (!isSpecCheckResult(value)) {
					throw new Error(
						`Malformed spec-gate store at ${path}: invalid result ${JSON.stringify(key)}`,
					);
				}
				if (key !== storeKey(value.session_id, value.task_id)) {
					throw new Error(
						`Malformed spec-gate store at ${path}: result key ${JSON.stringify(key)} does not match its session/task`,
					);
				}
				validatedResults[key] = value;
			}
			return { version: 1, results: validatedResults };
		}
	}
	throw new Error(`Malformed spec-gate store at ${path}: invalid structure`);
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
	if (metadata.pendingSpec) {
		return saveResult(
			root,
			buildResult({
				session_id: sessionId,
				task_id: taskId,
				spec_id: metadata.parentSpec || "pending_spec",
				checked_at: checkedAt,
				status: "conflict",
			}),
		);
	}
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
	const matches = findCanonicalSpecDocuments(root, metadata.parentSpec);
	const spec = matches.length === 1 ? matches[0] : undefined;
	if (!spec || !["spec", "spec-child"].includes(spec.docType)) {
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
	const status = spec.status;
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
