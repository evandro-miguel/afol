export type PstrMapStatus = "current" | "stale" | "partial" | "missing";

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

export type PstrIndexSnapshot = {
	kind: "pstr_index_v1";
	version: 1;
	generated_at: string;
	source: {
		project_root: string;
		pstr_dir: string;
	};
	maps: PstrMapEntry[];
};

export type PstrValidationResult = {
	ok: boolean;
	message: string;
};
