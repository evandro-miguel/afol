import { envelopeErr, stringifyEnvelope } from "../../core/envelope";

export function writeJsonError(
	action: string,
	error: unknown,
	exitCode = 2,
): void {
	const message = error instanceof Error ? error.message : String(error);
	console.log(
		stringifyEnvelope(
			envelopeErr("workbench.error", message, { action, exitCode }),
		),
	);
}
