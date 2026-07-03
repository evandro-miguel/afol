import {
	envelopeErr,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { loadProjectBenchmarkCatalog } from "../services/project-benchmark/catalog";
import {
	findProjectBenchmarkMisplacedOutputs,
	generateProjectBenchmarkOutputs,
} from "../services/project-benchmark/generate";
import { buildProjectBenchmarkMatrix } from "../services/project-benchmark/matrix";
import {
	formatProjectBenchmarkGeneration,
	formatProjectBenchmarkList,
	formatProjectBenchmarkMatrix,
	formatProjectBenchmarkRecommend,
	formatProjectBenchmarkShow,
	formatProjectBenchmarkValidation,
} from "../services/project-benchmark/render";
import {
	compareProjectBenchmarkScores,
	rankProjectBenchmarkRecommendations,
	scoreProjectBenchmark,
	scoreProjectBenchmarks,
} from "../services/project-benchmark/scoring";
import type {
	ProjectBenchmarkAxesFile,
	ProjectBenchmarkIssue,
	ProjectBenchmarkProject,
} from "../services/project-benchmark/types";
import { validateProjectBenchmarkCatalog } from "../services/project-benchmark/validate";
import { type CommandIo, createJsonWriters, DEFAULT_IO } from "./io";

type ParsedArgs = {
	json: boolean;
	id: string | null;
	axis: string | null;
	check: boolean;
	strict: boolean;
};

type ProjectBenchmarkCatalogSource = ReturnType<
	typeof loadProjectBenchmarkCatalog
>["source"];

type ValidProjectBenchmarkCatalog = {
	ok: true;
	catalog: ReturnType<typeof loadProjectBenchmarkCatalog>;
	axes: ProjectBenchmarkAxesFile;
	projects: ProjectBenchmarkProject[];
	validation: ReturnType<typeof validateProjectBenchmarkCatalog>;
};

type InvalidProjectBenchmarkCatalog = {
	ok: false;
	error: ProjectBenchmarkCatalogError;
};

type ProjectBenchmarkCatalogResolution =
	| ValidProjectBenchmarkCatalog
	| InvalidProjectBenchmarkCatalog;

class ProjectBenchmarkCatalogError extends Error {
	readonly issues: ProjectBenchmarkIssue[];

	constructor(message: string, issues: ProjectBenchmarkIssue[]) {
		super(message);
		this.name = "ProjectBenchmarkCatalogError";
		this.issues = issues;
	}
}

const jsonWriters = createJsonWriters("project-benchmark");

function parseArgs(action: string, args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		json: false,
		id: null,
		axis: null,
		check: false,
		strict: false,
	};

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (!value) {
			continue;
		}
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (action === "generate" && value === "--check") {
			parsed.check = true;
			continue;
		}
		if (action === "validate" && value === "--strict") {
			parsed.strict = true;
			continue;
		}
		if ((action === "recommend" || action === "matrix") && value === "--for") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error(`Missing value for --for in pb ${action}.`);
			}
			parsed.axis = next;
			index += 1;
			continue;
		}
		if (action === "show" && !value.startsWith("-") && !parsed.id) {
			parsed.id = value;
			continue;
		}
		throw new Error(`Unknown project-benchmark argument: ${value}`);
	}

	if (action === "show" && !parsed.id) {
		throw new Error("Missing project id for pb show.");
	}
	if (action === "recommend" && !parsed.axis) {
		throw new Error("Missing --for <axis> for pb recommend.");
	}

	return parsed;
}

function projectList(
	catalogProjects: ProjectBenchmarkProject[],
): ProjectBenchmarkProject[] {
	return [...catalogProjects].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
}

function normalizeProjectLookup(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function findProjectByIdOrName(
	projects: ProjectBenchmarkProject[],
	idOrName: string,
): ProjectBenchmarkProject | undefined {
	const exactId = projects.find((entry) => entry.id === idOrName);
	if (exactId) {
		return exactId;
	}
	const lookup = normalizeProjectLookup(idOrName);
	return projects.find(
		(entry) =>
			normalizeProjectLookup(entry.id) === lookup ||
			normalizeProjectLookup(entry.name) === lookup,
	);
}

function requireValidCatalog(
	catalog: ReturnType<typeof loadProjectBenchmarkCatalog>,
): ProjectBenchmarkCatalogResolution {
	const validation = validateProjectBenchmarkCatalog(catalog);
	if (!catalog.axes) {
		return {
			ok: false,
			error: new ProjectBenchmarkCatalogError(
				"project-benchmark catalog is missing axes.json",
				validation.issues,
			),
		};
	}
	if (!validation.ok) {
		return {
			ok: false,
			error: new ProjectBenchmarkCatalogError(
				"project-benchmark catalog validation failed",
				validation.issues,
			),
		};
	}
	return {
		ok: true,
		catalog,
		axes: catalog.axes,
		projects: projectList(catalog.projects.map((entry) => entry.project)),
		validation,
	};
}

function writeValidationJson(
	io: CommandIo,
	data: Record<string, unknown>,
	ok: boolean,
	error: {
		code: string;
		message: string;
	} | null = null,
): void {
	const envelope: ResultEnvelope<Record<string, unknown>> = {
		schema: "afol.result/v1",
		ok,
		action: "project-benchmark.validate",
		exit_code: ok ? 0 : 1,
		data,
	};
	if (!ok && error) {
		envelope.error = error;
	}
	io.stdout(stringifyEnvelope(envelope));
}

function withCatalogSource<T extends Record<string, unknown>>(
	data: T,
	catalogSource: ProjectBenchmarkCatalogSource,
): T & { catalog_source: ProjectBenchmarkCatalogSource } {
	return {
		...data,
		catalog_source: catalogSource,
	};
}

function writeGenerateJson(
	io: CommandIo,
	data: Record<string, unknown>,
	ok: boolean,
): void {
	const misplacedFiles = Array.isArray(data.misplaced_files)
		? data.misplaced_files
		: [];
	const envelope: ResultEnvelope<Record<string, unknown>> = {
		schema: "afol.result/v1",
		ok,
		action: "project-benchmark.generate",
		exit_code: ok ? 0 : 1,
		data,
	};
	if (!ok) {
		envelope.error = {
			code:
				misplacedFiles.length > 0
					? "generated-output-misplaced"
					: "generated-output-stale",
			message:
				misplacedFiles.length > 0
					? "project-benchmark generated outputs are outside .afol/data/project-benchmarks"
					: "project-benchmark generated outputs are out of date",
		};
	}
	io.stdout(stringifyEnvelope(envelope));
}

function projectBenchmarkGenerateFailureData(
	projectRoot: string,
	dataDir: string,
	check: boolean,
	misplacedFiles: ReturnType<typeof findProjectBenchmarkMisplacedOutputs>,
	projectCount: number,
): Record<string, unknown> {
	return {
		schema_version: "1.0.0",
		command: "project-benchmark.generate",
		generated_by: "afol pb generate",
		mode: check ? "check" : "write",
		ok: false,
		generated_at: new Date().toISOString(),
		data_dir: dataDir.replace(`${projectRoot}/`, ""),
		files: [],
		changed_files: [],
		misplaced_files: misplacedFiles,
		project_count: projectCount,
	};
}

function writeActionError(
	io: CommandIo,
	action: string,
	code: string,
	message: string,
	exitCode: 1 | 2,
	data?: Record<string, unknown>,
): void {
	const envelope: ResultEnvelope<Record<string, unknown>> = {
		schema: "afol.result/v1",
		ok: false,
		action: `project-benchmark.${action}`,
		exit_code: exitCode,
		error: { code, message },
	};
	if (data) {
		envelope.data = data;
	}
	io.stdout(stringifyEnvelope(envelope));
}

export async function runProjectBenchmarkCommand(
	actionInput: string,
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	const action = actionInput || "list";
	let parsed: ParsedArgs;
	try {
		parsed = parseArgs(action, args);
	} catch (error) {
		const message = (error as Error).message;
		if (args.includes("--json") || args.includes("-j")) {
			writeActionError(io, action, "invalid-arguments", message, 2);
		} else {
			io.stderr(`err invalid-arguments ${message}`);
		}
		return 2;
	}

	const rawCatalog = loadProjectBenchmarkCatalog(projectRoot);
	const sourceCatalog = rawCatalog;

	if (action === "validate") {
		const validation = validateProjectBenchmarkCatalog(rawCatalog);
		const ok =
			validation.ok && (!parsed.strict || validation.warning_count === 0);
		const error = ok
			? null
			: validation.ok
				? {
						code: "project-benchmark-validation-warning",
						message: "project-benchmark validation strict mode failed",
					}
				: {
						code: "invalid-project-benchmark-catalog",
						message: "project-benchmark catalog validation failed",
					};
		const data = {
			schema_version: "1.0.0",
			command: "project-benchmark.validate",
			catalog_source: rawCatalog.source,
			ok,
			strict: parsed.strict,
			issues: validation.issues,
			error_count: validation.error_count,
			warning_count: validation.warning_count,
			project_count: validation.project_count,
		};
		if (parsed.json) {
			writeValidationJson(io, data, ok, error);
		} else {
			io.stdout(formatProjectBenchmarkValidation({ ...validation, ok }));
		}
		return ok ? 0 : 1;
	}

	if (action === "generate") {
		if (!parsed.check && requiresApproval(ctx)) {
			const message =
				"project-benchmark generate requires local interactive approval";
			if (parsed.json) {
				writeActionError(io, action, "approval-required", message, 2);
			} else {
				io.stderr(`err approval-required ${message}`);
			}
			return 2;
		}

		const misplacedFiles = findProjectBenchmarkMisplacedOutputs(projectRoot, {
			catalogDir: sourceCatalog.paths.admDir,
			runtimeBenchmarkCatalogDir:
				sourceCatalog.paths.runtimeBenchmarkCatalogDir,
		});
		if (misplacedFiles.length > 0) {
			if (parsed.json) {
				writeGenerateJson(
					io,
					withCatalogSource(
						projectBenchmarkGenerateFailureData(
							projectRoot,
							sourceCatalog.paths.dataDir,
							parsed.check,
							misplacedFiles,
							sourceCatalog.projects.length,
						),
						sourceCatalog.source,
					),
					false,
				);
			} else if (parsed.check) {
				io.stdout(
					[
						`project-benchmark generate: check failed misplaced=${misplacedFiles.length}`,
						...misplacedFiles.map((file) => `${file.location}: ${file.path}`),
					].join("\n"),
				);
			} else {
				io.stderr(
					[
						`err generated-output-misplaced count=${misplacedFiles.length}`,
						...misplacedFiles.map((file) => `${file.location}: ${file.path}`),
					].join("\n"),
				);
			}
			return 1;
		}
	}

	const catalog = requireValidCatalog(sourceCatalog);
	if (!catalog.ok) {
		const { error } = catalog;
		if (parsed.json) {
			writeActionError(
				io,
				action,
				"invalid-project-benchmark-catalog",
				error.message,
				1,
				error.issues.length > 0
					? { catalog_source: sourceCatalog.source, issues: error.issues }
					: { catalog_source: sourceCatalog.source },
			);
		} else {
			io.stderr(`err invalid-project-benchmark-catalog ${error.message}`);
		}
		return 1;
	}

	if (action === "list") {
		const scores = scoreProjectBenchmarks(catalog.projects, catalog.axes);
		const data = {
			schema_version: "1.0.0",
			command: "project-benchmark.list",
			catalog_source: catalog.catalog.source,
			projects: scores,
		};
		if (parsed.json) {
			jsonWriters.ok(io, "list", data);
		} else {
			io.stdout(formatProjectBenchmarkList(scores));
		}
		return 0;
	}

	if (action === "show") {
		const project = findProjectByIdOrName(
			catalog.projects,
			parsed.id as string,
		);
		if (!project) {
			if (parsed.json) {
				io.stdout(
					stringifyEnvelope(
						envelopeErr("project-not-found", `Unknown project: ${parsed.id}`, {
							action: "project-benchmark.show",
							exitCode: 1,
						}),
					),
				);
			} else {
				io.stderr(`err project-not-found id=${parsed.id}`);
			}
			return 1;
		}
		const score = scoreProjectBenchmark(project, catalog.axes);
		const data = {
			schema_version: "1.0.0",
			command: "project-benchmark.show",
			catalog_source: catalog.catalog.source,
			project,
			score,
		};
		if (parsed.json) {
			jsonWriters.ok(io, "show", data);
		} else {
			io.stdout(formatProjectBenchmarkShow(project, score));
		}
		return 0;
	}

	if (action === "matrix") {
		if (parsed.axis && !catalog.axes.axes[parsed.axis]) {
			if (parsed.json) {
				writeActionError(
					io,
					action,
					"unknown-axis",
					`Unknown axis: ${parsed.axis}`,
					1,
					{ catalog_source: catalog.catalog.source },
				);
			} else {
				io.stderr(`err unknown-axis axis=${parsed.axis}`);
			}
			return 1;
		}
		const matrix = buildProjectBenchmarkMatrix(catalog.projects, catalog.axes);
		const projects = parsed.axis
			? matrix.projects
					.filter((project) => (project.axes[parsed.axis as string] ?? 0) > 0)
					.sort(
						(left, right) =>
							(right.axes[parsed.axis as string] ?? 0) -
								(left.axes[parsed.axis as string] ?? 0) ||
							compareProjectBenchmarkScores(left, right),
					)
			: matrix.projects;
		const data = {
			command: "project-benchmark.matrix",
			schema_version: matrix.schema_version,
			catalog_source: catalog.catalog.source,
			generated_by: matrix.generated_by,
			axis: parsed.axis,
			projects,
		};
		if (parsed.json) {
			jsonWriters.ok(io, "matrix", data);
		} else {
			io.stdout(
				formatProjectBenchmarkMatrix(projects, parsed.axis ?? undefined),
			);
		}
		return 0;
	}

	if (action === "generate") {
		const result = generateProjectBenchmarkOutputs(
			projectRoot,
			{
				dataDir: catalog.catalog.paths.dataDir,
				catalogDir: catalog.catalog.paths.admDir,
				runtimeBenchmarkCatalogDir:
					catalog.catalog.paths.runtimeBenchmarkCatalogDir,
			},
			catalog.projects,
			catalog.axes,
			catalog.validation,
			{ check: parsed.check },
		);
		if (parsed.json) {
			const jsonResult = withCatalogSource(result, catalog.catalog.source);
			if (parsed.check || !result.ok) {
				writeGenerateJson(io, jsonResult, result.ok);
			} else {
				jsonWriters.ok(io, "generate", jsonResult);
			}
		} else if (parsed.check) {
			if (result.ok) {
				io.stdout(
					`project-benchmark generate: check ok projects=${result.project_count} files=${result.files.length}`,
				);
			} else if (result.misplaced_files.length > 0) {
				const lines = [
					`project-benchmark generate: check failed misplaced=${result.misplaced_files.length}`,
				];
				for (const file of result.misplaced_files) {
					lines.push(`${file.location}: ${file.path}`);
				}
				io.stdout(lines.join("\n"));
			} else {
				const lines = [
					`project-benchmark generate: check failed projects=${result.project_count} changed=${result.changed_files.length}`,
				];
				for (const file of result.changed_files) {
					lines.push(`${file.kind}: ${file.path}`);
				}
				io.stdout(lines.join("\n"));
			}
		} else {
			if (!result.ok) {
				const lines = [
					`err generated-output-misplaced count=${result.misplaced_files.length}`,
				];
				for (const file of result.misplaced_files) {
					lines.push(`${file.location}: ${file.path}`);
				}
				io.stderr(lines.join("\n"));
				return 1;
			}
			io.stdout(
				formatProjectBenchmarkGeneration(result.project_count, result.files),
			);
		}
		return result.ok ? 0 : 1;
	}

	if (action === "recommend") {
		const axis = parsed.axis as string;
		if (!catalog.axes.axes[axis]) {
			if (parsed.json) {
				writeActionError(
					io,
					action,
					"unknown-axis",
					`Unknown axis: ${axis}`,
					1,
					{ catalog_source: catalog.catalog.source },
				);
			} else {
				io.stderr(`err unknown-axis axis=${axis}`);
			}
			return 1;
		}
		const references = rankProjectBenchmarkRecommendations(
			axis,
			catalog.projects,
		).slice(0, 5);
		const recommendations: string[] = [];
		for (const entry of references) {
			if (entry.lesson) {
				recommendations.push(entry.lesson);
			}
		}
		const data = {
			schema_version: "1.0.0",
			command: "project-benchmark.recommend",
			catalog_source: catalog.catalog.source,
			axis,
			description: catalog.axes.axes[axis].description,
			top_references: references,
			recommendations,
		};
		if (parsed.json) {
			jsonWriters.ok(io, "recommend", data);
		} else {
			io.stdout(
				formatProjectBenchmarkRecommend(axis, references, catalog.axes),
			);
		}
		return 0;
	}

	if (parsed.json) {
		writeActionError(
			io,
			action,
			"unknown-action",
			`Unknown project-benchmark action: ${action}`,
			2,
		);
	} else {
		io.stderr(
			`err unknown-action action=${action} hint="use list, show, matrix, recommend, validate, generate"`,
		);
	}
	return 2;
}
