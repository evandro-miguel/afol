/** Shared owner, reference, pagination, and receipt contracts for artifacts. */

export type ArtifactOwnerKind = "session" | "record";

export type ArtifactOwner = {
	kind: ArtifactOwnerKind;
	id: string;
};

export type ArtifactDigestScope = "artifact" | "range";

/**
 * Owner-relative artifact reference. Unlike the v1 session reference, the
 * owner may be a session or a standalone record, and archiving a session
 * never requires editing the artifact to re-find it.
 */
export type ArtifactReferenceV2 = {
	schema_version: 2;
	owner: ArtifactOwner;
	relative_path: string;
	content_digest: string;
	digest_scope: ArtifactDigestScope;
	anchor: string;
	source_identity_digest?: string;
};

export type ArtifactPage = {
	content: string;
	byte_start: number;
	byte_end: number;
	source_bytes: number;
	has_more: boolean;
	next_offset?: number;
	cursor?: string;
	coverage: "complete" | "partial";
};

export type ArtifactSaveIndexStatus = "ok" | "pending";

export type ArtifactSaveReceipt = {
	persisted: boolean;
	duplicate: boolean;
	artifact_id: string;
	owner: ArtifactOwner;
	path: string;
	content_digest: string;
	bytes: number;
	created_at: string;
	request_id?: string;
	index: { status: ArtifactSaveIndexStatus; detail?: string };
};

export const ARTIFACT_SAVE_KINDS = Object.freeze([
	"note",
	"research",
	"report",
	"handoff",
	"analysis",
	"findings",
	"review",
	"postmortem",
	"retrospective",
	"log",
] as const);

export type ArtifactSaveKind = (typeof ARTIFACT_SAVE_KINDS)[number];
