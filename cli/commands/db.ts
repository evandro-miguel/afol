import { checkDbHealth, type DbHealthReport } from "../services/state/db-health";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

function parseArgs(args: string[]): { json: boolean } {
	let json = false;
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		throw new Error(`Unknown db argument: ${value}`);
	}
	return { json };
}

function formatFinding(finding: DbHealthReport["findings"][number]): string {
	return `${finding.severity.toUpperCase()} ${finding.message}${finding.hint ? ` hint=${finding.hint}` : ""}`;
}

function formatReport(report: DbHealthReport): string {
	return [
		`db health: ${report.ok ? "ok" : "issues found"}`,
		`db_exists=${report.db_exists} schema_ok=${report.schema_ok} wal_enabled=${report.wal_enabled} fts_ok=${report.fts_ok}`,
		`orphan_records=${report.orphan_records} stale_sources=${report.stale_sources} size_bytes=${report.size_bytes}`,
		...report.findings.map(formatFinding),
	].join("\n");
}

export async function runDbCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const dbAction = !action || action === "health" ? "health" : action;
		if (dbAction !== "health") {
			throw new Error(`Unknown db action: ${action}`);
		}
		const parsed = parseArgs(args);
		const report = checkDbHealth(projectRoot);
		if (parsed.json) {
			io.stdout(JSON.stringify(report));
		} else {
			io.stdout(formatReport(report));
		}
		return report.ok ? 0 : 1;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
