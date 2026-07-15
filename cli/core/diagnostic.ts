import { randomUUID } from "node:crypto";
import { recordFeedback } from "../services/feedback";
import type { EnvelopeDiagnostic } from "./envelope";

export type DiagnosticCapture = EnvelopeDiagnostic & {
	persisted: boolean;
};

function reportId(): string {
	return `FB-${Date.now()}-${randomUUID()}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function diagnosticKind(error: unknown): EnvelopeDiagnostic["kind"] {
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String((error as { code?: unknown }).code ?? "")
			: "";
	const name = error instanceof Error ? error.name : "";
	return /\b(integrity|corrupt(?:ed|ion)?|checksum|hash mismatch|invariant)\b/i.test(
		`${name} ${code} ${errorMessage(error)}`,
	)
		? "integrity"
		: "unexpected";
}

export function captureDiagnostic(
	error: unknown,
	env: NodeJS.ProcessEnv = process.env,
): DiagnosticCapture {
	const kind = diagnosticKind(error);
	const id = reportId();
	let persisted = false;

	try {
		const input = {
			kind,
			message: errorMessage(error),
			error_code: kind === "integrity" ? "INTEGRITY_ERROR" : "UNEXPECTED_ERROR",
			...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
		};
		const report = recordFeedback(input, env, id);
		persisted = report?.report_id === id;
	} catch {
		// Diagnostics must never replace the original boundary error.
	}

	return { kind, report_id: id, persisted };
}
