import { envelopeErr, stringifyEnvelope } from "../../core/envelope";

export function writeJsonError(
	action: string,
	error: unknown,
	exitCode = 2,
	data?: Record<string, unknown>,
): void {
	const message = error instanceof Error ? error.message : String(error);
	const envelope = envelopeErr("workbench.error", message, {
		action,
		exitCode,
	});
	console.log(
		stringifyEnvelope(data === undefined ? envelope : { ...envelope, data }),
	);
}
