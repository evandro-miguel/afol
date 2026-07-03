import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdateCommand } from "../commands/update";
import { agentOperationContext } from "../core/operation-context";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";
import { newWorkstream, startTask } from "../services/workbench/lifecycle";

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
					paths: expect.arrayContaining([".agents/manifest.json"]),
				},
			});
			expect(parsed.data?.ownershipSource?.managed).toBe(0);

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
					changes?: { total?: number; paths?: string[] };
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
					paths: expect.arrayContaining([".agents/manifest.json"]),
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
			mkdirSync(join(root, ".afol"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "config.json"),
				'{"local":true}\n',
				"utf8",
			);
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				JSON.stringify(
					{
						version: 1,
						commands: { status: ["s", "status"] },
						ownership: {
							"project-owned": [".afol/config.json", ".agents/manifest.json"],
							generated: [],
							ignored: [],
							conflict: [],
						},
					},
					null,
					2,
				),
				"utf8",
			);

			const dryRun = capture();
			expect(
				await runUpdateCommand(["apply", "--dry-run"], root, dryRun.io),
			).toBe(0);
			expect(dryRun.stdout.join("\n")).toContain("preserve=2");
			expect(readFileSync(join(root, ".afol", "config.json"), "utf8")).toBe(
				'{"local":true}\n',
			);

			const realApply = capture();
			expect(await runUpdateCommand(["apply"], root, realApply.io)).toBe(4);
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
							"--session",
							"S-01",
							"--task-id",
							"T-01",
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
			expect(lockEntry?.batchId).toBe(ruleEntry?.batchId);
			expect(lockEntry?.backupPath).toBeTruthy();
			expect(readFileSync(ruleEntry?.backupPath ?? "", "utf8")).toBe(
				downstreamRuleReadme,
			);
			expect(existsSync(lockEntry?.backupPath ?? "")).toBe(true);
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
			expect(existsSync(journalPath)).toBe(false);
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
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
