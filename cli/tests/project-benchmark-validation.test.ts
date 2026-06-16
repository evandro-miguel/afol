import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectBenchmarkCatalog } from "../services/project-benchmark/catalog";
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
	writeJson(join(root, ".afol", "adm", "project-benchmarks", "schema.json"), {
		schema_version: "1.0.0",
	});
	writeJson(join(root, ".afol", "adm", "project-benchmarks", "axes.json"), {
		schema_version: "1.0.0",
		axes: {
			repo_context_map: {
				weight: 15,
				description: "Uses compact repository maps or context ranking",
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
				},
				{
					id: "dup-source",
					title: "Absolute doc",
					url: "https://example.com/repomap",
					source_type: "official_doc",
					claim: "Duplicate ids should be rejected.",
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
