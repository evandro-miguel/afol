import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distPath = join(repoRoot, "dist", "afol");

type SpawnResult = ReturnType<typeof spawnSync>;
type TemplatePath = keyof typeof DEFAULT_TEMPLATE_FILES & string;
type ManagedLock = {
	revision?: string;
	managed_hashes?: Record<string, string>;
	[key: string]: unknown;
};

function runDist(cwd: string, args: string[]): SpawnResult {
	return spawnSync(distPath, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function assertStatus(
	proc: SpawnResult,
	label: string,
	expectedStatus: number,
): void {
	if (proc.status !== expectedStatus) {
		throw new Error(
			[
				`${label} failed`,
				`expected status=${expectedStatus}`,
				`actual status=${proc.status}`,
				`stdout=${(proc.stdout as string).trim()}`,
				`stderr=${(proc.stderr as string).trim()}`,
			].join("\n"),
		);
	}
}

function assertOk(proc: SpawnResult, label: string): void {
	assertStatus(proc, label, 0);
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

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function templateText(path: TemplatePath): string {
	const entry = DEFAULT_TEMPLATE_FILES[path];
	if (!entry) {
		throw new Error(`Missing template entry: ${path}`);
	}
	return Buffer.from(entry.contentBase64, "base64").toString("utf8");
}

function bootstrapTarget(sandbox: string, name: string): string {
	const target = join(sandbox, name);
	const bootstrap = runDist(sandbox, ["bootstrap", target]);
	assertOk(bootstrap, `dist bootstrap ${name}`);
	return target;
}

if (!existsSync(distPath)) {
	throw new Error(`Missing ${distPath}. Run bun run build first.`);
}

const sandbox = mkdtempSync(join(tmpdir(), "afol-dist-smoke-"));

try {
	const help = runDist(repoRoot, ["--help"]);
	assertOk(help, "dist help");
	assertContains(help, "dist help", ["Usage: afol"]);

	const version = runDist(repoRoot, ["--version"]);
	assertOk(version, "dist version");
	assertContains(version, "dist version", ["afol"]);

	const lifecycleTarget = bootstrapTarget(sandbox, "lifecycle-target");

	const statusBefore = runDist(lifecycleTarget, ["status"]);
	assertOk(statusBefore, "dist status before new");
	assertContains(statusBefore, "dist status before new", [
		"STATUS: none",
		"SESSIONS: 0",
	]);

	const created = runDist(lifecycleTarget, [
		"new",
		"smoke",
		"--task",
		"Dist smoke proof",
	]);
	assertOk(created, "dist new");
	const session = sessionFrom(created.stdout as string);

	const statusAfterNew = runDist(lifecycleTarget, ["status"]);
	assertOk(statusAfterNew, "dist status after new");
	assertContains(statusAfterNew, "dist status after new", [
		"STATUS: pending",
		"TASK: T-01",
		"SESSIONS: 1",
	]);

	const start = runDist(lifecycleTarget, ["start", "--task-id", "T-01"]);
	assertOk(start, "dist start");

	const evidence = runDist(lifecycleTarget, [
		"evidence",
		"T-01",
		"--command",
		"smoke",
		"--result",
		"passed",
	]);
	assertOk(evidence, "dist evidence");

	const done = runDist(lifecycleTarget, ["done", "--task-id", "T-01"]);
	assertOk(done, "dist done");

	const taskDoc = readFileSync(
		join(lifecycleTarget, ".afol", "wb", session, `${session}_task_01.md`),
		"utf8",
	);
	if (!taskDoc.includes("| T-01 | done | worker | Dist smoke proof |")) {
		throw new Error(`task doc missing done row\n${taskDoc}`);
	}

	const evidenceDoc = readFileSync(
		join(lifecycleTarget, ".afol", "wb", session, ".evidence.jsonl"),
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

	const close = runDist(lifecycleTarget, ["close"]);
	assertOk(close, "dist close");

	if (existsSync(join(lifecycleTarget, ".afol", "wb", ".active_session"))) {
		throw new Error("active session pointer still exists after close");
	}

	const updateTarget = bootstrapTarget(sandbox, "update-target");
	const updateLockPath = join(updateTarget, ".agents", "lock.json");
	const updateLock = readJson<ManagedLock>(updateLockPath);
	updateLock.revision = "old";
	writeJson(updateLockPath, updateLock);

	const updateCheck = runDist(updateTarget, ["update", "check"]);
	assertOk(updateCheck, "dist update check");
	assertContains(updateCheck, "dist update check", [
		"update check: changes available",
		".agents/lock.json [owner=managed] revision changed",
	]);

	const updatePreview = runDist(updateTarget, ["update", "preview"]);
	assertOk(updatePreview, "dist update preview");
	assertContains(updatePreview, "dist update preview", [
		"preview operations:",
		"diff previews:",
		".agents/lock.json [owner=managed] revision changed",
	]);

	const updateApplyDryRun = runDist(updateTarget, [
		"update",
		"apply",
		"--dry-run",
	]);
	assertOk(updateApplyDryRun, "dist update apply dry-run");
	assertContains(updateApplyDryRun, "dist update apply dry-run", [
		"apply details",
		"update-managed .agents/lock.json revision changed",
	]);
	if (readJson<ManagedLock>(updateLockPath).revision !== "old") {
		throw new Error("update apply --dry-run mutated lock.json");
	}

	const conflictTarget = bootstrapTarget(sandbox, "update-conflict-target");
	const conflictManifestPath = join(conflictTarget, ".agents", "manifest.json");
	const conflictManifest =
		readJson<Record<string, unknown>>(conflictManifestPath);
	conflictManifest.version = 2;
	conflictManifest.commands = {
		status: ["s", "status"],
		validate: ["changed"],
	};
	conflictManifest.custom = "touch";
	writeJson(conflictManifestPath, conflictManifest);

	const conflictApply = runDist(conflictTarget, ["update", "apply"]);
	assertStatus(conflictApply, "dist update apply conflict", 4);
	assertContains(conflictApply, "dist update apply conflict", [
		"apply details",
		"conflict .agents/manifest.json local-user-edit-or-unsafe",
	]);

	const applyTarget = bootstrapTarget(sandbox, "update-apply-target");
	const applyLockPath = join(applyTarget, ".agents", "lock.json");
	const applyRulePath = join(applyTarget, ".agents", "rules", "README.md");
	const applyLock = readJson<ManagedLock>(applyLockPath);
	const downstreamRuleReadme = "downstream rules note\n";
	const sourceRuleReadme = templateText(".agents/rules/README.md");
	applyLock.revision = "old";
	applyLock.managed_hashes = {
		...(applyLock.managed_hashes ?? {}),
		"rules/README.md": sha256Hex(downstreamRuleReadme),
	};
	writeJson(applyLockPath, applyLock);
	writeFileSync(applyRulePath, downstreamRuleReadme, "utf8");

	const realApply = runDist(applyTarget, [
		"update",
		"apply",
		"--session",
		"S-01",
		"--task-id",
		"T-01",
		"--reason",
		"dist smoke update apply",
	]);
	assertOk(realApply, "dist update apply");
	assertContains(realApply, "dist update apply", [
		"update apply: changes available",
		"update-managed .agents/lock.json revision changed",
		"update-managed .agents/rules/README.md managed-hash-matches-manifest",
	]);
	if (readJson<ManagedLock>(applyLockPath).revision === "old") {
		throw new Error("real update apply did not restore lock revision");
	}
	if (readFileSync(applyRulePath, "utf8") !== sourceRuleReadme) {
		throw new Error("real update apply did not restore rules/README.md");
	}
	const mutationJournal = readFileSync(
		join(applyTarget, ".afol", "data", "mutations", "mutations.jsonl"),
		"utf8",
	);
	if (!mutationJournal.includes('"sourcePath":".agents/rules/README.md"')) {
		throw new Error(
			`mutation journal missing rules update record\n${mutationJournal}`,
		);
	}

	process.stdout.write(`dist smoke: ok ${session}\n`);
} finally {
	rmSync(sandbox, { recursive: true, force: true });
}
