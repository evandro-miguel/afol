import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	validateBenchmarkProvenance,
	validateMutationBaselineContract,
} from "../validate/registry";
import type { Baseline, Scenario } from "../validate/types";

const catalog = join(
	import.meta.dir,
	"../../src/builtin-assets/benchmarks/catalog",
);
const read = <T>(path: string): T =>
	JSON.parse(readFileSync(join(catalog, path), "utf8"));
const scenario = read<Scenario>(
	"scenarios/evolution-core/evolution-status-contract.json",
);
const baseline = read<Baseline>("baselines/evolution-core/baseline-v2.json");
const mutation = read<Baseline>("baselines/mutation-safety/baseline-v1.json");
let root: string;
let local: string;
let localRoot: string;
let localHead: string;
let externalRoot: string;
let sideCommit: string;

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync(
		"git",
		[
			"-c",
			"user.name=AFOL Test",
			"-c",
			"user.email=tests@example.invalid",
			"-c",
			"commit.gpgsign=false",
			"-c",
			"core.hooksPath=/dev/null",
			...args,
		],
		{
			cwd,
			encoding: "utf8",
			timeout: 10_000,
			env: {
				...process.env,
				GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
				GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
			},
		},
	);
	if (result.status !== 0)
		throw new Error(result.stderr || String(result.error));
	return result.stdout.trim();
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "afol-provenance-history-"));
	local = join(root, "local");
	const external = join(root, "external");
	for (const path of [local, external]) {
		mkdirSync(path);
		git(path, "init", "--quiet", "--initial-branch=main");
		git(
			path,
			"remote",
			"add",
			"origin",
			"https://github.com/evandro-miguel/afol.git",
		);
		git(
			path,
			"commit",
			"--quiet",
			"--allow-empty",
			"-m",
			path === local ? "public root" : "historical root",
		);
	}
	localRoot = git(local, "rev-parse", "HEAD");
	externalRoot = git(external, "rev-parse", "HEAD");
	git(local, "commit", "--quiet", "--allow-empty", "-m", "current change");
	localHead = git(local, "rev-parse", "HEAD");
	git(local, "checkout", "--quiet", "--detach", localRoot);
	git(local, "commit", "--quiet", "--allow-empty", "-m", "unmerged change");
	sideCommit = git(local, "rev-parse", "HEAD");
	git(local, "checkout", "--quiet", "main");
});

afterAll(() => {
	if (root) rmSync(root, { recursive: true, force: true });
});

function issues(commit: string, sourceRoot: string | undefined) {
	const measurement = { ...scenario.measurement, git_commit: commit };
	const recorded = { ...baseline, git_commit: commit };
	const mutationBaseline: Baseline = {
		...mutation,
		calibration_status: "observed",
		sample_count: 20,
		warmup_count: 1,
		git_commit: commit,
		source_repository: "github.com/evandro-miguel/afol",
		timestamp: "2026-01-01T00:00:00.000Z",
		provenance: "fresh-local-runnable-smoke",
		host_profile_id: "linux-x64-test",
		os: "linux",
		arch: "x64",
		cpu_class: "test",
		bun_version: "1.3.14",
		runtime_version: "1.3.14",
		execution_mode: "compiled-release",
		artifact_mode: "bun-compile",
		artifact_sha256: "a".repeat(64),
	};
	delete mutationBaseline.calibration_reason;
	for (const record of [measurement, recorded]) {
		if (sourceRoot === undefined) delete record.source_root_commit;
		else record.source_root_commit = sourceRoot;
	}
	if (sourceRoot === undefined) delete mutationBaseline.source_root_commit;
	else mutationBaseline.source_root_commit = sourceRoot;
	return {
		benchmark: validateBenchmarkProvenance(
			local,
			{ ...scenario, measurement },
			recorded,
		),
		mutation: validateMutationBaselineContract(local, [], {
			...mutationBaseline,
		}),
	};
}

test("a reused URL preserves references to a different source history", () => {
	expect(externalRoot).not.toBe(localRoot);
	expect(issues(externalRoot, externalRoot)).toEqual({
		benchmark: [],
		mutation: [],
	});
	expect(issues(localHead, localRoot)).toEqual({ benchmark: [], mutation: [] });
});

test("missing commits in local or unspecified history still fail", () => {
	for (const sourceRoot of [undefined, localRoot]) {
		const result = issues(externalRoot, sourceRoot);
		expect(
			result.benchmark.some((issue) => issue.includes("commit-not-found")),
		).toBe(true);
		expect(result.mutation).toContain("mutation-baseline-git-commit-not-found");
	}
});

test("malformed roots and known non-root commits cannot waive missing commits", () => {
	for (const sourceRoot of ["invalid", localHead]) {
		const result = issues(externalRoot, sourceRoot);
		expect(
			result.benchmark.some((issue) => issue.includes("source-root-invalid")),
		).toBe(true);
		expect(result.mutation).toContain("mutation-baseline-source-root-invalid");
		expect(result.mutation).toContain("mutation-baseline-git-commit-not-found");
	}
});

test("local commits cannot be relabeled as external history", () => {
	const result = issues(localHead, externalRoot);
	expect(
		result.benchmark.some(
			(issue) =>
				issue.includes("mismatch") && issue.endsWith("source_root_commit"),
		),
	).toBe(true);
	expect(result.mutation).toContain("mutation-baseline-source-root-mismatch");
});

test("unmerged local commits still fail ancestry checks", () => {
	const result = issues(sideCommit, localRoot);
	expect(
		result.benchmark.some((issue) => issue.includes("commit-not-ancestor")),
	).toBe(true);
	expect(result.mutation).toContain(
		"mutation-baseline-git-commit-not-ancestor",
	);
});

test("scenario and baseline must identify the same source history", () => {
	const result = validateBenchmarkProvenance(
		local,
		{
			...scenario,
			measurement: { ...scenario.measurement, source_root_commit: localRoot },
		},
		baseline,
	);
	expect(
		result.some(
			(issue) =>
				issue.includes("mismatch") && issue.endsWith("source_root_commit"),
		),
	).toBe(true);
});
