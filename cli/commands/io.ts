import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";

export type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

export const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type LegacyJsonEnvelopeOptions = {
	ok?: boolean;
	errorCode?: string;
	errorMessage?: string;
	exitCode?: number;
};

export function writeLegacyJsonEnvelope<T extends Record<string, unknown>>(
	io: CommandIo,
	action: string,
	data: T,
	options: LegacyJsonEnvelopeOptions = {},
): void {
	const ok = options.ok ?? true;
	const exitCode = options.exitCode ?? (ok ? 0 : 1);
	const envelope = ok
		? envelopeOk(data, { action, exitCode })
		: (envelopeErr(
				options.errorCode ?? "COMMAND_FAILED",
				options.errorMessage ?? "command failed",
				{ action, exitCode },
			) as ResultEnvelope<T>);
	envelope.data = data;
	io.stdout(
		stringifyEnvelope(
			envelopeWithLegacyKeys(envelope, Object.keys(data) as (keyof T)[]),
		),
	);
}

export function createJsonWriters(scope: string): {
	ok: <T extends Record<string, unknown>>(
		io: CommandIo,
		action: string,
		data: T,
		legacyKeys?: readonly (keyof T)[],
	) => void;
	err: (
		io: CommandIo,
		action: string,
		code: string,
		message: string,
		exitCode: 1 | 2,
	) => void;
} {
	return {
		ok: (io, action, data, legacyKeys = []) => {
			io.stdout(
				stringifyEnvelope(
					envelopeWithLegacyKeys(
						envelopeOk(data, { action: `${scope}.${action}` }),
						legacyKeys,
					),
				),
			);
		},
		err: (io, action, code, message, exitCode) => {
			io.stdout(
				stringifyEnvelope(
					envelopeErr(code, message, {
						action: `${scope}.${action}`,
						exitCode,
					}),
				),
			);
		},
	};
}
