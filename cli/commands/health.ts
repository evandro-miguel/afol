import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { checkHealth } from "../services/health/checker";
import type { HealthArea, HealthFinding } from "../services/health/types";
import { type CommandIo, DEFAULT_IO } from "./io";

type HealthScope = "core" | "full" | "release";

type HealthJsonData = ReturnType<typeof checkHealth> & {
	checked_areas: readonly HealthArea[];
	findings_omitted: number;
	findings_total: number;
	release: boolean;
	scope: HealthScope;
};

const JSON_STATE_DRIFT_DETAIL_LIMIT = 10;
const JSON_STATE_DRIFT_EXAMPLE_LIMIT = 3;

const AREAS = new Set<HealthArea>([
	"adm",
	"pstr",
	"wb",
	"memory",
	"library",
	"state",
	"ctx",
	"evolution",
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
	"evolution",
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

function compactJsonFindings(findings: readonly HealthFinding[]): {
	findings: HealthFinding[];
	omitted: number;
} {
	const repeatedStateDrift = findings.filter(
		(finding) =>
			finding.area === "state" &&
			/^(missing|stale) hydrated file /.test(finding.message),
	);
	if (repeatedStateDrift.length <= JSON_STATE_DRIFT_DETAIL_LIMIT) {
		return { findings: [...findings], omitted: 0 };
	}

	const repeated = new Set(repeatedStateDrift);
	const stale = repeatedStateDrift.filter((finding) =>
		finding.message.startsWith("stale "),
	).length;
	const missing = repeatedStateDrift.length - stale;
	const examples = repeatedStateDrift
		.slice(0, JSON_STATE_DRIFT_EXAMPLE_LIMIT)
		.map((finding) => finding.message)
		.join("; ");
	return {
		findings: [
			...findings.filter((finding) => !repeated.has(finding)),
			{
				area: "state",
				severity: "warn",
				message: `${repeatedStateDrift.length} hydrated files drift (${stale} stale, ${missing} missing); examples: ${examples}`,
				hint: "run afol validate drift --json for full findings, then rehydrate affected sessions",
			},
		],
		omitted: repeatedStateDrift.length - 1,
	};
}

function writeJsonReport(
	io: CommandIo,
	report: ReturnType<typeof checkHealth>,
	parsed: ReturnType<typeof parseArgs>,
	checkedAreas: readonly HealthArea[],
): void {
	const compacted = compactJsonFindings(report.findings);
	const data: HealthJsonData = {
		...report,
		checked_areas: checkedAreas,
		findings: compacted.findings,
		findings_omitted: compacted.omitted,
		findings_total: report.findings.length,
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
