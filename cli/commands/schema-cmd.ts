import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	stringifyEnvelope,
} from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
} from "../core/operation-context";
import type { ShapePack } from "../services/schema";
import {
	detectResolver,
	detectShape,
	readShapePack,
	resolverPathForRoot,
	shapePackPathForRoot,
	suggestShape,
	writeResolver,
	writeShapePack,
} from "../services/schema";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

function writeJsonOk<T extends Record<string, unknown>>(
	io: CommandIo,
	action: string,
	data: T,
	legacyKeys: readonly (keyof T)[],
): void {
	io.stdout(
		stringifyEnvelope(
			envelopeWithLegacyKeys(
				envelopeOk(data, { action: `schema.${action}` }),
				legacyKeys,
			),
		),
	);
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
			envelopeErr(code, message, { action: `schema.${action}`, exitCode }),
		),
	);
}

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
				writeJsonOk(io, schemaAction, { pack: detected, shape: detected }, [
					"pack",
					"shape",
				]);
			} else io.stdout(formatPack(detected));
			return 0;
		}

		if (schemaAction === "suggest") {
			const suggestions = suggestShape(projectRoot);
			if (parsed.json) {
				writeJsonOk(io, schemaAction, { suggestions }, ["suggestions"]);
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
				writeJsonOk(
					io,
					schemaAction,
					{ current, detected, suggestions, shape: detected },
					["current", "detected", "suggestions", "shape"],
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
			const path = resolverPathForRoot(projectRoot);
			if (parsed.write) {
				writeResolver(projectRoot);
			}
			const content = detectResolver(projectRoot);
			if (parsed.json) {
				writeJsonOk(io, schemaAction, { write: parsed.write, path, content }, [
					"write",
					"path",
					"content",
				]);
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
				writeJsonErr(
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
			writeJsonOk(
				io,
				schemaAction,
				{
					dry_run: parsed.dryRun,
					path: shapePackPathForRoot(projectRoot),
					pack: detected,
					shape: detected,
				},
				["dry_run", "path", "pack", "shape"],
			);
		} else {
			io.stdout(
				`schema apply: ${parsed.dryRun ? "dry-run" : "written"} ${shapePackPathForRoot(projectRoot)}`,
			);
		}
		return 0;
	} catch (error) {
		if (wantsJson && error instanceof Error && error.message) {
			writeJsonErr(io, action, "schema.command.error", error.message, 2);
			return 2;
		}
		io.stderr((error as Error).message);
		return 2;
	}
}
