import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { resolveProjectBenchmarkPaths } from "./paths";
import type {
	ProjectBenchmarkAxesFile,
	ProjectBenchmarkCatalog,
	ProjectBenchmarkIssue,
	ProjectBenchmarkProject,
} from "./types";

function rel(projectRoot: string, file: string): string {
	return relative(projectRoot, file) || file;
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

export function loadProjectBenchmarkCatalog(
	projectRoot: string,
): ProjectBenchmarkCatalog {
	const paths = resolveProjectBenchmarkPaths(projectRoot);
	const loadIssues: ProjectBenchmarkIssue[] = [];

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

	return { paths, axes, projects, loadIssues };
}
