import { resolve } from "node:path";
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
		if (
			arg === "--dry-run" ||
			arg === "--force-managed" ||
			arg === "--cleanup-obsolete" ||
			arg === "--cleanup-provider-compatible-mutable" ||
			arg === "--confirm-provider-migration" ||
			arg === "--provider-compatible"
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

	return {
		targetRoot: resolve(targetRoot || process.cwd()),
		forwarded,
	};
}

export async function runInitCommand(args: string[]): Promise<number> {
	let parsed: InitArgs;
	try {
		parsed = parseInitArgs(args);
	} catch (error) {
		console.error((error as Error).message);
		return 2;
	}

	return runBootstrapCommand([parsed.targetRoot, ...parsed.forwarded]);
}
