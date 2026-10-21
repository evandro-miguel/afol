import { afterEach, describe, expect, test } from "bun:test";
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { symlinkTestSupport } from "../../../tests/symlink-test-support";
import { codexAdapter, piAdapter } from "./adapters.ts";
import { digestJson, stableJson } from "./digest.ts";
import { type JsonlReaderState, readJsonl } from "./reader.ts";
import { redactImported } from "./redaction.ts";

const roots: string[] = [];
async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "afol-import-"));
	roots.push(root);
	return root;
}

afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

describe("external import core", () => {
	test("normalizes Codex and Pi JSONL without executing transcript content", async () => {
		const root = await tempRoot();
		const path = join(root, "session.jsonl");
		await writeFile(
			path,
			[
				JSON.stringify({
					id: "m-1",
					session_id: "s-1",
					role: "user",
					content: "Use token=redaction_canary",
				}),
				JSON.stringify({
					type: "tool_result",
					sessionId: "s-1",
					value: "echo rm -rf /",
				}),
			].join("\n"),
		);
		const records = [];
		for await (const record of codexAdapter.normalize({
			provider: "codex",
			path,
		}))
			records.push(record);
		expect(records).toHaveLength(2);
		expect(records[0]?.text).toContain("<redacted>");
		expect(JSON.stringify(records)).not.toContain("redaction_canary");
		expect(records[1]?.kind).toBe("event");
		const pi = await piAdapter.preview({ provider: "pi", path });
		expect(pi.records).toBe(2);
		expect(pi.contentDigest).toMatch(/^[a-f0-9]{64}$/);
	});

	test("normalizes modern Codex envelopes and bounded context events", async () => {
		const root = await tempRoot();
		const path = join(root, "modern-codex.jsonl");
		const sessionId = "synthetic-codex-session";
		const widePayload = (prefix: string, count: number) =>
			Object.fromEntries(
				Array.from({ length: count }, (_, index) => [
					`${prefix}_${index}`,
					"synthetic context",
				]),
			);
		const sourceRecords = [
			{
				timestamp: "2026-10-20T12:00:00.000Z",
				type: "session_meta",
				payload: {
					id: sessionId,
					cwd: "/synthetic/private/project",
					model_provider: "synthetic",
				},
			},
			{
				timestamp: "2026-10-20T12:00:01.000Z",
				type: "turn_context",
				payload: widePayload("turn_context_field", 1748),
			},
			{
				timestamp: "2026-10-20T12:00:02.000Z",
				type: "event_msg",
				payload: { type: "task_started", ...widePayload("event_field", 884) },
			},
			{
				timestamp: "2026-10-20T12:00:03.000Z",
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "synthetic question" }],
				},
			},
			{
				timestamp: "2026-10-20T12:00:04.000Z",
				type: "response_item",
				payload: {
					type: "function_call",
					name: "synthetic_tool",
					arguments: '{"query":"synthetic request"}',
					call_id: "synthetic-call-1",
				},
			},
			{
				timestamp: "2026-10-20T12:00:05.000Z",
				type: "response_item",
				payload: {
					type: "function_call_output",
					output: "synthetic tool result",
					call_id: "synthetic-call-1",
				},
			},
		];
		await writeFile(
			path,
			`${sourceRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
		);

		const detection = await codexAdapter.detect({ provider: "codex", path });
		const preview = await codexAdapter.preview({ provider: "codex", path });
		const records = [];
		for await (const record of codexAdapter.normalize({
			provider: "codex",
			path,
		}))
			records.push(record);

		expect(detection.confidence).toBeGreaterThanOrEqual(0.5);
		expect(preview).toMatchObject({
			records: 6,
			sessions: 1,
			redaction: "before-return",
		});
		expect(records.map((record) => record.kind)).toEqual([
			"event",
			"event",
			"event",
			"message",
			"message",
			"message",
		]);
		expect(records.map((record) => record.sessionId)).toEqual(
			Array(6).fill(sessionId),
		);
		expect(records[3]).toMatchObject({
			role: "user",
			text: "synthetic question",
		});
		expect(records[4]).toMatchObject({ role: "assistant" });
		expect(records[4]?.text).toContain("synthetic_tool");
		expect(records[5]).toMatchObject({
			role: "tool",
			text: "synthetic tool result",
		});
		const serialized = JSON.stringify(records);
		expect(serialized).not.toContain("/synthetic/private/project");
		expect(serialized).not.toContain("turn_context_field_0");
		expect(serialized).not.toContain("event_field_0");
	});

	test("correlates Codex tool results out of order without exposing call ids", async () => {
		const root = await tempRoot();
		const path = join(root, "tool-correlation.jsonl");
		const rows = ["session-a", "session-b"].flatMap((id) => [
			{ type: "session_meta", payload: { id } },
			...["raw-call-a", "raw-call-b"].map((call_id) => ({
				type: "response_item",
				payload: {
					type: "function_call",
					name: "same_tool",
					arguments: "{}",
					call_id,
				},
			})),
			...["raw-call-b", "raw-call-a"].map((call_id) => ({
				type: "response_item",
				payload: {
					type: "function_call_output",
					output: "same result",
					call_id,
				},
			})),
		]);
		await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n"));
		const records = [];
		for await (const record of codexAdapter.normalize({
			provider: "codex",
			path,
		}))
			records.push(record);
		const redacted = records.map((record) => codexAdapter.redact(record));
		for (const view of [records, redacted]) {
			const ids = view.map((record) => record.metadata.tool_call_id);
			expect(ids[1]).toMatch(/^TCID-[a-f0-9]{64}$/);
			expect(ids[2]).toMatch(/^TCID-[a-f0-9]{64}$/);
			expect(ids[1]).not.toBe(ids[2]);
			expect(ids[3]).toBe(ids[2]);
			expect(ids[4]).toBe(ids[1]);
			expect(ids[6]).not.toBe(ids[1]);
			expect(ids[8]).toBe(ids[7]);
			expect(ids[9]).toBe(ids[6]);
			expect(JSON.stringify(view).includes("raw-call-")).toBe(false);
		}
		expect(redacted[1]?.metadata.tool_call_id).toBe(
			records[1]?.metadata.tool_call_id,
		);
	});

	test("omits invalid and unrelated Codex tool correlation identifiers", async () => {
		const root = await tempRoot();
		const path = join(root, "invalid-tool-correlation.jsonl");
		const rows = [undefined, null, "", 42, {}, "x".repeat(257)].map(
			(call_id) => ({
				type: "response_item",
				tool_call_id: `TCID-${"a".repeat(64)}`,
				payload: {
					type: "function_call",
					name: "tool",
					arguments: "{}",
					call_id,
				},
			}),
		);
		await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n"));
		for await (const record of codexAdapter.normalize({
			provider: "codex",
			path,
		})) {
			expect(record.metadata).not.toHaveProperty("tool_call_id");
			expect(codexAdapter.redact(record).metadata).not.toHaveProperty(
				"tool_call_id",
			);
		}
	});

	test("drops opaque Codex payloads regardless of their JSON shape", async () => {
		const root = await tempRoot();
		const path = join(root, "opaque-payload-shapes.jsonl");
		const shapes = [
			Array.from({ length: 300 }, () => ({ marker: "opaque-shape-canary" })),
			"opaque-shape-canary",
			null,
		];
		const rows = ["event_msg", "turn_context"].flatMap((type) =>
			shapes.map((payload) => ({ type, payload })),
		);
		await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n"));
		const records = [];
		for await (const record of codexAdapter.normalize({
			provider: "codex",
			path,
		}))
			records.push(record);
		expect(records).toHaveLength(6);
		expect(records.every((record) => record.kind === "event")).toBe(true);
		expect(JSON.stringify(records).includes("opaque-shape-canary")).toBe(false);
		for (const record of records)
			expect(record.metadata).not.toHaveProperty("payload");
	});

	test("keeps response-item payloads under the existing field limit", async () => {
		const root = await tempRoot();
		const path = join(root, "oversized-response-item.jsonl");
		const payload = Object.fromEntries(
			Array.from({ length: 300 }, (_, index) => [`field_${index}`, "value"]),
		);
		await writeFile(
			path,
			`${JSON.stringify({
				type: "response_item",
				payload: {
					type: "message",
					role: "user",
					content: "bounded",
					...payload,
				},
			})}\n`,
		);

		await expect(
			codexAdapter.preview({ provider: "codex", path }),
		).rejects.toThrow(/field count/);
	});

	test("keeps opaque Codex context payloads under the existing depth limit", async () => {
		const root = await tempRoot();
		const path = join(root, "deep-context.jsonl");
		await writeFile(
			path,
			`${JSON.stringify({
				type: "turn_context",
				payload: { context: { nested: { value: "bounded" } } },
			})}\n`,
		);

		await expect(
			codexAdapter.preview({
				provider: "codex",
				path,
				limits: { maxDepth: 1 },
			}),
		).rejects.toThrow(/depth/);
	});

	test("preview and record digests are deterministic", async () => {
		const root = await tempRoot();
		const path = join(root, "stable.jsonl");
		await writeFile(
			path,
			`${JSON.stringify({ b: 2, a: 1, content: "same" })}\n`,
		);
		const one = await codexAdapter.preview({ provider: "codex", path });
		const two = await codexAdapter.preview({ provider: "codex", path });
		expect(one.contentDigest).toBe(two.contentDigest);
		const firstRecords = [];
		const secondRecords = [];
		for await (const record of codexAdapter.normalize({
			provider: "codex",
			path,
		}))
			firstRecords.push(record);
		for await (const record of codexAdapter.normalize({
			provider: "codex",
			path,
		}))
			secondRecords.push(record);
		expect(firstRecords[0]?.recordDigest).toBe(secondRecords[0]?.recordDigest);
	});

	test("stable digest preserves canonical bytes and undefined behavior", () => {
		const value = { z: undefined, a: { b: 2, a: 1 }, list: [undefined, null] };
		const serialized = stableJson(value);

		expect(serialized).toBe('{"a":{"a":1,"b":2},"list":[,null],"z":undefined}');
		expect(Buffer.from(serialized, "utf8").toString("hex")).toBe(
			"7b2261223a7b2261223a312c2262223a327d2c226c697374223a5b2c6e756c6c5d2c227a223a756e646566696e65647d",
		);
		expect(digestJson(value)).toBe(
			"5c36598833f3272dca0b1d21e32732f660b84ce967f8be874d6bf8f4be3d931a",
		);
		expect(stableJson(undefined)).toBeUndefined();
	});

	test.skipIf(process.platform !== "win32")(
		"accepts local paths whose drive and directories differ only by case",
		async () => {
			const root = await tempRoot();
			const directory = join(root, "CaseDirectory");
			const path = join(directory, "Session.jsonl");
			await mkdir(directory);
			await writeFile(path, `${JSON.stringify({ ok: true })}\n`);

			const alternateCasing = `${path.slice(0, 2).toLowerCase()}${path.slice(2).toLowerCase()}`;
			const state: JsonlReaderState = {
				bytes: 0,
				lines: 0,
				contentDigest: "",
			};
			const records = [];
			for await (const record of readJsonl(alternateCasing, state))
				records.push(record);

			expect(records).toEqual([{ line: 1, value: { ok: true } }]);
		},
	);

	test("detection requires structural transcript markers, not repeated content", async () => {
		const root = await tempRoot();
		const path = join(root, "generic.jsonl");
		await writeFile(
			path,
			`${JSON.stringify({ content: "first" })}\n${JSON.stringify({ content: "second" })}\n`,
		);
		const detection = await codexAdapter.detect({ provider: "codex", path });
		expect(detection.confidence).toBeLessThan(0.5);
	});

	test("redacts sensitive keys and nested values before returning data", () => {
		const value = redactImported({
			Authorization: ["Bearer", "secret-value"].join(" "),
			nested: { api_key: "redaction_canary" },
			ok: "keep",
		});
		expect(JSON.stringify(value)).not.toContain("secret-value");
		expect(JSON.stringify(value)).not.toContain("redaction_canary");
		expect((value as Record<string, unknown>).ok).toBe("keep");
	});

	test("persistable adapter records remove arbitrary freeform credential text", async () => {
		const root = await tempRoot();
		const path = join(root, "credential.jsonl");
		const canary = `github_pat_${"A".repeat(40)}`;
		await writeFile(
			path,
			`${JSON.stringify({ session_id: canary, role: "user", content: canary, value: canary })}\n`,
		);
		const records = [];
		for await (const record of codexAdapter.normalize({
			provider: "codex",
			path,
		}))
			records.push(codexAdapter.redact(record));
		const serialized = JSON.stringify(records);
		expect(serialized).not.toContain(canary);
		expect(records[0]?.text).toBe("<redacted-freeform>");
		expect(records[0]?.sessionId).toMatch(/^SID-[a-f0-9]{32}$/);
		expect(records[0]?.metadata).toEqual({});
	});

	test("fails closed for symlinks, hard links, malformed JSON, and oversized records", async () => {
		const root = await tempRoot();
		const real = join(root, "real.jsonl");
		const symlinkPath = join(root, "link.jsonl");
		await writeFile(real, `${JSON.stringify({ ok: true })}\n`);
		if (symlinkTestSupport.available) {
			await symlink(real, symlinkPath);
			await expect(
				codexAdapter.preview({ provider: "codex", path: symlinkPath }),
			).rejects.toThrow(/symbolic links|regular/);
			const linkedParent = join(root, "linked-parent");
			await symlink(root, linkedParent);
			await expect(
				codexAdapter.preview({
					provider: "codex",
					path: join(linkedParent, "real.jsonl"),
				}),
			).rejects.toThrow(/symbolic links/);
		}
		const unsupported = [
			"\\\\server\\share\\codex.jsonl",
			join(root, "session.jsonl:stream"),
		];
		if (process.platform !== "win32")
			unsupported.push("C:\\sessions\\codex.jsonl");
		for (const path of unsupported)
			await expect(
				codexAdapter.preview({ provider: "codex", path }),
			).rejects.toThrow(/supported local path/);
		const hardlink = join(root, "hard.jsonl");
		await link(real, hardlink);
		await expect(
			codexAdapter.preview({ provider: "codex", path: real }),
		).rejects.toThrow(/single-link/);
		const bad = join(root, "bad.jsonl");
		await writeFile(bad, "not-json\n");
		await expect(
			codexAdapter.preview({ provider: "codex", path: bad }),
		).rejects.toThrow(/invalid JSONL/);
		const small = join(root, "small.jsonl");
		await writeFile(small, `${JSON.stringify({ ok: true })}\n`);
		await expect(
			codexAdapter.preview({
				provider: "codex",
				path: small,
				limits: { maxBytes: 1 },
			}),
		).rejects.toThrow(/byte size/);
	});

	test("enforces field and depth limits while streaming", async () => {
		const root = await tempRoot();
		const path = join(root, "shape.jsonl");
		await writeFile(
			path,
			`${JSON.stringify({ one: { two: { three: true } } })}\n`,
		);
		await expect(
			codexAdapter.preview({
				provider: "codex",
				path,
				limits: { maxDepth: 1 },
			}),
		).rejects.toThrow(/depth/);
		await expect(
			codexAdapter.preview({
				provider: "codex",
				path,
				limits: { maxFields: 0 },
			}),
		).rejects.toThrow(/field count/);
		const state: JsonlReaderState = { bytes: 0, lines: 0, contentDigest: "" };
		const records = [];
		for await (const record of readJsonl(path, state, { maxDepth: 5 }))
			records.push(record);
		expect(records).toHaveLength(1);
	});
});
