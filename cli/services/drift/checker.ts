import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeSourceHash } from "../../core/source-hash";
import { boundedSpawn } from "../../core/subprocess";
import { validateAdmMigration } from "../adm";
import { findCanonicalSpecDocuments } from "../governance/spec-resolver";
import { collectFreshnessReport } from "../local-state/freshness";
import { resolveProjectPaths } from "../project/paths";
import { openDb } from "../state/db";
import type { DriftFinding, DriftReport } from "./types";

type StoredSessionRow = {
	session_id: string;
	session_path: string;
};

type StoredSourceFileRow = {
	session_id: string;
	path: string;
	source_hash: string;
};

type SpecIndexRow = {
	id: string;
	status: string;
};

function nowIso(): string {
	return new Date().toISOString();
}

function makeFinding(
	id: string,
	severity: DriftFinding["severity"],
	domain: DriftFinding["domain"],
	message: string,
	hint: string,
	expected?: string,
	actual?: string,
): DriftFinding {
	return {
		id,
		severity,
		domain,
		message,
		hint,
		...(expected !== undefined ? { expected } : {}),
		...(actual !== undefined ? { actual } : {}),
	};
}

function readText(path: string): string {
	return readFileSync(path, "utf8");
}

function readGitChangedPaths(
	root: string,
	args: string[],
	parser: (line: string) => string | null,
): string[] {
	const result = boundedSpawn("git", args, {
		cwd: root,
		timeoutMs: 30_000,
	});
	if (result.timedOut) {
		throw new Error(`git ${args.join(" ")} timed out`);
	}
	if (!result.ok) {
		const detail =
			result.spawnError ||
			result.stderr.trim() ||
			result.stdout.trim() ||
			`git ${args.join(" ")} exited with status ${result.status}`;
		throw new Error(detail);
	}
	return result.stdout
		.split(/\r?\n/)
		.map((line) => parser(line))
		.filter((line): line is string => line !== null)
		.map((line) => line.replace(/\\/g, "/"));
}

export function checkActiveSessionPointerMutation(
	root: string,
): DriftFinding[] {
	try {
		const changedPaths = new Set([
			...readGitChangedPaths(root, ["status", "--porcelain"], (line) => {
				if (line.length < 4) {
					return null;
				}
				return line.slice(3);
			}),
			...readGitChangedPaths(
				root,
				["diff", "--cached", "--name-only"],
				(line) => (line.length > 0 ? line : null),
			),
		]);
		const activeSessionRel = resolveProjectPaths(root).activeSessionFile;
		if (!changedPaths.has(activeSessionRel)) {
			return [];
		}
		return [
			makeFinding(
				"active-session-pointer-mutated",
				"warn",
				"state",
				".afol/wb/.active_session appears in git changes",
				"commit only if this is an explicit session-management change",
			),
		];
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return [
			makeFinding(
				"state:git:collection-failed",
				"fail",
				"state",
				"failed to collect git drift for .afol/wb/.active_session",
				"ensure git is installed and run the command from a valid git worktree",
				undefined,
				detail,
			),
		];
	}
}

function parseFrontmatter(content: string): Record<string, string> {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!match?.[1]) {
		return {};
	}
	const result: Record<string, string> = {};
	for (const line of (match[1] ?? "").split(/\r?\n/)) {
		const index = line.indexOf(":");
		if (index < 0) {
			continue;
		}
		const key = line.slice(0, index).trim();
		const value = line
			.slice(index + 1)
			.trim()
			.replace(/^['"]|['"]$/g, "");
		if (key && value) {
			result[key] = value;
		}
	}
	return result;
}

function parseSpecIndex(root: string): SpecIndexRow[] {
	const indexPath = join(root, ".afol", "adm", "specs", "INDEX.md");
	if (!existsSync(indexPath)) {
		return [];
	}
	const rows: SpecIndexRow[] = [];
	for (const line of readText(indexPath).split(/\r?\n/)) {
		if (!line.startsWith("| ")) {
			continue;
		}
		const cells = line.split("|").map((cell) => cell.trim());
		const id = cells[1];
		const status = cells[3] ?? "";
		if (!id || id === "SPEC ID" || id === "--------:") {
			continue;
		}
		rows.push({ id, status });
	}
	return rows;
}

function findSpecFile(root: string, specId: string): string | null {
	const matches = findCanonicalSpecDocuments(root, specId);
	return matches.length === 1 ? (matches[0]?.relativePath ?? null) : null;
}

function hasDocTypeFrontmatter(path: string): boolean {
	return (
		existsSync(path) &&
		Object.hasOwn(parseFrontmatter(readText(path)), "doc_type")
	);
}

export function checkPstrDrift(root: string): DriftFinding[] {
	const report = collectFreshnessReport(root, {
		localState: false,
		pstr: true,
	});
	const pstrFindings = report.findings.filter(
		(finding) => finding.surface === "pstr",
	);
	const staleMaps = pstrFindings.filter((finding) =>
		finding.id.startsWith("pstr:map:"),
	);
	const findingsToReport = staleMaps.length > 0 ? staleMaps : pstrFindings;
	return findingsToReport.map((finding) =>
		makeFinding(
			finding.ok ? finding.id : `${finding.id}:${finding.state}`,
			"warn",
			"pstr",
			finding.message,
			finding.remediation,
		),
	);
}

export function checkStateDrift(
	root: string,
	sessionId?: string,
): DriftFinding[] {
	const db = openDb(root);
	try {
		const sessions = sessionId
			? (db
					.query(
						"SELECT session_id, session_path FROM sessions WHERE session_id = ?",
					)
					.all(sessionId) as StoredSessionRow[])
			: (db
					.query(
						"SELECT session_id, session_path FROM sessions ORDER BY session_id ASC",
					)
					.all() as StoredSessionRow[]);
		const findings: DriftFinding[] = [];
		if (sessionId && sessions.length === 0) {
			return [
				makeFinding(
					`state:session:${sessionId}:missing`,
					"warn",
					"state",
					`missing hydrated session ${sessionId}`,
					`run afol hydrate -S ${sessionId}`,
					"missing",
					"missing",
				),
			];
		}

		for (const session of sessions) {
			if (!existsSync(session.session_path)) {
				findings.push(
					makeFinding(
						`state:session:${session.session_id}:missing`,
						"warn",
						"state",
						`missing session path ${session.session_id}`,
						"rehydrate the session",
						session.session_path,
						"missing",
					),
				);
				continue;
			}

			const sourceRows = db
				.query(
					"SELECT session_id, path, source_hash FROM source_files WHERE session_id = ? ORDER BY path ASC",
				)
				.all(session.session_id) as StoredSourceFileRow[];

			for (const row of sourceRows) {
				const actualPath = join(session.session_path, row.path);
				if (!existsSync(actualPath)) {
					findings.push(
						makeFinding(
							`state:${session.session_id}:${row.path}:missing`,
							"warn",
							"state",
							`missing hydrated file ${row.path}`,
							"rehydrate the session",
							row.source_hash,
							"missing",
						),
					);
					continue;
				}
				const actualHash = computeSourceHash(
					readFileSync(actualPath, "utf8"),
				).hash;
				if (actualHash !== row.source_hash) {
					findings.push(
						makeFinding(
							`state:${session.session_id}:${row.path}:stale`,
							"warn",
							"state",
							`stale hydrated file ${row.path}`,
							"rehydrate the session",
							row.source_hash,
							actualHash,
						),
					);
				}
			}
		}

		return findings;
	} finally {
		db.close();
	}
}

export function checkSpecDrift(root: string): DriftFinding[] {
	const findings: DriftFinding[] = [];
	const activeRows = parseSpecIndex(root).filter(
		(row) => row.status === "active",
	);
	if (activeRows.length === 0) {
		return [
			makeFinding(
				"adm:spec-index:missing",
				"fail",
				"adm",
				"missing active specs index",
				"restore .afol/adm/specs/INDEX.md",
			),
		];
	}

	for (const row of activeRows) {
		const specPath = findSpecFile(root, row.id);
		if (!specPath) {
			findings.push(
				makeFinding(
					`adm:spec:${row.id}:missing`,
					"fail",
					"adm",
					`missing spec implementation ${row.id}`,
					"add the spec file under .afol/adm/specs",
				),
			);
			continue;
		}
		if (!hasDocTypeFrontmatter(join(root, specPath))) {
			findings.push(
				makeFinding(
					`adm:spec:${row.id}:doc_type`,
					"fail",
					"adm",
					`missing doc_type frontmatter for ${row.id}`,
					"add doc_type to the spec frontmatter",
					specPath,
					"missing",
				),
			);
		}
	}

	return findings;
}

export function checkAdmDrift(root: string): DriftFinding[] {
	return validateAdmMigration(root).findings;
}

export function runDriftCheck(
	root: string,
	opts?: { adm?: boolean; pstr?: boolean; state?: boolean; specs?: boolean },
): DriftReport {
	const findings = [
		...((opts?.adm ?? true) ? checkAdmDrift(root) : []),
		...((opts?.pstr ?? true) ? checkPstrDrift(root) : []),
		...((opts?.state ?? true) ? checkStateDrift(root) : []),
		...((opts?.state ?? true) ? checkActiveSessionPointerMutation(root) : []),
		...((opts?.specs ?? true) ? checkSpecDrift(root) : []),
	];
	return { ok: findings.length === 0, checked_at: nowIso(), findings };
}
