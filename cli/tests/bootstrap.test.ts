import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runBootstrapCommand } from "../commands/bootstrap";
import { agentOperationContext } from "../core/operation-context";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";
import { CLI_PACKAGE_NAME, CLI_VERSION } from "../generated/version";
import {
	planBootstrapOperations,
	planCompletionLockGitignoreOperation,
} from "../services/bootstrap/planner";
import { resolveExternalPathLockPath } from "../services/io/session-lock";
import {
	validateFilesIndex,
	validateRulesIndex,
	validateSkillsIndex,
	validateSpecsIndex,
} from "../services/local-state/project-indexes";
import { validateWorkBenchIndex } from "../services/local-state/workbench-index";
import type { TemplateFileMap } from "../services/template/payload";
import { symlinkTestSupport } from "./symlink-test-support";

const symlinkTest = test.skipIf(!symlinkTestSupport.available);

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

const LEGACY_SPECS_INDEX = [
	"---",
	'id: "specs-index"',
	'type: "index"',
	'desc: "AFOL specs index"',
	'created: "2026-06-20"',
	'updated: "2026-06-20"',
	"---",
	"",
	"# Specs INDEX",
	"",
	"- Parent spec:",
	"- Child spec:",
	"",
	"Keep this index updated in downstream projects as new specs are added.",
	"",
].join("\n");

function mkCliRuntimeRoot(
	options: {
		packageName?: string;
		packageVersion?: string;
		provenanceVersion?: string;
		provenancePackageName?: string;
		skipPackageJson?: boolean;
	} = {},
): string {
	const root = mkdtempSync(join(tmpdir(), "bootstrap-cli-runtime-"));
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

function treeState(root: string): string[] {
	if (!existsSync(root)) return ["absent"];
	const state: string[] = [];
	const walk = (directory: string, relative = ""): void => {
		for (const name of readdirSync(directory).sort()) {
			const path = join(directory, name);
			const child = relative ? `${relative}/${name}` : name;
			const stats = statSync(path);
			if (stats.isDirectory()) {
				state.push(`dir:${child}`);
				walk(path, child);
			} else {
				state.push(
					`file:${child}:${createHash("sha256").update(readFileSync(path)).digest("hex")}`,
				);
			}
		}
	};
	walk(root);
	return state;
}

describe("bootstrap planner ownership policy", () => {
	test("plans the project-owned completion-lock ignore policy without writing in dry-run", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-gitignore-policy-"));
		const gitignore = join(target, ".gitignore");
		try {
			writeFileSync(gitignore, "custom-rule\n", "utf8");
			const before = readFileSync(gitignore);
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...values: unknown[]) => logs.push(values.join(" "));
			try {
				expect(
					await runBootstrapCommand([target, "--dry-run", "--verbose"]),
				).toBe(0);
			} finally {
				console.log = originalLog;
			}
			expect(logs.join("\n")).toContain(
				"update-managed .gitignore managed-lock-ignore",
			);
			expect(readFileSync(gitignore)).toEqual(before);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("preserves project-owned gitignore line order and final-newline semantics", () => {
		for (const [content, expected] of [
			["alpha\n", "alpha\n.afol/wb/.locks/\n"],
			["alpha", "alpha\n.afol/wb/.locks/\n"],
			["", ".afol/wb/.locks/\n"],
		]) {
			const operation = planCompletionLockGitignoreOperation({
				state: "regular",
				content: content ?? "",
			});
			expect(operation).toMatchObject({
				kind: "update-managed",
				path: ".gitignore",
				owner: "project-owned",
				nextContent: expected,
			});
		}
		expect(
			planCompletionLockGitignoreOperation({
				state: "regular",
				content: ".afol/wb/.locks/\n.afol/wb/.locks/\n",
			}),
		).toMatchObject({ kind: "skip-identical" });
		expect(
			planCompletionLockGitignoreOperation({ state: "unsafe" }),
		).toMatchObject({ kind: "conflict" });
	});

	test("fails closed for a non-regular completion-lock gitignore", async () => {
		const target = mkdtempSync(
			join(tmpdir(), "bootstrap-gitignore-directory-"),
		);
		try {
			mkdirSync(join(target, ".gitignore"));
			expect(await runBootstrapCommand([target, "--dry-run"])).toBe(4);
			expect(
				await runBootstrapCommand([target, "--dry-run", "--force-managed"]),
			).toBe(4);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	symlinkTest(
		"fails closed for a symlinked completion-lock gitignore [requires symlink privilege]",
		async () => {
			const target = mkdtempSync(
				join(tmpdir(), "bootstrap-gitignore-symlink-"),
			);
			try {
				symlinkSync(join(target, "missing-target"), join(target, ".gitignore"));
				expect(await runBootstrapCommand([target, "--dry-run"])).toBe(4);
				expect(
					await runBootstrapCommand([target, "--dry-run", "--force-managed"]),
				).toBe(4);
			} finally {
				rmSync(target, { recursive: true, force: true });
			}
		},
	);

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
	test("allows restricted dry-run but rejects restricted apply without writes", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-approval-"));
		const before = treeState(target);
		const errors: string[] = [];
		const originalError = console.error;
		try {
			console.error = (...values: unknown[]) =>
				errors.push(values.map(String).join(" "));
			expect(
				await runBootstrapCommand(
					[target, "--dry-run"],
					{},
					agentOperationContext(),
				),
			).toBe(0);
			expect(treeState(target)).toEqual(before);
			expect(
				await runBootstrapCommand([target], {}, agentOperationContext()),
			).toBe(2);
			expect(treeState(target)).toEqual(before);
			expect(errors.join("\n")).toContain(
				"requires local interactive approval",
			);
		} finally {
			console.error = originalError;
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("returns a structured exit for malformed manifest and directory-as-file", async () => {
		for (const fixture of ["manifest", "directory"] as const) {
			const target = mkdtempSync(
				join(tmpdir(), `bootstrap-read-error-${fixture}-`),
			);
			const errors: string[] = [];
			const originalError = console.error;
			try {
				if (fixture === "manifest") {
					mkdirSync(join(target, ".agents"), { recursive: true });
					writeFileSync(
						join(target, ".agents", "manifest.json"),
						"{broken",
						"utf8",
					);
				} else {
					mkdirSync(join(target, ".afol", "config.json"), { recursive: true });
				}
				console.error = (...values: unknown[]) =>
					errors.push(values.map(String).join(" "));
				expect(await runBootstrapCommand([target, "--dry-run"])).toBe(2);
				expect(errors.length).toBeGreaterThan(0);
			} finally {
				console.error = originalError;
				rmSync(target, { recursive: true, force: true });
			}
		}
	});

	test("replans target state after acquiring the target-global lock", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-locked-replan-"));
		const drifted = "changed while waiting for lock\n";
		try {
			const exitCode = await runBootstrapCommand([target], {
				beforeLockedPlan: () => {
					mkdirSync(join(target, ".afol"), { recursive: true });
					writeFileSync(join(target, ".afol", "config.json"), drifted, "utf8");
				},
			});
			expect(exitCode).toBe(4);
			expect(readFileSync(join(target, ".afol", "config.json"), "utf8")).toBe(
				drifted,
			);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	symlinkTest(
		"rejects a target replaced by a symlink while waiting for its lock [requires symlink privilege]",
		async () => {
			const root = mkdtempSync(join(tmpdir(), "bootstrap-locked-target-swap-"));
			const target = join(root, "target");
			const outside = join(root, "outside");
			mkdirSync(target);
			mkdirSync(outside);
			const errors: string[] = [];
			const originalError = console.error;
			try {
				console.error = (...values: unknown[]) =>
					errors.push(values.map(String).join(" "));
				const exitCode = await runBootstrapCommand([target], {
					beforeLockedPlan: () => {
						rmSync(target, { recursive: true, force: true });
						symlinkSync(outside, target, "dir");
					},
				});
				expect(exitCode).toBe(2);
				expect(errors.join("\n")).toContain(
					"Bootstrap target changed while waiting for lock",
				);
				expect(readdirSync(outside)).toEqual([]);
				expect(lstatSync(target).isSymbolicLink()).toBe(true);
			} finally {
				console.error = originalError;
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test("supports a nested nonexistent target with a stable canonical lock key", async () => {
		const root = mkdtempSync(join(tmpdir(), "bootstrap-missing-parent-"));
		const target = join(root, "missing", "nested", "project");
		const lockPath = resolveExternalPathLockPath(target);
		try {
			const runtime = {
				beforeLockedPlan: () => expect(existsSync(lockPath)).toBe(true),
			};
			expect(await runBootstrapCommand([target], runtime)).toBe(0);
			expect(existsSync(join(target, ".afol", "config.json"))).toBe(true);
			expect(await runBootstrapCommand([target], runtime)).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	symlinkTest(
		"rejects existing and broken target-root symlinks without replacing them [requires symlink privilege]",
		async () => {
			const root = mkdtempSync(join(tmpdir(), "bootstrap-root-symlink-"));
			const realTarget = join(root, "real");
			mkdirSync(realTarget);
			for (const [name, destination] of [
				["existing-link", realTarget],
				["broken-link", join(root, "missing")],
			] as const) {
				const target = join(root, name);
				symlinkSync(destination, target, "dir");
				const errors: string[] = [];
				const originalError = console.error;
				try {
					console.error = (...values: unknown[]) =>
						errors.push(values.map(String).join(" "));
					expect(await runBootstrapCommand([target])).toBe(2);
					expect(errors.join("\n")).toContain("must not be a symlink");
					expect(lstatSync(target).isSymbolicLink()).toBe(true);
				} finally {
					console.error = originalError;
				}
			}
			expect(readdirSync(realTarget)).toEqual([]);
			rmSync(root, { recursive: true, force: true });
		},
	);

	test("restores the exact target tree after failures in every mutation phase", async () => {
		const cases = [
			{ hook: "failAfterTemplateWrite", args: [] },
			{ hook: "failAfterCleanup", args: ["--cleanup-obsolete"], cleanup: true },
			{ hook: "failAfterMutableBaseline", args: [] },
			{
				hook: "failAfterProviderMigration",
				args: [
					"--cleanup-provider-compatible-mutable",
					"--confirm-provider-migration",
				],
				provider: true,
			},
		] as const;
		for (const item of cases) {
			const target = mkdtempSync(
				join(tmpdir(), `bootstrap-rollback-${item.hook}-`),
			);
			const errors: string[] = [];
			const originalError = console.error;
			try {
				writeFileSync(join(target, "keep.txt"), "before\n", "utf8");
				if ("cleanup" in item) {
					mkdirSync(join(target, ".agents", "scripts"), { recursive: true });
					writeFileSync(
						join(target, ".agents", "scripts", "legacy.py"),
						"old\n",
						"utf8",
					);
				}
				if ("provider" in item) {
					mkdirSync(join(target, ".agents", "data"), { recursive: true });
					writeFileSync(
						join(target, ".agents", "data", "state.json"),
						"old\n",
						"utf8",
					);
				}
				const before = treeState(target);
				console.error = (...values: unknown[]) =>
					errors.push(values.map(String).join(" "));
				const runtime = { [item.hook]: true };
				expect(await runBootstrapCommand([target, ...item.args], runtime)).toBe(
					2,
				);
				expect(treeState(target)).toEqual(before);
				expect(errors.join("\n")).toContain("Injected bootstrap failure");
			} finally {
				console.error = originalError;
				rmSync(target, { recursive: true, force: true });
			}
		}
	});

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

	test("rejects unregistered binary before writing", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-unregistered-"));
		const cliRoot = mkCliRuntimeRoot();
		const errors: string[] = [];
		const originalError = console.error;
		try {
			console.error = (...values: unknown[]) => {
				errors.push(values.map(String).join(" "));
			};
			expect(
				await runBootstrapCommand([target], {
					cliRoot,
					invocationPath: join(cliRoot, "dist", "afol"),
				}),
			).toBe(2);
			expect(errors.join("\n")).toContain(
				"Refusing real bootstrap: AFOL binary is not locally registered.",
			);
			expect(existsSync(join(target, ".afol", "config.json"))).toBe(false);
		} finally {
			console.error = originalError;
			rmSync(target, { recursive: true, force: true });
			rmSync(cliRoot, { recursive: true, force: true });
		}
	});

	test("accepts registered binary provenance without package.json", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-registered-binary-"));
		const cliRoot = mkCliRuntimeRoot({
			provenanceVersion: CLI_VERSION,
			skipPackageJson: true,
		});
		try {
			expect(existsSync(join(cliRoot, "package.json"))).toBe(false);
			const exitCode = await runBootstrapCommand([target], {
				cliRoot,
				invocationPath: join(cliRoot, "dist", "afol"),
			});
			expect(exitCode).toBe(0);
			expect(existsSync(join(target, ".afol", "config.json"))).toBe(true);
			expect(readFileSync(join(target, ".gitignore"), "utf8")).toBe(
				".afol/wb/.locks/\n",
			);
		} finally {
			rmSync(target, { recursive: true, force: true });
			rmSync(cliRoot, { recursive: true, force: true });
		}
	});

	symlinkTest(
		"does not write template files through symlinked target directories [requires symlink privilege]",
		async () => {
			const target = mkdtempSync(join(tmpdir(), "bootstrap-symlink-target-"));
			const outside = mkdtempSync(join(tmpdir(), "bootstrap-symlink-outside-"));
			const errors: string[] = [];
			const originalError = console.error;
			try {
				console.error = (...values: unknown[]) => {
					errors.push(values.map(String).join(" "));
				};
				symlinkSync(outside, join(target, ".agents"), "dir");

				const exitCode = await runBootstrapCommand([target]);

				expect(exitCode).toBe(2);
				expect(errors.join("\n")).toContain("Path crosses symlink");
				expect(existsSync(join(outside, "config.json"))).toBe(false);
			} finally {
				console.error = originalError;
				rmSync(target, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	test("writes mutable state baseline under .afol and configures paths", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-"));
		try {
			const exitCode = await runBootstrapCommand([
				target,
				"--provider-compatible",
			]);

			expect(exitCode).toBe(0);
			expect(existsSync(join(target, ".afol", "config.json"))).toBe(true);
			expect(
				existsSync(join(target, ".afol", "adm", "rules", "index.json")),
			).toBe(true);
			expect(existsSync(join(target, ".agents", "skills", "README.md"))).toBe(
				true,
			);
			expect(existsSync(join(target, ".agents", "wb"))).toBe(false);
			expect(existsSync(join(target, ".agents", "tmp"))).toBe(false);
			expect(existsSync(join(target, ".agents", "data"))).toBe(false);
			expect(existsSync(join(target, ".afol", "skills"))).toBe(false);
			expect(existsSync(join(target, ".afol", "wb", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "tmp", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "data", "README.md"))).toBe(true);
			expect(
				existsSync(join(target, ".afol", "data", "events", "README.md")),
			).toBe(true);
			expect(
				existsSync(join(target, ".afol", "data", "index", "README.md")),
			).toBe(true);
			expect(
				existsSync(join(target, ".afol", "data", "benchmarks", "catalog")),
			).toBe(false);
			expect(
				existsSync(join(target, ".afol", "data", "project-benchmarks")),
			).toBe(false);
			expect(
				existsSync(join(target, ".afol", "adm", "project-benchmarks")),
			).toBe(false);

			const config = JSON.parse(
				readFileSync(join(target, ".afol", "config.json"), "utf8"),
			) as {
				project: { id: string; timezone: string };
				paths: Record<string, string>;
				evolution: {
					autonomy: { auto_apply_mode: string };
				};
				skills_sync: Record<string, string>;
			};
			expect(config.project.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			);
			expect(config.project.timezone.length).toBeGreaterThan(0);
			expect(config.paths.agents_dir).toBe(".agents");
			expect(config.paths.mutable_dir).toBe(".afol");
			expect(config.paths.adm_dir).toBe(".afol/adm");
			expect(config.paths.rules_dir).toBe(".afol/adm/rules");
			expect(config.paths.hooks_dir).toBe(".afol/adm/hooks");
			expect(config.paths.wb_dir).toBe(".afol/wb");
			expect(config.paths.active_session_file).toBe(".afol/wb/.active_session");
			expect(config.paths.skills_dir).toBe(".agents/skills");
			expect(config.paths.tmp_dir).toBe(".afol/tmp");
			expect(config.paths.data_dir).toBe(".afol/data");
			expect(config.paths.events_file).toBe(".afol/data/events/events.jsonl");
			expect(config.paths.data_index_dir).toBe(".afol/data/index");
			expect(config.paths.mutations_dir).toBe(".afol/data/mutations");
			expect(config.paths.evolution_db).toBe(".afol/state/evolution.db");
			expect(config.paths.evolution_events_dir).toBe(
				".afol/data/events/evolution",
			);
			expect(config.evolution.autonomy.auto_apply_mode).toBe("none");
			expect(config.skills_sync.project_dir).toBe(".agents/skills");
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
			const firstConfig = JSON.parse(
				readFileSync(join(target, ".afol", "config.json"), "utf8"),
			) as { project: { id: string; timezone: string } };
			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);
			const secondConfig = JSON.parse(
				readFileSync(join(target, ".afol", "config.json"), "utf8"),
			) as { project: { id: string; timezone: string } };
			expect(secondConfig.project).toEqual(firstConfig.project);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("migrates an untouched legacy specs index through bootstrap apply", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-legacy-index-"));
		const indexPath = join(target, ".afol", "adm", "specs", "INDEX.md");
		try {
			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);
			writeFileSync(indexPath, LEGACY_SPECS_INDEX, "utf8");

			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);
			const expected = DEFAULT_TEMPLATE_FILES[".afol/adm/specs/INDEX.md"];
			expect(expected).toBeDefined();
			expect(readFileSync(indexPath, "utf8")).toBe(
				Buffer.from(expected?.contentBase64 ?? "", "base64").toString("utf8"),
			);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("generates a distinct stable UUID for each new project", async () => {
		const first = mkdtempSync(join(tmpdir(), "bootstrap-afol-first-"));
		const second = mkdtempSync(join(tmpdir(), "bootstrap-afol-second-"));
		try {
			expect(await runBootstrapCommand([first, "--provider-compatible"])).toBe(
				0,
			);
			expect(await runBootstrapCommand([second, "--provider-compatible"])).toBe(
				0,
			);
			const readProjectId = (root: string): string => {
				const config = JSON.parse(
					readFileSync(join(root, ".afol", "config.json"), "utf8"),
				) as { project: { id: string } };
				return config.project.id;
			};
			expect(readProjectId(first)).not.toBe(readProjectId(second));
		} finally {
			rmSync(first, { recursive: true, force: true });
			rmSync(second, { recursive: true, force: true });
		}
	});

	test("fails closed when an existing evolution identity is invalid", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-identity-"));
		const errors: string[] = [];
		const originalError = console.error;
		try {
			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);
			const configPath = join(target, ".afol", "config.json");
			const config = JSON.parse(readFileSync(configPath, "utf8")) as {
				project: { id: string };
			};
			config.project.id = "not-a-uuid";
			writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
			console.error = (...values: unknown[]) => errors.push(values.join(" "));

			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				2,
			);
			expect(errors.join("\n")).toContain(
				"Existing project.id is not a valid stable UUID",
			);
			expect(readFileSync(configPath, "utf8")).toContain('"id": "not-a-uuid"');
		} finally {
			console.error = originalError;
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
			expect(existsSync(join(target, ".agents", "skills", "README.md"))).toBe(
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
					"--verbose",
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
				"provider-compatible-cleanup-preserved .agents/wb requires-confirm-provider-migration",
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

			expect(existsSync(join(target, ".agents", "skills", "custom.md"))).toBe(
				true,
			);
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
			expect(existsSync(join(archiveRoot, "skills", "custom.md"))).toBe(false);
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
					"--verbose",
				]),
			).toBe(0);

			const output = logs.join("\n");
			expect(output).toContain("create .agents/skills/README.md");
			expect(output).not.toContain("mutable-baseline-create .afol/skills");
			expect(output).toContain(
				"mutable-baseline-create .afol/tmp/README.md source=.afol/tmp/README.md missing-target-file",
			);
			expect(output).toContain(
				"mutable-baseline-create .afol/data/README.md source=.afol/data/README.md missing-target-file",
			);
			expect(output).not.toContain("benchmarks/catalog");
			expect(output).not.toContain("data/project-benchmarks");
			expect(output).not.toContain("provider-compatible-cleanup-removed");
		} finally {
			console.log = originalLog;
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("dry-run json emits one preview envelope without writes", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-json-"));
		const logs: string[] = [];
		const errors: string[] = [];
		const originalLog = console.log;
		const originalError = console.error;
		try {
			console.log = (...values: unknown[]) => {
				logs.push(values.map(String).join(" "));
			};
			console.error = (...values: unknown[]) => {
				errors.push(values.map(String).join(" "));
			};

			const before = readdirSync(target);
			expect(await runBootstrapCommand([target, "--dry-run", "--json"])).toBe(
				0,
			);
			expect(errors).toEqual([]);
			expect(logs).toHaveLength(1);
			const payload = JSON.parse(logs[0] ?? "{}") as {
				schema?: string;
				ok?: boolean;
				action?: string;
				exit_code?: number;
				data?: {
					target?: string;
					mode?: string;
					dry_run?: boolean;
					conflicts?: number;
				};
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.action).toBe("bootstrap.preview");
			expect(payload.exit_code).toBe(0);
			expect(payload.data).toMatchObject({
				target,
				mode: "dry-run",
				dry_run: true,
				conflicts: 0,
			});
			expect(readdirSync(target)).toEqual(before);
		} finally {
			console.log = originalLog;
			console.error = originalError;
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("dry-run json preserves conflict exit 4 and reports no writes", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-afol-json-conflict-"));
		const targetFile = join(target, "AGENTS.md");
		writeFileSync(targetFile, "project-owned\n", "utf8");
		const logs: string[] = [];
		const errors: string[] = [];
		const originalLog = console.log;
		const originalError = console.error;
		try {
			console.log = (...values: unknown[]) => {
				logs.push(values.map(String).join(" "));
			};
			console.error = (...values: unknown[]) => {
				errors.push(values.map(String).join(" "));
			};

			const before = readFileSync(targetFile, "utf8");
			expect(await runBootstrapCommand([target, "--dry-run", "--json"])).toBe(
				4,
			);
			expect(errors).toEqual([]);
			expect(logs).toHaveLength(1);
			const payload = JSON.parse(logs[0] ?? "{}") as {
				schema?: string;
				ok?: boolean;
				action?: string;
				exit_code?: number;
				data?: { conflicts?: number };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(false);
			expect(payload.action).toBe("bootstrap.preview");
			expect(payload.exit_code).toBe(4);
			expect(payload.data?.conflicts).toBeGreaterThan(0);
			expect(readFileSync(targetFile, "utf8")).toBe(before);
		} finally {
			console.log = originalLog;
			console.error = originalError;
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
				readFileSync(join(target, ".afol", "config.json"), "utf8"),
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
			expect(existsSync(join(target, ".agents", "skills", "README.md"))).toBe(
				true,
			);

			const config = JSON.parse(
				readFileSync(join(target, ".afol", "config.json"), "utf8"),
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
			const exitCode = await runBootstrapCommand([target, "--without-claude"]);

			expect(exitCode).toBe(0);
			// Claude artifacts absent
			expect(existsSync(join(target, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(target, ".claude"))).toBe(false);
			// Template files MUST remain (regression guard:
			// --without-claude must not trigger provider-root stripping when
			// mutableDir is .agents).
			expect(existsSync(join(target, ".agents", "skills", "README.md"))).toBe(
				true,
			);
			expect(existsSync(join(target, ".afol", "wb", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "data", "README.md"))).toBe(true);
			expect(existsSync(join(target, ".afol", "skills"))).toBe(false);
			expect(existsSync(join(target, ".afol", "tmp", "README.md"))).toBe(true);

			const config = JSON.parse(
				readFileSync(join(target, ".afol", "config.json"), "utf8"),
			) as {
				paths: { mutable_dir: string };
				adapters?: { claude?: { enabled?: boolean } };
			};
			expect(config.adapters?.claude?.enabled).toBe(false);
			expect(config.paths.mutable_dir).toBe(".afol");
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("custom mutable dir is rejected to avoid split state contracts", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-custom-mutable-"));
		try {
			const exitCode = await runBootstrapCommand([
				target,
				"--mutable-dir",
				".state",
			]);

			expect(exitCode).toBe(2);
			expect(existsSync(join(target, ".afol", "config.json"))).toBe(false);
		} finally {
			rmSync(target, { recursive: true, force: true });
		}
	});
});

describe("bootstrap local-state index build", () => {
	test("fresh apply builds local-state indexes and prints ok", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-local-state-ok-"));
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...values: unknown[]) => logs.push(values.join(" "));
		try {
			expect(await runBootstrapCommand([target, "--provider-compatible"])).toBe(
				0,
			);

			const output = logs.join("\n");
			expect(output).toContain("local_state_index: ok");
			for (const name of ["rules", "skills", "specs", "files", "workbench"]) {
				expect(
					existsSync(join(target, ".afol", "data", "index", `${name}.json`)),
				).toBe(true);
			}
			expect(validateWorkBenchIndex(target).ok).toBe(true);
			for (const check of [
				validateRulesIndex(target),
				validateSkillsIndex(target),
				validateSpecsIndex(target),
				validateFilesIndex(target),
			]) {
				expect(check.ok).toBe(true);
			}
		} finally {
			console.log = originalLog;
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("index build failure keeps init successful with a rebuild hint", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-local-state-fail-"));
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...values: unknown[]) => logs.push(values.join(" "));
		try {
			expect(
				await runBootstrapCommand([target, "--provider-compatible"], {
					failLocalStateIndexBuild: true,
				}),
			).toBe(0);

			expect(logs.join("\n")).toContain(
				"local_state_index: failed; next: run afol local-state rebuild",
			);
			// The completed scaffold must survive the index failure.
			expect(existsSync(join(target, ".afol", "config.json"))).toBe(true);
			expect(existsSync(join(target, "AGENTS.md"))).toBe(true);
		} finally {
			console.log = originalLog;
			rmSync(target, { recursive: true, force: true });
		}
	});

	test("dry-run does not build local-state indexes", async () => {
		const target = mkdtempSync(join(tmpdir(), "bootstrap-local-state-dry-"));
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...values: unknown[]) => logs.push(values.join(" "));
		try {
			expect(await runBootstrapCommand([target, "--dry-run"])).toBe(0);

			expect(logs.join("\n")).not.toContain("local_state_index:");
			expect(
				existsSync(join(target, ".afol", "data", "index", "workbench.json")),
			).toBe(false);
			expect(
				existsSync(join(target, ".afol", "data", "index", "rules.json")),
			).toBe(false);
		} finally {
			console.log = originalLog;
			rmSync(target, { recursive: true, force: true });
		}
	});
});
