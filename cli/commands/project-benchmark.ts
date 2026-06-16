import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { loadProjectBenchmarkCatalog } from "../services/project-benchmark/catalog";
import { generateProjectBenchmarkOutputs } from "../services/project-benchmark/generate";
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
	scoreProjectBenchmark,
	scoreProjectBenchmarks,
} from "../services/project-benchmark/scoring";
import type {
	ProjectBenchmarkAxesFile,
	ProjectBenchmarkProject,
} from "../services/project-benchmark/types";
import { validateProjectBenchmarkCatalog } from "../services/project-benchmark/validate";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type ParsedArgs = {
	json: boolean;
	id: string | null;
	axis: string | null;
};

function parseArgs(action: string, args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		json: false,
		id: null,
		axis: null,
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
		if (action === "recommend" && value === "--for") {
			const next = args[index + 1];
			if (!next || next.startsWith("-")) {
				throw new Error("Missing value for --for in pb recommend.");
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

function requireValidCatalog(projectRoot: string): {
	catalog: ReturnType<typeof loadProjectBenchmarkCatalog>;
	axes: ProjectBenchmarkAxesFile;
	projects: ProjectBenchmarkProject[];
	validation: ReturnType<typeof validateProjectBenchmarkCatalog>;
} {
	const catalog = loadProjectBenchmarkCatalog(projectRoot);
	const validation = validateProjectBenchmarkCatalog(catalog);
	if (!catalog.axes) {
		throw new Error("project-benchmark catalog is missing axes.json");
	}
	if (!validation.ok) {
		throw new Error("project-benchmark catalog validation failed");
	}
	return {
		catalog,
		axes: catalog.axes,
		projects: projectList(catalog.projects.map((entry) => entry.project)),
		validation,
	};
}

function writeJson(
	io: CommandIo,
	action: string,
	data: Record<string, unknown>,
): void {
	io.stdout(stringifyEnvelope(envelopeOk(data, { action })));
}

function writeValidationJson(
	io: CommandIo,
	data: Record<string, unknown>,
	ok: boolean,
): void {
	const envelope: ResultEnvelope<Record<string, unknown>> = {
		schema: "afol.result/v1",
		ok,
		action: "project-benchmark.validate",
		exit_code: ok ? 0 : 1,
		data,
	};
	if (!ok) {
		envelope.error = {
			code: "invalid-project-benchmark-catalog",
			message: "project-benchmark catalog validation failed",
		};
	}
	io.stdout(stringifyEnvelope(envelope));
}

export async function runProjectBenchmarkCommand(
	actionInput: string,
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	const action = actionInput || "list";
	let parsed: ParsedArgs;
	try {
		parsed = parseArgs(action, args);
	} catch (error) {
		const message = (error as Error).message;
		if (args.includes("--json") || args.includes("-j")) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("invalid-arguments", message, {
						action: `project-benchmark.${action}`,
						exitCode: 2,
					}),
				),
			);
		} else {
			io.stderr(`err invalid-arguments ${message}`);
		}
		return 2;
	}

	if (action === "validate") {
		const catalog = loadProjectBenchmarkCatalog(projectRoot);
		const validation = validateProjectBenchmarkCatalog(catalog);
		const data = {
			schema_version: "1.0.0",
			command: "project-benchmark.validate",
			ok: validation.ok,
			issues: validation.issues,
			error_count: validation.error_count,
			warning_count: validation.warning_count,
			project_count: validation.project_count,
		};
		if (parsed.json) {
			writeValidationJson(io, data, validation.ok);
		} else {
			io.stdout(formatProjectBenchmarkValidation(validation));
		}
		return validation.ok ? 0 : 1;
	}

	let catalog: ReturnType<typeof requireValidCatalog>;
	try {
		catalog = requireValidCatalog(projectRoot);
	} catch (error) {
		const message = (error as Error).message;
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("invalid-project-benchmark-catalog", message, {
						action: `project-benchmark.${action}`,
						exitCode: 1,
					}),
				),
			);
		} else {
			io.stderr(`err invalid-project-benchmark-catalog ${message}`);
		}
		return 1;
	}

	if (action === "list") {
		const scores = scoreProjectBenchmarks(catalog.projects, catalog.axes);
		const data = {
			schema_version: "1.0.0",
			command: "project-benchmark.list",
			projects: scores,
		};
		if (parsed.json) {
			writeJson(io, "project-benchmark.list", data);
		} else {
			io.stdout(formatProjectBenchmarkList(scores));
		}
		return 0;
	}

	if (action === "show") {
		const project = catalog.projects.find((entry) => entry.id === parsed.id);
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
			project,
			score,
		};
		if (parsed.json) {
			writeJson(io, "project-benchmark.show", data);
		} else {
			io.stdout(formatProjectBenchmarkShow(project, score));
		}
		return 0;
	}

	if (action === "matrix") {
		const matrix = buildProjectBenchmarkMatrix(catalog.projects, catalog.axes);
		const data = {
			command: "project-benchmark.matrix",
			...matrix,
		};
		if (parsed.json) {
			writeJson(io, "project-benchmark.matrix", data);
		} else {
			io.stdout(formatProjectBenchmarkMatrix(matrix.projects));
		}
		return 0;
	}

	if (action === "generate") {
		const result = generateProjectBenchmarkOutputs(
			projectRoot,
			catalog.catalog.paths.dataDir,
			catalog.projects,
			catalog.axes,
			catalog.validation,
		);
		if (parsed.json) {
			writeJson(io, "project-benchmark.generate", result);
		} else {
			io.stdout(
				formatProjectBenchmarkGeneration(result.project_count, result.files),
			);
		}
		return 0;
	}

	if (action === "recommend") {
		const axis = parsed.axis as string;
		if (!catalog.axes.axes[axis]) {
			if (parsed.json) {
				io.stdout(
					stringifyEnvelope(
						envelopeErr("unknown-axis", `Unknown axis: ${axis}`, {
							action: "project-benchmark.recommend",
							exitCode: 1,
						}),
					),
				);
			} else {
				io.stderr(`err unknown-axis axis=${axis}`);
			}
			return 1;
		}
		const references = catalog.projects
			.map((project) => ({
				id: project.id,
				name: project.name,
				score: project.similarity_axes[axis]?.score ?? 0,
				lesson:
					project.lessons_for_afol.find((entry) => entry.axis === axis)
						?.lesson ?? null,
			}))
			.filter((entry) => entry.score > 0)
			.sort(
				(left, right) =>
					right.score - left.score || left.id.localeCompare(right.id),
			);
		const data = {
			schema_version: "1.0.0",
			command: "project-benchmark.recommend",
			axis,
			description: catalog.axes.axes[axis].description,
			top_references: references,
			recommendations: references
				.map((entry) => entry.lesson)
				.filter((lesson): lesson is string => Boolean(lesson)),
		};
		if (parsed.json) {
			writeJson(io, "project-benchmark.recommend", data);
		} else {
			io.stdout(
				formatProjectBenchmarkRecommend(axis, catalog.projects, catalog.axes),
			);
		}
		return 0;
	}

	if (parsed.json) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr(
					"unknown-action",
					`Unknown project-benchmark action: ${action}`,
					{
						action: `project-benchmark.${action}`,
						exitCode: 2,
					},
				),
			),
		);
	} else {
		io.stderr(
			`err unknown-action action=${action} hint="use list, show, matrix, recommend, validate, generate"`,
		);
	}
	return 2;
}
