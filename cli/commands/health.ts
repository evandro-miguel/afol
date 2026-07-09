import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { checkHealth } from "../services/health/checker";
import type { HealthArea } from "../services/health/types";
import { type CommandIo, DEFAULT_IO } from "./io";

type HealthScope = "core" | "full" | "release";

type HealthJsonData = ReturnType<typeof checkHealth> & {
	checked_areas: readonly HealthArea[];
	release: boolean;
	scope: HealthScope;
};

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
const ALL_AREAS: readonly HealthArea[] = [
	"adm",
	"pstr",
	"wb",
	"memory",
	"library",
	"state",
	"ctx",
	"token_budget",
];
const CORE_AREAS: readonly HealthArea[] = ["wb"];
const SCOPES = new Set<HealthScope>(["core", "full", "release"]);

function parseArgs(args: string[]): {
	area?: HealthArea;
	deep: boolean;
	json: boolean;
	release: boolean;
	scope: HealthScope;
} {
	const parsed = {
		deep: false,
		json: false,
		release: false,
		scope: "core",
	} as {
		area?: HealthArea;
		deep: boolean;
		json: boolean;
		release: boolean;
		scope: HealthScope;
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
			parsed.scope = "release";
			continue;
		}
		if (SCOPES.has(value as HealthScope)) {
			parsed.scope = value as HealthScope;
			parsed.release = parsed.release || value === "release";
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
	if (parsed.release) {
		parsed.scope = "release";
	}
	return parsed;
}

function checkedAreasFor(
	parsed: ReturnType<typeof parseArgs>,
): readonly HealthArea[] {
	if (parsed.area) {
		return [parsed.area];
	}
	if (
		parsed.deep ||
		parsed.release ||
		parsed.scope === "full" ||
		parsed.scope === "release"
	) {
		return ALL_AREAS;
	}
	return CORE_AREAS;
}

function checkedLine(
	checkedAreas: readonly HealthArea[],
	scope: HealthScope,
): string {
	if (
		checkedAreas.length === 1 &&
		checkedAreas[0] === "wb" &&
		scope === "core"
	) {
		return "checked: wb only";
	}
	return `checked: ${checkedAreas.join(", ")}`;
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
	parsed: ReturnType<typeof parseArgs>,
	checkedAreas: readonly HealthArea[],
): void {
	const data: HealthJsonData = {
		...report,
		checked_areas: checkedAreas,
		release: parsed.release || parsed.scope === "release",
		scope: parsed.scope,
	};
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
				"scope",
				"checked_areas",
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
		const checkedAreas = checkedAreasFor(parsed);
		const report = checkHealth(
			projectRoot,
			parsed.area
				? {
						area: parsed.area,
						deep:
							parsed.deep ||
							parsed.release ||
							parsed.scope === "full" ||
							parsed.scope === "release",
						release: parsed.release || parsed.scope === "release",
					}
				: {
						deep: parsed.deep || parsed.release || parsed.scope === "release",
						includeAuxiliary:
							parsed.scope === "full" || parsed.scope === "release",
						release: parsed.release || parsed.scope === "release",
					},
		);
		if (parsed.json) {
			writeJsonReport(io, report, parsed, checkedAreas);
		} else {
			const healthLabel =
				parsed.area || parsed.deep ? "health" : `health ${parsed.scope}`;
			io.stdout(
				[
					`${healthLabel}: ${report.ok ? "ok" : "issues found"}`,
					checkedLine(checkedAreas, parsed.scope),
					...(parsed.scope === "core" && !parsed.area && !parsed.deep
						? ["hint: run afol health --release for full project health"]
						: []),
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
