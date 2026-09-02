import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import { agentOperationContext } from "../core/operation-context";
import { removeEvolutionTestRoot } from "./evolution-test-support";
import { symlinkTestSupport } from "./symlink-test-support";

const PROJECT_ID = "db97afff-2026-4eb1-a799-5d34fd505267";
const CLI = resolve(import.meta.dir, "..", "main.ts");
const TEMPLATE_ROOT = resolve(import.meta.dir, "../..", "src/project-template");

function fixture(): { root: string; source: string } {
	const root = mkdtempSync(join(tmpdir(), "evolve-import-command-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify({ project: { id: PROJECT_ID, timezone: "UTC" } })}\n`,
	);
	for (const name of ["lock.json", "manifest.json"])
		writeFileSync(
			join(root, ".agents", name),
			readFileSync(join(TEMPLATE_ROOT, ".agents", name)),
		);
	const source = join(root, "codex.jsonl");
	writeFileSync(
		source,
		`${JSON.stringify({ session_id: "s-1", role: "user", content: "token=secret-value" })}\n`,
	);
	return { root, source };
}

function capture() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (v: string) => stdout.push(v),
			stderr: (v: string) => stderr.push(v),
		},
	};
}

function snapshotEvolutionFiles(dbPath: string) {
	return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map((path) => ({
		path,
		exists: existsSync(path),
		bytes: existsSync(path) ? readFileSync(path) : null,
	}));
}

describe("evolve external import commands", () => {
	test("preview reads without creating evolution state or exposing records", async () => {
		const { root, source } = fixture();
		try {
			const captured = capture();
			expect(
				await runEvolveCommand(
					"import",
					["codex", "--source", source, "--json"],
					root,
					captured.io,
				),
			).toBe(0);
			const output = captured.stdout[0] ?? "";
			const payload = JSON.parse(output);
			expect(payload.data).toMatchObject({
				mode: "preview",
				provider: "codex",
				records: 1,
				redacted: true,
			});
			expect(output).not.toContain("secret-value");
			expect(existsSync(join(root, ".afol", "state"))).toBe(false);
			expect(existsSync(join(root, ".afol", "external"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test.skipIf(process.platform === "win32")(
		"confirmation persists redacted import and list is read-only",
		async () => {
			const { root, source } = fixture();
			try {
				const confirmed = capture();
				expect(
					await runEvolveCommand(
						"import",
						["codex", "--source", source, "--confirm", "--json"],
						root,
						confirmed.io,
					),
				).toBe(0);
				const confirmPayload = JSON.parse(confirmed.stdout[0] ?? "{}");
				expect(confirmPayload.data).toMatchObject({
					mode: "confirmed",
					duplicate: false,
					redacted: true,
				});
				expect(confirmPayload.data.artifact_path).toMatch(/^\.afol\//);
				expect(JSON.stringify(confirmPayload)).not.toContain("secret-value");

				const dbPath = join(root, ".afol", "state", "evolution.db");
				const before = snapshotEvolutionFiles(dbPath);
				const listed = capture();
				expect(
					await runEvolveCommand(
						"external",
						["list", "--json"],
						root,
						listed.io,
					),
				).toBe(0);
				const listPayload = JSON.parse(listed.stdout[0] ?? "{}");
				expect(listPayload.data.imports).toHaveLength(1);
				expect(listPayload.data.imports[0].source_path).toBe(
					"<redacted-local-source>",
				);
				expect(JSON.stringify(listPayload)).not.toContain(root);
				expect(snapshotEvolutionFiles(dbPath)).toEqual(before);
			} finally {
				removeEvolutionTestRoot(root);
			}
		},
	);

	test.skipIf(process.platform !== "win32")(
		"confirmation fails closed before creating state when Windows owner and DACL verification is unavailable",
		async () => {
			const { root, source } = fixture();
			try {
				const captured = capture();
				expect(
					await runEvolveCommand(
						"import",
						["codex", "--source", source, "--confirm", "--json"],
						root,
						captured.io,
					),
				).toBe(2);
				const output = JSON.parse(captured.stdout[0] ?? "{}");
				expect(output).toMatchObject({
					ok: false,
					exit_code: 2,
					action: "evolve.import",
					error: {
						code: "EVOLVE_IMPORT_FAILED",
						message:
							"external import persistence is unavailable on Windows until the runtime can verify directory owner and DACL safely",
					},
				});
				expect(existsSync(join(root, ".afol", "state"))).toBe(false);
				expect(existsSync(join(root, ".afol", "external"))).toBe(false);
			} finally {
				removeEvolutionTestRoot(root);
			}
		},
	);

	test("restricted callers cannot confirm imports", async () => {
		const { root, source } = fixture();
		try {
			const captured = capture();
			expect(
				await runEvolveCommand(
					"import",
					["codex", "--source", source, "--confirm", "--json"],
					root,
					captured.io,
					agentOperationContext(),
				),
			).toBe(2);
			expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		} finally {
			removeEvolutionTestRoot(root);
		}
	});

	test.skipIf(!symlinkTestSupport.available)(
		"external list fails closed for stale or symlinked databases",
		async () => {
			const { root } = fixture();
			try {
				const stateDir = join(root, ".afol", "state");
				mkdirSync(stateDir, { recursive: true });
				const dbPath = join(stateDir, "evolution.db");
				let db = new Database(dbPath);
				db.exec("PRAGMA user_version = 6");
				db.close();
				const stale = capture();
				expect(
					await runEvolveCommand(
						"external",
						["list", "--json"],
						root,
						stale.io,
					),
				).toBe(2);

				rmSync(dbPath);
				const target = join(root, "outside.db");
				db = new Database(target);
				db.close();
				symlinkSync(target, dbPath);
				const linked = capture();
				expect(
					await runEvolveCommand(
						"external",
						["list", "--json"],
						root,
						linked.io,
					),
				).toBe(2);
			} finally {
				removeEvolutionTestRoot(root);
			}
		},
	);

	test.skipIf(process.platform === "win32")(
		"two processes confirm the same import exactly once",
		async () => {
			const { root, source } = fixture();
			try {
				const processes = Array.from({ length: 2 }, () =>
					Bun.spawn(
						[
							"bun",
							CLI,
							"evolve",
							"import",
							"codex",
							"--source",
							source,
							"--confirm",
							"--json",
						],
						{ cwd: root, stdout: "pipe", stderr: "pipe" },
					),
				);
				const exits = await Promise.all(
					processes.map((process) => process.exited),
				);
				const stdout = await Promise.all(
					processes.map(async (process) => new Response(process.stdout).text()),
				);
				const stderr = await Promise.all(
					processes.map(async (process) => new Response(process.stderr).text()),
				);
				expect({ exits, stderr }).toEqual({ exits: [0, 0], stderr: ["", ""] });
				const outputs = stdout.map((value) => JSON.parse(value));
				expect(outputs.map((output) => output.data.duplicate).sort()).toEqual([
					false,
					true,
				]);
				const providerDir = join(root, ".afol", "external", "imports", "codex");
				expect(
					readdirSync(providerDir).filter((name) => name.includes(".stage-")),
				).toEqual([]);
			} finally {
				removeEvolutionTestRoot(root);
			}
		},
	);
});
