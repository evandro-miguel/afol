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

function readProject(root: string, id = "aider"): Record<string, unknown> {
	return JSON.parse(readFileSync(projectPath(root, id), "utf8")) as Record<
		string,
		unknown
	>;
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

	test("reports missing catalog files and project directory", () => {
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

			expect(issueCodes(root)).toEqual(
				expect.arrayContaining([
					"missing-axes",
					"missing-schema",
					"missing-projects-dir",
					"invalid-axes-schema-version",
				]),
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
				data: { projects: Array<{ id: string; score: number }> };
			};
			expect(listPayload.schema).toBe("afol.result/v1");
			expect(listPayload.action).toBe("project-benchmark.list");
			expect(listPayload.data.projects[0]?.id).toBe("aider");
			expect(listPayload.data.projects[0]?.score).toBe(80);

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
				data: { project: { id: string }; score: { score: number } };
			};
			expect(showPayload.action).toBe("project-benchmark.show");
			expect(showPayload.data.project.id).toBe("aider");
			expect(showPayload.data.score.score).toBe(80);

			const matrix = captureIo();
			expect(
				await runProjectBenchmarkCommand("matrix", ["--json"], root, matrix.io),
			).toBe(0);
			const matrixPayload = JSON.parse(matrix.stdout[0] ?? "{}") as {
				data: {
					generated_by: string;
					projects: Array<{ axes: Record<string, number> }>;
				};
			};
			expect(matrixPayload.data.generated_by).toBe("afol pb matrix");
			expect(matrixPayload.data.projects[0]?.axes.repo_context_map).toBe(5);

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
				data: { axis: string; top_references: Array<{ id: string }> };
			};
			expect(recommendPayload.data.axis).toBe("repo_context_map");
			expect(recommendPayload.data.top_references[0]?.id).toBe("aider");

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
				data: { ok: boolean; error_count: number };
			};
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
					generated_by: string;
					files: Array<{ path: string; kind: string }>;
				};
			};
			expect(generatePayload.action).toBe("project-benchmark.generate");
			expect(generatePayload.data.generated_by).toBe("afol pb generate");
			expect(generatePayload.data.files.map((file) => file.kind)).toEqual([
				"index",
				"matrix",
				"summary",
				"validation",
			]);
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

			const matrix = captureIo();
			expect(
				await runProjectBenchmarkCommand("matrix", [], root, matrix.io),
			).toBe(0);
			expect(matrix.stdout.join("\n")).toContain(
				"project-benchmark matrix: 1 projects",
			);
			expect(matrix.stdout.join("\n")).toContain("repo_context_map:5");

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
				projects: Array<{ id: string; score: number }>;
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
			expect(index.projects[0]).toMatchObject({ id: "aider", score: 80 });
			expect(matrix.generated_by).toBe("afol pb generate");
			expect(matrix.projects[0]?.axes.repo_context_map).toBe(5);
			expect(validation).toMatchObject({
				generated_by: "afol pb generate",
				ok: true,
			});
			expect(summary).toContain("Generated by `afol pb generate`");
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

	test("sorts scored outputs by score then id", async () => {
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

	test("show returns a compact text summary and structured not-found error", async () => {
		const root = createProjectRoot();
		try {
			const text = captureIo();
			expect(
				await runProjectBenchmarkCommand("show", ["aider"], root, text.io),
			).toBe(0);
			expect(text.stdout.join("\n")).toContain("aider: Aider");
			expect(text.stdout.join("\n")).toContain("score=80");

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
			expect(JSON.parse(unknownAxis.stdout[0] ?? "{}").error.code).toBe(
				"unknown-axis",
			);

			const raw = readProject(root);
			raw.source_refs = [];
			writeJson(projectPath(root), raw);

			const list = captureIo();
			expect(
				await runProjectBenchmarkCommand("list", ["--json"], root, list.io),
			).toBe(1);
			expect(JSON.parse(list.stdout[0] ?? "{}").error.code).toBe(
				"invalid-project-benchmark-catalog",
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
