import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TEMPLATE_FILES } from "../generated/template";
import { baselineFilename, loadRegistry } from "../validate/registry";
import { assertCompiledHotPathBenchmark } from "./dist-smoke-assertions";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distPath = join(repoRoot, "dist", "afol");
const requireWsl2 = process.argv.includes("--wsl2");
const DIAGNOSTIC_LIMIT = 800;

if (requireWsl2) {
	if (process.platform !== "linux" || process.arch !== "x64") {
		throw new Error(
			`WSL2 smoke requires Linux x64; observed ${process.platform}/${process.arch}`,
		);
	}
	const procVersion = readFileSync("/proc/version", "utf8");
	if (!/microsoft|wsl/i.test(procVersion)) {
		throw new Error("WSL2 smoke requires an observed Microsoft WSL kernel");
	}
}

type SpawnResult = ReturnType<typeof spawnSync>;
type TemplatePath = keyof typeof DEFAULT_TEMPLATE_FILES & string;
type ManagedLock = {
	revision?: string;
	managed_hashes?: Record<string, string>;
	[key: string]: unknown;
};

function runDist(
	cwd: string,
	args: string[],
	env: Record<string, string | undefined> = {},
): SpawnResult {
	return spawnSync(distPath, args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function removeTempEnvFile(path: string): void {
	rmSync(path, { force: true });
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
				`stdout=${compactDiagnostic(proc.stdout)}`,
				`stderr=${compactDiagnostic(proc.stderr)}`,
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

function compactDiagnostic(value: unknown): string {
	const text = typeof value === "string" ? value.trim() : String(value ?? "");
	if (text.length <= DIAGNOSTIC_LIMIT) return text || "<empty>";
	return `${text.slice(0, DIAGNOSTIC_LIMIT)}…`;
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

function sha256Hex(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

function runGit(
	cwd: string,
	args: string[],
	env: Record<string, string> = {},
): SpawnResult {
	return spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function expectedBenchmarkScenarioIds(): ReadonlySet<string> {
	const scenarios = loadRegistry(repoRoot).scenariosByPack["workbench-parity"];
	const ids = scenarios?.map((scenario) => scenario.scenario_id) ?? [];
	const uniqueIds = new Set(ids);
	if (
		ids.length === 0 ||
		ids.some((scenarioId) => scenarioId.trim() === "") ||
		uniqueIds.size !== ids.length
	) {
		throw new Error(
			`Invalid trusted workbench-parity scenario-id set: count=${ids.length} unique=${uniqueIds.size}`,
		);
	}
	return uniqueIds;
}

function copyManagedFile(workspace: string, relativePath: string): void {
	const target = join(workspace, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	copyFileSync(join(repoRoot, relativePath), target);
}

function normalizeTemporaryGitProvenance(
	workspace: string,
	commit: string,
): void {
	const snapshot = loadRegistry(workspace);
	for (const pack of snapshot.packs) {
		const scenarios = snapshot.scenariosByPack[pack.pack_id] ?? [];
		if (!scenarios.some((scenario) => scenario.measurement !== undefined)) {
			continue;
		}
		const scenarioDirectory = join(
			workspace,
			".afol",
			"data",
			"benchmarks",
			"catalog",
			"scenarios",
			pack.pack_id,
		);
		for (const entry of readdirSync(scenarioDirectory)) {
			if (!entry.endsWith(".json")) continue;
			const path = join(scenarioDirectory, entry);
			const scenario = readJson<{
				measurement?: Record<string, unknown>;
			}>(path);
			if (typeof scenario.measurement?.git_commit !== "string") continue;
			scenario.measurement.git_commit = commit;
			writeJson(path, scenario);
		}
		const baselinePath = join(
			workspace,
			".afol",
			"data",
			"benchmarks",
			"catalog",
			"baselines",
			pack.pack_id,
			baselineFilename(pack.pack_id),
		);
		const baseline = readJson<Record<string, unknown>>(baselinePath);
		baseline.git_commit = commit;
		writeJson(baselinePath, baseline);
	}
}

function prepareBenchmarkWorkspace(root: string): string {
	const workspace = join(root, "benchmark-workspace");
	mkdirSync(workspace, { recursive: true });
	cpSync(
		join(repoRoot, ".afol", "data", "benchmarks", "catalog"),
		join(workspace, ".afol", "data", "benchmarks", "catalog"),
		{ recursive: true },
	);
	for (const relativePath of [
		".afol/config.json",
		".agents/lock.json",
		".agents/manifest.json",
	]) {
		copyManagedFile(workspace, relativePath);
	}
	assertOk(
		runGit(workspace, ["init", "--quiet"]),
		"benchmark workspace git init",
	);
	assertOk(runGit(workspace, ["add", "."]), "benchmark workspace git add");
	assertOk(
		runGit(
			workspace,
			[
				"-c",
				"user.name=AFOL dist smoke",
				"-c",
				"user.email=afol-dist-smoke@example.invalid",
				"commit",
				"--quiet",
				"-m",
				"benchmark workspace",
			],
			{
				GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
				GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
			},
		),
		"benchmark workspace git commit",
	);
	const head = runGit(workspace, ["rev-parse", "HEAD"]);
	assertOk(head, "benchmark workspace git head");
	const commit = (head.stdout as string).trim();
	if (!/^[a-f0-9]{40}$/u.test(commit)) {
		throw new Error(`benchmark workspace git head invalid: ${commit}`);
	}
	normalizeTemporaryGitProvenance(workspace, commit);
	return workspace;
}

type DistReleaseReceipts = {
	checksumPath: string;
	provenancePath: string;
	checksumBytes: Buffer;
	provenanceBytes: Buffer;
	sha256: string;
};

function readDistReleaseReceipts(root: string): DistReleaseReceipts {
	const artifactPath = join(root, "dist", "afol");
	const checksumPath = join(root, "dist", "afol.sha256");
	const provenancePath = join(root, "dist", "afol.provenance.json");
	if (!existsSync(artifactPath)) {
		throw new Error(`Missing ${artifactPath}. Run bun run build first.`);
	}
	if (!existsSync(checksumPath) || !existsSync(provenancePath)) {
		throw new Error(
			"Missing dist/afol.sha256 or dist/afol.provenance.json; run release provenance before dist smoke",
		);
	}

	const artifactBytes = readFileSync(artifactPath);
	const sha256 = sha256Hex(artifactBytes);
	const checksumText = readFileSync(checksumPath, "utf8").trim();
	const expectedChecksum = `${sha256}  dist/afol`;
	if (checksumText !== expectedChecksum) {
		throw new Error(
			`dist/afol.sha256 does not bind dist/afol; expected ${expectedChecksum}, got ${checksumText}`,
		);
	}

	const provenance = JSON.parse(readFileSync(provenancePath, "utf8")) as {
		artifact?: unknown;
		sha256?: unknown;
		size_bytes?: unknown;
	};
	if (provenance.artifact !== "dist/afol" || provenance.sha256 !== sha256) {
		throw new Error("dist/afol.provenance.json does not bind dist/afol");
	}
	if (
		typeof provenance.size_bytes !== "number" ||
		!Number.isSafeInteger(provenance.size_bytes) ||
		provenance.size_bytes < 0 ||
		provenance.size_bytes !== artifactBytes.byteLength
	) {
		throw new Error(
			`dist/afol.provenance.json size_bytes does not match dist/afol`,
		);
	}

	return {
		checksumPath,
		provenancePath,
		checksumBytes: readFileSync(checksumPath),
		provenanceBytes: readFileSync(provenancePath),
		sha256,
	};
}

export function verifyDistReleaseReceipts(
	root: string = repoRoot,
): DistReleaseReceipts {
	return readDistReleaseReceipts(root);
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

function main(): void {
	const receiptsBefore = verifyDistReleaseReceipts(repoRoot);
	const sandbox = mkdtempSync(join(tmpdir(), "afol-dist-smoke-"));

	try {
		const expectedScenarioIds = expectedBenchmarkScenarioIds();
		const benchmarkWorkspace = prepareBenchmarkWorkspace(sandbox);
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
			"--no-spec-required",
			"--reason",
			"dist smoke fixture",
		]);
		assertOk(created, "dist new");
		const session = sessionFrom(created.stdout as string);
		const lifecycleTaskPath = join(
			lifecycleTarget,
			".afol",
			"wb",
			session,
			`${session}_task_01.md`,
		);
		writeFileSync(
			lifecycleTaskPath,
			[
				readFileSync(lifecycleTaskPath, "utf8"),
				"",
				"## T-01",
				"",
				"- Files planned:",
				"  - cli/commands/session.ts",
				"- Files touched:",
				"  - cli/dev/dist-smoke.ts",
				"",
			].join("\n"),
			"utf8",
		);
		const localStateRebuild = runDist(lifecycleTarget, [
			"local-state",
			"rebuild",
		]);
		assertOk(localStateRebuild, "dist local-state rebuild before radar");

		const statusAfterNew = runDist(lifecycleTarget, ["status"]);
		assertOk(statusAfterNew, "dist status after new");
		assertContains(statusAfterNew, "dist status after new", [
			"STATUS: pending",
			"TASK: T-01",
			"SESSIONS: 1",
		]);

		const hotPathBenchmark = runDist(benchmarkWorkspace, [
			"v",
			"bench",
			"--pack",
			"workbench-parity",
			"--json",
		]);
		assertOk(hotPathBenchmark, "dist compiled workbench-parity benchmark");
		assertCompiledHotPathBenchmark(
			hotPathBenchmark.stdout as string,
			expectedScenarioIds,
			receiptsBefore.sha256,
		);

		const radarAfterNew = runDist(lifecycleTarget, ["session", "radar"]);
		assertOk(radarAfterNew, "dist session radar");
		assertContains(radarAfterNew, "dist session radar", [
			"session radar: warnings are context only, not locks",
			"summary:",
		]);

		const radarJsonAfterNew = runDist(lifecycleTarget, [
			"session",
			"radar",
			"--json",
		]);
		assertOk(radarJsonAfterNew, "dist session radar json");
		assertContains(radarJsonAfterNew, "dist session radar json", [
			'"action":"session.radar"',
			'"warning_policy":"context-only"',
		]);
		const radarPayload = JSON.parse(radarJsonAfterNew.stdout as string) as {
			data?: {
				summary?: { open_tasks?: number };
				tasks?: Array<{
					task_id?: string;
					planned_files?: Array<{ path?: string }>;
					touched_files?: Array<{ path?: string }>;
				}>;
			};
		};
		const radarTask = radarPayload.data?.tasks?.[0];
		if (
			radarPayload.data?.summary?.open_tasks !== 1 ||
			radarTask?.task_id !== "T-01" ||
			radarTask.planned_files?.[0]?.path !== "cli/commands/session.ts" ||
			radarTask.touched_files?.[0]?.path !== "cli/dev/dist-smoke.ts"
		) {
			throw new Error(
				`dist session radar json missing real task file claims\n${radarJsonAfterNew.stdout}`,
			);
		}

		const lifecycleEnvPath = join(lifecycleTarget, ".env");
		let start: SpawnResult;
		try {
			writeFileSync(
				lifecycleEnvPath,
				"AFOL_SESSION=dotenv-must-not-load\n",
				"utf8",
			);
			start = runDist(lifecycleTarget, ["start", "--task-id", "T-01"]);
		} finally {
			removeTempEnvFile(lifecycleEnvPath);
		}
		assertOk(start, "dist start");

		const done = runDist(lifecycleTarget, [
			"done",
			"--task-id",
			"T-01",
			"--test",
			"test -d .afol",
		]);
		assertOk(done, "dist done");

		const taskDoc = readFileSync(lifecycleTaskPath, "utf8");
		if (
			!taskDoc.includes("| T-01 | done | worker | Dist smoke proof attempt=1 |")
		) {
			throw new Error(`task doc missing done row\n${taskDoc}`);
		}

		const evidenceDoc = readFileSync(
			join(lifecycleTarget, ".afol", "wb", session, ".evidence.jsonl"),
			"utf8",
		).trim();
		if (!evidenceDoc.includes('"task_id":"T-01"')) {
			throw new Error(`evidence doc missing task id\n${evidenceDoc}`);
		}
		if (!evidenceDoc.includes('"command":"test -d .afol"')) {
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
			"operations:",
			"hint: run afol update preview",
		]);

		const updateCheckVerbose = runDist(updateTarget, [
			"update",
			"check",
			"--verbose",
		]);
		assertOk(updateCheckVerbose, "dist update check verbose");
		assertContains(updateCheckVerbose, "dist update check verbose", [
			"update check: changes available",
			".agents/lock.json [owner=managed] revision changed",
		]);

		const updatePreview = runDist(updateTarget, ["update", "preview"]);
		assertOk(updatePreview, "dist update preview");
		assertContains(updatePreview, "dist update preview", [
			"preview operations:",
			"diff previews: omitted in compact preview",
			"operations: total=",
		]);

		const updateApplyDryRun = runDist(updateTarget, [
			"update",
			"apply",
			"--dry-run",
		]);
		assertOk(updateApplyDryRun, "dist update apply dry-run");
		assertContains(updateApplyDryRun, "dist update apply dry-run", [
			"apply details",
			"operations: total=",
		]);
		if (readJson<ManagedLock>(updateLockPath).revision !== "old") {
			throw new Error("update apply --dry-run mutated lock.json");
		}

		const conflictTarget = bootstrapTarget(sandbox, "update-conflict-target");
		const conflictManifestPath = join(
			conflictTarget,
			".agents",
			"manifest.json",
		);
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
			"conflicts:",
			"- .agents/manifest.json",
		]);

		const applyTarget = bootstrapTarget(sandbox, "update-apply-target");
		const applyLockPath = join(applyTarget, ".agents", "lock.json");
		const applyRulePath = join(
			applyTarget,
			".afol",
			"adm",
			"rules",
			"README.md",
		);
		const applyLock = readJson<ManagedLock>(applyLockPath);
		const downstreamRuleReadme = "downstream rules note\n";
		const sourceRuleReadme = templateText(".afol/adm/rules/README.md");
		applyLock.revision = "old";
		applyLock.managed_hashes = {
			...applyLock.managed_hashes,
			"rules/README.md": sha256Hex(downstreamRuleReadme),
		};
		writeJson(applyLockPath, applyLock);
		writeFileSync(applyRulePath, downstreamRuleReadme, "utf8");

		const realApply = runDist(
			applyTarget,
			[
				"update",
				"apply",
				"--allow-unbound-context",
				"--session",
				"S-01",
				"--task-id",
				"T-01",
				"--reason",
				"dist smoke update apply",
			],
			{ AFOL_TEST: "1" },
		);
		assertOk(realApply, "dist update apply");
		assertContains(realApply, "dist update apply", [
			"update apply: changes available",
			"update-managed .agents/lock.json revision changed",
			"update-managed .afol/adm/rules/README.md managed-hash-matches-manifest",
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
		if (!mutationJournal.includes('"sourcePath":".afol/adm/rules/README.md"')) {
			throw new Error(
				`mutation journal missing rules update record\n${mutationJournal}`,
			);
		}

		const receiptsAfter = verifyDistReleaseReceipts(repoRoot);
		if (
			!receiptsBefore.checksumBytes.equals(receiptsAfter.checksumBytes) ||
			!receiptsBefore.provenanceBytes.equals(receiptsAfter.provenanceBytes)
		) {
			throw new Error(
				"dist smoke mutated dist/afol.sha256 or dist/afol.provenance.json",
			);
		}
		process.stdout.write(`dist smoke: ok ${session}\n`);
	} finally {
		rmSync(sandbox, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	main();
}
