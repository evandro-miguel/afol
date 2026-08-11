import { resolve } from "node:path";
import { envelopeErr, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
} from "../core/operation-context";
import { runBootstrapCommand } from "./bootstrap";

type InitArgs = {
	targetRoot: string;
	forwarded: string[];
};

function parseInitArgs(args: string[]): InitArgs {
	let targetRoot = "";
	const forwarded: string[] = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) {
			continue;
		}
		if (arg === "--json" || arg === "-j") {
			forwarded.push(arg);
			continue;
		}
		if (
			arg === "--dry-run" ||
			arg === "--force-managed" ||
			arg === "--cleanup-obsolete" ||
			arg === "--cleanup-provider-compatible-mutable" ||
			arg === "--confirm-provider-migration" ||
			arg === "--provider-compatible" ||
			arg === "--without-claude" ||
			arg === "--verbose"
		) {
			forwarded.push(arg);
			continue;
		}
		if (arg === "--partial") {
			throw new Error(
				"Unsupported init argument: --partial. Partial install is not supported in this CLI.",
			);
		}
		if (arg === "--mutable-dir") {
			const value = args[index + 1];
			if (!value) {
				throw new Error("Missing value for --mutable-dir");
			}
			forwarded.push(arg, value);
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) {
			throw new Error(`Unknown init argument: ${arg}`);
		}
		if (!targetRoot) {
			targetRoot = arg;
			continue;
		}
		throw new Error(`Unexpected init argument: ${arg}`);
	}
	if (
		(forwarded.includes("--json") || forwarded.includes("-j")) &&
		!forwarded.includes("--dry-run")
	) {
		throw new Error("Unsupported init argument: --json requires --dry-run");
	}

	return {
		targetRoot: resolve(targetRoot || process.cwd()),
		forwarded,
	};
}

export async function runInitCommand(
	args: string[],
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	let parsed: InitArgs;
	try {
		parsed = parseInitArgs(args);
	} catch (error) {
		const message = (error as Error).message;
		if (args.includes("--json") || args.includes("-j")) {
			console.log(
				stringifyEnvelope(
					envelopeErr("INIT_ERROR", message, {
						action: "init",
						exitCode: 2,
					}),
				),
			);
		} else console.error(message);
		return 2;
	}

	return runBootstrapCommand([parsed.targetRoot, ...parsed.forwarded], {}, ctx);
}
