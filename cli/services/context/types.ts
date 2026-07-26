export type ContextRef = {
	domain: string;
	path: string;
	section?: string;
};

export type ContextRetrievalMode = "compact" | "balanced" | "deep" | "tokenmax";

export type ContextExpandedSection = SectionEntry & {
	snippet: string;
};

export type ContextInjectedRule = {
	id: string;
	path: string;
	required: boolean;
	char_count: number;
	content: string;
};

export type ContextRuleReference = {
	id: string;
	path: string;
	required: boolean;
	char_count: number;
};

export type ContextOmittedRule = ContextRuleReference & {
	reason: string;
};

export type ContextRuleInjection = {
	identity: string;
	state_path: string;
	first_use: boolean;
	injected: ContextInjectedRule[];
	already_injected: ContextRuleReference[];
	omitted: ContextOmittedRule[];
	budget: {
		max_chars_per_rule: number;
		max_total_chars: number;
		used_chars: number;
	};
};

export type ContextHookContribution = {
	id: string;
	path: string;
	messages: string[];
	tools: string[];
	validation_commands: string[];
	pstr_refs: string[];
	memory_refs: string[];
	library_refs: string[];
	do_not_load: string[];
};

export type ContextBundle = {
	task_id: string;
	role: string;
	surface: string;
	file_path: string | null;
	mode: ContextRetrievalMode;
	refs: ContextRef[];
	rules: string[];
	hooks: string[];
	hook_messages: string[];
	hook_contributions: ContextHookContribution[];
	skills: string[];
	tools: string[];
	validation_commands: string[];
	pstr_refs: string[];
	memory_refs: string[];
	library_refs: string[];
	budget: { total_tokens: number; used_tokens: number };
	gaps: string[];
	do_not_load: string[];
	rule_injection: ContextRuleInjection;
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

export type SectionSourceManifestEntry = {
	source_path: string;
	content_sha256: string;
	section_count: number;
};

export type SectionIndexManifest = {
	algorithm: "sha256";
	source_count: number;
	section_count: number;
	sections_sha256: string;
	sources: SectionSourceManifestEntry[];
};

export type SectionIndex = {
	kind: "sections_index_v2";
	version: 2;
	generated_at: string;
	manifest: SectionIndexManifest;
	sections: SectionEntry[];
};
