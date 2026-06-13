import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	loadProjectRoot,
	resolveProjectPath,
} from "../services/project/root";
import { resolveProjectPaths } from "../services/project/paths";

const templateConfig = JSON.stringify({
	schema_version: 1,
	project: {
		name: "agentic-start-folder-dev-refactor-ts",
	},
});
const templateLock = JSON.stringify({
	schema_version: 1,
	revision: "e178aaf",
	project: "agentic-start-folder-dev-refactor-ts",
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
});
