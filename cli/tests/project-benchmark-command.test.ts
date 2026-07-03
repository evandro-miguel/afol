import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProjectBenchmarkCommand } from "../commands/project-benchmark";
import { agentOperationContext } from "../core/operation-context";
import { loadProjectBenchmarkCatalog } from "../services/project-benchmark/catalog";
import { validateProjectBenchmarkCatalog } from "../services/project-benchmark/validate";

type CapturedIo = {
	stdout: string[];
	stderr: string[];
	io: {
		stdout: (message: string) => void;
		stderr: (message: string) => void;
	};
};

function captureIo(): CapturedIo {
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

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function projectPath(root: string, id = "aider"): string {
	return join(
		root,
		".afol",
		"adm",
		"project-benchmarks",
		"projects",
		`${id}.json`,
	);
}

function axesPath(root: string): string {
	return join(root, ".afol", "adm", "project-benchmarks", "axes.json");
}

type ProjectRecord = Record<string, unknown> & {
	source_refs?: Array<Record<string, unknown>>;
};

function readProject(root: string, id = "aider"): ProjectRecord {
	return JSON.parse(
		readFileSync(projectPath(root, id), "utf8"),
	) as ProjectRecord;
}

function issueCodes(root: string, now = new Date("2026-06-20T00:00:00.000Z")) {
	return validateProjectBenchmarkCatalog(
		loadProjectBenchmarkCatalog(root),
		now,
	).issues.map((issue) => issue.code);
}

function addProjectCopy(
	root: string,
	id: string,
	score: number,
	lesson: string | null,
): void {
	const raw = readProject(root);
	raw.id = id;
	raw.name = id;
	raw.similarity_axes = {
		repo_context_map: { score, evidence_refs: ["aider-repomap"] },
		safe_mutation: {
			score: score === 5 ? 3 : 0,
			evidence_refs: ["aider-repomap"],
		},
	};
	raw.lessons_for_afol = lesson
		? [{ axis: "repo_context_map", lesson }]
		: [{ axis: "safe_mutation", lesson: "Different axis lesson." }];
	writeJson(projectPath(root, id), raw);
}

function createProjectRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "project-benchmark-"));
	mkdirSync(join(root, ".agents", "rules"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "project-benchmarks", "projects"), {
		recursive: true,
	});
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeJson(join(root, ".agents", "config.json"), {
		schema_version: 1,
		project: { name: "pb-fixture" },
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
			safe_mutation: {
				weight: 15,
				description: "Controls edits and approvals",
			},
		},
	});
	writeJson(
		join(root, ".afol", "adm", "project-benchmarks", "projects", "aider.json"),
		{
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
				safe_mutation: {
					score: 3,
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
					axes: ["repo_context_map", "safe_mutation"],
				},
			],
		},
	);
	return root;
}

describe("project-benchmark service", () => {
	test("validates a minimal curated catalog", () => {
		const root = createProjectRoot();
		try {
			const catalog = loadProjectBenchmarkCatalog(root);
			const validation = validateProjectBenchmarkCatalog(
				catalog,
				new Date("2026-06-20T00:00:00.000Z"),
			);
			expect(validation.ok).toBe(true);
			expect(validation.project_count).toBe(1);
			expect(validation.error_count).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects unknown axes and score without evidence", () => {
		const root = createProjectRoot();
		try {
			const raw = readProject(root);
			raw.similarity_axes = {
				memory_magic: { score: 6, evidence_refs: [] },
			};
			writeJson(projectPath(root), raw);
			const validation = validateProjectBenchmarkCatalog(
				loadProjectBenchmarkCatalog(root),
			);
			expect(validation.ok).toBe(false);
			expect(validation.issues.map((issue) => issue.code)).toEqual(
				expect.arrayContaining([
					"unknown-axis",
					"invalid-score",
					"score-without-evidence",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects project-benchmark data under runtime benchmark catalog", () => {
		const root = createProjectRoot();
		try {
			mkdirSync(
				join(
					root,
					".afol",
					"data",
					"benchmarks",
					"catalog",
					"project-benchmarks",
				),
				{ recursive: true },
			);
			const validation = validateProjectBenchmarkCatalog(
				loadProjectBenchmarkCatalog(root),
			);
			expect(validation.ok).toBe(false);
			expect(validation.issues.map((issue) => issue.code)).toContain(
				"runtime-benchmark-catalog-contamination",
			);
			mkdirSync(
				join(root, ".afol", "data", "benchmarks", "catalog", "scenarios"),
				{ recursive: true },
			);
			writeJson(
				join(
					root,
					".afol",
					"data",
					"benchmarks",
					"catalog",
					"scenarios",
					"copied-index.json",
				),
				{
					schema_version: "1.0.0",
					generated_by: "afol pb generate",
					generated_at: "2026-06-16T00:00:00.000Z",
				},
			);
			const recursiveValidation = validateProjectBenchmarkCatalog(
				loadProjectBenchmarkCatalog(root),
			);
			expect(
				recursiveValidation.issues.some((issue) =>
					issue.file.endsWith("scenarios/copied-index.json"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports loader, axis, duplicate id, and malformed project issues", () => {
		const root = createProjectRoot();
		try {
			writeJson(join(root, ".afol", "adm", "project-benchmarks", "axes.json"), {
				schema_version: "1.0.0",
				axes: {
					repo_context_map: {
						weight: 0,
					},
				},
			});
			const raw = readProject(root);
			delete raw.schema_version;
			delete raw.name;
			raw.id = "wrong-id";
			raw.last_reviewed_at = "not-a-date";
			raw.stale_after_days = 0;
			raw.source_access = "docs_only";
			raw.confidence = "high";
			raw.similarity_axes = undefined;
			raw.similarities = [];
			raw.differences = [];
			raw.lessons_for_afol = [];
			raw.do_not_copy = [];
			raw.source_refs = [{ id: "bad-source" }];
			writeJson(projectPath(root), raw);
			writeJson(projectPath(root, "copy"), {
				...readProject(root),
				id: "wrong-id",
				name: "Duplicate",
			});

			expect(issueCodes(root)).toEqual(
				expect.arrayContaining([
					"invalid-axis-weight",
					"missing-axis-description",
					"missing-schema-version",
					"missing-name",
					"invalid-last-reviewed-at",
					"invalid-stale-after-days",
					"missing-similarity-axes",
					"missing-similarities",
					"missing-differences",
					"missing-lessons",
					"missing-do-not-copy",
					"invalid-source-ref",
					"missing-source-claim",
					"id-filename-mismatch",
					"duplicate-id",
					"docs-only-high-confidence",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports malformed evidence, lessons, confidence, stale review, and load issues", () => {
		const root = createProjectRoot();
		try {
			const raw = readProject(root);
			raw.source_access = "closed_source";
			raw.confidence = "high";
			raw.last_reviewed_at = "2020-01-01";
			raw.stale_after_days = 30;
			raw.similarity_axes = {
				repo_context_map: { score: 5, evidence_refs: ["missing-ref"] },
			};
			raw.similarities = [
				{ claim: "Missing axis", evidence_refs: [] },
				{
					axis: "missing-axis",
					claim: "Unknown axis",
					evidence_refs: ["missing-ref"],
				},
			];
			raw.lessons_for_afol = [
				{ lesson: "Missing axis" },
				{ axis: "missing-axis", lesson: "Unknown axis" },
			];
			writeJson(projectPath(root), raw);

			expect(issueCodes(root, new Date("2026-06-16T00:00:00.000Z"))).toEqual(
				expect.arrayContaining([
					"unknown-evidence-ref",
					"similarity-without-axis",
					"similarity-without-evidence",
					"unknown-axis",
					"lesson-without-axis",
					"closed-source-high-confidence",
					"stale-review",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports invalid json in catalog files", () => {
		const root = createProjectRoot();
		try {
			writeFileSync(projectPath(root), "{bad json", "utf8");

			expect(issueCodes(root)).toEqual(
				expect.arrayContaining(["invalid-json"]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports invalid enum values in project records and sources", () => {
		const root = createProjectRoot();
		try {
			const raw = readProject(root);
			raw.category = "loose_reference";
			raw.status = "current";
			raw.source_access = "blog_only";
			raw.confidence = "certain";
			raw.source_refs = [
				{
					id: "bad-source",
					title: "Bad source",
					url: "https://example.com",
					source_type: "video",
					claim: "Unsupported source type.",
				},
			];
			raw.similarity_axes = {
				repo_context_map: { score: 5, evidence_refs: ["bad-source"] },
			};
			raw.similarities = [
				{
					axis: "repo_context_map",
					claim: "Has context.",
					evidence_refs: ["bad-source"],
				},
			];
			writeJson(projectPath(root), raw);

			expect(issueCodes(root)).toEqual(
				expect.arrayContaining([
					"invalid-category",
					"invalid-status",
					"invalid-source-access",
					"invalid-confidence",
					"invalid-source-type",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back to builtin catalog when local benchmark files are missing", () => {
		const root = createProjectRoot();
		try {
			rmSync(join(root, ".afol", "adm", "project-benchmarks", "axes.json"), {
				force: true,
			});
			rmSync(join(root, ".afol", "adm", "project-benchmarks", "schema.json"), {
				force: true,
			});
			rmSync(join(root, ".afol", "adm", "project-benchmarks", "projects"), {
				recursive: true,
				force: true,
			});

			const catalog = loadProjectBenchmarkCatalog(root);
			const validation = validateProjectBenchmarkCatalog(catalog);
			expect(catalog.source).toBe("builtin");
			expect(validation.ok).toBe(true);
			expect(validation.project_count).toBeGreaterThan(1);
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

			const catalog = loadProjectBenchmarkCatalog(root);
			const validation = validateProjectBenchmarkCatalog(catalog);
			expect(catalog.source).toBe("project");
			expect(validation.ok).toBe(false);
			expect(validation.issues.map((issue) => issue.code)).toEqual(
				expect.arrayContaining(["missing-axes", "invalid-axes-schema-version"]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("project-benchmark command", () => {
	test("list, show, matrix, recommend, validate, and generate support json output", async () => {
		const root = createProjectRoot();
		try {
			const list = captureIo();
			expect(
				await runProjectBenchmarkCommand("list", ["--json"], root, list.io),
			).toBe(0);
			const listPayload = JSON.parse(list.stdout[0] ?? "{}") as {
				schema: string;
				action: string;
				data: {
					catalog_source: string;
					projects: Array<{
						id: string;
						score: number;
						overall_score: number;
						focused_score: number;
					}>;
				};
			};
			expect(listPayload.schema).toBe("afol.result/v1");
			expect(listPayload.action).toBe("project-benchmark.list");
			expect(listPayload.data.catalog_source).toBe("project");
			expect(listPayload.data.projects[0]?.id).toBe("aider");
			expect(listPayload.data.projects[0]?.score).toBe(80);
			expect(listPayload.data.projects[0]?.overall_score).toBe(80);
			expect(listPayload.data.projects[0]?.focused_score).toBe(80);

			const show = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"show",
					["aider", "--json"],
					root,
					show.io,
				),
			).toBe(0);
			const showPayload = JSON.parse(show.stdout[0] ?? "{}") as {
				action: string;
				data: {
					catalog_source: string;
					project: { id: string };
					score: {
						score: number;
						overall_score: number;
						focused_score: number;
					};
				};
			};
			expect(showPayload.action).toBe("project-benchmark.show");
			expect(showPayload.data.catalog_source).toBe("project");
			expect(showPayload.data.project.id).toBe("aider");
			expect(showPayload.data.score.score).toBe(80);
			expect(showPayload.data.score.overall_score).toBe(80);
			expect(showPayload.data.score.focused_score).toBe(80);

			const matrix = captureIo();
			expect(
				await runProjectBenchmarkCommand("matrix", ["--json"], root, matrix.io),
			).toBe(0);
			const matrixPayload = JSON.parse(matrix.stdout[0] ?? "{}") as {
				data: {
					catalog_source: string;
					generated_by: string;
					axis: string | null;
					projects: Array<{ axes: Record<string, number> }>;
				};
			};
			expect(matrixPayload.data.catalog_source).toBe("project");
			expect(matrixPayload.data.generated_by).toBe("afol pb matrix");
			expect(matrixPayload.data.axis).toBe(null);
			expect(matrixPayload.data.projects[0]?.axes.repo_context_map).toBe(5);

			const filteredMatrix = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"matrix",
					["--for", "repo_context_map", "--json"],
					root,
					filteredMatrix.io,
				),
			).toBe(0);
			const filteredMatrixPayload = JSON.parse(
				filteredMatrix.stdout[0] ?? "{}",
			) as {
				data: {
					axis: string;
					projects: Array<{ axes: Record<string, number> }>;
				};
			};
			expect(filteredMatrixPayload.data.axis).toBe("repo_context_map");
			expect(
				filteredMatrixPayload.data.projects[0]?.axes.repo_context_map,
			).toBe(5);

			const recommend = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"recommend",
					["--for", "repo_context_map", "--json"],
					root,
					recommend.io,
				),
			).toBe(0);
			const recommendPayload = JSON.parse(recommend.stdout[0] ?? "{}") as {
				data: {
					catalog_source: string;
					axis: string;
					top_references: Array<{
						id: string;
						axis_score: number;
						recommendation_score: number;
						risk_level: string;
						risk_flags: string[];
						warnings: string[];
						do_not_copy: string[];
					}>;
				};
			};
			expect(recommendPayload.data.catalog_source).toBe("project");
			expect(recommendPayload.data.axis).toBe("repo_context_map");
			expect(recommendPayload.data.top_references[0]?.id).toBe("aider");
			expect(recommendPayload.data.top_references[0]?.axis_score).toBe(5);
			expect(
				recommendPayload.data.top_references[0]?.recommendation_score,
			).toBe(100);
			expect(recommendPayload.data.top_references[0]?.risk_level).toBe("low");
			expect(recommendPayload.data.top_references[0]?.risk_flags).toEqual([]);
			expect(recommendPayload.data.top_references[0]?.warnings).toEqual([]);
			expect(recommendPayload.data.top_references[0]?.do_not_copy).toEqual([
				"Do not copy chat-only workflow assumptions.",
			]);

			const validate = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"validate",
					["--json"],
					root,
					validate.io,
				),
			).toBe(0);
			const validatePayload = JSON.parse(validate.stdout[0] ?? "{}") as {
				data: { catalog_source: string; ok: boolean; error_count: number };
			};
			expect(validatePayload.data.catalog_source).toBe("project");
			expect(validatePayload.data.ok).toBe(true);
			expect(validatePayload.data.error_count).toBe(0);

			const generate = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--json"],
					root,
					generate.io,
				),
			).toBe(0);
			const generatePayload = JSON.parse(generate.stdout[0] ?? "{}") as {
				action: string;
				data: {
					catalog_source: string;
					generated_by: string;
					mode: string;
					ok: boolean;
					files: Array<{ path: string; kind: string }>;
					changed_files: Array<{ path: string; kind: string }>;
				};
			};
			expect(generatePayload.action).toBe("project-benchmark.generate");
			expect(generatePayload.data.catalog_source).toBe("project");
			expect(generatePayload.data.generated_by).toBe("afol pb generate");
			expect(generatePayload.data.mode).toBe("write");
			expect(generatePayload.data.ok).toBe(true);
			expect(generatePayload.data.files.map((file) => file.kind)).toEqual([
				"index",
				"matrix",
				"summary",
				"validation",
			]);
			expect(generatePayload.data.changed_files).toHaveLength(4);
			expect(
				existsSync(join(root, ".afol", "data", "project-benchmarks")),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("list, matrix, recommend, validate, and generate render compact human output", async () => {
		const root = createProjectRoot();
		try {
			const list = captureIo();
			expect(await runProjectBenchmarkCommand("list", [], root, list.io)).toBe(
				0,
			);
			expect(list.stdout.join("\n")).toContain("project-benchmark: 1 projects");
			expect(list.stdout.join("\n")).toContain("aider");
			expect(list.stdout.join("\n")).toContain("overall=80 focused=80");

			const matrix = captureIo();
			expect(
				await runProjectBenchmarkCommand("matrix", [], root, matrix.io),
			).toBe(0);
			expect(matrix.stdout.join("\n")).toContain(
				"project-benchmark matrix: 1 projects",
			);
			expect(matrix.stdout.join("\n")).toContain("repo_context_map:5");
			expect(matrix.stdout.join("\n")).toContain("overall=80 focused=80");

			const filteredMatrix = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"matrix",
					["--for", "repo_context_map"],
					root,
					filteredMatrix.io,
				),
			).toBe(0);
			expect(filteredMatrix.stdout.join("\n")).toContain(
				"project-benchmark matrix: 1 projects axis=repo_context_map",
			);

			const recommend = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"recommend",
					["--for", "repo_context_map"],
					root,
					recommend.io,
				),
			).toBe(0);
			expect(recommend.stdout.join("\n")).toContain("axis: repo_context_map");
			expect(recommend.stdout.join("\n")).toContain("top references:");
			expect(recommend.stdout.join("\n")).toContain("recommendation=100");
			expect(recommend.stdout.join("\n")).toContain("risk=low");
			expect(recommend.stdout.join("\n")).toContain(
				"do_not_copy: Do not copy chat-only workflow assumptions.",
			);
			expect(recommend.stdout.join("\n")).toContain("recommendations:");

			const emptyRecommendation = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"recommend",
					["--for", "safe_mutation"],
					root,
					emptyRecommendation.io,
				),
			).toBe(0);
			expect(emptyRecommendation.stdout.join("\n")).toContain("- none");

			const validate = captureIo();
			expect(
				await runProjectBenchmarkCommand("validate", [], root, validate.io),
			).toBe(0);
			expect(validate.stdout.join("\n")).toContain(
				"project-benchmark validate: ok",
			);

			const generate = captureIo();
			expect(
				await runProjectBenchmarkCommand("generate", [], root, generate.io),
			).toBe(0);
			expect(generate.stdout.join("\n")).toContain(
				"project-benchmark generate: ok projects=1 files=4",
			);
			expect(generate.stdout.join("\n")).toContain("index.json");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("generate writes derived files under project-benchmark data only", async () => {
		const root = createProjectRoot();
		try {
			const generated = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--json"],
					root,
					generated.io,
				),
			).toBe(0);

			const dataDir = join(root, ".afol", "data", "project-benchmarks");
			const index = JSON.parse(
				readFileSync(join(dataDir, "index.json"), "utf8"),
			) as {
				generated_by: string;
				project_count: number;
				projects: Array<{
					id: string;
					score: number;
					overall_score: number;
					focused_score: number;
				}>;
			};
			const matrix = JSON.parse(
				readFileSync(join(dataDir, "similarity-matrix.json"), "utf8"),
			) as {
				generated_by: string;
				projects: Array<{ id: string; axes: Record<string, number> }>;
			};
			const validation = JSON.parse(
				readFileSync(join(dataDir, "validation-report.json"), "utf8"),
			) as { generated_by: string; ok: boolean };
			const summary = readFileSync(
				join(dataDir, "generated-summary.md"),
				"utf8",
			);

			expect(index.generated_by).toBe("afol pb generate");
			expect(index.project_count).toBe(1);
			expect(index.projects[0]).toMatchObject({
				id: "aider",
				score: 80,
				overall_score: 80,
				focused_score: 80,
			});
			expect(matrix.generated_by).toBe("afol pb generate");
			expect(matrix.projects[0]?.axes.repo_context_map).toBe(5);
			expect(validation).toMatchObject({
				generated_by: "afol pb generate",
				ok: true,
			});
			expect(summary).toContain("Generated by `afol pb generate`");
			expect(summary).toContain("overall=80 focused=80");
			expect(
				existsSync(join(root, ".afol", "data", "benchmarks", "catalog")),
			).toBe(false);

			const before = {
				index: readFileSync(join(dataDir, "index.json"), "utf8"),
				matrix: readFileSync(join(dataDir, "similarity-matrix.json"), "utf8"),
				summary: readFileSync(join(dataDir, "generated-summary.md"), "utf8"),
				validation: readFileSync(
					join(dataDir, "validation-report.json"),
					"utf8",
				),
			};
			const regenerated = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--json"],
					root,
					regenerated.io,
				),
			).toBe(0);
			expect(readFileSync(join(dataDir, "index.json"), "utf8")).toBe(
				before.index,
			);
			expect(
				readFileSync(join(dataDir, "similarity-matrix.json"), "utf8"),
			).toBe(before.matrix);
			expect(readFileSync(join(dataDir, "generated-summary.md"), "utf8")).toBe(
				before.summary,
			);
			expect(
				readFileSync(join(dataDir, "validation-report.json"), "utf8"),
			).toBe(before.validation);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("strict validate rejects missing source-ref axes and matrix command fails", async () => {
		const root = createProjectRoot();
		try {
			const raw = readProject(root);
			raw.source_refs = [
				{
					...(raw.source_refs?.[0] as Record<string, unknown>),
				},
			];
			delete (raw.source_refs[0] as Record<string, unknown>).axes;
			writeJson(projectPath(root), raw);
			addProjectCopy(root, "bbb", 4, "Second reference for matrix sorting.");

			const validate = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"validate",
					["--json"],
					root,
					validate.io,
				),
			).toBe(1);
			const validation = JSON.parse(validate.stdout[0] ?? "{}");
			expect(validation.data.ok).toBe(false);
			expect(
				validation.data.issues.map((issue: { code: string }) => issue.code),
			).toContain("missing-source-ref-axes");

			const matrix = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"matrix",
					["--for", "repo_context_map", "--json"],
					root,
					matrix.io,
				),
			).toBe(1);
			const matrixPayload = JSON.parse(matrix.stdout[0] ?? "{}") as {
				ok: boolean;
				error: { code: string };
				data: { issues: { code: string }[] };
			};
			expect(matrixPayload.ok).toBe(false);
			expect(matrixPayload.error.code).toBe(
				"invalid-project-benchmark-catalog",
			);
			expect(
				matrixPayload.data.issues.map((issue: { code: string }) => issue.code),
			).toContain("missing-source-ref-axes");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("generate check rejects misplaced generated outputs outside project-benchmark data", async () => {
		const root = createProjectRoot();
		try {
			const generated = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--json"],
					root,
					generated.io,
				),
			).toBe(0);

			const dataDir = join(root, ".afol", "data", "project-benchmarks");
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
				"copied-index.json",
			);
			mkdirSync(
				join(root, ".afol", "data", "benchmarks", "catalog", "scenarios"),
				{
					recursive: true,
				},
			);
			writeFileSync(
				catalogCopy,
				readFileSync(join(dataDir, "generated-summary.md"), "utf8"),
				"utf8",
			);
			writeFileSync(
				runtimeCopy,
				readFileSync(join(dataDir, "index.json"), "utf8"),
				"utf8",
			);

			const check = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--check", "--json"],
					root,
					check.io,
				),
			).toBe(1);
			const payload = JSON.parse(check.stdout[0] ?? "{}") as {
				ok: boolean;
				error: { code: string };
				data: {
					ok: boolean;
					misplaced_files: Array<{ path: string; location: string }>;
					changed_files: Array<{ path: string }>;
				};
			};
			expect(payload.ok).toBe(false);
			expect(payload.error.code).toBe("generated-output-misplaced");
			expect(payload.data.ok).toBe(false);
			expect(payload.data.changed_files).toHaveLength(0);
			expect(payload.data.misplaced_files).toEqual(
				expect.arrayContaining([
					{
						path: ".afol/adm/project-benchmarks/generated-summary.md",
						location: "catalog",
					},
					{
						path: ".afol/data/benchmarks/catalog/scenarios/copied-index.json",
						location: "runtime-benchmark-catalog",
					},
				]),
			);

			const rewrite = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--json"],
					root,
					rewrite.io,
				),
			).toBe(1);
			expect(JSON.parse(rewrite.stdout[0] ?? "{}").error.code).toBe(
				"generated-output-misplaced",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validate strict fails on warnings and generate check stays non-mutating", async () => {
		const root = createProjectRoot();
		try {
			const raw = readProject(root);
			raw.source_access = "docs_only";
			raw.confidence = "high";
			writeJson(projectPath(root), raw);

			const validate = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"validate",
					["--json"],
					root,
					validate.io,
				),
			).toBe(0);
			const validatePayload = JSON.parse(validate.stdout[0] ?? "{}") as {
				ok: boolean;
				data: { ok: boolean; strict: boolean; warning_count: number };
			};
			expect(validatePayload.ok).toBe(true);
			expect(validatePayload.data.ok).toBe(true);
			expect(validatePayload.data.strict).toBe(false);
			expect(validatePayload.data.warning_count).toBe(1);

			const strict = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"validate",
					["--strict", "--json"],
					root,
					strict.io,
				),
			).toBe(1);
			const strictPayload = JSON.parse(strict.stdout[0] ?? "{}") as {
				ok: boolean;
				error: { code: string };
				data: { ok: boolean; strict: boolean; warning_count: number };
			};
			expect(strictPayload.ok).toBe(false);
			expect(strictPayload.error.code).toBe(
				"project-benchmark-validation-warning",
			);
			expect(strictPayload.data.ok).toBe(false);
			expect(strictPayload.data.strict).toBe(true);
			expect(strictPayload.data.warning_count).toBe(1);

			const strictText = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"validate",
					["--strict"],
					root,
					strictText.io,
				),
			).toBe(1);
			expect(strictText.stdout.join("\n")).toContain("warning ");
			expect(strictText.stdout.join("\n")).toContain(
				"docs-only-high-confidence",
			);

			const check = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--check", "--json"],
					root,
					check.io,
				),
			).toBe(1);
			const checkPayload = JSON.parse(check.stdout[0] ?? "{}") as {
				ok: boolean;
				error: { code: string };
				data: {
					mode: string;
					ok: boolean;
					changed_files: Array<{ kind: string }>;
				};
			};
			expect(checkPayload.ok).toBe(false);
			expect(checkPayload.error.code).toBe("generated-output-stale");
			expect(checkPayload.data.mode).toBe("check");
			expect(checkPayload.data.ok).toBe(false);
			expect(checkPayload.data.changed_files).toHaveLength(4);
			expect(
				existsSync(join(root, ".afol", "data", "project-benchmarks")),
			).toBe(false);

			const generated = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--json"],
					root,
					generated.io,
				),
			).toBe(0);

			const cleanCheck = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--check", "--json"],
					root,
					cleanCheck.io,
				),
			).toBe(0);
			const cleanCheckPayload = JSON.parse(cleanCheck.stdout[0] ?? "{}") as {
				ok: boolean;
				data: {
					mode: string;
					ok: boolean;
					changed_files: Array<{ kind: string }>;
				};
			};
			expect(cleanCheckPayload.ok).toBe(true);
			expect(cleanCheckPayload.data.mode).toBe("check");
			expect(cleanCheckPayload.data.ok).toBe(true);
			expect(cleanCheckPayload.data.changed_files).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("generate mutation is approval-gated for restricted callers but check is allowed", async () => {
		const root = createProjectRoot();
		try {
			const denied = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--json"],
					root,
					denied.io,
					agentOperationContext(),
				),
			).toBe(2);
			const deniedPayload = JSON.parse(denied.stdout[0] ?? "{}") as {
				ok: boolean;
				error: { code: string };
			};
			expect(deniedPayload.ok).toBe(false);
			expect(deniedPayload.error.code).toBe("approval-required");
			expect(
				existsSync(join(root, ".afol", "data", "project-benchmarks")),
			).toBe(false);

			const check = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--check", "--json"],
					root,
					check.io,
					agentOperationContext(),
				),
			).toBe(1);
			expect(JSON.parse(check.stdout[0] ?? "{}").error.code).toBe(
				"generated-output-stale",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("sorts scored outputs by overall score then focused score and id", async () => {
		const root = createProjectRoot();
		try {
			addProjectCopy(root, "bbb", 5, "Same score second id.");
			addProjectCopy(root, "zzz", 1, "Lower score.");

			const matrix = captureIo();
			expect(
				await runProjectBenchmarkCommand("matrix", ["--json"], root, matrix.io),
			).toBe(0);
			const payload = JSON.parse(matrix.stdout[0] ?? "{}") as {
				data: { projects: Array<{ id: string }> };
			};
			expect(payload.data.projects.map((project) => project.id)).toEqual([
				"aider",
				"bbb",
				"zzz",
			]);

			const filteredMatrix = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"matrix",
					["--for", "repo_context_map", "--json"],
					root,
					filteredMatrix.io,
				),
			).toBe(0);
			const filteredPayload = JSON.parse(filteredMatrix.stdout[0] ?? "{}") as {
				data: { projects: Array<{ id: string }> };
			};
			expect(
				filteredPayload.data.projects.map((project) => project.id),
			).toEqual(["aider", "bbb", "zzz"]);

			const list = captureIo();
			expect(
				await runProjectBenchmarkCommand("list", ["--json"], root, list.io),
			).toBe(0);
			const listPayload = JSON.parse(list.stdout[0] ?? "{}") as {
				data: { projects: Array<{ id: string }> };
			};
			expect(listPayload.data.projects.map((project) => project.id)).toEqual([
				"aider",
				"bbb",
				"zzz",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses overall score to avoid overranking narrow project coverage", async () => {
		const root = createProjectRoot();
		try {
			writeJson(axesPath(root), {
				schema_version: "1.0.0",
				axes: {
					repo_context_map: {
						weight: 15,
						description: "Uses compact repository maps or context ranking",
					},
					safe_mutation: {
						weight: 15,
						description: "Controls edits and approvals",
					},
					agent_runtime: {
						weight: 15,
						description: "Supports agent runtime lifecycle.",
					},
				},
			});
			const broad = readProject(root);
			broad.id = "broad";
			broad.name = "Broad";
			broad.source_refs = [
				{
					...(broad.source_refs?.[0] as Record<string, unknown>),
					axes: ["repo_context_map", "safe_mutation", "agent_runtime"],
				},
			];
			broad.similarity_axes = {
				repo_context_map: { score: 4, evidence_refs: ["aider-repomap"] },
				safe_mutation: { score: 4, evidence_refs: ["aider-repomap"] },
				agent_runtime: { score: 4, evidence_refs: ["aider-repomap"] },
			};
			broad.lessons_for_afol = [
				{
					axis: "agent_runtime",
					lesson: "Cover the runtime lifecycle explicitly.",
				},
			];
			writeJson(projectPath(root, "broad"), broad);

			const list = captureIo();
			expect(
				await runProjectBenchmarkCommand("list", ["--json"], root, list.io),
			).toBe(0);
			const payload = JSON.parse(list.stdout[0] ?? "{}") as {
				data: {
					projects: Array<{
						id: string;
						overall_score: number;
						focused_score: number;
					}>;
				};
			};
			expect(payload.data.projects.map((project) => project.id)).toEqual([
				"broad",
				"aider",
			]);
			expect(payload.data.projects[0]).toMatchObject({
				id: "broad",
				overall_score: 80,
				focused_score: 80,
			});
			expect(payload.data.projects[1]).toMatchObject({
				id: "aider",
				overall_score: 53,
				focused_score: 80,
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("recommendations penalize stale and weaker evidence even with high axis score", async () => {
		const root = createProjectRoot();
		try {
			const weakHighScore = readProject(root);
			weakHighScore.source_access = "closed_source";
			weakHighScore.confidence = "low";
			weakHighScore.last_reviewed_at = "2020-01-01";
			writeJson(projectPath(root), weakHighScore);
			addProjectCopy(root, "open", 4, "Prefer open high-confidence evidence.");
			const openReference = readProject(root, "open");
			openReference.source_access = "open_source";
			openReference.confidence = "high";
			openReference.last_reviewed_at = "2026-06-16";
			writeJson(projectPath(root, "open"), openReference);
			addProjectCopy(root, "adjacent", 5, "Use only as an adjacent pattern.");
			const adjacentReference = readProject(root, "adjacent");
			adjacentReference.category = "adjacent_reference";
			adjacentReference.source_access = "open_source";
			adjacentReference.confidence = "high";
			adjacentReference.last_reviewed_at = "2026-06-16";
			writeJson(projectPath(root, "adjacent"), adjacentReference);

			const recommend = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"recommend",
					["--for", "repo_context_map", "--json"],
					root,
					recommend.io,
				),
			).toBe(0);
			const payload = JSON.parse(recommend.stdout[0] ?? "{}") as {
				data: {
					top_references: Array<{
						id: string;
						axis_score: number;
						recommendation_score: number;
						risk_level: string;
						risk_flags: string[];
						warnings: string[];
						do_not_copy: string[];
					}>;
				};
			};
			expect(payload.data.top_references[0]).toMatchObject({
				id: "open",
				axis_score: 4,
				recommendation_score: 80,
				risk_level: "low",
			});
			const adjacent = payload.data.top_references.find(
				(entry) => entry.id === "adjacent",
			);
			expect(adjacent).toMatchObject({
				axis_score: 5,
				recommendation_score: 80,
				risk_level: "medium",
			});
			expect(adjacent?.risk_flags).toContain("adjacent_reference");
			const weakReference = payload.data.top_references.find(
				(entry) => entry.id === "aider",
			);
			expect(weakReference?.axis_score).toBe(5);
			expect(weakReference?.recommendation_score).toBeLessThan(80);
			expect(weakReference?.risk_level).toBe("high");
			expect(weakReference?.risk_flags).toEqual(
				expect.arrayContaining(["stale", "low_confidence", "closed_source"]),
			);
			expect(weakReference?.warnings).toEqual(
				expect.arrayContaining([
					"stale",
					"confidence=low",
					"source_access=closed_source",
				]),
			);
			expect(weakReference?.do_not_copy).toEqual([
				"Do not copy chat-only workflow assumptions.",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("show returns a compact text summary and structured not-found error", async () => {
		const root = createProjectRoot();
		try {
			const text = captureIo();
			expect(
				await runProjectBenchmarkCommand("show", ["aider"], root, text.io),
			).toBe(0);
			expect(text.stdout.join("\n")).toContain("aider: Aider");
			expect(text.stdout.join("\n")).toContain("overall=80 focused=80");

			const byName = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"show",
					["Aider", "--json"],
					root,
					byName.io,
				),
			).toBe(0);
			expect(JSON.parse(byName.stdout[0] ?? "{}").data.project.id).toBe(
				"aider",
			);

			const missing = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"show",
					["missing", "--json"],
					root,
					missing.io,
				),
			).toBe(1);
			const payload = JSON.parse(missing.stdout[0] ?? "{}") as {
				ok: boolean;
				error: { code: string };
			};
			expect(payload.ok).toBe(false);
			expect(payload.error.code).toBe("project-not-found");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns compact errors for invalid arguments and unknown actions", async () => {
		const root = createProjectRoot();
		try {
			const missingShowId = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"show",
					["--json"],
					root,
					missingShowId.io,
				),
			).toBe(2);
			expect(JSON.parse(missingShowId.stdout[0] ?? "{}").error.code).toBe(
				"invalid-arguments",
			);

			const missingAxis = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"recommend",
					["--json"],
					root,
					missingAxis.io,
				),
			).toBe(2);
			expect(JSON.parse(missingAxis.stdout[0] ?? "{}").error.code).toBe(
				"invalid-arguments",
			);

			const invalidListArg = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"list",
					["--bad", "--json"],
					root,
					invalidListArg.io,
				),
			).toBe(2);
			expect(JSON.parse(invalidListArg.stdout[0] ?? "{}").error.code).toBe(
				"invalid-arguments",
			);

			const unknownAction = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"unknown",
					["--json"],
					root,
					unknownAction.io,
				),
			).toBe(2);
			expect(JSON.parse(unknownAction.stdout[0] ?? "{}").error.code).toBe(
				"unknown-action",
			);

			const humanInvalidArg = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"list",
					["--bad"],
					root,
					humanInvalidArg.io,
				),
			).toBe(2);
			expect(humanInvalidArg.stderr.join("\n")).toContain(
				"err invalid-arguments",
			);

			const humanUnknownAction = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"unknown",
					[],
					root,
					humanUnknownAction.io,
				),
			).toBe(2);
			expect(humanUnknownAction.stderr.join("\n")).toContain(
				"err unknown-action",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects unknown recommendation axes and invalid catalogs before reads", async () => {
		const root = createProjectRoot();
		try {
			const unknownAxis = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"recommend",
					["--for", "missing_axis", "--json"],
					root,
					unknownAxis.io,
				),
			).toBe(1);
			const unknownAxisPayload = JSON.parse(unknownAxis.stdout[0] ?? "{}") as {
				error: { code: string };
				data: { catalog_source: string };
			};
			expect(unknownAxisPayload.error.code).toBe("unknown-axis");
			expect(unknownAxisPayload.data.catalog_source).toBe("project");

			const unknownMatrixAxis = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"matrix",
					["--for", "missing_axis", "--json"],
					root,
					unknownMatrixAxis.io,
				),
			).toBe(1);
			const unknownMatrixPayload = JSON.parse(
				unknownMatrixAxis.stdout[0] ?? "{}",
			) as { error: { code: string }; data: { catalog_source: string } };
			expect(unknownMatrixPayload.error.code).toBe("unknown-axis");
			expect(unknownMatrixPayload.data.catalog_source).toBe("project");

			const raw = readProject(root);
			raw.source_refs = [];
			raw.similarity_axes = {};
			raw.similarities = [];
			raw.differences = [];
			raw.lessons_for_afol = [];
			raw.do_not_copy = [];
			writeJson(projectPath(root), raw);

			const list = captureIo();
			expect(
				await runProjectBenchmarkCommand("list", ["--json"], root, list.io),
			).toBe(1);
			const listPayload = JSON.parse(list.stdout[0] ?? "{}") as {
				error: { code: string };
				data: { issues: Array<{ code: string }> };
			};
			expect(listPayload.error.code).toBe("invalid-project-benchmark-catalog");
			expect(listPayload.data.issues.length).toBeGreaterThan(5);
			expect(listPayload.data.issues.map((issue) => issue.code)).toEqual(
				expect.arrayContaining([
					"empty-similarity-axes",
					"missing-source-refs",
					"missing-similarities",
					"missing-differences",
					"missing-lessons",
					"missing-do-not-copy",
				]),
			);

			const validate = captureIo();
			expect(
				await runProjectBenchmarkCommand("validate", [], root, validate.io),
			).toBe(1);
			expect(validate.stdout.join("\n")).toContain(
				"project-benchmark validate: failed",
			);
			expect(validate.stdout.join("\n")).toContain("missing-source-refs");

			const validateJson = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"validate",
					["--json"],
					root,
					validateJson.io,
				),
			).toBe(1);
			const payload = JSON.parse(validateJson.stdout[0] ?? "{}") as {
				ok: boolean;
				exit_code: number;
				error: { code: string };
				data: { ok: boolean; error_count: number };
			};
			expect(payload.ok).toBe(false);
			expect(payload.exit_code).toBe(1);
			expect(payload.error.code).toBe("invalid-project-benchmark-catalog");
			expect(payload.data.ok).toBe(false);
			expect(payload.data.error_count).toBeGreaterThan(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses builtin catalog when downstream repo only has an empty project-benchmark dir", async () => {
		const root = createProjectRoot();
		try {
			rmSync(join(root, ".afol", "adm", "project-benchmarks", "axes.json"), {
				force: true,
			});
			rmSync(join(root, ".afol", "adm", "project-benchmarks", "schema.json"), {
				force: true,
			});
			rmSync(join(root, ".afol", "adm", "project-benchmarks", "projects"), {
				recursive: true,
				force: true,
			});

			const validate = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"validate",
					["--json"],
					root,
					validate.io,
				),
			).toBe(0);
			const validatePayload = JSON.parse(validate.stdout[0] ?? "{}") as {
				data: {
					catalog_source: string;
					ok: boolean;
					project_count: number;
				};
			};
			expect(validatePayload.data.catalog_source).toBe("builtin");
			expect(validatePayload.data.ok).toBe(true);
			expect(validatePayload.data.project_count).toBeGreaterThan(1);

			const list = captureIo();
			expect(
				await runProjectBenchmarkCommand("list", ["--json"], root, list.io),
			).toBe(0);
			const listPayload = JSON.parse(list.stdout[0] ?? "{}") as {
				data: { catalog_source: string; projects: Array<{ id: string }> };
			};
			expect(listPayload.data.catalog_source).toBe("builtin");
			expect(listPayload.data.projects.length).toBeGreaterThan(1);
			expect(listPayload.data.projects.map((project) => project.id)).toContain(
				"aider",
			);

			const generate = captureIo();
			expect(
				await runProjectBenchmarkCommand(
					"generate",
					["--check", "--json"],
					root,
					generate.io,
				),
			).toBe(1);
			const generatePayload = JSON.parse(generate.stdout[0] ?? "{}") as {
				data: { catalog_source: string };
				error: { code: string };
			};
			expect(generatePayload.data.catalog_source).toBe("builtin");
			expect(generatePayload.error.code).toBe("generated-output-stale");

			const validateText = captureIo();
			expect(
				await runProjectBenchmarkCommand("validate", [], root, validateText.io),
			).toBe(0);
			expect(validateText.stdout.join("\n")).toContain(
				"project-benchmark validate: ok",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses default console io when no command io is supplied", async () => {
		const root = createProjectRoot();
		const logs: string[] = [];
		const errors: string[] = [];
		const originalLog = console.log;
		const originalError = console.error;
		console.log = (message?: unknown) => {
			logs.push(String(message));
		};
		console.error = (message?: unknown) => {
			errors.push(String(message));
		};
		try {
			expect(await runProjectBenchmarkCommand("list", ["--json"], root)).toBe(
				0,
			);
			expect(logs.join("\n")).toContain("project-benchmark.list");

			expect(await runProjectBenchmarkCommand("unknown", [], root)).toBe(2);
			expect(errors.join("\n")).toContain("err unknown-action");
		} finally {
			console.log = originalLog;
			console.error = originalError;
			rmSync(root, { recursive: true, force: true });
		}
	});
});
