import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveArtifactProjectPaths } from "../project/paths";

/**
 * Evolution-only session enumeration. Unlike the workbench index collector,
 * this view includes `_archive` because historical observation coverage must
 * survive archiving. The workbench radar keeps ignoring `_archive`.
 */
const EVOLUTION_AUXILIARY_DIRS = new Set(["_archive", "screenshots"]);

export type EvolutionHistorySessionLocation = "live" | "archived";

export type EvolutionHistorySession = {
	session_id: string;
	location: EvolutionHistorySessionLocation;
};

export type EvolutionHistorySessionEnumeration = {
	sessions: EvolutionHistorySession[];
	conflicts: string[];
};

function listSessionDirectories(path: string): string[] {
	if (!existsSync(path)) return [];
	return readdirSync(path, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				!entry.name.startsWith(".") &&
				!EVOLUTION_AUXILIARY_DIRS.has(entry.name),
		)
		.map((entry) => entry.name)
		.sort();
}

/**
 * Enumerate open, closed, and archived workbench sessions by identity.
 * An archived directory keeps `<session-id>`, so it never mints a second
 * identity. An id that exists both live and archived is reported once as a
 * conflict and excluded from processing so both trees stay untouched.
 */
export function enumerateEvolutionHistorySessions(
	root: string,
): EvolutionHistorySessionEnumeration {
	const wbRoot = resolveArtifactProjectPaths(root).abs.wbDir;
	const live = new Set(listSessionDirectories(wbRoot));
	const archived = new Set(listSessionDirectories(join(wbRoot, "_archive")));
	const conflicts = [...live].filter((session) => archived.has(session)).sort();
	const sessions: EvolutionHistorySession[] = [];
	for (const session of live)
		if (!archived.has(session))
			sessions.push({ session_id: session, location: "live" });
	for (const session of archived)
		if (!live.has(session))
			sessions.push({ session_id: session, location: "archived" });
	sessions.sort((left, right) =>
		left.session_id.localeCompare(right.session_id),
	);
	return { sessions, conflicts };
}
