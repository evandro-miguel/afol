import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runContextCommand } from "../commands/context";
import { buildContextBundle } from "../services/context/bundler";
import {
	getSectionIndex,
	rebuildSectionIndex,
	resolveSection,
} from "../services/context/section-index";
import {
	addClaim,
	invalidateClaim,
	proposeTopic,
} from "../services/library/crud";
import { writeMemory } from "../services/memory/crud";
import { rebuildPstrIndex, validatePstrIndex } from "../services/pstr";
import { hydrateSession, validateState } from "../services/state";

type IoCapture = {
	stdout: string[];
	stderr: string[];
	io: {
		stdout: (message: string) => void;
		stderr: (message: string) => void;
	};
};

function captureIo(): IoCapture {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => {
				stdout.push(message);
			},
			stderr: (message: string) => {
				stderr.push(message);
			},
		},
	};
}

function createBaseFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ctx-test-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "SPECS"), { recursive: true });
	mkdirSync(join(root, "docs", "arc", "DECISIONS"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		'{"version":"0.1.0"}',
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		'{"version":"0.1.0"}',
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		'{"commands":[]}',
		"utf8",
	);
	return root;
}

function createSectionFixture(): string {
	const root = createBaseFixture();
	writeFileSync(
		join(root, "docs", "arc", "SPECS", "alpha-spec.md"),
		[
			"---",
			"doc_type: spec",
			"roadmap_feature: alpha",
			"status: active",
			"---",
			"",
			"# Alpha Spec",
			"",
			"## Overview",
			"",
			"Text.",
			"",
			"### Details",
			"",
			"More text.",
			"",
			"## Notes",
			"",
			"End.",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(root, "docs", "arc", "DECISIONS", "adr-1.md"),
		[
			"---",
			"doc_type: adr",
			"id: ADR-1",
			"status: accepted",
			"---",
			"",
			"# ADR-1",
			"",
			"## Decision",
			"",
			"Body.",
		].join("\n"),
		"utf8",
	);
	return root;
}

function createBundleFixture(options?: {
	inflate?: boolean;
	pstr?: "valid" | "missing" | "stale";
	memoryRefs?: boolean;
	libraryRefs?: boolean;
}): string {
	const root = createSectionFixture();
	mkdirSync(join(root, ".agents", "rules"), { recursive: true });
	mkdirSync(join(root, ".afol", "skills", "alpha-helper"), { recursive: true });
	mkdirSync(join(root, ".afol", "library"), { recursive: true });
	mkdirSync(join(root, ".afol", "memory"), { recursive: true });
	mkdirSync(join(root, ".afol", "pstr"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb", "session-1"), { recursive: true });

	writeFileSync(
		join(root, ".agents", "rules", "index.json"),
		JSON.stringify({
			rules: [
				{
					id: "RULE-ALPHA",
					name: "alpha rule",
					path: "alpha.md",
					surfaces: ["alpha"],
					work_types: ["delivery"],
					priority: 90,
				},
			],
		}),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "rules", "alpha.md"),
		"# Alpha rule\n",
		"utf8",
	);

	writeFileSync(
		join(root, ".afol", "skills", "alpha-helper", "SKILL.md"),
		[
			"---",
			"name: alpha helper",
			"description: alpha designer helper",
			"---",
			"",
			"# Alpha helper",
		].join("\n"),
		"utf8",
	);

	writeFileSync(
		join(root, ".afol", "library", "alpha-guide.md"),
		"# Guide\n",
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "memory", "memory.md"),
		"# Memory\n",
		"utf8",
	);
	if (options?.memoryRefs) {
		writeMemory(root, {
			updated_at: "2026-06-13T00:00:00.000Z",
			entries: [
				{
					id: "MEM-ACTIVE",
					title: "Alpha memory",
					body: "T-01 alpha designer active memory",
					status: "active",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: ["alpha"],
				},
				{
					id: "MEM-ARCHIVED",
					title: "Alpha memory archived",
					body: "T-01 alpha designer archived memory",
					status: "archived",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: ["alpha"],
				},
				{
					id: "MEM-REJECTED",
					title: "Alpha memory rejected",
					body: "T-01 alpha designer rejected memory",
					status: "rejected",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: ["alpha"],
				},
				{
					id: "MEM-INVALIDATED",
					title: "Alpha memory invalidated",
					body: "T-01 alpha designer invalidated memory",
					status: "invalidated",
					created_at: "2026-06-13T00:00:00.000Z",
					updated_at: "2026-06-13T00:00:00.000Z",
					tags: ["alpha"],
				},
			],
		});
	}
	if (options?.libraryRefs) {
		proposeTopic(root, "alpha", "Alpha library", [
			{
				id: "SRC-1",
				url: "https://example.com/alpha",
				title: "Alpha source",
				accessed_at: "2026-06-13T00:00:00.000Z",
			},
		]);
		addClaim(root, "alpha", {
			id: "CLAIM-CURRENT",
			text: "T-01 alpha designer current claim",
			source_ids: ["SRC-1"],
			status: "current",
			created_at: "2026-06-13T00:00:00.000Z",
		});
		addClaim(root, "alpha", {
			id: "CLAIM-INVALID",
			text: "T-01 alpha designer invalidated claim",
			source_ids: ["SRC-1"],
			status: "current",
			created_at: "2026-06-13T00:00:00.000Z",
		});
		invalidateClaim(root, "alpha", "CLAIM-INVALID", "wrong");
	}
	if (options?.pstr !== "missing") {
		writeFileSync(
			join(root, ".afol", "pstr", "index.json"),
			JSON.stringify({
				kind: "pstr_index_v1",
				version: 1,
				generated_at: "2026-06-13T00:00:00.000Z",
				source: {
					project_root: root,
					pstr_dir: join(root, ".afol", "pstr"),
				},
				maps: [
					{
						id: "alpha-map",
						scope: "alpha",
						status: "current",
						authority: "observed",
						source_paths: ["docs/arc/SPECS/alpha-spec.md"],
						source_hash: "hash-alpha",
						file_count: 1,
						updated_at: "2026-06-13T00:00:00.000Z",
						stale_after: "2026-06-14T00:00:00.000Z",
						tags: ["alpha"],
					},
				],
			}),
			"utf8",
		);
	}

	writeFileSync(
		join(root, ".afol", "wb", "session-1", "plan.md"),
		"# Plan\n",
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "wb", "session-1", "alpha_task_1.md"),
		[
			"---",
			"feature_id: alpha",
			"---",
			"",
			"# Task",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | pending | worker | alpha task |",
		].join("\n"),
		"utf8",
	);

	if (options?.inflate) {
		writeFileSync(
			join(root, "docs", "arc", "SPECS", "alpha-spec.md"),
			[
				"---",
				"doc_type: spec",
				"roadmap_feature: alpha",
				"status: active",
				"---",
				"",
				"# Alpha Spec",
				"",
				`## ${"Overview ".repeat(240)}`,
				"",
				"Text.",
				"",
				`### ${"Details ".repeat(240)}`,
				"",
				"More text.",
				"",
				`## ${"Notes ".repeat(240)}`,
				"",
				"End.",
			].join("\n"),
			"utf8",
		);
		writeFileSync(
			join(root, ".afol", "pstr", "index.json"),
			JSON.stringify({
				kind: "pstr_index_v1",
				version: 1,
				generated_at: "2026-06-13T00:00:00.000Z",
				source: {
					project_root: root,
					pstr_dir: join(root, ".afol", "pstr"),
				},
				maps: Array.from({ length: 5 }, (_, index) => ({
					id: `${"alpha".repeat(20)}-${index}`,
					scope: "alpha",
					status: "current",
					authority: "observed",
					source_paths: ["docs/arc/SPECS/alpha-spec.md"],
					source_hash: `hash-${index}`,
					file_count: 1,
					updated_at: "2026-06-13T00:00:00.000Z",
					stale_after: "2026-06-14T00:00:00.000Z",
					tags: ["alpha"],
				})),
			}),
			"utf8",
		);
	}

	if (options?.pstr === "stale") {
		writeFileSync(
			join(root, "docs", "arc", "SPECS", "alpha-spec.md"),
			[
				"---",
				"doc_type: spec",
				"roadmap_feature: alpha",
				"status: active",
				"---",
				"",
				"# Alpha Spec",
				"",
				"## Overview",
				"",
				"Text updated.",
				"",
				"### Details",
				"",
				"More text.",
				"",
				"## Notes",
				"",
				"End.",
			].join("\n"),
			"utf8",
		);
	}

	return root;
}

describe("context system", () => {
	test("rebuildSectionIndex creates valid index from spec and adr files", () => {
		const root = createSectionFixture();
		try {
			const snapshot = rebuildSectionIndex(root);
			expect(snapshot.kind).toBe("sections_index_v1");
			expect(snapshot.version).toBe(1);
			expect(snapshot.sections.length).toBe(4);
			expect(snapshot.sections[0]?.title).toBe("Decision");
			expect(
				snapshot.sections.some((entry) => entry.ref === "spec:alpha#overview"),
			).toBe(true);
			expect(
				snapshot.sections.some((entry) => entry.ref === "spec:alpha#details"),
			).toBe(true);
			expect(
				snapshot.sections.some((entry) => entry.ref === "spec:alpha#notes"),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rebuildSectionIndex handles empty dirs gracefully", () => {
		const root = createBaseFixture();
		try {
			const snapshot = rebuildSectionIndex(root);
			expect(snapshot.sections).toEqual([]);
			expect(getSectionIndex(root)?.sections).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("getSectionIndex returns null when no index exists", () => {
		const root = createBaseFixture();
		try {
			expect(getSectionIndex(root)).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("getSectionIndex returns parsed index when exists", () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			const index = getSectionIndex(root);
			expect(index?.sections.length).toBe(4);
			expect(index?.sections[0]?.title).toBe("Decision");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolveSection finds section by ref", () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			const section = resolveSection(root, "spec:alpha#overview");
			expect(section?.title).toBe("Overview");
			expect(section?.level).toBe(2);
			expect(section?.line_start).toBe(9);
			expect(section?.line_end).toBe(16);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolveSection returns null for unknown ref", () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			expect(resolveSection(root, "spec:alpha#missing")).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("section parsing extracts title level and line numbers", () => {
		const root = createSectionFixture();
		try {
			const snapshot = rebuildSectionIndex(root);
			const details = snapshot.sections.find(
				(entry) => entry.ref === "spec:alpha#details",
			);
			expect(details).toEqual({
				ref: "spec:alpha#details",
				title: "Details",
				level: 3,
				line_start: 13,
				line_end: 16,
				source_path: "docs/arc/SPECS/alpha-spec.md",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("multiple headings in same file produce multiple entries", () => {
		const root = createSectionFixture();
		try {
			const snapshot = rebuildSectionIndex(root);
			const specEntries = snapshot.sections.filter(
				(entry) => entry.source_path === "docs/arc/SPECS/alpha-spec.md",
			);
			expect(specEntries.map((entry) => entry.ref)).toEqual([
				"spec:alpha#overview",
				"spec:alpha#details",
				"spec:alpha#notes",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildContextBundle returns bundle with correct shape", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.task_id).toBe("T-01");
			expect(bundle.role).toBe("designer");
			expect(bundle.surface).toBe("alpha");
			expect(bundle.mode).toBe("balanced");
			expect(Array.isArray(bundle.refs)).toBe(true);
			expect(Array.isArray(bundle.rules)).toBe(true);
			expect(Array.isArray(bundle.skills)).toBe(true);
			expect(Array.isArray(bundle.tools)).toBe(true);
			expect(Array.isArray(bundle.validation_commands)).toBe(true);
			expect(Array.isArray(bundle.do_not_load)).toBe(true);
			expect(bundle.budget.total_tokens).toBe(2000);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildContextBundle includes pstr refs rules skills and validation commands", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.pstr_refs).toEqual(["pstr:alpha-map"]);
			expect(bundle.rules).toContain("RULE-ALPHA");
			expect(bundle.skills).toContain("alpha helper");
			expect(bundle.validation_commands).toContain(
				"afol state validate -S session-1",
			);
			expect(bundle.validation_commands).toContain("bun test");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildContextBundle respects token budget", () => {
		const root = createBundleFixture({ inflate: true });
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.budget.used_tokens).toBeLessThanOrEqual(
				bundle.budget.total_tokens,
			);
			expect(bundle.refs.length).toBeGreaterThan(0);
			expect(bundle.rules.length).toBeGreaterThan(0);
			expect(bundle.skills.length).toBeGreaterThan(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("compact mode uses 1000 token budget and no expanded sections", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				mode: "compact",
			});
			expect(bundle.mode).toBe("compact");
			expect(bundle.budget.total_tokens).toBe(1000);
			expect(bundle.expanded_sections).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("deep mode includes expanded sections", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				mode: "deep",
			});
			expect(bundle.mode).toBe("deep");
			expect(bundle.budget.total_tokens).toBe(4000);
			expect(bundle.expanded_sections?.length).toBeGreaterThan(0);
			expect(bundle.expanded_sections?.[0]?.snippet).toContain("## Overview");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("tokenmax mode uses 8000 token budget", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
				mode: "tokenmax",
			});
			expect(bundle.mode).toBe("tokenmax");
			expect(bundle.budget.total_tokens).toBe(8000);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildContextBundle populates gaps when session and task are missing", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				surface: "alpha",
				role: "designer",
			});
			expect(bundle.gaps).toContain("missing session");
			expect(bundle.gaps).toContain("missing task record");
			expect(bundle.gaps).toContain("no hydrated session state");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildContextBundle populates do_not_load list", () => {
		const root = createBundleFixture();
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.do_not_load).toEqual([
				"full docs/arc/** trees",
				"whole .afol/wb session dumps",
				"raw .afol/state/afol.db",
				"entire .afol/library/** trees",
				"entire .afol/memory/** trees",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildContextBundle includes active memory refs and excludes inactive statuses", () => {
		const root = createBundleFixture({ memoryRefs: true });
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.memory_refs).toEqual(["memory:MEM-ACTIVE"]);
			expect(bundle.memory_refs.join(" ")).not.toContain("MEM-ARCHIVED");
			expect(bundle.memory_refs.join(" ")).not.toContain("MEM-REJECTED");
			expect(bundle.memory_refs.join(" ")).not.toContain("MEM-INVALIDATED");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("buildContextBundle includes current library claim refs and excludes invalidated claims", () => {
		const root = createBundleFixture({ libraryRefs: true });
		try {
			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				role: "designer",
				surface: "alpha",
			});
			expect(bundle.library_refs).toContain("library:alpha#CLAIM-CURRENT");
			expect(
				bundle.library_refs.some((ref) => ref.startsWith("library-graph:")),
			).toBe(true);
			expect(bundle.library_refs.join(" ")).not.toContain("CLAIM-INVALID");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx build returns 0 and rebuilds sections", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(await runContextCommand("build", [], root, captured.io)).toBe(0);
			expect(getSectionIndex(root)?.sections.length).toBe(4);
			expect(captured.stdout[0]).toContain("ctx build: ok sections=4");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx defaults to summary without rebuilding sections", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(await runContextCommand("", [], root, captured.io)).toBe(0);
			expect(getSectionIndex(root)).toBeNull();
			expect(captured.stdout[0]).toContain("ctx: choose an action");
			expect(captured.stdout[0]).toContain("hint: run afol ctx build");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx --json defaults to summary without rebuilding sections", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(await runContextCommand("", ["--json"], root, captured.io)).toBe(
				0,
			);
			expect(getSectionIndex(root)).toBeNull();
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				action: string;
				ok: boolean;
				data: { sections: number; write_actions: string[] };
			};
			expect(payload.action).toBe("ctx.summary");
			expect(payload.ok).toBe(true);
			expect(payload.data.sections).toBe(0);
			expect(payload.data.write_actions).toEqual(["build"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx parses leading --json as summary flag", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(await runContextCommand("--json", [], root, captured.io)).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				action: string;
				ok: boolean;
			};
			expect(payload.action).toBe("ctx.summary");
			expect(payload.ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx build --json returns JSON", async () => {
		const root = createSectionFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand("build", ["--json"], root, captured.io),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { snapshot: { sections: unknown[] } };
				snapshot: { sections: unknown[] };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.build");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.snapshot.sections).toHaveLength(4);
			expect(payload.snapshot.sections).toHaveLength(4);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx bundle returns bundle", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout[0]).toContain("task: T-01");
			expect(captured.stdout[0]).toContain("mode: balanced");
			expect(captured.stdout[0]).toContain("refs:");
			expect(captured.stdout[0]).toContain("pstr_refs:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx bundle works without trusted when pstr is missing", async () => {
		const root = createBundleFixture({ pstr: "missing" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { pstr_refs: string[] };
				pstr_refs: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.bundle");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.pstr_refs).toEqual([]);
			expect(payload.pstr_refs).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx bundle --trusted fails when pstr is missing", async () => {
		const root = createBundleFixture({ pstr: "missing" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--trusted",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stderr[0]).toContain("missing pstr index snapshot");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx bundle --trusted fails with compact json on stale pstr", async () => {
		const root = createBundleFixture({ pstr: "stale" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--trusted",
						"--json",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(1);
			expect(captured.stderr).toHaveLength(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				error: { message: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.error.message).toContain("stale pstr index snapshot");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx explain --trusted fails on stale pstr", async () => {
		const root = createBundleFixture({ pstr: "stale" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					[
						"--trusted",
						"--json",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				error: { message: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.error.message).toContain("stale pstr index snapshot");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx bundle --json returns JSON", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: {
					task_id: string;
					mode: string;
					refs: Array<{ section?: string }>;
					pstr_refs: string[];
				};
				task_id: string;
				mode: string;
				refs: Array<{ section?: string }>;
				pstr_refs: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.bundle");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.task_id).toBe("T-01");
			expect(payload.task_id).toBe("T-01");
			expect(payload.mode).toBe("balanced");
			expect(payload.refs.length).toBeGreaterThan(0);
			expect(payload.pstr_refs).toEqual(["pstr:alpha-map"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx bundle --trusted passes after pstr rebuild and hydrated state", async () => {
		const root = createBundleFixture({ pstr: "missing" });
		try {
			mkdirSync(join(root, "cli"), { recursive: true });
			mkdirSync(join(root, "src", "project-template"), { recursive: true });
			writeFileSync(
				join(root, "cli", "trusted.ts"),
				"export const trusted = true;\n",
				"utf8",
			);
			writeFileSync(
				join(root, "src", "project-template", "index.ts"),
				"export const template = true;\n",
				"utf8",
			);
			rebuildSectionIndex(root);
			rebuildPstrIndex(root);
			expect(validatePstrIndex(root).ok).toBe(true);
			hydrateSession(root, "session-1");
			expect(validateState(root, "session-1").ok).toBe(true);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--trusted",
						"--json",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { pstr_refs: string[] };
				pstr_refs: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.bundle");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.pstr_refs.length).toBeGreaterThan(0);
			expect(payload.pstr_refs.length).toBeGreaterThan(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx bundle --json returns JSON with graph refs and project_health", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: {
					task_id: string;
					mode: string;
					refs: Array<{ section?: string }>;
					pstr_refs: string[];
					memory_refs: string[];
					library_refs: string[];
				};
				task_id: string;
				mode: string;
				refs: Array<{ section?: string }>;
				pstr_refs: string[];
				memory_refs: string[];
				library_refs: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.bundle");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.task_id).toBe("T-01");
			expect(payload.task_id).toBe("T-01");
			expect(payload.mode).toBe("balanced");
			expect(payload.refs.length).toBeGreaterThan(0);
			expect(payload.pstr_refs).toEqual(["pstr:alpha-map"]);
			expect(Array.isArray(payload.data.memory_refs)).toBe(true);
			expect(Array.isArray(payload.data.library_refs)).toBe(true);
			expect(Array.isArray(payload.memory_refs)).toBe(true);
			expect(Array.isArray(payload.library_refs)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx bundle invalid mode exits 2", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--mode",
						"nope",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(2);
			expect(captured.stderr[0]).toContain("Invalid ctx mode");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx bundle --json invalid mode returns envelope exit 2", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"bundle",
					[
						"--mode",
						"nope",
						"--json",
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(2);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				exit_code: number;
				error: { message: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(2);
			expect(payload.error.message).toContain("Invalid ctx mode");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx section <ref> returns section content", async () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"section",
					["--ref", "spec:alpha#overview"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				title: string;
				line_start: number;
			};
			expect(payload.title).toBe("Overview");
			expect(payload.line_start).toBe(9);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx section --json returns envelope", async () => {
		const root = createSectionFixture();
		try {
			rebuildSectionIndex(root);
			const captured = captureIo();
			expect(
				await runContextCommand(
					"section",
					["--ref", "spec:alpha#overview", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { section: { title: string; line_start: number } };
				section: { title: string; line_start: number };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.section");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.section.title).toBe("Overview");
			expect(payload.section.line_start).toBe(9);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx explain returns explanation with gaps and project_health separation", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				ok: boolean;
				why: unknown;
				gaps: string[];
				project_health: string[];
				freshness: unknown;
				evidence_tags: string[];
				create_safety_hints: string[];
				do_not_load: string[];
				bundle: unknown;
			};
			expect(payload.ok).toBe(true);
			expect(payload.why).toBeDefined();
			expect(payload.gaps).toEqual(expect.any(Array));
			expect(payload.project_health).toEqual(expect.any(Array));
			expect(payload.freshness).toBeDefined();
			expect(payload.evidence_tags).toEqual(expect.any(Array));
			expect(payload.create_safety_hints).toEqual(expect.any(Array));
			expect(payload.do_not_load).toContain("raw .afol/state/afol.db");
			expect(payload.bundle).toBeDefined();
			expect(Array.isArray(payload.gaps)).toBe(true);
			expect(Array.isArray(payload.project_health)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx explain --json returns envelope with gaps and project_health", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: {
					why: unknown;
					gaps: string[];
					project_health: string[];
					freshness: unknown;
					evidence_tags: string[];
					create_safety_hints: string[];
					do_not_load: string[];
					bundle: unknown;
				};
				why: unknown;
				gaps: string[];
				project_health: string[];
				freshness: unknown;
				evidence_tags: string[];
				create_safety_hints: string[];
				do_not_load: string[];
				bundle: unknown;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.explain");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.why).toBeDefined();
			expect(payload.why).toBeDefined();
			expect(payload.gaps).toEqual(expect.any(Array));
			expect(payload.data.gaps).toEqual(expect.any(Array));
			expect(payload.project_health).toEqual(expect.any(Array));
			expect(payload.data.project_health).toEqual(expect.any(Array));
			expect(payload.freshness).toBeDefined();
			expect(payload.evidence_tags).toEqual(expect.any(Array));
			expect(payload.create_safety_hints).toEqual(expect.any(Array));
			expect(payload.do_not_load).toContain("raw .afol/state/afol.db");
			expect(payload.bundle).toBeDefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx explain reports health-backed stale PSTR in project_health", async () => {
		const root = createBundleFixture({ pstr: "stale" });
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"explain",
					["-S", "session-1", "-T", "T-01", "--surface", "alpha", "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				freshness: { pstr: string };
				gaps: string[];
				project_health: string[];
			};
			expect(payload.freshness.pstr).toBe("stale");
			expect(
				payload.project_health.some((entry) => entry.includes("pstr:")),
			).toBe(true);
			expect(payload.gaps).toEqual(expect.any(Array));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx tools returns tool list", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"tools",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
					],
					root,
					captured.io,
				),
			).toBe(0);
			expect(captured.stdout[0]).toContain("afol ctx section");
			expect(captured.stdout[0]).toContain("bun test");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("afol ctx tools --json returns envelope", async () => {
		const root = createBundleFixture();
		try {
			const captured = captureIo();
			expect(
				await runContextCommand(
					"tools",
					[
						"-S",
						"session-1",
						"-T",
						"T-01",
						"--role",
						"designer",
						"--surface",
						"alpha",
						"--json",
					],
					root,
					captured.io,
				),
			).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action: string;
				exit_code: number;
				data: { tools: string[] };
				tools: string[];
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("ctx.tools");
			expect(payload.exit_code).toBe(0);
			expect(payload.data.tools.join("\n")).toContain("afol ctx section");
			expect(payload.tools.join("\n")).toContain("bun test");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
