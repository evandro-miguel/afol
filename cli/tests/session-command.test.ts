import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSessionCommand } from "../commands/session";
import { readActiveSession } from "../services/workbench/lifecycle";
import {
	bindSession,
	readSessionContext,
	removeBinding,
	resolveContextSession,
	resolveSession,
} from "../services/workbench/session-context";

type CapturedIo = {
	stdout: string[];
	stderr: string[];
	io: {
		stdout: (message: string) => void;
		stderr: (message: string) => void;
	};
};

function captureIo(): CapturedIo {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => {
				stdout.push(message);
			},
			stderr: (message: string) => {
				stderr.push(message);
			},
		},
	};
}

function createProjectRoot(name: string): string {
	const root = mkdtempSync(join(tmpdir(), `session-command-${name}-`));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "config.json"),
		JSON.stringify(
			{ schema_version: 1, project: { name: `session-${name}` } },
			null,
			2,
		),
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }, null, 2),
		"utf8",
	);
	return root;
}

function initGitRepo(root: string, branch = "parallel-session-test"): void {
	const git = (args: string[]): void => {
		const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
		if (result.status !== 0) {
			throw new Error(
				result.stderr || result.stdout || `git ${args.join(" ")}`,
			);
		}
	};
	git(["init"]);
	git(["config", "user.email", "test@example.com"]);
	git(["config", "user.name", "Test User"]);
	writeFileSync(join(root, "README.md"), "fixture\n", "utf8");
	git(["add", "README.md"]);
	git(["commit", "-m", "init"]);
	git(["checkout", "-b", branch]);
}

function currentGitBranch(root: string): string {
	const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	});
	if (result.status !== 0) {
		throw new Error(
			result.stderr || result.stdout || "git branch lookup failed",
		);
	}
	return result.stdout.trim();
}

function restoreEnv(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

describe("session context service", () => {
	test("readSessionContext returns empty when file is missing", () => {
		const root = createProjectRoot("missing");
		try {
			expect(readSessionContext(root)).toEqual({ bindings: [] });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bindSession and resolveContextSession round-trip on git repo", () => {
		const root = createProjectRoot("roundtrip");
		initGitRepo(root);
		try {
			const branch = currentGitBranch(root);
			const binding = bindSession(root, {
				session: "S-ROUNDTRIP",
				branch,
				worktree: root,
				actor: "local",
			});
			expect(binding.session).toBe("S-ROUNDTRIP");
			expect(resolveContextSession(root)).toBe("S-ROUNDTRIP");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("session resolution contract", () => {
	test("resolveSession prefers explicit over env, context, and global", () => {
		const root = createProjectRoot("resolve-order");
		initGitRepo(root);
		const saved = {
			AFOL_SESSION: process.env.AFOL_SESSION,
			AFOL_CI: process.env.AFOL_CI,
			CI: process.env.CI,
		};
		try {
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"GLOBAL\n",
				"utf8",
			);
			bindSession(root, {
				session: "CONTEXT",
				branch: currentGitBranch(root),
				worktree: root,
			});
			process.env.AFOL_SESSION = "ENV";
			expect(resolveSession(root, { explicit: "EXPLICIT" })?.session).toBe(
				"EXPLICIT",
			);
			expect(resolveSession(root, {})?.session).toBe("ENV");
			delete process.env.AFOL_SESSION;
			expect(resolveSession(root, {})?.session).toBe("CONTEXT");
			removeBinding(root, "CONTEXT");
			expect(resolveSession(root, {})?.session).toBe("GLOBAL");
		} finally {
			restoreEnv("AFOL_SESSION", saved.AFOL_SESSION);
			restoreEnv("AFOL_CI", saved.AFOL_CI);
			restoreEnv("CI", saved.CI);
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolveSession rejects global fallback in CI mode", () => {
		const root = createProjectRoot("ci-mode");
		const saved = {
			AFOL_SESSION: process.env.AFOL_SESSION,
			AFOL_CI: process.env.AFOL_CI,
			CI: process.env.CI,
		};
		try {
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"GLOBAL\n",
				"utf8",
			);
			delete process.env.AFOL_SESSION;
			process.env.CI = "1";
			expect(resolveSession(root, {})).toBeNull();
		} finally {
			restoreEnv("AFOL_SESSION", saved.AFOL_SESSION);
			restoreEnv("AFOL_CI", saved.AFOL_CI);
			restoreEnv("CI", saved.CI);
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("afol session command", () => {
	test("list renders text and json envelopes", async () => {
		const root = createProjectRoot("list");
		initGitRepo(root);
		try {
			const branch = currentGitBranch(root);
			bindSession(root, {
				session: "LISTED",
				branch,
				worktree: root,
			});
			writeFileSync(
				join(root, ".afol", "wb", ".active_session"),
				"LISTED\n",
				"utf8",
			);
			const text = captureIo();
			const textCode = await runSessionCommand("list", [], root, text.io);
			expect(textCode).toBe(0);
			expect(text.stdout.join("\n")).toContain("session list:");
			expect(text.stdout.join("\n")).toContain("global active: LISTED");
			expect(text.stdout.join("\n")).toContain("LISTED");

			const json = captureIo();
			const jsonCode = await runSessionCommand(
				"list",
				["--json"],
				root,
				json.io,
			);
			expect(jsonCode).toBe(0);
			const parsed = JSON.parse(json.stdout.join("\n")) as {
				schema: string;
				ok: boolean;
				action: string;
				data: {
					global_active_session: string;
					bindings: Array<{ session: string; matches_context: boolean }>;
				};
			};
			expect(parsed.schema).toBe("afol.result/v1");
			expect(parsed.ok).toBe(true);
			expect(parsed.action).toBe("session.list");
			expect(parsed.data.global_active_session).toBe("LISTED");
			expect(parsed.data.bindings[0]?.matches_context).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("bind creates a context binding", async () => {
		const root = createProjectRoot("bind");
		initGitRepo(root);
		try {
			const io = captureIo();
			const code = await runSessionCommand(
				"bind",
				["--session", "BOUND", "--actor", "local"],
				root,
				io.io,
			);
			expect(code).toBe(0);
			expect(readSessionContext(root).bindings[0]?.session).toBe("BOUND");
			expect(io.stdout.join("\n")).toContain("session bound: BOUND");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("switch updates the global pointer and binding", async () => {
		const root = createProjectRoot("switch");
		initGitRepo(root);
		try {
			const io = captureIo();
			const code = await runSessionCommand("switch", ["SWITCHED"], root, io.io);
			expect(code).toBe(0);
			expect(readActiveSession(root)).toBe("SWITCHED");
			expect(resolveContextSession(root)).toBe("SWITCHED");
			expect(io.stdout.join("\n")).toContain("session switched: SWITCHED");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("unbind removes a binding", async () => {
		const root = createProjectRoot("unbind");
		initGitRepo(root);
		try {
			bindSession(root, {
				session: "UNBOUND",
				branch: currentGitBranch(root),
				worktree: root,
			});
			const io = captureIo();
			const code = await runSessionCommand(
				"unbind",
				["--session", "UNBOUND"],
				root,
				io.io,
			);
			expect(code).toBe(0);
			expect(readSessionContext(root).bindings).toHaveLength(0);
			expect(io.stdout.join("\n")).toContain("session unbound: UNBOUND");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("unknown action exits with code 2", async () => {
		const root = createProjectRoot("unknown");
		initGitRepo(root);
		try {
			const io = captureIo();
			const code = await runSessionCommand("nope", [], root, io.io);
			expect(code).toBe(2);
			expect(io.stderr.join("\n")).toContain(
				"use list, bind, switch, or unbind",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
