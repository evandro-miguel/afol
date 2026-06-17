#!/usr/bin/env bun

import { spawnSync } from "node:child_process";

const THRESHOLD = 80;

type CoverageTotals = {
	file?: string;
	lines: number;
	functions: number;
};

const parsedArgs = parseArgs(process.argv.slice(2));
const result = spawnSync(
	"bun",
	["test", ...parsedArgs.testArgs, "--coverage", "--coverage-reporter=text"],
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
		process.stdout.write(result.stdout ?? "");
		process.stderr.write(result.stderr ?? "");
	}
	process.exit(result.status ?? 1);
}

const report = parseBunTextCoverage(
	`${result.stdout ?? ""}\n${result.stderr ?? ""}`,
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
} {
	const includePrefixes: string[] = [];
	const testArgs: string[] = [];
	let verbose = false;
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
		testArgs.push(arg);
	}
	return { includePrefixes, testArgs, verbose };
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
			return { file: columns[0], functions, lines };
		})
		.filter((row): row is CoverageTotals & { file: string } => row !== null);
	if (!rows.some((row) => row.file === "All files")) {
		console.error("coverage: could not find Bun coverage summary");
		process.exit(1);
	}

	return rows;
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

	const selected = rows.filter(
		(row) =>
			row.file !== "All files" &&
			includePrefixes.some(
				(prefix) => row.file === prefix || row.file?.startsWith(`${prefix}/`),
			),
	);
	if (selected.length === 0) {
		console.error(
			`coverage: no files matched include prefix: ${includePrefixes.join(", ")}`,
		);
		process.exit(1);
	}
	return selected;
}

function formatPercent(value: number): string {
	return value.toFixed(2);
}
