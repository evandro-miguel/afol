import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { PackId } from "./types";

const RESULTS_RELATIVE_PATH = ".afol/data/benchmarks/catalog/results";

function timestampSlug(now: Date = new Date()): string {
	const pad = (value: number): string => String(value).padStart(2, "0");
	return (
		[
			String(now.getUTCFullYear()),
			pad(now.getUTCMonth() + 1),
			pad(now.getUTCDate()),
		].join("") +
		"_" +
		[
			pad(now.getUTCHours()),
			pad(now.getUTCMinutes()),
			pad(now.getUTCSeconds()),
		].join("")
	);
}

function stableResultFileName(selectedPacks: PackId[]): string {
	const packPart =
		selectedPacks.length === 1
			? selectedPacks[0]
			: selectedPacks.length > 1
				? `${selectedPacks[0]}-multi`
				: "benchmark";
	return `${timestampSlug()}_${packPart}.json`;
}

function resolveOutputPath(projectRoot: string, outputPath: string): string {
	return isAbsolute(outputPath) ? outputPath : resolve(projectRoot, outputPath);
}

export function saveBenchmarkPayload(
	projectRoot: string,
	payload: Record<string, unknown>,
	selectedPacks: PackId[],
	outputPathArg?: string,
): string {
	const defaultPath = join(
		projectRoot,
		RESULTS_RELATIVE_PATH,
		stableResultFileName(selectedPacks),
	);
	const outputPath = outputPathArg
		? resolveOutputPath(projectRoot, outputPathArg)
		: defaultPath;
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return relative(projectRoot, outputPath).replaceAll("\\", "/");
}
