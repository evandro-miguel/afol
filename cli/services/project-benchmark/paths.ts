import { join } from "node:path";
import { resolveProjectPaths } from "../project/paths";
import type { ProjectBenchmarkPaths } from "./types";

export function resolveProjectBenchmarkPaths(
	projectRoot: string,
): ProjectBenchmarkPaths {
	const projectPaths = resolveProjectPaths(projectRoot);
	const admDir = join(projectPaths.abs.admDir, "project-benchmarks");
	const dataDir = join(
		projectPaths.abs.mutableDir,
		"data",
		"project-benchmarks",
	);
	const runtimeBenchmarkCatalogDir = join(
		projectPaths.abs.mutableDir,
		"data",
		"benchmarks",
		"catalog",
	);
	return {
		admDir,
		axesFile: join(admDir, "axes.json"),
		schemaFile: join(admDir, "schema.json"),
		projectsDir: join(admDir, "projects"),
		dataDir,
		runtimeBenchmarkCatalogDir,
	};
}
