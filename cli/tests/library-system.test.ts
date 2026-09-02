import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLibraryCommand } from "../commands/library";
import { agentOperationContext } from "../core/operation-context";
import {
	addClaim,
	addSource,
	getTopic,
	invalidateClaim,
	listTopics,
	proposeTopic,
	rebuildLibraryIndex,
	searchLibrary,
} from "../services/library/crud";
import { buildLibraryGraph } from "../services/library/graph";
import type { LibraryClaim, LibrarySource } from "../services/library/types";

function createFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "lib-test-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "library"), { recursive: true });
	writeFileSync(join(root, ".agents", "config.json"), '{"version":"0.1.0"}');
	writeFileSync(join(root, ".agents", "lock.json"), '{"version":"0.1.0"}');
	writeFileSync(join(root, ".agents", "manifest.json"), '{"commands":[]}');
	return root;
}

function capture() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => stdout.push(message),
			stderr: (message: string) => stderr.push(message),
		},
	};
}

function source(overrides: Partial<LibrarySource> = {}): LibrarySource {
	return {
		id: "src-1",
		url: "http://example.com/alpha",
		title: "Alpha source",
		accessed_at: "2026-06-13T00:00:00.000Z",
		...overrides,
	};
}

function claim(overrides: Partial<LibraryClaim> = {}): LibraryClaim {
	return {
		id: "claim-1",
		text: "Alpha claim",
		source_ids: ["src-1"],
		status: "current",
		created_at: "2026-06-13T00:00:00.000Z",
		...overrides,
	};
}

describe("library crud", () => {
	test("listTopics returns empty when no topics", () => {
		const root = createFixture();
		try {
			expect(listTopics(root)).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("proposeTopic creates topic with sources", () => {
		const root = createFixture();
		try {
			const created = proposeTopic(root, "Alpha One", "Alpha One", [source()]);
			expect(created).toMatchObject({
				slug: "alpha-one",
				title: "Alpha One",
				sources: [
					{
						id: "src-1",
						url: "http://example.com/alpha",
						title: "Alpha source",
						accessed_at: "2026-06-13T00:00:00.000Z",
					},
				],
				claims: [],
				tags: [],
			});
			expect(getTopic(root, "alpha-one")).toMatchObject({
				slug: "alpha-one",
				title: "Alpha One",
				sources: [{ id: "src-1" }],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("proposeTopic rejects an existing slug without overwriting claims or sources", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			addSource(
				root,
				"alpha",
				source({
					id: "src-2",
					url: "http://example.com/beta",
					title: "Beta source",
				}),
			);
			addClaim(
				root,
				"alpha",
				claim({
					id: "claim-2",
					text: "Keep this claim",
					source_ids: ["src-1"],
				}),
			);
			const before = readFileSync(
				join(root, ".afol", "library", "topics", "alpha", "INDEX.md"),
				"utf8",
			);

			expect(() =>
				proposeTopic(root, "alpha", "Alpha replacement", [
					source({ id: "src-9" }),
				]),
			).toThrow("Library topic already exists: alpha");

			expect(
				readFileSync(
					join(root, ".afol", "library", "topics", "alpha", "INDEX.md"),
					"utf8",
				),
			).toBe(before);
			expect(getTopic(root, "alpha")).toMatchObject({
				sources: [{ id: "src-1" }, { id: "src-2" }],
				claims: [{ id: "claim-2", text: "Keep this claim" }],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("proposeTopic rejects missing accessed_at", () => {
		const root = createFixture();
		try {
			expect(() =>
				proposeTopic(root, "alpha", "Alpha", [
					{ ...source(), accessed_at: "" },
				]),
			).toThrow("Every source requires id, url, title, and accessed_at.");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("getTopic returns null for unknown slug", () => {
		const root = createFixture();
		try {
			expect(getTopic(root, "missing-topic")).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("addSource adds source to existing topic", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			addSource(
				root,
				"alpha",
				source({
					id: "src-2",
					url: "http://example.com/beta",
					title: "Beta source",
				}),
			);
			const updated = addSource(
				root,
				"alpha",
				source({
					id: "src-2",
					url: "http://example.com/beta",
					title: "Beta source v2",
				}),
			);
			expect(updated.sources).toHaveLength(2);
			expect(updated.sources[1]).toMatchObject({
				id: "src-2",
				title: "Beta source v2",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("addClaim adds claim with valid source_ids", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			const updated = addClaim(root, "alpha", claim());
			const replaced = addClaim(
				root,
				"alpha",
				claim({ text: "Alpha claim updated" }),
			);
			expect(updated.claims).toHaveLength(1);
			expect(replaced.claims).toHaveLength(1);
			expect(replaced.claims[0]).toMatchObject({
				id: "claim-1",
				text: "Alpha claim updated",
				source_ids: ["src-1"],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("addClaim rejects claim without sources", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			expect(() => addClaim(root, "alpha", claim({ source_ids: [] }))).toThrow(
				"Every claim requires at least one source.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("invalidateClaim marks claim invalidated", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			addClaim(root, "alpha", claim());
			const updated = invalidateClaim(root, "alpha", "claim-1", "wrong");
			expect(updated.claims[0]).toMatchObject({
				status: "invalidated",
				invalidated_reason: "wrong",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("invalidateClaim on unknown claim throws", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			expect(() => invalidateClaim(root, "alpha", "missing", "wrong")).toThrow(
				"Claim not found: missing",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("searchLibrary finds matching claims", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			addClaim(
				root,
				"alpha",
				claim({ text: "The alpha claim mentions coverage" }),
			);
			const matches = searchLibrary(root, "coverage");
			expect(matches).toHaveLength(1);
			expect(matches[0]).toMatchObject({
				topic: { slug: "alpha" },
				matching_claims: [{ text: "The alpha claim mentions coverage" }],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("searchLibrary excludes invalidated claims", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			addClaim(root, "alpha", claim({ text: "Coverage claim" }));
			invalidateClaim(root, "alpha", "claim-1", "wrong");
			expect(searchLibrary(root, "coverage")).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildLibraryIndex creates INDEX.json", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			addClaim(root, "alpha", claim());
			const snapshot = rebuildLibraryIndex(root);
			expect(snapshot).toMatchObject({
				kind: "library_index_v1",
				version: 1,
				topics: [
					{ slug: "alpha", title: "Alpha", source_count: 1, claim_count: 1 },
				],
			});
			const index = JSON.parse(
				readFileSync(join(root, ".afol", "library", "INDEX.json"), "utf8"),
			) as {
				kind: string;
				version: number;
				topics: Array<{ slug: string }>;
			};
			expect(index.kind).toBe("library_index_v1");
			expect(index.version).toBe(1);
			expect(index.topics).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildLibraryGraph materializes topic, claim, source, and wikilink edges", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			addClaim(root, "alpha", claim({ text: "See [[library/beta]]" }));
			const topicPath = join(
				root,
				".afol",
				"library",
				"topics",
				"alpha",
				"INDEX.md",
			);
			writeFileSync(
				topicPath,
				`${readFileSync(topicPath, "utf8")}\nRelated: [[library/beta]]\n`,
			);
			const graph = buildLibraryGraph(root);
			expect(graph.kind).toBe("library_graph_v1");
			expect(graph.nodes).toContain("library:alpha");
			expect(graph.edges).toContainEqual({
				from: "library:alpha",
				to: "source:alpha#src-1",
				type: "topic-source",
			});
			expect(graph.edges).toContainEqual({
				from: "claim:alpha#claim-1",
				to: "source:alpha#src-1",
				type: "claim-source",
			});
			expect(graph.edges).toContainEqual({
				from: "library:alpha",
				to: "wikilink:library/beta",
				type: "wikilink",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("library command", () => {
	test("afol library list returns 0", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(await runLibraryCommand("list", [], root, out.io)).toBe(0);
			expect(out.stdout.join("\n")).toContain("library topics: 0");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library list --json returns JSON", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(await runLibraryCommand("list", ["--json"], root, out.io)).toBe(0);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			const data = payload.data as { topics: unknown[] };
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.topics).toEqual(data.topics);
			expect(data.topics).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('afol library propose --topic x --title "X" --url http://... --json creates topic', async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(
				await runLibraryCommand(
					"propose",
					[
						"--topic",
						"x",
						"--title",
						"X",
						"--url",
						"http://example.com/x",
						"--json",
					],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				topic: {
					slug: string;
					title: string;
					sources: Array<{ accessed_at: string }>;
				};
				data: { topic: { slug: string; title: string } };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.topic.slug).toBe("x");
			expect(payload.topic.title).toBe("X");
			expect(payload.topic.sources).toHaveLength(1);
			expect(payload.topic.sources[0]?.accessed_at).toMatch(/T/);
			expect(payload.data.topic.slug).toBe(payload.topic.slug);
			expect(payload.data.topic.title).toBe(payload.topic.title);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library propose fails on an existing slug and preserves topic data", async () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source()]);
			addClaim(root, "alpha", claim({ id: "claim-2", text: "Keep claim" }));
			const before = readFileSync(
				join(root, ".afol", "library", "topics", "alpha", "INDEX.md"),
				"utf8",
			);
			const out = capture();

			expect(
				await runLibraryCommand(
					"propose",
					[
						"--topic",
						"alpha",
						"--title",
						"Alpha replacement",
						"--url",
						"http://example.com/replacement",
					],
					root,
					out.io,
				),
			).toBe(2);
			expect(out.stderr.join("\n")).toContain(
				"Library topic already exists: alpha",
			);
			expect(
				readFileSync(
					join(root, ".afol", "library", "topics", "alpha", "INDEX.md"),
					"utf8",
				),
			).toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library topic --topic x --json returns topic details", async () => {
		const root = createFixture();
		try {
			proposeTopic(root, "x", "X", [source({ id: "src1" })]);
			addClaim(
				root,
				"x",
				claim({ id: "claimId", text: "text", source_ids: ["src1"] }),
			);
			const out = capture();
			expect(
				await runLibraryCommand(
					"topic",
					["--topic", "x", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				ok: boolean;
				topic: { slug: string; claims: Array<{ id: string }> };
				data: { topic: { slug: string; claims: Array<{ id: string }> } };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.topic.slug).toBe("x");
			expect(payload.topic.claims).toHaveLength(1);
			expect(payload.topic.claims[0]?.id).toBe("claimId");
			expect(payload.topic).toEqual(payload.data.topic);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('afol library add-claim --topic x --claim "text" --source src1 --json adds claim', async () => {
		const root = createFixture();
		try {
			proposeTopic(root, "x", "X", [source({ id: "src1" })]);
			const out = capture();
			expect(
				await runLibraryCommand(
					"add-claim",
					["--topic", "x", "--claim", "text", "--source", "src1", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as {
				ok: boolean;
				topic: { claims: Array<{ text: string }> };
			};
			expect(payload.ok).toBe(true);
			expect(payload.topic.claims).toHaveLength(1);
			expect(payload.topic.claims[0]?.text).toBe("text");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library add-source --topic x --url http://... --json adds source", async () => {
		const root = createFixture();
		try {
			proposeTopic(root, "x", "X", [source({ id: "src1" })]);
			const out = capture();
			expect(
				await runLibraryCommand(
					"add-source",
					[
						"--topic",
						"x",
						"--url",
						"http://example.com/beta",
						"--title",
						"Beta",
						"--json",
					],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as {
				ok: boolean;
				topic: { sources: Array<{ id: string; title: string }> };
			};
			expect(payload.ok).toBe(true);
			expect(payload.topic.sources).toHaveLength(2);
			expect(payload.topic.sources[1]).toMatchObject({ title: "Beta" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library rebuild-index --json returns snapshot", async () => {
		const root = createFixture();
		try {
			proposeTopic(root, "x", "X", [source({ id: "src1" })]);
			const out = capture();
			expect(
				await runLibraryCommand("rebuild-index", ["--json"], root, out.io),
			).toBe(0);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as {
				ok: boolean;
				snapshot: { topics: Array<{ slug: string }> };
			};
			expect(payload.ok).toBe(true);
			expect(payload.snapshot.topics).toHaveLength(1);
			expect(payload.snapshot.topics[0]?.slug).toBe("x");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library graph and health expose JSON", async () => {
		const root = createFixture();
		try {
			proposeTopic(root, "x", "X", [source({ id: "src1" })]);
			addClaim(root, "x", claim({ text: "text", source_ids: ["src1"] }));
			const graphOut = capture();
			expect(
				await runLibraryCommand("graph", ["--json"], root, graphOut.io),
			).toBe(0);
			const graphPayload = JSON.parse(graphOut.stdout[0] ?? "{}") as {
				ok: boolean;
				graph: { kind: string; edges: unknown[] };
			};
			expect(graphPayload.ok).toBe(true);
			expect(graphPayload.graph.kind).toBe("library_graph_v1");
			expect(graphPayload.graph.edges.length).toBeGreaterThan(0);

			const healthOut = capture();
			expect(
				await runLibraryCommand("health", ["--json"], root, healthOut.io),
			).toBe(0);
			const healthPayload = JSON.parse(healthOut.stdout[0] ?? "{}") as {
				ok: boolean;
				findings: unknown[];
			};
			expect(healthPayload.ok).toBe(true);
			expect(Array.isArray(healthPayload.findings)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("library mutations are denied for restricted agent callers", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(
				await runLibraryCommand(
					"propose",
					["--topic", "x", "--title", "X"],
					root,
					out.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(out.stderr.join("\n")).toContain(
				"requires local interactive approval",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library search without query returns error exit code", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(await runLibraryCommand("search", [], root, out.io)).toBe(2);
			expect(out.stderr.join("\n")).toContain(
				"Missing --query for library search.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library add-claim without source returns error exit code", async () => {
		const root = createFixture();
		try {
			proposeTopic(root, "x", "X", [source({ id: "src1" })]);
			const out = capture();
			expect(
				await runLibraryCommand(
					"add-claim",
					["--topic", "x", "--claim", "text"],
					root,
					out.io,
				),
			).toBe(2);
			expect(out.stderr.join("\n")).toContain(
				"Missing --source for library add-claim.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library unknown action returns error exit code", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(await runLibraryCommand("bogus", [], root, out.io)).toBe(2);
			expect(out.stderr.join("\n")).toContain("Unknown library action: bogus");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library search --query text --json returns results", async () => {
		const root = createFixture();
		try {
			proposeTopic(root, "x", "X", [source({ id: "src1" })]);
			addClaim(root, "x", claim({ text: "text match", source_ids: ["src1"] }));
			const out = capture();
			expect(
				await runLibraryCommand(
					"search",
					["--query", "text", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				matches: Array<{ topic: { slug: string } }>;
				data: { matches: Array<{ topic: { slug: string } }> };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.matches).toHaveLength(1);
			expect(payload.matches[0]?.topic.slug).toBe("x");
			expect(payload.matches).toEqual(payload.data.matches);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library topic --json without topic returns envelope error", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(await runLibraryCommand("topic", ["--json"], root, out.io)).toBe(
				2,
			);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(2);
			expect((payload.error as { code: string }).code).toBe(
				"library.command.error",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('afol library invalidate --topic x --claim claimId --reason "wrong" --json invalidates', async () => {
		const root = createFixture();
		try {
			proposeTopic(root, "x", "X", [source({ id: "src1" })]);
			addClaim(
				root,
				"x",
				claim({ id: "claimId", text: "text", source_ids: ["src1"] }),
			);
			const out = capture();
			expect(
				await runLibraryCommand(
					"invalidate",
					["--topic", "x", "--claim", "claimId", "--reason", "wrong", "--json"],
					root,
					out.io,
				),
			).toBe(0);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as {
				ok: boolean;
				topic: {
					claims: Array<{ status: string; invalidated_reason: string }>;
				};
			};
			expect(payload.ok).toBe(true);
			expect(payload.topic.claims[0]).toMatchObject({
				status: "invalidated",
				invalidated_reason: "wrong",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library propose without topic returns error exit code", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(
				await runLibraryCommand(
					"propose",
					["--title", "X", "--url", "http://example.com/x"],
					root,
					out.io,
				),
			).toBe(2);
			expect(out.stderr.join("\n")).toContain(
				"Missing --topic for library propose.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library topic without slug returns error exit code", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(await runLibraryCommand("topic", [], root, out.io)).toBe(2);
			expect(out.stderr.join("\n")).toContain(
				"Missing --topic for library topic.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library topic not found returns 1", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(
				await runLibraryCommand("topic", ["--topic", "missing"], root, out.io),
			).toBe(1);
			expect(out.stderr.join("\n")).toContain(
				"Library topic not found: missing",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol library doctor --json returns remediation array", async () => {
		const root = createFixture();
		try {
			const out = capture();
			expect(await runLibraryCommand("doctor", ["--json"], root, out.io)).toBe(
				0,
			);
			const payload = JSON.parse(out.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { remediation: unknown[] };
				remediation: unknown[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("library.doctor");
			expect(payload.exit_code).toBe(0);
			expect(Array.isArray(payload.data.remediation)).toBe(true);
			expect(Array.isArray(payload.remediation)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("library graph filtering", () => {
	test("buildLibraryGraph with slugs filter returns only matching topics", () => {
		const root = createFixture();
		try {
			proposeTopic(root, "alpha", "Alpha", [source({ id: "src-a" })]);
			addClaim(
				root,
				"alpha",
				claim({ id: "claim-a", text: "Alpha claim", source_ids: ["src-a"] }),
			);
			proposeTopic(root, "beta", "Beta", [source({ id: "src-b" })]);
			addClaim(
				root,
				"beta",
				claim({ id: "claim-b", text: "Beta claim", source_ids: ["src-b"] }),
			);

			const allGraph = buildLibraryGraph(root);
			expect(allGraph.nodes).toContain("library:alpha");
			expect(allGraph.nodes).toContain("library:beta");

			const alphaOnly = buildLibraryGraph(root, {
				slugs: new Set(["alpha"]),
			});
			expect(alphaOnly.nodes).toContain("library:alpha");
			expect(alphaOnly.nodes).not.toContain("library:beta");
			expect(alphaOnly.nodes).toContain("source:alpha#src-a");
			expect(alphaOnly.nodes).toContain("claim:alpha#claim-a");
			expect(alphaOnly.nodes).not.toContain("source:beta#src-b");
			expect(alphaOnly.nodes).not.toContain("claim:beta#claim-b");

			const betaOnly = buildLibraryGraph(root, {
				slugs: new Set(["beta"]),
			});
			expect(betaOnly.nodes).not.toContain("library:alpha");
			expect(betaOnly.nodes).toContain("library:beta");

			const emptyFilter = buildLibraryGraph(root, {
				slugs: new Set(["nonexistent"]),
			});
			expect(emptyFilter.nodes).toEqual([]);
			expect(emptyFilter.edges).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
