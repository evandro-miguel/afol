import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
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
import { fixedHarnessProfile } from "../services/receipts/profiles";
import { waiveSpecCheck } from "../services/spec-gate/checker";
import {
	newWorkstream,
	recordEvidence,
	startTask,
	transitionTask,
} from "../services/workbench/lifecycle";
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

function prepareDone(root: string, session: string): void {
	startTask(root, { session, taskId: "T-01" });
	recordEvidence(root, {
		session,
		taskId: "T-01",
		command: "bun test",
		result: "passed",
		exitCode: 0,
		provenance: "observed",
	});
	transitionTask(root, {
		session,
		taskId: "T-01",
		state: "implemented_untested",
	});
	transitionTask(root, {
		session,
		taskId: "T-01",
		state: "tested_needs_spec_validation",
	});
}

function runKernel(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function writeReceiptFixture(
	root: string,
	session: string,
	overrides: Record<string, unknown> = {},
): string {
	writeJson(join(root, ".afol", "config.json"), {
		schema_version: 1,
		project: {
			id: "123e4567-e89b-12d3-a456-426614174000",
			name: "receipt-test",
		},
	});
	writeFileSync(join(root, "checked.txt"), "checked\n", "utf8");
	execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "receipt@example.test"], {
		cwd: root,
	});
	execFileSync("git", ["config", "user.name", "Receipt Test"], { cwd: root });
	execFileSync("git", ["add", "."], { cwd: root });
	execFileSync("git", ["commit", "-m", "receipt fixture"], {
		cwd: root,
		stdio: "ignore",
	});
	const head = execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).trim();
	const profile = fixedHarnessProfile(kernelRegistry.commands, "coder");
	if (!profile) throw new Error("Missing coder profile fixture");
	const path = join(root, "receipt.json");
	writeJson(path, {
		receipt_id: "receipt-1",
		project_id: "123e4567-e89b-12d3-a456-426614174000",
		session_id: session,
		task_id: "T-01",
		harness_id: "external-harness",
		run_id: "run-1",
		harness_profile_id: profile.id,
		harness_profile_digest: profile.digest,
		source_commit: head,
		head_commit: head,
		diff_hash:
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		checked_paths: ["checked.txt"],
		check_command: "bun test",
		check_exit_code: 0,
		tool_trace_digest: "b".repeat(64),
		started_at: new Date(Date.now() - 60_000).toISOString(),
		finished_at: new Date().toISOString(),
		result: "passed",
		...overrides,
	});
	return path;
}

function expectRestrictedJsonError(proc: ReturnType<typeof runKernel>): void {
	expect(proc.status).toBe(2);
	expect(proc.stderr as string).toBe("");
	const payload = JSON.parse((proc.stdout as string).trim()) as {
		schema?: string;
		ok?: boolean;
		exit_code?: number;
		error?: unknown;
	};
	expect(payload.schema).toBe("afol.result/v1");
	expect(payload.ok).toBe(false);
	expect(payload.exit_code).toBe(2);
	expect(payload.error).toBeTruthy();
}

function readOptionalBytes(path: string): string | null {
	return existsSync(path) ? readFileSync(path).toString("base64") : null;
}

function expectOptionalBytesUnchanged(
	path: string,
	before: string | null,
): void {
	expect(existsSync(path)).toBe(before !== null);
	if (before !== null) {
		expect(readFileSync(path).toString("base64")).toBe(before);
	}
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
	const specDir = join(root, ".afol", "adm", "specs");
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
	test("loads command handlers lazily after routing", async () => {
		const source = readFileSync(kernelPath, "utf8");
		expect(source).not.toMatch(/from\s+"\.\/commands\//);
		expect(source).not.toMatch(/from\s+"\.\/validate\/command"/);

		const lazyHandlers = [
			["./commands/adapter", ["runAdapterCommand"]],
			["./commands/adm", ["runAdmCommand"]],
			["./commands/adr", ["runAdrCommand"]],
			["./commands/bench", ["runBenchCommand"]],
			["./commands/bootstrap", ["runBootstrapCommand"]],
			[
				"./commands/catalog",
				["runHookCommand", "runRuleCommand", "runSkillCommand"],
			],
			["./commands/catchup", ["runCatchupCommand"]],
			["./commands/changelog", ["runChangelogCommand"]],
			["./commands/close", ["runCloseCommand"]],
			["./commands/context", ["runContextCommand"]],
			["./commands/db", ["runDbCommand"]],
			["./commands/doctor", ["runDoctorCommand"]],
			["./commands/evolve", ["runEvolveCommand"]],
			["./commands/feedback", ["runFeedbackCommand"]],
			["./commands/file", ["runFileCommand"]],
			["./commands/governance", ["runGovernanceCommand"]],
			["./commands/health", ["runHealthCommand"]],
			["./commands/hydrate", ["runHydrateCommand"]],
			["./commands/init", ["runInitCommand"]],
			["./commands/legacy", ["runLegacyCommand"]],
			["./commands/library", ["runLibraryCommand"]],
			["./commands/local-state", ["runLocalStateCommand"]],
			["./commands/maintenance", ["runMaintenanceCommand"]],
			["./commands/memory", ["runMemoryCommand"]],
			["./commands/fleet", ["runFleetCommand"]],
			["./commands/preflight", ["runPreflightCommand"]],
			["./commands/project-benchmark", ["runProjectBenchmarkCommand"]],
			["./commands/pstr", ["runPstrCommand"]],
			["./commands/quick-task", ["runQuickTaskCommand"]],
			["./commands/receipt", ["runReceiptCommand"]],
			["./commands/schema-cmd", ["runSchemaCommand"]],
			["./commands/session", ["runSessionCommand"]],
			["./commands/spec", ["runSpecCommand"]],
			["./commands/state", ["runStateCommand"]],
			["./commands/status", ["runStatusCommand"]],
			["./commands/sweep", ["runSweepCommand"]],
			["./commands/telemetry", ["runTelemetryCommand"]],
			["./commands/update", ["runUpdateCommand"]],
			["./commands/ux", ["runUxCommand"]],
			["./commands/validate", ["runValidateCommand"]],
			[
				"./commands/workbench",
				[
					"runDoneCommand",
					"runEvidenceCommand",
					"runLogCommand",
					"runNewCommand",
					"runStartCommand",
					"runTransitionCommand",
					"runVerifyTasksCommand",
				],
			],
			[
				"./validate/command",
				["resolveValidateInvocation", "runValidationCommand"],
			],
		] as const;
		const lazyModules = [
			...source.matchAll(
				/await import\(\s*"(\.\/(?:commands\/[^"]+|validate\/command))"\s*\)/g,
			),
		].map((match) => match[1]);
		expect([...new Set(lazyModules)].sort()).toEqual(
			lazyHandlers.map(([modulePath]) => modulePath).sort(),
		);
		for (const [modulePath, exportNames] of lazyHandlers) {
			const moduleExports = (await import(
				join(process.cwd(), "cli", `${modulePath.slice(2)}.ts`)
			)) as Record<string, unknown>;
			for (const exportName of exportNames) {
				expect(typeof moduleExports[exportName]).toBe("function");
			}
		}
	});

	test("-h prints compact help without requiring project files", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-help-no-project-"));
		try {
			const proc = runKernel(root, ["-h"]);
			expect(proc.status).toBe(0);
			const lines = (proc.stdout as string).trim().split("\n");
			expect(lines.length).toBeLessThanOrEqual(71);
			expect(proc.stdout as string).toContain("Usage: afol");
			expect(proc.stdout as string).toContain("Commands");
			expect(proc.stdout as string).toContain("s/status");
			expect(proc.stdout as string).toContain(
				"s/status[read] - project status",
			);
			expect(proc.stdout as string).toContain("v/validate");
			expect(proc.stdout as string).toContain("n/new");
			expect(proc.stdout as string).toContain("bench");
			expect(proc.stdout as string).toContain("help --verbose|<command>");
			expect(proc.stdout as string).toContain("a=afol");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("feedback status is root-free and supports the fb alias", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-feedback-no-project-"));
		try {
			const proc = runKernel(root, ["fb", "status", "--json"]);
			expect(proc.status).toBe(0);
			expect(proc.stderr).toBe("");
			const payload = JSON.parse((proc.stdout as string).trim()) as {
				action?: string;
				ok?: boolean;
			};
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("feedback.status");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("restricted feedback mutations honor the operation policy before root loading", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-feedback-policy-"));
		try {
			const proc = runKernel(root, [
				"--agent",
				"fb",
				"purge",
				"--confirm",
				"--json",
			]);
			expect(proc.status).toBe(2);
			expect(proc.stderr).toBe("");
			const payload = JSON.parse((proc.stdout as string).trim()) as {
				action?: string;
			};
			expect(payload.action).toBe("feedback.purge");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("restricted done test-shell invocations are denied before shell execution", () => {
		const root = mkProjectRoot("done-test-shell-policy", "");
		const sentinel = join(root, "test-shell-ran");
		try {
			for (const caller of ["--agent", "--remote"] as const) {
				const proc = runKernel(root, [
					caller,
					"done",
					"--session",
					"S-RESTRICTED",
					"--task-id",
					"T-01",
					"--test-shell",
					`touch ${sentinel}`,
					"--json",
				]);

				expectRestrictedJsonError(proc);
				const payload = JSON.parse((proc.stdout as string).trim()) as {
					action?: string;
					error?: { code?: string };
				};
				expect(payload.action).toBe("workbench.done.test-shell");
				expect(payload.error?.code).toBe("approval-required");
				expect(existsSync(sentinel)).toBe(false);
			}
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
			expect(Buffer.byteLength(catalog.stdout as string, "utf8")).toBeLessThan(
				16_000,
			);
			expect(catalogPayload.every((entry) => !("subcommands" in entry))).toBe(
				true,
			);

			const unboundedVerbose = runKernel(root, ["help", "--json", "--verbose"]);
			expect(unboundedVerbose.status).toBe(2);
			expect(unboundedVerbose.stderr as string).toContain(
				"add --for planning, execution, or maintenance",
			);

			const boundedVerbose = runKernel(root, [
				"help",
				"--json",
				"--verbose",
				"--for",
				"planning",
			]);
			expect(boundedVerbose.status).toBe(0);
			expect(
				Buffer.byteLength(boundedVerbose.stdout as string, "utf8"),
			).toBeLessThan(20_000);
			expect(
				(
					JSON.parse(boundedVerbose.stdout as string) as Array<{
						subcommands?: unknown[];
					}>
				).some((entry) => Array.isArray(entry.subcommands)),
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
				stability: string;
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
				stability: "stable",
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

	test("help close --json surfaces the --admit-legacy-baseline retry contract", () => {
		const root = mkdtempSync(
			join(tmpdir(), "kernel-help-close-json-no-project-"),
		);
		try {
			const proc = runKernel(root, ["help", "close", "--json"]);
			expect(proc.status).toBe(0);
			const payload = JSON.parse(proc.stdout as string) as {
				command: string;
				subcommands?: Array<{
					usage: string;
					sideEffect: string;
					description: string;
					requires_approval: boolean;
				}>;
			};
			expect(payload.command).toBe("close");
			expect(payload.subcommands).toEqual(
				expect.arrayContaining([
					{
						usage: "--admit-legacy-baseline",
						sideEffect: "write",
						description:
							"Retry close waiving issues admitted by the legacy evidence baseline",
						requires_approval: true,
					},
				]),
			);
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

	test("R-02 restricted front door denies ADR writes", () => {
		const root = mkProjectRoot("r-02-adr", "");
		const decisionsDir = join(root, ".afol", "adm", "decisions");
		const sentinel = join(decisionsDir, "keep.md");
		mkdirSync(decisionsDir, { recursive: true });
		writeFileSync(sentinel, "synthetic decision fixture\n", "utf8");
		const beforeEntries = readdirSync(decisionsDir);
		const beforeSentinel = readFileSync(sentinel).toString("base64");
		try {
			const proc = runKernel(root, [
				"--agent",
				"adr",
				"new",
				"restricted decision",
				"--json",
			]);

			expectRestrictedJsonError(proc);
			expect(readdirSync(decisionsDir)).toEqual(beforeEntries);
			expect(readFileSync(sentinel).toString("base64")).toBe(beforeSentinel);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("restricted front door keeps JSON parity for -j and --json", () => {
		const root = mkProjectRoot("r-02-json-alias-parity", "");
		try {
			const invocations = ["--json", "-j"].map((jsonFlag) =>
				runKernel(root, [
					"--agent",
					"adr",
					"new",
					"restricted decision",
					jsonFlag,
				]),
			);

			for (const proc of invocations) {
				expectRestrictedJsonError(proc);
				const payload = JSON.parse((proc.stdout as string).trim()) as {
					action?: string;
					error?: { code?: string; message?: string };
				};
				expect(payload.action).toBe("adr.new");
				expect(payload.error?.code).toBe("approval-required");
				expect(payload.error?.message).toContain(
					"requires local interactive approval",
				);
			}

			const payloads = invocations.map((proc) =>
				JSON.parse(proc.stdout as string),
			);
			expect(payloads[0]).toEqual(payloads[1]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("SEC-003 restricted front door denies adm migration", () => {
		const root = mkProjectRoot("sec-003-adm", "");
		const source = join(root, "docs", "arc", "SPECS", "restricted.md");
		const target = join(root, ".afol", "adm", "specs", "restricted.md");
		const migrationsDir = join(root, ".afol", "adm", "migrations");
		mkdirSync(dirname(source), { recursive: true });
		writeFileSync(source, "# synthetic ADM source\n", "utf8");
		const beforeSource = readFileSync(source).toString("base64");
		try {
			const proc = runKernel(root, ["--agent", "adm", "migrate", "--json"]);

			expectRestrictedJsonError(proc);
			expect(readFileSync(source).toString("base64")).toBe(beforeSource);
			expect(existsSync(target)).toBe(false);
			expect(existsSync(migrationsDir)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("SEC-003 restricted front door denies spec waivers", () => {
		const root = mkProjectRoot("sec-003-spec", "");
		const created = newWorkstream(root, "restricted spec", {
			featureId: "F-SEC-003",
			parentSpec: "missing-spec",
			task: "synthetic spec waiver",
		});
		const storePath = join(root, ".afol", "state", "spec-gate.json");
		const beforeStore = readOptionalBytes(storePath);
		try {
			const proc = runKernel(root, [
				"--agent",
				"spec",
				"waive",
				"--session",
				created.session,
				"--task",
				"T-01",
				"--reason",
				"synthetic waiver",
				"--json",
			]);

			expectRestrictedJsonError(proc);
			expectOptionalBytesUnchanged(storePath, beforeStore);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("SEC-003 restricted front door denies changelog writes", () => {
		const root = mkProjectRoot("sec-003-changelog", "");
		const changelog = join(root, ".afol", "adm", "changelog", "CHANGELOG.md");
		try {
			const proc = runKernel(root, [
				"--agent",
				"changelog",
				"add",
				"--type",
				"fix",
				"--message",
				"synthetic restricted change",
				"--json",
			]);

			expectRestrictedJsonError(proc);
			expect(existsSync(changelog)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("SEC-003 restricted front door denies state sync", () => {
		const root = mkProjectRoot("sec-003-state", "");
		const created = newWorkstream(root, "restricted state", {
			task: "synthetic state sync",
		});
		const stateDb = join(root, ".afol", "state", "afol.db");
		const beforeState = readOptionalBytes(stateDb);
		try {
			const proc = runKernel(root, [
				"--agent",
				"state",
				"sync",
				"--session",
				created.session,
				"--json",
			]);

			expectRestrictedJsonError(proc);
			expectOptionalBytesUnchanged(stateDb, beforeState);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("SEC-003 restricted front door denies hydrate", () => {
		const root = mkProjectRoot("sec-003-hydrate", "");
		const created = newWorkstream(root, "restricted hydrate", {
			task: "synthetic hydrate",
		});
		const stateDb = join(root, ".afol", "state", "afol.db");
		const beforeState = readOptionalBytes(stateDb);
		try {
			const proc = runKernel(root, [
				"--agent",
				"hydrate",
				"--session",
				created.session,
				"--json",
			]);

			expectRestrictedJsonError(proc);
			expectOptionalBytesUnchanged(stateDb, beforeState);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("SEC-003 restricted front door denies adapter writes", () => {
		const root = mkProjectRoot("sec-003-adapter", "");
		const configPath = join(root, ".afol", "config.json");
		const beforeConfig = readFileSync(configPath).toString("base64");
		try {
			const proc = runKernel(root, [
				"--agent",
				"adapter",
				"disable",
				"claude",
				"--json",
			]);

			expectRestrictedJsonError(proc);
			expect(readFileSync(configPath).toString("base64")).toBe(beforeConfig);
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
	}, 30_000);

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

	test("unknown command emits result envelope with --json and keeps human stderr", () => {
		const root = mkProjectRoot(
			"unknown-json",
			"#!/usr/bin/env bash\necho LEGACY:$*\n",
		);
		try {
			const human = runKernel(root, ["sttaus"]);
			expect(human.status).toBe(2);
			expect(human.stdout as string).toBe("");
			expect(human.stderr as string).toContain(
				'err unknown-command command=sttaus hint="run afol -h" did_you_mean=status',
			);

			const json = runKernel(root, ["sttaus", "--json"]);
			expect(json.status).toBe(2);
			expect(json.stderr as string).toBe("");
			expect(JSON.parse(json.stdout as string)).toEqual({
				schema: "afol.result/v1",
				ok: false,
				exit_code: 2,
				action: "route",
				data: {
					command: "sttaus",
					hint: "run afol -h",
					did_you_mean: "status",
				},
			});

			const jsonWithoutSuggestion = runKernel(root, ["zzqq", "--json"]);
			expect(jsonWithoutSuggestion.status).toBe(2);
			expect(jsonWithoutSuggestion.stderr as string).toBe("");
			expect(JSON.parse(jsonWithoutSuggestion.stdout as string)).toEqual({
				schema: "afol.result/v1",
				ok: false,
				exit_code: 2,
				action: "route",
				data: { command: "zzqq", hint: "run afol -h" },
			});
			expect(json.stdout as string).not.toContain("LEGACY:");
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

	test("bootstrap and init pass restricted operation context while preserving dry-run", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-bootstrap-approval-"));
		const bootstrapTarget = join(root, "bootstrap-target");
		const initTarget = join(root, "init-target");
		mkdirSync(bootstrapTarget);
		mkdirSync(initTarget);
		try {
			for (const [command, target] of [
				["bootstrap", bootstrapTarget],
				["init", initTarget],
			] as const) {
				const dryRun = runKernel(root, [
					"--agent",
					command,
					target,
					"--dry-run",
				]);
				expect(dryRun.status).toBe(0);
				const apply = runKernel(root, ["--agent", command, target]);
				expect(apply.status).toBe(2);
				expect(apply.stderr as string).toContain(
					"requires local interactive approval",
				);
				expect(readdirSync(target)).toEqual([]);
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

	test("init dry-run json emits one preview envelope without writes", () => {
		for (const jsonFlag of ["--json", "-j"]) {
			const root = mkdtempSync(join(tmpdir(), "kernel-init-json-"));
			const target = join(root, "target");
			mkdirSync(target);
			try {
				const proc = runKernel(root, ["init", target, "--dry-run", jsonFlag]);
				expect(proc.status).toBe(0);
				expect(proc.stderr as string).toBe("");
				const lines = (proc.stdout as string).trim().split("\n");
				expect(lines).toHaveLength(1);
				const payload = JSON.parse(lines[0] ?? "{}") as {
					schema?: string;
					ok?: boolean;
					action?: string;
					exit_code?: number;
					data?: { target?: string; mode?: string; dry_run?: boolean };
				};
				expect(payload.schema).toBe("afol.result/v1");
				expect(payload.ok).toBe(true);
				expect(payload.action).toBe("bootstrap.preview");
				expect(payload.exit_code).toBe(0);
				expect(payload.data).toMatchObject({
					target,
					mode: "dry-run",
					dry_run: true,
				});
				expect(readdirSync(target)).toEqual([]);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("init dry-run json preserves conflict exit 4 without writes", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-init-json-conflict-"));
		const target = join(root, "target");
		const targetFile = join(target, "AGENTS.md");
		mkdirSync(target);
		writeFileSync(targetFile, "project-owned\n", "utf8");
		try {
			const proc = runKernel(root, ["init", target, "--dry-run", "--json"]);
			expect(proc.status).toBe(4);
			expect(proc.stderr as string).toBe("");
			const lines = (proc.stdout as string).trim().split("\n");
			expect(lines).toHaveLength(1);
			const payload = JSON.parse(lines[0] ?? "{}") as {
				schema?: string;
				ok?: boolean;
				action?: string;
				exit_code?: number;
				data?: { conflicts?: number };
				error?: { code?: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.action).toBe("bootstrap.preview");
			expect(payload.exit_code).toBe(4);
			expect(payload.data?.conflicts).toBeGreaterThan(0);
			expect(payload.error?.code).toBe("BOOTSTRAP_CONFLICT");
			expect(readFileSync(targetFile, "utf8")).toBe("project-owned\n");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("init rejects json without dry-run", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-init-json-apply-"));
		try {
			const proc = runKernel(root, ["init", "--json"]);
			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toBe("");
			const payload = JSON.parse((proc.stdout as string).trim()) as {
				schema?: string;
				ok?: boolean;
				action?: string;
				exit_code?: number;
				error?: { code?: string; message?: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.action).toBe("init");
			expect(payload.exit_code).toBe(2);
			expect(payload.error).toMatchObject({
				code: "INIT_ERROR",
				message: "Unsupported init argument: --json requires --dry-run",
			});
			expect(readdirSync(root)).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("init dry-run json returns an error envelope for invalid arguments", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-init-json-error-"));
		try {
			const proc = runKernel(root, [
				"init",
				"--dry-run",
				"--json",
				"--partial",
			]);
			expect(proc.status).toBe(2);
			expect(proc.stderr as string).toBe("");
			const lines = (proc.stdout as string).trim().split("\n");
			expect(lines).toHaveLength(1);
			const payload = JSON.parse(lines[0] ?? "{}") as {
				schema?: string;
				ok?: boolean;
				action?: string;
				exit_code?: number;
				error?: { code?: string; message?: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.action).toBe("init");
			expect(payload.exit_code).toBe(2);
			expect(payload.error).toMatchObject({
				code: "INIT_ERROR",
				message: expect.stringContaining(
					"Unsupported init argument: --partial",
				),
			});
			expect(readdirSync(root)).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bootstrap dry-run json emits one preview envelope without writes", () => {
		const root = mkdtempSync(join(tmpdir(), "kernel-bootstrap-json-"));
		const target = join(root, "target");
		mkdirSync(target);
		try {
			const proc = runKernel(root, [
				"bootstrap",
				target,
				"--dry-run",
				"--json",
			]);
			expect(proc.status).toBe(0);
			expect(proc.stderr as string).toBe("");
			const lines = (proc.stdout as string).trim().split("\n");
			expect(lines).toHaveLength(1);
			const payload = JSON.parse(lines[0] ?? "{}") as {
				schema?: string;
				ok?: boolean;
				action?: string;
				exit_code?: number;
				data?: { target?: string; mode?: string; dry_run?: boolean };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("bootstrap.preview");
			expect(payload.exit_code).toBe(0);
			expect(payload.data).toMatchObject({
				target,
				mode: "dry-run",
				dry_run: true,
			});
			expect(readdirSync(target)).toEqual([]);
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
			const closeHelp = runKernel(root, ["close", "--help"]);
			expect(closeHelp.stdout as string).toContain(
				"Usage: afol close [--session <session-id>]",
			);
			expect(closeHelp.stdout as string).toContain("-m, --summary <text>");
			expect(closeHelp.stdout as string).toContain("--allow-no-report");
			expect(closeHelp.stdout as string).toContain("--reason <text>");
			expect(closeHelp.stdout as string).toContain("-j, --json");
			expect(closeHelp.stdout as string).toContain("--admit-legacy-baseline");
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
			mkdirSync(join(root, ".afol", "adm", "roadmap"), { recursive: true });
			mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "adm", "roadmap", "GENERAL-ROADMAP.md"),
				"# Roadmap\n\n### F-00 Retirement bridge\n\n- Status: active\n- Governing spec: .afol/adm/specs/260531_parent_spec_01.md\n",
				"utf8",
			);
			writeFileSync(
				join(root, ".afol", "adm", "specs", "260531_parent_spec_01.md"),
				"---\ndoc_type: spec\nid: 260531_parent_spec_01\nstatus: active\nroadmap_feature: F-00\n---\n\n# Spec\n",
				"utf8",
			);
			const proc = runKernel(root, [
				"n",
				"retirement-bridge",
				"--intent",
				"delivery",
				"--feature-id",
				"F-00",
				"--parent-spec",
				".afol/adm/specs/260531_parent_spec_01.md",
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
			const specCheck = runKernel(root, [
				"spec",
				"check",
				"--session",
				session,
				"--task",
				"T-01",
				"--json",
			]);
			expect(specCheck.status).toBe(0);
			expect(specCheck.stdout as string).toContain('"status":"compatible"');

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
			prepareDone(root, created.session);

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
			prepareDone(root, created.session);

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
			prepareDone(root, created.session);

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
			prepareDone(root, created.session);

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

	test("SEC-006 evidence redacts sensitive command values consistently", () => {
		const root = mkProjectRoot("sec-006-evidence-redaction", "");
		try {
			const created = newWorkstream(root, "evidence redaction", {
				task: "verify synthetic command redaction",
			});
			const cases = [
				{
					command: "DEMO_API_KEY=synthetic-assignment bun test",
					expected: "DEMO_API_KEY=[REDACTED] bun test",
					raw: "synthetic-assignment",
				},
				{
					command: 'bun test --api-key "synthetic quoted option"',
					expected: "bun test --api-key [REDACTED]",
					raw: "synthetic quoted option",
				},
				{
					command: "bun test --token=synthetic-token",
					expected: "bun test --token=[REDACTED]",
					raw: "synthetic-token",
				},
				{
					command: "API_KEY_NOTE=synthetic-note bun test",
					expected: "API_KEY_NOTE=synthetic-note bun test",
					raw: "synthetic-note",
				},
				{
					command: "DB_URL=synthetic-database-url bun test",
					expected: "DB_URL=[REDACTED] bun test",
					raw: "synthetic-database-url",
				},
				{
					command: [
						'curl -H "Authorization:',
						"Bearer",
						'synthetic-bearer" https://example.test',
					].join(" "),
					expected:
						'curl -H "Authorization: Bearer [REDACTED]" https://example.test',
					raw: "synthetic-bearer",
				},
				{
					command: [
						"curl https://demo-user:",
						"synthetic-password@example.test",
					].join(""),
					expected: ["curl https://demo-user:", "[REDACTED]@example.test"].join(
						"",
					),
					raw: "synthetic-password",
				},
			];

			for (const fixture of cases) {
				recordEvidence(root, {
					session: created.session,
					taskId: "T-01",
					command: fixture.command,
					result: "passed",
					provenance: "observed",
				});
			}

			const evidenceText = readFileSync(
				join(root, ".afol", "wb", created.session, ".evidence.jsonl"),
				"utf8",
			);
			const eventText = readFileSync(
				join(root, ".afol", "data", "events", "events.jsonl"),
				"utf8",
			);
			const evidence = evidenceText
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as { id: string; command: string });
			const events = eventText
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			const recordEvents = events.filter(
				(event) => event.type === "workbench.record_evidence",
			);
			const telemetryEvents = events.filter(
				(event) => event.event_type === "tool_exec",
			);

			expect(evidence.map((entry) => entry.command)).toEqual(
				cases.map((fixture) => fixture.expected),
			);
			for (const entry of evidence) {
				const event = recordEvents.find(
					(candidate) =>
						(candidate.detail as { evidence_id?: string } | undefined)
							?.evidence_id === entry.id,
				);
				expect(event?.command).toBe(entry.command);
			}
			for (const [index, fixture] of cases.entries()) {
				if (index === 3) continue;
				expect(evidenceText).not.toContain(fixture.raw);
				expect(eventText).not.toContain(fixture.raw);
			}
			expect(evidenceText).toContain(cases[3]?.raw ?? "");
			expect(eventText).toContain("DEMO_API_KEY=[REDACTED]");
			expect(eventText).toContain(cases[3]?.raw ?? "");
			expect(telemetryEvents.map((event) => event.cmd_type)).toEqual([
				"DEMO_API_KEY=[REDACTED]",
				"bun",
				"bun",
				"API_KEY_NOTE=synthetic-note",
				"DB_URL=[REDACTED]",
				"curl",
				"curl",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("ingests fixed-profile receipts idempotently without changing task state", () => {
		const root = mkProjectRoot("receipt-ingest", "");
		const created = newWorkstream(root, "receipt ingestion", {
			task: "record an external receipt",
		});
		try {
			const receiptPath = writeReceiptFixture(root, created.session);
			const first = runKernel(root, [
				"receipt",
				"ingest",
				"--file",
				receiptPath,
			]);
			expect(first.status).toBe(0);
			const firstPayload = JSON.parse(first.stdout as string) as {
				data?: { evidence_id?: string; status?: string };
			};
			expect(firstPayload.data?.status).toBe("committed");
			expect(firstPayload.data?.evidence_id).toBeTruthy();
			const evidencePath = join(
				root,
				".afol",
				"wb",
				created.session,
				".evidence.jsonl",
			);
			expect(
				readFileSync(evidencePath, "utf8").trim().split("\n"),
			).toHaveLength(1);
			expect(
				readFileSync(
					join(
						root,
						".afol",
						"wb",
						created.session,
						`${created.session}_task_01.md`,
					),
					"utf8",
				),
			).toContain("| T-01 | pending |");

			const duplicate = runKernel(root, [
				"receipt",
				"ingest",
				"--file",
				receiptPath,
			]);
			expect(duplicate.status).toBe(0);
			expect(
				(
					JSON.parse(duplicate.stdout as string) as {
						data?: { status?: string };
					}
				).data?.status,
			).toBe("duplicate");
			expect(
				readFileSync(evidencePath, "utf8").trim().split("\n"),
			).toHaveLength(1);

			writeReceiptFixture(root, created.session, { run_id: "run-conflict" });
			const conflict = runKernel(root, [
				"receipt",
				"ingest",
				"--file",
				receiptPath,
			]);
			expect(conflict.status).toBe(2);
			expect(
				(
					JSON.parse(conflict.stdout as string) as {
						error?: { message?: string };
					}
				).error?.message,
			).toContain("different canonical content");
			expect(
				readFileSync(evidencePath, "utf8").trim().split("\n"),
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects secret-like receipt content before evidence mutation", () => {
		const root = mkProjectRoot("receipt-secret", "");
		const created = newWorkstream(root, "receipt ingestion", {
			task: "reject unsafe receipt",
		});
		try {
			const receiptPath = writeReceiptFixture(root, created.session, {
				check_command: "API_KEY=synthetic-secret bun test",
			});
			const proc = runKernel(root, [
				"receipt",
				"ingest",
				"--file",
				receiptPath,
			]);
			expect(proc.status).toBe(2);
			expect(proc.stdout as string).not.toContain("synthetic-secret");
			expect(
				readFileSync(
					join(root, ".afol", "wb", created.session, ".evidence.jsonl"),
					"utf8",
				),
			).toBe("");
			expect(
				existsSync(join(root, ".afol", "data", "receipts", "external.jsonl")),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects forged, non-ancestor, and stale receipt provenance", () => {
		const root = mkProjectRoot("receipt-provenance", "");
		const created = newWorkstream(root, "receipt ingestion", {
			task: "reject invalid provenance",
		});
		try {
			const receiptPath = writeReceiptFixture(root, created.session);
			const original = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<
				string,
				unknown
			>;
			writeJson(receiptPath, { ...original, diff_hash: "f".repeat(64) });
			const forged = runKernel(root, [
				"receipt",
				"ingest",
				"--file",
				receiptPath,
			]);
			expect(forged.status).toBe(2);
			expect(forged.stdout as string).toContain("diff_hash does not match");

			const mainHead = execFileSync("git", ["rev-parse", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).trim();
			execFileSync("git", ["checkout", "--orphan", "receipt-forged"], {
				cwd: root,
				stdio: "ignore",
			});
			writeFileSync(join(root, "foreign.txt"), "foreign\n", "utf8");
			execFileSync("git", ["add", "."], { cwd: root });
			execFileSync("git", ["commit", "-m", "foreign receipt source"], {
				cwd: root,
				stdio: "ignore",
			});
			const foreignHead = execFileSync("git", ["rev-parse", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).trim();
			execFileSync("git", ["checkout", "--detach", mainHead], {
				cwd: root,
				stdio: "ignore",
			});
			writeJson(receiptPath, {
				...original,
				source_commit: foreignHead,
				head_commit: mainHead,
			});
			const nonAncestor = runKernel(root, [
				"receipt",
				"ingest",
				"--file",
				receiptPath,
			]);
			expect(nonAncestor.status).toBe(2);
			expect(nonAncestor.stdout as string).toContain("not an ancestor");

			writeJson(receiptPath, {
				...original,
				started_at: "2020-01-01T00:00:00.000Z",
				finished_at: "2020-01-01T00:01:00.000Z",
			});
			const stale = runKernel(root, [
				"receipt",
				"ingest",
				"--file",
				receiptPath,
			]);
			expect(stale.status).toBe(2);
			expect(stale.stdout as string).toContain("allowed ingestion window");
			expect(
				readFileSync(
					join(root, ".afol", "wb", created.session, ".evidence.jsonl"),
					"utf8",
				),
			).toBe("");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
