import {
	defaultOperationContext,
	type OperationContext,
} from "../core/operation-context";
import { buildSchemaCacheKey } from "../core/schema-cache-key";
import {
	detectShape,
	readShapePack,
	shapePackPathForRoot,
	suggestShape,
	writeShapePack,
} from "../services/schema/detector";
import {
	detectResolver,
	resolverPathForRoot,
	writeResolver,
} from "../services/schema/resolver";
import type { ShapePack } from "../services/schema/types";
import { type CommandIo, createJsonWriters, DEFAULT_IO } from "./io";

const jsonOutput = createJsonWriters("schema");

type SchemaAction = "detect" | "suggest" | "review" | "apply" | "resolver";

function normalizeAction(value: string | undefined): SchemaAction {
	if (!value || value === "detect") return "detect";
	if (value === "suggest") return "suggest";
	if (value === "review") return "review";
	if (value === "resolver") return "resolver";
	if (value === "apply") return "apply";
	throw new Error(`Unknown schema action: ${value}`);
}

function parseArgs(args: string[]): {
	json: boolean;
	dryRun: boolean;
	write: boolean;
} {
	let json = false;
	let dryRun = false;
	let write = false;
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--write") {
			write = true;
			continue;
		}
		if (value === "--dry-run") {
			dryRun = true;
			continue;
		}
		throw new Error(`Unknown schema argument: ${value}`);
	}
	return { json, dryRun, write };
}

function formatPack(pack: ShapePack): string {
	return [
		`schema: ${pack.name}`,
		`api_version: ${pack.api_version}`,
		`version: ${pack.version}`,
		...pack.page_types.map(
			(pageType) =>
				`- ${pageType.name} ${pageType.prefix} ${pageType.authority} ${pageType.inclusion}${pageType.stale_policy ? ` stale_policy=${pageType.stale_policy}` : ""}`,
		),
	].join("\n");
}

function canApply(
	ctx: OperationContext,
	dryRun: boolean,
): { ok: boolean; message?: string } {
	if (dryRun) return { ok: true };
	if (ctx.callerType === "remote") {
		return { ok: false, message: "schema apply denied for remote callers" };
	}
	if (ctx.callerType === "agent") {
		return {
			ok: false,
			message: "schema apply requires --dry-run for agent callers",
		};
	}
	return { ok: true };
}

function canWriteResolver(ctx: OperationContext): {
	ok: boolean;
	message?: string;
} {
	if (ctx.callerType === "remote") {
		return {
			ok: false,
			message: "schema resolver --write denied for remote callers",
		};
	}
	if (ctx.callerType === "agent") {
		return {
			ok: false,
			message: "schema resolver --write denied for agent callers",
		};
	}
	return { ok: true };
}

function formatResolver(content: string, path: string): string {
	return [`resolver: ${path}`, "", content].join("\n");
}

export async function runSchemaCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	const wantsJson = args.some((value) => value === "--json" || value === "-j");
	try {
		const schemaAction = normalizeAction(action);
		const parsed = parseArgs(args);
		const detected = detectShape(projectRoot);

		if (schemaAction === "detect") {
			if (parsed.json) {
				const cacheKey = buildSchemaCacheKey(
					detected.name,
					detected.version,
					JSON.stringify(detected),
					shapePackPathForRoot(projectRoot),
					projectRoot,
				);
				jsonOutput.ok(
					io,
					schemaAction,
					{ pack: detected, shape: detected, cache_key: cacheKey },
					["pack", "shape", "cache_key"],
				);
			} else io.stdout(formatPack(detected));
			return 0;
		}

		if (schemaAction === "suggest") {
			const suggestions = suggestShape(projectRoot);
			if (parsed.json) {
				jsonOutput.ok(io, schemaAction, { suggestions }, ["suggestions"]);
			} else
				io.stdout(
					suggestions.length > 0
						? suggestions.join("\n")
						: "shape pack is current",
				);
			return 0;
		}

		if (schemaAction === "review") {
			const current = readShapePack(projectRoot);
			const suggestions = suggestShape(projectRoot);
			if (parsed.json) {
				const cacheKey = buildSchemaCacheKey(
					detected.name,
					detected.version,
					JSON.stringify(detected),
					shapePackPathForRoot(projectRoot),
					projectRoot,
				);
				jsonOutput.ok(
					io,
					schemaAction,
					{
						current,
						detected,
						suggestions,
						shape: detected,
						cache_key: cacheKey,
					},
					["current", "detected", "suggestions", "shape", "cache_key"],
				);
			} else
				io.stdout(
					[
						current ? formatPack(current) : "schema: missing",
						"",
						...suggestions,
					].join("\n"),
				);
			return 0;
		}

		if (schemaAction === "resolver") {
			if (parsed.write) {
				const gate = canWriteResolver(ctx);
				if (!gate.ok) {
					if (parsed.json) {
						jsonOutput.err(
							io,
							schemaAction,
							"schema.resolver.denied",
							gate.message ?? "schema resolver --write denied",
							2,
						);
					} else {
						io.stderr(gate.message ?? "schema resolver --write denied");
					}
					return 2;
				}
				writeResolver(projectRoot);
			}
			const path = resolverPathForRoot(projectRoot);
			const content = detectResolver(projectRoot);
			if (parsed.json) {
				jsonOutput.ok(
					io,
					schemaAction,
					{ write: parsed.write, path, content },
					["write", "path", "content"],
				);
			} else
				io.stdout(
					parsed.write
						? `resolver written: ${path}`
						: formatResolver(content, path),
				);
			return 0;
		}

		const apply = canApply(ctx, parsed.dryRun);
		if (!apply.ok) {
			if (parsed.json) {
				jsonOutput.err(
					io,
					schemaAction,
					"schema.apply.denied",
					apply.message ?? "schema apply denied",
					2,
				);
			} else {
				io.stderr(apply.message ?? "schema apply denied");
			}
			return 2;
		}
		if (!parsed.dryRun) {
			writeShapePack(projectRoot, detected);
		}
		if (parsed.json) {
			const cacheKey = buildSchemaCacheKey(
				detected.name,
				detected.version,
				JSON.stringify(detected),
				shapePackPathForRoot(projectRoot),
				projectRoot,
			);
			jsonOutput.ok(
				io,
				schemaAction,
				{
					dry_run: parsed.dryRun,
					path: shapePackPathForRoot(projectRoot),
					pack: detected,
					shape: detected,
					cache_key: cacheKey,
				},
				["dry_run", "path", "pack", "shape", "cache_key"],
			);
		} else {
			io.stdout(
				`schema apply: ${parsed.dryRun ? "dry-run" : "written"} ${shapePackPathForRoot(projectRoot)}`,
			);
		}
		return 0;
	} catch (error) {
		if (wantsJson && error instanceof Error && error.message) {
			jsonOutput.err(io, action, "schema.command.error", error.message, 2);
			return 2;
		}
		io.stderr((error as Error).message);
		return 2;
	}
}
