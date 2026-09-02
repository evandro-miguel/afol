import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdateCommand } from "../commands/update";
import { agentOperationContext } from "../core/operation-context";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";
import {
	loadMutationJournalStrict,
	type MutationRecord,
} from "../services/mutations/journal";
import { checkTemplateUpdate } from "../services/update/check";
import { newWorkstream, startTask } from "../services/workbench/lifecycle";
import { symlinkTestSupport } from "./symlink-test-support";

type TemplateUpdatePath = keyof typeof DEFAULT_TEMPLATE_FILES & string;

function templateText(path: TemplateUpdatePath): string {
	const entry = DEFAULT_TEMPLATE_FILES[path];
	if (!entry) {
		throw new Error(`Missing template entry: ${path}`);
	}
	return Buffer.from(entry.contentBase64, "base64").toString("utf8");
}

function templateJson<T>(path: TemplateUpdatePath): T {
	return JSON.parse(templateText(path)) as T;
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function mkRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "update-command-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify(
			{ schema_version: 1, revision: "old", locked: true },
			null,
			2,
		),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		JSON.stringify(
			{ version: 1, commands: { status: ["s", "status"] } },
			null,
			2,
		),
		"utf8",
	);
	return root;
}

function writeClaudeAdapterConfig(root: string, enabled: boolean): void {
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(
			{
				schema_version: 1,
				project: { name: "update-command-test" },
				paths: {},
				adapters: { claude: { enabled } },
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
}

function capture() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => stdout.push(message),
			stderr: (message: string) => stderr.push(message),
		},
	};
}

function expectUpdateJsonError(
	output: ReturnType<typeof capture>,
	exitCode = 2,
): Record<string, unknown> {
	expect(output.stdout).toHaveLength(1);
	const payload = JSON.parse(output.stdout[0] ?? "{}") as Record<
		string,
		unknown
	>;
	expect(payload).toMatchObject({
		schema: "afol.result/v1",
		ok: false,
		action: "update",
		exit_code: exitCode,
	});
	expect(output.stderr).toHaveLength(0);
	return payload;
}

function restoreEnv(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

async function withAfolTestEnv<T>(fn: () => Promise<T>): Promise<T> {
	const saved = {
		AFOL_TEST: process.env.AFOL_TEST,
		AFOL_CI: process.env.AFOL_CI,
	};
	try {
		process.env.AFOL_TEST = "1";
		delete process.env.AFOL_CI;
		return await fn();
	} finally {
		restoreEnv("AFOL_TEST", saved.AFOL_TEST);
		restoreEnv("AFOL_CI", saved.AFOL_CI);
	}
}

async function withoutUnboundContextEnv<T>(fn: () => Promise<T>): Promise<T> {
	const saved = {
		AFOL_TEST: process.env.AFOL_TEST,
		AFOL_CI: process.env.AFOL_CI,
	};
	try {
		delete process.env.AFOL_TEST;
		delete process.env.AFOL_CI;
		return await fn();
	} finally {
		restoreEnv("AFOL_TEST", saved.AFOL_TEST);
		restoreEnv("AFOL_CI", saved.AFOL_CI);
	}
}

function mkCliRuntimeRoot(
	options: {
		packageName?: string;
		packageVersion?: string;
		provenanceVersion?: string;
		provenancePackageName?: string;
		skipPackageJson?: boolean;
	} = {},
): string {
	const root = mkdtempSync(join(tmpdir(), "update-cli-runtime-"));
	if (!options.skipPackageJson) {
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify(
				{
					name: options.packageName ?? CLI_PACKAGE_NAME,
					version: options.packageVersion ?? CLI_VERSION,
				},
				null,
				2,
			),
			"utf8",
		);
	}
	if (options.provenanceVersion) {
		mkdirSync(join(root, "dist"), { recursive: true });
		writeFileSync(
			join(root, "dist", "afol.provenance.json"),
			JSON.stringify(
				{
					package_name:
						options.provenancePackageName ??
						options.packageName ??
						CLI_PACKAGE_NAME,
					version: options.provenanceVersion,
				},
				null,
				2,
			),
			"utf8",
		);
	}
	return root;
}

function mkBoundUpdateContext(root: string): {
	session: string;
	taskId: string;
} {
	const stream = newWorkstream(root, "update governance");
	return { session: stream.session, taskId: "T-01" };
}

describe("update command", () => {
	test("check creates missing baseline docs under project-owned roots", () => {
		const root = mkRoot();
		try {
			writeFileSync(
				join(root, ".agents", "lock.json"),
				templateText(".agents/lock.json"),
				"utf8",
			);
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				templateText(".agents/manifest.json"),
				"utf8",
			);

			const result = checkTemplateUpdate(root);
			const operations = new Map(
				result.operations.map((operation) => [operation.path, operation]),
			);
			expect(
				operations.get("docs/standards/user-journey-registry.md"),
			).toMatchObject({ kind: "create", owner: "project-owned" });
			expect(operations.get("docs/templates/ux-journey.md")).toMatchObject({
				kind: "create",
				owner: "project-owned",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("distinguishes empty target files from missing target files", () => {
		const root = mkRoot();
		try {
			const genericPath = "docs/standards/user-journey-registry.md";
			const emptyGeneric = join(root, genericPath);
			mkdirSync(join(root, "docs", "standards"), { recursive: true });
			writeFileSync(emptyGeneric, "", "utf8");
			writeFileSync(join(root, ".agents", "lock.json"), "", "utf8");

			const operations = new Map(
				checkTemplateUpdate(root).operations.map((operation) => [
					operation.path,
					operation,
				]),
			);
			expect(operations.get(genericPath)).toMatchObject({
				kind: "conflict",
				reason: "local-drift-or-unknown-ownership",
			});
			expect(operations.get(".agents/lock.json")).toMatchObject({
				kind: "conflict",
				reason: "local-user-edit-or-unsafe",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("manages the project-owned completion-lock ignore and restores its exact prior bytes", async () => {
		const root = mkRoot();
		const gitignore = join(root, ".gitignore");
		const before = Buffer.from("custom\r\nrule", "utf8");
		try {
			writeFileSync(gitignore, before);
			const checked = checkTemplateUpdate(root);
			expect(
				checked.operations.find((operation) => operation.path === ".gitignore"),
			).toMatchObject({
				kind: "update-managed",
				owner: "project-owned",
				reason: "managed-lock-ignore",
				nextContent: "custom\r\nrule\n.afol/wb/.locks/\n",
			});
			const preview = capture();
			expect(
				await runUpdateCommand(["preview", "--verbose"], root, preview.io),
			).toBe(0);
			expect(preview.stdout.join("\n")).toContain(".gitignore");
			expect(readFileSync(gitignore)).toEqual(before);

			const apply = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"lock ignore",
							"--allow-unbound-context",
							"--json",
						],
						root,
						apply.io,
					),
				).toBe(0);
			});
			expect(readFileSync(gitignore, "utf8")).toBe(
				"custom\r\nrule\n.afol/wb/.locks/\n",
			);
			const batchId =
				(
					JSON.parse(apply.stdout[0] ?? "{}") as {
						data?: { batch_id?: string };
					}
				).data?.batch_id ?? "";
			const rollback = capture();
			expect(
				await runUpdateCommand(
					["rollback", "--batch-id", batchId, "--reason", "restore", "--json"],
					root,
					rollback.io,
				),
			).toBe(0);
			expect(readFileSync(gitignore)).toEqual(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed for a completion-lock gitignore symlink or non-regular target", () => {
		for (const kind of ["symlink", "directory"] as const) {
			if (kind === "symlink" && !symlinkTestSupport.available) continue;
			const root = mkRoot();
			try {
				const gitignore = join(root, ".gitignore");
				if (kind === "symlink")
					symlinkSync(join(root, ".agents", "lock.json"), gitignore);
				else mkdirSync(gitignore);
				expect(
					checkTemplateUpdate(root).operations.find(
						(operation) => operation.path === ".gitignore",
					),
				).toMatchObject({ kind: "conflict" });
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("check reports source drift without writing files", async () => {
		const root = mkRoot();
		const sourceLock = templateJson<{ revision: string }>(".agents/lock.json");
		try {
			expect(existsSync(join(root, "src", "project-template"))).toBe(false);
			const output = capture();
			expect(await runUpdateCommand(["check"], root, output.io)).toBe(0);
			expect(output.stdout.join("\n")).toContain(
				"update check: changes available",
			);
			expect(output.stdout.join("\n")).toContain("current revision: old");
			expect(output.stdout.join("\n")).toContain(
				`source revision: ${sourceLock.revision}`,
			);
			expect(output.stdout.join("\n")).toContain("ownership(current):");
			expect(output.stdout.join("\n")).toContain("ownership(source):");
			expect(output.stdout.join("\n")).toContain("operations:");
			expect(output.stdout.join("\n")).toContain(
				"hint: run afol update preview",
			);
			expect(output.stdout.join("\n")).not.toContain("diff previews:");

			const verboseOutput = capture();
			expect(
				await runUpdateCommand(["check", "--verbose"], root, verboseOutput.io),
			).toBe(0);
			expect(verboseOutput.stdout.join("\n")).toContain("add command validate");
			expect(verboseOutput.stdout.join("\n")).toContain("diff previews:");
			expect(verboseOutput.stdout.join("\n")).toContain(
				".agents/manifest.json [owner=managed] manifest commands changed",
			);

			const flagOnlyJson = capture();
			expect(await runUpdateCommand(["--json"], root, flagOnlyJson.io)).toBe(0);
			const parsed = JSON.parse(flagOnlyJson.stdout[0] ?? "{}") as {
				action?: string;
				ok?: boolean;
			};
			expect(parsed.ok).toBe(true);
			expect(parsed.action).toBe("update.check");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply preserves stale vendored paths without a managed hash contract", async () => {
		const root = mkRoot();
		const staleSkillPath = join(
			root,
			".agents",
			"skills",
			"agentic-folder-sys",
		);
		const staleSourcePath = join(
			root,
			".afol",
			"adm",
			"source",
			"universal-skills",
			"skills",
			"agentic-folder-sys",
		);
		const staleLegacySeedPath = join(
			root,
			".agents",
			"source",
			"universal-skills",
			"skills",
			"agentic-folder-sys",
		);
		try {
			mkdirSync(staleSkillPath, { recursive: true });
			writeFileSync(join(staleSkillPath, "SKILL.md"), "# stale\n", "utf8");
			mkdirSync(staleSourcePath, { recursive: true });
			writeFileSync(join(staleSourcePath, "SKILL.md"), "# stale\n", "utf8");
			mkdirSync(staleLegacySeedPath, { recursive: true });
			writeFileSync(join(staleLegacySeedPath, "SKILL.md"), "# stale\n", "utf8");

			const check = capture();
			expect(
				await runUpdateCommand(
					["check", "--json", "--verbose"],
					root,
					check.io,
				),
			).toBe(0);
			const payload = JSON.parse(check.stdout[0] ?? "{}") as {
				data?: { operations?: Array<{ kind: string; path: string }> };
			};
			const staleRemovals =
				payload.data?.operations?.filter(
					(operation) =>
						operation.kind === "remove-stale" &&
						operation.path.includes("agentic-folder-sys"),
				) ?? [];
			expect(staleRemovals).toHaveLength(0);

			const apply = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"remove stale vendored global skill",
							"--allow-unbound-context",
						],
						root,
						apply.io,
					),
				).toBe(4);
			});
			expect(existsSync(staleSkillPath)).toBe(true);
			expect(existsSync(staleSourcePath)).toBe(true);
			expect(existsSync(staleLegacySeedPath)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("check omits Claude-owned paths when the adapter is disabled", async () => {
		const root = mkRoot();
		try {
			writeClaudeAdapterConfig(root, false);
			writeFileSync(join(root, "CLAUDE.md"), "local claude mirror\n", "utf8");
			mkdirSync(join(root, ".claude", "rules"), { recursive: true });
			writeFileSync(
				join(root, ".claude", "README.md"),
				"local claude readme\n",
				"utf8",
			);

			const output = capture();
			expect(
				await runUpdateCommand(
					["check", "--json", "--verbose"],
					root,
					output.io,
				),
			).toBe(0);

			const parsed = JSON.parse(output.stdout[0] ?? "{}") as {
				data?: {
					changes?: { paths?: string[] };
					operations?: { path?: string }[];
					filePreviews?: { path?: string }[];
				};
			};
			const operationPaths =
				parsed.data?.operations?.flatMap((op) =>
					typeof op?.path === "string" ? [op.path] : [],
				) ?? [];
			const previewPaths =
				parsed.data?.filePreviews?.flatMap((preview) =>
					typeof preview?.path === "string" ? [preview.path] : [],
				) ?? [];

			expect(parsed.data?.changes?.paths ?? []).not.toContain("CLAUDE.md");
			expect(parsed.data?.changes?.paths ?? []).not.toContain(
				".claude/README.md",
			);
			expect(operationPaths).not.toContain("CLAUDE.md");
			expect(operationPaths).not.toContain(".claude/README.md");
			expect(previewPaths).not.toContain("CLAUDE.md");
			expect(previewPaths).not.toContain(".claude/README.md");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("check skips only Claude payload when optional config is corrupt", () => {
		const root = mkRoot();
		try {
			mkdirSync(join(root, ".afol"), { recursive: true });
			writeFileSync(join(root, ".afol", "config.json"), "{broken", "utf8");
			const operations = checkTemplateUpdate(root).operations;
			expect(
				operations.some((operation) => operation.path === "CLAUDE.md"),
			).toBe(false);
			expect(
				operations.some(
					(operation) => operation.path === ".agents/manifest.json",
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply does not create Claude-owned paths when the adapter is disabled", async () => {
		const root = mkRoot();
		try {
			const disabledConfig = JSON.stringify(
				{
					schema_version: 1,
					project: { name: "update-command-test" },
					paths: {},
					adapters: { claude: { enabled: false } },
				},
				null,
				2,
			);
			writeFileSync(
				join(root, ".agents", "config.json"),
				`${disabledConfig}\n`,
				"utf8",
			);
			writeFileSync(
				join(root, ".agents", "lock.json"),
				JSON.stringify(
					{
						schema_version: 1,
						revision: "old",
						locked: true,
						managed_hashes: {
							"config.json": sha256Hex(`${disabledConfig}\n`),
						},
					},
					null,
					2,
				),
				"utf8",
			);
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--session",
							"S-CLAUDE",
							"--task-id",
							"T-CLAUDE",
							"--reason",
							"verify disabled adapter update",
							"--allow-unbound-context",
						],
						root,
						output.io,
					),
				).toBe(0);
			});

			expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(root, ".claude"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply restricts --allow-unbound-context to AFOL CI or tests", async () => {
		const root = mkRoot();
		try {
			const output = capture();
			await withoutUnboundContextEnv(async () => {
				expect(
					await runUpdateCommand(
						["apply", "--allow-unbound-context"],
						root,
						output.io,
					),
				).toBe(2);
			});
			expect(output.stderr.join("\n")).toContain(
				"--allow-unbound-context requires AFOL_CI=1 or AFOL_TEST=1.",
			);
			expect(
				readFileSync(join(root, ".agents", "lock.json"), "utf8"),
			).toContain('"revision": "old"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply requires reason with --allow-unbound-context in AFOL tests", async () => {
		const root = mkRoot();
		try {
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--session",
							"S-UNBOUND",
							"--task-id",
							"T-UNBOUND",
							"--allow-unbound-context",
						],
						root,
						output.io,
					),
				).toBe(2);
			});
			expect(output.stderr.join("\n")).toContain(
				"Real update apply requires --reason.",
			);
			expect(
				readFileSync(join(root, ".agents", "lock.json"), "utf8"),
			).toContain('"revision": "old"');
			expect(
				readFileSync(join(root, ".agents", "manifest.json"), "utf8"),
			).not.toContain("validate");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("check does not synthesize removed Claude-owned template paths", async () => {
		const root = mkRoot();
		try {
			writeClaudeAdapterConfig(root, true);
			const output = capture();
			expect(await runUpdateCommand(["check", "--json"], root, output.io)).toBe(
				0,
			);

			const parsed = JSON.parse(output.stdout[0] ?? "{}") as {
				data?: {
					changes?: { paths?: string[] };
				};
			};
			expect(parsed.data?.changes?.paths ?? []).not.toContain("CLAUDE.md");
			expect(parsed.data?.changes?.paths ?? []).not.toContain(
				".claude/README.md",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("preview prints read-only operations and supports ck alias", async () => {
		const root = mkRoot();
		try {
			const preview = capture();
			expect(await runUpdateCommand(["preview"], root, preview.io)).toBe(0);
			expect(preview.stdout.join("\n")).toContain("preview operations:");
			expect(preview.stdout.join("\n")).toContain("diff previews:");
			expect(preview.stdout.join("\n")).toContain(
				"diff previews: omitted in compact preview",
			);
			expect(preview.stdout.join("\n")).toContain("operations: total=");
			expect(preview.stdout.join("\n")).not.toContain("@@");

			const verbosePreview = capture();
			expect(
				await runUpdateCommand(
					["preview", "--verbose"],
					root,
					verbosePreview.io,
				),
			).toBe(0);
			expect(verbosePreview.stdout.join("\n")).toContain("diff previews:");
			expect(verbosePreview.stdout.join("\n")).toContain(
				".agents/lock.json [owner=managed] revision changed",
			);
			expect(verbosePreview.stdout.join("\n")).toContain("@@");

			const json = capture();
			expect(await runUpdateCommand(["ck", "--json"], root, json.io)).toBe(0);
			const parsed = JSON.parse(json.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action?: string;
				exit_code: number;
				data?: {
					hasSource?: boolean;
					currentRevision?: string;
					changes?: {
						total?: number;
						paths?: string[];
						pathsTruncated?: boolean;
					};
					ownershipSource?: Record<string, number>;
					filePreviews?: unknown[];
					operations?: unknown[];
				};
			};
			expect(parsed.schema).toBe("afol.result/v1");
			expect(parsed.ok).toBe(true);
			expect(parsed.action).toBe("update.check");
			expect(parsed.exit_code).toBe(0);
			expect(Object.hasOwn(parsed, "hasSource")).toBe(false);
			expect(Object.hasOwn(parsed, "filePreviews")).toBe(false);
			expect(Object.hasOwn(parsed, "operations")).toBe(false);
			expect(parsed.data).toMatchObject({
				hasSource: true,
				currentRevision: "old",
				changes: {
					total: expect.any(Number),
					paths: expect.any(Array),
					pathsTruncated: true,
				},
			});
			expect(parsed.data?.ownershipSource?.managed).toBeGreaterThan(0);

			const previewJson = capture();
			expect(
				await runUpdateCommand(["preview", "--json"], root, previewJson.io),
			).toBe(0);
			const previewParsed = JSON.parse(previewJson.stdout[0] ?? "{}") as {
				schema: string;
				ok: boolean;
				action?: string;
				exit_code: number;
				data?: {
					hasSource?: boolean;
					changes?: {
						total?: number;
						paths?: string[];
						pathsTruncated?: boolean;
					};
					filePreviews?: unknown[];
					operations?: unknown[];
				};
			};
			expect(previewParsed.schema).toBe("afol.result/v1");
			expect(previewParsed.action).toBe("update.preview");
			expect(Object.hasOwn(previewParsed, "filePreviews")).toBe(false);
			expect(Object.hasOwn(previewParsed, "operations")).toBe(false);
			expect(previewParsed.data).toMatchObject({
				hasSource: true,
				changes: {
					total: expect.any(Number),
					paths: expect.any(Array),
					pathsTruncated: true,
				},
			});

			const previewVerboseJson = capture();
			expect(
				await runUpdateCommand(
					["preview", "--json", "--verbose"],
					root,
					previewVerboseJson.io,
				),
			).toBe(0);
			const previewVerboseParsed = JSON.parse(
				previewVerboseJson.stdout[0] ?? "{}",
			) as {
				schema: string;
				ok: boolean;
				action?: string;
				exit_code: number;
				data?: {
					filePreviews?: unknown[];
					operations?: unknown[];
				};
			};
			expect(previewVerboseParsed.schema).toBe("afol.result/v1");
			expect(previewVerboseParsed.action).toBe("update.preview");
			expect(Object.hasOwn(previewVerboseParsed, "filePreviews")).toBe(false);
			expect(Object.hasOwn(previewVerboseParsed, "operations")).toBe(false);
			expect(previewVerboseParsed.data?.filePreviews).toBeDefined();
			expect(previewVerboseParsed.data?.operations).toBeDefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply dry-run reflects operations and does not write files", async () => {
		const root = mkRoot();
		try {
			const dryRun = capture();
			expect(
				await runUpdateCommand(["apply", "--dry-run"], root, dryRun.io),
			).toBe(0);
			expect(dryRun.stdout.join("\n")).toContain("apply details");
			expect(dryRun.stdout.join("\n")).toContain("operations: total=");
			expect(
				readFileSync(join(root, ".agents", "lock.json"), "utf8"),
			).not.toContain("new");
			expect(
				readFileSync(join(root, ".agents", "manifest.json"), "utf8"),
			).not.toContain("validate");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply dry-run bypasses runtime version guardrail", async () => {
		const root = mkRoot();
		const cliRoot = mkCliRuntimeRoot({ packageVersion: "9.9.9" });
		try {
			const dryRun = capture();
			expect(
				await runUpdateCommand(["apply", "--dry-run"], root, dryRun.io, {
					cliRoot,
					invocationPath: join(cliRoot, "dist", "afol"),
				}),
			).toBe(0);
			expect(dryRun.stderr).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(cliRoot, { recursive: true, force: true });
		}
	});

	test("apply dry-run permits project-owned preserves without writes", async () => {
		const root = mkRoot();
		try {
			const currentLock =
				templateJson<Record<string, unknown>>(".agents/lock.json");
			currentLock.revision = "old";
			writeFileSync(
				join(root, ".agents", "lock.json"),
				JSON.stringify(currentLock, null, 2),
				"utf8",
			);
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				templateText(".agents/manifest.json"),
				"utf8",
			);

			const dryRun = capture();
			expect(
				await runUpdateCommand(["apply", "--dry-run"], root, dryRun.io),
			).toBe(0);
			expect(dryRun.stdout.join("\n")).toContain("preserve=");

			const realApply = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"apply compatible managed updates",
							"--allow-unbound-context",
						],
						root,
						realApply.io,
					),
				).toBe(0);
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project-owned ownership overrides a stale managed hash", async () => {
		const root = mkRoot();
		try {
			writeFileSync(
				join(root, ".agents", "lock.json"),
				templateText(".agents/lock.json"),
				"utf8",
			);
			const manifest = templateJson<{
				ownership: { "project-owned": string[] };
			}>(".agents/manifest.json");
			manifest.ownership["project-owned"].push(
				".afol/adm/rules/RULE-004-validation-linting.md",
			);
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				`${JSON.stringify(manifest, null, 2)}\n`,
				"utf8",
			);
			mkdirSync(join(root, ".afol"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "config.json"),
				`${JSON.stringify(
					{
						schema_version: 1,
						project: { name: "project-owned-customization" },
						paths: {},
					},
					null,
					2,
				)}\n`,
				"utf8",
			);
			mkdirSync(join(root, ".afol", "adm", "rules"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "adm", "rules", "RULE-004-validation-linting.md"),
				"# Project validation\n\nRun the project-native gates.\n",
				"utf8",
			);

			const dryRun = capture();
			expect(
				await runUpdateCommand(
					["apply", "--dry-run", "--verbose", "--json"],
					root,
					dryRun.io,
				),
			).toBe(0);
			const payload = JSON.parse(dryRun.stdout[0] ?? "{}") as {
				data?: { operations?: Array<{ kind: string; path: string }> };
			};
			expect(
				payload.data?.operations?.find(
					(operation) => operation.path === ".afol/config.json",
				),
			).toMatchObject({
				kind: "preserve-project-owned",
				path: ".afol/config.json",
			});
			expect(
				payload.data?.operations?.find(
					(operation) =>
						operation.path === ".afol/adm/rules/RULE-004-validation-linting.md",
				),
			).toMatchObject({
				kind: "preserve-project-owned",
				path: ".afol/adm/rules/RULE-004-validation-linting.md",
			});
			expect(
				payload.data?.operations?.find(
					(operation) => operation.path === ".agents/manifest.json",
				),
			).toMatchObject({
				kind: "preserve-project-owned",
				path: ".agents/manifest.json",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply accepts registered binary provenance without package.json", async () => {
		const root = mkRoot();
		const cliRoot = mkCliRuntimeRoot({
			provenanceVersion: CLI_VERSION,
			skipPackageJson: true,
		});
		try {
			expect(existsSync(join(cliRoot, "package.json"))).toBe(false);
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"binary provenance",
							"--allow-unbound-context",
						],
						root,
						output.io,
						{
							cliRoot,
							invocationPath: join(cliRoot, "dist", "afol"),
						},
					),
				).toBe(0);
			});
			expect(output.stderr).toHaveLength(0);
			const lockAfter = readFileSync(
				join(root, ".agents", "lock.json"),
				"utf8",
			);
			expect(lockAfter).toContain('"revision":');
			expect(lockAfter).not.toContain('"revision": "old"');
			const journal = loadMutationJournalStrict(root);
			expect(journal.issues).toHaveLength(0);
			expect(
				journal.records
					.filter((record) => record.kind === "update")
					.every(
						(record) =>
							record.session === "__ci__" && record.taskId === "__unbound__",
					),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(cliRoot, { recursive: true, force: true });
		}
	});

	test("apply rejects stale runtime version before writing", async () => {
		const root = mkRoot();
		const cliRoot = mkCliRuntimeRoot({ packageVersion: "9.9.9" });
		try {
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--session",
							"S-VERSION",
							"--task-id",
							"T-VERSION",
							"--reason",
							"version guardrail",
							"--allow-unbound-context",
						],
						root,
						output.io,
						{
							cliRoot,
							invocationPath: join(cliRoot, "cli", "main.ts"),
						},
					),
				).toBe(2);
			});
			expect(output.stderr.join("\n")).toContain(
				"Refusing real update apply: AFOL runtime version",
			);
			expect(output.stderr.join("\n")).toContain("repo package version 9.9.9");
			expect(
				readFileSync(join(root, ".agents", "lock.json"), "utf8"),
			).not.toContain('"revision": "ts-boundary-hardening"');
			expect(
				readFileSync(join(root, ".agents", "manifest.json"), "utf8"),
			).not.toContain("validate");
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(cliRoot, { recursive: true, force: true });
		}
	});

	test("apply updates managed files when no conflicts", async () => {
		const root = mkRoot();
		const { session, taskId } = mkBoundUpdateContext(root);
		startTask(root, { session, taskId });
		const sourceLock = templateJson<{ revision: string; project: string }>(
			".agents/lock.json",
		);
		const sourceManifest = templateJson<{ commands: Record<string, string[]> }>(
			".agents/manifest.json",
		);
		const sourceRuleReadme = templateText(".afol/adm/rules/README.md");
		const downstreamRuleReadme = "downstream rules note\n";
		try {
			mkdirSync(join(root, ".afol", "adm", "rules"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "adm", "rules", "README.md"),
				downstreamRuleReadme,
				"utf8",
			);
			writeFileSync(
				join(root, ".agents", "lock.json"),
				JSON.stringify(
					{
						schema_version: 1,
						revision: "old",
						locked: true,
						managed_hashes: {
							"rules/README.md": sha256Hex(downstreamRuleReadme),
						},
					},
					null,
					2,
				),
				"utf8",
			);

			const output = capture();
			expect(
				await runUpdateCommand(
					[
						"apply",
						"--session",
						session,
						"--task-id",
						taskId,
						"--reason",
						"test update apply",
					],
					root,
					output.io,
				),
			).toBe(0);
			const lock = JSON.parse(
				readFileSync(join(root, ".agents", "lock.json"), "utf8"),
			);
			const manifest = JSON.parse(
				readFileSync(join(root, ".agents", "manifest.json"), "utf8"),
			);
			expect(lock.revision).toBe(sourceLock.revision);
			expect(lock.project).toBe(sourceLock.project);
			expect(manifest.commands).toEqual(sourceManifest.commands);
			expect(
				readFileSync(join(root, ".afol", "adm", "rules", "README.md"), "utf8"),
			).toBe(sourceRuleReadme);
			expect(output.stdout.join("\n")).toContain(
				"update apply: changes available",
			);
			expect(output.stdout.join("\n")).toContain("batch_id: M-");

			const journalPath = join(
				root,
				".afol",
				"data",
				"mutations",
				"mutations.jsonl",
			);
			expect(existsSync(journalPath)).toBe(true);
			const journalRows = readFileSync(journalPath, "utf8")
				.trim()
				.split("\n")
				.map(
					(line) =>
						JSON.parse(line) as {
							sourcePath: string;
							beforeHash: string | null;
							afterHash: string | null;
							backupPath: string | null;
							source?: string;
							batchId?: string;
							session?: string;
							taskId?: string;
						},
				);
			const ruleEntry = journalRows.find(
				(row) => row.sourcePath === ".afol/adm/rules/README.md",
			);
			const lockEntry = journalRows.find(
				(row) => row.sourcePath === ".agents/lock.json",
			);
			expect(ruleEntry).toBeDefined();
			expect(ruleEntry?.beforeHash).toBe(sha256Hex(downstreamRuleReadme));
			expect(ruleEntry?.afterHash).toBe(sha256Hex(sourceRuleReadme));
			expect(ruleEntry?.backupPath).toBeTruthy();
			expect(ruleEntry?.source).toBe("afol-update");
			expect(lockEntry?.source).toBe("afol-update");
			expect(ruleEntry?.batchId).toBeTruthy();
			expect(ruleEntry?.session).toBe(session);
			expect(ruleEntry?.taskId).toBe(taskId);
			expect(lockEntry?.batchId).toBe(ruleEntry?.batchId);
			expect(lockEntry?.backupPath).toBeTruthy();
			expect(readFileSync(ruleEntry?.backupPath ?? "", "utf8")).toBe(
				downstreamRuleReadme,
			);
			expect(existsSync(lockEntry?.backupPath ?? "")).toBe(true);

			const batchId = ruleEntry?.batchId ?? "";
			const appliedLockContent = readFileSync(
				join(root, ".agents", "lock.json"),
				"utf8",
			);
			writeFileSync(join(root, ".agents", "lock.json"), "drift\n", "utf8");
			const driftRollback = capture();
			expect(
				await runUpdateCommand(
					[
						"rollback",
						"--batch-id",
						batchId,
						"--reason",
						"drift check",
						"--json",
					],
					root,
					driftRollback.io,
				),
			).toBe(4);
			writeFileSync(
				join(root, ".agents", "lock.json"),
				appliedLockContent,
				"utf8",
			);
			const rollback = capture();
			expect(
				await runUpdateCommand(
					[
						"rollback",
						"--batch-id",
						batchId,
						"--reason",
						"restore batch",
						"--json",
					],
					root,
					rollback.io,
				),
			).toBe(0);
			expect(
				readFileSync(join(root, ".afol", "adm", "rules", "README.md"), "utf8"),
			).toBe(downstreamRuleReadme);
			const secondRollback = capture();
			expect(
				await runUpdateCommand(
					["rollback", "--batch-id", batchId, "--reason", "repeat", "--json"],
					root,
					secondRollback.io,
				),
			).toBe(4);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply requires governed context for real writes", async () => {
		const root = mkRoot();
		try {
			const output = capture();
			expect(await runUpdateCommand(["apply"], root, output.io)).toBe(2);
			expect(output.stderr.join("\n")).toContain(
				"Real update apply requires --session, --task-id, and --reason.",
			);
			expect(
				readFileSync(join(root, ".agents", "lock.json"), "utf8"),
			).not.toContain("new");
			expect(
				readFileSync(join(root, ".agents", "manifest.json"), "utf8"),
			).not.toContain("validate");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply requires in-progress task when context is bound", async () => {
		const root = mkRoot();
		const { session } = mkBoundUpdateContext(root);
		try {
			const output = capture();
			expect(
				await runUpdateCommand(
					[
						"apply",
						"--session",
						session,
						"--task-id",
						"T-01",
						"--reason",
						"blocked by pending state",
					],
					root,
					output.io,
				),
			).toBe(2);
			expect(output.stderr.join("\n")).toContain(
				"Task T-01 is pending, expected in_progress.",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply blocks restricted operation contexts before writing", async () => {
		const root = mkRoot();
		try {
			const output = capture();
			expect(
				await runUpdateCommand(
					[
						"apply",
						"--session",
						"S-01",
						"--task-id",
						"T-01",
						"--reason",
						"restricted caller",
					],
					root,
					output.io,
					{},
					agentOperationContext(),
				),
			).toBe(2);
			expect(output.stderr.join("\n")).toContain(
				"Real update apply requires local interactive approval.",
			);
			expect(
				readFileSync(join(root, ".agents", "lock.json"), "utf8"),
			).not.toContain("new");
			expect(
				readFileSync(join(root, ".agents", "manifest.json"), "utf8"),
			).not.toContain("validate");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply blocks conflict on user edits and keeps current manifest untouched", async () => {
		const root = mkRoot();
		try {
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				JSON.stringify(
					{
						version: 2,
						commands: { status: ["s", "status"], validate: ["changed"] },
						custom: "touch",
					},
					null,
					2,
				),
				"utf8",
			);

			const blocked = capture();
			const code = await withAfolTestEnv(() =>
				runUpdateCommand(
					["apply", "--allow-unbound-context"],
					root,
					blocked.io,
				),
			);
			expect(code).toBe(4);
			const manifestAfter = JSON.parse(
				readFileSync(join(root, ".agents", "manifest.json"), "utf8"),
			);
			expect(manifestAfter.commands.validate).toEqual(["changed"]);
			expect(manifestAfter.custom).toBe("touch");
			expect(blocked.stdout.join("\n")).toContain("apply details");
			expect(blocked.stdout.join("\n")).toContain("conflicts:");
			expect(blocked.stdout.join("\n")).toContain("- .agents/manifest.json");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply rolls back all target files when journal append fails", async () => {
		const root = mkRoot();
		const originalLock = readFileSync(
			join(root, ".agents", "lock.json"),
			"utf8",
		);
		const originalManifest = readFileSync(
			join(root, ".agents", "manifest.json"),
			"utf8",
		);
		try {
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--session",
							"S-02",
							"--task-id",
							"T-03",
							"--reason",
							"rollback on journal failure",
							"--allow-unbound-context",
						],
						root,
						output.io,
						{ failBeforeJournalAppend: true },
					),
				).toBe(2);
			});
			expect(output.stderr.join("\n")).toContain(
				"Injected update apply failure before journal append",
			);
			expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).toBe(
				originalLock,
			);
			expect(readFileSync(join(root, ".agents", "manifest.json"), "utf8")).toBe(
				originalManifest,
			);
			expect(existsSync(join(root, ".afol", "adm", "rules", "README.md"))).toBe(
				false,
			);
			const journalPath = join(
				root,
				".afol",
				"data",
				"mutations",
				"mutations.jsonl",
			);
			expect(existsSync(journalPath)).toBe(true);
			expect(loadMutationJournalStrict(root).issues).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply surfaces integrity error when rollback journal append also fails", async () => {
		const root = mkRoot();
		const originalLock = readFileSync(
			join(root, ".agents", "lock.json"),
			"utf8",
		);
		const originalManifest = readFileSync(
			join(root, ".agents", "manifest.json"),
			"utf8",
		);
		try {
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--session",
							"S-02",
							"--task-id",
							"T-03",
							"--reason",
							"rollback on journal failure",
							"--allow-unbound-context",
						],
						root,
						output.io,
						{
							failBeforeJournalAppend: true,
							failBeforeRollbackJournalAppend: true,
						},
					),
				).toBe(2);
			});
			expect(output.stderr.join("\n")).toContain("INTEGRITY_ERROR");
			expect(output.stderr.join("\n")).toContain(
				"Injected update apply failure before journal append",
			);
			expect(output.stderr.join("\n")).toContain(
				"rollback journal write failed",
			);
			expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).toBe(
				originalLock,
			);
			expect(readFileSync(join(root, ".agents", "manifest.json"), "utf8")).toBe(
				originalManifest,
			);
			expect(existsSync(join(root, ".afol", "adm", "rules", "README.md"))).toBe(
				false,
			);
			const journalPath = join(
				root,
				".afol",
				"data",
				"mutations",
				"mutations.jsonl",
			);
			expect(existsSync(journalPath)).toBe(true);
			const journal = loadMutationJournalStrict(root);
			expect(journal.issues.length).toBeGreaterThan(0);
			for (const issue of journal.issues)
				expect(issue.startsWith("unmatched-prepared:")).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rollback surfaces integrity error when its journal append also fails", async () => {
		const root = mkRoot();
		try {
			const apply = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"prepare rollback batch",
							"--allow-unbound-context",
							"--json",
						],
						root,
						apply.io,
					),
				).toBe(0);
			});
			const batchId =
				(
					JSON.parse(apply.stdout[0] ?? "{}") as {
						data?: { batch_id?: string };
					}
				).data?.batch_id ?? "";
			expect(batchId.length).toBeGreaterThan(0);
			const postApplyLock = readFileSync(
				join(root, ".agents", "lock.json"),
				"utf8",
			);
			const rollback = capture();
			expect(
				await runUpdateCommand(
					["rollback", "--batch-id", batchId, "--reason", "double failure"],
					root,
					rollback.io,
					{
						failBeforeJournalAppend: true,
						failBeforeRollbackJournalAppend: true,
					},
				),
			).toBe(2);
			expect(rollback.stderr.join("\n")).toContain("INTEGRITY_ERROR");
			expect(rollback.stderr.join("\n")).toContain(
				"Injected update rollback failure before journal append",
			);
			expect(rollback.stderr.join("\n")).toContain(
				"rollback journal write failed",
			);
			expect(rollback.stderr.join("\n")).toContain(`(batch ${batchId})`);
			expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).toBe(
				postApplyLock,
			);
			const journal = loadMutationJournalStrict(root);
			expect(journal.issues.length).toBeGreaterThan(0);
			for (const issue of journal.issues)
				expect(
					issue.startsWith("unmatched-prepared:") ||
						issue.startsWith("unrecoverable-prepared-undo:"),
				).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply rolls back files written before an injected mid-batch failure", async () => {
		const root = mkRoot();
		const originalLock = readFileSync(
			join(root, ".agents", "lock.json"),
			"utf8",
		);
		const originalManifest = readFileSync(
			join(root, ".agents", "manifest.json"),
			"utf8",
		);
		try {
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--session",
							"S-03",
							"--task-id",
							"T-04",
							"--reason",
							"rollback on partial batch failure",
							"--allow-unbound-context",
						],
						root,
						output.io,
						{ failAfterWriteCount: 2 },
					),
				).toBe(2);
			});
			expect(output.stderr.join("\n")).toContain(
				"Injected update apply failure after write",
			);
			expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).toBe(
				originalLock,
			);
			expect(readFileSync(join(root, ".agents", "manifest.json"), "utf8")).toBe(
				originalManifest,
			);
			expect(existsSync(join(root, ".afol", "adm", "rules", "README.md"))).toBe(
				false,
			);
			expect(
				existsSync(join(root, ".afol", "data", "mutations", "mutations.jsonl")),
			).toBe(true);
			expect(loadMutationJournalStrict(root).issues).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("update transactional public contract", () => {
	test("apply journals the full prepared batch before a fault and rolls it back", async () => {
		const root = mkRoot();
		try {
			const originalLock = readFileSync(
				join(root, ".agents", "lock.json"),
				"utf8",
			);
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						["apply", "--reason", "prepared fault", "--allow-unbound-context"],
						root,
						output.io,
						{ failAfterPrepared: true },
					),
				).toBe(2);
			});
			expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).toBe(
				originalLock,
			);
			const rows = readFileSync(
				join(root, ".afol", "data", "mutations", "mutations.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as { status: string; id: string });
			const firstTerminal = rows.findIndex(
				(row) => row.status === "rolled_back",
			);
			expect(firstTerminal).toBeGreaterThan(0);
			expect(
				rows.slice(0, firstTerminal).every((row) => row.status === "prepared"),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("safe managed stale file removal rolls back and journal failure preserves absence", async () => {
		const root = mkRoot();
		const staleRelative = "obsolete-managed.txt";
		const stalePath = join(root, staleRelative);
		try {
			writeFileSync(stalePath, "managed-old\n", "utf8");
			const manifest = templateJson<Record<string, unknown>>(
				".agents/manifest.json",
			);
			manifest.managed_hashes = {
				...(manifest.managed_hashes as Record<string, string> | undefined),
				[staleRelative]: sha256Hex("managed-old\n"),
			};
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				JSON.stringify(manifest, null, 2),
				"utf8",
			);
			const apply = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"safe stale removal",
							"--allow-unbound-context",
							"--json",
						],
						root,
						apply.io,
						{ removedTemplatePaths: [staleRelative] },
					),
				).toBe(0);
			});
			expect(existsSync(stalePath)).toBe(false);
			const batchId =
				(
					JSON.parse(apply.stdout[0] ?? "{}") as {
						data?: { batch_id?: string };
					}
				).data?.batch_id ?? "";
			const failedRollback = capture();
			expect(
				await runUpdateCommand(
					[
						"rollback",
						"--batch-id",
						batchId,
						"--reason",
						"journal fault",
						"--json",
					],
					root,
					failedRollback.io,
					{ failBeforeJournalAppend: true },
				),
			).toBe(2);
			expect(existsSync(stalePath)).toBe(false);
			const rollback = capture();
			expect(
				await runUpdateCommand(
					[
						"rollback",
						"--batch-id",
						batchId,
						"--reason",
						"restore stale",
						"--json",
					],
					root,
					rollback.io,
				),
			).toBe(0);
			expect(readFileSync(stalePath, "utf8")).toBe("managed-old\n");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply replans under the global lock before writing", async () => {
		const root = mkRoot();
		try {
			const manifestPath = join(root, ".agents", "manifest.json");
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						["apply", "--reason", "locked replan", "--allow-unbound-context"],
						root,
						output.io,
						{
							beforeLockedReplan: () =>
								writeFileSync(manifestPath, '{"local":"drift"}\n', "utf8"),
						},
					),
				).toBe(2);
			});
			expect(output.stderr.join("\n")).toContain(
				"update-conflict-after-replan",
			);
			expect(readFileSync(manifestPath, "utf8")).toBe('{"local":"drift"}\n');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("mixed preserve skip still applies compatible managed updates", async () => {
		const root = mkRoot();
		try {
			const manifest = templateJson<Record<string, unknown>>(
				".agents/manifest.json",
			);
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				JSON.stringify(manifest, null, 2),
				"utf8",
			);
			const before = readFileSync(join(root, ".agents", "lock.json"), "utf8");
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"mixed preserve apply",
							"--allow-unbound-context",
						],
						root,
						output.io,
					),
				).toBe(0);
			});
			expect(output.stdout.join("\n")).toContain("preserve=");
			expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).not.toBe(
				before,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("unbound apply emits batch ids and strict-readable CI identities", async () => {
		const root = mkRoot();
		try {
			const json = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"unbound json",
							"--allow-unbound-context",
							"--json",
						],
						root,
						json.io,
					),
				).toBe(0);
			});
			const envelope = JSON.parse(json.stdout[0] ?? "{}") as {
				data?: { batch_id?: string };
			};
			expect(envelope.data?.batch_id).toMatch(/^M-/);
			const strict = loadMutationJournalStrict(root);
			expect(strict.issues).toHaveLength(0);
			const updates = strict.records.filter(
				(record) => record.kind === "update",
			);
			expect(updates.length).toBeGreaterThan(0);
			expect(
				updates.every(
					(record) =>
						record.session === "__ci__" && record.taskId === "__unbound__",
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rollback restores create and update, blocks batch drift, and is single-use", async () => {
		const root = mkRoot();
		try {
			const lockPath = join(root, ".agents", "lock.json");
			const createdPath = join(root, ".afol", "adm", "rules", "README.md");
			const originalLock = readFileSync(lockPath, "utf8");
			expect(existsSync(createdPath)).toBe(false);
			const apply = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"rollback fixture",
							"--allow-unbound-context",
							"--json",
						],
						root,
						apply.io,
					),
				).toBe(0);
			});
			const batchId =
				(
					JSON.parse(apply.stdout[0] ?? "{}") as {
						data?: { batch_id?: string };
					}
				).data?.batch_id ?? "";
			expect(existsSync(createdPath)).toBe(true);
			const appliedLock = readFileSync(lockPath, "utf8");
			writeFileSync(createdPath, "drift\n", "utf8");
			const beforeBlockedLock = readFileSync(lockPath, "utf8");
			const drift = capture();
			expect(
				await runUpdateCommand(
					["rollback", "--batch-id", batchId, "--reason", "drift", "--json"],
					root,
					drift.io,
				),
			).toBe(4);
			expect(readFileSync(lockPath, "utf8")).toBe(beforeBlockedLock);
			writeFileSync(
				createdPath,
				templateText(".afol/adm/rules/README.md"),
				"utf8",
			);
			writeFileSync(lockPath, appliedLock, "utf8");
			const rollback = capture();
			expect(
				await runUpdateCommand(
					["rollback", "--batch-id", batchId, "--reason", "restore", "--json"],
					root,
					rollback.io,
				),
			).toBe(0);
			expect(readFileSync(lockPath, "utf8")).toBe(originalLock);
			expect(existsSync(createdPath)).toBe(false);
			const journalBeforeRepeat = readFileSync(
				join(root, ".afol", "data", "mutations", "mutations.jsonl"),
				"utf8",
			);
			const repeated = capture();
			expect(
				await runUpdateCommand(
					["rollback", "--batch-id", batchId, "--reason", "repeat", "--json"],
					root,
					repeated.io,
				),
			).toBe(4);
			expect(repeated.stdout.join("\n")).toContain("already-rolled-back");
			expect(
				readFileSync(
					join(root, ".afol", "data", "mutations", "mutations.jsonl"),
					"utf8",
				),
			).toBe(journalBeforeRepeat);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("locked replan reruns write context and runtime guards", async () => {
		const root = mkRoot();
		const managedPath = join(root, ".agents", "lock.json");
		const output = capture();
		try {
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"locked guard",
							"--allow-unbound-context",
							"--json",
						],
						root,
						output.io,
						{
							beforeLockedReplan: () => {
								delete process.env.AFOL_TEST;
								rmSync(managedPath);
							},
						},
					),
				).toBe(2);
			});
			expect(output.stdout.join("\n")).toContain(
				"requires AFOL_CI=1 or AFOL_TEST=1",
			);
			expect(existsSync(managedPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rollback dry-run is read-only and runtime provenance gates real rollback", async () => {
		const root = mkRoot();
		const lockPath = join(root, ".agents", "lock.json");
		const original = readFileSync(lockPath, "utf8");
		try {
			const apply = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"rollback guards",
							"--allow-unbound-context",
							"--json",
						],
						root,
						apply.io,
					),
				).toBe(0);
			});
			const batchId =
				(
					JSON.parse(apply.stdout[0] ?? "{}") as {
						data?: { batch_id?: string };
					}
				).data?.batch_id ?? "";
			const applied = readFileSync(lockPath, "utf8");
			const journalPath = join(
				root,
				".afol",
				"data",
				"mutations",
				"mutations.jsonl",
			);
			const journalBefore = readFileSync(journalPath, "utf8");
			const dryRun = capture();
			expect(
				await runUpdateCommand(
					[
						"rollback",
						"--batch-id",
						batchId,
						"--reason",
						"preview",
						"--dry-run",
						"--json",
					],
					root,
					dryRun.io,
				),
			).toBe(0);
			expect(readFileSync(lockPath, "utf8")).toBe(applied);
			expect(readFileSync(journalPath, "utf8")).toBe(journalBefore);

			const staleRuntime = mkCliRuntimeRoot({ packageVersion: "9.9.9" });
			const blocked = capture();
			try {
				expect(
					await runUpdateCommand(
						["rollback", "--batch-id", batchId, "--reason", "real", "--json"],
						root,
						blocked.io,
						{
							cliRoot: staleRuntime,
							invocationPath: join(staleRuntime, "dist", "afol"),
						},
					),
				).toBe(2);
				expect(readFileSync(lockPath, "utf8")).toBe(applied);
				expect(readFileSync(journalPath, "utf8")).toBe(journalBefore);
			} finally {
				rmSync(staleRuntime, { recursive: true, force: true });
			}
			expect(original).not.toBe(applied);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rollback rejects backup paths outside the backup jail and through symlinks", async () => {
		for (const mode of ["outside", "symlink"] as const) {
			if (mode === "symlink" && !symlinkTestSupport.available) continue;
			const root = mkRoot();
			const outside = mkdtempSync(join(tmpdir(), "update-rollback-outside-"));
			try {
				const apply = capture();
				await withAfolTestEnv(async () => {
					expect(
						await runUpdateCommand(
							[
								"apply",
								"--reason",
								"backup jail",
								"--allow-unbound-context",
								"--json",
							],
							root,
							apply.io,
						),
					).toBe(0);
				});
				const batchId =
					(
						JSON.parse(apply.stdout[0] ?? "{}") as {
							data?: { batch_id?: string };
						}
					).data?.batch_id ?? "";
				const journalPath = join(
					root,
					".afol",
					"data",
					"mutations",
					"mutations.jsonl",
				);
				const rows = readFileSync(journalPath, "utf8")
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line) as Record<string, unknown>);
				const committed = rows.find(
					(row) =>
						row.kind === "update" &&
						row.status === "committed" &&
						row.beforeExisted === true,
				);
				expect(committed).toBeTruthy();
				const externalBackup = join(outside, "backup.txt");
				writeFileSync(externalBackup, "outside\n", "utf8");
				if (!committed) throw new Error("missing committed update fixture");
				if (mode === "outside") committed.backupPath = externalBackup;
				else {
					const originalBackup = String(committed.backupPath);
					rmSync(originalBackup, { force: true });
					symlinkSync(externalBackup, originalBackup);
				}
				writeFileSync(
					journalPath,
					`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
					"utf8",
				);
				const before = readFileSync(join(root, ".agents", "lock.json"), "utf8");
				const rollback = capture();
				expect(
					await runUpdateCommand(
						["rollback", "--batch-id", batchId, "--reason", "jail", "--json"],
						root,
						rollback.io,
					),
				).toBe(4);
				expect(rollback.stdout.join("\n")).toContain("rollback-backup-unsafe");
				expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).toBe(
					before,
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		}
	});

	test("rollback revalidates targets and backup bytes inside resource locks", async () => {
		if (!symlinkTestSupport.available) return;
		const root = mkRoot();
		const outside = mkdtempSync(join(tmpdir(), "update-rollback-race-"));
		try {
			const apply = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--reason",
							"race fixture",
							"--allow-unbound-context",
							"--json",
						],
						root,
						apply.io,
					),
				).toBe(0);
			});
			const batchId =
				(
					JSON.parse(apply.stdout[0] ?? "{}") as {
						data?: { batch_id?: string };
					}
				).data?.batch_id ?? "";
			const target = join(root, ".agents", "lock.json");
			const drift = capture();
			expect(
				await runUpdateCommand(
					[
						"rollback",
						"--batch-id",
						batchId,
						"--reason",
						"target race",
						"--json",
					],
					root,
					drift.io,
					{
						beforeRollbackLockedValidation: () =>
							writeFileSync(target, "locked drift\n", "utf8"),
					},
				),
			).toBe(4);
			expect(drift.stdout.join("\n")).toContain("rollback-drift");
			expect(readFileSync(target, "utf8")).toBe("locked drift\n");

			const committed = loadMutationJournalStrict(root).records.find(
				(record) =>
					record.kind === "update" &&
					record.status === "committed" &&
					record.batchId === batchId &&
					record.beforeExisted,
			) as
				| (MutationRecord & {
						backupPath?: string | null;
						afterHash?: string | null;
				  })
				| undefined;
			if (!committed?.backupPath || !committed.afterHash)
				throw new Error("missing rollback backup fixture");
			writeFileSync(
				join(root, committed.sourcePath),
				templateText(committed.sourcePath as TemplateUpdatePath),
				"utf8",
			);
			const external = join(outside, "external.txt");
			writeFileSync(external, "external secret\n", "utf8");
			const backup = committed.backupPath;
			const swapped = capture();
			expect(
				await runUpdateCommand(
					[
						"rollback",
						"--batch-id",
						batchId,
						"--reason",
						"backup race",
						"--json",
					],
					root,
					swapped.io,
					{
						beforeRollbackLockedValidation: () => {
							rmSync(backup, { force: true });
							symlinkSync(external, backup);
						},
					},
				),
			).toBe(4);
			expect(swapped.stdout.join("\n")).toContain("rollback-backup-unsafe");
			expect(readFileSync(join(root, committed.sourcePath), "utf8")).not.toBe(
				"external secret\n",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});

	test("rollback fails closed on mutation journal corruption", async () => {
		const root = mkRoot();
		try {
			const journalPath = join(
				root,
				".afol",
				"data",
				"mutations",
				"mutations.jsonl",
			);
			mkdirSync(join(root, ".afol", "data", "mutations"), { recursive: true });
			writeFileSync(journalPath, "{corrupt\n", "utf8");
			const output = capture();
			expect(
				await runUpdateCommand(
					["rollback", "--batch-id", "B", "--reason", "strict", "--json"],
					root,
					output.io,
				),
			).toBe(2);
			expect(output.stdout.join("\n")).toContain("Mutation journal corruption");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("human apply includes batch_id", async () => {
		const root = mkRoot();
		try {
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						["apply", "--reason", "human batch", "--allow-unbound-context"],
						root,
						output.io,
					),
				).toBe(0);
			});
			expect(output.stdout.join("\n")).toContain("batch_id: M-");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("update JSON failure envelopes", () => {
	test("parse failure emits one machine-readable envelope", async () => {
		const root = mkRoot();
		try {
			const output = capture();
			expect(
				await runUpdateCommand(
					["apply", "--unknown", "--json"],
					root,
					output.io,
				),
			).toBe(2);
			expectUpdateJsonError(output);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runtime preflight failure emits one machine-readable envelope", async () => {
		const root = mkRoot();
		const cliRoot = mkCliRuntimeRoot({ packageVersion: "9.9.9" });
		try {
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--allow-unbound-context",
							"--reason",
							"json runtime failure",
							"--json",
						],
						root,
						output.io,
						{ cliRoot, invocationPath: join(cliRoot, "cli", "main.ts") },
					),
				).toBe(2);
			});
			expectUpdateJsonError(output);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(cliRoot, { recursive: true, force: true });
		}
	});

	test("apply failure emits one machine-readable envelope after rollback", async () => {
		const root = mkRoot();
		const before = readFileSync(join(root, ".agents", "lock.json"), "utf8");
		try {
			const output = capture();
			await withAfolTestEnv(async () => {
				expect(
					await runUpdateCommand(
						[
							"apply",
							"--allow-unbound-context",
							"--reason",
							"json apply failure",
							"--json",
						],
						root,
						output.io,
						{ failAfterWriteCount: 1 },
					),
				).toBe(2);
			});
			expectUpdateJsonError(output);
			expect(readFileSync(join(root, ".agents", "lock.json"), "utf8")).toBe(
				before,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
