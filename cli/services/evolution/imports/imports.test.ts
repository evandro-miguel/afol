import { afterEach, describe, expect, test } from "bun:test";
import { link, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexAdapter, piAdapter } from "./adapters.ts";
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

	test("redacts sensitive keys and nested values before returning data", () => {
		const value = redactImported({
			Authorization: "Bearer secret-value",
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
		for (const unsupported of [
			"C:\\sessions\\codex.jsonl",
			"\\\\server\\share\\codex.jsonl",
			join(root, "session.jsonl:stream"),
		])
			await expect(
				codexAdapter.preview({ provider: "codex", path: unsupported }),
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
