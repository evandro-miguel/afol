import { createHash } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ArtifactReferenceV2 } from "../artifacts/types";
import { readBoundedSourceFile } from "../io/safe-source";
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import {
	type ArtifactReference,
	canonicalArtifactEvidenceReference,
	verifyArtifactReference,
} from "./artifact-inspection";
import {
	type AssistedEvaluationSelector,
	prepareAssistedEvaluationBaseline,
} from "./assisted-evaluation-baseline";
import { resolveLessonVersionForAdoption } from "./lesson-records";
import type { EvaluationContractV1 } from "./suggestion-model";

export const ASSISTED_PROPOSAL_KINDS = [
	"code",
	"skill_update",
	"skill_discovery",
	"skill_create",
	"library",
	"contextual_preference",
	"durable_decision",
	"durable_restriction",
	"lesson_adoption",
] as const;

export type AssistedProposalKind = (typeof ASSISTED_PROPOSAL_KINDS)[number];
export type AssistedProposalEvidenceReference =
	| ArtifactReference
	| ArtifactReferenceV2;

type ReplaceTextOperation = {
	type: "replace_text";
	target: string;
	expected_sha256: string;
	before: string;
	after: string;
};

type CreateTextOperation = {
	type: "create_text";
	target: string;
	content: string;
};

type ActivateSkillOperation = {
	type: "activate_skill";
	target: string;
	expected_sha256: string;
	rationale: string;
};

type PublishGuidanceOperation = {
	type: "publish_guidance";
	statement: string;
	scope?: string;
};

type ApplyLessonOperation = {
	type: "apply_lesson";
	lesson_id: string;
	version_id: string;
	field_set_digest: string;
};

type ProposalOperation =
	| ReplaceTextOperation
	| CreateTextOperation
	| ActivateSkillOperation
	| PublishGuidanceOperation
	| ApplyLessonOperation;

export type AssistedProposalPacketV1 = {
	schema_version: 1;
	kind: AssistedProposalKind;
	observed_fact: string;
	hypothesis: string;
	evidence_refs: AssistedProposalEvidenceReference[];
	intervention: { operations: ProposalOperation[] };
	alternative: string;
	validation_plan: { commands: string[]; expected: string };
	skill_search?: {
		queried: string[];
		existing_results: string[];
		rationale: string;
	};
	evaluation_baseline?: AssistedEvaluationSelector;
	reopen_from?: string;
};

export type AssistedProposalPreview = {
	read_only: true;
	approved: false;
	project_id: string;
	kind: AssistedProposalKind;
	proposal_id: string;
	version_digest: string;
	problem_identity: string;
	intervention_identity: string;
	observed_fact: string;
	hypothesis: string;
	evidence_refs: AssistedProposalEvidenceReference[];
	intervention: { operations: Array<Record<string, unknown>> };
	alternative: string;
	validation_plan: { commands: string[]; expected: string; executed: false };
	evaluation_baseline: {
		status:
			| "mapped"
			| "no_mapped_baseline"
			| "ambiguous_baseline"
			| "unavailable";
		reason: string;
		contract?: EvaluationContractV1;
	};
	target_baselines: Array<{
		target: string;
		operation: string;
		state: "present" | "absent";
		sha256: string | null;
	}>;
	problem_reopen_link: string | null;
};

export class AssistedProposalPacketError extends Error {
	readonly code = "EVOLVE_PROPOSAL_INVALID";
	readonly hint =
		"Correct the packet field identified in the message and rerun --dry-run. Validation commands were not executed.";
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MAX_PACKET_BYTES = 64 * 1024;
const MAX_TARGET_BYTES = 256 * 1024;
const MAX_OPERATIONS = 8;
const TARGET_PATH_PATTERN = "^(?![A-Za-z]:)(?!/)(?!.*(?:^|/)\\.\\.(?:/|$)).+$";
const TARGET_TEXT_EXTENSIONS = new Set([
	".c",
	".cc",
	".cpp",
	".css",
	".go",
	".html",
	".js",
	".jsx",
	".json",
	".md",
	".mjs",
	".py",
	".rs",
	".sh",
	".sql",
	".toml",
	".ts",
	".tsx",
	".txt",
	".yaml",
	".yml",
]);
const DENIED_TARGET_DIRECTORIES = new Set([
	".afol",
	".agents",
	".cache",
	".claude",
	".codex",
	".git",
	"__pycache__",
	"build",
	"coverage",
	"dist",
	"env",
	"node_modules",
	"out",
	"site-packages",
	"target",
	"temp",
	"tmp",
	"vendor",
	"venv",
]);

function safeDiagnosticDetail(error: unknown, root: string): string | null {
	if (!(error instanceof Error)) return null;
	const message = error.message
		.replaceAll("\u0000", " ")
		.replaceAll("\r", " ")
		.replaceAll("\n", " ")
		.trim();
	if (
		!message ||
		message.length > 240 ||
		message.includes(resolve(root)) ||
		/^(?:E[A-Z0-9]+):/.test(message) ||
		/(?:\/home\/|\/tmp\/|[A-Z]:\\)/.test(message)
	)
		return null;
	return message;
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

function isV2EvidenceReference(
	ref: AssistedProposalEvidenceReference,
): ref is ArtifactReferenceV2 {
	return (ref as ArtifactReferenceV2).schema_version === 2;
}

export type LiteralReplaceResult = {
	content: string;
	sha256: string;
};

/**
 * Single literal-substitution seam shared by proposal preparation, apply, and
 * interrupted-apply recovery. The replacer function form suppresses the
 * ECMAScript replacement patterns ($&, $$, $`, $'), so the bytes written are
 * exactly the approved literal text, and the resulting UTF-8 size is bounded
 * by the same target limit at every stage.
 */
export function literalReplaceOnce(input: {
	content: string;
	before: string;
	after: string;
	target: string;
}): LiteralReplaceResult {
	if (input.content.split(input.before).length - 1 !== 1)
		throw new Error(
			`replace before text must match exactly once: ${input.target}`,
		);
	const replaced = input.content.replace(input.before, () => input.after);
	if (Buffer.byteLength(replaced, "utf8") > MAX_TARGET_BYTES)
		throw new Error(
			`replace target result exceeds the safe size limit: ${input.target}`,
		);
	return { content: replaced, sha256: sha256(replaced) };
}

function canonicalProjectId(root: string): string {
	const config = readProjectConfig(root);
	const project = config.project;
	const projectId =
		project !== null && typeof project === "object" && !Array.isArray(project)
			? (project as Record<string, unknown>).id
			: undefined;
	if (typeof projectId !== "string" || !IDENTIFIER_RE.test(projectId))
		throw new Error(
			"proposal preparation requires a configured project identity",
		);
	return projectId;
}

function canonicalProblemEvidence(
	root: string,
	refs: readonly AssistedProposalEvidenceReference[],
): unknown[] {
	const rows = refs.map((raw) => {
		const ref = canonicalArtifactEvidenceReference(root, raw);
		if (isV2EvidenceReference(ref))
			return {
				owner: ref.owner,
				path: ref.relative_path,
				content_digest: ref.content_digest,
				...(ref.digest_scope === "range"
					? {
							anchor: ref.anchor,
							digest_scope: "range",
							source_identity_digest: ref.source_identity_digest,
						}
					: {}),
			};
		const legacy = ref as ArtifactReference;
		return {
			session_id: legacy.session_id,
			path: legacy.path,
			content_digest: legacy.content_digest,
			...(legacy.digest_scope === "range" || legacy.anchor.startsWith("bytes:")
				? {
						anchor: legacy.anchor,
						digest_scope: "range",
						source_identity_digest: legacy.source_identity_digest,
					}
				: {}),
		};
	});
	return [...new Set(rows.map(stableJson))]
		.sort()
		.map((row) => JSON.parse(row) as unknown);
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value !== null && typeof value === "object")
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "null";
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error(`${label} must be an object`);
	return value as Record<string, unknown>;
}

function onlyKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
	label: string,
): void {
	for (const key of Object.keys(value))
		if (!allowed.includes(key))
			throw new Error(`${label} has an unsupported field: ${key}`);
}

function nonEmpty(value: unknown, label: string, max = 4_000): string {
	if (
		typeof value !== "string" ||
		value.trim().length === 0 ||
		value.length > max
	)
		throw new Error(
			`${label} must be non-empty text of at most ${max} characters`,
		);
	return value;
}

function validTargetPath(
	root: string,
	value: unknown,
): { relativePath: string; absolutePath: string } {
	if (
		typeof value !== "string" ||
		!value ||
		value.includes("\\") ||
		/^[A-Za-z]:/.test(value) ||
		isAbsolute(value)
	)
		throw new Error("proposal target must be a project-relative path");
	const absolutePath = resolve(root, value);
	const canonical = relative(root, absolutePath).replaceAll("\\", "/");
	if (
		canonical !== value ||
		canonical.startsWith("../") ||
		canonical === ".." ||
		canonical.startsWith("/") ||
		canonical
			.split("/")
			.some((part) => part === "" || part === "." || part === "..")
	)
		throw new Error("proposal target escapes the project root");
	if (!TARGET_TEXT_EXTENSIONS.has(canonical.slice(canonical.lastIndexOf("."))))
		throw new Error("proposal target must be a supported text file");
	let current = resolve(root);
	for (const part of canonical.split("/")) {
		current = join(current, part);
		try {
			if (lstatSync(current).isSymbolicLink())
				throw new Error("proposal target crosses a symlink");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
			throw error;
		}
	}
	return { relativePath: canonical, absolutePath };
}

export function targetAllowed(
	root: string,
	kind: AssistedProposalKind,
	relativePath: string,
): boolean {
	const paths = resolveProjectPaths(root);
	// Derive the skills root from the configured paths.skillsDir (the same
	// root the catalog and context guidance read), not from agentsDir, so a
	// customized skills_dir is honored by prepare and apply alike.
	const skills = `${paths.skillsDir.replaceAll("\\", "/")}/`;
	const library = `${paths.libraryDir.replaceAll("\\", "/")}/`;
	switch (kind) {
		case "code": {
			const parts = relativePath.split("/");
			const fileName = parts.at(-1) ?? "";
			const deniedCredentialPath = parts.some((part) =>
				/^(?:credentials?|secrets?|vault|private|keys?)$/i.test(part),
			);
			const deniedCredentialFile =
				/^(?:\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|auth\.json|tokens?\.json|.*private[-_]?key.*)$/i.test(
					fileName,
				);
			const deniedRuntimeDirectory = parts.some((part) =>
				DENIED_TARGET_DIRECTORIES.has(part.toLowerCase()),
			);
			const deniedWorkflow = parts[0] === ".github" && parts[1] === "workflows";
			return (
				!deniedCredentialPath &&
				!deniedCredentialFile &&
				!deniedRuntimeDirectory &&
				!deniedWorkflow
			);
		}
		case "skill_update":
		case "skill_create":
			return (
				relativePath.startsWith(skills) &&
				/(?:^|\/)SKILL\.md$/i.test(relativePath)
			);
		case "skill_discovery":
			return (
				relativePath.startsWith(skills) &&
				/(?:^|\/)SKILL\.md$/i.test(relativePath)
			);
		case "library":
			return relativePath.startsWith(library);
		case "contextual_preference":
		case "durable_decision":
		case "durable_restriction":
		case "lesson_adoption":
			return false;
	}
}

function operationKeys(type: string): readonly string[] {
	switch (type) {
		case "replace_text":
			return ["type", "target", "expected_sha256", "before", "after"];
		case "create_text":
			return ["type", "target", "content"];
		case "activate_skill":
			return ["type", "target", "expected_sha256", "rationale"];
		case "publish_guidance":
			return ["type", "statement", "scope"];
		case "apply_lesson":
			return ["type", "lesson_id", "version_id", "field_set_digest"];
		default:
			throw new Error(
				`unsupported proposal operation: ${type || "missing type"}`,
			);
	}
}

function canonicalOperation(
	root: string,
	kind: AssistedProposalKind,
	value: unknown,
): {
	operation: ProposalOperation;
	baseline: AssistedProposalPreview["target_baselines"][number];
	problemShape: Record<string, unknown>;
} {
	const raw = record(value, "proposal operation");
	const type = typeof raw.type === "string" ? raw.type : "";
	onlyKeys(raw, operationKeys(type), "proposal operation");
	const allowedTypesByKind: Record<AssistedProposalKind, readonly string[]> = {
		code: ["replace_text", "create_text"],
		skill_update: ["replace_text"],
		skill_discovery: ["activate_skill"],
		skill_create: ["create_text"],
		library: ["replace_text", "create_text"],
		contextual_preference: ["publish_guidance"],
		durable_decision: ["publish_guidance"],
		durable_restriction: ["publish_guidance"],
		lesson_adoption: ["apply_lesson"],
	};
	if (!allowedTypesByKind[kind].includes(type))
		throw new Error(
			`operation ${type || "missing type"} is not valid for ${kind}`,
		);
	if (type === "replace_text") {
		const target = validTargetPath(root, raw.target);
		if (!targetAllowed(root, kind, target.relativePath))
			throw new Error(
				`target is not allowed for ${kind}: ${target.relativePath}`,
			);
		const content = readBoundedSourceFile(
			target.absolutePath,
			"proposal target",
			{ maxBytes: MAX_TARGET_BYTES, maxLines: 20_000, maxCandidates: 50_000 },
		);
		if (content === null)
			throw new Error(`replace target is missing: ${target.relativePath}`);
		const bytes = Buffer.from(content, "utf8");
		const expected = nonEmpty(raw.expected_sha256, "expected_sha256", 64);
		if (!SHA256_RE.test(expected) || sha256(bytes) !== expected)
			throw new Error(
				`replace target baseline changed: ${target.relativePath}`,
			);
		const before = nonEmpty(raw.before, "replace before", 16_000);
		const after = nonEmpty(raw.after, "replace after", 16_000);
		// Compute and validate the resulting file at preparation time so a
		// replacement that expands past the target limit is refused before
		// approval, using the same seam apply and recovery run.
		literalReplaceOnce({
			content,
			before,
			after,
			target: target.relativePath,
		});
		return {
			operation: {
				type,
				target: target.relativePath,
				expected_sha256: expected,
				before,
				after,
			},
			baseline: {
				target: target.relativePath,
				operation: type,
				state: "present",
				sha256: expected,
			},
			problemShape: { type, target: target.relativePath },
		};
	}
	if (type === "create_text") {
		const target = validTargetPath(root, raw.target);
		if (!targetAllowed(root, kind, target.relativePath))
			throw new Error(
				`target is not allowed for ${kind}: ${target.relativePath}`,
			);
		if (existsSync(target.absolutePath))
			throw new Error(`create target already exists: ${target.relativePath}`);
		const content = nonEmpty(raw.content, "create content", MAX_TARGET_BYTES);
		return {
			operation: { type, target: target.relativePath, content },
			baseline: {
				target: target.relativePath,
				operation: type,
				state: "absent",
				sha256: null,
			},
			problemShape: { type, target: target.relativePath },
		};
	}
	if (type === "activate_skill") {
		if (kind !== "skill_discovery")
			throw new Error("activate_skill is only valid for skill_discovery");
		const target = validTargetPath(root, raw.target);
		if (!targetAllowed(root, kind, target.relativePath))
			throw new Error(`skill target is not allowed: ${target.relativePath}`);
		if (!existsSync(target.absolutePath))
			throw new Error(
				`skill discovery target is missing: ${target.relativePath}`,
			);
		const expected = nonEmpty(raw.expected_sha256, "expected_sha256", 64);
		const skillContent = readBoundedSourceFile(
			target.absolutePath,
			"skill discovery target",
			{ maxBytes: MAX_TARGET_BYTES, maxLines: 20_000, maxCandidates: 50_000 },
		);
		if (
			skillContent === null ||
			!SHA256_RE.test(expected) ||
			sha256(skillContent) !== expected
		)
			throw new Error(
				`skill discovery baseline changed: ${target.relativePath}`,
			);
		const rationale = nonEmpty(raw.rationale, "skill discovery rationale");
		return {
			operation: {
				type,
				target: target.relativePath,
				expected_sha256: expected,
				rationale,
			},
			baseline: {
				target: target.relativePath,
				operation: type,
				state: "present",
				sha256: expected,
			},
			problemShape: { type, target: target.relativePath },
		};
	}
	if (type === "publish_guidance") {
		if (
			![
				"contextual_preference",
				"durable_decision",
				"durable_restriction",
			].includes(kind)
		)
			throw new Error(`publish_guidance is not valid for ${kind}`);
		const statement = nonEmpty(raw.statement, "guidance statement", 1_000);
		const scope =
			raw.scope === undefined
				? undefined
				: nonEmpty(raw.scope, "guidance scope", 512);
		return {
			operation: { type, statement, ...(scope ? { scope } : {}) },
			baseline: {
				target: scope ?? "project",
				operation: type,
				state: "absent",
				sha256: null,
			},
			problemShape: { type, target: scope ?? "project" },
		};
	}
	if (type === "apply_lesson") {
		if (kind !== "lesson_adoption")
			throw new Error("apply_lesson is only valid for lesson_adoption");
		const lessonId = nonEmpty(raw.lesson_id, "lesson_id", 32);
		const versionId = nonEmpty(raw.version_id, "version_id", 32);
		const fieldSetDigest = nonEmpty(
			raw.field_set_digest,
			"field_set_digest",
			64,
		);
		const lesson = resolveLessonVersionForAdoption(
			root,
			lessonId,
			versionId,
			fieldSetDigest,
		);
		return {
			operation: {
				type,
				lesson_id: lesson.lesson_id,
				version_id: lesson.version_id,
				field_set_digest: lesson.field_set_digest,
			},
			baseline: {
				target: `lesson:${lesson.lesson_id}`,
				operation: type,
				state: "present",
				sha256: lesson.field_set_digest,
			},
			problemShape: {
				type,
				lesson_id: lesson.lesson_id,
				field_set_digest: lesson.field_set_digest,
			},
		};
	}
	throw new Error(`unsupported proposal operation: ${type || "missing type"}`);
}

function parseEvidence(value: unknown): AssistedProposalEvidenceReference[] {
	if (!Array.isArray(value) || value.length < 1 || value.length > 20)
		throw new Error("evidence_refs must contain 1 to 20 artifact references");
	const refs = value.map((entry, index) => {
		const ref = record(entry, `evidence_refs[${index}]`);
		if (ref.schema_version === 2) {
			onlyKeys(
				ref,
				[
					"schema_version",
					"owner",
					"relative_path",
					"anchor",
					"content_digest",
					"digest_scope",
					"source_identity_digest",
				],
				`evidence_refs[${index}]`,
			);
			const owner = record(ref.owner, `evidence_refs[${index}].owner`);
			onlyKeys(owner, ["kind", "id"], `evidence_refs[${index}].owner`);
			const ownerKind = owner.kind;
			const ownerId = nonEmpty(owner.id, "evidence owner id", 160);
			const idPattern =
				ownerKind === "record"
					? /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
					: IDENTIFIER_RE;
			if (
				(ownerKind !== "session" && ownerKind !== "record") ||
				!idPattern.test(ownerId)
			)
				throw new Error(
					`evidence_refs[${index}] contains an invalid owner identity`,
				);
			const path = nonEmpty(ref.relative_path, "evidence path", 512);
			const anchor = nonEmpty(ref.anchor, "evidence anchor", 128);
			const contentDigest = nonEmpty(
				ref.content_digest,
				"evidence content digest",
				64,
			);
			if (!SHA256_RE.test(contentDigest))
				throw new Error(
					`evidence_refs[${index}] contains an invalid identity or digest`,
				);
			const byteAnchor = /^bytes:(\d+)-(\d+)$/.test(anchor);
			const lineAnchor = /^line:[1-9]\d*$/.test(anchor);
			if (
				(ref.digest_scope === "range") !== byteAnchor ||
				(ref.digest_scope === "artifact") !== lineAnchor ||
				(ref.digest_scope !== "artifact" && ref.digest_scope !== "range")
			)
				throw new Error(
					`evidence_refs[${index}] digest_scope does not match its anchor`,
				);
			const reference: ArtifactReferenceV2 = {
				schema_version: 2,
				owner: { kind: ownerKind, id: ownerId },
				relative_path: path,
				anchor,
				content_digest: contentDigest,
				digest_scope: ref.digest_scope,
			};
			if (ref.digest_scope === "range") {
				const sourceIdentityDigest = nonEmpty(
					ref.source_identity_digest,
					`evidence_refs[${index}].source_identity_digest`,
					64,
				);
				if (!SHA256_RE.test(sourceIdentityDigest))
					throw new Error(
						`evidence_refs[${index}].source_identity_digest must be a SHA-256 digest`,
					);
				reference.source_identity_digest = sourceIdentityDigest;
			} else if (ref.source_identity_digest !== undefined) {
				throw new Error(
					`evidence_refs[${index}] artifact scope cannot include source_identity_digest`,
				);
			}
			return reference;
		}
		onlyKeys(
			ref,
			[
				"session_id",
				"path",
				"anchor",
				"content_digest",
				"digest_scope",
				"source_identity_digest",
			],
			`evidence_refs[${index}]`,
		);
		const session = nonEmpty(ref.session_id, "evidence session id", 160);
		const path = nonEmpty(ref.path, "evidence path", 512);
		const anchor = nonEmpty(ref.anchor, "evidence anchor", 128);
		const contentDigest = nonEmpty(
			ref.content_digest,
			"evidence content digest",
			64,
		);
		if (!IDENTIFIER_RE.test(session) || !SHA256_RE.test(contentDigest))
			throw new Error(
				`evidence_refs[${index}] contains an invalid identity or digest`,
			);
		const byteAnchor = /^bytes:(\d+)-(\d+)$/.test(anchor);
		const lineAnchor = /^line:[1-9]\d*$/.test(anchor);
		if (
			(ref.digest_scope === "range") !== byteAnchor ||
			(ref.digest_scope === "artifact") !== lineAnchor ||
			(ref.digest_scope !== "artifact" && ref.digest_scope !== "range")
		)
			throw new Error(
				`evidence_refs[${index}] digest_scope does not match its anchor`,
			);
		const reference: ArtifactReference = {
			session_id: session,
			path,
			anchor,
			content_digest: contentDigest,
			digest_scope: ref.digest_scope,
		};
		if (ref.digest_scope === "range") {
			const sourceIdentityDigest = nonEmpty(
				ref.source_identity_digest,
				`evidence_refs[${index}].source_identity_digest`,
				64,
			);
			if (!SHA256_RE.test(sourceIdentityDigest))
				throw new Error(
					`evidence_refs[${index}].source_identity_digest must be a SHA-256 digest`,
				);
			reference.source_identity_digest = sourceIdentityDigest;
		} else if (ref.source_identity_digest !== undefined) {
			throw new Error(
				`evidence_refs[${index}] artifact scope cannot include source_identity_digest`,
			);
		}
		return reference;
	});
	const unique = new Set(
		refs.map((ref) => {
			if (isV2EvidenceReference(ref))
				return `${ref.owner.kind}\n${ref.owner.id}\n${ref.relative_path}\n${ref.anchor}`;
			const legacy = ref as ArtifactReference;
			return `session\n${legacy.session_id}\n${legacy.path}\n${legacy.anchor}`;
		}),
	);
	if (unique.size !== refs.length)
		throw new Error("evidence_refs must be unique");
	return refs;
}

function parseSkillSearch(
	value: unknown,
): AssistedProposalPacketV1["skill_search"] {
	if (value === undefined) return undefined;
	const search = record(value, "skill_search");
	onlyKeys(
		search,
		["queried", "existing_results", "rationale"],
		"skill_search",
	);
	const strings = (entry: unknown, label: string): string[] => {
		if (!Array.isArray(entry) || entry.length > 20)
			throw new Error(`${label} must be an array of at most 20 strings`);
		return entry.map((item, index) =>
			nonEmpty(item, `${label}[${index}]`, 512),
		);
	};
	return {
		queried: strings(search.queried, "skill_search.queried"),
		existing_results: strings(
			search.existing_results,
			"skill_search.existing_results",
		),
		rationale: nonEmpty(search.rationale, "skill_search.rationale", 1_000),
	};
}

function parseEvaluationBaseline(
	value: unknown,
): AssistedProposalPacketV1["evaluation_baseline"] {
	if (value === undefined) return undefined;
	const selector = record(value, "evaluation_baseline");
	onlyKeys(selector, ["task_type", "cluster_id"], "evaluation_baseline");
	return {
		task_type: nonEmpty(
			selector.task_type,
			"evaluation_baseline.task_type",
			160,
		),
		cluster_id: nonEmpty(
			selector.cluster_id,
			"evaluation_baseline.cluster_id",
			160,
		),
	};
}

export function parseAssistedProposalPacket(
	value: unknown,
): AssistedProposalPacketV1 {
	const raw = record(value, "proposal packet");
	onlyKeys(
		raw,
		[
			"schema_version",
			"kind",
			"observed_fact",
			"hypothesis",
			"evidence_refs",
			"intervention",
			"alternative",
			"validation_plan",
			"skill_search",
			"evaluation_baseline",
			"reopen_from",
		],
		"proposal packet",
	);
	if (raw.schema_version !== 1)
		throw new Error("proposal packet schema_version must be 1");
	if (
		typeof raw.kind !== "string" ||
		!ASSISTED_PROPOSAL_KINDS.includes(raw.kind as AssistedProposalKind)
	)
		throw new Error("proposal packet kind is unsupported");
	const intervention = record(raw.intervention, "intervention");
	onlyKeys(intervention, ["operations"], "intervention");
	if (
		!Array.isArray(intervention.operations) ||
		intervention.operations.length < 1 ||
		intervention.operations.length > MAX_OPERATIONS
	)
		throw new Error("intervention.operations must contain 1 to 8 operations");
	const validation = record(raw.validation_plan, "validation_plan");
	onlyKeys(validation, ["commands", "expected"], "validation_plan");
	if (
		!Array.isArray(validation.commands) ||
		validation.commands.length < 1 ||
		validation.commands.length > 8
	)
		throw new Error("validation_plan.commands must contain 1 to 8 commands");
	const skillSearch = parseSkillSearch(raw.skill_search);
	const evaluationBaseline = parseEvaluationBaseline(raw.evaluation_baseline);
	if (
		raw.kind === "skill_create" &&
		(!skillSearch ||
			skillSearch.queried.length === 0 ||
			!skillSearch.rationale.trim())
	)
		throw new Error(
			"skill_create requires a non-empty existing-skill search rationale",
		);
	const reopenFrom =
		raw.reopen_from === undefined
			? undefined
			: nonEmpty(raw.reopen_from, "reopen_from", 160);
	if (reopenFrom && !IDENTIFIER_RE.test(reopenFrom))
		throw new Error("reopen_from is invalid");
	return {
		schema_version: 1,
		kind: raw.kind as AssistedProposalKind,
		observed_fact: nonEmpty(raw.observed_fact, "observed_fact"),
		hypothesis: nonEmpty(raw.hypothesis, "hypothesis"),
		evidence_refs: parseEvidence(raw.evidence_refs),
		intervention: {
			operations: intervention.operations as ProposalOperation[],
		},
		alternative: nonEmpty(raw.alternative, "alternative"),
		validation_plan: {
			commands: validation.commands.map((command, index) =>
				nonEmpty(command, `validation_plan.commands[${index}]`, 512),
			),
			expected: nonEmpty(validation.expected, "validation_plan.expected"),
		},
		...(skillSearch ? { skill_search: skillSearch } : {}),
		...(evaluationBaseline ? { evaluation_baseline: evaluationBaseline } : {}),
		...(reopenFrom ? { reopen_from: reopenFrom } : {}),
	};
}

function readPacket(path: string): unknown {
	if (!path || path.includes("\0"))
		throw new Error("proposal packet path is invalid");
	const resolved = resolve(path);
	const content = readBoundedSourceFile(resolved, "proposal packet", {
		maxBytes: MAX_PACKET_BYTES,
		maxLines: 2_000,
		maxCandidates: 5_000,
	});
	if (content === null) throw new Error("proposal packet is unavailable");
	try {
		return JSON.parse(content) as unknown;
	} catch {
		throw new AssistedProposalPacketError("proposal packet JSON is malformed");
	}
}

function prepareAssistedProposalPreviewInternal(input: {
	root: string;
	packetPath: string;
}): AssistedProposalPreview {
	const projectId = canonicalProjectId(input.root);
	const packet = parseAssistedProposalPacket(readPacket(input.packetPath));
	for (const [index, ref] of packet.evidence_refs.entries()) {
		try {
			verifyArtifactReference(input.root, ref);
		} catch (error) {
			const detail = safeDiagnosticDetail(error, input.root);
			throw new AssistedProposalPacketError(
				`evidence_refs[${index}]: ${detail ?? "source could not be safely verified"}`,
			);
		}
	}
	const normalizedReferenceKeys = packet.evidence_refs.map((raw) => {
		const ref = canonicalArtifactEvidenceReference(input.root, raw);
		return isV2EvidenceReference(ref)
			? stableJson({
					owner: ref.owner,
					path: ref.relative_path,
					anchor: ref.anchor,
				})
			: stableJson({
					session_id: ref.session_id,
					path: ref.path,
					anchor: ref.anchor,
				});
	});
	if (new Set(normalizedReferenceKeys).size !== packet.evidence_refs.length)
		throw new AssistedProposalPacketError("evidence_refs must be unique");
	const evaluationBaseline = prepareAssistedEvaluationBaseline({
		root: input.root,
		projectId,
		evidenceRefs: packet.evidence_refs,
		...(packet.evaluation_baseline
			? { selector: packet.evaluation_baseline }
			: {}),
	});
	const normalizedOperations: ProposalOperation[] = [];
	const targetBaselines: AssistedProposalPreview["target_baselines"] = [];
	const problemShapes: Record<string, unknown>[] = [];
	const seenTargets = new Set<string>();
	for (const [index, operation] of packet.intervention.operations.entries()) {
		let normalized: ReturnType<typeof canonicalOperation>;
		try {
			normalized = canonicalOperation(input.root, packet.kind, operation);
		} catch (error) {
			const detail = safeDiagnosticDetail(error, input.root);
			throw new AssistedProposalPacketError(
				`intervention.operations[${index}]: ${detail ?? "target precondition could not be safely checked"}`,
			);
		}
		if (normalized.operation.type !== "publish_guidance") {
			const target = normalized.baseline.target;
			if (seenTargets.has(target))
				throw new Error(`intervention repeats target: ${target}`);
			seenTargets.add(target);
		}
		normalizedOperations.push(normalized.operation);
		targetBaselines.push(normalized.baseline);
		problemShapes.push(normalized.problemShape);
	}
	if (
		packet.kind === "skill_discovery" &&
		(normalizedOperations.length !== 1 ||
			normalizedOperations[0]?.type !== "activate_skill")
	)
		throw new Error(
			"skill_discovery requires exactly one activate_skill operation",
		);
	if (
		[
			"contextual_preference",
			"durable_decision",
			"durable_restriction",
		].includes(packet.kind) &&
		(normalizedOperations.length !== 1 ||
			normalizedOperations[0]?.type !== "publish_guidance")
	)
		throw new Error(
			`${packet.kind} requires exactly one publish_guidance operation`,
		);
	if (
		packet.kind === "lesson_adoption" &&
		(normalizedOperations.length !== 1 ||
			normalizedOperations[0]?.type !== "apply_lesson")
	)
		throw new Error(
			"lesson_adoption requires exactly one apply_lesson operation",
		);
	const packetDigest = sha256(stableJson(packet));
	const versionDigest = sha256(
		stableJson({
			project_id: projectId,
			packet,
			packet_digest: packetDigest,
			evaluation_baseline: evaluationBaseline,
			target_baselines: targetBaselines,
			operations: normalizedOperations,
		}),
	);
	const interventionIdentity = sha256(
		stableJson({
			project_id: projectId,
			kind: packet.kind,
			operations: [...problemShapes].sort((left, right) =>
				stableJson(left).localeCompare(stableJson(right)),
			),
		}),
	);
	const problemIdentity = sha256(
		stableJson({
			project_id: projectId,
			kind: packet.kind,
			evidence_refs: canonicalProblemEvidence(input.root, packet.evidence_refs),
			intervention_identity: interventionIdentity,
		}),
	);
	return {
		read_only: true,
		approved: false,
		project_id: projectId,
		kind: packet.kind,
		proposal_id: `EP-${versionDigest.slice(0, 24)}`,
		version_digest: versionDigest,
		problem_identity: problemIdentity,
		intervention_identity: interventionIdentity,
		observed_fact: packet.observed_fact,
		hypothesis: packet.hypothesis,
		evidence_refs: packet.evidence_refs,
		intervention: {
			operations: normalizedOperations.map((operation) => ({ ...operation })),
		},
		alternative: packet.alternative,
		validation_plan: { ...packet.validation_plan, executed: false },
		evaluation_baseline: evaluationBaseline,
		target_baselines: targetBaselines,
		problem_reopen_link: packet.reopen_from ?? null,
	};
}

export function prepareAssistedProposalPreview(input: {
	root: string;
	packetPath: string;
}): AssistedProposalPreview {
	try {
		return prepareAssistedProposalPreviewInternal(input);
	} catch (error) {
		if (error instanceof AssistedProposalPacketError) throw error;
		const detail = safeDiagnosticDetail(error, input.root);
		if (detail) throw new AssistedProposalPacketError(detail);
		throw new AssistedProposalPacketError(
			"proposal packet or source failed safe validation",
		);
	}
}

export const ASSISTED_PROPOSAL_PACKET_EXAMPLE = {
	schema_version: 1,
	kind: "code",
	observed_fact:
		"The reported output retains decomposed Unicode after trimming.",
	hypothesis:
		"Applying NFC normalization after trimming may align output with canonical labels.",
	evidence_refs: [
		{
			session_id: "S-20260925-example",
			path: ".afol/wb/S-20260925-example/S-20260925-example_report_1.md",
			anchor: "line:12",
			content_digest: "<sha256-from-evolve-artifacts>",
			digest_scope: "artifact",
		},
	],
	intervention: {
		operations: [
			{
				type: "replace_text",
				target: "src/label.ts",
				expected_sha256: "<sha256-of-entire-current-file>",
				before: "return label.trim();",
				after: "return label.trim().normalize('NFC');",
			},
			{
				type: "replace_text",
				target: "tests/label.test.ts",
				expected_sha256: "<sha256-of-entire-current-test-file>",
				before: 'expect(normalizeLabel("  café ")).toBe("café");',
				after: 'expect(normalizeLabel("  café ")).toBe("café");',
			},
		],
	},
	alternative:
		"Keep decomposed sequences and document that code points are preserved.",
	validation_plan: {
		commands: ["bun test tests/label.test.ts"],
		expected:
			"The focused Unicode normalization case passes and trimming behavior remains unchanged.",
	},
} as const;

const JSON_SCHEMA_THEN_KEY = "then" as const;

function operationPolicySchema(
	kinds: readonly AssistedProposalKind[],
	operationTypes: readonly string[],
	exactlyOne = false,
) {
	return {
		if: { properties: { kind: { enum: [...kinds] } }, required: ["kind"] },
		[JSON_SCHEMA_THEN_KEY]: {
			properties: {
				intervention: {
					properties: {
						operations: {
							...(exactlyOne ? { minItems: 1, maxItems: 1 } : {}),
							items: {
								properties: { type: { enum: [...operationTypes] } },
								required: ["type"],
							},
						},
					},
				},
			},
		},
	};
}

export const ASSISTED_PROPOSAL_PACKET_SCHEMA = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	title: "AFOL Assisted Evolve proposal packet",
	"x-afol-kind-target-policy": {
		code: {
			operations: ["replace_text", "create_text"],
			targets:
				"Any project-relative supported text file, including root files, src/lib, cli, test/tests, and docs; deny .afol/.agents/.git and runtime/build/cache/dependency paths, credential directories/files, and .github/workflows.",
		},
		skill_update: {
			operations: ["replace_text"],
			targets: "An existing configured .agents/skills/<name>/SKILL.md target.",
		},
		skill_discovery: {
			operations: ["activate_skill"],
			targets:
				"Exactly one existing configured .agents/skills/<name>/SKILL.md; no file content is changed.",
		},
		skill_create: {
			operations: ["create_text"],
			targets:
				"An absent configured .agents/skills/<name>/SKILL.md; a non-empty existing-skill search rationale is required.",
		},
		library: {
			operations: ["replace_text", "create_text"],
			targets:
				"A project-relative supported text file beneath the configured Library directory.",
		},
		contextual_preference: {
			operations: ["publish_guidance"],
			targets: "One project-scoped contextual preference statement.",
		},
		durable_decision: {
			operations: ["publish_guidance"],
			targets: "One project-scoped durable decision statement.",
		},
		durable_restriction: {
			operations: ["publish_guidance"],
			targets: "One project-scoped durable restriction statement.",
		},
		lesson_adoption: {
			operations: ["apply_lesson"],
			targets:
				"Exactly one existing, current, non-contradicted lesson version identified by lesson_id, version_id, and field_set_digest.",
		},
	},
	"x-afol-evaluation-baseline":
		"Optional {task_type, cluster_id} selects an existing canonical observation cohort. The server verifies the selector against referenced session evidence and freezes the existing evaluator contract; record-only evidence does not invent a session cohort, and packets cannot supply scorecards or metrics.",
	type: "object",
	additionalProperties: false,
	required: [
		"schema_version",
		"kind",
		"observed_fact",
		"hypothesis",
		"evidence_refs",
		"intervention",
		"alternative",
		"validation_plan",
	],
	properties: {
		schema_version: { const: 1 },
		kind: { enum: ASSISTED_PROPOSAL_KINDS },
		observed_fact: { type: "string", minLength: 1 },
		hypothesis: { type: "string", minLength: 1 },
		evidence_refs: {
			type: "array",
			minItems: 1,
			maxItems: 20,
			items: {
				oneOf: [
					{
						type: "object",
						additionalProperties: false,
						required: ["session_id", "path", "anchor", "content_digest"],
						properties: {
							session_id: { type: "string" },
							path: { type: "string" },
							anchor: { type: "string" },
							content_digest: {
								type: "string",
								pattern: "^[a-f0-9]{64}$",
							},
							digest_scope: { enum: ["artifact", "range"] },
							source_identity_digest: {
								type: "string",
								pattern: "^[a-f0-9]{64}$",
							},
						},
						oneOf: [
							{
								required: ["digest_scope"],
								properties: {
									digest_scope: { const: "artifact" },
									anchor: {
										type: "string",
										pattern: "^line:[1-9]\\d*$",
									},
								},
								not: { required: ["source_identity_digest"] },
							},
							{
								required: ["digest_scope", "source_identity_digest"],
								properties: {
									digest_scope: { const: "range" },
									anchor: {
										type: "string",
										pattern: "^bytes:\\d+-\\d+$",
									},
								},
							},
						],
					},
					{
						type: "object",
						additionalProperties: false,
						required: [
							"schema_version",
							"owner",
							"relative_path",
							"anchor",
							"content_digest",
							"digest_scope",
						],
						properties: {
							schema_version: { const: 2 },
							owner: {
								type: "object",
								additionalProperties: false,
								required: ["kind", "id"],
								properties: {
									kind: { enum: ["session", "record"] },
									id: { type: "string" },
								},
							},
							relative_path: { type: "string" },
							anchor: { type: "string" },
							content_digest: {
								type: "string",
								pattern: "^[a-f0-9]{64}$",
							},
							digest_scope: { enum: ["artifact", "range"] },
							source_identity_digest: {
								type: "string",
								pattern: "^[a-f0-9]{64}$",
							},
						},
						oneOf: [
							{
								required: ["digest_scope"],
								properties: {
									digest_scope: { const: "artifact" },
									anchor: {
										type: "string",
										pattern: "^line:[1-9]\\d*$",
									},
								},
								not: { required: ["source_identity_digest"] },
							},
							{
								required: ["digest_scope", "source_identity_digest"],
								properties: {
									digest_scope: { const: "range" },
									anchor: {
										type: "string",
										pattern: "^bytes:\\d+-\\d+$",
									},
								},
							},
						],
					},
				],
			},
		},
		intervention: {
			type: "object",
			additionalProperties: false,
			required: ["operations"],
			properties: {
				operations: {
					type: "array",
					minItems: 1,
					maxItems: MAX_OPERATIONS,
					items: {
						oneOf: [
							{
								type: "object",
								additionalProperties: false,
								required: [
									"type",
									"target",
									"expected_sha256",
									"before",
									"after",
								],
								properties: {
									type: { const: "replace_text" },
									target: {
										type: "string",
										minLength: 1,
										pattern: TARGET_PATH_PATTERN,
									},
									expected_sha256: {
										type: "string",
										pattern: "^[a-f0-9]{64}$",
									},
									before: { type: "string", minLength: 1 },
									after: { type: "string", minLength: 1 },
								},
							},
							{
								type: "object",
								additionalProperties: false,
								required: ["type", "target", "content"],
								properties: {
									type: { const: "create_text" },
									target: {
										type: "string",
										minLength: 1,
										pattern: TARGET_PATH_PATTERN,
									},
									content: { type: "string", minLength: 1 },
								},
							},
							{
								type: "object",
								additionalProperties: false,
								required: ["type", "target", "expected_sha256", "rationale"],
								properties: {
									type: { const: "activate_skill" },
									target: {
										type: "string",
										minLength: 1,
										pattern: TARGET_PATH_PATTERN,
									},
									expected_sha256: {
										type: "string",
										pattern: "^[a-f0-9]{64}$",
									},
									rationale: { type: "string", minLength: 1 },
								},
							},
							{
								type: "object",
								additionalProperties: false,
								required: ["type", "statement"],
								properties: {
									type: { const: "publish_guidance" },
									statement: { type: "string", minLength: 1 },
									scope: { type: "string", minLength: 1 },
								},
							},
							{
								type: "object",
								additionalProperties: false,
								required: [
									"type",
									"lesson_id",
									"version_id",
									"field_set_digest",
								],
								properties: {
									type: { const: "apply_lesson" },
									lesson_id: { type: "string", pattern: "^L-[a-f0-9]{20}$" },
									version_id: { type: "string", pattern: "^LV-[a-f0-9]{20}$" },
									field_set_digest: {
										type: "string",
										pattern: "^[a-f0-9]{64}$",
									},
								},
							},
						],
					},
				},
			},
		},
		alternative: { type: "string", minLength: 1 },
		validation_plan: {
			type: "object",
			additionalProperties: false,
			required: ["commands", "expected"],
			properties: {
				commands: {
					type: "array",
					minItems: 1,
					maxItems: 8,
					items: { type: "string" },
				},
				expected: { type: "string", minLength: 1 },
			},
		},
		evaluation_baseline: {
			type: "object",
			additionalProperties: false,
			required: ["task_type", "cluster_id"],
			properties: {
				task_type: { type: "string", minLength: 1, maxLength: 160 },
				cluster_id: { type: "string", minLength: 1, maxLength: 160 },
			},
		},
		skill_search: {
			type: "object",
			additionalProperties: false,
			required: ["queried", "existing_results", "rationale"],
			properties: {
				queried: { type: "array", items: { type: "string" } },
				existing_results: { type: "array", items: { type: "string" } },
				rationale: { type: "string" },
			},
		},
		reopen_from: { type: "string" },
	},
	allOf: [
		{
			...operationPolicySchema(["code"], ["replace_text", "create_text"]),
		},
		{
			...operationPolicySchema(["lesson_adoption"], ["apply_lesson"], true),
		},
		{
			...operationPolicySchema(["skill_update"], ["replace_text"]),
		},
		{
			...operationPolicySchema(["skill_create"], ["create_text"]),
		},
		{
			...operationPolicySchema(["skill_discovery"], ["activate_skill"], true),
		},
		{
			...operationPolicySchema(["library"], ["replace_text", "create_text"]),
		},
		{
			...operationPolicySchema(
				["contextual_preference", "durable_decision", "durable_restriction"],
				["publish_guidance"],
				true,
			),
		},
		{
			if: {
				properties: { kind: { const: "skill_create" } },
				required: ["kind"],
			},
			[JSON_SCHEMA_THEN_KEY]: {
				required: ["skill_search"],
				properties: {
					skill_search: {
						type: "object",
						additionalProperties: false,
						required: ["queried", "existing_results", "rationale"],
						properties: {
							queried: {
								type: "array",
								minItems: 1,
								maxItems: 20,
								items: { type: "string", minLength: 1 },
							},
							existing_results: {
								type: "array",
								maxItems: 20,
								items: { type: "string", minLength: 1 },
							},
							rationale: { type: "string", minLength: 1, maxLength: 1_000 },
						},
					},
				},
			},
		},
	],
} as const;
