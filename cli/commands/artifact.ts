import {
	envelopeErr,
	envelopeOk,
	stringifyEnvelope,
} from "../core/envelope";
import {
	assertAdmittedOperationContext,
	defaultOperationContext,
	isActionAllowed,
	type OperationContext,
} from "../core/operation-context";
import { ArtifactSaveError, saveArtifact } from "../services/artifacts/storage";
import type { ArtifactSaveReceipt } from "../services/artifacts/types";
import { DEFAULT_IO, type CommandIo } from "./io";

const POLICY = { action: "artifact.save", sideEffect: "write" as const };

type ParsedSaveArgs = {
	kind?: string;
	text?: string;
	file?: string;
	title?: string;
	sessions: string[];
	records: string[];
	standalone: boolean;
	requestId?: string;
	json: boolean;
};

function parseSaveArgs(args: readonly string[]): ParsedSaveArgs {
	const parsed: ParsedSaveArgs = {
		sessions: [],
		records: [],
		standalone: false,
		json: false,
	};
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const next = (): string => {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("-"))
				throw new Error(`artifact save ${arg} requires a value`);
			index += 1;
			return value;
		};
		if (arg === "--json" || arg === "-j") parsed.json = true;
		else if (arg === "--standalone") parsed.standalone = true;
		else if (arg === "--kind") parsed.kind = next();
		else if (arg === "--text") parsed.text = next();
		else if (arg === "--file") parsed.file = next();
		else if (arg === "--title") parsed.title = next();
		else if (arg === "--session") parsed.sessions.push(next());
		else if (arg === "--record") parsed.records.push(next());
		else if (arg === "--request-id") parsed.requestId = next();
		else throw new Error(`Unknown artifact save argument: ${arg}`);
	}
	return parsed;
}

function formatReceipt(receipt: ArtifactSaveReceipt): string {
	return [
		`saved ${receipt.path}`,
		`owner=${receipt.owner.kind}:${receipt.owner.id}`,
		`digest=${receipt.content_digest}`,
		`bytes=${receipt.bytes}`,
		`persisted=${receipt.persisted} duplicate=${receipt.duplicate}`,
		`index=${receipt.index.status}`,
	].join("\n");
}

export async function runArtifactCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	operationContext: OperationContext = defaultOperationContext(),
): Promise<number> {
	assertAdmittedOperationContext(operationContext);
	const jsonRequested = args.some((arg) => arg === "--json" || arg === "-j");
	const requestedAction = action || "save";
	if (requestedAction !== "save")
		throw new Error(`Unknown artifact action: ${requestedAction}`);
	if (!isActionAllowed(operationContext, POLICY))
		throw new Error("artifact save is not allowed for this caller");
	const parsed = parseSaveArgs(args);
	try {
		if (parsed.kind === undefined)
			throw new Error("artifact save requires --kind <kind>");
		if (parsed.sessions.length > 1 || parsed.records.length > 1)
			throw new Error(
				"use at most one of --session, --record, or --standalone",
			);
		const receipt = saveArtifact({
			root: projectRoot,
			kind: parsed.kind,
			...(parsed.text !== undefined ? { text: parsed.text } : {}),
			...(parsed.file !== undefined ? { file: parsed.file } : {}),
			...(parsed.title !== undefined ? { title: parsed.title } : {}),
			...(parsed.sessions.length === 1
				? { session: parsed.sessions[0] }
				: {}),
			...(parsed.records.length === 1 ? { record: parsed.records[0] } : {}),
			...(parsed.standalone ? { standalone: true } : {}),
			...(process.env.AFOL_SESSION?.trim()
				? { envSession: process.env.AFOL_SESSION.trim() }
				: {}),
			...(parsed.requestId !== undefined
				? { requestId: parsed.requestId }
				: {}),
		});
		io.stdout(
			parsed.json
				? stringifyEnvelope(envelopeOk(receipt, POLICY))
				: formatReceipt(receipt),
		);
		return 0;
	} catch (error) {
		const message = (error as Error).message;
		const code =
			error instanceof ArtifactSaveError ? error.code : "ARTIFACT_SAVE_FAILED";
		if (jsonRequested || parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr(code, message, {
						action: "artifact.save",
						exitCode: 2,
					}),
				),
			);
		} else {
			io.stderr(`err ${code} ${message}`);
		}
		return 2;
	}
}
