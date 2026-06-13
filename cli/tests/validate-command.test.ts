import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runValidateCommand } from "../commands/validate";

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

function createValidationFixture(): string {
	const root = mkdtempSync(join(tmpdir(), "validate-command-"));
	const agentsDir = join(root, ".agents");

	mkdirSync(join(agentsDir, "rules"), { recursive: true });
	mkdirSync(join(root, ".afol", "skills"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, "docs", "arc"), { recursive: true });

	writeFileSync(
		join(agentsDir, "config.json"),
		JSON.stringify({
			schema_version: 1,
			project: { name: "validate-fixture" },
		}),
		"utf8",
	);
	writeFileSync(
		join(agentsDir, "lock.json"),
		JSON.stringify({
			schema_version: 1,
			revision: "abc123",
			project: "validate-fixture",
			locked: true,
		}),
		"utf8",
	);
	writeFileSync(
		join(agentsDir, "manifest.json"),
		JSON.stringify({ schema_version: 1, managed_hashes: {} }),
		"utf8",
	);

	return root;
}

describe("validate command", () => {
	test("passes structural checks in a minimal project fixture", async () => {
		const root = createValidationFixture();
		try {
			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);
			expect(captured.stderr).toEqual([]);
			expect(captured.stdout.length).toBe(1);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(payload.ok).toBe(true);
			expect(payload.report).toBeDefined();
			const data = payload.data as { report?: { ok?: boolean } };
			expect(data.report?.ok).toBe(true);
			const checks = payload.checks as Array<Record<string, unknown>>;
			expect(Array.isArray(checks)).toBe(true);
			expect(
				checks.some((entry) => entry.id === "config" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "lock" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "manifest" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "rules_dir" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "skills_dir" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some((entry) => entry.id === "wb_dir" && entry.ok === true),
			).toBe(true);
			expect(
				checks.some(
					(entry) => entry.id === "docs_arc_dir" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) => entry.id === "wb_local_state_index" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) =>
						entry.id === "rules_local_state_index" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) =>
						entry.id === "skills_local_state_index" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) =>
						entry.id === "specs_local_state_index" && entry.ok === true,
				),
			).toBe(true);
			expect(
				checks.some(
					(entry) =>
						entry.id === "files_local_state_index" && entry.ok === true,
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when manifest is missing or invalid", async () => {
		const root = createValidationFixture();
		try {
			writeFileSync(
				join(root, ".agents", "manifest.json"),
				"{invalid-json",
				"utf8",
			);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);
			expect(captured.stderr).toEqual([]);
			expect(captured.stdout.length).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			expect(payload.ok).toBe(false);
			expect(payload.report).toBeDefined();
			const checks = payload.checks as Array<Record<string, unknown>>;
			expect(
				checks.some((entry) => entry.id === "manifest" && entry.ok === false),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when workbench index snapshot is malformed", async () => {
		const root = createValidationFixture();
		try {
			const indexPath = join(root, ".afol", "data", "index");
			mkdirSync(indexPath, { recursive: true });
			writeFileSync(
				join(indexPath, "workbench.json"),
				JSON.stringify({ kind: "bad-kind" }),
				"utf8",
			);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				checks: Array<{ id: string; ok: boolean }>;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			const indexCheck = payload.checks.find(
				(entry) => entry.id === "wb_local_state_index",
			);
			expect(indexCheck).toBeDefined();
			expect(indexCheck?.ok).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when rules index snapshot is malformed", async () => {
		const root = createValidationFixture();
		try {
			const indexPath = join(root, ".afol", "data", "index");
			mkdirSync(indexPath, { recursive: true });
			writeFileSync(
				join(indexPath, "rules.json"),
				JSON.stringify({ kind: "bad-kind" }),
				"utf8",
			);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				checks: Array<{ id: string; ok: boolean }>;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			const indexCheck = payload.checks.find(
				(entry) => entry.id === "rules_local_state_index",
			);
			expect(indexCheck).toBeDefined();
			expect(indexCheck?.ok).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("falls back from invalid rules catalog JSON without crashing validate", async () => {
		const root = createValidationFixture();
		try {
			writeFileSync(
				join(root, ".agents", "rules", "index.json"),
				"{invalid-json",
				"utf8",
			);
			writeFileSync(
				join(root, ".agents", "rules", "RULE-001-example.md"),
				"# Rule 1\n",
				"utf8",
			);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(0);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				ok: boolean;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(payload.ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns structured failure when project validation throws", async () => {
		const root = createValidationFixture();
		try {
			const captured = captureIo();
			const code = await runValidateCommand(
				root,
				["--json"],
				captured.io,
				async () => {
					throw new Error("validation exploded");
				},
			);

			expect(code).toBe(1);
			expect(captured.stderr).toEqual([]);
			const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				ok: boolean;
				checks: Array<{ id: string; ok: boolean; message: string }>;
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			expect(payload.ok).toBe(false);
			expect(payload.checks).toEqual([
				{
					id: "runtime",
					ok: false,
					message: "validation exploded",
				},
			]);

			const human = captureIo();
			const humanCode = await runValidateCommand(
				root,
				[],
				human.io,
				async () => {
					throw new Error("validation exploded");
				},
			);
			expect(humanCode).toBe(1);
			expect(human.stderr).toEqual([]);
			expect(human.stdout[0]).toContain("validate: failed");
			expect(human.stdout[0]).toContain("fail runtime validation exploded");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("runs template forbidden scan when src/project-template exists", async () => {
		const root = createValidationFixture();
		try {
			mkdirSync(join(root, "src", "project-template", "tests"), {
				recursive: true,
			});
			writeFileSync(
				join(root, "src", "project-template", "tests", "forbidden.txt"),
				"forbidden\n",
				"utf8",
			);

			const captured = captureIo();
			const code = await runValidateCommand(root, ["--json"], captured.io);
			expect(code).toBe(1);

			const payload = JSON.parse(captured.stdout[0] ?? "{}") as Record<
				string,
				unknown
			>;
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(1);
			const checks = payload.checks as Array<Record<string, unknown>>;
			const templateCheck = checks.find(
				(entry) => entry.id === "template_forbidden",
			);
			expect(templateCheck).toBeDefined();
			expect(templateCheck?.ok).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
