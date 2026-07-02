import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	type PreflightReport,
	runPreflight,
} from "../services/preflight/search";
import { type CommandIo, DEFAULT_IO } from "./io";

function parsePreflightArgs(args: string[]): { json: boolean; query: string } {
	let json = false;
	const queryParts: string[] = [];
	const values = [...args];
	if (values[0] === "preflight") {
		values.shift();
	}

	for (const value of values) {
		if (!value) {
			continue;
		}
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown preflight argument: ${value}`);
		}
		queryParts.push(value);
	}

	return { json, query: queryParts.join(" ").trim() };
}

function formatCollection<T>(
	items: readonly T[],
	formatItem: (item: T) => string,
): string {
	if (items.length === 0) {
		return "  - none";
	}
	return items.map((item) => `  - ${formatItem(item)}`).join("\n");
}

function formatReport(report: PreflightReport): string {
	return [
		`summary: ${report.summary}`,
		`query: ${report.query}`,
		"",
		"specs",
		formatCollection(
			report.specs,
			(spec) =>
				`${spec.score} | ${spec.id} | ${spec.theme || "(no theme)"} | ${spec.status}`,
		),
		"",
		"lessons",
		formatCollection(
			report.lessons,
			(lesson) => `${lesson.score} | ${lesson.path} | ${lesson.title}`,
		),
		"",
		"similar systems",
		formatCollection(
			report.similar_systems,
			(system) => `${system.score} | ${system.kind} | ${system.path}`,
		),
		"",
		"rules",
		formatCollection(report.rules, (rule) => `${rule.path} | ${rule.title}`),
		"",
		"ux journeys",
		formatCollection(
			report.ux_journeys,
			(journey) =>
				`${journey.score} | ${journey.id} | ${journey.status || "unknown"} | ${journey.path}`,
		),
		"",
		`recurrence_detected: ${report.recurrence_detected}`,
		"",
		"recommendations",
		formatCollection(
			report.recommendations,
			(recommendation) => recommendation,
		),
		"",
		"gaps",
		formatCollection(report.gaps, (gap) => gap),
	].join("\n");
}

export async function runPreflightCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	let parsed: { json: boolean; query: string };
	try {
		parsed = parsePreflightArgs(args);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}

	if (!parsed.query) {
		io.stderr(
			"pass an intent query, e.g. afol preflight 'add session isolation'",
		);
		return 2;
	}

	try {
		const report = runPreflight(projectRoot, parsed.query);
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeOk<PreflightReport>(report, { action: "preflight" }),
				),
			);
			return 0;
		}
		io.stdout(formatReport(report));
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
