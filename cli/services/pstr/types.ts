export type PstrMapStatus = "current" | "stale" | "partial" | "missing";

export type PstrAreaRegistryEntry = {
	id: string;
	scope: string;
	source_roots: string[];
	tags: string[];
};

export type PstrMapEntry = {
	id: string;
	scope: string;
	status: PstrMapStatus;
	authority: "observed";
	source_paths: string[];
	source_hash: string;
	file_count: number;
	updated_at: string;
	stale_after: string;
	tags: string[];
};

export type PstrSnapshotManifestEntry = {
	id: string;
	scope: string;
	status: PstrMapStatus;
	source_roots: string[];
	source_paths: string[];
	source_hash: string;
	file_count: number;
	updated_at: string;
	stale_after: string;
	tags: string[];
};

export type PstrSnapshotManifest = {
	area_order: string[];
	areas: Record<string, PstrSnapshotManifestEntry>;
};

export type PstrIndexSnapshot = {
	kind: "pstr_index_v1";
	version: 1;
	generated_at: string;
	source: {
		project_root: string;
		pstr_dir: string;
	};
	maps: PstrMapEntry[];
	manifest?: PstrSnapshotManifest;
};

export type PstrValidationResult = {
	ok: boolean;
	message: string;
};

export type PstrDetectedArea = {
	id: string;
	scope: string;
	source_roots: string[];
	file_count: number;
	tags: string[];
};

export type PstrSuggestion = {
	id: string;
	severity: "info" | "warn" | "fail";
	message: string;
	action: string;
};

export type PstrReviewCandidate = {
	id: string;
	title: string;
	action: "rebuild-all";
	reason: string;
};

export type PstrAffectedArea = {
	path: string;
	area_ids: string[];
	scopes: string[];
};

export type PstrDiffEntry = {
	id: string;
	scope: string;
	source_roots: string[];
	section_path: string;
	reason: string;
	snapshot: PstrMapEntry | null;
	live: PstrMapEntry | null;
};

export type PstrDiffResult = {
	snapshot_exists: boolean;
	affected_paths: PstrAffectedArea[];
	added: PstrDiffEntry[];
	removed: PstrDiffEntry[];
	changed: PstrDiffEntry[];
	unchanged: PstrDiffEntry[];
	missing: PstrDiffEntry[];
	stale: PstrDiffEntry[];
};

export type PstrRebuildOptions = {
	changedPaths?: string[];
};
