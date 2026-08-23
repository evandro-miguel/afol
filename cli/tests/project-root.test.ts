import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadJsonObject, loadYamlObject } from "../core/schema";
import { resolveProjectPaths } from "../services/project/paths";
import {
	loadProjectRoot,
	resolveProjectPath,
	resolveProjectWritePath,
} from "../services/project/root";
import { symlinkTestSupport } from "./symlink-test-support";

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

function mkProjectRoot(name: string): string {
	const root = mkdtempSync(join(tmpdir(), `project-root-${name}-`));
	const afolDir = join(root, ".afol");
	const agentsDir = join(root, ".agents");
	mkdirSync(afolDir, { recursive: true });
	mkdirSync(agentsDir, { recursive: true });
	writeFileSync(join(afolDir, "config.json"), templateConfig, "utf8");
	writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");
	return root;
}

function gitInit(dir: string): void {
	execFileSync("git", ["init", "-q"], { cwd: dir });
}

describe("project root loader", () => {
	test("resolves new AFOL path defaults", () => {
		const root = mkProjectRoot("paths");
		try {
			const paths = resolveProjectPaths(root);
			expect(paths.admDir).toBe(".afol/adm");
			expect(paths.pstrDir).toBe(".afol/pstr");
			expect(paths.stateDb).toBe(".afol/state/afol.db");
			expect(paths.libraryDir).toBe(".afol/library");
			expect(paths.memoryFile).toBe(".afol/memory/memory.md");
			expect(paths.abs.admDir).toBe(join(root, ".afol/adm"));
			expect(paths.abs.stateDb).toBe(join(root, ".afol/state/afol.db"));
			expect(paths.abs.memoryFile).toBe(join(root, ".afol/memory/memory.md"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("walks up from nested directory and loads project state", () => {
		const root = mkProjectRoot("nested");
		const nested = join(root, "a", "b", "c");
		mkdirSync(nested, { recursive: true });
		try {
			const loaded = loadProjectRoot(nested);
			expect(loaded.ok).toBe(true);
			if (!loaded.ok) {
				return;
			}
			expect(loaded.value.root).toBe(root);
			expect(
				loaded.value.configPath.endsWith(join(".afol", "config.json")),
			).toBe(true);
			expect(loaded.value.configRelativePath).toBe(".afol/config.json");
			expect(loaded.value.configSource).toBe("canonical");
			expect(loaded.value.config.project).toBeDefined();
			expect(loaded.value.lock.locked).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"canonicalizes symlinked project roots before resolving paths",
		() => {
			const root = mkProjectRoot("root-symlink-target");
			const linkParent = mkdtempSync(
				join(tmpdir(), "project-root-link-parent-"),
			);
			const link = join(linkParent, "linked-project");
			try {
				symlinkSync(root, link, "dir");
				const realRoot = realpathSync(root);

				const loaded = loadProjectRoot(link);
				expect(loaded.ok).toBe(true);
				if (!loaded.ok) {
					return;
				}
				expect(loaded.value.root).toBe(realRoot);
				expect(loaded.value.configPath).toBe(
					join(realRoot, ".afol", "config.json"),
				);
				expect(loaded.value.configSource).toBe("canonical");

				const paths = resolveProjectPaths(link);
				expect(paths.abs.stateDb).toBe(join(realRoot, ".afol/state/afol.db"));
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(linkParent, { recursive: true, force: true });
			}
		},
	);

	test("falls back to legacy .agents config when canonical config is missing", () => {
		const root = mkdtempSync(join(tmpdir(), "project-root-legacy-"));
		const agentsDir = join(root, ".agents");
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(join(agentsDir, "config.json"), templateConfig, "utf8");
		writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");
		try {
			const loaded = loadProjectRoot(root);
			expect(loaded.ok).toBe(true);
			if (!loaded.ok) {
				return;
			}
			expect(loaded.value.configRelativePath).toBe(".agents/config.json");
			expect(loaded.value.configSource).toBe("legacy");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns root-not-found when no project config exists", () => {
		const root = mkdtempSync(join(tmpdir(), "project-root-missing-"));
		try {
			const loaded = loadProjectRoot(root);
			expect(loaded.ok).toBe(false);
			if (!loaded.ok) {
				expect(loaded.error.code).toBe(3);
				expect(loaded.error.message).toContain("Could not detect project root");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns not-found inside nested git repo when only ancestors have AFOL config", () => {
		const ancestor = mkProjectRoot("nested-git-unconfigured");
		const nestedRepo = join(ancestor, "vendor", "nested");
		mkdirSync(nestedRepo, { recursive: true });
		gitInit(nestedRepo);
		try {
			const loaded = loadProjectRoot(join(nestedRepo, "src"));
			expect(loaded.ok).toBe(false);
			if (!loaded.ok) {
				expect(loaded.error.code).toBe(3);
				expect(loaded.error.message).toContain("Could not detect project root");
			}
		} finally {
			rmSync(ancestor, { recursive: true, force: true });
		}
	});

	test("binds to nested git repo that has its own AFOL config", () => {
		const ancestor = mkProjectRoot("nested-git-configured");
		const nestedRepo = join(ancestor, "nested");
		mkdirSync(join(nestedRepo, ".afol"), { recursive: true });
		mkdirSync(join(nestedRepo, ".agents"), { recursive: true });
		gitInit(nestedRepo);
		writeFileSync(
			join(nestedRepo, ".afol", "config.json"),
			templateConfig,
			"utf8",
		);
		writeFileSync(
			join(nestedRepo, ".agents", "lock.json"),
			templateLock,
			"utf8",
		);
		try {
			const loaded = loadProjectRoot(join(nestedRepo, "src"));
			expect(loaded.ok).toBe(true);
			if (!loaded.ok) {
				return;
			}
			expect(realpathSync(loaded.value.root)).toBe(realpathSync(nestedRepo));
		} finally {
			rmSync(ancestor, { recursive: true, force: true });
		}
	});

	test("keeps binding upward inside one git repo rooted at the AFOL project", () => {
		const root = mkProjectRoot("single-git-project");
		gitInit(root);
		const nested = join(root, "a", "b", "c");
		mkdirSync(nested, { recursive: true });
		try {
			const loaded = loadProjectRoot(nested);
			expect(loaded.ok).toBe(true);
			if (!loaded.ok) {
				return;
			}
			expect(realpathSync(loaded.value.root)).toBe(realpathSync(root));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("binds correctly when start path is inside the .git directory", () => {
		const root = mkProjectRoot("inside-git-dir");
		gitInit(root);
		mkdirSync(join(root, ".git", "refs"), { recursive: true });
		try {
			const loaded = loadProjectRoot(join(root, ".git", "refs"));
			expect(loaded.ok).toBe(true);
			if (!loaded.ok) {
				return;
			}
			expect(realpathSync(loaded.value.root)).toBe(realpathSync(root));
			expect(loaded.value.configSource).toBe("canonical");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("treats a .git file entry as a work-tree boundary", () => {
		const ancestor = mkProjectRoot("git-file-boundary");
		const nested = join(ancestor, "wt");
		mkdirSync(nested, { recursive: true });
		writeFileSync(
			join(nested, ".git"),
			"gitdir: ../elsewhere.git/worktrees/wt\n",
			"utf8",
		);
		try {
			const loaded = loadProjectRoot(nested);
			expect(loaded.ok).toBe(false);
			if (!loaded.ok) {
				expect(loaded.error.code).toBe(3);
			}
		} finally {
			rmSync(ancestor, { recursive: true, force: true });
		}
	});

	test("preserves unbounded upward search outside any git work-tree", () => {
		const ancestor = mkProjectRoot("no-git-unbounded");
		const child = join(ancestor, "x", "y", "z");
		mkdirSync(child, { recursive: true });
		try {
			const loaded = loadProjectRoot(child);
			expect(loaded.ok).toBe(true);
			if (!loaded.ok) {
				return;
			}
			expect(realpathSync(loaded.value.root)).toBe(realpathSync(ancestor));
		} finally {
			rmSync(ancestor, { recursive: true, force: true });
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"rejects symlinked .afol config roots",
		() => {
			const root = mkdtempSync(join(tmpdir(), "project-root-afol-symlink-"));
			const outside = mkdtempSync(join(tmpdir(), "project-root-outside-afol-"));
			try {
				writeFileSync(join(outside, "config.json"), templateConfig, "utf8");
				writeFileSync(join(outside, "lock.json"), templateLock, "utf8");
				symlinkSync(outside, join(root, ".afol"), "dir");

				const loaded = loadProjectRoot(root);
				expect(loaded.ok).toBe(false);
				if (!loaded.ok) {
					expect(loaded.error.code).toBe(2);
					expect(loaded.error.message).toContain("symlink");
				}
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!symlinkTestSupport.available)(
		"schema readers reject symlinked parent directories",
		() => {
			const root = mkdtempSync(join(tmpdir(), "project-root-schema-symlink-"));
			const outside = mkdtempSync(
				join(tmpdir(), "project-root-outside-schema-"),
			);
			try {
				writeFileSync(join(outside, "config.json"), templateConfig, "utf8");
				writeFileSync(join(outside, "shape.yaml"), "ok: true\n", "utf8");
				symlinkSync(outside, join(root, ".afol"), "dir");

				const json = loadJsonObject(join(root, ".afol", "config.json"));
				expect(json.ok).toBe(false);
				if (!json.ok) {
					expect(json.error).toContain("symlink");
				}

				const yaml = loadYamlObject(join(root, ".afol", "shape.yaml"));
				expect(yaml.ok).toBe(false);
				if (!yaml.ok) {
					expect(yaml.error).toContain("symlink");
				}
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	test("returns invalid state for malformed config/lock", () => {
		const root = mkdtempSync(join(tmpdir(), "project-root-invalid-"));
		const afolDir = join(root, ".afol");
		const agentsDir = join(root, ".agents");
		mkdirSync(afolDir, { recursive: true });
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(join(afolDir, "config.json"), "{invalid", "utf8");
		writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");
		try {
			const loaded = loadProjectRoot(root);
			expect(loaded.ok).toBe(false);
			if (!loaded.ok) {
				expect(loaded.error.code).toBe(2);
				expect(loaded.error.message).toContain("Invalid JSON in");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"rejects AFOL paths that cross symlinked mutable roots",
		() => {
			const root = mkProjectRoot("mutable-root-symlink");
			const outside = mkdtempSync(join(tmpdir(), "project-root-outside-afol-"));
			try {
				rmSync(join(root, ".afol"), { recursive: true, force: true });
				symlinkSync(outside, join(root, ".afol"), "dir");
				expect(() => resolveProjectPaths(root)).toThrow(/Path crosses symlink/);
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	test("falls back when config declares absolute project paths", () => {
		const root = mkProjectRoot("absolute-config-paths");
		try {
			writeFileSync(
				join(root, ".afol", "config.json"),
				JSON.stringify({
					schema_version: 1,
					project: { name: "afol" },
					paths: {
						mutable_dir: join(tmpdir(), "outside-afol"),
						skills_dir: join(tmpdir(), "outside-skills"),
					},
				}),
				"utf8",
			);

			const paths = resolveProjectPaths(root);
			expect(paths.mutableDir).toBe(".afol");
			expect(paths.skillsDir).toBe(".agents/skills");
			expect(paths.abs.mutableDir).toBe(join(root, ".afol"));
			expect(paths.abs.skillsDir).toBe(join(root, ".agents/skills"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"resolves project paths only inside the real project root",
		() => {
			const root = mkProjectRoot("path-jail");
			const outside = mkdtempSync(join(tmpdir(), "project-root-outside-"));
			try {
				const inside = resolveProjectPath(root, ".afol/config.json");
				expect(inside.ok).toBe(true);
				if (inside.ok) {
					expect(inside.value.relativePath).toBe(".afol/config.json");
				}

				const escaped = resolveProjectPath(root, "../outside.txt");
				expect(escaped.ok).toBe(false);

				symlinkSync(outside, join(root, "outside-link"));
				const symlinked = resolveProjectPath(root, "outside-link/file.txt");
				expect(symlinked.ok).toBe(false);
				if (!symlinked.ok) {
					expect(symlinked.error).toContain("symlink outside project root");
				}
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	test("handles a path component that disappears before realpath inspection", () => {
		const root = mkProjectRoot("path-jail-disappearing-component");
		const disappearing = join(root, "transient");
		mkdirSync(disappearing);
		rmSync(disappearing, { recursive: true, force: true });
		try {
			const resolved = resolveProjectPath(root, "transient/target.txt");
			expect(resolved.ok).toBe(true);
			if (resolved.ok)
				expect(resolved.value.path).toBe(join(root, "transient/target.txt"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects path traversal outside root", () => {
		const root = mkProjectRoot("path-jail-traversal");
		try {
			const outside = resolveProjectPath(root, "../../outside");
			expect(outside.ok).toBe(false);
			if (!outside.ok) {
				expect(outside.error).toContain("Path escapes project root");
			}

			const nestedTraversal = resolveProjectPath(root, "a/b/../../.agents");
			expect(nestedTraversal.ok).toBe(true);
			if (nestedTraversal.ok) {
				expect(nestedTraversal.value.path).toBe(join(root, ".agents"));
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"rejects absolute paths and symlink escapes",
		() => {
			const root = mkProjectRoot("path-jail-abs");
			const outside = mkdtempSync(join(tmpdir(), "project-root-outside-abs-"));
			try {
				const escaped = resolveProjectPath(root, outside);
				expect(escaped.ok).toBe(false);
				if (!escaped.ok) {
					expect(escaped.error).toContain("Path escapes project root");
				}

				const outsideFile = join(outside, "payload.txt");
				writeFileSync(outsideFile, "escape\n", "utf8");
				symlinkSync(outside, join(root, "outside-link-abs"));
				const symlinked = resolveProjectPath(
					root,
					"outside-link-abs/payload.txt",
				);
				expect(symlinked.ok).toBe(false);
				if (!symlinked.ok) {
					expect(symlinked.error).toContain("symlink outside project root");
				}
			} finally {
				rmSync(root, { recursive: true, force: true });
				rmSync(outside, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!symlinkTestSupport.available)(
		"rejects write targets that cross symlinks inside root",
		() => {
			const root = mkProjectRoot("path-jail-write-dir-symlink");
			try {
				mkdirSync(join(root, "real"), { recursive: true });
				symlinkSync(join(root, "real"), join(root, "link"), "dir");

				const symlinked = resolveProjectWritePath(root, "link/file.txt");
				expect(symlinked.ok).toBe(false);
				if (!symlinked.ok) {
					expect(symlinked.error).toContain("Path crosses symlink");
				}
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(!symlinkTestSupport.available)(
		"rejects write targets when final file is a symlink",
		() => {
			const root = mkProjectRoot("path-jail-write-file-symlink");
			try {
				writeFileSync(join(root, "real.txt"), "safe\n", "utf8");
				symlinkSync(join(root, "real.txt"), join(root, "link.txt"));

				const symlinked = resolveProjectWritePath(root, "link.txt");
				expect(symlinked.ok).toBe(false);
				if (!symlinked.ok) {
					expect(symlinked.error).toContain("Path crosses symlink");
				}
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);
});
