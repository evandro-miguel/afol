import {
	checkPstrStale,
	getPstrIndex,
	getPstrSection,
	rebuildPstrIndex,
	validatePstrIndex,
} from "../services/pstr";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type PstrAction = "rebuild" | "show" | "validate" | "stale" | "section";

function normalizeAction(value: string | undefined): PstrAction {
	if (!value || value === "show" || value === "sh") {
		return "show";
	}
	if (value === "rebuild" || value === "rb") {
		return "rebuild";
	}
	if (value === "validate" || value === "v") {
		return "validate";
	}
	if (value === "stale" || value === "st") {
		return "stale";
	}
	if (value === "section" || value === "sec") {
		return "section";
	}
	throw new Error(`Unknown pstr action: ${value}`);
}

function parseJsonFlag(args: string[]): boolean {
	let json = false;
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		throw new Error(`Unknown pstr argument: ${value}`);
	}
	return json;
}

function parseSectionArgs(args: string[]): { json: boolean; id: string } {
	let json = false;
	let id = "";
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown pstr argument: ${value}`);
		}
		if (id) {
			throw new Error("Usage: afol pstr section <id> [--json]");
		}
		id = value;
	}
	if (!id) {
		throw new Error("Usage: afol pstr section <id> [--json]");
	}
	return { json, id };
}

export async function runPstrCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const pstrAction = normalizeAction(action);

		if (pstrAction === "rebuild") {
			const json = parseJsonFlag(args);
			const snapshot = rebuildPstrIndex(projectRoot);
			if (json) {
				io.stdout(JSON.stringify({ ok: true, action: pstrAction, snapshot }));
			} else {
				io.stdout(
					[
						"pstr rebuild: ok",
						`maps: ${snapshot.maps.length}`,
						...snapshot.maps.map(
							(map) =>
								`  ${map.id}: ${map.file_count} files, hash=${map.source_hash.slice(0, 12)}...`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (pstrAction === "show") {
			const json = parseJsonFlag(args);
			const index = getPstrIndex(projectRoot);
			if (!index) {
				io.stderr("pstr show: no index found. Run `afol pstr rebuild` first.");
				return 1;
			}
			if (json) {
				io.stdout(JSON.stringify({ ok: true, action: pstrAction, snapshot: index }));
			} else {
				io.stdout(
					[
						"pstr show:",
						`maps: ${index.maps.length}`,
						`generated: ${index.generated_at}`,
						...index.maps.map(
							(map) => `  ${map.id} [${map.status}]: ${map.scope}, ${map.file_count} files`,
						),
					].join("\n"),
				);
			}
			return 0;
		}

		if (pstrAction === "validate") {
			const json = parseJsonFlag(args);
			const result = validatePstrIndex(projectRoot);
			if (json) {
				io.stdout(JSON.stringify({ action: pstrAction, ...result }));
			} else {
				io.stdout(`pstr validate: ${result.ok ? "ok" : "fail"} ${result.message}`);
			}
			return result.ok ? 0 : 1;
		}

		if (pstrAction === "stale") {
			const json = parseJsonFlag(args);
			const staleResults = checkPstrStale(projectRoot);
			const anyStale = staleResults.some((result) => result.stale);
			if (json) {
				io.stdout(JSON.stringify({ ok: !anyStale, action: pstrAction, areas: staleResults }));
			} else {
				io.stdout(
					[
						`pstr stale: ${anyStale ? "stale areas found" : "all current"}`,
						...staleResults.map(
							(result) => `  ${result.stale ? "STALE" : "ok"} ${result.id}: ${result.message}`,
						),
					].join("\n"),
				);
			}
			return anyStale ? 1 : 0;
		}

		if (pstrAction === "section") {
			const parsed = parseSectionArgs(args);
			const section = getPstrSection(projectRoot, parsed.id);
			if (!section) {
				io.stderr(`pstr section: not found: ${parsed.id}`);
				return 1;
			}
			if (!section.ok) {
				io.stderr(section.message);
				return 2;
			}
			if (parsed.json) {
				io.stdout(JSON.stringify({ ok: true, action: pstrAction, entry: section.entry, content: section.content }));
			} else {
				io.stdout(section.content);
			}
			return 0;
		}

		io.stderr(`pstr ${pstrAction}: not yet implemented`);
		return 1;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
