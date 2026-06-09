#!/usr/bin/env bun

import { spawnSync } from "node:child_process";

const THRESHOLD = 80;

type CoverageTotals = {
	lines: number;
	functions: number;
};

const result = spawnSync(
	"bun",
	["test", "--coverage", "--coverage-reporter=text"],
	{
		cwd: process.cwd(),
		encoding: "utf8",
		maxBuffer: 20 * 1024 * 1024,
		shell: false,
	},
);

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

if (result.error) {
	console.error(`coverage: failed to start bun test: ${result.error.message}`);
	process.exit(1);
}

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

const totals = parseBunTextCoverage(
	`${result.stdout ?? ""}\n${result.stderr ?? ""}`,
);
const passed = totals.lines >= THRESHOLD && totals.functions >= THRESHOLD;

console.log(
	`coverage lines: ${formatPercent(totals.lines)}% (threshold ${THRESHOLD}%)`,
);
console.log(
	`coverage functions: ${formatPercent(totals.functions)}% (threshold ${THRESHOLD}%)`,
);

if (!passed) {
	console.error("coverage: failed");
	process.exit(1);
}

console.log("coverage: passed");

function parseBunTextCoverage(output: string): CoverageTotals {
	const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
	const plainOutput = output.replace(ansiEscape, "");
	const line = plainOutput
		.split(/\r?\n/)
		.map((value) => value.trim())
		.find((value) => value.startsWith("All files"));
	if (!line) {
		console.error("coverage: could not find Bun coverage summary");
		process.exit(1);
	}

	const columns = line.split("|").map((value) => value.trim());
	const functions = Number(columns[1]);
	const lines = Number(columns[2]);
	if (!Number.isFinite(functions) || !Number.isFinite(lines)) {
		console.error("coverage: could not parse Bun coverage summary");
		process.exit(1);
	}

	return { functions, lines };
}

function formatPercent(value: number): string {
	return value.toFixed(2);
}
