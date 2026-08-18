type CapturedOutput = {
	stdout: string;
	stderr: string;
};

/** Measure only user-visible stdout and stderr from measured samples. */
export function maxSampleOutputBytes(
	samples: ReadonlyArray<CapturedOutput>,
): number {
	return samples.reduce(
		(maximum, sample) =>
			Math.max(
				maximum,
				Buffer.byteLength(sample.stdout, "utf8") +
					Buffer.byteLength(sample.stderr, "utf8"),
			),
		0,
	);
}
