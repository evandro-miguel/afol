import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
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
import { runBootstrapCommand } from "../commands/bootstrap";
import { planBootstrapOperations } from "../services/bootstrap/planner";
import type { TemplateFileMap } from "../services/template/payload";

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function templateFileMap(entries: Record<string, string>): TemplateFileMap {
	const files: TemplateFileMap = {};
	for (const [path, content] of Object.entries(entries)) {
		files[path] = {
			path,
			contentBase64: Buffer.from(content, "utf8").toString("base64"),
			sha256: sha256Hex(content),
			bytes: Buffer.byteLength(content),
		};
	}
	return files;
}

describe("bootstrap planner ownership policy", () => {
	test("plans create/skip-identical/update-managed/preserve-project-owned", () => {
		const managedCurrent = "managed-old";
		const templateFiles = templateFileMap({
			"new-file.md": "new-content",
			"same-file.md": "same-content",
			"managed-file.md": "managed-new",
			"project-owned.md": "template-new",
			"generated-lock.json": '{"v":2}',
			"generated-missing.lock": "generated-fresh",
		});

		const plan = planBootstrapOperations({
			templateFiles,
			currentFiles: {
				"same-file.md": "same-content",
				"managed-file.md": managedCurrent,
				"project-owned.md": "custom-project-content",
				"generated-lock.json": '{"v":1}',
			},
			manifest: {
				"managed-file.md": {
					owner: "managed",
					hash: sha256Hex(managedCurrent),
				},
				"project-owned.md": {
					owner: "project-owned",
					hash: sha256Hex("custom-project-content"),
				},
				"generated-lock.json": {
					owner: "generated",
					hash: sha256Hex('{"v":0}'),
				},
				"generated-missing.lock": {
					owner: "generated",
					hash: sha256Hex("generated-old"),
				},
			},
		});

		const kindByPath = new Map(
			plan.operations.map((operation) => [operation.path, operation.kind]),
		);
		expect(kindByPath.get("new-file.md")).toBe("create");
		expect(kindByPath.get("same-file.md")).toBe("skip-identical");
		expect(kindByPath.get("managed-file.md")).toBe("update-managed");
		expect(kindByPath.get("project-owned.md")).toBe("preserve-project-owned");
		expect(kindByPath.get("generated-lock.json")).toBe("update-managed");
		expect(kindByPath.get("generated-missing.lock")).toBe("create");
	});
});

describe("bootstrap provider-compatible mutable state", () => {
	test("rejects unsupported partial installs", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-partial-"));
		const errors: string[] = [];
		const originalError = console.error;
		try {
			console.error = (...values: unknown[]) => {
				errors.push(values.map(String).join(" "));
			};
			expect(await runBootstrapCommand([target, "--partial"])).toBe(2);
			expect(errors.join("\n")).toContain(
				"Unsupported bootstrap argument: --partial",
			);
		} finally {
			console.error = originalError;
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("writes mutable state baseline under .afol and configures paths", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-"));
		try {
			const exitCode = await runBootstrapCommand([
				target,
				"--provider-compatible",
			]);

			expect(exitCode).toBe(0);
			expect(existsSync(join(target, ".agents", "config.json"))).toBe(true);
			expect(existsSync(join(target, ".agents", "rules", "index.json"))).toBe(
				true,
			);
			expect(existsSync(join(target, ".agents", "skills"))).toBe(false);
			expect(existsSync(join(target, ".agents", "wb"))).toBe(false);
			expect(existsSync(join(target, ".agents", "tmp"))).toBe(false);
			expect(existsSync(join(target, ".agents", "data"))).toBe(false);
			expect(existsSync(join(target, ".afol", "skills", "README.md"))).toBe(
				true,
			);
			expect(existsSync(join(target, ".afol", "wb", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "tmp", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "data", "README.md"))).toBe(true);
			expect(
				existsSync(join(target, ".afol", "data", "events", "README.md")),
			).toBe(true);
			expect(
				existsSync(join(target, ".afol", "data", "index", "README.md")),
			).toBe(true);

			const config = JSON.parse(
				readFileSync(join(target, ".agents", "config.json"), "utf8"),
			) as {
				paths: Record<string, string>;
				skills_sync: Record<string, string>;
			};
			expect(config.paths.agents_dir).toBe(".agents");
			expect(config.paths.mutable_dir).toBe(".afol");
			expect(config.paths.wb_dir).toBe(".afol/wb");
			expect(config.paths.active_session_file).toBe(".afol/wb/.active_session");
			expect(config.paths.skills_dir).toBe(".afol/skills");
			expect(config.paths.tmp_dir).toBe(".afol/tmp");
			expect(config.paths.data_dir).toBe(".afol/data");
			expect(config.paths.events_file).toBe(".afol/data/events/events.jsonl");
			expect(config.paths.data_index_dir).toBe(".afol/data/index");
			expect(config.paths.mutations_dir).toBe(".afol/data/mutations");
			expect(config.skills_sync.project_dir).toBe(".afol/skills");
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("is idempotent after provider-compatible config transform", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-idempotent-"));
		try {
			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);
			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("does not overwrite existing mutable baselines with force-managed", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-baseline-"));
		try {
			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);
			const tmpReadme = join(target, ".afol", "tmp", "README.md");
			const edited = "custom downstream tmp notes\n";
			writeFileSync(tmpReadme, edited, "utf8");

			expect(
				await runBootstrapCommand([
					target,
					"--provider-compatible",
					"--force-managed",
				]),
			).toBe(0);
			expect(readFileSync(tmpReadme, "utf8")).toBe(edited);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("provider-compatible preserves legacy mutable roots by default", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-cleanup-"));
		try {
			for (const relativePath of [
				".agents/skills/custom.md",
				".agents/wb/session/task.md",
				".agents/tmp/scratch.txt",
				".agents/data/events/events.jsonl",
			]) {
				const absolutePath = join(target, relativePath);
				mkdirSync(dirname(absolutePath), { recursive: true });
				writeFileSync(absolutePath, "legacy mutable\n", "utf8");
			}

			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);

			expect(existsSync(join(target, ".agents", "skills", "custom.md"))).toBe(
				true,
			);
			expect(
				existsSync(join(target, ".agents", "wb", "session", "task.md")),
			).toBe(true);
			expect(existsSync(join(target, ".agents", "tmp", "scratch.txt"))).toBe(
				true,
			);
			expect(
				existsSync(join(target, ".agents", "data", "events", "events.jsonl")),
			).toBe(true);
			expect(existsSync(join(target, ".afol", "skills", "README.md"))).toBe(
				true,
			);
			expect(existsSync(join(target, ".afol", "wb", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "tmp", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "data", "README.md"))).toBe(true);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("provider-compatible preserves legacy mutable roots when cleanup lacks confirm", async () => {
		const target = mkdtempSync(
			join(tmpdir(), "bootstrap-afol-cleanup-needs-confirm-"),
		);
		const logs: string[] = [];
		const originalLog = console.log;
		try {
			console.log = (...values: unknown[]) => {
				logs.push(values.map(String).join(" "));
			};
			for (const relativePath of [
				".agents/skills/custom.md",
				".agents/wb/session/task.md",
				".agents/tmp/scratch.txt",
				".agents/data/events/events.jsonl",
			]) {
				const absolutePath = join(target, relativePath);
				mkdirSync(dirname(absolutePath), { recursive: true });
				writeFileSync(absolutePath, "legacy mutable\n", "utf8");
			}

			expect(
				await runBootstrapCommand([
					target,
					"--provider-compatible",
					"--cleanup-provider-compatible-mutable",
				]),
			).toBe(0);

			expect(existsSync(join(target, ".agents", "skills", "custom.md"))).toBe(
				true,
			);
			expect(
				existsSync(join(target, ".agents", "wb", "session", "task.md")),
			).toBe(true);
			expect(existsSync(join(target, ".agents", "tmp", "scratch.txt"))).toBe(
				true,
			);
			expect(
				existsSync(join(target, ".agents", "data", "events", "events.jsonl")),
			).toBe(true);
			expect(logs.join("\n")).toContain(
				"provider-compatible-cleanup-preserved .agents/skills requires-confirm-provider-migration",
			);
		} finally {
			console.log = originalLog;
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("provider-compatible archives legacy mutable roots only with cleanup and confirm", async () => {
		const target = mkdtempSync(
			join(tmpdir(), "bootstrap-afol-cleanup-confirmed-"),
		);
		try {
			for (const relativePath of [
				".agents/skills/custom.md",
				".agents/wb/session/task.md",
				".agents/tmp/scratch.txt",
				".agents/data/events/events.jsonl",
			]) {
				const absolutePath = join(target, relativePath);
				mkdirSync(dirname(absolutePath), { recursive: true });
				writeFileSync(absolutePath, "legacy mutable\n", "utf8");
			}

			expect(
				await runBootstrapCommand([
					target,
					"--provider-compatible",
					"--cleanup-provider-compatible-mutable",
					"--confirm-provider-migration",
				]),
			).toBe(0);

			expect(existsSync(join(target, ".agents", "skills"))).toBe(false);
			expect(existsSync(join(target, ".agents", "wb"))).toBe(false);
			expect(existsSync(join(target, ".agents", "tmp"))).toBe(false);
			expect(existsSync(join(target, ".agents", "data"))).toBe(false);

			const archives = readdirSync(join(target, ".afol", "data", "migrations"));
			expect(archives).toHaveLength(1);
			const archiveRoot = join(
				target,
				".afol",
				"data",
				"migrations",
				archives[0] ?? "",
			);
			expect(existsSync(join(archiveRoot, "skills", "custom.md"))).toBe(true);
			expect(existsSync(join(archiveRoot, "wb", "session", "task.md"))).toBe(
				true,
			);
			expect(existsSync(join(archiveRoot, "tmp", "scratch.txt"))).toBe(true);
			expect(
				existsSync(join(archiveRoot, "data", "events", "events.jsonl")),
			).toBe(true);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("dry-run reports provider-compatible mutable baseline details", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-dry-run-"));
		const logs: string[] = [];
		const originalLog = console.log;
		try {
			console.log = (...values: unknown[]) => {
				logs.push(values.map(String).join(" "));
			};
			expect(
				await runBootstrapCommand([
					target,
					"--provider-compatible",
					"--dry-run",
				]),
			).toBe(0);

			const output = logs.join("\n");
			expect(output).toContain(
				"mutable-baseline-create .afol/skills/README.md source=.afol/skills/README.md missing-target-file",
			);
			expect(output).toContain(
				"mutable-baseline-create .afol/tmp/README.md source=.afol/tmp/README.md missing-target-file",
			);
			expect(output).toContain(
				"mutable-baseline-create .afol/data/README.md source=.afol/data/README.md missing-target-file",
			);
			expect(output).not.toContain("provider-compatible-cleanup-removed");
		} finally {
			console.log = originalLog;
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("--without-claude omits Claude artifacts and marks config disabled", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-without-claude-"));
		try {
			const exitCode = await runBootstrapCommand([target, "--without-claude"]);

			expect(exitCode).toBe(0);
			// AGENTS.md is always canonical and must be installed
			expect(existsSync(join(target, "AGENTS.md"))).toBe(true);
			// Claude adapter artifacts must be absent
			expect(existsSync(join(target, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(target, ".claude"))).toBe(false);
			expect(existsSync(join(target, ".claude", "README.md"))).toBe(false);

			const config = JSON.parse(
				readFileSync(join(target, ".agents", "config.json"), "utf8"),
			) as {
				adapters?: { claude?: { enabled?: boolean } };
			};
			expect(config.adapters?.claude?.enabled).toBe(false);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("--without-claude combines with --provider-compatible", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-without-claude-pc-"));
		try {
			const exitCode = await runBootstrapCommand([
				target,
				"--provider-compatible",
				"--without-claude",
			]);

			expect(exitCode).toBe(0);
			expect(existsSync(join(target, "AGENTS.md"))).toBe(true);
			expect(existsSync(join(target, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(target, ".claude"))).toBe(false);
			expect(existsSync(join(target, ".afol", "skills", "README.md"))).toBe(
				true,
			);

			const config = JSON.parse(
				readFileSync(join(target, ".agents", "config.json"), "utf8"),
			) as {
				paths: { mutable_dir: string };
				adapters?: { claude?: { enabled?: boolean } };
			};
			expect(config.paths.mutable_dir).toBe(".afol");
			expect(config.adapters?.claude?.enabled).toBe(false);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("--without-claude with default mutableDir keeps provider-compatible .agents roots", async () => {
		const target = mkdtempSync(
			join(tmpdir(), "bootstrap-without-claude-agents-"),
		);
		try {
			const exitCode = await runBootstrapCommand([
				target,
				"--mutable-dir",
				".agents",
				"--without-claude",
			]);

			expect(exitCode).toBe(0);
			// Claude artifacts absent
			expect(existsSync(join(target, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(target, ".claude"))).toBe(false);
			// Mutable-state template files MUST remain (regression guard:
			// --without-claude must not trigger provider-root stripping when
			// mutableDir is .agents). Template ships these under .afol/.
			expect(existsSync(join(target, ".afol", "wb", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "data", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "skills", "README.md"))).toBe(
				true,
			);
			expect(existsSync(join(target, ".afol", "tmp", "README.md"))).toBe(true);

			const config = JSON.parse(
				readFileSync(join(target, ".agents", "config.json"), "utf8"),
			) as {
				paths: { mutable_dir: string };
				adapters?: { claude?: { enabled?: boolean } };
			};
			expect(config.adapters?.claude?.enabled).toBe(false);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});
});
