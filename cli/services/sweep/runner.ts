import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkActiveSessionPointerMutation } from "../drift/checker";
import { detectSessionHealth } from "../local-state/workbench-index";
import { readMemory } from "../memory";
import { resolveProjectPaths } from "../project/paths";
import { checkPstrStale } from "../pstr";
import { openDb, validateState } from "../state";

type SweepReport = { checked: number; issues: number; actions: string[] };

const DAY_MS = 24 * 60 * 60 * 1000;

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function addCheck(
	report: SweepReport,
	checked: number,
	issues: number,
	actions: string[],
): void {
	report.checked += checked;
	report.issues += issues;
	report.actions.push(...actions);
}

function pstrCheck(root: string, report: SweepReport): void {
	const stale = checkPstrStale(root).filter((entry) => entry.stale);
	addCheck(report, 1, stale.length, stale.length > 0 ? ["rebuild pstr"] : []);
}

function dbCheck(root: string, report: SweepReport): void {
	const stateDbPath = resolveProjectPaths(root).abs.stateDb;
	if (!existsSync(stateDbPath)) {
		addCheck(report, 1, 1, ["initialize state database"]);
		return;
	}
	let db: ReturnType<typeof openDb> | null = null;
	try {
		db = openDb(root);
		db.query("SELECT 1").all();
		addCheck(report, 1, 0, []);
	} catch {
		addCheck(report, 1, 1, ["repair state database"]);
	} finally {
		if (db) {
			db.close();
		}
	}
}

function memoryCheck(root: string, report: SweepReport): void {
	const memory = readMemory(root);
	if (!memory) {
		addCheck(report, 1, 1, ["refresh project memory"]);
		return;
	}
	const updatedAt = Date.parse(memory.updated_at);
	const stale =
		!Number.isFinite(updatedAt) || Date.now() - updatedAt > 30 * DAY_MS;
	addCheck(report, 1, stale ? 1 : 0, stale ? ["refresh project memory"] : []);
}

function activeSessionCheck(root: string, report: SweepReport): void {
	const activeSessionPath = resolveProjectPaths(root).abs.activeSessionFile;
	if (!existsSync(activeSessionPath)) {
		addCheck(report, 1, 0, []);
		return;
	}
	const sessionId = readFileSync(activeSessionPath, "utf8").trim();
	if (!sessionId) {
		addCheck(report, 1, 0, []);
		return;
	}
	const sessionDir = join(resolveProjectPaths(root).abs.wbDir, sessionId);
	if (!existsSync(sessionDir)) {
		addCheck(report, 1, 1, ["close active session"]);
		return;
	}
	const ageMs = Date.now() - statSync(sessionDir).mtimeMs;
	const stale = ageMs > 7 * DAY_MS;
	addCheck(report, 1, stale ? 1 : 0, stale ? ["close active session"] : []);
}

function activeSessionPointerMutationCheck(
	root: string,
	report: SweepReport,
): void {
	const findings = checkActiveSessionPointerMutation(root);
	addCheck(
		report,
		1,
		findings.length,
		findings.length > 0 ? ["review .afol/wb/.active_session mutation"] : [],
	);
}

function sessionHealthCheck(root: string, report: SweepReport): void {
	const warnings = detectSessionHealth(root);
	addCheck(
		report,
		1,
		warnings.length,
		warnings.length > 0 ? ["review session health warnings"] : [],
	);
}

function stateValidationCheck(root: string, report: SweepReport): void {
	const activeSessionPath = resolveProjectPaths(root).abs.activeSessionFile;
	if (!existsSync(activeSessionPath)) {
		addCheck(report, 1, 0, []);
		return;
	}
	const sessionId = readFileSync(activeSessionPath, "utf8").trim();
	if (!sessionId) {
		addCheck(report, 1, 0, []);
		return;
	}
	const validation = validateState(root, sessionId);
	addCheck(
		report,
		1,
		validation.ok ? 0 : 1,
		validation.ok ? [] : ["hydrate active session state"],
	);
}

function archiveCheck(root: string, report: SweepReport): void {
	const wbRoot = resolveProjectPaths(root).abs.wbDir;
	if (!existsSync(wbRoot)) {
		addCheck(report, 1, 0, []);
		return;
	}
	const staleSessions: string[] = [];
	const ninetyDaysMs = 90 * DAY_MS;
	for (const entry of readdirSync(wbRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}
		const sessionDir = join(wbRoot, entry.name);
		if (Date.now() - statSync(sessionDir).mtimeMs > ninetyDaysMs) {
			staleSessions.push(entry.name);
		}
	}
	addCheck(
		report,
		1,
		staleSessions.length > 0 ? 1 : 0,
		staleSessions.length > 0 ? ["archive closed workbench sessions"] : [],
	);
}

function finalize(report: SweepReport): SweepReport {
	return { ...report, actions: unique(report.actions) };
}

export function sweepDaily(root: string): SweepReport {
	const report: SweepReport = { checked: 0, issues: 0, actions: [] };
	pstrCheck(root, report);
	dbCheck(root, report);
	memoryCheck(root, report);
	activeSessionCheck(root, report);
	activeSessionPointerMutationCheck(root, report);
	return finalize(report);
}

export function sweepWeekly(root: string): SweepReport {
	const report = sweepDaily(root);
	sessionHealthCheck(root, report);
	stateValidationCheck(root, report);
	return finalize(report);
}

export function sweepMonthly(root: string): SweepReport {
	const report = sweepWeekly(root);
	archiveCheck(root, report);
	return finalize(report);
}
