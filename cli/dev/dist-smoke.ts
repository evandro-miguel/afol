import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distPath = join(repoRoot, "dist", "afol");

type SpawnResult = ReturnType<typeof spawnSync>;

function runDist(cwd: string, args: string[]): SpawnResult {
	return spawnSync(distPath, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function assertOk(proc: SpawnResult, label: string): void {
	if (proc.status !== 0) {
		throw new Error(
			[
				`${label} failed`,
				`status=${proc.status}`,
				`stdout=${(proc.stdout as string).trim()}`,
				`stderr=${(proc.stderr as string).trim()}`,
			].join("\n"),
		);
	}
}

function assertContains(
	proc: SpawnResult,
	label: string,
	expected: string[],
): void {
	const stdout = proc.stdout as string;
	for (const fragment of expected) {
		if (!stdout.includes(fragment)) {
			throw new Error(
				[
					`${label} missing stdout fragment`,
					`expected=${fragment}`,
					`stdout=${stdout.trim()}`,
					`stderr=${(proc.stderr as string).trim()}`,
				].join("\n"),
			);
		}
	}
}

function sessionFrom(stdout: string): string {
	const match = /session created:\s*(\S+)/.exec(stdout);
	if (!match) {
		throw new Error(`Could not parse session id from stdout=${stdout.trim()}`);
	}
	const session = match[1];
	if (!session) {
		throw new Error(`Parsed empty session id from stdout=${stdout.trim()}`);
	}
	return session;
}

if (!existsSync(distPath)) {
	throw new Error(`Missing ${distPath}. Run bun run build first.`);
}

const sandbox = mkdtempSync(join(tmpdir(), "afol-dist-smoke-"));
const target = join(sandbox, "target");

try {
	const help = runDist(repoRoot, ["--help"]);
	assertOk(help, "dist help");
	assertContains(help, "dist help", ["Usage: afol"]);

	const version = runDist(repoRoot, ["--version"]);
	assertOk(version, "dist version");
	assertContains(version, "dist version", ["afol"]);

	const bootstrap = runDist(sandbox, ["bootstrap", target]);
	assertOk(bootstrap, "dist bootstrap");

	const statusBefore = runDist(target, ["status"]);
	assertOk(statusBefore, "dist status before new");
	assertContains(statusBefore, "dist status before new", [
		"STATUS: none",
		"SESSIONS: 0",
	]);

	const created = runDist(target, [
		"new",
		"smoke",
		"--task",
		"Dist smoke proof",
	]);
	assertOk(created, "dist new");
	const session = sessionFrom(created.stdout as string);

	const statusAfterNew = runDist(target, ["status"]);
	assertOk(statusAfterNew, "dist status after new");
	assertContains(statusAfterNew, "dist status after new", [
		"STATUS: pending",
		"TASK: T-01",
		"SESSIONS: 1",
	]);

	const start = runDist(target, ["start", "--task-id", "T-01"]);
	assertOk(start, "dist start");

	const evidence = runDist(target, [
		"evidence",
		"T-01",
		"--command",
		"smoke",
		"--result",
		"passed",
	]);
	assertOk(evidence, "dist evidence");

	const done = runDist(target, ["done", "--task-id", "T-01"]);
	assertOk(done, "dist done");

	const taskDoc = readFileSync(
		join(target, ".afol", "wb", session, `${session}_task_01.md`),
		"utf8",
	);
	if (!taskDoc.includes("| T-01 | done | worker | Dist smoke proof |")) {
		throw new Error(`task doc missing done row\n${taskDoc}`);
	}

	const evidenceDoc = readFileSync(
		join(target, ".afol", "wb", session, ".evidence.jsonl"),
		"utf8",
	).trim();
	if (!evidenceDoc.includes('"task_id":"T-01"')) {
		throw new Error(`evidence doc missing task id\n${evidenceDoc}`);
	}
	if (!evidenceDoc.includes('"command":"smoke"')) {
		throw new Error(`evidence doc missing command\n${evidenceDoc}`);
	}
	if (!evidenceDoc.includes('"result":"passed"')) {
		throw new Error(`evidence doc missing result\n${evidenceDoc}`);
	}

	const close = runDist(target, ["close"]);
	assertOk(close, "dist close");

	if (existsSync(join(target, ".afol", "wb", ".active_session"))) {
		throw new Error("active session pointer still exists after close");
	}

	process.stdout.write(`dist smoke: ok ${session}\n`);
} finally {
	rmSync(sandbox, { recursive: true, force: true });
}
