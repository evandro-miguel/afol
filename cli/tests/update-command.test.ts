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
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";

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
			expect(output.stdout.join("\n")).toContain(
				`revision old -> ${sourceLock.revision}`,
			);
			expect(output.stdout.join("\n")).toContain("add command validate");
			expect(output.stdout.join("\n")).toContain("ownership(current):");
			expect(output.stdout.join("\n")).toContain("ownership(source):");
			expect(output.stdout.join("\n")).toContain("diff previews:");
			expect(output.stdout.join("\n")).toContain(
				".agents/manifest.json [owner=managed] manifest commands changed",
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
				exit_code: number;
				hasSource: boolean;
				currentRevision: string;
				ownershipSource: Record<string, number>;
				data?: {
					hasSource?: boolean;
					currentRevision?: string;
					ownershipSource?: Record<string, number>;
				};
			};
			expect(parsed.schema).toBe("afol.result/v1");
			expect(parsed.ok).toBe(true);
			expect(parsed.exit_code).toBe(0);
			expect(parsed).toMatchObject({ hasSource: true, currentRevision: "old" });
			expect(parsed.data).toMatchObject({
				hasSource: true,
				currentRevision: "old",
			});
			expect(parsed.ownershipSource.managed).toBe(0);
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

	test("apply updates managed files when no conflicts", async () => {
		const root = mkRoot();
		const sourceLock = templateJson<{ revision: string; project: string }>(
			".agents/lock.json",
		);
		const sourceManifest = templateJson<{ commands: Record<string, string[]> }>(
			".agents/manifest.json",
		);
		const sourceRuleReadme = templateText(".agents/rules/README.md");
		const downstreamRuleReadme = "downstream rules note\n";
		try {
			mkdirSync(join(root, ".agents", "rules"), { recursive: true });
			writeFileSync(
				join(root, ".agents", "rules", "README.md"),
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
				readFileSync(join(root, ".agents", "rules", "README.md"), "utf8"),
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
				(row) => row.sourcePath === ".agents/rules/README.md",
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
			expect(existsSync(join(root, ".agents", "rules", "README.md"))).toBe(
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
