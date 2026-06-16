export type LibrarySource = {
	id: string;
	url: string;
	title: string;
	accessed_at: string;
};

export type LibraryClaim = {
	id: string;
	text: string;
	source_ids: string[];
	status: "current" | "invalidated";
	invalidated_reason?: string;
	created_at: string;
};

export type LibraryTopic = {
	slug: string;
	title: string;
	sources: LibrarySource[];
	claims: LibraryClaim[];
	tags: string[];
	updated_at: string;
};
