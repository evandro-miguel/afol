import { describe, expect, test } from "bun:test";
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
import { runAdapterCommand } from "../commands/adapter";
import {
	archiveClaudeArtifacts,
	describeClaudeAdapter,
	filterClaudeAdapterFiles,
	findClaudeArtifacts,
	readClaudeAdapterEnabled,
	restoreClaudeArtifacts,
	writeClaudeAdapterEnabled,
} from "../services/adapter/claude";
import type { TemplateFileMap } from "../services/template/payload";
import { symlinkTestSupport } from "./symlink-test-support";

const symlinkTest = test.skipIf(!symlinkTestSupport.available);

function createRoot(withClaudeArtifacts = true): string {
	const root = mkdtempSync(join(tmpdir(), "adapter-cmd-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify({ schema_version: 1, project: { name: "adapter-test" }, paths: {} }, null, 2)}\n`,
	);
	if (withClaudeArtifacts) {
		writeFileSync(join(root, "CLAUDE.md"), "# Claude mirror\n");
		mkdirSync(join(root, ".claude", "rules"), { recursive: true });
		writeFileSync(join(root, ".claude", "README.md"), "claude readme\n");
	}
	return root;
}

function io(): { stdout: string[]; stderr: string[] } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
	};
}

describe("claude adapter service", () => {
	test("enabled defaults to true when config omits adapters", () => {
		const root = createRoot(false);
		try {
			expect(readClaudeAdapterEnabled(root)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("writeClaudeAdapterEnabled toggles the flag and preserves other config", () => {
		const root = createRoot(false);
		try {
			writeClaudeAdapterEnabled(root, false);
			expect(readClaudeAdapterEnabled(root)).toBe(false);
			writeClaudeAdapterEnabled(root, true);
			expect(readClaudeAdapterEnabled(root)).toBe(true);

			// other config keys preserved
			const config = JSON.parse(
				readFileSync(join(root, ".afol", "config.json"), "utf8"),
			);
			expect(config.project.name).toBe("adapter-test");
			expect(config.adapters.claude.enabled).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("readClaudeAdapterEnabled supports legacy .agents config fallback", () => {
		const root = mkdtempSync(join(tmpdir(), "adapter-cmd-legacy-"));
		try {
			mkdirSync(join(root, ".agents"), { recursive: true });
			writeFileSync(
				join(root, ".agents", "config.json"),
				`${JSON.stringify({ schema_version: 1, adapters: { claude: { enabled: false } } }, null, 2)}\n`,
				"utf8",
			);

			expect(readClaudeAdapterEnabled(root)).toBe(false);
			writeClaudeAdapterEnabled(root, true);
			const config = JSON.parse(
				readFileSync(join(root, ".agents", "config.json"), "utf8"),
			);
			expect(config.adapters.claude.enabled).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	symlinkTest(
		"writeClaudeAdapterEnabled rejects symlinked config paths [requires symlink privilege]",
		() => {
		const root = mkdtempSync(join(tmpdir(), "adapter-cmd-symlink-"));
		const outside = mkdtempSync(join(tmpdir(), "adapter-cmd-outside-"));
		try {
			writeFileSync(
				join(outside, "config.json"),
				`${JSON.stringify({ schema_version: 1, adapters: { claude: { enabled: true } } }, null, 2)}\n`,
				"utf8",
			);
			symlinkSync(outside, join(root, ".afol"), "dir");

			expect(() => writeClaudeAdapterEnabled(root, false)).toThrow(
				/Path crosses symlink/,
			);
			expect(readFileSync(join(outside, "config.json"), "utf8")).toContain(
				'"enabled": true',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
		},
	);

	test("findClaudeArtifacts lists present owned paths", () => {
		const root = createRoot(true);
		try {
			expect(findClaudeArtifacts(root).sort()).toEqual([
				".claude",
				"CLAUDE.md",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("archiveClaudeArtifacts moves files into a migration folder", () => {
		const root = createRoot(true);
		try {
			const { archiveRoot, archived } = archiveClaudeArtifacts(root);
			expect(archived.sort()).toEqual([".claude", "CLAUDE.md"]);
			expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(root, ".claude"))).toBe(false);
			expect(existsSync(join(root, archiveRoot, "CLAUDE.md"))).toBe(true);
			expect(existsSync(join(root, archiveRoot, ".claude", "README.md"))).toBe(
				true,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	symlinkTest(
		"archiveClaudeArtifacts rejects symlinked archive roots before creating directories [requires symlink privilege]",
		() => {
		const root = createRoot(true);
		const outside = mkdtempSync(join(tmpdir(), "adapter-archive-outside-"));
		try {
			rmSync(join(root, ".afol"), { recursive: true, force: true });
			symlinkSync(outside, join(root, ".afol"), "dir");

			expect(() => archiveClaudeArtifacts(root)).toThrow(
				/Path crosses symlink/,
			);
			expect(existsSync(join(outside, "data"))).toBe(false);
			expect(existsSync(join(root, "CLAUDE.md"))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
		},
	);

	test("restoreClaudeArtifacts is a no-op when template ships no Claude files", () => {
		const root = createRoot(false);
		try {
			const restored = restoreClaudeArtifacts(root);
			expect(restored).toEqual([]);
			expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(root, ".claude", "README.md"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("filterClaudeAdapterFiles drops CLAUDE.md and .claude/** only", () => {
		const files: TemplateFileMap = {
			"CLAUDE.md": {
				path: "CLAUDE.md",
				contentBase64: "",
				sha256: "",
				bytes: 0,
			},
			".claude/README.md": {
				path: ".claude/README.md",
				contentBase64: "",
				sha256: "",
				bytes: 0,
			},
			"AGENTS.md": {
				path: "AGENTS.md",
				contentBase64: "",
				sha256: "",
				bytes: 0,
			},
			afol: { path: "afol", contentBase64: "", sha256: "", bytes: 0 },
		};
		const filtered = filterClaudeAdapterFiles(files);
		expect(Object.keys(filtered).sort()).toEqual(["AGENTS.md", "afol"]);
	});

	test("describeClaudeAdapter reflects disk + config state", () => {
		const root = createRoot(true);
		try {
			let state = describeClaudeAdapter(root);
			expect(state.enabled).toBe(true);
			expect(state.artifactsPresent).toBe(true);

			writeClaudeAdapterEnabled(root, false);
			state = describeClaudeAdapter(root);
			expect(state.enabled).toBe(false);
			expect(state.artifactsPresent).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("afol adapter command", () => {
	test("list reports claude enabled with artifacts present", async () => {
		const root = createRoot(true);
		const out = io();
		try {
			const code = await runAdapterCommand("list", [], root, {
				stdout: (m) => out.stdout.push(m),
				stderr: (m) => out.stderr.push(m),
			});
			expect(code).toBe(0);
			expect(out.stdout.join("\n")).toContain("claude: enabled");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("list --json emits afol.result envelope", async () => {
		const root = createRoot(true);
		const out = io();
		try {
			const code = await runAdapterCommand("list", ["--json"], root, {
				stdout: (m) => out.stdout.push(m),
				stderr: (m) => out.stderr.push(m),
			});
			expect(code).toBe(0);
			const parsed = JSON.parse(out.stdout.join("\n"));
			expect(parsed.schema).toBe("afol.result/v1");
			expect(parsed.ok).toBe(true);
			expect(parsed.action).toBe("adapter.list");
			expect(parsed.data.adapters[0].id).toBe("claude");
			expect(parsed.data.adapters[0].enabled).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("disable claude archives artifacts and flips config", async () => {
		const root = createRoot(true);
		const out = io();
		try {
			const code = await runAdapterCommand("disable", ["claude"], root, {
				stdout: (m) => out.stdout.push(m),
				stderr: (m) => out.stderr.push(m),
			});
			expect(code).toBe(0);
			expect(readClaudeAdapterEnabled(root)).toBe(false);
			expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(root, ".claude"))).toBe(false);
			expect(out.stdout.join("\n")).toContain("archived:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("disable --dry-run makes no changes", async () => {
		const root = createRoot(true);
		const out = io();
		try {
			const code = await runAdapterCommand(
				"disable",
				["claude", "--dry-run"],
				root,
				{
					stdout: (m) => out.stdout.push(m),
					stderr: (m) => out.stderr.push(m),
				},
			);
			expect(code).toBe(0);
			expect(readClaudeAdapterEnabled(root)).toBe(true);
			expect(existsSync(join(root, "CLAUDE.md"))).toBe(true);
			expect(out.stdout.join("\n")).toContain("dry-run");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("disable twice is idempotent (already disabled)", async () => {
		const root = createRoot(false);
		const out = io();
		try {
			writeClaudeAdapterEnabled(root, false);
			const code = await runAdapterCommand("disable", ["claude"], root, {
				stdout: (m) => out.stdout.push(m),
				stderr: (m) => out.stderr.push(m),
			});
			expect(code).toBe(0);
			expect(out.stdout.join("\n")).toContain("already disabled");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("enable claude flips config without recreating removed artifacts", async () => {
		const root = createRoot(false);
		const out = io();
		try {
			writeClaudeAdapterEnabled(root, false);
			const code = await runAdapterCommand("enable", ["claude"], root, {
				stdout: (m) => out.stdout.push(m),
				stderr: (m) => out.stderr.push(m),
			});
			expect(code).toBe(0);
			expect(readClaudeAdapterEnabled(root)).toBe(true);
			expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
			expect(existsSync(join(root, ".claude", "README.md"))).toBe(false);
			expect(out.stdout.join("\n")).toContain("template empty");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("enable twice is idempotent (already enabled)", async () => {
		const root = createRoot(true);
		const out = io();
		try {
			const code = await runAdapterCommand("enable", ["claude"], root, {
				stdout: (m) => out.stdout.push(m),
				stderr: (m) => out.stderr.push(m),
			});
			expect(code).toBe(0);
			expect(out.stdout.join("\n")).toContain("already enabled");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("disable --json emits structured outcome with archive_root", async () => {
		const root = createRoot(true);
		const out = io();
		try {
			const code = await runAdapterCommand(
				"disable",
				["claude", "--json"],
				root,
				{
					stdout: (m) => out.stdout.push(m),
					stderr: (m) => out.stderr.push(m),
				},
			);
			expect(code).toBe(0);
			const parsed = JSON.parse(out.stdout.join("\n"));
			expect(parsed.ok).toBe(true);
			expect(parsed.action).toBe("adapter.disable");
			expect(parsed.data.next.enabled).toBe(false);
			expect(parsed.data.archived.length).toBeGreaterThan(0);
			expect(parsed.data.archive_root).toMatch(/claude-disabled/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("unknown adapter id exits 2", async () => {
		const root = createRoot(false);
		const out = io();
		try {
			const code = await runAdapterCommand("disable", ["unknown"], root, {
				stdout: (m) => out.stdout.push(m),
				stderr: (m) => out.stderr.push(m),
			});
			expect(code).toBe(2);
			expect(out.stderr.join("\n")).toContain("adapter-unknown");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("unknown action exits 2", async () => {
		const root = createRoot(false);
		const out = io();
		try {
			const code = await runAdapterCommand("frobnicate", ["claude"], root, {
				stdout: (m) => out.stdout.push(m),
				stderr: (m) => out.stderr.push(m),
			});
			expect(code).toBe(2);
			expect(out.stderr.join("\n")).toContain("adapter-action-unknown");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
