import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";

export type GovernanceStatus = "governed" | "pending_spec" | "unbound";

export type PendingSpecStatus = "open" | "resolved" | "waived";

export type GovernanceMissingField = "roadmap_feature" | "parent_spec";

export type WorkstreamGovernanceInput = {
	featureId?: string;
	parentSpec?: string;
	noSpecRequiredReason?: string;
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
	resolutionHint: string;
	featureId: string;
	parentSpec: string;
};

const INDEX_FILE = "pending-specs.json";
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;
const DEFAULT_PENDING_SPEC_RESOLUTION_HINT =
	'run afol governance resolve-spec --session <session> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason "<reason>"';

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
			Array.isArray((parsed as { entries?: unknown }).entries)
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
	if (index) {
		return index;
	}
	const rebuilt = rebuildPendingSpecIndexFromWorkbench(root);
	writePendingSpecIndex(root, rebuilt);
	return rebuilt;
}

export function writePendingSpecIndex(
	root: string,
	index: PendingSpecIndex,
): void {
	const path = pendingSpecsPath(root);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(index, null, 2)}\n`, "utf8");
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
	if (missing.length === 0) {
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
		resolutionHint: DEFAULT_PENDING_SPEC_RESOLUTION_HINT,
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
	return `open pending_spec blocks new sessions: ${open.length} open; resolve with afol governance resolve-spec --session <id> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason "<reason>"; open: ${shown}${suffix}`;
}

export function assertNoOpenPendingSpecs(root: string): void {
	const open = listOpenPendingSpecs(root);
	if (open.length > 0) {
		throw new Error(formatPendingSpecBlocker(open));
	}
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
		return {
			session,
			missing: entry.missing,
			resolutionHint:
				entry.resolution_hint || DEFAULT_PENDING_SPEC_RESOLUTION_HINT,
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
		resolutionHint: DEFAULT_PENDING_SPEC_RESOLUTION_HINT,
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
		`hint: ${notice.resolutionHint.replace("<session>", notice.session)}`,
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

export function resolvePendingSpec(
	root: string,
	input: {
		session: string;
		featureId?: string;
		parentSpec?: string;
		noSpecRequiredReason?: string;
	},
): PendingSpecEntry {
	const index = readPendingSpecIndex(root);
	const entry = index.entries.find(
		(candidate) => candidate.session_id === input.session,
	);
	if (!entry) {
		throw new Error(
			`pending_spec entry not found for session ${input.session}`,
		);
	}
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
	entry.status = "resolved";
	entry.updated_at = resolvedAt;
	entry.resolved_at = resolvedAt;
	entry.feature_id = featureId;
	entry.parent_spec = parentSpec;
	entry.missing = [];
	entry.resolution_hint = "linked to roadmap feature and parent spec";
	updateSessionFrontmatter(root, input.session, {
		roadmap_feature: featureId,
		feature_id: featureId,
		parent_spec: parentSpec,
		governance_status: "governed",
		spec_required: true,
		pending_spec: false,
		pending_spec_status: "resolved",
		pending_spec_missing: [],
		pending_spec_resolution_hint: entry.resolution_hint,
		spec_waiver_reason: "",
		updated_at: resolvedAt,
	});
	writePendingSpecIndex(root, index);
	return entry;
}
