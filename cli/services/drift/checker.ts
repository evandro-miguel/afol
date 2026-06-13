import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { computeSourceHash } from "../../core/source-hash";
import { buildPstrIndexSnapshot, getPstrIndex } from "../pstr/builder";
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

function walkFiles(root: string): string[] {
	if (!existsSync(root)) {
		return [];
	}
	const out: string[] = [];
	const stack: string[] = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			const entryPath = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}
			if (entry.isFile()) {
				out.push(entryPath);
			}
		}
	}
	return out;
}

function readText(path: string): string {
	return readFileSync(path, "utf8");
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
		const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
		if (key && value) {
			result[key] = value;
		}
	}
	return result;
}

function parseSpecIndex(root: string): SpecIndexRow[] {
	const indexPath = join(root, "docs", "arc", "SPECS", "INDEX.md");
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
	const specsRoot = join(root, "docs", "arc", "SPECS");
	const match = walkFiles(specsRoot).find((path) => basename(path) === `${specId}.md`);
	return match ? relative(root, match).replace(/\\/g, "/") : null;
}

function hasDocTypeFrontmatter(path: string): boolean {
	return existsSync(path) && Object.prototype.hasOwnProperty.call(parseFrontmatter(readText(path)), "doc_type");
}

	export function checkPstrDrift(root: string): DriftFinding[] {
	const live = buildPstrIndexSnapshot(root);
	const stored = getPstrIndex(root);
	const findings: DriftFinding[] = [];
	const storedMaps = stored && Array.isArray(stored.maps) ? stored.maps : [];
	const storedById = new Map(storedMaps.map((entry) => [entry.id, entry] as const));

	if (!stored) {
		if (live.maps.length === 0) {
			return [makeFinding("pstr:index:missing", "warn", "pstr", "missing stored PSTR index", "run afol pstr rebuild")];
		}
		return live.maps.map((entry) =>
			makeFinding(
				`pstr:map:${entry.id}:missing`,
				"warn",
				"pstr",
				`missing stored map ${entry.id}`,
				"run afol pstr rebuild",
				entry.source_hash,
				"missing",
			),
		);
	}

	for (const entry of live.maps) {
		const storedEntry = storedById.get(entry.id);
		if (!storedEntry) {
			findings.push(
				makeFinding(
					`pstr:map:${entry.id}:missing`,
					"warn",
					"pstr",
					`missing stored map ${entry.id}`,
					"run afol pstr rebuild",
					entry.source_hash,
					"missing",
				),
			);
			continue;
		}
		if (storedEntry.source_hash !== entry.source_hash) {
			findings.push(
				makeFinding(
					`pstr:map:${entry.id}:stale`,
					"warn",
					"pstr",
					`stale map ${entry.id}`,
					"run afol pstr rebuild",
					entry.source_hash,
					storedEntry.source_hash,
				),
			);
		}
	}

	for (const storedEntry of stored.maps) {
		if (live.maps.some((entry) => entry.id === storedEntry.id)) {
			continue;
		}
		findings.push(
			makeFinding(
				`pstr:map:${storedEntry.id}:missing`,
				"warn",
				"pstr",
				`missing live map ${storedEntry.id}`,
				"run afol pstr rebuild",
				storedEntry.source_hash,
				"missing",
			),
		);
	}

	return findings;
}

export function checkStateDrift(root: string, sessionId?: string): DriftFinding[] {
	const db = openDb(root);
	try {
		const sessions = sessionId
			? (db
				.query("SELECT session_id, session_path FROM sessions WHERE session_id = ?")
				.all(sessionId) as StoredSessionRow[])
			: (db
				.query("SELECT session_id, session_path FROM sessions ORDER BY session_id ASC")
				.all() as StoredSessionRow[]);
		const findings: DriftFinding[] = [];
		if (sessionId && sessions.length === 0) {
			return [makeFinding(`state:session:${sessionId}:missing`, "warn", "state", `missing hydrated session ${sessionId}`, `run afol hydrate -S ${sessionId}`, "missing", "missing")];
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
				.query("SELECT session_id, path, source_hash FROM source_files WHERE session_id = ? ORDER BY path ASC")
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
				const actualHash = computeSourceHash(readFileSync(actualPath, "utf8")).hash;
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
	const activeRows = parseSpecIndex(root).filter((row) => row.status === "active");
	if (activeRows.length === 0) {
		return [makeFinding("adm:spec-index:missing", "fail", "adm", "missing active specs index", "restore docs/arc/SPECS/INDEX.md")];
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
					"add the spec file under docs/arc/SPECS",
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

export function runDriftCheck(
	root: string,
	opts?: { pstr?: boolean; state?: boolean; specs?: boolean },
): DriftReport {
	const findings = [
		...(opts?.pstr ?? true ? checkPstrDrift(root) : []),
		...(opts?.state ?? true ? checkStateDrift(root) : []),
		...(opts?.specs ?? true ? checkSpecDrift(root) : []),
	];
	return { ok: findings.length === 0, checked_at: nowIso(), findings };
}
