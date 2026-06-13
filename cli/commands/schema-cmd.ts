import { defaultOperationContext, type OperationContext } from "../core/operation-context";
import { detectResolver, detectShape, readShapePack, resolverPathForRoot, shapePackPathForRoot, suggestShape, writeResolver, writeShapePack } from "../services/schema";
import type { ShapePack } from "../services/schema";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type SchemaAction = "detect" | "suggest" | "review" | "apply" | "resolver";

function normalizeAction(value: string | undefined): SchemaAction {
	if (!value || value === "detect") return "detect";
	if (value === "suggest") return "suggest";
	if (value === "review") return "review";
	if (value === "resolver") return "resolver";
	if (value === "apply") return "apply";
	throw new Error(`Unknown schema action: ${value}`);
}

function parseArgs(args: string[]): { json: boolean; dryRun: boolean; write: boolean } {
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
			(pageType) => `- ${pageType.name} ${pageType.prefix} ${pageType.authority} ${pageType.inclusion}${pageType.stale_policy ? ` stale_policy=${pageType.stale_policy}` : ""}`,
		),
	].join("\n");
}

function canApply(ctx: OperationContext, dryRun: boolean): { ok: boolean; message?: string } {
	if (dryRun) return { ok: true };
	if (ctx.callerType === "remote") {
		return { ok: false, message: "schema apply denied for remote callers" };
	}
	if (ctx.callerType === "agent") {
		return { ok: false, message: "schema apply requires --dry-run for agent callers" };
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
	try {
		const schemaAction = normalizeAction(action);
		const parsed = parseArgs(args);
		const detected = detectShape(projectRoot);

		if (schemaAction === "detect") {
			if (parsed.json) io.stdout(JSON.stringify({ ok: true, action: schemaAction, pack: detected }));
			else io.stdout(formatPack(detected));
			return 0;
		}

		if (schemaAction === "suggest") {
			const suggestions = suggestShape(projectRoot);
			if (parsed.json) io.stdout(JSON.stringify({ ok: true, action: schemaAction, suggestions }));
			else io.stdout(suggestions.length > 0 ? suggestions.join("\n") : "shape pack is current");
			return 0;
		}

		if (schemaAction === "review") {
			const current = readShapePack(projectRoot);
			const suggestions = suggestShape(projectRoot);
			if (parsed.json) io.stdout(JSON.stringify({ ok: true, action: schemaAction, current, detected, suggestions }));
			else io.stdout([current ? formatPack(current) : "schema: missing", "", ...suggestions].join("\n"));
			return 0;
		}

		if (schemaAction === "resolver") {
			const path = resolverPathForRoot(projectRoot);
			const content = parsed.write ? (writeResolver(projectRoot), detectResolver(projectRoot)) : detectResolver(projectRoot);
			if (parsed.json) io.stdout(JSON.stringify({ ok: true, action: schemaAction, write: parsed.write, path, content }));
			else io.stdout(parsed.write ? `resolver written: ${path}` : formatResolver(content, path));
			return 0;
		}

		const apply = canApply(ctx, parsed.dryRun);
		if (!apply.ok) {
			io.stderr(apply.message ?? "schema apply denied");
			return 2;
		}
		if (!parsed.dryRun) {
			writeShapePack(projectRoot, detected);
		}
		if (parsed.json) {
			io.stdout(JSON.stringify({ ok: true, action: schemaAction, dry_run: parsed.dryRun, path: shapePackPathForRoot(projectRoot), pack: detected }));
		} else {
			io.stdout(`schema apply: ${parsed.dryRun ? "dry-run" : "written"} ${shapePackPathForRoot(projectRoot)}`);
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
