import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CLI_VERSION } from "../generated/version";

const kernelPath = `${process.cwd()}/cli/main.ts`;
const templateConfig = JSON.stringify({
	schema_version: 1,
	project: {
		name: "agentic-start-folder-dev-refactor-ts",
	},
});
const templateLock = JSON.stringify({
	schema_version: 1,
	revision: "e178aaf",
	project: "agentic-start-folder-dev-refactor-ts",
	locked: true,
});

function runKernel(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function mkProjectRoot(name: string, fakeAgentsBody: string): string {
	void fakeAgentsBody;
	const root = mkdtempSync(join(tmpdir(), `kernel-${name}-`));
	const agentsDir = join(root, ".agents");
	mkdirSync(agentsDir, { recursive: true });

	writeFileSync(join(agentsDir, "config.json"), templateConfig, "utf8");
	writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");

	return root;
}

describe("kernel front-door", () => {
	test("-h prints compact help without requiring project files", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-help-no-project-"));
		try {
			const proc = runKernel(root, ["-h"]);
			expect(proc.status).toBe(0);
			const lines = (proc.stdout as string).trim().split("\n");
			expect(lines.length).toBeLessThanOrEqual(30);
			expect(proc.stdout as string).toContain("Usage: afol");
			expect(proc.stdout as string).toContain("Commands");
			expect(proc.stdout as string).toContain("s/status");
			expect(proc.stdout as string).toContain("v/validate");
			expect(proc.stdout as string).toContain("n/new");
			expect(proc.stdout as string).toContain("a=afol");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--version prints version without requiring project files", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-version-no-project-"));
		try {
			for (const args of [["--version"], ["-V"], ["version"]]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(0);
				expect((proc.stdout as string).trim()).toBe(`afol ${CLI_VERSION}`);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("status alias and json shorthands are normalized", () => {
		const script = "#!/usr/bin/env bash\necho ARGS:$*";
		const root = mkProjectRoot("aliases", script);
		try {
			const statusCases: string[][] = [
				["s"],
				["status"],
				["-j"],
				["--json"],
				["-j", "s"],
				["s", "-j"],
				["status", "--json"],
			];

			for (const args of statusCases) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(0);
				if (args.some((arg) => arg === "-j" || arg === "--json")) {
					const payload = JSON.parse(proc.stdout as string) as Record<
						string,
						unknown
					>;
					expect(payload.status).toBe("none");
					expect(payload.task).toBe("none");
				} else {
					expect(proc.stdout as string).toContain("STATUS: none");
					expect(proc.stdout as string).toContain("TASK: none");
				}
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("legacy-prefixed delegate commands are retired", () => {
		const script = "#!/usr/bin/env bash\necho ARGS:$*";
		const root = mkProjectRoot("legacy-delegate", script);
		try {
			for (const args of [
				["legacy:t", "list"],
				["legacy:inspect-target", "--repo-root", "/tmp/project"],
				["legacy:adoption-plan", "--repo-root", "/tmp/project"],
			]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(2);
				expect(proc.stdout as string).toBe("");
				expect(proc.stderr as string).toContain(
					`err unknown-command command=${args[0]}`,
				);
				expect(proc.stderr as string).toContain('hint="run afol -h"');
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("delegate-only tokens are no longer public commands or suggestions", () => {
		const root = mkProjectRoot(
			"public-delegate-hidden",
			"#!/usr/bin/env bash\necho LEGACY:$*\n",
		);
		try {
			for (const args of [
				["task", "list"],
				["query", "recent"],
			]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(2);
				expect(proc.stdout as string).toBe("");
				expect(proc.stderr as string).toContain(
					`err unknown-command command=${args[0]}`,
				);
				expect(proc.stderr as string).toContain('hint="run afol -h"');
				expect(proc.stderr as string).not.toContain("did_you_mean=task");
				expect(proc.stderr as string).not.toContain("did_you_mean=query");
				expect(proc.stderr as string).not.toContain("LEGACY:");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("unknown top-level command returns actionable hint without legacy fallback", () => {
		const root = mkProjectRoot(
			"unknown",
			"#!/usr/bin/env bash\necho LEGACY:$*\n",
		);
		try {
			const proc = runKernel(root, ["sttaus"]);
			expect(proc.status).toBe(2);
			expect(proc.stdout as string).toBe("");
			expect(proc.stderr as string).toContain(
				"err unknown-command command=sttaus",
			);
			expect(proc.stderr as string).toContain('hint="run afol -h"');
			expect(proc.stderr as string).toContain("did_you_mean=status");
			expect(proc.stderr as string).not.toContain("LEGACY:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("unknown command fails before project-root detection", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-unknown-no-project-"));
		try {
			const proc = runKernel(root, ["sttaus"]);
			expect(proc.status).toBe(2);
			expect(proc.stdout as string).toBe("");
			expect(proc.stderr as string).toContain(
				"err unknown-command command=sttaus",
			);
			expect(proc.stderr as string).not.toContain(
				"Could not detect project root",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bootstrap dry-run uses native template path without requiring project files", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-bootstrap-no-project-"));
		const target = join(root, "target");
		try {
			for (const args of [
				["bootstrap", target, "--dry-run"],
				["b", target, "--dry-run"],
			]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(0);
				expect(proc.stderr as string).toBe("");
				expect(proc.stdout as string).toContain("bootstrap:");
				expect(proc.stdout as string).toContain("mode=dry-run");
				expect(proc.stdout as string).toContain("create AGENTS.md");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("init dry-run uses current directory without requiring project files", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-init-no-project-"));
		try {
			const proc = runKernel(root, ["init", "--dry-run"]);
			expect(proc.status).toBe(0);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).toContain(`bootstrap: target=${root}`);
			expect(proc.stdout as string).toContain("mode=dry-run");
			expect(proc.stdout as string).toContain("create AGENTS.md");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("init rejects unsupported partial installs", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-init-partial-"));
		try {
			const proc = runKernel(root, ["init", "--partial"]);
			expect(proc.status).toBe(2);
			expect(proc.stdout as string).toBe("");
			expect(proc.stderr as string).toContain(
				"Unsupported init argument: --partial",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("init forwards confirmed provider-compatible mutable cleanup to bootstrap", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-init-cleanup-"));
		try {
			for (const relativePath of [
				".agents/skills/custom.md",
				".agents/wb/session/task.md",
				".agents/tmp/scratch.txt",
				".agents/data/events/events.jsonl",
			]) {
				const absolutePath = join(root, relativePath);
				mkdirSync(dirname(absolutePath), { recursive: true });
				writeFileSync(absolutePath, "legacy mutable\n", "utf8");
			}

			const proc = runKernel(root, [
				"init",
				"--provider-compatible",
				"--cleanup-provider-compatible-mutable",
				"--confirm-provider-migration",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).toContain(
				"provider-compatible-cleanup-archived .agents/skills",
			);
			expect(proc.stdout as string).toContain(
				"provider-compatible-cleanup-archived .agents/wb",
			);
			expect(proc.stdout as string).toContain("archive=.afol/data/migrations/");
			expect(existsSync(join(root, ".agents", "skills"))).toBe(false);
			expect(existsSync(join(root, ".agents", "wb"))).toBe(false);
			expect(existsSync(join(root, ".agents", "tmp"))).toBe(false);
			expect(existsSync(join(root, ".agents", "data"))).toBe(false);
			const archives = readdirSync(join(root, ".afol", "data", "migrations"));
			expect(archives).toHaveLength(1);
			const archiveRoot = join(
				root,
				".afol",
				"data",
				"migrations",
				archives[0] ?? "",
			);
			expect(existsSync(join(archiveRoot, "skills", "custom.md"))).toBe(true);
			expect(existsSync(join(archiveRoot, "wb", "session", "task.md"))).toBe(
				true,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("verify-tasks help is native and does not require legacy adapter", () => {
		const script = "#!/usr/bin/env bash\necho LEGACY:$*";
		const root = mkProjectRoot("subcommand-help", script);
		try {
			for (const args of [
				["verify-tasks", "-h"],
				["verify-tasks", "--help"],
			]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(0);
				expect(proc.stdout as string).toContain("Usage: afol verify-tasks");
				expect(proc.stdout as string).not.toContain("LEGACY:");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("new --help is native help only and does not create session", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-new-help-"));
		try {
			const proc = runKernel(root, ["new", "--help"]);

			expect(proc.status).toBe(0);
			expect(proc.stdout as string).toContain("Usage: afol new");
			expect(proc.stdout as string).toContain("--intent");
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).not.toContain("session created:");
			expect(existsSync(join(root, ".agents", "wb"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("new accepts governed metadata flags and bypasses legacy wrapper", () => {
		const script = "#!/usr/bin/env bash\necho LEGACY:$*";
		const root = mkProjectRoot("new-governed-flags", script);
		try {
			const proc = runKernel(root, [
				"n",
				"retirement-bridge",
				"--intent",
				"delivery",
				"--feature-id",
				"F-00",
				"--parent-spec",
				"260531_parent_spec_01",
				"--task",
				"Implement retirement bootstrap parity",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stdout as string).toContain("session created:");
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).not.toContain("LEGACY:");
			const match = /session created:\s*(.*)/.exec(proc.stdout as string);
			expect(match).not.toBeNull();
			const session = (match?.[1] ?? "").trim();

			const planPath = join(
				root,
				".afol",
				"wb",
				session,
				`${session}_plan_01.md`,
			);
			const taskPath = join(
				root,
				".afol",
				"wb",
				session,
				`${session}_task_01.md`,
			);
			const plan = readFileSync(planPath, "utf8");
			const task = readFileSync(taskPath, "utf8");

			expect(plan).toContain("## Native command metadata");
			expect(plan).toContain("feature_id: F-00");
			expect(plan).toContain("parent_spec: 260531_parent_spec_01");
			expect(plan).toContain("intent: delivery");
			expect(plan).toContain("task: Implement retirement bootstrap parity");
			expect(plan).toContain("## Execution Plan");
			expect(plan).toContain("- T-01: Implement retirement bootstrap parity");
			expect(plan).toContain("## Validation");
			expect(plan).toContain("## Closure Criteria");
			expect(task).toContain(
				"| T-01 | pending | worker | Implement retirement bootstrap parity |",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("workbench task command rejects unsafe session identifiers", () => {
		const root = mkProjectRoot(
			"unsafe-session",
			"#!/usr/bin/env bash\necho LEGACY:$*",
		);
		try {
			const proc = runKernel(root, [
				"start",
				"--session",
				"../bad-session",
				"T-01",
			]);

			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toContain("Invalid session identifier");
			expect(proc.stdout as string).toBe("");
			expect(proc.stderr as string).not.toContain("LEGACY:");
			expect(existsSync(join(root, ".agents", "wb"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("check routes to validation family", () => {
		const root = mkProjectRoot(
			"check-route",
			"#!/usr/bin/env bash\necho LEGACY:$*\n",
		);
		try {
			for (const args of [
				["check", "--nope"],
				["ck", "--nope"],
			]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(2);
				expect(proc.stderr as string).toContain(
					"Unknown validate argument: --nope",
				);
				expect(proc.stdout as string).toBe("");
				expect(proc.stdout as string).not.toContain("LEGACY:");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detects project root by walking up directories", () => {
		const root = mkProjectRoot(
			"detection",
			"#!/usr/bin/env bash\necho ROOT:$(pwd)",
		);
		const nested = join(root, "a", "b", "c");
		mkdirSync(nested, { recursive: true });
		try {
			const proc = runKernel(nested, ["s", "--json"]);
			expect(proc.status).toBe(0);
			const payload = JSON.parse(proc.stdout as string) as {
				paths: { config: string };
			};
			expect(payload.paths.config).toBe(join(root, ".agents", "config.json"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns non-zero when config or lock are missing/invalid", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-missing-"));
		const agentsDir = join(root, ".agents");
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(join(agentsDir, "config.json"), "{invalid-json", "utf8");
		writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");

		try {
			const proc = runKernel(root, ["status"]);
			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toContain("Invalid JSON in");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}

		const rootMissing = mkdtempSync(join(tmpdir(), "kernel-missing-lock-"));
		const missingAgentsDir = join(rootMissing, ".agents");
		mkdirSync(missingAgentsDir, { recursive: true });
		writeFileSync(
			join(missingAgentsDir, "config.json"),
			templateConfig,
			"utf8",
		);

		try {
			const proc = runKernel(rootMissing, ["status"]);
			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toContain("Missing required file");
		} finally {
			rmSync(rootMissing, { recursive: true, force: true });
		}
	});
});
