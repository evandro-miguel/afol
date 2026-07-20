#!/usr/bin/env bun

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	appendProductionDayAllocation,
	evolutionDbPath,
	openEvolutionDb,
} from "../services/evolution";

const PROJECT_A = "db97afff-2026-4eb1-a799-5d34fd505267";
const PROJECT_B = "f4c7c0ae-50c7-4ea7-81c4-bf20e7f3a1a9";
const CLI = resolve(import.meta.dir, "..", "main.ts");
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

type StatusPayload = { data?: { state?: string } };

function projectConfig(projectId: string): Record<string, unknown> {
	const config = structuredClone(TEMPLATE_CONFIG);
	const project = config.project as Record<string, unknown>;
	project.name = "evolution-benchmark";
	project.id = projectId;
	project.timezone = "America/Asuncion";
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

function status(root: string): { exit: number; payload: StatusPayload } {
	const result = Bun.spawnSync(["bun", CLI, "evolve", "status", "--json"], {
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = new TextDecoder().decode(result.stdout).trim();
	if (!stdout) {
		const stderr = new TextDecoder().decode(result.stderr).trim();
		throw new Error(`evolve status produced no output: ${stderr}`);
	}
	return { exit: result.exitCode, payload: JSON.parse(stdout) };
}

const roots: string[] = [];
try {
	const uninitialized = fixture(PROJECT_A);
	roots.push(uninitialized);
	const emptyPath = evolutionDbPath(uninitialized);
	const empty = status(uninitialized);
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
	const healthyStatus = status(healthy);
	if (
		healthyStatus.exit !== 0 ||
		healthyStatus.payload.data?.state !== "healthy"
	)
		throw new Error("healthy status contract failed");

	const source = fixture(PROJECT_B);
	const copied = fixture(PROJECT_A);
	roots.push(source, copied);
	const sourceDb = openSeededProductionDb(source, PROJECT_B, "E-benchmark-02");
	sourceDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
	sourceDb.close();
	mkdirSync(join(copied, ".afol", "state"), { recursive: true });
	copyFileSync(evolutionDbPath(source), evolutionDbPath(copied));
	const mismatch = status(copied);
	if (mismatch.exit !== 1 || mismatch.payload.data?.state !== "unhealthy")
		throw new Error("cross-project status contract failed");

	console.log(
		JSON.stringify({
			ok: true,
			states: ["ready_uninitialized", "healthy", "unhealthy"],
		}),
	);
} finally {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
}
