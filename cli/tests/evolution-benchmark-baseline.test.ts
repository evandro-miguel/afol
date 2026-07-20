import { describe, expect, test } from "bun:test";
import {
	cpSync,
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
const relativePaths = [
	".afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v1.json",
	".afol/data/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
	"src/project-template/.afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v1.json",
	"src/project-template/.afol/data/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
] as const;

function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "afol-evolution-baseline-"));
	for (const path of relativePaths) {
		const target = join(root, path);
		mkdirSync(join(target, ".."), { recursive: true });
		cpSync(join(repoRoot, path), target);
	}
	return root;
}

function input(root: string, overrides: Record<string, unknown> = {}): string {
	const path = join(root, "benchmark.json");
	const result = {
		schema_version: "1.0.0",
		run_id: "bench-evolution-core-evolution-status-contract-1.0.0",
		scenario_id: "evolution-status-contract",
		scenario_version: "1.0.0",
		pack_id: "evolution-core",
		status: "passed",
		baseline_id: "evolution-core-v1",
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
		...overrides,
	};
	writeJson(path, {
		mode: "benchmark",
		status: "passed",
		pass: true,
		selected_pack_ids: ["evolution-core"],
		result_count: 1,
		results: [result],
		contract_issues: [],
	});
	return path;
}

function writeJson(path: string, payload: unknown): void {
	writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function snapshot(root: string): string[] {
	return relativePaths.map((path) => readFileSync(join(root, path), "utf8"));
}

function snapshotBytes(root: string): string[] {
	return relativePaths.map((path) =>
		readFileSync(join(root, path)).toString("hex"),
	);
}

describe("evolution benchmark baseline writer", () => {
	test("updates root and template baseline/scenario fixtures from one passing result", () => {
		const root = fixtureRoot();
		try {
			const output = input(root);
			const paths = updateEvolutionBenchmarkBaseline(root, output, {
				currentCommit,
				now: new Date("2026-07-20T12:00:00.000Z"),
			});
			expect(paths).toHaveLength(4);
			for (const path of relativePaths) {
				expect(readFileSync(join(root, path), "utf8")).toContain(currentCommit);
			}
			const baseline = JSON.parse(
				readFileSync(join(root, relativePaths[0]), "utf8"),
			) as Record<string, unknown>;
			expect(baseline.timing_p50_ms).toBe(307);
			expect(baseline.timing_p95_ms).toBe(321);
			expect(baseline.timestamp).toBe("2026-07-20T12:00:00.000Z");
			const scenario = JSON.parse(
				readFileSync(join(root, relativePaths[1]), "utf8"),
			) as Record<string, unknown>;
			expect(
				(scenario.deterministic_metrics as Record<string, unknown>).duration_ms,
			).toBe(311);
			expect((scenario.measurement as Record<string, unknown>).git_commit).toBe(
				currentCommit,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts only the known stale-baseline contract issue during bootstrap", () => {
		const root = fixtureRoot();
		try {
			const output = input(root);
			const payload = JSON.parse(readFileSync(output, "utf8")) as Record<
				string,
				unknown
			>;
			payload.status = "failed";
			payload.pass = false;
			payload.contract_issues = [
				"benchmark-provenance-commit-not-ancestor:evolution-core:evolution-status-contract:27e758d0a8bf",
			];
			writeJson(output, payload);
			updateEvolutionBenchmarkBaseline(root, output, {
				currentCommit,
				now: new Date("2026-07-20T12:00:00.000Z"),
			});
			expect(readFileSync(join(root, relativePaths[0]), "utf8")).toContain(
				currentCommit,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects mismatched commit or failed scenario without changing artifacts", () => {
		const root = fixtureRoot();
		try {
			const before = snapshot(root);
			const output = input(root, { git_commit: "deadbeefdead" });
			expect(() =>
				updateEvolutionBenchmarkBaseline(root, output, { currentCommit }),
			).toThrow("does not match current HEAD");
			expect(snapshot(root)).toEqual(before);

			const failedOutput = input(root, { status: "failed", pass: false });
			expect(() =>
				updateEvolutionBenchmarkBaseline(root, failedOutput, { currentCommit }),
			).toThrow("Benchmark scenario must pass");
			expect(snapshot(root)).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rolls back every target after a mid-batch writer failure", () => {
		const root = fixtureRoot();
		try {
			const before = snapshotBytes(root);
			const output = input(root);
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
			expect(snapshotBytes(root)).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
