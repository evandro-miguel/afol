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
import { computeSourceHash } from "../core/source-hash";
import {
	buildContextBundle,
	ContextTrustError,
} from "../services/context/bundler";
import * as sectionIndexModule from "../services/context/section-index";
import {
	buildSectionIndexSnapshot,
	rebuildSectionIndex,
	resolveSection,
	SectionIndexTrustError,
} from "../services/context/section-index";
import { checkHealth } from "../services/health/checker";

function createRoot(admDir = ".afol/adm"): string {
	const root = mkdtempSync(join(tmpdir(), "canonical-context-"));
	mkdirSync(join(root, admDir, "specs"), { recursive: true });
	mkdirSync(join(root, admDir, "decisions"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "index"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({
			paths: {
				mutable_dir: ".afol",
				adm_dir: admDir,
				data_index_dir: ".afol/data/index",
			},
		}),
	);
	return root;
}

function writeDoc(
	root: string,
	relativePath: string,
	frontmatter: Record<string, string>,
	body: string,
): void {
	const path = join(root, relativePath);
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(
		path,
		[
			"---",
			...Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`),
			"---",
			"",
			body,
			"",
		].join("\n"),
	);
}

function writeStoredIndex(
	root: string,
	sections: unknown[],
	generatedAt = new Date(Date.now() + 10_000).toISOString(),
	sources: Array<{
		source_path: string;
		content_sha256: string;
		section_count: number;
	}> = [],
): void {
	writeFileSync(
		join(root, ".afol", "data", "index", "sections.json"),
		`${JSON.stringify({
			kind: "sections_index_v2",
			version: 2,
			generated_at: generatedAt,
			manifest: {
				algorithm: "sha256",
				source_count: sources.length,
				section_count: sections.length,
				sections_sha256: storedSectionDigest(sections),
				sources,
			},
			sections,
		})}\n`,
	);
}

function storedSectionDigest(sections: unknown[]): string {
	return computeSourceHash(
		JSON.stringify(
			sections.map((section) => {
				const row = section as Record<string, unknown>;
				return [
					row.ref,
					row.title,
					row.level,
					row.line_start,
					row.line_end,
					row.source_path,
				];
			}),
		),
	).hash;
}

function sourceManifestEntry(
	root: string,
	sourcePath: string,
	sectionCount: number,
): {
	source_path: string;
	content_sha256: string;
	section_count: number;
} {
	return {
		source_path: sourcePath,
		content_sha256: computeSourceHash(
			readFileSync(join(root, sourcePath), "utf8"),
		).hash,
		section_count: sectionCount,
	};
}

function healthMessage(root: string): string {
	return checkHealth(root, { area: "ctx" }).findings[0]?.message ?? "";
}

describe("canonical administration section index", () => {
	test("recursively indexes canonical specs and decisions with stable unique refs", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/alpha.md",
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nOne.\n\n## Intent\n\nTwo.",
			);
			writeDoc(
				root,
				".afol/adm/specs/nested/beta.md",
				{
					doc_type: "spec-child",
					id: "beta-child",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nThree.",
			);
			writeDoc(
				root,
				".afol/adm/decisions/ADR-099.md",
				{ doc_type: "adr", id: "ADR-099" },
				"## Decision\n\nCanonical.",
			);
			writeDoc(
				root,
				".afol/adm/specs/INDEX.md",
				{ doc_type: "specs_index", id: "specs-index" },
				"## Index\n\nAdministrative.",
			);
			writeDoc(
				root,
				"docs/arc/SPECS/legacy.md",
				{
					doc_type: "spec",
					id: "legacy",
					roadmap_feature: "F-29",
				},
				"## Legacy\n\nMust not load.",
			);

			const first = buildSectionIndexSnapshot(root);
			const second = buildSectionIndexSnapshot(root);
			const refs = first.sections.map((section) => section.ref);

			expect(first.sections).toHaveLength(4);
			expect(refs).toEqual([
				"adr:adr-099#decision",
				"spec:f-29/alpha-spec#intent",
				"spec:f-29/alpha-spec#intent-2",
				"spec:f-29/beta-child#intent",
			]);
			expect(new Set(refs).size).toBe(refs.length);
			expect(first.sections.map((section) => section.source_path)).toEqual([
				".afol/adm/decisions/ADR-099.md",
				".afol/adm/specs/alpha.md",
				".afol/adm/specs/alpha.md",
				".afol/adm/specs/nested/beta.md",
			]);
			expect(second.sections).toEqual(first.sections);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses a project-relative fallback identity when canonical frontmatter id is missing", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/nested/no-id.md",
				{ doc_type: "spec", roadmap_feature: "F-29" },
				"## Intent\n\nFallback.",
			);

			expect(buildSectionIndexSnapshot(root).sections[0]?.ref).toBe(
				"spec:f-29/specs-nested-no-id#intent",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports empty stored coverage when canonical documents exist", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/alpha.md",
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nCanonical.",
			);
			writeStoredIndex(root, []);

			const report = checkHealth(root, { area: "ctx", deep: true });

			expect(report.ok).toBe(true);
			expect(
				report.findings.some(
					(finding) =>
						finding.area === "ctx" &&
						finding.severity === "warn" &&
						finding.message.includes("section index"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not accept an indexable canonical document with no headings as a green empty index", () => {
		const root = createRoot();
		try {
			const sourcePath = ".afol/adm/specs/no-headings.md";
			writeDoc(
				root,
				sourcePath,
				{
					doc_type: "spec",
					id: "no-headings",
					roadmap_feature: "F-29",
				},
				"# Title only\n\nNo indexable section heading.",
			);
			expect(() => rebuildSectionIndex(root)).toThrow("no indexable sections");
			writeStoredIndex(root, [], undefined, [
				sourceManifestEntry(root, sourcePath, 0),
			]);

			expect(healthMessage(root)).toContain("incomplete section index");
			expect(healthMessage(root)).toContain("no indexable sections");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects v1 and a v2 index without the required source manifest as corrupt", () => {
		const root = createRoot();
		try {
			writeFileSync(
				join(root, ".afol", "data", "index", "sections.json"),
				'{"kind":"sections_index_v1","version":1,"generated_at":"2026-07-26T00:00:00.000Z","sections":[]}\n',
			);
			expect(healthMessage(root)).toContain("corrupt section index");
			expect(healthMessage(root)).toContain("unsupported v1");

			writeFileSync(
				join(root, ".afol", "data", "index", "sections.json"),
				'{"kind":"sections_index_v2","version":2,"generated_at":"2026-07-26T00:00:00.000Z","sections":[]}\n',
			);
			expect(healthMessage(root)).toContain("corrupt section index");
			expect(healthMessage(root)).toContain("missing source manifest");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports missing, stale, incomplete, foreign, and corrupt cache reasons distinctly", () => {
		const root = createRoot();
		try {
			const sourcePath = ".afol/adm/specs/alpha.md";
			writeDoc(
				root,
				sourcePath,
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nCanonical.",
			);
			expect(healthMessage(root)).toContain("missing section index");

			const section = buildSectionIndexSnapshot(root).sections[0];
			expect(section).toBeDefined();
			writeStoredIndex(root, [section], undefined, [
				{
					...sourceManifestEntry(root, sourcePath, 1),
					content_sha256: "0".repeat(64),
				},
			]);
			expect(healthMessage(root)).toContain("stale section index");

			writeStoredIndex(root, [], undefined, [
				sourceManifestEntry(root, sourcePath, 1),
			]);
			expect(healthMessage(root)).toContain("incomplete section index");

			writeStoredIndex(
				root,
				[
					{
						...section,
						source_path: "docs/arc/SPECS/alpha.md",
					},
				],
				undefined,
				[
					{
						source_path: "docs/arc/SPECS/alpha.md",
						content_sha256: "0".repeat(64),
						section_count: 1,
					},
				],
			);
			expect(healthMessage(root)).toContain("foreign section index");

			writeFileSync(
				join(root, ".afol", "data", "index", "sections.json"),
				"{not-json}\n",
			);
			expect(healthMessage(root)).toContain("corrupt section index");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("cache reads validate the v2 source manifest without invoking a full section rebuild", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/alpha.md",
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nCanonical.",
			);
			rebuildSectionIndex(root);
			const seam = (
				sectionIndexModule as typeof sectionIndexModule & {
					sectionIndexTestSeam?: {
						reset: () => void;
						fullBuildInvocations: () => number;
					};
				}
			).sectionIndexTestSeam;
			expect(seam).toBeDefined();
			if (!seam) {
				return;
			}
			seam.reset();

			expect(sectionIndexModule.getSectionIndex(root)).not.toBeNull();
			expect(seam.fullBuildInvocations()).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bundle and section readers fail closed without rebuilding a missing or invalid cache", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/alpha.md",
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nCanonical.",
			);
			sectionIndexModule.sectionIndexTestSeam.reset();

			let bundleError: unknown;
			try {
				buildContextBundle(root, { surface: "general" });
			} catch (error) {
				bundleError = error;
			}
			expect(bundleError).toBeInstanceOf(ContextTrustError);
			expect((bundleError as ContextTrustError).reason).toBe("missing");
			expect((bundleError as ContextTrustError).remediation).toBe(
				"afol ctx build",
			);
			expect((bundleError as Error).message).toContain("afol ctx build");

			let sectionError: unknown;
			try {
				resolveSection(root, "spec:f-29/alpha-spec#intent");
			} catch (error) {
				sectionError = error;
			}
			expect(sectionError).toBeInstanceOf(SectionIndexTrustError);
			expect((sectionError as SectionIndexTrustError).status).toBe("missing");
			expect((sectionError as Error).message).toContain("afol ctx build");
			expect(
				sectionIndexModule.sectionIndexTestSeam.fullBuildInvocations(),
			).toBe(0);

			writeFileSync(
				join(root, ".afol", "data", "index", "sections.json"),
				'{"kind":"sections_index_v1","version":1,"sections":[]}\n',
			);
			expect(() => buildContextBundle(root, { surface: "general" })).toThrow(
				"unsupported v1",
			);
			expect(
				sectionIndexModule.sectionIndexTestSeam.fullBuildInvocations(),
			).toBe(0);

			writeFileSync(
				join(root, ".afol", "data", "index", "sections.json"),
				"{invalid-json",
			);
			expect(() => buildContextBundle(root, { surface: "general" })).toThrow(
				"invalid JSON",
			);
			expect(
				sectionIndexModule.sectionIndexTestSeam.fullBuildInvocations(),
			).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects missing, wrong, or forged persisted section payload digests", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/alpha.md",
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nCanonical.",
			);
			const storedPath = join(root, ".afol", "data", "index", "sections.json");

			rebuildSectionIndex(root);
			const missingDigest = JSON.parse(
				readFileSync(storedPath, "utf8"),
			) as Record<string, unknown>;
			delete (missingDigest.manifest as Record<string, unknown>)
				.sections_sha256;
			writeFileSync(storedPath, `${JSON.stringify(missingDigest)}\n`);
			expect(healthMessage(root)).toContain("missing section payload digest");

			rebuildSectionIndex(root);
			const wrongDigest = JSON.parse(
				readFileSync(storedPath, "utf8"),
			) as Record<string, unknown>;
			(wrongDigest.manifest as Record<string, unknown>).sections_sha256 =
				"0".repeat(64);
			writeFileSync(storedPath, `${JSON.stringify(wrongDigest)}\n`);
			expect(healthMessage(root)).toContain("section payload digest mismatch");

			rebuildSectionIndex(root);
			const forgedPayload = JSON.parse(readFileSync(storedPath, "utf8")) as {
				sections: Array<Record<string, unknown>>;
			};
			if (forgedPayload.sections[0]) {
				forgedPayload.sections[0].title = "Forged title";
				forgedPayload.sections[0].line_end = 999;
			}
			writeFileSync(storedPath, `${JSON.stringify(forgedPayload)}\n`);
			expect(healthMessage(root)).toContain("section payload digest mismatch");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects invalid persisted section and source shapes before trust", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/alpha.md",
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nCanonical.",
			);
			const snapshot = buildSectionIndexSnapshot(root);
			const source = snapshot.manifest.sources[0];
			const section = snapshot.sections[0];
			expect(source).toBeDefined();
			expect(section).toBeDefined();
			if (!source || !section) {
				return;
			}

			const invalidRows: Array<Record<string, unknown>> = [
				{ ...section, ref: "" },
				{ ...section, title: " " },
				{ ...section, source_path: "" },
				{ ...section, source_path: "../escape.md" },
				{ ...section, level: 1 },
				{ ...section, level: 4 },
				{ ...section, line_start: 0 },
				{ ...section, line_start: 1.5 },
				{ ...section, line_end: section.line_start - 1 },
			];
			for (const invalid of invalidRows) {
				writeStoredIndex(root, [invalid], undefined, [source]);
				expect(healthMessage(root)).toContain("invalid section entries");
			}

			writeStoredIndex(root, [section], undefined, [
				{ ...source, source_path: "" },
			]);
			expect(healthMessage(root)).toContain("invalid source manifest");
			writeStoredIndex(root, [section], undefined, [
				{ ...source, source_path: "../escape.md" },
			]);
			expect(healthMessage(root)).toContain("invalid source manifest");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("parses CRLF frontmatter and fails closed on malformed canonical YAML", () => {
		const root = createRoot();
		try {
			writeFileSync(
				join(root, ".afol", "adm", "specs", "crlf.md"),
				[
					"---",
					"doc_type: spec",
					"id: crlf-spec",
					"roadmap_feature: F-29",
					"---",
					"",
					"## Intent",
					"",
					"CRLF.",
				].join("\r\n"),
			);
			expect(rebuildSectionIndex(root).sections[0]?.ref).toBe(
				"spec:f-29/crlf-spec#intent",
			);

			writeFileSync(
				join(root, ".afol", "adm", "specs", "absent.md"),
				"# No frontmatter\n\n## Ignored\n",
			);
			expect(rebuildSectionIndex(root).manifest.source_count).toBe(1);

			writeFileSync(
				join(root, ".afol", "adm", "specs", "malformed.md"),
				"---\ndoc_type: [spec\n---\n\n## Intent\n\nInvalid.\n",
			);
			expect(() => rebuildSectionIndex(root)).toThrow(
				"malformed canonical frontmatter",
			);
			expect(healthMessage(root)).toContain("malformed canonical frontmatter");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses deterministic path and title hashes for non-ASCII identities", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/é.md",
				{ doc_type: "spec", id: "你好", roadmap_feature: "F-29" },
				"## 🔥🔥\n\nStable.",
			);
			writeDoc(
				root,
				".afol/adm/specs/a.md",
				{ doc_type: "spec", id: "alpha", roadmap_feature: "F-29" },
				"## Intent\n\nASCII.",
			);

			const first = buildSectionIndexSnapshot(root);
			const second = buildSectionIndexSnapshot(root);
			expect(first.sections).toEqual(second.sections);
			expect(first.sections.map((entry) => entry.source_path)).toEqual([
				".afol/adm/specs/a.md",
				".afol/adm/specs/é.md",
			]);
			expect(first.sections[1]?.ref).toMatch(
				/^spec:f-29\/doc-[a-f0-9]{12}#heading-[a-f0-9]{12}$/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preserves distinct NFC and NFD Linux source paths through immediate inspection", () => {
		const root = createRoot();
		try {
			const nfcPath = ".afol/adm/specs/é.md";
			const nfdPath = ".afol/adm/specs/e\u0301.md";
			writeDoc(
				root,
				nfcPath,
				{ doc_type: "spec", id: "你好", roadmap_feature: "F-29" },
				"## NFC\n\nComposed.",
			);
			writeDoc(
				root,
				nfdPath,
				{ doc_type: "spec", id: "再见", roadmap_feature: "F-29" },
				"## NFD\n\nDecomposed.",
			);

			const snapshot = rebuildSectionIndex(root);
			expect(
				snapshot.manifest.sources.map((source) => source.source_path),
			).toEqual([nfdPath, nfcPath]);
			expect(
				new Set(snapshot.manifest.sources.map((source) => source.source_path))
					.size,
			).toBe(2);
			expect(sectionIndexModule.inspectSectionIndexCache(root).status).toBe(
				"current",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects persisted refs that collide under resolver case normalization", () => {
		const root = createRoot();
		try {
			const sourcePath = ".afol/adm/specs/alpha.md";
			writeDoc(
				root,
				sourcePath,
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nOne.\n\n## Acceptance\n\nTwo.",
			);
			const snapshot = buildSectionIndexSnapshot(root);
			const first = snapshot.sections[0];
			const second = snapshot.sections[1];
			expect(first).toBeDefined();
			expect(second).toBeDefined();
			if (!first || !second) {
				return;
			}
			expect(first.ref).toBe(first.ref.toLowerCase());
			expect(second.ref).toBe(second.ref.toLowerCase());

			writeStoredIndex(
				root,
				[first, { ...second, ref: first.ref.toUpperCase() }],
				undefined,
				[sourceManifestEntry(root, sourcePath, 2)],
			);

			expect(healthMessage(root)).toContain("duplicate section refs");
			expect(sectionIndexModule.getSectionIndex(root)).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("expanded snippets use the exact source bytes verified by cache inspection", () => {
		const root = createRoot();
		try {
			const sourcePath = ".afol/adm/specs/alpha.md";
			writeDoc(
				root,
				sourcePath,
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nVerified bytes.",
			);
			rebuildSectionIndex(root);
			const seam =
				sectionIndexModule.sectionIndexTestSeam as typeof sectionIndexModule.sectionIndexTestSeam & {
					replaceAfterInspection?: (callback: () => void) => void;
				};
			expect(typeof seam.replaceAfterInspection).toBe("function");
			if (!seam.replaceAfterInspection) {
				return;
			}
			seam.replaceAfterInspection(() => {
				writeDoc(
					root,
					sourcePath,
					{
						doc_type: "spec",
						id: "alpha-spec",
						roadmap_feature: "F-29",
					},
					"## Intent\n\nReplacement bytes.",
				);
			});

			const bundle = buildContextBundle(root, {
				surface: "f-29",
				mode: "deep",
			});
			expect(bundle.expanded_sections?.[0]?.snippet).toContain(
				"Verified bytes.",
			);
			expect(bundle.expanded_sections?.[0]?.snippet).not.toContain(
				"Replacement bytes.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("full health shares one canonical cache inspection across ctx and token checks", () => {
		const root = createRoot();
		try {
			rebuildSectionIndex(root);
			const seam =
				sectionIndexModule.sectionIndexTestSeam as typeof sectionIndexModule.sectionIndexTestSeam & {
					inspectionInvocations?: () => number;
				};
			expect(typeof seam.inspectionInvocations).toBe("function");
			if (!seam.inspectionInvocations) {
				return;
			}
			sectionIndexModule.sectionIndexTestSeam.reset();

			checkHealth(root, { deep: true });

			expect(seam.inspectionInvocations()).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("administration health honors the configured canonical adm directory", () => {
		const root = createRoot("governance");
		try {
			for (const dir of ["roadmap", "doctrine"]) {
				mkdirSync(join(root, "governance", dir), { recursive: true });
			}

			const report = checkHealth(root, { area: "adm", deep: true });

			expect(report.ok).toBe(true);
			expect(
				report.findings.some((finding) =>
					finding.message.includes("missing .afol/adm"),
				),
			).toBe(false);
			expect(report.findings[0]?.message).toContain("adm structure present");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects partial, foreign, and stale stored canonical coverage", () => {
		const root = createRoot();
		try {
			const sourcePath = ".afol/adm/specs/alpha.md";
			writeDoc(
				root,
				sourcePath,
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nCanonical.\n\n## Acceptance\n\nComplete.",
			);
			const sections = buildSectionIndexSnapshot(root).sections;
			expect(sections).toHaveLength(2);

			writeStoredIndex(root, sections.slice(0, 1), undefined, [
				sourceManifestEntry(root, sourcePath, 2),
			]);
			expect(healthMessage(root)).toContain("incomplete section index");

			const foreignPath = "docs/arc/SPECS/alpha.md";
			const foreignSections = sections.map((section) => ({
				...section,
				source_path: foreignPath,
			}));
			writeStoredIndex(root, foreignSections, undefined, [
				{
					source_path: foreignPath,
					content_sha256: "0".repeat(64),
					section_count: 2,
				},
			]);
			expect(healthMessage(root)).toContain("foreign section index");

			writeStoredIndex(root, sections, undefined, [
				{
					...sourceManifestEntry(root, sourcePath, 2),
					content_sha256: "0".repeat(64),
				},
			]);
			expect(healthMessage(root)).toContain("stale section index");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts a zero-section index only when no canonical document is indexable", () => {
		const root = createRoot();
		try {
			writeStoredIndex(root, []);

			const report = checkHealth(root, { area: "ctx", deep: true });

			expect(report.ok).toBe(true);
			expect(report.findings).toEqual([
				{
					area: "ctx",
					severity: "info",
					message: "section index current (0 sections)",
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolves a legacy feature-heading alias only when it is unambiguous", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/alpha.md",
				{
					doc_type: "spec",
					id: "alpha-spec",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nOne.",
			);
			rebuildSectionIndex(root);

			expect(resolveSection(root, "spec:f-29#intent")?.ref).toBe(
				"spec:f-29/alpha-spec#intent",
			);

			writeDoc(
				root,
				".afol/adm/specs/beta.md",
				{
					doc_type: "spec-child",
					id: "beta-child",
					roadmap_feature: "F-29",
				},
				"## Intent\n\nTwo.",
			);

			expect(() => resolveSection(root, "spec:f-29#intent")).toThrow(
				"afol ctx build",
			);
			rebuildSectionIndex(root);
			expect(resolveSection(root, "spec:f-29#intent")).toBeNull();
			expect(resolveSection(root, "spec:f-29")).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bundle feature selection does not cross-match feature prefixes", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/f-2.md",
				{ doc_type: "spec", id: "f-2-spec", roadmap_feature: "F-2" },
				"## Intent\n\nExact.",
			);
			writeDoc(
				root,
				".afol/adm/specs/f-20.md",
				{ doc_type: "spec", id: "f-20-spec", roadmap_feature: "F-20" },
				"## Intent\n\nPrefix collision.",
			);
			mkdirSync(join(root, ".afol", "wb", "session-1"), {
				recursive: true,
			});
			writeFileSync(
				join(root, ".afol", "wb", "session-1", "session_task_01.md"),
				[
					"---",
					"roadmap_feature: F-2",
					"---",
					"",
					"| Task | State | Owner | Notes |",
					"| --- | --- | --- | --- |",
					"| T-01 | pending | worker | exact feature |",
				].join("\n"),
			);
			rebuildSectionIndex(root);

			const bundle = buildContextBundle(root, {
				session: "session-1",
				task: "T-01",
				surface: "general",
			});
			const sectionRefs = bundle.refs
				.map((ref) => ref.section)
				.filter((ref): ref is string => Boolean(ref));

			expect(sectionRefs).toContain("spec:f-2/f-2-spec#intent");
			expect(sectionRefs).not.toContain("spec:f-20/f-20-spec#intent");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("token health measures the worst selectable three sections, not the catalog sum", () => {
		const root = createRoot();
		try {
			const heading = `Context ${"x".repeat(180)}`;
			for (let index = 0; index < 100; index += 1) {
				writeDoc(
					root,
					`.afol/adm/specs/spec-${index}.md`,
					{
						doc_type: "spec",
						id: `spec-${index}`,
						roadmap_feature: `F-${index}`,
					},
					`## ${heading}\n\nBounded.`,
				);
			}
			rebuildSectionIndex(root);

			const report = checkHealth(root, {
				area: "token_budget",
				deep: true,
			});

			expect(report.ok).toBe(true);
			expect(
				report.findings.some(
					(finding) =>
						finding.severity === "fail" || finding.severity === "warn",
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("token health includes large Unicode and punctuation titles at unchanged thresholds", () => {
		const root = createRoot();
		try {
			writeDoc(
				root,
				".afol/adm/specs/unicode.md",
				{
					doc_type: "spec",
					id: "unicode-spec",
					roadmap_feature: "F-29",
				},
				`## ${"🔥!".repeat(6_000)}\n\nBounded body.`,
			);
			rebuildSectionIndex(root);

			const report = checkHealth(root, {
				area: "token_budget",
				deep: true,
			});

			expect(report.ok).toBe(true);
			expect(report.findings[0]?.message).toContain("token budget exceeded");
			expect(report.findings[0]?.message).toContain("/4000");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
