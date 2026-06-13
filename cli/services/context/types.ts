export type ContextRef = {
	domain: string;
	path: string;
	section?: string;
};

export type ContextRetrievalMode = "compact" | "balanced" | "deep" | "tokenmax";

export type ContextExpandedSection = SectionEntry & {
	snippet: string;
};

export type ContextBundle = {
	task_id: string;
	role: string;
	surface: string;
	mode: ContextRetrievalMode;
	refs: ContextRef[];
	rules: string[];
	skills: string[];
	tools: string[];
	validation_commands: string[];
	pstr_refs: string[];
	memory_refs: string[];
	library_refs: string[];
	budget: { total_tokens: number; used_tokens: number };
	gaps: string[];
	do_not_load: string[];
	expanded_sections?: ContextExpandedSection[];
};

export type SectionEntry = {
	ref: string;
	title: string;
	level: number;
	line_start: number;
	line_end: number;
	source_path: string;
};

export type SectionIndex = {
	kind: "sections_index_v1";
	version: 1;
	generated_at: string;
	sections: SectionEntry[];
};
