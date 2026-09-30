import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { splitCommandLine } from "../commands/workbench/verify";
import { newWorkstream, sessionPaths } from "../services/workbench/lifecycle";
import {
	removeBinding,
	resolveSession,
} from "../services/workbench/session-context";

const kernelPath = join(process.cwd(), "cli/main.ts");

type ProcessResult = ReturnType<typeof spawnSync>;

function runKernel(cwd: string, args: string[]): ProcessResult {
	return spawnSync(process.execPath, [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function runGit(cwd: string, args: string[]): ProcessResult {
	return spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function extractScaffoldCommands(markdown: string): string[] {
	const commands: string[] = [];
	const fences = /```(?:bash|sh|shell)?\r?\n([\s\S]*?)```/g;

	for (const match of markdown.matchAll(fences)) {
		for (const line of (match[1] ?? "").split(/\r?\n/)) {
			const command = line.trim();
			if (command.startsWith("afol ")) commands.push(command);
		}
	}

	return commands;
}

function isCommandTemplate(command: string): boolean {
	return splitCommandLine(command).some((word) => /^<[^<>]+>$/.test(word));
}

function sessionDirectories(root: string): string[] {
	return readdirSync(join(root, ".afol", "wb"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^\d{6}_\d{4}_/.test(entry.name))
		.map((entry) => entry.name);
}

function commandFailure(result: ProcessResult): string {
	return [
		`status=${result.status}`,
		`stdout=${String(result.stdout ?? "").trim() || "<empty>"}`,
		`stderr=${String(result.stderr ?? "").trim() || "<empty>"}`,
	].join("\n");
}

function collectChildOutput(child: ReturnType<typeof spawn>): Promise<{
	code: number | null;
	stdout: string;
	stderr: string;
}> {
	let stdout = "";
	let stderr = "";
	child.stdout?.on("data", (chunk: Buffer) => {
		stdout += chunk.toString();
	});
	child.stderr?.on("data", (chunk: Buffer) => {
		stderr += chunk.toString();
	});
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => resolve({ code, stdout, stderr }));
	});
}

describe("installed scaffold workflow examples", () => {
	test("executes AGENTS lifecycle examples through the local Bun CLI", async () => {
		const root = mkdtempSync(join(tmpdir(), "afol-scaffold-workflow-"));
		try {
			const git = runGit(root, ["init", "-q"]);
			expect(git.status, commandFailure(git)).toBe(0);

			const initialized = runKernel(root, ["init"]);
			expect(initialized.status, commandFailure(initialized)).toBe(0);

			const installedGuide = readFileSync(join(root, "AGENTS.md"), "utf8");
			expect(installedGuide).toContain(
				"Sessions are optional for ordinary work;",
			);
			expect(installedGuide).toContain("paths.wb_dir/<session-id>");
			expect(installedGuide).toContain("<session>/artifacts/");
			expect(installedGuide).toContain("exclusive creation");
			expect(installedGuide).toMatch(
				/without changing\s+original records or closure/,
			);

			const noSessionValidation = runKernel(root, ["v", "project"]);
			expect(
				noSessionValidation.status,
				commandFailure(noSessionValidation),
			).toBe(0);
			expect(sessionDirectories(root)).toHaveLength(0);
			const savedSession = process.env.AFOL_SESSION;
			delete process.env.AFOL_SESSION;
			try {
				expect(resolveSession(root, {})).toBeNull();
			} finally {
				if (savedSession === undefined) delete process.env.AFOL_SESSION;
				else process.env.AFOL_SESSION = savedSession;
			}

			const commands = extractScaffoldCommands(installedGuide);
			const runnableCommands = commands.filter(
				(command) => !isCommandTemplate(command),
			);
			expect(runnableCommands.length).toBeGreaterThan(0);

			for (const command of runnableCommands) {
				const words = splitCommandLine(command);
				expect(words[0]).toBe("afol");
				const result = runKernel(root, words.slice(1));
				expect(result.status, `${command}\n${commandFailure(result)}`).toBe(0);
			}
			expect(commands.some((command) => command.startsWith("afol n "))).toBe(
				true,
			);
			expect(commands.some((command) => command.startsWith("afol d "))).toBe(
				true,
			);

			const sessions = sessionDirectories(root);
			expect(sessions).toHaveLength(1);

			const session = sessions[0] as string;
			const taskPath = join(
				root,
				".afol",
				"wb",
				session,
				`${session}_task_01.md`,
			);
			const task = readFileSync(taskPath, "utf8");
			expect(task).toMatch(/^status: "closed"$/m);
			expect(task).toMatch(/^\| T-01 \| done \|/m);

			const evidence = readFileSync(
				join(root, ".afol", "wb", session, ".evidence.jsonl"),
				"utf8",
			);
			expect(evidence).toContain('"command":"test -d .afol"');
			expect(evidence).toContain('"exit_code":0');

			const savedReviewEnv = process.env.AFOL_SESSION;
			delete process.env.AFOL_SESSION;
			const explicitReview = resolveSession(root, { explicit: session });
			if (savedReviewEnv === undefined) delete process.env.AFOL_SESSION;
			else process.env.AFOL_SESSION = savedReviewEnv;
			expect(explicitReview).toEqual({ session, source: "explicit" });
			if (!explicitReview)
				throw new Error("Expected explicit closed-session review routing.");
			const sessionPath = sessionPaths(root, explicitReview.session);
			const artifactDirectory = join(sessionPath.sessionDir, "artifacts");
			mkdirSync(artifactDirectory, { recursive: true });
			const originalArtifactPath = join(
				artifactDirectory,
				"T-01-original-review.md",
			);
			const originalArtifact = "original closed-session review\n";
			writeFileSync(originalArtifactPath, originalArtifact, { flag: "wx" });
			const taskBeforeReview = readFileSync(sessionPath.taskPath);
			const reportPath = join(
				sessionPath.sessionDir,
				`${session}_report_01.md`,
			);
			const reportBeforeReview = readFileSync(reportPath);
			const evidenceBeforeReview = readFileSync(sessionPath.evidencePath);
			const eventLedgerPath = join(
				root,
				".afol",
				"data",
				"events",
				"events.jsonl",
			);
			const eventLedgerBeforeReview = existsSync(eventLedgerPath)
				? readFileSync(eventLedgerPath)
				: null;

			const gatePath = join(root, "artifact-writers.start");
			const readyPaths = ["agent-a", "agent-b"].map((agent) =>
				join(root, `${agent}.ready`),
			);
			const sharedArtifactPath = join(artifactDirectory, "T-01-review.md");
			const writerResults = ["agent-a", "agent-b"].map((agent) => {
				const readyPath = join(root, `${agent}.ready`);
				const retryName = `T-01-review-${agent}.md`;
				const script = [
					'const { existsSync, writeFileSync } = require("node:fs");',
					'const { join } = require("node:path");',
					`const artifactDirectory = ${JSON.stringify(artifactDirectory)};`,
					`const readyPath = ${JSON.stringify(readyPath)};`,
					`const gatePath = ${JSON.stringify(gatePath)};`,
					`const agent = ${JSON.stringify(agent)};`,
					`const retryName = ${JSON.stringify(retryName)};`,
					"writeFileSync(readyPath, 'ready\\n', { flag: 'wx' });",
					"const wait = new Int32Array(new SharedArrayBuffer(4));",
					"const deadline = Date.now() + 10000;",
					"while (!existsSync(gatePath) && Date.now() < deadline) Atomics.wait(wait, 0, 0, 5);",
					"if (!existsSync(gatePath)) process.exit(2);",
					"const sharedPath = join(artifactDirectory, 'T-01-review.md');",
					"try {",
					"  writeFileSync(sharedPath, agent + '\\n', { flag: 'wx' });",
					"  process.stdout.write(JSON.stringify({ kind: 'created', agent, name: 'T-01-review.md' }));",
					"} catch (error) {",
					"  if (error.code !== 'EEXIST') throw error;",
					"  writeFileSync(join(artifactDirectory, retryName), agent + '\\n', { flag: 'wx' });",
					"  process.stdout.write(JSON.stringify({ kind: 'collision', agent, code: error.code, name: retryName }));",
					"}",
				].join("\n");
				const child = spawn(process.execPath, ["-e", script], {
					cwd: root,
					stdio: ["ignore", "pipe", "pipe"],
				});
				return collectChildOutput(child);
			});
			const readyDeadline = Date.now() + 10000;
			while (
				!readyPaths.every((path) => existsSync(path)) &&
				Date.now() < readyDeadline
			) {
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
			}
			const bothWritersReady = readyPaths.every((path) => existsSync(path));
			writeFileSync(gatePath, "start\n", { flag: "wx" });
			const childResults = await Promise.all(writerResults);
			expect(bothWritersReady).toBe(true);
			expect(childResults.map((result) => result.code)).toEqual([0, 0]);
			expect(childResults.map((result) => result.stderr)).toEqual(["", ""]);
			const outcomes = childResults.map(
				(result) =>
					JSON.parse(result.stdout) as {
						kind: "created" | "collision";
						agent: string;
						code?: string;
						name: string;
					},
			);
			expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
				"collision",
				"created",
			]);
			const winner = outcomes.find((outcome) => outcome.kind === "created");
			const loser = outcomes.find((outcome) => outcome.kind === "collision");
			expect(winner?.name).toBe("T-01-review.md");
			expect(loser?.code).toBe("EEXIST");
			expect(loser?.name).toMatch(/^T-01-review-agent-[ab]\.md$/);
			if (!winner || !loser)
				throw new Error("Expected one winner and one collision.");
			expect(readFileSync(sharedArtifactPath, "utf8").trim()).toBe(
				winner.agent,
			);
			expect(
				readFileSync(join(artifactDirectory, loser.name), "utf8").trim(),
			).toBe(loser.agent);
			expect(readFileSync(originalArtifactPath, "utf8")).toBe(originalArtifact);
			expect(readFileSync(sessionPath.taskPath)).toEqual(taskBeforeReview);
			expect(readFileSync(reportPath)).toEqual(reportBeforeReview);
			expect(readFileSync(sessionPath.evidencePath)).toEqual(
				evidenceBeforeReview,
			);
			if (eventLedgerBeforeReview !== null) {
				expect(readFileSync(eventLedgerPath)).toEqual(eventLedgerBeforeReview);
			}
			expect(readdirSync(artifactDirectory).sort()).toEqual(
				["T-01-original-review.md", "T-01-review.md", loser.name].sort(),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("CI requires an explicit or environment session before artifact routing", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-scaffold-ci-artifacts-"));
		const savedSession = process.env.AFOL_SESSION;
		const savedAfolCi = process.env.AFOL_CI;
		const savedCi = process.env.CI;
		try {
			const git = runGit(root, ["init", "-q"]);
			expect(git.status, commandFailure(git)).toBe(0);
			const initialized = runKernel(root, ["init"]);
			expect(initialized.status, commandFailure(initialized)).toBe(0);

			const opened = newWorkstream(root, "ci artifact routing", {
				noSpecRequiredReason: "CI artifact routing fixture",
			});
			removeBinding(root, opened.session);
			writeFileSync(opened.activeSessionPath, `${opened.session}\n`, "utf8");
			const paths = sessionPaths(root, opened.session);
			const artifactDirectory = join(paths.sessionDir, "artifacts");
			delete process.env.AFOL_SESSION;
			delete process.env.AFOL_CI;
			delete process.env.CI;
			expect(resolveSession(root, {})).toEqual({
				session: opened.session,
				source: "global",
			});

			for (const ciVariable of ["CI", "AFOL_CI"] as const) {
				delete process.env.CI;
				delete process.env.AFOL_CI;
				process.env[ciVariable] = "1";
				expect(resolveSession(root, {})).toBeNull();
				expect(resolveSession(root, { explicit: opened.session })).toEqual({
					session: opened.session,
					source: "explicit",
				});
				process.env.AFOL_SESSION = opened.session;
				expect(resolveSession(root, {})).toEqual({
					session: opened.session,
					source: "env",
				});
				delete process.env.AFOL_SESSION;
			}

			expect(existsSync(artifactDirectory)).toBe(false);
		} finally {
			if (savedSession === undefined) delete process.env.AFOL_SESSION;
			else process.env.AFOL_SESSION = savedSession;
			if (savedAfolCi === undefined) delete process.env.AFOL_CI;
			else process.env.AFOL_CI = savedAfolCi;
			if (savedCi === undefined) delete process.env.CI;
			else process.env.CI = savedCi;
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("repo-local update preview preserves an existing project's edits", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-update-workflow-"));
		try {
			const git = runGit(root, ["init", "-q"]);
			expect(git.status, commandFailure(git)).toBe(0);

			const initialized = runKernel(root, ["init"]);
			expect(initialized.status, commandFailure(initialized)).toBe(0);
			expect(sessionDirectories(root)).toHaveLength(0);

			const guidePath = join(root, "AGENTS.md");
			const customizedGuide = `${readFileSync(guidePath, "utf8")}\nLocal project customization.\n`;
			writeFileSync(guidePath, customizedGuide, "utf8");

			const manifestPath = join(root, ".agents", "manifest.json");
			const customizedManifest = JSON.parse(
				readFileSync(manifestPath, "utf8"),
			) as { commands: Record<string, string[]>; [key: string]: unknown };
			customizedManifest.commands.validate = ["local-validation-command"];
			const manifestBeforeUpdate = `${JSON.stringify(customizedManifest, null, 2)}\n`;
			writeFileSync(manifestPath, manifestBeforeUpdate, "utf8");

			const check = runKernel(root, ["update", "check", "--verbose"]);
			expect(check.status, commandFailure(check)).toBe(0);
			expect(String(check.stdout)).toContain("preserve AGENTS.md");
			expect(String(check.stdout)).toContain(
				".agents/manifest.json [owner=conflict]",
			);

			const preview = runKernel(root, ["update", "preview"]);
			expect(preview.status, commandFailure(preview)).toBe(0);
			expect(String(preview.stdout)).toContain(".agents/manifest.json");

			const dryRun = runKernel(root, ["update", "apply", "--dry-run"]);
			expect(dryRun.status, commandFailure(dryRun)).toBe(4);
			expect(String(dryRun.stdout)).toContain(".agents/manifest.json");
			expect(readFileSync(guidePath, "utf8")).toBe(customizedGuide);
			expect(readFileSync(manifestPath, "utf8")).toBe(manifestBeforeUpdate);
			expect(sessionDirectories(root)).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("repo-local update apply requires and records its session task", () => {
		const root = mkdtempSync(join(tmpdir(), "afol-update-apply-workflow-"));
		try {
			const git = runGit(root, ["init", "-q"]);
			expect(git.status, commandFailure(git)).toBe(0);

			const initialized = runKernel(root, ["init"]);
			expect(initialized.status, commandFailure(initialized)).toBe(0);
			const guidePath = join(root, "AGENTS.md");
			const localGuide = `${readFileSync(guidePath, "utf8")}\nLocal guidance survives update.\n`;
			writeFileSync(guidePath, localGuide, "utf8");

			const created = runKernel(root, [
				"n",
				"existing-update",
				"-t",
				"Apply scaffold update",
				"--no-spec-required",
				"--reason",
				"T09 CLI update fixture",
			]);
			expect(created.status, commandFailure(created)).toBe(0);
			const session = sessionDirectories(root)[0];
			expect(session).toBeDefined();

			const started = runKernel(root, ["st", "T-01"]);
			expect(started.status, commandFailure(started)).toBe(0);

			const lockPath = join(root, ".agents", "lock.json");
			const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
				revision: string;
				project?: string;
			};
			const projectBeforeUpdate = lock.project;
			lock.revision = "older-scaffold-revision";
			writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

			const applied = runKernel(root, [
				"update",
				"apply",
				"--session",
				session as string,
				"--task-id",
				"T-01",
				"--reason",
				"T09 governed fixture update",
			]);
			expect(applied.status, commandFailure(applied)).toBe(0);
			expect(String(applied.stdout)).toContain(
				"update apply: changes available",
			);

			const updatedLock = JSON.parse(readFileSync(lockPath, "utf8")) as {
				revision: string;
				project?: string;
			};
			expect(updatedLock.revision).toBe("afol-dev-layout");
			expect(updatedLock.project).toBe(projectBeforeUpdate);
			expect(readFileSync(guidePath, "utf8")).toBe(localGuide);

			const journal = readFileSync(
				join(root, ".afol", "data", "mutations", "mutations.jsonl"),
				"utf8",
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			const lockUpdate = journal.find(
				(row) =>
					row.sourcePath === ".agents/lock.json" &&
					row.source === "afol-update",
			);
			expect(lockUpdate).toMatchObject({
				session,
				taskId: "T-01",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
