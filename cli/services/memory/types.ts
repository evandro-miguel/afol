export type MemoryEntry = {
	id: string;
	title: string;
	body: string;
	status: "active" | "proposed" | "rejected" | "archived" | "invalidated";
	created_at: string;
	updated_at: string;
	tags: string[];
};

export type MemoryFile = {
	entries: MemoryEntry[];
	updated_at: string;
};
