import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectBenchmarkCatalog } from "../services/project-benchmark/catalog";
import { PROJECT_BENCHMARK_JSON_SCHEMA } from "../services/project-benchmark/schema";
import { validateProjectBenchmarkCatalog } from "../services/project-benchmark/validate";

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function createValidProject() {
	return {
		schema_version: "1.0.0",
		id: "aider",
		name: "Aider",
		category: "direct_comparable",
		status: "active",
		source_access: "open_source",
		last_reviewed_at: "2026-06-16",
		stale_after_days: 90,
		confidence: "high",
		similarity_axes: {
			repo_context_map: {
				score: 5,
				evidence_refs: ["aider-repomap"],
			},
		},
		similarities: [
			{
				axis: "repo_context_map",
				claim: "Uses a compact repository map.",
				evidence_refs: ["aider-repomap"],
			},
		],
		differences: [{ claim: "Interactive coding rather than governance." }],
		lessons_for_afol: [
			{
				axis: "repo_context_map",
				lesson: "Build compact project context.",
			},
		],
		do_not_copy: [{ reason: "Do not copy chat-only workflow assumptions." }],
		source_refs: [
			{
				id: "aider-repomap",
				title: "Aider repository map",
				url: "https://aider.chat/docs/repomap.html",
				source_type: "official_doc",
				claim: "Aider documents a concise repository map.",
				axes: ["repo_context_map"],
			},
		],
	};
}

function createProjectRoot(
	projectValue: unknown = createValidProject(),
): string {
	const root = mkdtempSync(join(tmpdir(), "project-benchmark-validation-"));
	mkdirSync(join(root, ".agents", "rules"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "project-benchmarks", "projects"), {
		recursive: true,
	});
	writeJson(join(root, ".agents", "config.json"), {
		schema_version: 1,
		project: { name: "pb-validation-fixture" },
	});
	writeJson(join(root, ".agents", "lock.json"), {
		schema_version: 1,
		locked: true,
	});
	writeJson(join(root, ".agents", "manifest.json"), {
		schema_version: 1,
		managed_hashes: {},
	});
	writeJson(
		join(root, ".afol", "adm", "project-benchmarks", "schema.json"),
		PROJECT_BENCHMARK_JSON_SCHEMA,
	);
	writeJson(join(root, ".afol", "adm", "project-benchmarks", "axes.json"), {
		schema_version: "1.0.0",
		axes: {
			repo_context_map: {
				weight: 15,
				description: "Uses compact repository maps or context ranking",
			},
			safe_mutation: {
				weight: 10,
				description: "Keeps mutations bounded, reviewed, or permissioned",
			},
		},
	});
	writeJson(
		join(root, ".afol", "adm", "project-benchmarks", "projects", "aider.json"),
		projectValue,
	);
	return root;
}

function issueCodes(root: string): string[] {
	return validateProjectBenchmarkCatalog(
		loadProjectBenchmarkCatalog(root),
		new Date("2026-06-20T00:00:00.000Z"),
	).issues.map((issue) => issue.code);
}

describe("project-benchmark validation hardening", () => {
	test("rejects non-object project JSON without crashing", () => {
		const root = createProjectRoot([]);
		try {
			expect(() =>
				validateProjectBenchmarkCatalog(loadProjectBenchmarkCatalog(root)),
			).not.toThrow();
			expect(issueCodes(root)).toContain("invalid-project");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("enforces schema-aligned id, date, axis, source id, and URL checks", () => {
		const root = createProjectRoot({
			...createValidProject(),
			id: "Wrong_ID",
			last_reviewed_at: "2026-02-30",
			similarity_axes: {},
			source_refs: [
				{
					id: "dup-source",
					title: "Relative doc",
					url: "docs/repomap",
					source_type: "official_doc",
					claim: "Relative paths are not valid URIs.",
					axes: ["repo_context_map"],
				},
				{
					id: "dup-source",
					title: "Absolute doc",
					url: "https://example.com/repomap",
					source_type: "official_doc",
					claim: "Duplicate ids should be rejected.",
					axes: ["repo_context_map"],
				},
			],
		});
		try {
			expect(issueCodes(root)).toEqual(
				expect.arrayContaining([
					"invalid-id-format",
					"invalid-last-reviewed-at",
					"empty-similarity-axes",
					"invalid-source-url",
					"duplicate-source-ref-id",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("requires source refs to declare supported axes", () => {
		const root = createProjectRoot({
			...createValidProject(),
			source_refs: [
				{
					id: "aider-repomap",
					title: "Aider repository map",
					url: "https://aider.chat/docs/repomap.html",
					source_type: "official_doc",
					claim: "Aider documents a concise repository map.",
				},
			],
		});
		try {
			expect(issueCodes(root)).toContain("missing-source-ref-axes");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects axis scores backed by refs that do not support that axis", () => {
		const root = createProjectRoot({
			...createValidProject(),
			similarity_axes: {
				safe_mutation: {
					score: 3,
					evidence_refs: ["aider-repomap"],
				},
			},
		});
		try {
			expect(issueCodes(root)).toContain("unsupported-evidence-axis");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects misplaced generated outputs outside project-benchmark data", () => {
		const root = createProjectRoot();
		try {
			const catalogCopy = join(
				root,
				".afol",
				"adm",
				"project-benchmarks",
				"generated-summary.md",
			);
			const runtimeCopy = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"scenarios",
				"similarity-matrix.json",
			);
			mkdirSync(
				join(root, ".afol", "data", "benchmarks", "catalog", "scenarios"),
				{
					recursive: true,
				},
			);
			writeFileSync(
				catalogCopy,
				"# Project Benchmark Generated Summary\n\nGenerated by `afol pb generate`.\n",
				"utf8",
			);
			writeFileSync(
				runtimeCopy,
				'{\n  "generated_by": "afol pb generate"\n}\n',
				"utf8",
			);
			const contaminationFiles = validateProjectBenchmarkCatalog(
				loadProjectBenchmarkCatalog(root),
				new Date("2026-06-20T00:00:00.000Z"),
			)
				.issues.filter(
					(issue) => issue.code === "runtime-benchmark-catalog-contamination",
				)
				.map((issue) => issue.file);
			expect(contaminationFiles).toEqual(
				expect.arrayContaining([
					".afol/adm/project-benchmarks/generated-summary.md",
					".afol/data/benchmarks/catalog/scenarios/similarity-matrix.json",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps validating partial local benchmark catalogs", () => {
		const root = createProjectRoot();
		try {
			rmSync(join(root, ".afol", "adm", "project-benchmarks", "axes.json"), {
				force: true,
			});
			rmSync(join(root, ".afol", "adm", "project-benchmarks", "projects"), {
				recursive: true,
				force: true,
			});

			const catalog = loadProjectBenchmarkCatalog(root);
			const validation = validateProjectBenchmarkCatalog(catalog);
			expect(catalog.source).toBe("project");
			expect(validation.ok).toBe(false);
			expect(validation.issues.map((issue) => issue.code)).toEqual(
				expect.arrayContaining([
					"missing-axes",
					"missing-projects-dir",
					"invalid-axes-schema-version",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects unexpected properties across project-benchmark records", () => {
		const root = createProjectRoot({
			...createValidProject(),
			extra_project_flag: true,
			similarity_axes: {
				repo_context_map: {
					score: 5,
					evidence_refs: ["aider-repomap"],
					extra_axis_flag: true,
				},
			},
			similarities: [
				{
					axis: "repo_context_map",
					claim: "Uses a compact repository map.",
					evidence_refs: ["aider-repomap"],
					extra_similarity_flag: true,
				},
			],
			differences: [
				{
					claim: "Interactive coding rather than governance.",
					extra_difference_flag: true,
				},
			],
			lessons_for_afol: [
				{
					axis: "repo_context_map",
					lesson: "Build compact project context.",
					extra_lesson_flag: true,
				},
			],
			do_not_copy: [
				{
					reason: "Do not copy chat-only workflow assumptions.",
					extra_do_not_copy_flag: true,
				},
			],
			source_refs: [
				{
					id: "aider-repomap",
					title: "Aider repository map",
					url: "https://aider.chat/docs/repomap.html",
					source_type: "official_doc",
					claim: "Aider documents a concise repository map.",
					axes: ["repo_context_map"],
					extra_source_flag: true,
				},
			],
		});
		try {
			expect(issueCodes(root)).toEqual(
				expect.arrayContaining([
					"unexpected-project-property",
					"unexpected-axis-score-property",
					"unexpected-similarity-property",
					"unexpected-difference-property",
					"unexpected-lesson-property",
					"unexpected-do-not-copy-property",
					"unexpected-source-ref-property",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
