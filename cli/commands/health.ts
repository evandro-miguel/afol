import { checkHealth, type HealthArea } from "../services/health";
import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
	type ResultEnvelope,
} from "../core/envelope";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type HealthJsonData = ReturnType<typeof checkHealth> & { release: boolean };

const AREAS = new Set<HealthArea>([
	"adm",
	"pstr",
	"wb",
	"memory",
	"library",
	"state",
	"ctx",
	"token_budget",
]);

function parseArgs(args: string[]): {
	area?: HealthArea;
	deep: boolean;
	json: boolean;
	release: boolean;
} {
	const parsed = { deep: false, json: false, release: false } as {
		area?: HealthArea;
		deep: boolean;
		json: boolean;
		release: boolean;
	};
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--deep") {
			parsed.deep = true;
			continue;
		}
		if (value === "--release") {
			parsed.release = true;
			continue;
		}
		if (value === "--area") {
			const next = args[index + 1];
			if (!next || !AREAS.has(next as HealthArea)) {
				throw new Error("Missing or invalid value for --area.");
			}
			parsed.area = next as HealthArea;
			index += 1;
			continue;
		}
		throw new Error(`Unknown health argument: ${value}`);
	}
	return parsed;
}

function formatFinding(finding: {
	area: string;
	severity: string;
	message: string;
	hint?: string;
}): string {
	return [
		`${finding.severity.toUpperCase()} ${finding.area}: ${finding.message}`,
		finding.hint ? `  hint: ${finding.hint}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

function writeJsonReport(
	io: CommandIo,
	report: ReturnType<typeof checkHealth>,
	release: boolean,
): void {
	const data: HealthJsonData = { ...report, release };
	const envelope = report.ok
		? envelopeOk(data, { action: "health", exitCode: 0 })
		: (envelopeErr("HEALTH_FAILED", "health check failed", {
			action: "health",
			exitCode: 1,
		}) as ResultEnvelope<HealthJsonData>);
	envelope.data = data;
	io.stdout(
		stringifyEnvelope(
			envelopeWithLegacyKeys(envelope, [
				"ok",
				"checked_at",
				"findings",
				"summary",
				"release",
			]),
		),
	);
}

export async function runHealthCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const parsed = parseArgs(args);
		const report = checkHealth(
			projectRoot,
			parsed.area
				? { area: parsed.area, deep: parsed.deep || parsed.release }
				: { deep: parsed.deep || parsed.release },
		);
		if (parsed.json) {
			writeJsonReport(io, report, parsed.release);
		} else {
			io.stdout(
				[
					`health: ${report.ok ? "ok" : "issues found"}`,
					`summary: fail=${report.summary.fail} warn=${report.summary.warn} info=${report.summary.info}`,
					...report.findings.map(formatFinding),
				].join("\n"),
			);
		}
		return report.ok ? 0 : 1;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
