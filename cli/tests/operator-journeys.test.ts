import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuildProjectIndexes } from "../services/local-state/project-indexes";
import { rebuildWorkBenchIndex } from "../services/local-state/workbench-index";

const kernelPath = `${process.cwd()}/cli/main.ts`;

function runKernel(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function parseEnvelope(stdout: string): Record<string, unknown> {
	return JSON.parse(stdout) as Record<string, unknown>;
}

function createProjectRoot(name: string): string {
	const root = mkdtempSync(join(tmpdir(), `operator-journey-${name}-`));
	mkdirSync(join(root, ".agents", "skills"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "rules"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "hooks"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "source"), { recursive: true });
	mkdirSync(join(root, ".afol", "adm", "specs"), { recursive: true });
	mkdirSync(join(root, ".afol", "wb"), { recursive: true });
	mkdirSync(join(root, "docs", "lessons", "entries"), { recursive: true });
	mkdirSync(join(root, "cli", "services"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify({ schema_version: 1, project: { name } }, null, 2)}\n`,
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "lock.json"),
		`${JSON.stringify({ schema_version: 1, locked: true }, null, 2)}\n`,
		"utf8",
	);
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		`${JSON.stringify({ schema_version: 1, managed_hashes: {} }, null, 2)}\n`,
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "tools.json"),
		`${JSON.stringify({ version: "test", tools: [] }, null, 2)}\n`,
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "specs", "session-isolation.md"),
		"# Session isolation\n\nSearch session isolation behavior.\n",
		"utf8",
	);
	writeFileSync(
		join(root, "docs", "lessons", "entries", "session-isolation.md"),
		"# Session isolation lesson\n\nKeep session isolation checks explicit.\n",
		"utf8",
	);
	writeFileSync(
		join(root, ".afol", "adm", "rules", "RULE-123-session-isolation.md"),
		"# Session Isolation Rule\n\nPrefer session isolation over shared state.\n",
		"utf8",
	);
	writeFileSync(
		join(root, "cli", "services", "session-isolation-marker.ts"),
		"export const SESSION_ISOLATION_MARKER = true;\n",
		"utf8",
	);
	rebuildWorkBenchIndex(root);
	rebuildProjectIndexes(root);
	return root;
}

describe("operator UX journeys", () => {
	test("workbench journey shows recovery from failed evidence before close", () => {
		const root = createProjectRoot("workbench-recovery");
		try {
			const help = runKernel(root, ["help"]);
			expect(help.status).toBe(0);
			expect(help.stdout as string).toContain("Side effects");

			const createdProc = runKernel(root, [
				"new",
				"ux contract",
				"--task",
				"Verify operator recovery",
				"--no-spec-required",
				"--reason",
				"operator journey fixture",
				"--json",
			]);
			expect(createdProc.status).toBe(0);
			const created = parseEnvelope(createdProc.stdout as string);
			const session = (created.data as { session: string }).session;
			expect(session).toBeTruthy();

			const startedProc = runKernel(root, [
				"start",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--json",
			]);
			expect(startedProc.status).toBe(0);

			const failedEvidence = runKernel(root, [
				"evidence",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--command",
				"bun test operator-recovery",
				"--result",
				"failed",
			]);
			expect(failedEvidence.status).toBe(0);

			const prematureDone = runKernel(root, [
				"done",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--json",
			]);
			expect(prematureDone.status).toBe(2);
			expect(prematureDone.stdout as string).toContain(
				"authorization must be observed with exit_code 0",
			);

			const doneProc = runKernel(root, [
				"done",
				"--session",
				session,
				"--task-id",
				"T-01",
				"--test",
				"test -d .afol",
				"--json",
			]);
			expect(doneProc.status).toBe(0);
			expect(parseEnvelope(doneProc.stdout as string)).toMatchObject({
				ok: true,
				action: "workbench.done",
			});

			const closeProc = runKernel(root, [
				"close",
				"--session",
				session,
				"--json",
			]);
			expect(closeProc.status).toBe(0);
			expect(parseEnvelope(closeProc.stdout as string)).toMatchObject({
				ok: true,
				action: "workbench.close",
			});

			const evidencePath = join(
				root,
				".afol",
				"wb",
				session,
				".evidence.jsonl",
			);
			expect(readFileSync(evidencePath, "utf8")).toContain(
				"bun test operator-recovery",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("inspection journey orients before validation and context helpers", () => {
		const root = createProjectRoot("inspection");
		try {
			const status = runKernel(root, ["status", "--json"]);
			expect(status.status).toBe(0);
			expect(parseEnvelope(status.stdout as string)).toMatchObject({
				ok: true,
			});

			const preflight = runKernel(root, [
				"preflight",
				"session",
				"isolation",
				"--json",
			]);
			expect(preflight.status).toBe(0);
			const preflightPayload = parseEnvelope(preflight.stdout as string);
			expect(preflightPayload).toMatchObject({
				ok: true,
				action: "preflight",
			});
			expect(
				(preflightPayload.data as { recurrence_detected: boolean })
					.recurrence_detected,
			).toBe(true);

			const contextBuild = runKernel(root, ["ctx", "build", "--json"]);
			expect(
				contextBuild.status,
				`${contextBuild.stderr ?? ""}\n${contextBuild.stdout ?? ""}`,
			).toBe(0);

			const contextTools = runKernel(root, ["ctx", "tools", "--json"]);
			expect(
				contextTools.status,
				`${contextTools.stderr ?? ""}\n${contextTools.stdout ?? ""}`,
			).toBe(0);
			const toolsPayload = parseEnvelope(contextTools.stdout as string);
			expect(toolsPayload).toMatchObject({
				ok: true,
				action: "ctx.tools",
			});
			expect((toolsPayload.data as { tools: string[] }).tools).toContain(
				"afol validate project --json",
			);

			const validate = runKernel(root, ["validate", "project", "--json"]);
			expect(validate.status).toBe(0);
			expect(parseEnvelope(validate.stdout as string)).toMatchObject({
				ok: true,
				action: "validate",
			});
			expect(existsSync(join(root, ".agents", "wb"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
