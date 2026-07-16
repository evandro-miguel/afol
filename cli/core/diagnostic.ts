import { randomUUID } from "node:crypto";
import { recordFeedback } from "../services/feedback";
import type { EnvelopeDiagnostic } from "./envelope";

export type DiagnosticCapture = EnvelopeDiagnostic & {
	persisted: boolean;
};

function reportId(): string {
	return `FB-${Date.now()}-${randomUUID()}`;
}

function toStringValue(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (value === null || value === undefined) return undefined;
	return undefined;
}

function errorRecord(error: unknown): Record<string, unknown> | null {
	return error && typeof error === "object"
		? (error as Record<string, unknown>)
		: null;
}

function errorProperty(error: unknown, key: string): unknown {
	const record = errorRecord(error);
	if (!record) return undefined;
	try {
		return record[key];
	} catch {
		return undefined;
	}
}

function safeString(error: unknown): string {
	try {
		return String(error);
	} catch {
		return "Unknown error";
	}
}

function errorMessage(error: unknown): string {
	if (typeof error === "string") return error;
	const message = toStringValue(errorProperty(error, "message"));
	if (message !== undefined) return message;

	return (
		toStringValue(errorProperty(error, "error")) ??
		toStringValue(errorProperty(error, "reason")) ??
		toStringValue(errorProperty(error, "code")) ??
		safeString(error)
	);
}

export function diagnosticKind(error: unknown): EnvelopeDiagnostic["kind"] {
	const code =
		toStringValue(errorProperty(error, "code")) ??
		toStringValue(errorProperty(error, "statusCode")) ??
		"";
	const name = toStringValue(errorProperty(error, "name")) ?? "";
	const message = errorMessage(error);
	return /\b(integrity|corrupt(?:ed|ion)?|checksum|hash mismatch|invariant)\b/i.test(
		`${name} ${code} ${message}`,
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
