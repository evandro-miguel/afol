#!/usr/bin/env bun

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runEvolveCommand } from "../commands/evolve";
import {
	analyzeEvolutionProject,
	appendObservationJournalEvent,
	appendProductionDayAllocation,
	evolutionDbPath,
	normalizeObservationRecord,
	observationJournalPath,
	openEvolutionDb,
	preferenceJournalPath,
	productionDayJournalPath,
	suggestionJournalPath,
} from "../services/evolution";

const PROJECT_A = "db97afff-2026-4eb1-a799-5d34fd505267";
const PROJECT_B = "f4c7c0ae-50c7-4ea7-81c4-bf20e7f3a1a9";
const TEMPLATE_CONFIG = JSON.parse(
	readFileSync(
		resolve(import.meta.dir, "../..", "src/project-template/.afol/config.json"),
		"utf8",
	),
) as Record<string, unknown>;
const TEMPLATE_LOCK = readFileSync(
	resolve(import.meta.dir, "../..", "src/project-template/.agents/lock.json"),
	"utf8",
);
const TEMPLATE_MANIFEST = readFileSync(
	resolve(
		import.meta.dir,
		"../..",
		"src/project-template/.agents/manifest.json",
	),
	"utf8",
);
const CONTRACT_PATH = [
	".afol/data/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
	"src/builtin-assets/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
]
	.map((path) => resolve(import.meta.dir, "../..", path))
	.find((path) => existsSync(path));
if (CONTRACT_PATH === undefined) {
	throw new Error("Evolution benchmark contract is missing");
}
const CONTRACT = JSON.parse(
	readFileSync(CONTRACT_PATH, "utf8"),
) as Record<string, unknown>;

type StatusPayload = { data?: { state?: string } };

async function invoke(
	root: string,
	args: string[],
): Promise<{ exit: number; stdout: string }> {
	const [action = "", ...commandArgs] = args.slice(1);
	const stdout: string[] = [];
	const exit = await runEvolveCommand(action, commandArgs, root, {
		stdout: (value) => stdout.push(value),
		stderr: () => {},
	});
	return {
		exit,
		stdout: stdout.join("\n").trim(),
	};
}

function projectConfig(projectId: string): Record<string, unknown> {
	const config = structuredClone(TEMPLATE_CONFIG);
	const project = config.project as Record<string, unknown>;
	project.name = "evolution-benchmark";
	project.id = projectId;
	project.timezone = "America/Asuncion";
	const evolution = config.evolution as Record<string, unknown>;
	const recurrence = evolution.recurrence as Record<string, unknown>;
	recurrence.minimum_distinct_production_days = 1;
	return config;
}

function fixture(projectId: string): string {
	const root = mkdtempSync(join(tmpdir(), "afol-evolve-bench-"));
	mkdirSync(join(root, ".afol"), { recursive: true });
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(projectConfig(projectId), null, 2)}\n`,
		"utf8",
	);
	writeFileSync(join(root, ".agents", "lock.json"), TEMPLATE_LOCK, "utf8");
	writeFileSync(
		join(root, ".agents", "manifest.json"),
		TEMPLATE_MANIFEST,
		"utf8",
	);
	return root;
}

function openSeededProductionDb(
	root: string,
	projectId: string,
	evidenceId: string,
) {
	const sessionId = "S-benchmark";
	const sessionDir = join(root, ".afol", "wb", sessionId);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, ".evidence.jsonl"),
		`${JSON.stringify({
			id: evidenceId,
			project_id: projectId,
			session_id: sessionId,
			created_at: "2026-07-16T12:00:00.000Z",
			result: "passed",
			provenance: "observed",
			exit_code: 0,
		})}\n`,
		"utf8",
	);
	const db = openEvolutionDb(evolutionDbPath(root));
	appendProductionDayAllocation({
		root,
		db,
		projectId,
		timezone: "America/Asuncion",
		sessionId,
		evidenceId,
	});
	return db;
}

function git(root: string, args: string[]): string {
	const result = Bun.spawnSync([
		"git",
		"-c",
		"user.name=AFOL Smoke",
		"-c",
		"user.email=afol-smoke@example.invalid",
		"-C",
		root,
		...args,
	]);
	if (result.exitCode !== 0)
		throw new Error(`git smoke command failed: ${args[0]}`);
	return new TextDecoder().decode(result.stdout).trim();
}

function seedAnalysisHistory(
	root: string,
	projectId: string,
): { base: string; head: string } {
	git(root, ["init", "-q"]);
	writeFileSync(join(root, "analysis.txt"), "one\n", "utf8");
	git(root, ["add", "analysis.txt"]);
	git(root, ["commit", "-qm", "first"]);
	const base = git(root, ["rev-parse", "HEAD"]);
	writeFileSync(join(root, "analysis.txt"), "two\n", "utf8");
	git(root, ["commit", "-qam", "second"]);
	const head = git(root, ["rev-parse", "HEAD"]);
	const db = openEvolutionDb(evolutionDbPath(root));
	try {
		for (const [index, commit] of [base, base, head].entries()) {
			const observation = normalizeObservationRecord({
				project_id: projectId,
				id: `O-analysis-${index}`,
				kind: "workflow_friction",
				session_id: `S-analysis-${index}`,
				production_day_sequence: 1,
				task_type: "smoke",
				impact: "rework",
				created_at: `2026-07-16T12:0${index}:00.000Z`,
				journal_event_id: `J-analysis-${index}`,
				source_refs: [{ id: commit, kind: "commit" }],
			});
			appendObservationJournalEvent({
				root,
				db,
				projectId,
				observation,
				sourceRefs: observation.source_refs,
				eventId: `OBS-analysis-${index}`,
			});
		}
	} finally {
		db.close();
	}
	return { base, head };
}

function analysisSnapshot(root: string): string {
	const paths = [
		evolutionDbPath(root),
		`${evolutionDbPath(root)}-wal`,
		`${evolutionDbPath(root)}-shm`,
		observationJournalPath(root),
		productionDayJournalPath(root),
		preferenceJournalPath(root),
		suggestionJournalPath(root),
	];
	return JSON.stringify(
		paths.map((path) => {
			if (!existsSync(path)) return { path, exists: false };
			const stat = statSync(path);
			const auxiliary = path.endsWith("-wal") || path.endsWith("-shm");
			return {
				path,
				exists: true,
				dev: stat.dev,
				ino: stat.ino,
				size: stat.size,
				...(auxiliary
					? {}
					: { mtime: stat.mtimeMs, bytes: readFileSync(path) }),
			};
		}),
	);
}

function assertContractMetadata(): void {
	const coverage = CONTRACT.coverage as Record<string, unknown>;
	const subcommands = coverage.subcommands as string[];
	if (
		CONTRACT.implementation_status !== "implemented" ||
		CONTRACT.command !== "bun run cli/dev/evolve-benchmark-smoke.ts" ||
		CONTRACT.expected_exit !== 0 ||
		CONTRACT.result_schema !== "1.0.0" ||
		![
			"evolve analyze [--json]",
			"evolve weekly [--json]",
			"evolve after-merge <base>..<head> [--json]",
			"evolve review <proposal-id> [--json]",
		].every((entry) => subcommands.includes(entry))
	)
		throw new Error("evolution smoke metadata contract failed");
}

function assertPublicAnalysis(
	result: { exit: number; stdout: string },
	mode: string,
): Record<string, unknown> {
	if (result.exit !== 0 || Buffer.byteLength(result.stdout, "utf8") > 4_000)
		throw new Error(`analysis ${mode} output contract failed`);
	const payload = JSON.parse(result.stdout) as {
		data?: Record<string, unknown>;
	};
	const data = payload.data;
	if (!data || data.mode !== mode)
		throw new Error(`analysis ${mode} mode contract failed`);
	const sensitiveKey =
		/(project|cluster|source|commit|path|token|secret|password|api[_-]?key|db|(?:^|_)session_id$|origin_ref)/i;
	const safeAggregateKeys = new Set(["legacy_cluster_count"]);
	const inspectKeys = (value: unknown): string | null => {
		if (Array.isArray(value)) {
			for (const item of value) {
				const match = inspectKeys(item);
				if (match) return match;
			}
			return null;
		}
		if (value && typeof value === "object") {
			for (const [key, item] of Object.entries(value)) {
				if (sensitiveKey.test(key) && !safeAggregateKeys.has(key)) return key;
				const match = inspectKeys(item);
				if (match) return match;
			}
		}
		return null;
	};
	const forbiddenKey = inspectKeys(data);
	if (forbiddenKey)
		throw new Error(
			`analysis ${mode} public DTO contract failed: ${forbiddenKey}`,
		);
	const legacyClusterCount = data.legacy_cluster_count;
	const recoveryAction = data.recovery_action;
	if (
		!Number.isInteger(legacyClusterCount) ||
		Number(legacyClusterCount) < 0 ||
		(data.status === "blocked" &&
			recoveryAction !== "afol evolve status --json") ||
		(data.status !== "blocked" &&
			Number(legacyClusterCount) > 0 &&
			recoveryAction !== "afol evolve repair --json") ||
		(data.status !== "blocked" &&
			Number(legacyClusterCount) === 0 &&
			recoveryAction !== null)
	)
		throw new Error(`analysis ${mode} recovery contract failed`);
	const proposals = Array.isArray(data.proposals) ? data.proposals : [];
	for (const value of proposals) {
		const proposal = value as Record<string, unknown>;
		const evidenceRefs = proposal.evidence_refs;
		if (
			typeof proposal.id !== "string" ||
			!/^EVO-[a-f0-9]{32}$/.test(proposal.id) ||
			proposal.fingerprint_version !== 2 ||
			typeof proposal.distinct_session_count !== "number" ||
			typeof proposal.related_session_count !== "number" ||
			!Array.isArray(evidenceRefs) ||
			evidenceRefs.length > 4 ||
			!Array.isArray(proposal.related_session_ids) ||
			proposal.related_session_ids.length > 4 ||
			!Array.isArray(proposal.target_refs) ||
			proposal.target_refs.length > 4 ||
			!/[a-f0-9]{64}/.test(String(proposal.provenance_digest)) ||
			!["governance", "behavior", "documentation", "code"].includes(
				String(proposal.target_kind),
			) ||
			!["classified", "needs_review"].includes(
				String(proposal.classification),
			) ||
			proposal.approval_required !== true ||
			proposal.execution_surface !== "governed_workbench" ||
			!evidenceRefs.every(
				(ref) =>
					ref &&
					typeof ref === "object" &&
					Object.keys(ref).every((key) =>
						["id", "kind", "authority"].includes(key),
					),
			) ||
			!proposal.baseline ||
			!proposal.targets ||
			proposal.approval_policy !== "explicit" ||
			proposal.approval_surface !== "governed_workbench"
		)
			throw new Error(`analysis ${mode} decision context contract failed`);
	}
	return data;
}

async function status(
	root: string,
): Promise<{ exit: number; payload: StatusPayload }> {
	const result = await invoke(root, ["evolve", "status", "--json"]);
	if (!result.stdout) throw new Error("evolve status produced no output");
	return { exit: result.exit, payload: JSON.parse(result.stdout) };
}

const roots: string[] = [];
try {
	assertContractMetadata();
	const uninitialized = fixture(PROJECT_A);
	roots.push(uninitialized);
	const emptyPath = evolutionDbPath(uninitialized);
	const empty = await status(uninitialized);
	if (empty.exit !== 0 || empty.payload.data?.state !== "ready_uninitialized")
		throw new Error("uninitialized status contract failed");
	if ([emptyPath, `${emptyPath}-wal`, `${emptyPath}-shm`].some(existsSync))
		throw new Error("status created evolution database state");

	const healthy = fixture(PROJECT_A);
	roots.push(healthy);
	const healthyDb = openSeededProductionDb(
		healthy,
		PROJECT_A,
		"E-benchmark-01",
	);
	healthyDb.close();
	const range = seedAnalysisHistory(healthy, PROJECT_A);
	const healthyStatus = await status(healthy);
	if (
		healthyStatus.exit !== 0 ||
		healthyStatus.payload.data?.state !== "healthy"
	)
		throw new Error("healthy status contract failed");
	// Bun can defer SQLite finalizers after Database.close(). Drain seeded
	// handles before defining the read-only analysis boundary.
	Bun.gc(true);
	const dbBeforeAnalysis = analysisSnapshot(healthy);
	const internalAnalysis = analyzeEvolutionProject(healthy);
	const reviewId = internalAnalysis.proposals[0]?.id;
	if (!reviewId)
		throw new Error("healthy analysis did not produce a review proposal");
	const [analyzeResult, weeklyResult, afterMergeResult, reviewResult] =
		await Promise.all([
			invoke(healthy, ["evolve", "analyze", "--json"]),
			invoke(healthy, ["evolve", "weekly", "--json"]),
			invoke(healthy, [
				"evolve",
				"after-merge",
				`${range.base}..${range.head}`,
				"--json",
			]),
			invoke(healthy, ["evolve", "review", reviewId, "--json"]),
		]);
	assertPublicAnalysis(analyzeResult, "analyze");
	assertPublicAnalysis(weeklyResult, "weekly");
	assertPublicAnalysis(afterMergeResult, "after_merge");
	assertPublicAnalysis(reviewResult, "review");
	const dbAfterAnalysis = analysisSnapshot(healthy);
	if (dbAfterAnalysis !== dbBeforeAnalysis) {
		const beforeFiles = JSON.parse(dbBeforeAnalysis) as Array<
			Record<string, unknown>
		>;
		const afterFiles = JSON.parse(dbAfterAnalysis) as Array<
			Record<string, unknown>
		>;
		const changed = beforeFiles
			.filter(
				(before, index) =>
					JSON.stringify(before) !== JSON.stringify(afterFiles[index]),
			)
			.map((entry) => String(entry.path));
		throw new Error(`analysis mutated evolution state: ${changed.join(",")}`);
	}
	for (const action of ["apply", "rollback"] as const) {
		const denied = await invoke(healthy, [
			"evolve",
			action,
			"EVO-benchmark",
			"--json",
		]);
		if (
			denied.exit !== 2 ||
			!denied.stdout.includes("requires local interactive")
		)
			throw new Error(`non-interactive ${action} boundary failed`);
	}
	const importSource = join(healthy, "benchmark-codex.jsonl");
	writeFileSync(
		importSource,
		`${JSON.stringify({ session_id: "S-external", role: "user", content: "token=benchmark-secret" })}\n`,
		"utf8",
	);
	const importPreview = await invoke(healthy, [
		"evolve",
		"import",
		"codex",
		"--source",
		importSource,
		"--json",
	]);
	if (
		importPreview.exit !== 0 ||
		!importPreview.stdout.includes('"mode":"preview"') ||
		importPreview.stdout.includes("benchmark-secret")
	)
		throw new Error("external import preview contract failed");
	if (existsSync(join(healthy, ".afol", "external")))
		throw new Error("external import preview persisted state");
	if (analysisSnapshot(healthy) !== dbAfterAnalysis)
		throw new Error("external import preview mutated the evolution database");
	const importConfirm = await invoke(healthy, [
		"evolve",
		"import",
		"codex",
		"--source",
		importSource,
		"--confirm",
		"--json",
	]);
	if (
		importConfirm.exit !== 0 ||
		!importConfirm.stdout.includes('"mode":"confirmed"') ||
		importConfirm.stdout.includes("benchmark-secret")
	)
		throw new Error("external import confirmation contract failed");
	const externalList = await invoke(healthy, [
		"evolve",
		"external",
		"list",
		"--json",
	]);
	if (
		externalList.exit !== 0 ||
		!externalList.stdout.includes('"provider":"codex"') ||
		externalList.stdout.includes("benchmark-secret")
	)
		throw new Error("external import list contract failed");

	const source = fixture(PROJECT_B);
	const copied = fixture(PROJECT_A);
	roots.push(source, copied);
	const sourceDb = openSeededProductionDb(source, PROJECT_B, "E-benchmark-02");
	sourceDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
	sourceDb.close();
	mkdirSync(join(copied, ".afol", "state"), { recursive: true });
	copyFileSync(evolutionDbPath(source), evolutionDbPath(copied));
	const mismatch = await status(copied);
	if (mismatch.exit !== 1 || mismatch.payload.data?.state !== "unhealthy")
		throw new Error("cross-project status contract failed");

	const disabled = fixture(PROJECT_A);
	roots.push(disabled);
	const disabledConfig = projectConfig(PROJECT_A);
	(disabledConfig.evolution as Record<string, unknown>).enabled = false;
	writeFileSync(
		join(disabled, ".afol", "config.json"),
		`${JSON.stringify(disabledConfig, null, 2)}\n`,
		"utf8",
	);
	const suggestion = await invoke(disabled, [
		"evolve",
		"suggest",
		"--first-session",
		"--json",
	]);
	if (suggestion.exit !== 0 || !suggestion.stdout.includes('"disabled"'))
		throw new Error("disabled suggestion preview contract failed");
	const disabledDecisions = [
		["evolve", "skip", "SUG-benchmark", "--json"],
		["evolve", "accept", "SUG-benchmark", "--json"],
		["evolve", "reject", "SUG-benchmark", "--reason", "benchmark", "--json"],
		["evolve", "repair", "--json"],
	];
	const decisionResults = await Promise.all(
		disabledDecisions.map((args) => invoke(disabled, args)),
	);
	for (const [index, decision] of decisionResults.entries()) {
		if (decision.exit !== 2 || !decision.stdout)
			throw new Error(
				`disabled decision contract failed: ${disabledDecisions[index]?.[1]}`,
			);
	}
	if (existsSync(evolutionDbPath(disabled)))
		throw new Error("disabled suggestion commands created evolution state");

	console.log(
		JSON.stringify({
			ok: true,
			states: [
				"ready_uninitialized",
				"healthy",
				"analysis",
				"external-import",
				"unhealthy",
				"disabled",
			],
		}),
	);
} finally {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
}
