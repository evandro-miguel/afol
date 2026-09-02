import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { toPosixPath } from "../../core/file-paths";
import { BUILTIN_ASSET_FILES } from "../../generated/builtin-assets";
import { resolveProjectBenchmarkPaths } from "./paths";
import type {
	ProjectBenchmarkAxesFile,
	ProjectBenchmarkCatalog,
	ProjectBenchmarkIssue,
	ProjectBenchmarkProject,
} from "./types";

const PROJECT_BENCHMARK_TEMPLATE_PREFIX = "project-benchmarks/";
const PROJECT_BENCHMARK_TEMPLATE_PROJECTS_PREFIX = `${PROJECT_BENCHMARK_TEMPLATE_PREFIX}projects/`;

function rel(projectRoot: string, file: string): string {
	return toPosixPath(relative(projectRoot, file) || file);
}

function parseJsonFile<T>(
	projectRoot: string,
	file: string,
	issues: ProjectBenchmarkIssue[],
): T | null {
	try {
		return JSON.parse(readFileSync(file, "utf8")) as T;
	} catch (error) {
		issues.push({
			severity: "error",
			code: "invalid-json",
			file: rel(projectRoot, file),
			message: `Invalid JSON: ${(error as Error).message}`,
		});
		return null;
	}
}

function parseTemplateJsonFile<T>(
	file: string,
	issues: ProjectBenchmarkIssue[],
): T | null {
	const templateFile = BUILTIN_ASSET_FILES[file];
	if (!templateFile) {
		issues.push({
			severity: "error",
			code: "missing-builtin-catalog-file",
			file,
			message: "Missing builtin project-benchmark catalog file",
		});
		return null;
	}
	try {
		const text = Buffer.from(templateFile.contentBase64, "base64").toString(
			"utf8",
		);
		return JSON.parse(text) as T;
	} catch (error) {
		issues.push({
			severity: "error",
			code: "invalid-builtin-json",
			file,
			message: `Invalid builtin JSON: ${(error as Error).message}`,
		});
		return null;
	}
}

function listProjectFiles(projectsDir: string): string[] {
	if (!existsSync(projectsDir)) {
		return [];
	}
	return readdirSync(projectsDir)
		.filter((entry) => entry.endsWith(".json"))
		.map((entry) => join(projectsDir, entry))
		.filter((file) => statSync(file).isFile())
		.sort((left, right) => left.localeCompare(right));
}

function listBuiltinProjectFiles(): string[] {
	return Object.keys(BUILTIN_ASSET_FILES)
		.filter(
			(file) =>
				file.startsWith(PROJECT_BENCHMARK_TEMPLATE_PROJECTS_PREFIX) &&
				file.endsWith(".json"),
		)
		.sort((left, right) => left.localeCompare(right));
}

function hasProjectBenchmarkCatalog(
	paths: ReturnType<typeof resolveProjectBenchmarkPaths>,
) {
	return (
		existsSync(paths.axesFile) ||
		existsSync(paths.schemaFile) ||
		existsSync(paths.projectsDir)
	);
}

function loadBuiltinProjectBenchmarkCatalog(
	paths: ReturnType<typeof resolveProjectBenchmarkPaths>,
): ProjectBenchmarkCatalog {
	const loadIssues: ProjectBenchmarkIssue[] = [];
	const axes = parseTemplateJsonFile<ProjectBenchmarkAxesFile>(
		`${PROJECT_BENCHMARK_TEMPLATE_PREFIX}axes.json`,
		loadIssues,
	);
	parseTemplateJsonFile<unknown>(
		`${PROJECT_BENCHMARK_TEMPLATE_PREFIX}schema.json`,
		loadIssues,
	);
	const projects = listBuiltinProjectFiles()
		.map((file) => {
			const project = parseTemplateJsonFile<ProjectBenchmarkProject>(
				file,
				loadIssues,
			);
			if (!project) {
				return null;
			}
			return {
				file,
				fileNameId: basename(file, ".json"),
				project,
			};
		})
		.filter(
			(
				entry,
			): entry is {
				file: string;
				fileNameId: string;
				project: ProjectBenchmarkProject;
			} => entry !== null,
		);
	return { source: "builtin", paths, axes, projects, loadIssues };
}

export function loadProjectBenchmarkCatalog(
	projectRoot: string,
): ProjectBenchmarkCatalog {
	const paths = resolveProjectBenchmarkPaths(projectRoot);
	const loadIssues: ProjectBenchmarkIssue[] = [];

	if (!hasProjectBenchmarkCatalog(paths)) {
		return loadBuiltinProjectBenchmarkCatalog(paths);
	}

	const axes = existsSync(paths.axesFile)
		? parseJsonFile<ProjectBenchmarkAxesFile>(
				projectRoot,
				paths.axesFile,
				loadIssues,
			)
		: null;
	if (!axes) {
		loadIssues.push({
			severity: "error",
			code: "missing-axes",
			file: rel(projectRoot, paths.axesFile),
			message: "Missing project-benchmark axes.json",
		});
	}

	if (!existsSync(paths.schemaFile)) {
		loadIssues.push({
			severity: "error",
			code: "missing-schema",
			file: rel(projectRoot, paths.schemaFile),
			message: "Missing project-benchmark schema.json",
		});
	}

	if (!existsSync(paths.projectsDir)) {
		loadIssues.push({
			severity: "error",
			code: "missing-projects-dir",
			file: rel(projectRoot, paths.projectsDir),
			message: "Missing project-benchmark projects directory",
		});
	}

	const projects = listProjectFiles(paths.projectsDir)
		.map((file) => {
			const project = parseJsonFile<ProjectBenchmarkProject>(
				projectRoot,
				file,
				loadIssues,
			);
			if (!project) {
				return null;
			}
			return {
				file: rel(projectRoot, file),
				fileNameId: basename(file, ".json"),
				project,
			};
		})
		.filter(
			(
				entry,
			): entry is {
				file: string;
				fileNameId: string;
				project: ProjectBenchmarkProject;
			} => entry !== null,
		);

	return { source: "project", paths, axes, projects, loadIssues };
}
