export type ImportProvider = "codex" | "pi";

export type ImportLimits = {
	maxBytes: number;
	maxLines: number;
	maxLineBytes: number;
	maxFields: number;
	maxDepth: number;
};

export const DEFAULT_IMPORT_LIMITS: Readonly<ImportLimits> = {
	maxBytes: 32 * 1024 * 1024,
	maxLines: 100_000,
	maxLineBytes: 1024 * 1024,
	maxFields: 256,
	maxDepth: 12,
};

export type ImportSource = {
	provider: ImportProvider;
	path: string;
	projectId?: string;
	limits?: Partial<ImportLimits>;
};

export type DetectionResult = {
	provider: ImportProvider;
	format: string;
	version?: string;
	confidence: number;
	warnings: string[];
};

export type ImportPreview = {
	provider: ImportProvider;
	format: string;
	sourcePath: string;
	bytes: number;
	lines: number;
	records: number;
	sessions: number;
	contentDigest: string;
	warnings: string[];
	redaction: "before-return";
};

export type ImportCursor = {
	line: number;
	byteOffset: number;
	contentDigest: string;
};

export type NormalizedRecord = {
	provider: ImportProvider;
	format: string;
	line: number;
	recordId: string;
	sessionId?: string;
	role?: string;
	kind: "message" | "event" | "unknown";
	createdAt?: string;
	text: string;
	metadata: Record<string, unknown>;
	contentDigest: string;
	recordDigest: string;
};

export type ImportAdapter = {
	id: ImportProvider;
	supportedVersions: readonly string[];
	detect(source: ImportSource): Promise<DetectionResult>;
	preview(source: ImportSource): Promise<ImportPreview>;
	normalize(
		source: ImportSource,
		state?: JsonlNormalizationState,
	): AsyncIterable<NormalizedRecord>;
	redact(record: NormalizedRecord): NormalizedRecord;
	checkpoint(state?: {
		lines: number;
		bytes: number;
		contentDigest: string;
	}): ImportCursor;
};

export type JsonlNormalizationState = {
	lines: number;
	bytes: number;
	contentDigest: string;
};
