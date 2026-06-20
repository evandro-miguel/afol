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
	writeFileSync(
		join(root, ".agents", "config.json"),
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
					],
					root,
					output.io,
				),
			).toBe(0);

			expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(root, ".claude"))).toBe(false);
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
				".agents/lock.json [owner=managed] revision changed",
			);
			expect(preview.stdout.join("\n")).toContain("@@");

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
			expect(dryRun.stdout.join("\n")).toContain(
				"update-managed .agents/lock.json revision changed",
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

	test("apply accepts registered binary provenance without package.json", async () => {
		const root = mkRoot();
		const cliRoot = mkCliRuntimeRoot({
			provenanceVersion: CLI_VERSION,
			skipPackageJson: true,
		});
		try {
			expect(existsSync(join(cliRoot, "package.json"))).toBe(false);
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
						"binary provenance",
					],
					root,
					output.io,
					{
						cliRoot,
						invocationPath: join(cliRoot, "dist", "afol"),
					},
				),
			).toBe(0);
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
					],
					root,
					output.io,
					{
						cliRoot,
						invocationPath: join(cliRoot, "cli", "main.ts"),
					},
				),
			).toBe(2);
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
						"S-01",
						"--task-id",
						"T-01",
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
			const code = await runUpdateCommand(["apply"], root, blocked.io);
			expect(code).toBe(4);
			const manifestAfter = JSON.parse(
				readFileSync(join(root, ".agents", "manifest.json"), "utf8"),
			);
			expect(manifestAfter.commands.validate).toEqual(["changed"]);
			expect(manifestAfter.custom).toBe("touch");
			expect(blocked.stdout.join("\n")).toContain("apply details");
			expect(blocked.stdout.join("\n")).toContain(
				"conflict .agents/manifest.json local-user-edit-or-unsafe",
			);
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
					],
					root,
					output.io,
					{ failBeforeJournalAppend: true },
				),
			).toBe(2);
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
				".agents",
				"data",
				"mutations",
				"mutations.jsonl",
			);
			expect(existsSync(journalPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
