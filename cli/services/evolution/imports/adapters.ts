import { digestJson, sha256, stableJson } from "./digest.ts";
import { type JsonlReaderState, readJsonl } from "./reader.ts";
import { redactImported, redactImportedPath } from "./redaction.ts";
import type {
	DetectionResult,
	ImportAdapter,
	ImportCursor,
	ImportPreview,
	ImportSource,
	NormalizedRecord,
} from "./types.ts";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonObject)
		: undefined;
}

function first(raw: JsonObject, ...keys: string[]): unknown {
	for (const key of keys) {
		if (raw[key] !== undefined) return raw[key];
	}
	return undefined;
}

function nested(raw: JsonObject, key: string): unknown {
	const message = object(raw.message);
	return message?.[key] ?? raw[key];
}

function stringValue(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function textValue(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(textValue).join("\n");
	if (value && typeof value === "object") {
		const record = value as JsonObject;
		const text = first(record, "text", "value", "content");
		if (text !== undefined && text !== value) return textValue(text);
		return stableJson(redactImported(value));
	}
	return value == null ? "" : String(value);
}

function normalizedRecord(
	provider: "codex" | "pi",
	format: string,
	line: number,
	raw: JsonObject,
): NormalizedRecord {
	const redacted = redactImported(raw) as JsonObject;
	const message = object(redacted.message);
	const rawId = stringValue(
		first(redacted, "record_id", "recordId", "id", "event_id", "eventId"),
	);
	const sessionId =
		stringValue(
			first(
				redacted,
				"session_id",
				"sessionId",
				"conversation_id",
				"conversationId",
			),
		) ??
		stringValue(
			message &&
				first(
					message,
					"session_id",
					"sessionId",
					"conversation_id",
					"conversationId",
				),
		);
	const role = stringValue(nested(redacted, "role"));
	const content =
		first(redacted, "content", "text", "body") ??
		(message && first(message, "content", "text", "body"));
	const text = textValue(content);
	const type = stringValue(first(redacted, "type", "kind", "event"));
	const kind: NormalizedRecord["kind"] =
		role || content !== undefined ? "message" : type ? "event" : "unknown";
	const createdAt = stringValue(
		first(redacted, "created_at", "createdAt", "timestamp", "time"),
	);
	const recordId =
		rawId ?? `${provider}:${line}:${digestJson(redacted).slice(0, 24)}`;
	const metadata: JsonObject = { ...redacted };
	for (const key of [
		"content",
		"text",
		"body",
		"message",
		"record_id",
		"recordId",
		"id",
		"event_id",
		"eventId",
	])
		delete metadata[key];
	const base = {
		provider,
		format,
		line,
		recordId,
		...(sessionId ? { sessionId } : {}),
		...(role ? { role } : {}),
		kind,
		...(createdAt ? { createdAt } : {}),
		text,
		metadata,
	};
	return {
		...base,
		contentDigest: sha256(text),
		recordDigest: digestJson(base),
	};
}

function redactRecord(record: NormalizedRecord): NormalizedRecord {
	const metadata: JsonObject = {};
	for (const [key, value] of Object.entries(record.metadata)) {
		if (
			(key === "project_id" || key === "projectId") &&
			typeof value === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				value,
			)
		)
			metadata[key] = value;
		else if (
			(key === "afol_session_id" || key === "afolSessionId") &&
			typeof value === "string" &&
			/^[A-Za-z0-9._-]{1,128}$/.test(value)
		)
			metadata[key] = value;
		else if (
			["commit_sha", "commitSha", "verified_commit"].includes(key) &&
			typeof value === "string" &&
			/^[a-f0-9]{7,64}$/i.test(value)
		)
			metadata[key] = value;
	}
	const role = ["assistant", "developer", "system", "tool", "user"].includes(
		record.role ?? "",
	)
		? record.role
		: undefined;
	const createdAt =
		record.createdAt &&
		Number.isFinite(new Date(record.createdAt).getTime()) &&
		new Date(record.createdAt).toISOString() === record.createdAt
			? record.createdAt
			: undefined;
	const base = {
		provider: record.provider,
		format: record.format,
		line: record.line,
		recordId: `RID-${sha256(record.recordId).slice(0, 32)}`,
		...(record.sessionId
			? { sessionId: `SID-${sha256(record.sessionId).slice(0, 32)}` }
			: {}),
		...(role ? { role } : {}),
		kind: record.kind,
		...(createdAt ? { createdAt } : {}),
		text: record.text ? "<redacted-freeform>" : "",
		metadata,
	};
	return {
		...base,
		contentDigest: sha256(base.text),
		recordDigest: digestJson(base),
	};
}

async function detect(
	source: ImportSource,
	provider: "codex" | "pi",
): Promise<DetectionResult> {
	if (source.provider !== provider)
		throw new Error(`source provider must be ${provider}`);
	const state: JsonlReaderState = { bytes: 0, lines: 0, contentDigest: "" };
	let seen = 0;
	let hasConversationMarker = false;
	let hasMessageShape = false;
	for await (const entry of readJsonl(source.path, state, source.limits)) {
		seen += 1;
		const raw = entry.value;
		if (
			first(
				raw,
				"session_id",
				"sessionId",
				"conversation_id",
				"conversationId",
				"type",
				"kind",
				"event",
				"role",
			)
		)
			hasConversationMarker = true;
		if (first(raw, "message", "role", "content", "text"))
			hasMessageShape = true;
	}
	const confidence =
		seen > 0 && hasConversationMarker && hasMessageShape ? 0.85 : 0.25;
	return {
		provider,
		format: "jsonl-v1",
		confidence,
		warnings: seen === 0 ? ["source contains no JSONL records"] : [],
	};
}

async function preview(
	source: ImportSource,
	provider: "codex" | "pi",
): Promise<ImportPreview> {
	const state: JsonlReaderState = { bytes: 0, lines: 0, contentDigest: "" };
	const sessions = new Set<string>();
	let records = 0;
	for await (const entry of readJsonl(source.path, state, source.limits)) {
		records += 1;
		const record = normalizedRecord(
			provider,
			"jsonl-v1",
			entry.line,
			entry.value,
		);
		if (record.sessionId) sessions.add(record.sessionId);
	}
	return {
		provider,
		format: "jsonl-v1",
		sourcePath: redactImportedPath(source.path),
		bytes: state.bytes,
		lines: state.lines,
		records,
		sessions: sessions.size,
		contentDigest: state.contentDigest,
		warnings: records === 0 ? ["source contains no JSONL records"] : [],
		redaction: "before-return",
	};
}

function adapter(provider: "codex" | "pi"): ImportAdapter {
	return {
		id: provider,
		supportedVersions: ["jsonl-v1"],
		detect: (source) => detect(source, provider),
		preview: (source) => preview(source, provider),
		redact: redactRecord,
		checkpoint: (
			state = { lines: 0, bytes: 0, contentDigest: "" },
		): ImportCursor => ({
			line: state.lines,
			byteOffset: state.bytes,
			contentDigest: state.contentDigest,
		}),
		normalize: async function* (source, normalizationState) {
			if (source.provider !== provider)
				throw new Error(`source provider must be ${provider}`);
			const state: JsonlReaderState = normalizationState ?? {
				bytes: 0,
				lines: 0,
				contentDigest: "",
			};
			for await (const entry of readJsonl(source.path, state, source.limits))
				yield normalizedRecord(provider, "jsonl-v1", entry.line, entry.value);
		},
	};
}

export const codexAdapter = adapter("codex");
export const piAdapter = adapter("pi");

export const evolutionImportAdapters: Readonly<
	Record<"codex" | "pi", ImportAdapter>
> = {
	codex: codexAdapter,
	pi: piAdapter,
};
