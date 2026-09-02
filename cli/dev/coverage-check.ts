#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";

const THRESHOLD = 80;

type CoverageTotals = {
	file?: string;
	lines: number;
	functions: number;
};

const parsedArgs = parseArgs(process.argv.slice(2));
const coverageDir = parsedArgs.coverageDir ?? ".coverage";
const coverageDirArgs = parsedArgs.coverageDir
	? []
	: ["--coverage-dir", coverageDir];
const lcovPath = resolve(
	process.cwd(),
	parsedArgs.lcovPath ?? `${coverageDir}/lcov.info`,
);
const result = spawnSync(
	resolveBunExecutable(),
	[
		"test",
		...parsedArgs.testArgs,
		...coverageDirArgs,
		"--coverage",
		"--coverage-reporter=lcov",
		"--coverage-reporter=text",
	],
	{
		cwd: process.cwd(),
		encoding: "utf8",
		maxBuffer: 20 * 1024 * 1024,
		shell: false,
	},
);

if (result.error) {
	console.error(`coverage: failed to start bun test: ${result.error.message}`);
	process.exit(1);
}

if (parsedArgs.verbose) {
	process.stdout.write(result.stdout ?? "");
	process.stderr.write(result.stderr ?? "");
}

if (result.status !== 0) {
	if (!parsedArgs.verbose) {
		const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
		const lines = output.split(/\r?\n/);
		const failureLines = lines.filter(
			(line) =>
				line.includes("(fail)") ||
				/\btests? failed\b/i.test(line) ||
				line.startsWith("error: script "),
		);
		const summary =
			failureLines.length > 0
				? failureLines.slice(0, 100)
				: lines.filter(Boolean).slice(-40);
		process.stderr.write(`${summary.join("\n")}\n`);
	}
	if (result.signal) {
		console.error(`coverage: bun test terminated by signal ${result.signal}`);
	} else if (result.status === null) {
		console.error("coverage: bun test exited without a status");
	} else {
		console.error(`coverage: bun test exited with status ${result.status}`);
	}
	process.exit(result.status ?? 1);
}

const report = parseCoverageFromLcovOrText(
	`${result.stdout ?? ""}\n${result.stderr ?? ""}`,
	lcovPath,
);
const totals = selectCoverageRows(report, parsedArgs.includePrefixes);
const failedRows = totals.filter(
	(row) => row.lines < THRESHOLD || row.functions < THRESHOLD,
);
const passed = failedRows.length === 0;

for (const row of totals) {
	const label = row.file ?? "All files";
	console.log(
		`coverage ${label} lines: ${formatPercent(row.lines)}% (threshold ${THRESHOLD}%)`,
	);
	console.log(
		`coverage ${label} functions: ${formatPercent(row.functions)}% (threshold ${THRESHOLD}%)`,
	);
}

if (!passed) {
	console.error("coverage: failed");
	process.exit(1);
}

console.log("coverage: passed");

function parseArgs(args: string[]): {
	includePrefixes: string[];
	testArgs: string[];
	verbose: boolean;
	coverageDir?: string;
	lcovPath?: string;
} {
	const includePrefixes: string[] = [];
	const testArgs: string[] = [];
	let verbose = false;
	let coverageDir: string | undefined;
	let lcovPath: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--verbose") {
			verbose = true;
			continue;
		}
		if (arg === "--include") {
			const value = args[index + 1];
			if (!value) {
				console.error("coverage: --include requires a path prefix");
				process.exit(1);
			}
			includePrefixes.push(value);
			index += 1;
			continue;
		}
		if (arg === "--coverage-dir") {
			const value = args[index + 1];
			if (!value) {
				console.error("coverage: --coverage-dir requires a value");
				process.exit(1);
			}
			coverageDir = value;
			testArgs.push(arg, value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--coverage-dir=")) {
			coverageDir = arg.slice("--coverage-dir=".length);
			testArgs.push(arg);
			continue;
		}
		if (arg === "--lcov-path") {
			const value = args[index + 1];
			if (!value) {
				console.error("coverage: --lcov-path requires a file path");
				process.exit(1);
			}
			lcovPath = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--lcov-path=")) {
			lcovPath = arg.slice("--lcov-path=".length);
			continue;
		}
		testArgs.push(arg);
	}
	const parsed: {
		includePrefixes: string[];
		testArgs: string[];
		verbose: boolean;
		coverageDir?: string;
		lcovPath?: string;
	} = { includePrefixes, testArgs, verbose };
	if (coverageDir !== undefined) parsed.coverageDir = coverageDir;
	if (lcovPath !== undefined) parsed.lcovPath = lcovPath;
	return parsed;
}

function parseCoverageFromLcovOrText(
	output: string,
	lcovPath: string,
): CoverageTotals[] {
	if (existsSync(lcovPath)) {
		const rows = parseLcovCoverage(readFileSync(lcovPath, "utf8"));
		if (rows.length > 0) {
			return rows;
		}
	}
	return parseBunTextCoverage(output);
}

function parseBunTextCoverage(output: string): CoverageTotals[] {
	const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
	const plainOutput = output.replace(ansiEscape, "");
	const rows = plainOutput
		.split(/\r?\n/)
		.map((value) => value.trim())
		.filter((value) => value.includes("|"))
		.map((line) => {
			const columns = line.split("|").map((value) => value.trim());
			const functions = Number(columns[1]);
			const lines = Number(columns[2]);
			if (!Number.isFinite(functions) || !Number.isFinite(lines)) {
				return null;
			}
			return {
				file: normalizeCoverageFile(columns[0] ?? ""),
				functions,
				lines,
			};
		})
		.filter((row): row is CoverageTotals & { file: string } => row !== null);
	if (!rows.some((row) => row.file === "All files")) {
		console.error("coverage: could not find Bun coverage summary");
		process.exit(1);
	}

	return rows;
}

function parseLcovCoverage(output: string): CoverageTotals[] {
	let file = "";
	let fileLinesCovered = 0;
	let fileLinesTotal = 0;
	let fileFunctionsCovered = 0;
	let fileFunctionsTotal = 0;
	let allLinesCovered = 0;
	let allLinesTotal = 0;
	let allFunctionsCovered = 0;
	let allFunctionsTotal = 0;
	const rows: CoverageTotals[] = [];

	const flush = () => {
		if (!file) {
			return;
		}
		const normalizedFile = normalizeCoverageFile(file);
		rows.push({
			file: normalizedFile,
			lines: percent(fileLinesCovered, fileLinesTotal),
			functions: percent(fileFunctionsCovered, fileFunctionsTotal),
		});
		allLinesCovered += fileLinesCovered;
		allLinesTotal += fileLinesTotal;
		allFunctionsCovered += fileFunctionsCovered;
		allFunctionsTotal += fileFunctionsTotal;
		file = "";
		fileLinesCovered = 0;
		fileLinesTotal = 0;
		fileFunctionsCovered = 0;
		fileFunctionsTotal = 0;
	};

	for (const value of output.split(/\r?\n/)) {
		const line = value.trim();
		if (line === "end_of_record") {
			flush();
			continue;
		}
		if (line.startsWith("SF:")) {
			flush();
			file = line.slice("SF:".length).trim();
			continue;
		}
		if (line.startsWith("LF:")) {
			fileLinesTotal = Number(line.slice("LF:".length));
			continue;
		}
		if (line.startsWith("LH:")) {
			fileLinesCovered = Number(line.slice("LH:".length));
			continue;
		}
		if (line.startsWith("FNF:")) {
			fileFunctionsTotal = Number(line.slice("FNF:".length));
			continue;
		}
		if (line.startsWith("FNH:")) {
			fileFunctionsCovered = Number(line.slice("FNH:".length));
		}
	}

	flush();

	if (!rows.length) {
		return rows;
	}

	return [
		{
			file: "All files",
			lines: percent(allLinesCovered, allLinesTotal),
			functions: percent(allFunctionsCovered, allFunctionsTotal),
		},
		...rows,
	];
}

function percent(covered: number, total: number): number {
	if (!Number.isFinite(covered) || !Number.isFinite(total)) {
		return 0;
	}
	if (total === 0) {
		return 100;
	}
	return (covered / total) * 100;
}

function normalizeCoverageFile(file: string): string {
	const normalizedFile = normalizePathSeparators(file);
	if (!isAbsolute(file) && !isAbsolute(normalizedFile)) {
		return normalizedFile;
	}
	const relativeFile = normalizePathSeparators(
		relative(process.cwd(), normalizedFile),
	);
	if (
		relativeFile.startsWith(`.${normalizePathSeparators(sep)}`) ||
		relativeFile.startsWith("..") ||
		isAbsolute(relativeFile)
	) {
		return normalizedFile;
	}
	return relativeFile;
}

function normalizePathSeparators(path: string): string {
	return path.replaceAll("\\", "/");
}

function selectCoverageRows(
	rows: CoverageTotals[],
	includePrefixes: string[],
): CoverageTotals[] {
	if (includePrefixes.length === 0) {
		const allFiles = rows.find((row) => row.file === "All files");
		if (!allFiles) {
			console.error("coverage: could not find Bun coverage summary");
			process.exit(1);
		}
		return [{ functions: allFiles.functions, lines: allFiles.lines }];
	}

	const normalizedPrefixes = includePrefixes.map(normalizePathSeparators);
	const fileRows = rows.filter((row) => row.file !== "All files");
	const matchesPrefix = (row: CoverageTotals, prefix: string) =>
		row.file === prefix || row.file?.startsWith(`${prefix}/`);
	const missingPrefixes = [
		...new Set(
			normalizedPrefixes.filter(
				(prefix) => !fileRows.some((row) => matchesPrefix(row, prefix)),
			),
		),
	];
	if (missingPrefixes.length > 0) {
		console.error(
			`coverage: missing include prefixes: ${missingPrefixes.join(", ")}`,
		);
		process.exit(1);
	}
	return fileRows.filter((row) =>
		normalizedPrefixes.some((prefix) => matchesPrefix(row, prefix)),
	);
}

function formatPercent(value: number): string {
	return value.toFixed(2);
}

function resolveBunExecutable(env: NodeJS.ProcessEnv = process.env): string {
	if (process.platform !== "win32") return "bun";
	const pathValue = env.PATH ?? env.Path;
	if (!pathValue) return "bun";
	for (const directory of pathValue.split(delimiter)) {
		if (!directory) continue;
		for (const candidate of ["bun.exe", "bun.cmd", "bun.bat", "bun"]) {
			const executable = join(directory, candidate);
			if (existsSync(executable)) return executable;
		}
	}
	return "bun";
}
