export type ShapePageType = {
	name: string;
	prefix: string;
	authority:
		| "canonical"
		| "observed"
		| "execution"
		| "continuity"
		| "external-knowledge";
	inclusion:
		| "task-matched"
		| "surface-matched"
		| "session-matched"
		| "compact"
		| "cited-only";
	stale_policy?: string;
};

export type ShapePack = {
	api_version: string;
	name: string;
	version: string;
	page_types: ShapePageType[];
};
