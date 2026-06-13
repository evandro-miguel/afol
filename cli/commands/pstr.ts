import {
	checkPstrStale,
	getPstrIndex,
	getPstrSection,
	rebuildPstrIndex,
	validatePstrIndex,
} from "../services/pstr";
import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
} from "../core/envelope";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type PstrAction = "rebuild" | "show" | "validate" | "stale" | "section";

function hasJsonFlag(args: string[]): boolean {
	return args.some((value) => value === "--json" || value === "-j");
}

function writeJsonOk<T extends Record<string, unknown>>(
	io: CommandIo,
	action: PstrAction,
	data: T,
	legacyKeys: readonly (keyof T)[] = [],
): void {
	const envelope = envelopeWithLegacyKeys(
		envelopeOk(data, { action: `pstr.${action}` }),
		legacyKeys,
	);
	io.stdout(stringifyEnvelope(envelope));
}

function writeJsonErr(
	io: CommandIo,
	action: string,
	code: string,
	message: string,
	exitCode: 1 | 2,
): void {
	io.stdout(
		stringifyEnvelope(
			envelopeErr(code, message, { action: `pstr.${action}`, exitCode }),
		),
	);
}

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
				writeJsonOk(io, pstrAction, { snapshot }, ["snapshot"]);
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
				if (json) {
					writeJsonErr(
						io,
						pstrAction,
						"pstr.show.missing_index",
						"pstr show: no index found. Run `afol pstr rebuild` first.",
						1,
					);
					return 1;
				}
				io.stderr("pstr show: no index found. Run `afol pstr rebuild` first.");
				return 1;
			}
			if (json) {
				writeJsonOk(io, pstrAction, { snapshot: index }, ["snapshot"]);
			} else {
				io.stdout(
					[
						"pstr show:",
						`maps: ${index.maps.length}`,
						`generated: ${index.generated_at}`,
						...index.maps.map(
							(map) =>
								`  ${map.id} [${map.status}]: ${map.scope}, ${map.file_count} files`,
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
				if (result.ok) {
					writeJsonOk(io, pstrAction, result);
				} else {
					writeJsonErr(
						io,
						pstrAction,
						"pstr.validate.failed",
						result.message,
						1,
					);
				}
			} else {
				io.stdout(
					`pstr validate: ${result.ok ? "ok" : "fail"} ${result.message}`,
				);
			}
			return result.ok ? 0 : 1;
		}

		if (pstrAction === "stale") {
			const json = parseJsonFlag(args);
			const staleResults = checkPstrStale(projectRoot);
			const anyStale = staleResults.some((result) => result.stale);
			if (json) {
				if (anyStale) {
					writeJsonErr(
						io,
						pstrAction,
						"pstr.stale.failed",
						staleResults.find((result) => result.stale)?.message ??
							"stale areas found",
						1,
					);
				} else {
					writeJsonOk(io, pstrAction, { areas: staleResults }, ["areas"]);
				}
			} else {
				io.stdout(
					[
						`pstr stale: ${anyStale ? "stale areas found" : "all current"}`,
						...staleResults.map(
							(result) =>
								`  ${result.stale ? "STALE" : "ok"} ${result.id}: ${result.message}`,
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
				if (parsed.json) {
					writeJsonErr(
						io,
						pstrAction,
						"pstr.section.not_found",
						`pstr section: not found: ${parsed.id}`,
						1,
					);
					return 1;
				}
				io.stderr(`pstr section: not found: ${parsed.id}`);
				return 1;
			}
			if (!section.ok) {
				if (parsed.json) {
					writeJsonErr(
						io,
						pstrAction,
						"pstr.section.failed",
						section.message,
						2,
					);
					return 2;
				}
				io.stderr(section.message);
				return 2;
			}
			if (parsed.json) {
				writeJsonOk(
					io,
					pstrAction,
					{ entry: section.entry, content: section.content },
					["entry", "content"],
				);
			} else {
				io.stdout(section.content);
			}
			return 0;
		}

		io.stderr(`pstr ${pstrAction}: not yet implemented`);
		return 1;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (hasJsonFlag(args)) {
			writeJsonErr(io, action, "pstr.command.error", message, 2);
		} else {
			io.stderr(message);
		}
		return 2;
	}
}
