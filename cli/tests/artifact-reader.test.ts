import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runArtifactCommand } from "../commands/artifact";
import { runEvolveCommand } from "../commands/evolve";
import type { CommandIo } from "../commands/io";
import {
	agentOperationContext,
	defaultOperationContext,
} from "../core/operation-context";
import {
	enumerateOwnerDirectory,
	enumerateRecordsPage,
	MAX_RECORD_CATALOG_ENTRIES,
	readArtifactPage,
	resolveRecordDirectory,
} from "../services/artifacts/inventory";
import {
	inspectEvolutionArtifacts,
	verifyArtifactReference,
} from "../services/evolution/artifact-inspection";
import { evolutionDbPath } from "../services/evolution/db";
import { removeEvolutionTestRoot } from "./evolution-test-support";

const PROJECT_ID = "af7e7745-0068-4f28-9c1e-53cda72371d2";
const CANARY = "LEAK";
const REPO_ROOT = resolve(import.meta.dir, "../..");

function fixtureRoot(enabled = true): string {
	const root = mkdtempSync(join(tmpdir(), "artifact-reader-"));
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { id: PROJECT_ID, name: "artifact-reader", timezone: "UTC" },
			paths: {
				wb_dir: ".afol/wb",
				evolution_db: ".afol/state/evolution.db",
				evolution_data_dir: ".afol/data/evolution",
				evolution_events_dir: ".afol/data/events/evolution",
			},
			evolution: { enabled },
		}),
	);
	return root;
}

function writeValidEvolutionConfig(root: string): void {
	const config = JSON.parse(
		readFileSync(
			join(REPO_ROOT, "src/project-template/.afol/config.json"),
			"utf8",
		),
	) as { project: { id: string; name: string } };
	config.project.id = PROJECT_ID;
	config.project.name = "artifact-reader";
	writeFileSync(join(root, ".afol", "config.json"), JSON.stringify(config));
}

function captureIo(): { stdout: string[]; stderr: string[]; io: CommandIo } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message) => stdout.push(message),
			stderr: (message) => stderr.push(message),
		},
	};
}

type Envelope<T> = {
	ok: boolean;
	data?: T;
	error?: { code: string; message: string };
};

function lastEnvelope<T>(stdout: string[]): Envelope<T> {
	return JSON.parse(stdout.at(-1) ?? "{}") as Envelope<T>;
}

function expectNoCanaryOutput(value: unknown): void {
	const serialized = typeof value === "string" ? value : JSON.stringify(value);
	expect(serialized).not.toContain(CANARY);
	expect(serialized).not.toContain(CANARY.slice(1));
}

function writeRecordFile(
	root: string,
	recordId: string,
	name: string,
	text: string,
): string {
	const directory = resolveRecordDirectory(root, recordId).recordDir;
	mkdirSync(directory, { recursive: true });
	const path = join(directory, name);
	writeFileSync(path, text, "utf8");
	return path;
}

async function captureRecord(
	root: string,
	text: string,
	recordId = "R-one",
): Promise<string> {
	const out = captureIo();
	const exitCode = await runArtifactCommand(
		"save",
		["--kind", "report", "--text", text, "--record", recordId, "--json"],
		root,
		out.io,
		agentOperationContext(),
	);
	if (exitCode !== 0)
		throw new Error(lastEnvelope<never>(out.stdout).error?.message);
	const receipt = lastEnvelope<{ path: string }>(out.stdout).data;
	if (!receipt) throw new Error("artifact capture returned no receipt");
	return receipt.path.split("/").at(-1) as string;
}

describe("artifact reader contract", () => {
	test("pages reconstruct UTF-8 exactly and define minimum-size and interior-offset behavior", () => {
		const root = fixtureRoot();
		try {
			const text = "Aé🙂\r\n漢字🙂終";
			const path = writeRecordFile(root, "R-one", "reading.md", text);
			const ownerDir = resolveRecordDirectory(root, "R-one").recordDir;
			const pages: string[] = [];
			let cursor: string | undefined;
			let expectedStart = 0;
			for (let count = 0; count < 32; count += 1) {
				const result = readArtifactPage({
					root,
					ownerDir,
					relativePath: "reading.md",
					label: "record artifact",
					maxBytes: 5,
					...(cursor ? { cursor } : {}),
				});
				expect(result.page.byte_start).toBe(expectedStart);
				expect(result.page.content).not.toContain("\uFFFD");
				pages.push(result.page.content);
				expectedStart = result.page.byte_end;
				if (!result.page.has_more) break;
				cursor = result.page.cursor;
			}
			expect(pages.join("")).toBe(text);
			expect(expectedStart).toBe(readFileSync(path).byteLength);

			const minimum = readArtifactPage({
				root,
				ownerDir,
				relativePath: "reading.md",
				label: "record artifact",
				maxBytes: 1,
			});
			expect(minimum.page.content).toBe("Aé");
			expect(minimum.page.byte_end - minimum.page.byte_start).toBe(3);
			const minimumCursor = minimum.page.cursor;
			expect(minimumCursor).toBeDefined();
			const next = readArtifactPage({
				root,
				ownerDir,
				relativePath: "reading.md",
				label: "record artifact",
				maxBytes: 1,
				cursor: minimumCursor ?? "",
			});
			expect(next.page.content).toBe("🙂");
			expect(next.page.byte_end - next.page.byte_start).toBe(4);
			const asciiPath = writeRecordFile(root, "R-one", "ascii.md", "abcdefgh");
			const ascii = readArtifactPage({
				root,
				ownerDir,
				relativePath: "ascii.md",
				label: "record artifact",
				maxBytes: 1,
			});
			expect(ascii.page.byte_end - ascii.page.byte_start).toBe(4);
			expect(ascii.page.content).toBe("abcd");
			expect(readFileSync(asciiPath, "utf8")).toBe("abcdefgh");
			expect(() =>
				readArtifactPage({
					root,
					ownerDir,
					relativePath: "reading.md",
					label: "record artifact",
					byteOffset: 2,
					maxBytes: 4,
				}),
			).toThrow("UTF-8 boundary");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("redacts complete source spans across page boundaries and preserves raw anchors", () => {
		const root = fixtureRoot();
		try {
			const secret = `LONG${CANARY}-${"x".repeat(96)}`;
			const otherCanaries = [
				"JSONLEAK",
				"URILEAK",
				"COOKIELEAK",
				"AUTHLEAK",
				"BEARERLEAK",
			];
			const text = [
				"heading",
				`{\n  "api_key":\n  "JSONLEAK\\n\\"escaped\\""\n}`,
				`GET https://${["reader", "URILEAK"].join(":")}@example.invalid/path`,
				`Cookie: COOKIELEAK; theme=dark`,
				`Authorization: Bearer AUTHLEAK`,
				`Bearer BEARERLEAK`,
				`api_key=\n${secret}`,
				"visible tail",
				"",
			].join("\n");
			const path = writeRecordFile(root, "R-one", "credentials.md", text);
			const ownerDir = resolveRecordDirectory(root, "R-one").recordDir;
			const pages: Array<{ content: string; start: number; end: number }> = [];
			let cursor: string | undefined;
			for (let count = 0; count < 64; count += 1) {
				const result = readArtifactPage({
					root,
					ownerDir,
					relativePath: "credentials.md",
					label: "record artifact",
					maxBytes: 16,
					...(cursor ? { cursor } : {}),
				});
				pages.push({
					content: result.page.content,
					start: result.page.byte_start,
					end: result.page.byte_end,
				});
				if (!result.page.has_more) break;
				cursor = result.page.cursor;
			}
			const displayed = JSON.stringify(pages);
			for (const marker of [CANARY, ...otherCanaries])
				expect(displayed).not.toContain(marker);

			const valueStart = Buffer.byteLength(text.slice(0, text.indexOf(secret)));
			const direct = readArtifactPage({
				root,
				ownerDir,
				relativePath: "credentials.md",
				label: "record artifact",
				byteOffset: valueStart + 1,
				maxBytes: 16,
			});
			const raw = readFileSync(path).subarray(valueStart + 1, valueStart + 17);
			expectNoCanaryOutput(direct.page.content);
			expect(direct.rawDigest).toBe(
				createHash("sha256").update(raw).digest("hex"),
			);
			expect(direct.anchor).toBe(`bytes:${valueStart + 1}-${valueStart + 17}`);
			expectNoCanaryOutput({ page: direct.page, digest: direct.rawDigest });
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("empty and invalid UTF-8 sources have explicit safe page behavior", () => {
		const root = fixtureRoot();
		try {
			const ownerDir = resolveRecordDirectory(root, "R-one").recordDir;
			mkdirSync(ownerDir, { recursive: true });
			writeFileSync(join(ownerDir, "empty.md"), "");
			const empty = readArtifactPage({
				root,
				ownerDir,
				relativePath: "empty.md",
				label: "record artifact",
			});
			expect(empty.page).toMatchObject({
				byte_start: 0,
				byte_end: 0,
				has_more: false,
				coverage: "complete",
				content: "",
			});

			writeFileSync(
				join(ownerDir, "invalid.md"),
				Buffer.from([0x61, 0xf0, 0x9f]),
			);
			const invalid = readArtifactPage({
				root,
				ownerDir,
				relativePath: "invalid.md",
				label: "record artifact",
			});
			expect(invalid.redactionStatus).toBe("withheld_invalid_utf8");
			expect(invalid.page.coverage).toBe("partial");
			expect(invalid.page.content).not.toContain("\uFFFD");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("nonempty artifacts reject an explicit byte offset at EOF", async () => {
		const root = fixtureRoot();
		try {
			const path = writeRecordFile(root, "R-one", "eof.md", "abcdef");
			const ownerDir = resolveRecordDirectory(root, "R-one").recordDir;
			expect(() =>
				readArtifactPage({
					root,
					ownerDir,
					relativePath: "eof.md",
					label: "record artifact",
					byteOffset: 6,
				}),
			).toThrow("byte offset is at end of source");

			const output = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-one",
						"--artifact",
						"eof.md",
						"--byte-offset",
						String(readFileSync(path).byteLength),
						"--json",
					],
					root,
					output.io,
					agentOperationContext(),
				),
			).toBe(2);
			const envelope = lastEnvelope<never>(output.stdout);
			expect(envelope.error?.message).toContain(
				"byte offset is at end of source",
			);
			expect(envelope.data).toBeUndefined();
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("short directed session reads retain whole-artifact references", () => {
		const root = fixtureRoot();
		try {
			writeValidEvolutionConfig(root);
			const session = "S-compatible-reference";
			const sessionDir = join(root, ".afol", "wb", session);
			mkdirSync(sessionDir, { recursive: true });
			const source = `heading\napi_key=${CANARY}\n${"tail\n".repeat(2_000)}`;
			writeFileSync(join(sessionDir, `${session}_report_1.md`), source);

			const artifact = inspectEvolutionArtifacts({
				root,
				sessions: [session],
				artifacts: [`${session}_report_1.md`],
			}).items[0]?.artifacts[0];
			expect(artifact).toBeDefined();
			expect(artifact?.digest_scope).toBe("artifact");
			expect(artifact?.anchor).toBe("line:1");
			expect(artifact?.content_digest).toBe(
				createHash("sha256").update(source).digest("hex"),
			);
			expect(artifact?.source_identity_digest).toBeUndefined();
			expect(artifact?.page?.content).not.toContain(CANARY);
			expect(() =>
				verifyArtifactReference(root, artifact as never),
			).not.toThrow();
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("the redaction context cap is exact and larger files are explicitly withheld", async () => {
		const root = fixtureRoot();
		try {
			const ownerDir = resolveRecordDirectory(root, "R-one").recordDir;
			mkdirSync(ownerDir, { recursive: true });
			const capPath = join(ownerDir, "at-cap.md");
			writeFileSync(capPath, "a".repeat(1_048_576));
			const atCap = readArtifactPage({
				root,
				ownerDir,
				relativePath: "at-cap.md",
				label: "record artifact",
			});
			expect(atCap.redactionStatus).toBe("complete");
			expect(atCap.page.content).toBe("a".repeat(8_192));
			expect(atCap.page.coverage).toBe("partial");
			const suffix = `\napi_key=${CANARY}\n`;
			const exactCapText =
				"a".repeat(1_048_576 - Buffer.byteLength(suffix)) + suffix;
			writeFileSync(capPath, exactCapText);
			const valueStart =
				Buffer.byteLength(exactCapText) -
				Buffer.byteLength(suffix) +
				Buffer.byteLength("\napi_key=");
			const atCapSecret = readArtifactPage({
				root,
				ownerDir,
				relativePath: "at-cap.md",
				label: "record artifact",
				byteOffset: valueStart,
				maxBytes: 16,
			});
			expect(atCapSecret.redactionStatus).toBe("complete");
			expect(atCapSecret.page.content).not.toContain(CANARY);

			const largePath = join(ownerDir, "over-reference-cap.md");
			writeFileSync(largePath, `VISIBLE\n${"x".repeat(300 * 1024)}`);
			const largePage = readArtifactPage({
				root,
				ownerDir,
				relativePath: "over-reference-cap.md",
				label: "record artifact",
				maxBytes: 8_192,
			});
			expect(largePage.redactionStatus).toBe("complete");
			expect(largePage.page.content.startsWith("VISIBLE\n")).toBe(true);
			expect(largePage.page.has_more).toBe(true);
			const largeCursor = largePage.page.cursor;
			expect(largeCursor).toBeDefined();
			const largeNext = readArtifactPage({
				root,
				ownerDir,
				relativePath: "over-reference-cap.md",
				label: "record artifact",
				maxBytes: 8_192,
				cursor: largeCursor ?? "",
			});
			expect(largeNext.page.byte_start).toBe(8_192);
			expect(largeNext.page.content).toContain("x");

			const overPath = join(ownerDir, "over-cap.md");
			writeFileSync(overPath, `secret=${CANARY}${"b".repeat(1_048_577)}`);
			const overCap = readArtifactPage({
				root,
				ownerDir,
				relativePath: "over-cap.md",
				label: "record artifact",
			});
			expect(overCap.redactionStatus).toBe("withheld_context_limit");
			expect(overCap.page.coverage).toBe("partial");
			expect(overCap.page.content).toContain("withheld");
			expect(overCap.page.content).not.toContain(CANARY);
			const overRead = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-one", "--artifact", "over-cap.md", "--json"],
					root,
					overRead.io,
					agentOperationContext(),
				),
			).toBe(0);
			const overReadData = lastEnvelope<{
				coverage: { status: string; complete: boolean };
				artifacts: Array<{
					page: { content: string; coverage: string; redaction_status: string };
				}>;
			}>(overRead.stdout).data;
			expect(overReadData?.coverage).toMatchObject({
				status: "partial",
				complete: false,
			});
			expect(overReadData?.artifacts[0]?.page.redaction_status).toBe(
				"withheld_context_limit",
			);
			expect(overReadData?.artifacts[0]?.page.coverage).toBe("partial");
			expect(overRead.stdout.join("\n")).not.toContain(CANARY);

			const searchDir = resolveRecordDirectory(root, "R-search").recordDir;
			mkdirSync(searchDir, { recursive: true });
			writeFileSync(
				join(searchDir, "over-cap.md"),
				`needle=${CANARY} ${"z".repeat(1_048_577)}`,
			);
			const search = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-search", "--search", "needle", "--json"],
					root,
					search.io,
					agentOperationContext(),
				),
			).toBe(0);
			const searchData = lastEnvelope<{
				search: {
					matches: unknown[];
					coverage: string;
					scanned_bytes: number;
					partial_reason?: string;
				};
			}>(search.stdout).data;
			expect(searchData?.search).toMatchObject({
				matches: [],
				coverage: "partial",
				scanned_bytes: 0,
				partial_reason: "redaction_context",
			});
			expect(search.stdout.join("\n")).not.toContain(CANARY);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("record catalog pages discover IDs without a known owner", async () => {
		const root = fixtureRoot();
		try {
			const expected = Array.from(
				{ length: 12 },
				(_, index) => `R-${String(index + 1).padStart(2, "0")}`,
			);
			for (const id of expected) {
				const dir = resolveRecordDirectory(root, id).recordDir;
				mkdirSync(dir, { recursive: true });
			}
			const discovered: string[] = [];
			let cursor: string | undefined;
			for (let pageIndex = 0; pageIndex < 12; pageIndex += 1) {
				const out = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						[
							"--records",
							"--limit",
							"2",
							...(cursor ? ["--records-cursor", cursor] : []),
							"--json",
						],
						root,
						out.io,
						agentOperationContext(),
					),
				).toBe(0);
				const data = lastEnvelope<{
					records: string[];
					records_page: { has_more: boolean; returned: number };
					records_cursor?: string;
				}>(out.stdout).data;
				expect(data?.records_page.returned).toBeGreaterThan(0);
				discovered.push(...(data?.records ?? []));
				cursor = data?.records_cursor;
				if (!data?.records_page.has_more) break;
			}
			expect(discovered).toEqual(expected);
			expect(new Set(discovered).size).toBe(expected.length);

			const changedRoot = fixtureRoot();
			try {
				for (const id of ["R-a", "R-b", "R-c"]) {
					const dir = resolveRecordDirectory(changedRoot, id).recordDir;
					mkdirSync(dir, { recursive: true });
				}
				const page = captureIo();
				await runEvolveCommand(
					"artifacts",
					["--records", "--limit", "2", "--json"],
					changedRoot,
					page.io,
					agentOperationContext(),
				);
				const pageCursor = lastEnvelope<{
					records_cursor?: string;
				}>(page.stdout).data?.records_cursor;
				mkdirSync(resolveRecordDirectory(changedRoot, "R-new").recordDir, {
					recursive: true,
				});
				const changed = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						[
							"--records",
							"--limit",
							"2",
							"--records-cursor",
							pageCursor ?? "",
							"--json",
						],
						changedRoot,
						changed.io,
						agentOperationContext(),
					),
				).toBe(2);
				expect(lastEnvelope<never>(changed.stdout).error?.code).toBe(
					"ARTIFACT_CATALOG_CHANGED",
				);
			} finally {
				removeEvolutionTestRoot(changedRoot);
			}
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("catalog reports unsupported owners and stops at its streamed entry budget", async () => {
		const root = fixtureRoot();
		try {
			const recordsDir = join(root, ".afol", "records");
			mkdirSync(recordsDir, { recursive: true });
			const valid = resolveRecordDirectory(root, "R-valid").recordDir;
			mkdirSync(valid, { recursive: true });
			mkdirSync(join(root, ".afol", "wb", "R-duplicate"), {
				recursive: true,
			});
			mkdirSync(join(recordsDir, "R-duplicate"), {
				recursive: true,
			});
			writeFileSync(
				join(recordsDir, `invalid-${CANARY}`),
				"metadata must not echo",
			);
			symlinkSync(valid, join(recordsDir, "R-symlink"));
			const page = enumerateRecordsPage({ root, limit: 10 });
			expect(page.records).toEqual(["R-valid"]);
			expect(page.coverage).toBe("partial");
			expect(page.unsupported_count).toBe(3);

			const catalog = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--records", "--json"],
					root,
					catalog.io,
					agentOperationContext(),
				),
			).toBe(0);
			expectNoCanaryOutput(catalog);
		} finally {
			removeEvolutionTestRoot(root);
		}

		const overflowRoot = fixtureRoot();
		try {
			const recordsDir = join(overflowRoot, ".afol", "records");
			for (let index = 0; index <= MAX_RECORD_CATALOG_ENTRIES; index += 1) {
				mkdirSync(join(recordsDir, `R-${String(index).padStart(4, "0")}`), {
					recursive: true,
				});
			}
			const bounded = enumerateRecordsPage({ root: overflowRoot, limit: 100 });
			expect(bounded.records_page.total).toBe(MAX_RECORD_CATALOG_ENTRIES);
			expect(bounded.scanned_entries).toBe(MAX_RECORD_CATALOG_ENTRIES + 1);
			expect(bounded.coverage).toBe("partial");
			expect(bounded.records_page.has_more).toBe(true);
		} finally {
			removeEvolutionTestRoot(overflowRoot);
		}
	});

	test("record file listing continues through 101 entries with an owner-bound stable cursor", async () => {
		const root = fixtureRoot();
		try {
			const recordDir = resolveRecordDirectory(root, "R-list").recordDir;
			mkdirSync(recordDir, { recursive: true });
			const expected = Array.from(
				{ length: 101 },
				(_, index) => `file-${String(index).padStart(3, "0")}.md`,
			);
			for (const name of expected) writeFileSync(join(recordDir, name), name);

			const first = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-list", "--limit", "10", "--json"],
					root,
					first.io,
					agentOperationContext(),
				),
			).toBe(0);
			const firstData = lastEnvelope<{
				files: Array<{ path: string }>;
				files_page: {
					offset: number;
					returned: number;
					total: number;
					has_more: boolean;
				};
				files_cursor?: string;
			}>(first.stdout).data;
			expect(firstData?.files).toHaveLength(10);
			expect(firstData?.files_page).toMatchObject({
				offset: 0,
				returned: 10,
				total: 101,
				has_more: true,
			});
			expect(firstData?.files_cursor).toBeTruthy();

			const otherOwner = resolveRecordDirectory(root, "R-other-list").recordDir;
			mkdirSync(otherOwner, { recursive: true });
			const wrongOwner = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-other-list",
						"--file-cursor",
						firstData?.files_cursor ?? "",
						"--json",
					],
					root,
					wrongOwner.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(wrongOwner.stdout).error?.code).toBe(
				"ARTIFACT_FILE_CURSOR_INVALID",
			);

			const discovered = [...(firstData?.files.map((file) => file.path) ?? [])];
			let cursor = firstData?.files_cursor;
			while (cursor) {
				const page = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						[
							"--record",
							"R-list",
							"--limit",
							"10",
							"--file-cursor",
							cursor,
							"--json",
						],
						root,
						page.io,
						agentOperationContext(),
					),
				).toBe(0);
				const data = lastEnvelope<{
					files: Array<{ path: string }>;
					files_cursor?: string;
					files_page: { has_more: boolean };
				}>(page.stdout).data;
				discovered.push(...(data?.files.map((file) => file.path) ?? []));
				cursor = data?.files_cursor;
				expect(data?.files_page.has_more).toBe(Boolean(cursor));
			}
			expect(discovered).toEqual(expected);

			const changed = captureIo();
			writeFileSync(join(recordDir, "file-050.md"), "changed source");
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-list",
						"--file-cursor",
						firstData?.files_cursor ?? "",
						"--json",
					],
					root,
					changed.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(changed.stdout).error?.code).toBe(
				"ARTIFACT_CATALOG_CHANGED",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("record search cursor reaches later files and retains skipped-source coverage", async () => {
		const root = fixtureRoot();
		try {
			const recordDir = resolveRecordDirectory(
				root,
				"R-search-pages",
			).recordDir;
			mkdirSync(recordDir, { recursive: true });
			writeFileSync(join(recordDir, "00-large.md"), "x".repeat(256 * 1024));
			writeFileSync(join(recordDir, "01-tail.md"), "tail-needle");
			writeFileSync(join(recordDir, "02-too-large.md"), "z".repeat(300 * 1024));

			const first = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-search-pages", "--search", "tail-needle", "--json"],
					root,
					first.io,
					agentOperationContext(),
				),
			).toBe(0);
			const firstSearch = lastEnvelope<{
				search: {
					matches: Array<{ path: string }>;
					read_bytes: number;
					scanned_bytes: number;
					work_bytes: number;
					coverage: string;
					cursor?: string;
				};
			}>(first.stdout).data?.search;
			expect(firstSearch?.matches).toEqual([]);
			expect(firstSearch?.read_bytes).toBe(256 * 1024);
			expect(firstSearch?.scanned_bytes).toBe(256 * 1024);
			expect(firstSearch?.work_bytes).toBe(512 * 1024);
			expect(firstSearch?.cursor).toBeTruthy();

			const wrongOwner = resolveRecordDirectory(
				root,
				"R-search-other",
			).recordDir;
			mkdirSync(wrongOwner, { recursive: true });
			const rejectedOwner = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-search-other",
						"--search",
						"tail-needle",
						"--search-cursor",
						firstSearch?.cursor ?? "",
						"--json",
					],
					root,
					rejectedOwner.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(rejectedOwner.stdout).error?.code).toBe(
				"ARTIFACT_SEARCH_CURSOR_INVALID",
			);

			const wrongQuery = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-search-pages",
						"--search",
						"different-query",
						"--search-cursor",
						firstSearch?.cursor ?? "",
						"--json",
					],
					root,
					wrongQuery.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(wrongQuery.stdout).error?.code).toBe(
				"ARTIFACT_SEARCH_CURSOR_INVALID",
			);

			const filePage = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-search-pages", "--limit", "1", "--json"],
					root,
					filePage.io,
					agentOperationContext(),
				),
			).toBe(0);
			const fileCursor = lastEnvelope<{
				files_cursor?: string;
			}>(filePage.stdout).data?.files_cursor;
			const wrongSearchScope = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-search-pages",
						"--search",
						"tail-needle",
						"--search-cursor",
						fileCursor ?? "",
						"--json",
					],
					root,
					wrongSearchScope.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(wrongSearchScope.stdout).error?.code).toBe(
				"ARTIFACT_SEARCH_CURSOR_INVALID",
			);
			const wrongFileScope = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-search-pages",
						"--file-cursor",
						firstSearch?.cursor ?? "",
						"--json",
					],
					root,
					wrongFileScope.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(wrongFileScope.stdout).error?.code).toBe(
				"ARTIFACT_FILE_CURSOR_INVALID",
			);

			const continuation = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-search-pages",
						"--search",
						"tail-needle",
						"--search-cursor",
						firstSearch?.cursor ?? "",
						"--json",
					],
					root,
					continuation.io,
					agentOperationContext(),
				),
			).toBe(0);
			const continuedSearch = lastEnvelope<{
				search: {
					matches: Array<{ path: string }>;
					coverage: string;
					partial_reason?: string;
					read_bytes: number;
					scanned_bytes: number;
					work_bytes: number;
					total_work_bytes: number;
					cursor?: string;
				};
			}>(continuation.stdout).data?.search;
			expect(continuedSearch?.matches.map((match) => match.path)).toContain(
				"01-tail.md",
			);
			expect(continuedSearch?.coverage).toBe("partial");
			expect(continuedSearch?.partial_reason).toBe("work_budget");
			expect(continuedSearch?.cursor).toBeUndefined();
			expect(continuedSearch?.total_work_bytes).toBeGreaterThan(
				continuedSearch?.work_bytes ?? 0,
			);

			const changed = captureIo();
			writeFileSync(join(recordDir, "03-new.md"), "new source");
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-search-pages",
						"--search",
						"tail-needle",
						"--search-cursor",
						firstSearch?.cursor ?? "",
						"--json",
					],
					root,
					changed.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(changed.stdout).error?.code).toBe(
				"ARTIFACT_CATALOG_CHANGED",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("direct record reads and verification bypass oversized sibling inventories safely", async () => {
		const root = fixtureRoot();
		try {
			const recordDir = resolveRecordDirectory(root, "R-many-files").recordDir;
			mkdirSync(recordDir, { recursive: true });
			writeFileSync(join(recordDir, "known.md"), "safe target");
			for (let index = 0; index < 4_096; index += 1)
				writeFileSync(join(recordDir, `sibling-${index}.bin`), "ignored");

			const output = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-many-files", "--artifact", "known.md", "--json"],
					root,
					output.io,
					agentOperationContext(),
				),
			).toBe(0);
			const data = lastEnvelope<{
				coverage: {
					status: string;
					complete: boolean;
					inventory_scanned: boolean;
				};
				artifacts: Array<{ page: { coverage: string } }>;
			}>(output.stdout).data;
			expect(data?.coverage).toMatchObject({
				status: "partial",
				complete: false,
				inventory_scanned: false,
			});
			expect(data?.artifacts[0]?.page.coverage).toBe("complete");
			const reference = lastEnvelope<{
				artifacts: Array<Record<string, unknown>>;
			}>(output.stdout).data?.artifacts[0];
			expect(() =>
				verifyArtifactReference(root, reference as never),
			).not.toThrow();
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("nested record inventory overflow refuses catalogs but permits exact reads", async () => {
		const root = fixtureRoot();
		try {
			const recordDir = resolveRecordDirectory(
				root,
				"R-nested-overflow",
			).recordDir;
			const attachments = join(recordDir, "artifacts");
			mkdirSync(attachments, { recursive: true });
			writeFileSync(join(attachments, "known.md"), "safe nested target");
			for (let index = 0; index < 4_095; index += 1)
				writeFileSync(join(attachments, `file-${index}.md`), "supported text");
			expect(() => enumerateOwnerDirectory({ dir: recordDir })).toThrow(
				"artifact owner exceeds the bounded inventory",
			);

			for (const args of [[], ["--search", "safe nested target"]]) {
				const output = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						["--record", "R-nested-overflow", ...args, "--json"],
						root,
						output.io,
						agentOperationContext(),
					),
				).toBe(2);
				expect(lastEnvelope<never>(output.stdout).error?.code).toBe(
					"EVOLVE_ARTIFACTS_FAILED",
				);
				expect(lastEnvelope<never>(output.stdout).data).toBeUndefined();
			}

			const directed = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-nested-overflow",
						"--artifact",
						"artifacts/known.md",
						"--json",
					],
					root,
					directed.io,
					agentOperationContext(),
				),
			).toBe(0);
			const reference = lastEnvelope<{
				artifacts: Array<Record<string, unknown>>;
			}>(directed.stdout).data?.artifacts[0];
			expect(reference).toBeDefined();
			expect(() =>
				verifyArtifactReference(root, reference as never),
			).not.toThrow();
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("root basename selectors refuse collisions with nested artifact paths", async () => {
		const root = fixtureRoot();
		try {
			const recordDir = resolveRecordDirectory(
				root,
				"R-ambiguous-name",
			).recordDir;
			mkdirSync(recordDir, { recursive: true });
			writeFileSync(join(recordDir, "same.md"), "root source");
			const original = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-ambiguous-name", "--artifact", "same.md", "--json"],
					root,
					original.io,
					agentOperationContext(),
				),
			).toBe(0);
			const reference = lastEnvelope<{
				artifacts: Array<Record<string, unknown>>;
			}>(original.stdout).data?.artifacts[0];
			expect(reference).toBeDefined();

			mkdirSync(join(recordDir, "artifacts", "nested"), { recursive: true });
			writeFileSync(
				join(recordDir, "artifacts", "nested", "same.md"),
				"nested source",
			);

			const ambiguous = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-ambiguous-name", "--artifact", "same.md", "--json"],
					root,
					ambiguous.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(ambiguous.stdout).data).toBeUndefined();
			expect(() =>
				verifyArtifactReference(root, reference as never),
			).not.toThrow();

			const canonical = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-ambiguous-name",
						"--artifact",
						"artifacts/nested/same.md",
						"--json",
					],
					root,
					canonical.io,
					agentOperationContext(),
				),
			).toBe(0);
			expect(
				lastEnvelope<{ artifacts: Array<{ relative_path: string }> }>(
					canonical.stdout,
				).data?.artifacts[0]?.relative_path,
			).toBe("artifacts/nested/same.md");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("record capture, listing, bounded search, and directed read work without Evolution projections", async () => {
		for (const state of ["absent", "corrupt", "disabled"] as const) {
			const root = fixtureRoot(state !== "disabled");
			try {
				const marker = "MATCH-BEYOND-EXCERPT-450";
				const body =
					"x".repeat(520) +
					"\n" +
					marker +
					"\n" +
					"tail ".repeat(100) +
					"\napi_key=" +
					CANARY;
				const fileName = await captureRecord(root, body);
				const dbPath = evolutionDbPath(root);
				if (state === "corrupt") {
					mkdirSync(join(root, ".afol", "state"), { recursive: true });
					writeFileSync(dbPath, "not a SQLite database");
				}
				const corruptBefore =
					state === "corrupt" ? readFileSync(dbPath) : undefined;

				const listed = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						["--record", "R-one", "--json"],
						root,
						listed.io,
						agentOperationContext(),
					),
				).toBe(0);
				const listedData = lastEnvelope<{
					files: Array<{ path: string; bytes: number }>;
					coverage: { complete: boolean; unsupported_count: number };
				}>(listed.stdout).data;
				expect(listedData?.files.some((file) => file.path === fileName)).toBe(
					true,
				);
				expect(listedData?.coverage.unsupported_count).toBe(0);

				const searched = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						["--record", "R-one", "--search", marker, "--json"],
						root,
						searched.io,
						agentOperationContext(),
					),
				).toBe(0);
				expectNoCanaryOutput(searched);
				const searchData = lastEnvelope<{
					search: {
						matches: Array<{
							path: string;
							byte_offset: number;
							excerpt: string;
						}>;
						scanned_bytes: number;
						coverage: string;
					};
				}>(searched.stdout).data;
				const match = searchData?.search.matches[0];
				expect(match?.path).toBe(fileName);
				expect(match?.byte_offset).toBeGreaterThan(450);
				expect(match?.excerpt).toContain(marker);
				expect(searchData?.search.scanned_bytes).toBeGreaterThan(450);
				expect(searchData?.search.coverage).toBe("complete");

				const secretSearch = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						["--record", "R-one", "--search", CANARY, "--json"],
						root,
						secretSearch.io,
						agentOperationContext(),
					),
				).toBe(0);
				expect(
					lastEnvelope<{ search: { matches: unknown[] } }>(secretSearch.stdout)
						.data?.search.matches,
				).toHaveLength(0);
				expectNoCanaryOutput(secretSearch);

				const read = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						["--record", "R-one", "--artifact", fileName, "--json"],
						root,
						read.io,
						agentOperationContext(),
					),
				).toBe(0);
				const readData = lastEnvelope<{
					artifacts: Array<{
						page: {
							content: string;
							cursor?: string;
							byte_start: number;
							redaction_status: string;
						};
						anchor: string;
						content_digest: string;
					}>;
				}>(read.stdout).data;
				expect(readData?.artifacts[0]?.page.content).toContain(marker);
				expect(readData?.artifacts[0]?.page.content).not.toContain(CANARY);
				expect(readData?.artifacts[0]?.page.redaction_status).toBe("complete");
				expect(readData?.artifacts[0]?.anchor).toMatch(/^bytes:/);
				expect(readData?.artifacts[0]?.content_digest).toMatch(
					/^[a-f0-9]{64}$/,
				);
				expectNoCanaryOutput(read);
				expect(() =>
					verifyArtifactReference(root, readData?.artifacts[0] as never),
				).not.toThrow();

				const valueStart =
					Buffer.byteLength(body.slice(0, body.indexOf(CANARY))) + 1;
				const middle = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						[
							"--record",
							"R-one",
							"--artifact",
							fileName,
							"--byte-offset",
							String(valueStart),
							"--json",
						],
						root,
						middle.io,
						agentOperationContext(),
					),
				).toBe(0);
				const middleText = middle.stdout.join("\n") + middle.stderr.join("\n");
				expectNoCanaryOutput(middleText);

				if (state === "absent") expect(existsSync(dbPath)).toBe(false);
				if (state === "corrupt") {
					if (!corruptBefore)
						throw new Error("corrupt fixture was not captured");
					expect(readFileSync(dbPath)).toEqual(corruptBefore);
				}
				expect(existsSync(join(root, ".afol", "state"))).toBe(
					state === "corrupt",
				);
			} finally {
				removeEvolutionTestRoot(root);
			}
		}
	});

	test("record routes fail closed on malformed artifact configuration without creating projections", async () => {
		const root = fixtureRoot();
		try {
			writeFileSync(join(root, ".afol", "config.json"), "{ malformed");
			for (const args of [
				["--records", "--json"],
				["--record", "R-one", "--json"],
			]) {
				const result = captureIo();
				expect(
					await runEvolveCommand(
						"artifacts",
						args,
						root,
						result.io,
						defaultOperationContext(),
					),
				).toBe(2);
				const envelope = lastEnvelope<never>(result.stdout);
				expect(envelope.error?.message).toContain(
					"artifact configuration is invalid JSON",
				);
				expect(envelope.data).toBeUndefined();
				expect(result.stderr.join("\n")).not.toContain("malformed");
			}
			expect(existsSync(join(root, ".afol", "records"))).toBe(false);
			expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("session excerpts redact multiline secret values before selecting excerpt lines", async () => {
		const root = fixtureRoot();
		try {
			writeValidEvolutionConfig(root);
			const sessionDir = join(root, ".afol", "wb", "S-excerpt");
			mkdirSync(sessionDir, { recursive: true });
			const path = join(sessionDir, "S-excerpt_report_1.md");
			const lines = [
				'{"api_key": "before',
				CANARY,
				...Array.from({ length: 11 }, (_, index) => `secret-line-${index}`),
				'after"}',
			];
			writeFileSync(path, lines.join("\n"));

			const output = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--session", "S-excerpt", "--json"],
					root,
					output.io,
					agentOperationContext(),
				),
			).toBe(0);
			const artifact = lastEnvelope<{
				items: Array<{
					artifacts: Array<{ anchor: string; excerpt: string }>;
				}>;
			}>(output.stdout).data?.items[0]?.artifacts[0];
			expect(artifact?.anchor).toBe("line:1");
			expect(artifact?.excerpt).not.toContain(CANARY);
			expectNoCanaryOutput(output);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("page continuation binds the record and path and refuses source mutation without page data", async () => {
		const root = fixtureRoot();
		try {
			const fileName = await captureRecord(
				root,
				`api_key=${CANARY}\n${"x".repeat(9_000)}`,
			);
			const filePath = join(
				resolveRecordDirectory(root, "R-one").recordDir,
				fileName,
			);
			const first = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-one", "--artifact", fileName, "--json"],
					root,
					first.io,
					agentOperationContext(),
				),
			).toBe(0);
			const firstArtifact = lastEnvelope<{
				artifacts: Array<{ page: { cursor?: string; byte_end: number } }>;
			}>(first.stdout).data?.artifacts[0];
			const pageCursor = firstArtifact?.page.cursor;
			expect(pageCursor).toBeTruthy();
			expectNoCanaryOutput(first);
			expectNoCanaryOutput(
				Buffer.from(pageCursor ?? "", "base64url").toString("utf8"),
			);

			const otherDir = resolveRecordDirectory(root, "R-two").recordDir;
			mkdirSync(otherDir, { recursive: true });
			writeFileSync(join(otherDir, fileName), readFileSync(filePath));
			const wrongOwner = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-two",
						"--artifact",
						fileName,
						"--page-cursor",
						pageCursor ?? "",
						"--json",
					],
					root,
					wrongOwner.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(wrongOwner.stdout).error?.code).toBe(
				"ARTIFACT_PAGE_CURSOR_INVALID",
			);
			expect(lastEnvelope<never>(wrongOwner.stdout).data).toBeUndefined();
			expectNoCanaryOutput(wrongOwner);
			expect(wrongOwner.stdout.join("\n")).not.toContain("xxxx");
			expect(
				Buffer.from(pageCursor ?? "", "base64url").toString("utf8"),
			).not.toContain("xxxx");

			const otherPath = "other.md";
			writeFileSync(
				join(resolveRecordDirectory(root, "R-one").recordDir, otherPath),
				readFileSync(filePath),
			);
			const wrongPath = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-one",
						"--artifact",
						otherPath,
						"--page-cursor",
						pageCursor ?? "",
						"--json",
					],
					root,
					wrongPath.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(wrongPath.stdout).error?.code).toBe(
				"ARTIFACT_PAGE_CURSOR_INVALID",
			);
			expect(lastEnvelope<never>(wrongPath.stdout).data).toBeUndefined();
			expectNoCanaryOutput(wrongPath);

			const crossRoute = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-one",
						"--artifact",
						fileName,
						"--page-cursor",
						pageCursor ?? "",
						"--cursor",
						"history-token",
						"--json",
					],
					root,
					crossRoute.io,
					defaultOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(crossRoute.stdout).error?.message).toContain(
				"history selection",
			);
			expect(lastEnvelope<never>(crossRoute.stdout).data).toBeUndefined();

			const malformed = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-one",
						"--artifact",
						fileName,
						"--page-cursor",
						"not-a-valid-cursor",
						"--json",
					],
					root,
					malformed.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(malformed.stdout).error?.code).toBe(
				"ARTIFACT_PAGE_CURSOR_INVALID",
			);
			expect(lastEnvelope<never>(malformed.stdout).data).toBeUndefined();

			writeFileSync(filePath, `${readFileSync(filePath, "utf8")}changed`);
			const changed = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--record",
						"R-one",
						"--artifact",
						fileName,
						"--page-cursor",
						pageCursor ?? "",
						"--json",
					],
					root,
					changed.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(changed.stdout).error?.code).toBe(
				"ARTIFACT_SOURCE_CHANGED",
			);
			expect(lastEnvelope<never>(changed.stdout).data).toBeUndefined();
			expect(changed.stdout.join("\n")).not.toContain("xxxxxxxx");
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("session pages use a cursor route separate from history pagination", async () => {
		const root = fixtureRoot();
		try {
			writeValidEvolutionConfig(root);
			const sessionDir = join(root, ".afol", "wb", "S-page");
			mkdirSync(sessionDir, { recursive: true });
			const path = join(sessionDir, "S-page_report_1.md");
			writeFileSync(path, `head\n${"x".repeat(9_000)}\nTAIL-MARKER\n`);
			const first = captureIo();
			const firstCode = await runEvolveCommand(
				"artifacts",
				["--session", "S-page", "--artifact", "S-page_report_1.md", "--json"],
				root,
				first.io,
				agentOperationContext(),
			);
			expect(firstCode).toBe(0);
			const firstData = lastEnvelope<{
				source_catalog: {
					sessions_considered: number;
					owners_scanned: number;
					owner_entries_scanned: number;
					work_units: number;
					work_budget_units: number;
				};
				items: Array<{
					artifacts: Array<{
						page: { cursor?: string; byte_end: number; content: string };
					}>;
				}>;
			}>(first.stdout).data;
			expect(firstData?.source_catalog).toMatchObject({
				sessions_considered: 1,
				owners_scanned: 1,
				owner_entries_scanned: 1,
				work_units: 2,
				work_budget_units: 4_096,
			});
			const firstArtifact = firstData?.items[0]?.artifacts[0];
			expect(firstArtifact?.page.byte_end).toBe(8_192);
			expect(firstArtifact?.page.cursor).toBeTruthy();

			const second = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--session",
						"S-page",
						"--artifact",
						"S-page_report_1.md",
						"--page-cursor",
						firstArtifact?.page.cursor ?? "",
						"--json",
					],
					root,
					second.io,
					agentOperationContext(),
				),
			).toBe(0);
			const secondArtifact = lastEnvelope<{
				items: Array<{
					artifacts: Array<{
						page: { byte_start: number; content: string };
					}>;
				}>;
			}>(second.stdout).data?.items[0]?.artifacts[0];
			expect(secondArtifact?.page.byte_start).toBe(8_192);
			expect(secondArtifact?.page.content).toContain("TAIL-MARKER");

			writeFileSync(path, "mutated source");
			const changed = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					[
						"--session",
						"S-page",
						"--artifact",
						"S-page_report_1.md",
						"--page-cursor",
						firstArtifact?.page.cursor ?? "",
						"--json",
					],
					root,
					changed.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(changed.stdout).error?.code).toBe(
				"ARTIFACT_SOURCE_CHANGED",
			);
			expect(lastEnvelope<never>(changed.stdout).data).toBeUndefined();
			expect(existsSync(evolutionDbPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("session artifact catalog refuses work beyond its global work-unit budget", async () => {
		const root = fixtureRoot();
		try {
			writeValidEvolutionConfig(root);
			const counts = new Map<string, number>();
			for (let index = 0; index < 4_097; index += 1) {
				const sessionId = index < 3_000 ? "S-catalog-a" : "S-catalog-b";
				const sequence = counts.get(sessionId) ?? 0;
				counts.set(sessionId, sequence + 1);
				const sessionDir = join(root, ".afol", "wb", sessionId);
				mkdirSync(sessionDir, { recursive: true });
				writeFileSync(
					join(
						sessionDir,
						`${sessionId}_report_${String(sequence + 1).padStart(4, "0")}.md`,
					),
					"entry",
				);
			}

			const output = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--session", "S-catalog-a", "--session", "S-catalog-b", "--json"],
					root,
					output.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(output.stdout).error?.code).toBe(
				"ARTIFACT_SESSION_CATALOG_BUDGET",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("empty session owners also consume the bounded source-catalog budget", async () => {
		const root = fixtureRoot();
		try {
			writeValidEvolutionConfig(root);
			for (let index = 0; index < 4_096; index += 1)
				mkdirSync(
					join(
						root,
						".afol",
						"wb",
						`S-empty-${String(index).padStart(4, "0")}`,
					),
					{ recursive: true },
				);

			const output = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--json"],
					root,
					output.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(output.stdout).error?.code).toBe(
				"ARTIFACT_SESSION_CATALOG_BUDGET",
			);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("record selection refuses owner collisions and symlinked paths", async () => {
		const root = fixtureRoot();
		try {
			const collision = resolveRecordDirectory(root, "R-conflict").recordDir;
			mkdirSync(collision, { recursive: true });
			mkdirSync(join(root, ".afol", "wb", "R-conflict"), { recursive: true });
			const collisionOut = captureIo();
			expect(() => resolveRecordDirectory(root, "R-conflict")).toThrow(
				"duplicate artifact owner id",
			);
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-conflict", "--json"],
					root,
					collisionOut.io,
					defaultOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(collisionOut.stdout).error?.message).toContain(
				"duplicate artifact owner id",
			);

			const targetDir = resolveRecordDirectory(root, "R-target").recordDir;
			mkdirSync(targetDir, { recursive: true });
			const linkPath = join(root, ".afol", "records", "R-link");
			symlinkSync(targetDir, linkPath);
			const symlinkOut = captureIo();
			expect(() => resolveRecordDirectory(root, "R-link")).toThrow(
				"Path crosses symlink",
			);
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-link", "--json"],
					root,
					symlinkOut.io,
					defaultOperationContext(),
				),
			).toBe(2);
			expect(lastEnvelope<never>(symlinkOut.stdout).error?.message).toContain(
				"Path crosses symlink",
			);
			const supportedOut = captureIo();
			expect(
				await runEvolveCommand(
					"artifacts",
					["--record", "R-target", "--json"],
					root,
					supportedOut.io,
					agentOperationContext(),
				),
			).toBe(0);
			expect(
				lastEnvelope<{ owner: { kind: string; id: string } }>(
					supportedOut.stdout,
				).data?.owner,
			).toEqual({ kind: "record", id: "R-target" });
			expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test("separate-process CLI capture, discovery, read, and reference verification stay projection-free", () => {
		const root = fixtureRoot();
		try {
			mkdirSync(join(root, ".agents"), { recursive: true });
			for (const name of ["lock.json", "manifest.json"]) {
				writeFileSync(
					join(root, ".agents", name),
					readFileSync(join(REPO_ROOT, "src/project-template/.agents", name)),
				);
			}
			const runCli = (args: string[]) =>
				spawnSync(
					process.execPath,
					["run", join(REPO_ROOT, "cli/main.ts"), ...args],
					{
						cwd: root,
						encoding: "utf8",
						env: {
							...process.env,
							AGENT: "1",
							AFOL_SESSION: "",
							TMPDIR: process.env.TMPDIR ?? tmpdir(),
						},
					},
				);
			const saved = runCli([
				"artifact",
				"save",
				"--kind",
				"report",
				"--text",
				`Subprocess capture with api_key=${CANARY}`,
				"--record",
				"R-process",
				"--json",
			]);
			expect(saved.status).toBe(0);
			expectNoCanaryOutput({ stdout: saved.stdout, stderr: saved.stderr });
			const receipt = JSON.parse(saved.stdout).data as { path: string };
			const fileName = receipt.path.split("/").at(-1) as string;

			const discovered = runCli(["evolve", "artifacts", "--records", "--json"]);
			expect(discovered.status).toBe(0);
			expectNoCanaryOutput({
				stdout: discovered.stdout,
				stderr: discovered.stderr,
			});
			expect(
				(JSON.parse(discovered.stdout).data as { records: string[] }).records,
			).toContain("R-process");

			const listed = runCli([
				"evolve",
				"artifacts",
				"--record",
				"R-process",
				"--json",
			]);
			expect(listed.status).toBe(0);
			expectNoCanaryOutput({ stdout: listed.stdout, stderr: listed.stderr });
			expect(
				(
					JSON.parse(listed.stdout).data as { files: Array<{ path: string }> }
				).files.map((file) => file.path),
			).toContain(fileName);

			const read = runCli([
				"evolve",
				"artifacts",
				"--record",
				"R-process",
				"--artifact",
				fileName,
				"--json",
			]);
			expect(read.status).toBe(0);
			const reference = (
				JSON.parse(read.stdout).data as {
					artifacts: Array<Record<string, unknown>>;
				}
			).artifacts[0];
			expect(reference).toBeDefined();
			expect(read.stdout).not.toContain(CANARY);
			expect(read.stderr).not.toContain(CANARY);
			expect(() =>
				verifyArtifactReference(root, reference as never),
			).not.toThrow();

			writeRecordFile(root, "R-process", "empty.md", "");
			const emptyRead = runCli([
				"evolve",
				"artifacts",
				"--record",
				"R-process",
				"--artifact",
				"empty.md",
				"--json",
			]);
			expect(emptyRead.status).toBe(0);
			const emptyReference = (
				JSON.parse(emptyRead.stdout).data as {
					artifacts: Array<Record<string, unknown>>;
				}
			).artifacts[0];
			expect(emptyReference).toMatchObject({
				anchor: "line:1",
				digest_scope: "artifact",
				content_digest: createHash("sha256").update("").digest("hex"),
			});
			expect(() =>
				verifyArtifactReference(root, emptyReference as never),
			).not.toThrow();
			expect(existsSync(evolutionDbPath(root))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});
});
