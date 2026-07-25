import { describe, expect, test } from "bun:test";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { updateEvolutionBenchmarkBaseline } from "../dev/update-evolution-benchmark-baseline";
import { atomicWriteText } from "../services/io/atomic";

const repoRoot = process.cwd();
const currentCommit = "e6436bdd2fc3";
const v1Paths = [
	".afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v1.json",
	"src/project-template/.afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v1.json",
] as const;
const v2Paths = [
	".afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v2.json",
	".afol/data/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
	"src/project-template/.afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v2.json",
	"src/project-template/.afol/data/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
] as const;

function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "afol-evolution-baseline-"));
	for (const path of [
		...v1Paths,
		...v2Paths.filter((entry) => entry.includes("scenarios")),
	]) {
		const target = join(root, path);
		mkdirSync(join(target, ".."), { recursive: true });
		cpSync(join(repoRoot, path), target);
	}
	return root;
}

function writeJson(path: string, payload: unknown): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function seedV2Baseline(root: string): void {
	for (const source of v1Paths) {
		const baseline = JSON.parse(
			readFileSync(join(root, source), "utf8"),
		) as Record<string, unknown>;
		baseline.baseline_id = "evolution-core-v2";
		baseline.run_id = "bench-evolution-core-evolution-status-contract-1.1.0";
		const target = join(root, source.replace("baseline-v1", "baseline-v2"));
		writeJson(target, baseline);
	}
}

function input(
	root: string,
	resultOverrides: Record<string, unknown> = {},
	payloadOverrides: Record<string, unknown> = {},
): string {
	const path = join(root, "benchmark.json");
	const result = {
		schema_version: "1.0.0",
		run_id: "bench-evolution-core-evolution-status-contract-1.1.0",
		scenario_id: "evolution-status-contract",
		scenario_version: "1.1.0",
		pack_id: "evolution-core",
		status: "passed",
		baseline_id: "evolution-core-v2",
		baseline_reference:
			".afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v2.json",
		pass: true,
		duration_ms: 311,
		timing_p50_ms: 307,
		timing_p95_ms: 321,
		error_count: 0,
		retry_count: 0,
		context_tokens: 0,
		prompt_tokens: 0,
		output_tokens: 17,
		context_bytes: 0,
		output_bytes: 67,
		tool_call_count: 1,
		tool_success_rate: 1,
		git_commit: currentCommit,
		notes: [],
		...resultOverrides,
	};
	writeJson(path, {
		mode: "benchmark",
		status: result.status === "passed" ? "passed" : "failed",
		pass: result.pass,
		selected_pack_ids: ["evolution-core"],
		result_count: 1,
		results: [result],
		contract_issues:
			result.status === "baseline-missing"
				? ["missing-baseline:evolution-core"]
				: [],
		...payloadOverrides,
	});
	return path;
}

function snapshot(paths: readonly string[], root: string): string[] {
	return paths.map((path) => readFileSync(join(root, path), "utf8"));
}

function snapshotBytes(paths: readonly string[], root: string): string[] {
	return paths.map((path) => readFileSync(join(root, path)).toString("hex"));
}

describe("evolution benchmark baseline writer", () => {
	test("bootstraps v2 without changing either v1 history fixture", () => {
		const root = fixtureRoot();
		try {
			const beforeV1 = snapshot(v1Paths, root);
			const output = input(root, { status: "baseline-missing", pass: false });
			const paths = updateEvolutionBenchmarkBaseline(root, output, {
				currentCommit,
				now: new Date("2026-07-20T12:00:00.000Z"),
			});
			expect(paths).toEqual([...v2Paths]);
			expect(snapshot(v1Paths, root)).toEqual(beforeV1);
			expect(existsSync(join(root, v2Paths[0]))).toBe(true);
			const baseline = JSON.parse(
				readFileSync(join(root, v2Paths[0]), "utf8"),
			) as Record<string, unknown>;
			expect(baseline.baseline_id).toBe("evolution-core-v2");
			expect(baseline.timestamp).toBe("2026-07-20T12:00:00.000Z");
			const scenario = JSON.parse(
				readFileSync(join(root, v2Paths[1]), "utf8"),
			) as Record<string, unknown>;
			expect(scenario.scenario_version).toBe("1.1.0");
			expect(scenario.baseline_id).toBe("evolution-core-v2");
			expect(
				(scenario.deterministic_metrics as Record<string, unknown>).duration_ms,
			).toBe(311);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refreshes an existing v2 baseline from a normal passing result", () => {
		const root = fixtureRoot();
		try {
			seedV2Baseline(root);
			const output = input(root);
			updateEvolutionBenchmarkBaseline(root, output, {
				currentCommit,
				now: new Date("2026-07-20T12:00:00.000Z"),
			});
			const baseline = JSON.parse(
				readFileSync(join(root, v2Paths[0]), "utf8"),
			) as Record<string, unknown>;
			expect(baseline.timing_p50_ms).toBe(307);
			expect(baseline.timing_p95_ms).toBe(321);
			expect(baseline.baseline_id).toBe("evolution-core-v2");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	for (const rejection of [
		{
			name: "wrong commit",
			result: { git_commit: "deadbeefdead" },
			error: "does not match current HEAD",
		},
		{
			name: "wrong baseline id",
			result: { baseline_id: "evolution-core-v1" },
			error: "baseline_id does not match evolution-core-v2",
		},
		{
			name: "wrong scenario version",
			result: { scenario_version: "1.0.0" },
			error: "scenario does not match evolution-core",
		},
		{
			name: "wrong baseline reference",
			result: { baseline_reference: "baseline-v1.json" },
			error: "baseline_reference does not match baseline-v2.json",
		},
		{
			name: "baseline regression",
			result: { notes: ["baseline-regression:timing_p95_ms:321>200"] },
			error: "baseline-regression",
		},
		{
			name: "duration limit",
			result: { status: "baseline-missing", pass: false, duration_ms: 4001 },
			error: "duration exceeds",
		},
		{
			name: "p95 limit",
			result: { status: "baseline-missing", pass: false, timing_p95_ms: 4001 },
			error: "p95 exceeds",
		},
		{
			name: "output token limit",
			result: { status: "baseline-missing", pass: false, output_tokens: 251 },
			error: "output_tokens exceeds",
		},
		{
			name: "output byte limit",
			result: { status: "baseline-missing", pass: false, output_bytes: 4001 },
			error: "output_bytes exceeds",
		},
		{
			name: "errors",
			result: { status: "baseline-missing", pass: false, error_count: 1 },
			error: "zero errors",
		},
		{
			name: "retries",
			result: { status: "baseline-missing", pass: false, retry_count: 1 },
			error: "zero retries",
		},
		{
			name: "tool success rate",
			result: {
				status: "baseline-missing",
				pass: false,
				tool_success_rate: 0.97,
			},
			error: "below 0.98",
		},
		{
			name: "extra result",
			payload: { result_count: 2, results: [{}, {}] },
			error: "exactly one result",
		},
		{
			name: "unrelated contract issue",
			result: { status: "baseline-missing", pass: false },
			payload: {
				contract_issues: ["missing-baseline:evolution-core", "unrelated"],
			},
			error: "unrelated contract issues",
		},
		{
			name: "existing baseline with missing status",
			result: { status: "baseline-missing", pass: false },
			seed: true,
			error: "existing baseline",
		},
		{
			name: "passed result without baseline",
			result: {},
			error: "missing baseline",
		},
	]) {
		test(`rejects ${rejection.name}`, () => {
			const root = fixtureRoot();
			try {
				if (rejection.seed) seedV2Baseline(root);
				const before = snapshot(
					v2Paths.filter((path) => existsSync(join(root, path))),
					root,
				);
				const output = input(root, rejection.result, rejection.payload);
				expect(() =>
					updateEvolutionBenchmarkBaseline(root, output, { currentCommit }),
				).toThrow(rejection.error);
				expect(
					snapshot(
						v2Paths.filter((path) => existsSync(join(root, path))),
						root,
					),
				).toEqual(before);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});
	}

	test("rolls back all four v2 targets after a mid-batch writer failure", () => {
		const root = fixtureRoot();
		try {
			const beforeV1 = snapshot(v1Paths, root);
			const beforeScenarios = snapshotBytes(
				v2Paths.filter((path) => path.includes("scenarios")),
				root,
			);
			const output = input(root, { status: "baseline-missing", pass: false });
			let writes = 0;
			expect(() =>
				updateEvolutionBenchmarkBaseline(root, output, {
					currentCommit,
					now: new Date("2026-07-20T12:00:00.000Z"),
					write(path, content) {
						writes += 1;
						if (writes === 3) throw new Error("injected writer failure");
						atomicWriteText(path, content);
					},
				}),
			).toThrow("injected writer failure");
			expect(writes).toBe(3);
			expect(existsSync(join(root, v2Paths[0]))).toBe(false);
			expect(existsSync(join(root, v2Paths[2]))).toBe(false);
			expect(snapshot(v1Paths, root)).toEqual(beforeV1);
			expect(
				snapshotBytes(
					v2Paths.filter((path) => path.includes("scenarios")),
					root,
				),
			).toEqual(beforeScenarios);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
