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
import { kernelRegistry } from "../registry";
import { waiveSpecCheck } from "../services/spec-gate/checker";
import { newWorkstream, recordEvidence } from "../services/workbench/lifecycle";
import { readSessionContext } from "../services/workbench/session-context";

const kernelPath = `${process.cwd()}/cli/main.ts`;
const templateConfig = JSON.stringify({
	schema_version: 1,
	project: {
		name: "afol",
	},
});
const templateLock = JSON.stringify({
	schema_version: 1,
	revision: "e178aaf",
	project: "afol",
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
	const afolDir = join(root, ".afol");
	const agentsDir = join(root, ".agents");
	mkdirSync(afolDir, { recursive: true });
	mkdirSync(agentsDir, { recursive: true });

	writeFileSync(join(afolDir, "config.json"), templateConfig, "utf8");
	writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");

	return root;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

function writeWorkbenchSession(root: string, sessionId: string): void {
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(join(sessionDir, "plan.md"), "# Plan\n\nkernel test\n", "utf8");
	writeFileSync(
		join(sessionDir, "task.md"),
		[
			"# Tasks",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | pending | worker | first task |",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		[
			JSON.stringify({
				id: "E-1",
				task_id: "T-01",
				created_at: "2026-06-12T00:00:00.000Z",
				command: "bun test",
				result: "passed",
			}),
			"",
		].join("\n"),
		"utf8",
	);
}

function writeProjectBenchmarkCatalog(root: string): void {
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "project-benchmarks", "projects"), {
		recursive: true,
	});
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeJson(join(root, ".agents", "manifest.json"), {
		schema_version: 1,
		managed_hashes: {},
	});
	writeJson(join(root, ".afol", "adm", "project-benchmarks", "schema.json"), {
		schema_version: "1.0.0",
	});
	writeJson(join(root, ".afol", "adm", "project-benchmarks", "axes.json"), {
		schema_version: "1.0.0",
		axes: {
			repo_context_map: {
				weight: 15,
				description: "Uses compact repository maps or context ranking",
			},
		},
	});
	writeJson(
		join(root, ".afol", "adm", "project-benchmarks", "projects", "aider.json"),
		{
			schema_version: "1.0.0",
			id: "aider",
			name: "Aider",
			category: "direct_comparable",
			status: "active",
			source_access: "open_source",
			last_reviewed_at: "2026-06-16",
			stale_after_days: 90,
			confidence: "high",
			similarity_axes: {
				repo_context_map: {
					score: 5,
					evidence_refs: ["aider-repomap"],
				},
			},
			similarities: [
				{
					axis: "repo_context_map",
					claim: "Uses a compact repository map.",
					evidence_refs: ["aider-repomap"],
				},
			],
			differences: [{ claim: "Interactive coding rather than governance." }],
			lessons_for_afol: [
				{
					axis: "repo_context_map",
					lesson: "Build compact project context.",
				},
			],
			do_not_copy: [{ reason: "Do not copy chat-only workflow assumptions." }],
			source_refs: [
				{
					id: "aider-repomap",
					title: "Aider repository map",
					url: "https://aider.chat/docs/repomap.html",
					source_type: "official_doc",
					axes: ["repo_context_map"],
					claim: "Aider documents a concise repository map.",
				},
			],
		},
	);
}

function writeSpec(root: string, id: string, status: string): void {
	const specDir = join(root, "docs", "arc", "SPECS");
	mkdirSync(specDir, { recursive: true });
	writeFileSync(
		join(specDir, `${id}.md`),
		[
			"---",
			"doc_type: spec",
			`id: "${id}"`,
			`status: ${status}`,
			"---",
			"",
			`# ${id}`,
		].join("\n"),
		"utf8",
	);
}

function writeTaskWithSpecMetadata(
	taskPath: string,
	parentSpec: string | null,
): void {
	writeFileSync(
		taskPath,
		[
			"---",
			"feature_id: feature-done",
			...(parentSpec ? [`parent_spec: "${parentSpec}"`] : []),
			"---",
			"",
			"# Tasks",
			"",
			"## State Board",
			"",
			"| Task | State | Owner | Notes |",
			"|------|-------|-------|-------|",
			"| T-01 | pending | worker | test |",
			"",
		].join("\n"),
		"utf8",
	);
}

describe("kernel front-door", () => {
	test("-h prints compact help without requiring project files", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-help-no-project-"));
		try {
			const proc = runKernel(root, ["-h"]);
			expect(proc.status).toBe(0);
			const lines = (proc.stdout as string).trim().split("\n");
			expect(lines.length).toBeLessThanOrEqual(70);
			expect(proc.stdout as string).toContain("Usage: afol");
			expect(proc.stdout as string).toContain("Commands");
			expect(proc.stdout as string).toContain("s/status");
			expect(proc.stdout as string).toContain(
				"s/status[read] - project status",
			);
			expect(proc.stdout as string).toContain("v/validate");
			expect(proc.stdout as string).toContain("n/new");
			expect(proc.stdout as string).toContain("bench");
			expect(proc.stdout as string).toContain("afol help --verbose");
			expect(proc.stdout as string).toContain("a=afol");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("--help --verbose prints expanded catalog without requiring project files", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-help-verbose-no-project-"));
		try {
			for (const args of [
				["help", "--verbose"],
				["--help", "--verbose"],
			]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(0);
				expect(proc.stdout as string).toContain("  project-benchmark");
				expect(proc.stdout as string).toContain("    aliases: pb");
				expect(proc.stdout as string).toContain("    subcommands:");
				expect(proc.stdout as string).toContain(
					"      generate --check [read]",
				);
			}
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

	test("help command prints registry-backed command help", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-command-help-no-project-"));
		try {
			for (const args of [
				["help", "status"],
				["help", "s"],
			]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(0);
				expect(proc.stdout as string).toContain("Command: status");
				expect(proc.stdout as string).toContain("Aliases: s");
				expect(proc.stdout as string).toContain("Category: core");
				expect(proc.stdout as string).toContain("Side effect: read");
				expect(proc.stdout as string).toContain(
					kernelRegistry.commands.find((entry) => entry.command === "status")
						?.description ?? "",
				);
			}

			const unknown = runKernel(root, ["help", "nope"]);
			expect(unknown.status).toBe(2);
			expect(unknown.stderr as string).toContain("err unknown-command");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("help json surfaces catalog and single command metadata", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-help-json-no-project-"));
		try {
			const catalog = runKernel(root, ["help", "--json"]);
			expect(catalog.status).toBe(0);
			const catalogPayload = JSON.parse(catalog.stdout as string) as Array<{
				command: string;
				aliases: string[];
				kind: string;
				sideEffect: string;
				description: string;
				category?: string;
			}>;
			expect(catalogPayload.map((entry) => entry.command)).toEqual(
				expect.arrayContaining(["status", "hook", "pstr", "adm", "bench"]),
			);
			expect(
				catalogPayload.find((entry) => entry.command === "status")?.aliases,
			).toEqual(["s"]);
			expect(
				catalogPayload.every((entry) => !entry.aliases.includes(entry.command)),
			).toBe(true);

			const single = runKernel(root, ["help", "status", "--json"]);
			expect(single.status).toBe(0);
			const singlePayload = JSON.parse(single.stdout as string) as {
				command: string;
				aliases: string[];
				kind: string;
				sideEffect: string;
				description: string;
				requires_approval: boolean;
				category?: string;
				subcommands?: Array<{
					usage: string;
					sideEffect: string;
					description: string;
					requires_approval: boolean;
				}>;
			};
			expect(singlePayload).toEqual({
				command: "status",
				aliases: ["s"],
				kind: "status",
				sideEffect: "read",
				description: "Show current project status",
				requires_approval: false,
				category: "core",
				subcommands: [
					{
						usage: "--json",
						sideEffect: "read",
						description: "Emit machine-readable project status",
						requires_approval: false,
					},
					{
						usage: "--health",
						sideEffect: "read",
						description: "Include global health findings",
						requires_approval: false,
					},
					{
						usage: "--session <session-id>",
						sideEffect: "read",
						description: "Resolve status around a specific session",
						requires_approval: false,
					},
					{
						usage: "--task-id <task-id>",
						sideEffect: "read",
						description: "Resolve a specific task in the selected session",
						requires_approval: false,
					},
				],
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project-benchmark routes through the kernel front-door", () => {
		const root = mkProjectRoot("project-benchmark", "");
		try {
			writeProjectBenchmarkCatalog(root);

			const list = runKernel(root, ["pb", "list", "--json"]);
			expect(list.status).toBe(0);
			const listPayload = JSON.parse(list.stdout as string) as {
				action: string;
				data: { projects: Array<{ id: string }> };
			};
			expect(listPayload.action).toBe("project-benchmark.list");
			expect(listPayload.data.projects[0]?.id).toBe("aider");

			const show = runKernel(root, ["pb", "show", "aider", "--json"]);
			expect(show.status).toBe(0);
			const showPayload = JSON.parse(show.stdout as string) as {
				action: string;
				data: { project: { id: string } };
			};
			expect(showPayload.action).toBe("project-benchmark.show");
			expect(showPayload.data.project.id).toBe("aider");

			const matrix = runKernel(root, ["pb", "matrix", "--json"]);
			expect(matrix.status).toBe(0);
			const matrixPayload = JSON.parse(matrix.stdout as string) as {
				action: string;
				data: { projects: Array<{ id: string }> };
			};
			expect(matrixPayload.action).toBe("project-benchmark.matrix");
			expect(matrixPayload.data.projects[0]?.id).toBe("aider");

			const recommend = runKernel(root, [
				"project-benchmark",
				"recommend",
				"--for",
				"repo_context_map",
			]);
			expect(recommend.status).toBe(0);
			expect(recommend.stdout as string).toContain("axis: repo_context_map");
			expect(recommend.stdout as string).toContain("top references:");

			const validate = runKernel(root, ["pb", "validate", "--json"]);
			expect(validate.status).toBe(0);
			const validatePayload = JSON.parse(validate.stdout as string) as {
				action: string;
				data: { ok: boolean };
			};
			expect(validatePayload.action).toBe("project-benchmark.validate");
			expect(validatePayload.data.ok).toBe(true);

			const generate = runKernel(root, ["pb", "generate", "--json"]);
			expect(generate.status).toBe(0);
			const generatePayload = JSON.parse(generate.stdout as string) as {
				action: string;
				data: {
					mode: string;
					ok: boolean;
					files: Array<{ path: string }>;
					changed_files: Array<{ path: string }>;
				};
			};
			expect(generatePayload.action).toBe("project-benchmark.generate");
			expect(generatePayload.data.mode).toBe("write");
			expect(generatePayload.data.ok).toBe(true);
			expect(generatePayload.data.changed_files).toHaveLength(4);
			expect(
				generatePayload.data.files.some((file) =>
					file.path.endsWith("similarity-matrix.json"),
				),
			).toBe(true);
			expect(
				existsSync(
					join(root, ".afol", "data", "project-benchmarks", "index.json"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project-benchmark compact aliases match canonical front-door behavior", () => {
		const root = mkProjectRoot("project-benchmark-parity", "");
		try {
			writeProjectBenchmarkCatalog(root);

			const cases: Array<{ compact: string[]; canonical: string[] }> = [
				{
					compact: ["pb", "list", "--json"],
					canonical: ["project-benchmark", "list", "--json"],
				},
				{
					compact: ["pb", "validate", "--json"],
					canonical: ["project-benchmark", "validate", "--json"],
				},
				{
					compact: ["pb", "rec", "-f", "repo_context_map"],
					canonical: [
						"project-benchmark",
						"recommend",
						"--for",
						"repo_context_map",
					],
				},
			];

			for (const { compact, canonical } of cases) {
				const compactProc = runKernel(root, compact);
				const canonicalProc = runKernel(root, canonical);
				expect(compactProc.status).toBe(0);
				expect(canonicalProc.status).toBe(0);
				expect(compactProc.stdout).toBe(canonicalProc.stdout);
				expect(compactProc.stderr).toBe(canonicalProc.stderr);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project-benchmark compact aliases preserve native argument failures", () => {
		const root = mkProjectRoot("project-benchmark-negative", "");
		try {
			writeProjectBenchmarkCatalog(root);
			const cases: Array<{ args: string[]; message: string }> = [
				{ args: ["pb", "zz"], message: "err unknown-action action=zz" },
				{
					args: ["pb", "rec"],
					message: "Missing --for <axis> for pb recommend.",
				},
				{
					args: ["pb", "v", "--badflag"],
					message: "Unknown project-benchmark argument: --badflag",
				},
			];

			for (const { args, message } of cases) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(2);
				expect(proc.stdout as string).toBe("");
				expect(proc.stderr as string).toContain(message);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project-benchmark generate honors approval gate while allowing check for restricted callers", () => {
		const root = mkProjectRoot("project-benchmark-agent", "");
		try {
			writeProjectBenchmarkCatalog(root);

			const denied = runKernel(root, ["--agent", "pb", "generate", "--json"]);
			expect(denied.status).toBe(2);
			const deniedPayload = JSON.parse(denied.stdout as string) as {
				ok: boolean;
				error: { code: string };
			};
			expect(deniedPayload.ok).toBe(false);
			expect(deniedPayload.error.code).toBe("approval-required");

			const remoteDenied = runKernel(root, [
				"--remote",
				"pb",
				"generate",
				"--json",
			]);
			expect(remoteDenied.status).toBe(2);
			const remoteDeniedPayload = JSON.parse(remoteDenied.stdout as string) as {
				ok: boolean;
				error: { code: string };
			};
			expect(remoteDeniedPayload.ok).toBe(false);
			expect(remoteDeniedPayload.error.code).toBe("approval-required");

			const staleCheck = runKernel(root, [
				"--agent",
				"pb",
				"generate",
				"--check",
				"--json",
			]);
			expect(staleCheck.status).toBe(1);
			const staleCheckPayload = JSON.parse(staleCheck.stdout as string) as {
				ok: boolean;
				error: { code: string };
				data: { mode: string; ok: boolean; changed_files: unknown[] };
			};
			expect(staleCheckPayload.ok).toBe(false);
			expect(staleCheckPayload.error.code).toBe("generated-output-stale");
			expect(staleCheckPayload.data.mode).toBe("check");
			expect(staleCheckPayload.data.ok).toBe(false);
			expect(staleCheckPayload.data.changed_files).toHaveLength(4);

			const generated = runKernel(root, ["pb", "generate", "--json"]);
			expect(generated.status).toBe(0);

			const cleanCheck = runKernel(root, [
				"--agent",
				"pb",
				"generate",
				"--check",
				"--json",
			]);
			expect(cleanCheck.status).toBe(0);
			const cleanCheckPayload = JSON.parse(cleanCheck.stdout as string) as {
				ok: boolean;
				data: { mode: string; ok: boolean; changed_files: unknown[] };
			};
			expect(cleanCheckPayload.ok).toBe(true);
			expect(cleanCheckPayload.data.mode).toBe("check");
			expect(cleanCheckPayload.data.ok).toBe(true);
			expect(cleanCheckPayload.data.changed_files).toHaveLength(0);

			const remoteCleanCheck = runKernel(root, [
				"--remote",
				"pb",
				"generate",
				"--check",
				"--json",
			]);
			expect(remoteCleanCheck.status).toBe(0);
			const remoteCleanCheckPayload = JSON.parse(
				remoteCleanCheck.stdout as string,
			) as {
				ok: boolean;
				data: { mode: string; ok: boolean; changed_files: unknown[] };
			};
			expect(remoteCleanCheckPayload.ok).toBe(true);
			expect(remoteCleanCheckPayload.data.mode).toBe("check");
			expect(remoteCleanCheckPayload.data.ok).toBe(true);
			expect(remoteCleanCheckPayload.data.changed_files).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("maintenance review honors approval gate through the kernel front-door", () => {
		const root = mkProjectRoot("maintenance-agent", "");
		try {
			const reviewPath = join(
				root,
				".afol",
				"data",
				"maintenance",
				"reviews.json",
			);
			const denied = runKernel(root, [
				"--agent",
				"maintenance",
				"review",
				"--area",
				"rules",
			]);
			expect(denied.status).toBe(2);
			expect(denied.stderr as string).toContain(
				"maintenance review requires local interactive approval",
			);
			expect(existsSync(reviewPath)).toBe(false);

			const dryRun = runKernel(root, [
				"--agent",
				"maintenance",
				"review",
				"--area",
				"rules",
				"--dry-run",
				"--json",
			]);
			expect(dryRun.status).toBe(0);
			const payload = JSON.parse(dryRun.stdout as string) as {
				dry_run: boolean;
				applied: boolean;
				reviewed_areas: string[];
			};
			expect(payload.dry_run).toBe(true);
			expect(payload.applied).toBe(false);
			expect(payload.reviewed_areas).toEqual(["rules"]);
			expect(existsSync(reviewPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ctx and local-state write commands honor approval gate through the kernel front-door", () => {
		const root = mkProjectRoot("guarded-writes-agent", "");
		try {
			const ctxDenied = runKernel(root, ["--agent", "ctx", "build", "--json"]);
			expect(ctxDenied.status).toBe(2);
			const ctxPayload = JSON.parse(ctxDenied.stdout as string) as {
				ok: boolean;
				action: string;
				error: { code: string };
			};
			expect(ctxPayload.ok).toBe(false);
			expect(ctxPayload.action).toBe("ctx.build");
			expect(ctxPayload.error.code).toBe("approval-required");

			const localStateDenied = runKernel(root, [
				"--remote",
				"local-state",
				"rebuild",
				"--json",
			]);
			expect(localStateDenied.status).toBe(2);
			const localStatePayload = JSON.parse(
				localStateDenied.stdout as string,
			) as {
				ok: boolean;
				action: string;
				error: { code: string };
			};
			expect(localStatePayload.ok).toBe(false);
			expect(localStatePayload.action).toBe("local-state.rebuild");
			expect(localStatePayload.error.code).toBe("approval-required");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("session bind honors restricted context through the kernel front-door", () => {
		const root = mkProjectRoot("session-bind-agent", "");
		try {
			writeWorkbenchSession(root, "BOUND");
			writeFileSync(
				join(root, ".afol", "wb", "BOUND", "BOUND_task_01.md"),
				"# task\n",
				"utf8",
			);

			const denied = runKernel(root, [
				"--agent",
				"session",
				"bind",
				"--session",
				"BOUND",
			]);

			expect(denied.status).toBe(2);
			expect(denied.stdout as string).toBe("");
			expect(denied.stderr as string).toContain(
				"session bind requires local interactive approval",
			);
			expect(readSessionContext(root).bindings).toHaveLength(0);
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
				["s", "-j", "--json"],
				["status", "--json"],
				["status", "-j", "--json"],
				["-j", "status", "--json"],
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

	test("hydrate flag-only aliases route without empty action argument", () => {
		const root = mkProjectRoot("hydrate-flag-aliases", "");
		writeWorkbenchSession(root, "test-session");
		try {
			for (const args of [
				["hydrate", "-S", "test-session"],
				["hy", "-S", "test-session"],
			]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(0);
				expect(proc.stdout as string).toContain("hydrate: ok");
				expect(proc.stdout as string).toContain("session: test-session");
				expect(proc.stderr as string).not.toContain(
					"Unknown hydrate argument:",
				);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("deprecated render command routes to memory render", () => {
		const root = mkProjectRoot(
			"render-compat",
			"#!/usr/bin/env bash\necho LEGACY:$*",
		);
		try {
			const proc = runKernel(root, ["render", "--json"]);
			expect(proc.status).toBe(0);
			const payload = JSON.parse(proc.stdout as string) as {
				ok: boolean;
				data: { markdown: string };
			};
			expect(payload.ok).toBe(true);
			expect(payload.data.markdown).toContain("entries: 0");
			expect(proc.stderr as string).not.toContain("unknown-command");
			expect(proc.stdout as string).not.toContain("LEGACY:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("compact aliases preserve native failures for unknown scoped input", () => {
		const root = mkProjectRoot(
			"alias-negative",
			"#!/usr/bin/env bash\necho LEGACY:$*",
		);
		try {
			const cases: Array<{ args: string[]; message: string }> = [
				{ args: ["ad", "zz"], message: "Unknown adm action: zz" },
				{
					args: ["ss", "zz"],
					message: "err session-action-unknown",
				},
				{ args: ["be", "-T"], message: "Unknown bench argument: -T" },
				{
					args: ["update", "ck", "-x"],
					message: "Unknown update argument: -x",
				},
				{
					args: ["-j", "sttaus"],
					message: "err unknown-flag flag=-j",
				},
			];

			for (const { args, message } of cases) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(2);
				expect(proc.stdout as string).toBe("");
				expect(proc.stderr as string).toContain(message);
				expect(proc.stdout as string).not.toContain("LEGACY:");
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
				["bootstrap", target, "--dry-run", "--verbose"],
				["b", target, "--dry-run", "--verbose"],
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
			const proc = runKernel(root, ["init", "--dry-run", "--verbose"]);
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
				"--verbose",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stderr as string).toBe("");
			expect(proc.stdout as string).not.toContain(
				"provider-compatible-cleanup-archived .agents/skills",
			);
			expect(proc.stdout as string).toContain(
				"provider-compatible-cleanup-archived .agents/wb",
			);
			expect(proc.stdout as string).toContain("archive=.afol/data/migrations/");
			expect(existsSync(join(root, ".agents", "skills", "custom.md"))).toBe(
				true,
			);
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
			expect(existsSync(join(archiveRoot, "skills", "custom.md"))).toBe(false);
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

	test("planned F-18 groups route to pstr handler", () => {
		const script = "#!/usr/bin/env bash\necho LEGACY:$*";
		const root = mkProjectRoot("subcommand-stub", script);
		try {
			const proc = runKernel(root, ["pstr", "rebuild"]);

			expect(proc.status).toBe(0);
			expect(proc.stdout as string).toContain("pstr rebuild: ok");
			expect(proc.stderr as string).toBe("");
			expect(proc.stderr as string).not.toContain("LEGACY:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("adm compact action aliases route through native handler", () => {
		const script = "#!/usr/bin/env bash\necho LEGACY:$*";
		const root = mkProjectRoot("adm-compact-aliases", script);
		try {
			const paths = runKernel(root, ["ad", "p"]);
			expect(paths.status).toBe(0);
			expect(paths.stdout as string).toContain("admDir:");
			expect(paths.stderr as string).toBe("");
			expect(paths.stdout as string).not.toContain("LEGACY:");

			const validate = runKernel(root, ["ad", "v"]);
			expect(validate.status).toBe(0);
			expect(validate.stdout as string).toContain("validate:");
			expect(validate.stderr as string).toBe("");
			expect(validate.stdout as string).not.toContain("Unknown adm action");
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

	test("start and close help are native and do not require project state", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-lifecycle-help-"));
		try {
			for (const [command, expected] of [
				["start", "Usage: afol start"],
				["close", "Usage: afol close"],
			] as const) {
				for (const flag of ["-h", "--help"]) {
					const proc = runKernel(root, [command, flag]);
					expect(proc.status).toBe(0);
					expect(proc.stdout as string).toContain(expected);
					expect(proc.stderr as string).toBe("");
					expect(proc.stdout as string).not.toContain("task started:");
					expect(proc.stdout as string).not.toContain("session closed:");
				}
			}
			expect(existsSync(join(root, ".afol", "wb"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("spec list routes through native handler and group help uses registry", () => {
		const root = mkProjectRoot("spec-list", "");
		try {
			const specsDir = join(root, ".afol", "adm", "specs");
			mkdirSync(specsDir, { recursive: true });
			writeFileSync(
				join(specsDir, "spec-001.md"),
				[
					"---",
					"doc_type: spec",
					'id: "spec-001"',
					"status: active",
					"---",
					"",
					"# Spec 001",
					"",
				].join("\n"),
				"utf8",
			);

			const list = runKernel(root, ["spec", "list", "--json"]);
			expect(list.status).toBe(0);
			expect(list.stderr as string).toBe("");
			const payload = JSON.parse(list.stdout as string) as {
				action: string;
				count: number;
				data: { specs: { id: string }[] };
			};
			expect(payload.action).toBe("list");
			expect(payload.count).toBe(1);
			expect(payload.data.specs[0]?.id).toBe("spec-001");

			const help = runKernel(root, ["spec", "--help"]);
			expect(help.status).toBe(0);
			expect(help.stdout as string).toContain("Command: spec");
			expect(help.stderr as string).toBe("");
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
			expect(proc.stdout as string).toContain("governance_status: governed");
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

	test("new accepts repeated --task flags and renders multiple task rows", () => {
		const script = "#!/usr/bin/env bash\necho LEGACY:$*";
		const root = mkProjectRoot("new-multi-task-flags", script);
		try {
			const proc = runKernel(root, [
				"new",
				"retirement-bridge",
				"--task",
				"Investigate parser state",
				"--task",
				"Patch lifecycle renderer",
				"--json",
			]);

			expect(proc.status).toBe(0);
			const payload = JSON.parse(proc.stdout as string) as {
				data: { session: string };
			};
			const session = payload.data.session;
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

			expect(plan).toContain("- task: Investigate parser state");
			expect(plan).toContain("- task: Patch lifecycle renderer");
			expect(plan).toContain("- T-01: Investigate parser state");
			expect(plan).toContain("- T-02: Patch lifecycle renderer");
			expect(task).toContain(
				"| T-01 | pending | worker | Investigate parser state |",
			);
			expect(task).toContain(
				"| T-02 | pending | worker | Patch lifecycle renderer |",
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

	test("done without spec flag stays unchanged", () => {
		const root = mkProjectRoot(
			"done-plain",
			"#!/usr/bin/env bash\necho LEGACY:$*",
		);
		try {
			const created = newWorkstream(root, "plain done");
			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});

			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
			]);
			expect(proc.status).toBe(0);
			expect(proc.stdout as string).toContain("task done: T-01");
			expect(proc.stderr as string).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done with compatible spec check passes", () => {
		const root = mkProjectRoot(
			"done-compatible",
			"#!/usr/bin/env bash\necho LEGACY:$*",
		);
		try {
			const created = newWorkstream(root, "compatible done", {
				featureId: "feature-done",
				parentSpec: "spec-001",
			});
			writeSpec(root, "spec-001", "active");
			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});

			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--require-spec-check",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stdout as string).toContain("task done: T-01");
			expect(proc.stderr as string).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done with not_applicable spec check passes", () => {
		const root = mkProjectRoot(
			"done-not-applicable",
			"#!/usr/bin/env bash\necho LEGACY:$*",
		);
		try {
			const created = newWorkstream(root, "no spec done", {
				noSpecRequiredReason: "test waiver",
			});
			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});

			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--require-spec-check",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stdout as string).toContain("task done: T-01");
			expect(proc.stderr as string).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done with missing spec blocks spec check", () => {
		const root = mkProjectRoot(
			"done-missing-spec",
			"#!/usr/bin/env bash\necho LEGACY:$*",
		);
		try {
			const created = newWorkstream(root, "missing spec done", {
				featureId: "feature-missing",
				parentSpec: "spec-missing",
			});

			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--require-spec-check",
			]);

			expect(proc.status).toBe(1);
			expect(proc.stdout as string).toBe("");
			expect(proc.stderr as string).toContain("spec check failed:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("done with waived spec passes", () => {
		const root = mkProjectRoot(
			"done-waived",
			"#!/usr/bin/env bash\necho LEGACY:$*",
		);
		try {
			const created = newWorkstream(root, "waived done", {
				parentSpec: "spec-missing",
			});
			writeTaskWithSpecMetadata(created.taskPath, "spec-missing");
			waiveSpecCheck(root, created.session, "T-01", "needs override");
			recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
			});

			const proc = runKernel(root, [
				"done",
				"--session",
				created.session,
				"--task-id",
				"T-01",
				"--require-spec-check",
			]);

			expect(proc.status).toBe(0);
			expect(proc.stdout as string).toContain("task done: T-01");
			expect(proc.stderr as string).toBe("");
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

	test("check benchmark family preserves benchmark parser behavior", () => {
		const root = mkProjectRoot(
			"check-benchmark-route",
			"#!/usr/bin/env bash\necho LEGACY:$*\n",
		);
		try {
			for (const args of [
				["check", "select", "--broken"],
				["ck", "select", "--broken"],
			]) {
				const proc = runKernel(root, args);
				expect(proc.status).toBe(2);
				expect(proc.stderr as string).toContain(
					"Unknown validation argument: --broken",
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
				paths: { config: string; config_source: string };
			};
			expect(payload.paths.config).toBe(join(root, ".afol", "config.json"));
			expect(payload.paths.config_source).toBe("canonical");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns non-zero when config or lock are missing/invalid", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-missing-"));
		const afolDir = join(root, ".afol");
		const agentsDir = join(root, ".agents");
		mkdirSync(afolDir, { recursive: true });
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(join(afolDir, "config.json"), "{invalid-json", "utf8");
		writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");

		try {
			const proc = runKernel(root, ["status"]);
			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toContain("Invalid JSON in");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}

		const rootMissing = mkdtempSync(join(tmpdir(), "kernel-missing-lock-"));
		const missingAfolDir = join(rootMissing, ".afol");
		const missingAgentsDir = join(rootMissing, ".agents");
		mkdirSync(missingAfolDir, { recursive: true });
		mkdirSync(missingAgentsDir, { recursive: true });
		writeFileSync(join(missingAfolDir, "config.json"), templateConfig, "utf8");

		try {
			const proc = runKernel(rootMissing, ["status"]);
			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toContain("Missing required file");
		} finally {
			rmSync(rootMissing, { recursive: true, force: true });
		}
	});
});
