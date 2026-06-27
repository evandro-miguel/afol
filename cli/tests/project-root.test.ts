import { describe, expect, test } from "bun:test";
import {
	chmodSync,
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
	const agentsDir = join(root, ".agents");
	mkdirSync(agentsDir, { recursive: true });
	writeFileSync(join(agentsDir, "config.json"), templateConfig, "utf8");
	writeFileSync(join(agentsDir, "lock.json"), templateLock, "utf8");
	writeFileSync(
		join(agentsDir, "agents"),
		"#!/usr/bin/env bash\nexit 0\n",
		"utf8",
	);
	chmodSync(join(agentsDir, "agents"), 0o755);
	return root;
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
			expect(loaded.value.configPath.endsWith(".agents/config.json")).toBe(
				true,
			);
			expect(loaded.value.config.project).toBeDefined();
			expect(loaded.value.lock.locked).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("canonicalizes symlinked project roots before resolving paths", () => {
		const root = mkProjectRoot("root-symlink-target");
		const linkParent = mkdtempSync(join(tmpdir(), "project-root-link-parent-"));
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
				join(realRoot, ".agents", "config.json"),
			);

			const paths = resolveProjectPaths(link);
			expect(paths.abs.stateDb).toBe(join(realRoot, ".afol/state/afol.db"));
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(linkParent, { recursive: true, force: true });
		}
	});

	test("returns root-not-found when no .agents config exists", () => {
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

	test("rejects symlinked .agents config roots", () => {
		const root = mkdtempSync(join(tmpdir(), "project-root-agent-symlink-"));
		const outside = mkdtempSync(join(tmpdir(), "project-root-outside-agents-"));
		try {
			writeFileSync(join(outside, "config.json"), templateConfig, "utf8");
			writeFileSync(join(outside, "lock.json"), templateLock, "utf8");
			symlinkSync(outside, join(root, ".agents"), "dir");

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
	});

	test("schema readers reject symlinked parent directories", () => {
		const root = mkdtempSync(join(tmpdir(), "project-root-schema-symlink-"));
		const outside = mkdtempSync(join(tmpdir(), "project-root-outside-schema-"));
		try {
			writeFileSync(join(outside, "config.json"), templateConfig, "utf8");
			writeFileSync(join(outside, "shape.yaml"), "ok: true\n", "utf8");
			symlinkSync(outside, join(root, ".agents"), "dir");

			const json = loadJsonObject(join(root, ".agents", "config.json"));
			expect(json.ok).toBe(false);
			if (!json.ok) {
				expect(json.error).toContain("symlink");
			}

			const yaml = loadYamlObject(join(root, ".agents", "shape.yaml"));
			expect(yaml.ok).toBe(false);
			if (!yaml.ok) {
				expect(yaml.error).toContain("symlink");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});

	test("returns invalid state for malformed config/lock", () => {
		const root = mkdtempSync(join(tmpdir(), "project-root-invalid-"));
		const agentsDir = join(root, ".agents");
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(join(agentsDir, "config.json"), "{invalid", "utf8");
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

	test("rejects AFOL paths that cross symlinked mutable roots", () => {
		const root = mkProjectRoot("mutable-root-symlink");
		const outside = mkdtempSync(join(tmpdir(), "project-root-outside-afol-"));
		try {
			symlinkSync(outside, join(root, ".afol"), "dir");
			expect(() => resolveProjectPaths(root)).toThrow(/Path crosses symlink/);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});

	test("resolves project paths only inside the real project root", () => {
		const root = mkProjectRoot("path-jail");
		const outside = mkdtempSync(join(tmpdir(), "project-root-outside-"));
		try {
			const inside = resolveProjectPath(root, ".agents/config.json");
			expect(inside.ok).toBe(true);
			if (inside.ok) {
				expect(inside.value.relativePath).toBe(".agents/config.json");
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

	test("rejects absolute paths and symlink escapes", () => {
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
	});

	test("rejects write targets that cross symlinks inside root", () => {
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
	});

	test("rejects write targets when final file is a symlink", () => {
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
	});
});
