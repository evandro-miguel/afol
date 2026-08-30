import { createHash } from "node:crypto";
import {
	existsSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { resolveAdmPaths } from "../adm/paths";
import { atomicWriteText } from "../io/atomic";
import { assertSafeSourceFile } from "../io/safe-source";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectPaths } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import {
	findCanonicalSpecDocuments,
	listCanonicalSpecDocuments,
} from "./spec-resolver";

export type GovernanceStatus = "governed" | "pending_spec" | "unbound";

export type PendingSpecStatus = "open" | "resolved" | "waived";

export type GovernanceMissingField = "roadmap_feature" | "parent_spec";

export type WorkstreamGovernanceInput = {
	featureId?: string;
	parentSpec?: string;
	noSpecRequiredReason?: string;
	pendingSpecReason?: string;
};

export type GovernanceResolution = {
	governanceStatus: GovernanceStatus;
	pendingSpec: boolean;
	specRequired: boolean;
	pendingSpecStatus: PendingSpecStatus | "none";
	missing: GovernanceMissingField[];
	resolutionHint: string;
	noSpecRequiredReason?: string;
};

export type PendingSpecEntry = {
	session_id: string;
	created_at: string;
	updated_at: string;
	status: PendingSpecStatus;
	theme: string;
	task_ids: string[];
	missing: GovernanceMissingField[];
	resolution_hint: string;
	feature_id?: string;
	parent_spec?: string;
	reason?: string;
	resolved_at?: string;
	parent_spec_path?: string;
	parent_spec_sha256?: string;
	roadmap_path?: string;
	roadmap_sha256?: string;
};

export type PendingSpecIndex = {
	schema_version: 1;
	entries: PendingSpecEntry[];
};

export type SessionGovernanceMetadata = {
	featureId: string;
	parentSpec: string;
	governanceStatus: GovernanceStatus;
	pendingSpec: boolean;
	pendingSpecStatus: PendingSpecStatus | "none";
	noSpecRequiredReason: string;
};

export type SessionPendingSpecNotice = {
	session: string;
	missing: GovernanceMissingField[];
	question: string;
	resolutionHint: string;
	nextStep: string;
	featureId: string;
	parentSpec: string;
};

const INDEX_FILE = "pending-specs.json";
const GOVERNANCE_LOCK = "__governance-pending-specs__";
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DEFAULT_PENDING_SPEC_RESOLUTION_HINT =
	'run afol gov rs --session <session> -F <F-id> -P <spec-id> or waive with afol gov rs --session <session> --no-spec-required -r "<reason>"';

function pendingSpecQuestion(
	missing: readonly GovernanceMissingField[],
): string {
	if (missing.length === 1) {
		return missing[0] === "roadmap_feature"
			? "Which roadmap feature governs this session?"
			: "Which parent spec governs this session?";
	}
	return "Which roadmap feature and parent spec govern this session?";
}

function pendingSpecNextStep(session: string, resolutionHint: string): string {
	return resolutionHint.replace("<session>", session);
}

function nowIso(): string {
	return new Date().toISOString();
}

function trimString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function boolValue(value: unknown): boolean {
	return value === true || value === "true";
}

function isPendingSpecStatus(value: unknown): value is PendingSpecStatus {
	return value === "open" || value === "resolved" || value === "waived";
}

function yamlScalar(value: string): string {
	return JSON.stringify(value);
}

function renderFrontmatter(record: Record<string, unknown>): string {
	const lines = Object.entries(record).map(([key, value]) => {
		if (typeof value === "boolean") {
			return `${key}: ${value ? "true" : "false"}`;
		}
		if (Array.isArray(value)) {
			return `${key}: ${yamlScalar(value.join(","))}`;
		}
		return `${key}: ${yamlScalar(String(value ?? ""))}`;
	});
	return `---\n${lines.join("\n")}\n---\n\n`;
}

function replaceFrontmatterScalar(
	content: string,
	key: string,
	value: string,
): string {
	const match = FRONTMATTER_RE.exec(content);
	if (!match) throw new Error("Document frontmatter is invalid");
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const fieldPattern = new RegExp(`^${escapedKey}[ \\t]*:[^\\r\\n]*`, "gm");
	const matches = match[0].match(fieldPattern) ?? [];
	if (matches.length !== 1)
		throw new Error(`Frontmatter field must resolve uniquely: ${key}`);
	const updatedBlock = match[0].replace(
		fieldPattern,
		`${key}: ${yamlScalar(value)}`,
	);
	return updatedBlock + content.slice(match[0].length);
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
	const match = FRONTMATTER_RE.exec(content);
	if (!match?.[1]) {
		return null;
	}
	try {
		const parsed = Bun.YAML.parse(match[1]);
		return parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function replaceOrPrependFrontmatter(
	content: string,
	frontmatter: Record<string, unknown>,
): string {
	const block = renderFrontmatter(frontmatter);
	if (FRONTMATTER_RE.test(content)) {
		return content.replace(FRONTMATTER_RE, block);
	}
	return `${block}${content.replace(/^\n+/g, "")}`;
}

function readIndexFile(path: string): PendingSpecIndex | null {
	if (!existsSync(path)) {
		return { schema_version: 1, entries: [] };
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed) &&
			(parsed as { schema_version?: unknown }).schema_version === 1 &&
			Array.isArray((parsed as { entries?: unknown }).entries) &&
			(parsed as PendingSpecIndex).entries.every(
				(entry) =>
					entry !== null &&
					typeof entry === "object" &&
					typeof entry.session_id === "string" &&
					isPendingSpecStatus(entry.status) &&
					Array.isArray(entry.task_ids) &&
					Array.isArray(entry.missing),
			)
		) {
			return parsed as PendingSpecIndex;
		}
	} catch {
		return null;
	}
	return null;
}

export function pendingSpecsPath(root: string): string {
	return join(
		resolveProjectPaths(root).abs.mutableDir,
		"data",
		"governance",
		INDEX_FILE,
	);
}

export function readPendingSpecIndex(root: string): PendingSpecIndex {
	const index = readIndexFile(pendingSpecsPath(root));
	if (index) return index;
	throw new Error(`Invalid pending spec index: ${pendingSpecsPath(root)}`);
}

export function writePendingSpecIndex(
	root: string,
	index: PendingSpecIndex,
): void {
	const path = pendingSpecsPath(root);
	atomicWriteText(path, `${JSON.stringify(index, null, 2)}\n`);
}

export function repairPendingSpecIndex(root: string): PendingSpecIndex {
	return withSessionLock(root, GOVERNANCE_LOCK, () => {
		const rebuilt = rebuildPendingSpecIndexFromWorkbench(root);
		writePendingSpecIndex(root, rebuilt);
		return rebuilt;
	});
}

function parseStringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((item) => trimString(item))
			.filter((item) => item.length > 0);
	}
	if (typeof value === "string") {
		return value
			.split(",")
			.map((item) => item.trim())
			.filter((item) => item.length > 0);
	}
	return [];
}

function parseMissingFields(value: unknown): GovernanceMissingField[] {
	return parseStringList(value).filter(
		(item): item is GovernanceMissingField =>
			item === "roadmap_feature" || item === "parent_spec",
	);
}

function inferMissingFields(
	frontmatter: Record<string, unknown>,
): GovernanceMissingField[] {
	const missing = parseMissingFields(frontmatter.pending_spec_missing);
	if (missing.length > 0) {
		return missing;
	}
	const inferred: GovernanceMissingField[] = [];
	if (
		!trimString(frontmatter.feature_id) &&
		!trimString(frontmatter.roadmap_feature)
	) {
		inferred.push("roadmap_feature");
	}
	if (!trimString(frontmatter.parent_spec)) {
		inferred.push("parent_spec");
	}
	return inferred;
}

function pendingSpecStatusFromFrontmatter(
	frontmatter: Record<string, unknown>,
): PendingSpecStatus | null {
	if (isPendingSpecStatus(frontmatter.pending_spec_status)) {
		return frontmatter.pending_spec_status;
	}
	if (
		boolValue(frontmatter.pending_spec) ||
		trimString(frontmatter.governance_status) === "pending_spec"
	) {
		return "open";
	}
	return null;
}

function pendingSpecEntryFromFrontmatter(
	session: string,
	frontmatter: Record<string, unknown>,
): PendingSpecEntry | null {
	const status = pendingSpecStatusFromFrontmatter(frontmatter);
	if (!status) {
		return null;
	}
	const createdAt = trimString(frontmatter.created_at) || nowIso();
	const updatedAt = trimString(frontmatter.updated_at) || createdAt;
	const featureId =
		trimString(frontmatter.feature_id) ||
		trimString(frontmatter.roadmap_feature);
	const parentSpec = trimString(frontmatter.parent_spec);
	return {
		session_id: trimString(frontmatter.session_id) || session,
		created_at: createdAt,
		updated_at: updatedAt,
		status,
		theme: trimString(frontmatter.theme) || session,
		task_ids: parseStringList(frontmatter.task_ids),
		missing: status === "open" ? inferMissingFields(frontmatter) : [],
		resolution_hint:
			trimString(frontmatter.pending_spec_resolution_hint) ||
			(status === "open"
				? DEFAULT_PENDING_SPEC_RESOLUTION_HINT
				: "linked to roadmap feature and parent spec"),
		...(featureId ? { feature_id: featureId } : {}),
		...(parentSpec ? { parent_spec: parentSpec } : {}),
		...(trimString(frontmatter.spec_waiver_reason)
			? { reason: trimString(frontmatter.spec_waiver_reason) }
			: {}),
	};
}

function rebuildPendingSpecIndexFromWorkbench(root: string): PendingSpecIndex {
	const wbDir = resolveProjectPaths(root).abs.wbDir;
	const bySession = new Map<string, PendingSpecEntry>();
	if (!existsSync(wbDir)) {
		return { schema_version: 1, entries: [] };
	}
	for (const sessionEntry of readdirSync(wbDir, { withFileTypes: true })) {
		if (!sessionEntry.isDirectory()) {
			continue;
		}
		const session = sessionEntry.name;
		const dir = join(wbDir, session);
		for (const fileEntry of readdirSync(dir, { withFileTypes: true })) {
			if (
				!fileEntry.isFile() ||
				!/_(?:plan|task)_\d+\.md$/.test(fileEntry.name)
			) {
				continue;
			}
			const frontmatter = parseFrontmatter(
				readFileSync(join(dir, fileEntry.name), "utf8"),
			);
			if (!frontmatter) {
				continue;
			}
			const entry = pendingSpecEntryFromFrontmatter(session, frontmatter);
			if (!entry) {
				continue;
			}
			const previous = bySession.get(entry.session_id);
			if (previous?.status !== "open" || entry.status === "open") {
				bySession.set(entry.session_id, entry);
			}
		}
	}
	return {
		schema_version: 1,
		entries: [...bySession.values()].sort((a, b) =>
			a.session_id.localeCompare(b.session_id),
		),
	};
}

export function resolveGovernance(
	input?: WorkstreamGovernanceInput,
): GovernanceResolution {
	const featureId = input?.featureId?.trim() ?? "";
	const parentSpec = input?.parentSpec?.trim() ?? "";
	const noSpecRequiredReason = input?.noSpecRequiredReason?.trim() ?? "";
	const pendingSpecReason = input?.pendingSpecReason?.trim() ?? "";
	if (noSpecRequiredReason) {
		return {
			governanceStatus: "unbound",
			pendingSpec: false,
			specRequired: false,
			pendingSpecStatus: "waived",
			missing: [],
			resolutionHint: "spec requirement waived with explicit reason",
			noSpecRequiredReason,
		};
	}
	const missing: GovernanceMissingField[] = [];
	if (!featureId) {
		missing.push("roadmap_feature");
	}
	if (!parentSpec) {
		missing.push("parent_spec");
	}
	if (missing.length === 0 && !pendingSpecReason) {
		return {
			governanceStatus: "governed",
			pendingSpec: false,
			specRequired: true,
			pendingSpecStatus: "none",
			missing,
			resolutionHint: "linked to roadmap feature and parent spec",
		};
	}
	return {
		governanceStatus: "pending_spec",
		pendingSpec: true,
		specRequired: true,
		pendingSpecStatus: "open",
		missing,
		resolutionHint: pendingSpecReason
			? `${pendingSpecReason}; ${DEFAULT_PENDING_SPEC_RESOLUTION_HINT}`
			: DEFAULT_PENDING_SPEC_RESOLUTION_HINT,
	};
}

export function buildGovernanceFrontmatter(input: {
	docType: "workbench_plan" | "workbench_task";
	id: string;
	session: string;
	theme: string;
	taskIds: string[];
	createdAt: string;
	metadata?: WorkstreamGovernanceInput;
}): Record<string, unknown> {
	const governance = resolveGovernance(input.metadata);
	const featureId = input.metadata?.featureId?.trim() ?? "";
	const parentSpec = input.metadata?.parentSpec?.trim() ?? "";
	return {
		doc_type: input.docType,
		id: input.id,
		session_id: input.session,
		theme: input.theme.trim(),
		status: "active",
		created_at: input.createdAt,
		updated_at: input.createdAt,
		roadmap_feature: featureId,
		feature_id: featureId,
		parent_spec: parentSpec,
		task_ids: input.taskIds,
		governance_status: governance.governanceStatus,
		spec_required: governance.specRequired,
		pending_spec: governance.pendingSpec,
		pending_spec_status: governance.pendingSpecStatus,
		pending_spec_missing: governance.missing,
		pending_spec_resolution_hint: governance.resolutionHint,
		spec_waiver_reason: governance.noSpecRequiredReason ?? "",
	};
}

export function recordPendingSpecForSession(
	root: string,
	input: {
		session: string;
		theme: string;
		taskIds: string[];
		metadata?: WorkstreamGovernanceInput;
		createdAt?: string;
	},
): PendingSpecEntry | null {
	return withSessionLock(root, GOVERNANCE_LOCK, () => {
		const governance = resolveGovernance(input.metadata);
		if (!governance.pendingSpec) {
			return null;
		}
		const createdAt = input.createdAt ?? nowIso();
		const index = readPendingSpecIndex(root);
		const existing = index.entries.find(
			(entry) => entry.session_id === input.session,
		);
		const entry: PendingSpecEntry = {
			session_id: input.session,
			created_at: existing?.created_at ?? createdAt,
			updated_at: createdAt,
			status: "open",
			theme: input.theme.trim(),
			task_ids: input.taskIds,
			missing: governance.missing,
			resolution_hint: governance.resolutionHint,
			...(input.metadata?.featureId?.trim()
				? { feature_id: input.metadata.featureId.trim() }
				: {}),
			...(input.metadata?.parentSpec?.trim()
				? { parent_spec: input.metadata.parentSpec.trim() }
				: {}),
		};
		if (existing) {
			Object.assign(existing, entry);
		} else {
			index.entries.push(entry);
		}
		writePendingSpecIndex(root, index);
		return entry;
	});
}

export function listOpenPendingSpecs(root: string): PendingSpecEntry[] {
	return readPendingSpecIndex(root).entries.filter(
		(entry) => entry.status === "open",
	);
}

export function findPendingSpecEntry(
	root: string,
	session: string,
): PendingSpecEntry | null {
	return (
		readPendingSpecIndex(root).entries.find(
			(entry) => entry.session_id === session,
		) ?? null
	);
}

export function formatPendingSpecBlocker(
	open: readonly PendingSpecEntry[],
	limit = 5,
): string {
	const shown = open
		.slice(0, limit)
		.map(
			(entry) =>
				`${entry.session_id} missing=${entry.missing.join(",") || "unknown"}`,
		)
		.join("; ");
	const suffix = open.length > limit ? `; +${open.length - limit} more` : "";
	return `open pending_spec: ${open.length}; resolve with afol gov rs --session <id> -F <F-id> -P <spec-id> or waive with afol gov rs --session <id> --no-spec-required -r "<reason>"; open: ${shown}${suffix}`;
}

function sessionDir(root: string, session: string): string {
	return join(resolveProjectPaths(root).abs.wbDir, session);
}

function findMarkdownFiles(root: string, session: string): string[] {
	const dir = sessionDir(root, session);
	if (!existsSync(dir)) {
		return [];
	}
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => join(dir, entry.name));
}

function hasTaskRow(content: string, taskId: string): boolean {
	const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^\\|\\s*${escaped}\\s*\\|`, "m").test(content);
}

function nativeMetadata(content: string): Partial<SessionGovernanceMetadata> {
	const result: Partial<SessionGovernanceMetadata> = {};
	for (const line of content.split(/\r?\n/)) {
		const match = /^-\s*([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
		if (!match) {
			continue;
		}
		const key = match[1];
		const value = match[2]?.trim() ?? "";
		if (key === "feature_id" || key === "roadmap_feature") {
			result.featureId = value;
		}
		if (key === "parent_spec") {
			result.parentSpec = value;
		}
	}
	return result;
}

function metadataFromFrontmatter(
	frontmatter: Record<string, unknown>,
): SessionGovernanceMetadata {
	const pendingSpecStatus = isPendingSpecStatus(frontmatter.pending_spec_status)
		? frontmatter.pending_spec_status
		: "none";
	const governanceStatus = trimString(frontmatter.governance_status);
	const pendingSpec =
		boolValue(frontmatter.pending_spec) ||
		(governanceStatus === "pending_spec" && pendingSpecStatus === "open");
	return {
		featureId:
			trimString(frontmatter.feature_id) ||
			trimString(frontmatter.roadmap_feature),
		parentSpec: trimString(frontmatter.parent_spec),
		governanceStatus:
			governanceStatus === "governed" ||
			governanceStatus === "pending_spec" ||
			governanceStatus === "unbound"
				? governanceStatus
				: pendingSpec
					? "pending_spec"
					: "unbound",
		pendingSpec,
		pendingSpecStatus,
		noSpecRequiredReason: trimString(frontmatter.spec_waiver_reason),
	};
}

function mergePendingSpecIndexMetadata(
	root: string,
	session: string,
	metadata: SessionGovernanceMetadata,
): SessionGovernanceMetadata {
	const entry = findPendingSpecEntry(root, session);
	if (!entry) {
		return metadata;
	}
	if (entry.status === "open") {
		return {
			featureId: entry.feature_id ?? metadata.featureId,
			parentSpec: entry.parent_spec ?? metadata.parentSpec,
			governanceStatus: "pending_spec",
			pendingSpec: true,
			pendingSpecStatus: "open",
			noSpecRequiredReason: "",
		};
	}
	if (entry.status === "resolved") {
		return {
			featureId: entry.feature_id ?? metadata.featureId,
			parentSpec: entry.parent_spec ?? metadata.parentSpec,
			governanceStatus: "governed",
			pendingSpec: false,
			pendingSpecStatus: "resolved",
			noSpecRequiredReason: "",
		};
	}
	return {
		featureId: entry.feature_id ?? metadata.featureId,
		parentSpec: entry.parent_spec ?? metadata.parentSpec,
		governanceStatus: "unbound",
		pendingSpec: false,
		pendingSpecStatus: "waived",
		noSpecRequiredReason: entry.reason ?? metadata.noSpecRequiredReason,
	};
}

export function readSessionGovernanceMetadata(
	root: string,
	session: string,
	taskId?: string,
): SessionGovernanceMetadata {
	const files = findMarkdownFiles(root, session);
	const taskFiles = files.filter((file) => /_task_\d+\.md$/.test(file));
	const planFiles = files.filter((file) => /_plan_\d+\.md$/.test(file));
	const ordered = [
		...taskFiles.filter((file) =>
			taskId ? hasTaskRow(readFileSync(file, "utf8"), taskId) : true,
		),
		...planFiles,
	];
	for (const file of ordered) {
		const content = readFileSync(file, "utf8");
		const frontmatter = parseFrontmatter(content);
		if (frontmatter) {
			return mergePendingSpecIndexMetadata(
				root,
				session,
				metadataFromFrontmatter(frontmatter),
			);
		}
		const legacy = nativeMetadata(content);
		if (legacy.featureId || legacy.parentSpec) {
			return mergePendingSpecIndexMetadata(root, session, {
				featureId: legacy.featureId ?? "",
				parentSpec: legacy.parentSpec ?? "",
				governanceStatus: legacy.parentSpec ? "governed" : "unbound",
				pendingSpec: false,
				pendingSpecStatus: "none",
				noSpecRequiredReason: "",
			});
		}
	}
	return mergePendingSpecIndexMetadata(root, session, {
		featureId: "",
		parentSpec: "",
		governanceStatus: "unbound",
		pendingSpec: false,
		pendingSpecStatus: "none",
		noSpecRequiredReason: "",
	});
}

export function getSessionPendingSpecNotice(
	root: string,
	session: string,
	taskId?: string,
): SessionPendingSpecNotice | null {
	const entry = findPendingSpecEntry(root, session);
	if (entry?.status === "open") {
		const resolutionHint =
			entry.resolution_hint || DEFAULT_PENDING_SPEC_RESOLUTION_HINT;
		return {
			session,
			missing: entry.missing,
			question: pendingSpecQuestion(entry.missing),
			resolutionHint,
			nextStep: pendingSpecNextStep(session, resolutionHint),
			featureId: entry.feature_id ?? "",
			parentSpec: entry.parent_spec ?? "",
		};
	}
	const metadata = readSessionGovernanceMetadata(root, session, taskId);
	if (!metadata.pendingSpec || metadata.pendingSpecStatus !== "open") {
		return null;
	}
	const missing: GovernanceMissingField[] = [];
	if (!metadata.featureId) {
		missing.push("roadmap_feature");
	}
	if (!metadata.parentSpec) {
		missing.push("parent_spec");
	}
	return {
		session,
		missing,
		question: pendingSpecQuestion(missing),
		resolutionHint: DEFAULT_PENDING_SPEC_RESOLUTION_HINT,
		nextStep: pendingSpecNextStep(
			session,
			DEFAULT_PENDING_SPEC_RESOLUTION_HINT,
		),
		featureId: metadata.featureId,
		parentSpec: metadata.parentSpec,
	};
}

export function formatSessionPendingSpecWarning(
	notice: SessionPendingSpecNotice | null,
): string[] {
	if (!notice) {
		return [];
	}
	return [
		`warning: pending_spec missing=${notice.missing.join(",") || "unknown"}`,
		`question: ${notice.question}`,
		`next: ${notice.nextStep}`,
	];
}

function mergeFrontmatter(
	existing: Record<string, unknown> | null,
	patch: Record<string, unknown>,
): Record<string, unknown> {
	return existing ? { ...existing, ...patch } : { ...patch };
}

function updateSessionFrontmatter(
	root: string,
	session: string,
	patch: Record<string, unknown>,
): void {
	const files = findMarkdownFiles(root, session).filter((file) =>
		/_(plan|task)_\d+\.md$/.test(file),
	);
	if (files.length === 0) {
		throw new Error(
			`No workbench plan/task files found for session ${session}`,
		);
	}
	for (const file of files) {
		const content = readFileSync(file, "utf8");
		const merged = mergeFrontmatter(parseFrontmatter(content), patch);
		atomicWriteText(file, replaceOrPrependFrontmatter(content, merged));
	}
}

function withGovernanceRollback<T>(
	root: string,
	session: string,
	action: () => T,
): T {
	const files = findMarkdownFiles(root, session).filter((file) =>
		/_(plan|task)_\d+\.md$/.test(file),
	);
	const originals = new Map(
		files.map((file) => [file, readFileSync(file, "utf8")]),
	);
	const indexPath = pendingSpecsPath(root);
	const indexExisted = existsSync(indexPath);
	const indexBefore = indexExisted ? readFileSync(indexPath, "utf8") : "";
	try {
		return action();
	} catch (error) {
		for (const [file, content] of originals) atomicWriteText(file, content);
		if (indexExisted) atomicWriteText(indexPath, indexBefore);
		else if (existsSync(indexPath)) rmSync(indexPath, { force: true });
		throw error;
	}
}

function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function roadmapFeatureRange(
	roadmap: string,
	featureId: string,
): {
	lines: string[];
	start: number;
	end: number;
} {
	const lines = roadmap.split(/\r?\n/);
	const escaped = featureId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const headingPattern = new RegExp(`^(#{2,6})\\s+${escaped}\\b`);
	const start = lines.findIndex((line) => headingPattern.test(line));
	if (start < 0) throw new Error(`Roadmap feature not found: ${featureId}`);
	const level = lines[start]?.match(/^(#+)/)?.[1]?.length ?? 6;
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index += 1) {
		const nextLevel = lines[index]?.match(/^(#{2,6})\s+/)?.[1]?.length;
		if (nextLevel && nextLevel <= level) {
			end = index;
			break;
		}
	}
	return { lines, start, end };
}

function roadmapFeatureStatus(section: string, featureId: string): string {
	const match = /^-\s*Status:\s*(\S+)\s*$/im.exec(section);
	if (!match?.[1])
		throw new Error(`Roadmap feature status not found: ${featureId}`);
	return match[1].toLowerCase();
}

function assertSafeGovernanceRoadmapPath(root: string, target: string): string {
	const projectRoot = realpathSync(root);
	const relativePath = projectRelativePath(projectRoot, target);
	if (!relativePath) {
		throw new Error(
			`Governance roadmap path is outside the project root: ${target}`,
		);
	}
	const resolved = resolveProjectWritePath(projectRoot, relativePath);
	if (!resolved.ok) {
		throw new Error(`Governance roadmap path is unsafe: ${resolved.error}`);
	}
	assertSafeSourceFile(resolved.value.path, "Governance roadmap", false);
	if (!projectRelativePath(projectRoot, realpathSync(resolved.value.path))) {
		throw new Error(
			`Governance roadmap path is outside the project root: ${target}`,
		);
	}
	return resolved.value.path;
}

function resolveGovernanceRoadmapPath(root: string): string {
	const { admDir, roadmapDir } = resolveAdmPaths(root);
	for (const candidate of [
		join(roadmapDir, "GENERAL-ROADMAP.md"),
		join(admDir, "roadmap.md"),
	]) {
		if (existsSync(candidate))
			return assertSafeGovernanceRoadmapPath(root, candidate);
	}
	throw new Error("Governance roadmap not found");
}

type RoadmapActivationResult = {
	featureId: string;
	status: "activated" | "already_active";
	parentSpec?: string;
	parentStatus?: "activated" | "already_active";
	featurePreviousStatus?: "planned" | "active";
	featureNewStatus?: "active";
	parentPreviousStatus?: "planned" | "active";
	parentNewStatus?: "active";
};

export type GovernanceActivationRuntime = {
	failAfterFirstWrite?: boolean;
	failOnSecondWrite?: boolean;
};

function activateRoadmapFeatureLocked(
	root: string,
	featureId: string,
	parentSpec?: string,
	runtime: GovernanceActivationRuntime = {},
): RoadmapActivationResult {
	const roadmapPath = resolveGovernanceRoadmapPath(root);
	const roadmap = readFileSync(roadmapPath, "utf8");
	const { lines, start, end } = roadmapFeatureRange(roadmap, featureId);
	const statusIndex = lines.findIndex(
		(line, index) =>
			index > start && index < end && /^-\s*Status:\s*/i.test(line),
	);
	if (statusIndex < 0)
		throw new Error(`Roadmap feature status not found: ${featureId}`);
	const status = lines[statusIndex]
		?.replace(/^-\s*Status:\s*/i, "")
		.trim()
		.toLowerCase();
	if (status === "final")
		throw new Error(
			`Roadmap feature is final and cannot be reopened: ${featureId}`,
		);
	if (status !== "planned" && status !== "active")
		throw new Error(
			`Roadmap feature cannot be activated from status ${status || "unknown"}: ${featureId}`,
		);

	const parent = parentSpec?.trim();
	let parentPath = "";
	let parentDocument = "";
	let parentStatus: "activated" | "already_active" | undefined;
	if (parent) {
		const matches = findCanonicalSpecDocuments(root, parent);
		if (matches.length !== 1 || !matches[0])
			throw new Error(`Parent spec must resolve uniquely: ${parent}`);
		const document = matches[0];
		if (trimString(document.frontmatter.doc_type) !== "spec")
			throw new Error(`Parent spec doc_type must be spec: ${parent}`);
		if (trimString(document.frontmatter.roadmap_feature) !== featureId)
			throw new Error(`Parent spec roadmap_feature mismatch: ${parent}`);
		const candidateStatus = trimString(
			document.frontmatter.status,
		).toLowerCase();
		if (candidateStatus !== "planned" && candidateStatus !== "active")
			throw new Error(
				`Parent spec cannot be activated from status ${candidateStatus || "unknown"}: ${parent}`,
			);
		parentPath = document.path;
		parentDocument = document.content;
		parentStatus =
			candidateStatus === "active" ? "already_active" : "activated";
	}

	const updates: Array<[string, string]> = [];
	if (parent && parentStatus === "activated") {
		updates.push([
			parentPath,
			replaceFrontmatterScalar(parentDocument, "status", "active"),
		]);
	}
	if (status === "planned") {
		lines[statusIndex] = "- Status: active";
		updates.push([roadmapPath, `${lines.join("\n").replace(/\n*$/, "")}\n`]);
	}
	const originals = new Map<string, string>([[roadmapPath, roadmap]]);
	if (parent && parentPath) originals.set(parentPath, parentDocument);
	let interrupted = false;
	try {
		let writeCount = 0;
		for (const [path, content] of updates) {
			writeCount += 1;
			if (runtime.failOnSecondWrite && writeCount === 2)
				throw new Error(
					"Injected governance activation failure on second write",
				);
			atomicWriteText(
				path === roadmapPath
					? assertSafeGovernanceRoadmapPath(root, path)
					: path,
				content,
			);
			if (runtime.failAfterFirstWrite && writeCount === 1) {
				interrupted = true;
				throw new Error("Injected governance activation failure");
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (interrupted) {
			throw new Error(
				`${message}; restoration=skipped (simulated interruption after first write)`,
			);
		}
		let restorationError: unknown;
		for (const [path, content] of originals) {
			try {
				atomicWriteText(
					path === roadmapPath
						? assertSafeGovernanceRoadmapPath(root, path)
						: path,
					content,
				);
			} catch (rollbackError) {
				restorationError ??= rollbackError;
			}
		}
		if (restorationError) {
			const restorationMessage =
				restorationError instanceof Error
					? restorationError.message
					: String(restorationError);
			throw new Error(
				`INTEGRITY_ERROR: governance activation failed; restoration=failed: ${restorationMessage}; original error: ${message}`,
			);
		}
		throw new Error(`${message}; restoration=complete`);
	}
	return {
		featureId,
		status: status === "planned" ? "activated" : "already_active",
		...(parent && parentStatus
			? {
					parentSpec: parent,
					parentStatus,
					featurePreviousStatus: status,
					featureNewStatus: "active" as const,
					parentPreviousStatus:
						parentStatus === "activated"
							? ("planned" as const)
							: ("active" as const),
					parentNewStatus: "active" as const,
				}
			: {}),
	};
}

export function activateRoadmapFeature(
	root: string,
	featureId: string,
	parentSpec?: string,
	runtime: GovernanceActivationRuntime = {},
): RoadmapActivationResult {
	return withSessionLock(root, GOVERNANCE_LOCK, () =>
		activateRoadmapFeatureLocked(root, featureId, parentSpec, runtime),
	);
}

function projectRelativePath(root: string, path: string): string | null {
	const projectRoot = resolve(root);
	const absolutePath = isAbsolute(path)
		? resolve(path)
		: resolve(projectRoot, path);
	const projectRelative = relative(projectRoot, absolutePath).replaceAll(
		"\\",
		"/",
	);
	if (
		!projectRelative ||
		isAbsolute(projectRelative) ||
		projectRelative === ".." ||
		projectRelative.startsWith("../")
	) {
		return null;
	}
	return projectRelative;
}

function parseGoverningSpecsFromSection(
	root: string,
	section: string,
): string[] {
	const lines = section.split(/\r?\n/);
	const specPaths = new Set<string>();
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const match = /^\s*-\s*Governing\s+spec:\s*(.*)\s*$/i.exec(line);
		if (!match) {
			continue;
		}
		let candidate = (match[1] ?? "").trim();
		if (!candidate) {
			const next = lines[index + 1]?.trim();
			if (next && !next.startsWith("-") && !/^#+\s/.test(next)) {
				candidate = next;
			}
		}
		const cleaned = candidate.replace(/^`+|`+$/g, "").trim();
		if (!cleaned) continue;
		const projectRelative = projectRelativePath(root, cleaned);
		if (projectRelative) {
			specPaths.add(projectRelative);
		}
	}
	return [...specPaths];
}

export function resolveGovernanceCatalog(
	root: string,
	featureId: string,
	parentSpec: string,
) {
	const roadmapPath = resolveGovernanceRoadmapPath(root);
	const roadmap = readFileSync(roadmapPath, "utf8");
	const { lines, start, end } = roadmapFeatureRange(roadmap, featureId);
	const featureSection = lines.slice(start, end).join("\n");
	const featureStatus = roadmapFeatureStatus(featureSection, featureId);
	if (featureStatus !== "active" && featureStatus !== "final")
		throw new Error(`Roadmap feature is not active: ${featureId}`);
	const projectRelative = (path: string) => {
		const result = projectRelativePath(root, path);
		if (!result)
			throw new Error(`Governance path is outside the project root: ${path}`);
		return result;
	};
	const matches = findCanonicalSpecDocuments(root, parentSpec);
	if (matches.length !== 1)
		throw new Error(`Parent spec must resolve uniquely: ${parentSpec}`);
	let document = matches[0];
	if (!document)
		throw new Error(`Parent spec must resolve uniquely: ${parentSpec}`);
	let specPath = document.path;
	const requestedSpecPath = specPath;
	let spec = document.content;
	let fm = document.frontmatter;
	if (!fm || trimString(fm.doc_type) !== "spec")
		throw new Error(`Parent spec doc_type must be spec: ${parentSpec}`);
	if (!fm) throw new Error(`Parent spec frontmatter is invalid: ${parentSpec}`);
	let resolvedResidual = false;
	if (trimString(fm.status) === "final") {
		const residuals = listCanonicalSpecDocuments(root).filter(
			(candidate) =>
				candidate.docType === "spec-child" &&
				candidate.status === "active" &&
				trimString(candidate.frontmatter.roadmap_feature) === featureId &&
				trimString(candidate.frontmatter.parent_spec) === parentSpec,
		);
		if (residuals.length !== 1)
			throw new Error(
				`Parent spec is final without one active residual child: ${parentSpec}`,
			);
		document = residuals[0] as (typeof residuals)[number];
		specPath = document.path;
		spec = document.content;
		fm = document.frontmatter;
		resolvedResidual = true;
	}
	if (featureStatus === "final" && !resolvedResidual)
		throw new Error(
			`Roadmap feature is final without an active residual child: ${featureId}`,
		);
	if (trimString(fm?.status) !== "active")
		throw new Error(`Parent spec is not active: ${parentSpec}`);
	if (!fm) throw new Error(`Parent spec frontmatter is invalid: ${parentSpec}`);
	const specId = trimString(fm.id) || basename(specPath, ".md");
	if (trimString(fm.roadmap_feature) !== featureId)
		throw new Error(`Parent spec roadmap_feature mismatch: ${parentSpec}`);
	const governingSpecs = parseGoverningSpecsFromSection(root, featureSection);
	const specPathCandidate = projectRelative(specPath);
	const requestedSpecPathCandidate = projectRelative(requestedSpecPath);
	if (
		!governingSpecs.includes(specPathCandidate) &&
		!governingSpecs.includes(specPathCandidate.replaceAll("\\", "/")) &&
		!governingSpecs.includes(requestedSpecPathCandidate)
	) {
		throw new Error(`Roadmap feature governing spec mismatch: ${parentSpec}`);
	}
	return {
		specId,
		roadmapPath: projectRelative(roadmapPath),
		roadmapHash: sha256(roadmap),
		specPath: projectRelative(specPath),
		specHash: sha256(spec),
	};
}

export function resolvePendingSpec(
	root: string,
	input: {
		session: string;
		featureId?: string;
		parentSpec?: string;
		noSpecRequiredReason?: string;
	},
	runtime: { failAfterFrontmatter?: boolean } = {},
): PendingSpecEntry {
	return withSessionLock(root, GOVERNANCE_LOCK, () => {
		const index = readPendingSpecIndex(root);
		const entry = index.entries.find(
			(candidate) => candidate.session_id === input.session,
		);
		if (!entry) {
			throw new Error(
				`pending_spec entry not found for session ${input.session}`,
			);
		}
		if (entry.status !== "open") {
			throw new Error(
				`pending_spec entry is not open for session ${input.session}: ${entry.status}`,
			);
		}
		return withGovernanceRollback(root, input.session, () => {
			const resolvedAt = nowIso();
			const reason = input.noSpecRequiredReason?.trim() ?? "";
			if (reason) {
				entry.status = "waived";
				entry.updated_at = resolvedAt;
				entry.resolved_at = resolvedAt;
				entry.reason = reason;
				entry.missing = [];
				entry.resolution_hint = "spec requirement waived with explicit reason";
				updateSessionFrontmatter(root, input.session, {
					governance_status: "unbound",
					spec_required: false,
					pending_spec: false,
					pending_spec_status: "waived",
					pending_spec_missing: [],
					spec_waiver_reason: reason,
					updated_at: resolvedAt,
				});
				if (runtime.failAfterFrontmatter)
					throw new Error("Injected governance failure after frontmatter");
				writePendingSpecIndex(root, index);
				return entry;
			}
			const featureId = input.featureId?.trim() || entry.feature_id || "";
			const parentSpec = input.parentSpec?.trim() || entry.parent_spec || "";
			if (!featureId || !parentSpec) {
				throw new Error(
					"resolve-spec requires --feature-id and --parent-spec unless --no-spec-required --reason is used",
				);
			}
			const catalog = resolveGovernanceCatalog(root, featureId, parentSpec);
			entry.status = "resolved";
			entry.updated_at = resolvedAt;
			entry.resolved_at = resolvedAt;
			entry.feature_id = featureId;
			entry.parent_spec = catalog.specId;
			entry.missing = [];
			entry.resolution_hint = "linked to roadmap feature and parent spec";
			entry.parent_spec_path = catalog.specPath;
			entry.parent_spec_sha256 = catalog.specHash;
			entry.roadmap_path = catalog.roadmapPath;
			entry.roadmap_sha256 = catalog.roadmapHash;
			updateSessionFrontmatter(root, input.session, {
				roadmap_feature: featureId,
				feature_id: featureId,
				parent_spec: catalog.specId,
				parent_spec_path: catalog.specPath,
				parent_spec_sha256: catalog.specHash,
				roadmap_path: catalog.roadmapPath,
				roadmap_sha256: catalog.roadmapHash,
				governance_status: "governed",
				spec_required: true,
				pending_spec: false,
				pending_spec_status: "resolved",
				pending_spec_missing: [],
				pending_spec_resolution_hint: entry.resolution_hint,
				spec_waiver_reason: "",
				updated_at: resolvedAt,
			});
			if (runtime.failAfterFrontmatter)
				throw new Error("Injected governance failure after frontmatter");
			writePendingSpecIndex(root, index);
			return entry;
		});
	});
}
