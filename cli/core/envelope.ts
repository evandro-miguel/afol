export type EnvelopeError = {
	code: string;
	message: string;
	hint?: string;
};

export type EnvelopeDiagnostic = {
	kind: "unexpected" | "integrity";
	report_id: string;
	persisted?: boolean;
};

export type ResultEnvelope<T> = {
	schema: "afol.result/v1";
	ok: boolean;
	action?: string;
	exit_code: number;
	data?: T;
	error?: EnvelopeError;
	diagnostic?: EnvelopeDiagnostic;
	warnings?: string[];
};

export function envelopeOk<T>(
	data: T,
	opts?: { action?: string; exitCode?: number; warnings?: string[] },
): ResultEnvelope<T> {
	const envelope: ResultEnvelope<T> = {
		schema: "afol.result/v1",
		ok: true,
		exit_code: opts?.exitCode ?? 0,
		data,
	};

	if (opts?.action !== undefined) {
		envelope.action = opts.action;
	}

	if (opts?.warnings !== undefined) {
		envelope.warnings = opts.warnings;
	}

	return envelope;
}

export function envelopeErr(
	code: string,
	message: string,
	opts?: { hint?: string; action?: string; exitCode?: number },
): ResultEnvelope<never> {
	const error: EnvelopeError = {
		code,
		message,
	};

	if (opts?.hint !== undefined) {
		error.hint = opts.hint;
	}

	const envelope: ResultEnvelope<never> = {
		schema: "afol.result/v1",
		ok: false,
		exit_code: opts?.exitCode ?? 1,
		error,
	};

	if (opts?.action !== undefined) {
		envelope.action = opts.action;
	}

	return envelope;
}

export function envelopeWithLegacyKeys<T extends Record<string, unknown>>(
	envelope: ResultEnvelope<T>,
	keys: readonly (keyof T)[],
): ResultEnvelope<T> & Partial<T> {
	const legacyEnvelope = { ...envelope } as ResultEnvelope<T> & Partial<T>;
	const legacyRecord = legacyEnvelope as Record<PropertyKey, unknown>;
	const data = envelope.data;

	if (data) {
		for (const key of keys) {
			if (Object.hasOwn(data, key)) {
				legacyRecord[key] = data[key];
			}
		}
	}

	return legacyEnvelope;
}

export function stringifyEnvelope(envelope: ResultEnvelope<unknown>): string {
	return JSON.stringify(envelope);
}
