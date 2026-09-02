import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import { kernelRegistry } from "../registry";
import {
	ingestExternalReceipt,
	readExternalReceipt,
} from "../services/receipts/ingest";
import { recordEvidence } from "../services/workbench/lifecycle";
import { type CommandIo, DEFAULT_IO } from "./io";

function parseIngestArgs(args: string[]): string {
	let file: string | null = null;
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") continue;
		if (value === "--file") {
			const next = args[index + 1];
			if (!next || next.startsWith("-"))
				throw new Error("Missing value for --file.");
			file = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown receipt argument: ${value}`);
	}
	if (!file) throw new Error("Missing required --file.");
	return file;
}

export async function runReceiptCommand(
	action: string,
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		if (action !== "ingest")
			throw new Error(`Unknown receipt action: ${action}`);
		const file = parseIngestArgs(args);
		const sourcePath = isAbsolute(file) ? file : resolve(projectRoot, file);
		if (!existsSync(sourcePath))
			throw new Error("Receipt file does not exist.");
		const result = ingestExternalReceipt({
			root: projectRoot,
			receipt: readExternalReceipt(sourcePath),
			commands: kernelRegistry.commands,
			recordObservedEvidence: (input) => recordEvidence(projectRoot, input),
		});
		io.stdout(
			stringifyEnvelope(envelopeOk(result, { action: "receipt.ingest" })),
		);
		return 0;
	} catch (error) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr("RECEIPT_INVALID", (error as Error).message, {
					action: "receipt.ingest",
					exitCode: 2,
				}),
			),
		);
		return 2;
	}
}
