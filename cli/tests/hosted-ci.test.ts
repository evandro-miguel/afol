import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type WorkflowStep = {
	name?: string;
	uses?: string;
	run?: string;
	with?: Record<string, unknown>;
};

type WorkflowJob = {
	if?: string;
	name?: string;
	needs?: string[];
	"runs-on"?: string;
	steps?: WorkflowStep[];
	"timeout-minutes"?: number;
};

type Workflow = {
	concurrency?: {
		"cancel-in-progress"?: boolean;
		group?: string;
	};
	jobs?: Record<string, WorkflowJob>;
	name?: string;
	on?: {
		pull_request?: unknown;
		push?: { branches?: string[] };
	};
	permissions?: Record<string, string>;
};

const repoRoot = join(import.meta.dir, "..", "..");
const workflowDirectory = join(repoRoot, ".github", "workflows");
const workflowPath = join(workflowDirectory, "ci.yml");

const checkoutRef = "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd";
const setupBunRef =
	"oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5";

function commands(job: WorkflowJob | undefined): string[] {
	return (job?.steps ?? []).flatMap((step) =>
		step.run === undefined ? [] : [step.run],
	);
}

describe("hosted CI contract", () => {
	test("allows only the governed CI workflow", () => {
		const workflows = readdirSync(workflowDirectory, { withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name)
			.sort();

		expect(workflows).toEqual(["ci.yml"]);
	});

	test("keeps PR checks read-only, pinned, and release-independent", () => {
		const source = readFileSync(workflowPath, "utf8");
		const workflow = Bun.YAML.parse(source) as Workflow;
		const jobs = workflow.jobs ?? {};

		expect(Object.keys(workflow).sort()).toEqual([
			"concurrency",
			"jobs",
			"name",
			"on",
			"permissions",
		]);
		expect(workflow.name).toBe("CI");
		expect(Object.keys(workflow.on ?? {}).sort()).toEqual([
			"pull_request",
			"push",
		]);
		expect(workflow.on?.pull_request).toBeNull();
		expect(workflow.on?.push?.branches).toEqual(["main"]);
		expect(workflow.permissions).toEqual({ contents: "read" });
		expect(workflow.concurrency).toEqual({
			"cancel-in-progress": true,
			group: [
				"ci-",
				"$",
				"{{ github.workflow }}-",
				"$",
				"{{ github.ref }}",
			].join(""),
		});
		expect(Object.keys(jobs).sort()).toEqual([
			"core-smoke",
			"deep-validation",
			"quality",
			"tests",
		]);
		const expectedTimeouts: Record<string, number> = {
			"core-smoke": 20,
			"deep-validation": 60,
			quality: 20,
			tests: 30,
		};

		for (const [jobId, job] of Object.entries(jobs)) {
			const expectedJobKeys = ["name", "runs-on", "steps", "timeout-minutes"];
			if (jobId === "deep-validation") expectedJobKeys.push("if", "needs");
			expect(Object.keys(job).sort()).toEqual(expectedJobKeys.sort());
			expect(job.name).toBe(jobId);
			expect(job["runs-on"]).toBe("ubuntu-24.04");
			expect(job["timeout-minutes"]).toBe(expectedTimeouts[jobId]);

			for (const step of job.steps ?? []) {
				expect(Object.keys(step).sort()).toEqual(
					step.uses === undefined ? ["name", "run"] : ["name", "uses", "with"],
				);
			}

			const checkout = job.steps?.find((step) => step.uses === checkoutRef);
			expect(checkout?.with).toEqual({
				"fetch-depth": 0,
				"persist-credentials": false,
			});

			const setupBun = job.steps?.find((step) => step.uses === setupBunRef);
			expect(setupBun?.with).toEqual({ "bun-version": "1.3.14" });
			expect(commands(job)).toContain("bun install --frozen-lockfile");
		}

		const actionRefs = Object.values(jobs).flatMap((job) =>
			(job.steps ?? []).flatMap((step) =>
				step.uses === undefined ? [] : [step.uses],
			),
		);
		expect([...new Set(actionRefs)].sort()).toEqual(
			[checkoutRef, setupBunRef].sort(),
		);
		for (const actionRef of actionRefs) {
			expect(actionRef).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u);
		}

		expect(commands(jobs.quality)).toEqual([
			"bun install --frozen-lockfile",
			"bun run validate:toolchain",
			"bun run public:audit -- .",
			"bun run typecheck",
			"bun run validate:template",
		]);
		expect(commands(jobs.tests)).toEqual([
			"bun install --frozen-lockfile",
			"bun run test:ci",
		]);
		expect(commands(jobs["core-smoke"])).toEqual([
			"bun install --frozen-lockfile",
			"bun run validate:bootstrap",
			"bun run build",
			"bun run release:provenance",
			"bun run smoke:example",
		]);
		expect(jobs["deep-validation"]?.if).toBe(
			"github.event_name == 'push' && github.ref == 'refs/heads/main'",
		);
		expect(jobs["deep-validation"]?.needs).toEqual([
			"quality",
			"tests",
			"core-smoke",
		]);
		expect(commands(jobs["deep-validation"])).toEqual([
			"bun install --frozen-lockfile",
			"bun run test:full",
			"bun run coverage:check",
			"bun run build:deterministic",
			"bun run smoke:dist",
			"bun run smoke:clean",
		]);

		expect(source).not.toContain("pull_request_target");
		expect(source).not.toMatch(/\bsecrets\s*(?:\.|\[)/u);
		expect(source).not.toContain("actions/cache");
		expect(source).not.toContain("upload-artifact");
		expect(source).not.toContain("validate:release");
	});
});
