import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdmCommand } from "../commands/adm";
import { resolveAdmPaths } from "../services/adm";

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

function createFixture(withAdmFiles: boolean): string {
	const root = mkdtempSync(join(tmpdir(), "adm-command-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(join(root, ".agents", "config.json"), "{}", "utf8");
	if (withAdmFiles) {
		mkdirSync(join(root, ".afol", "adm", "routing"), { recursive: true });
		writeFileSync(
			join(root, ".afol", "adm", "routing", "resolver.md"),
			"route",
			"utf8",
		);
		writeFileSync(join(root, ".afol", "adm", "notes.md"), "notes", "utf8");
	}
	return root;
}

describe("adm command", () => {
	test("paths json reports adm paths under .afol/adm", async () => {
		const root = createFixture(false);
		try {
			const captured = captureIo();
			const code = await runAdmCommand("paths", ["--json"], root, captured.io);
			expect(code).toBe(0);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<string, unknown>;
			expect(payload.action).toBe("paths");
			const paths = payload.paths as Record<string, string>;
			expect(paths.admDir).toContain(".afol/adm");
			expect(paths.schemaDir).toContain(".afol/adm/schema");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("show empty returns 0", async () => {
		const root = createFixture(false);
		try {
			const captured = captureIo();
			const code = await runAdmCommand("show", [], root, captured.io);
			expect(code).toBe(0);
			expect(captured.stderr).toEqual([]);
			expect(captured.stdout).toEqual([""]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("show lists existing files", async () => {
		const root = createFixture(true);
		try {
			const captured = captureIo();
			const code = await runAdmCommand("show", [], root, captured.io);
			expect(code).toBe(0);
			expect(captured.stdout[0]).toContain(".afol/adm/notes.md");
			expect(captured.stdout[0]).toContain(".afol/adm/routing/resolver.md");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("invalid arg exit 2", async () => {
		const root = createFixture(false);
		try {
			const captured = captureIo();
			const code = await runAdmCommand("paths", ["--bad"], root, captured.io);
			expect(code).toBe(2);
			expect(captured.stdout).toEqual([]);
			expect(captured.stderr).toEqual(["Unknown adm argument: --bad"]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("service resolves adm paths", () => {
		const root = createFixture(false);
		try {
			const paths = resolveAdmPaths(root);
			expect(paths.admDir).toBe(join(root, ".afol", "adm"));
			expect(paths.routingDir).toBe(join(root, ".afol", "adm", "routing"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
