const DIAGNOSTIC_LIMIT = 512;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

type JsonObject = Record<string, unknown>;

export type CompiledHotPathBenchmarkSummary = {
	resultCount: number;
	passed: number;
	artifactSha256: string;
};

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactText(value: unknown): string {
	let text: string;
	if (typeof value === "string") {
		text = value.trim();
	} else {
		try {
			text = JSON.stringify(value) ?? "";
		} catch {
			text = String(value ?? "");
		}
	}
	if (text.length <= DIAGNOSTIC_LIMIT) return text || "<empty>";
	return `${text.slice(0, DIAGNOSTIC_LIMIT)}…`;
}

function payloadDiagnostic(payload: unknown): string {
	if (!isObject(payload)) return `payload=${compactText(payload)}`;
	const summary = isObject(payload.summary) ? payload.summary : undefined;
	const results = Array.isArray(payload.results) ? payload.results : undefined;
	const resultIds = results
		?.slice(0, 3)
		.map((result) => (isObject(result) ? result.scenario_id : undefined))
		.filter(
			(scenarioId): scenarioId is string => typeof scenarioId === "string",
		)
		.join(",");
	return [
		`status=${compactText(payload.status)}`,
		`pass=${compactText(payload.pass)}`,
		`result_count=${compactText(payload.result_count)}`,
		`summary=${compactText(summary)}`,
		`results=${results?.length ?? "invalid"}`,
		resultIds ? `scenario_ids=${resultIds}` : "",
	]
		.filter(Boolean)
		.join(" ");
}

function fail(message: string, payload: unknown): never {
	throw new Error(
		`compiled hot-path benchmark gate failed: ${message}; ${payloadDiagnostic(payload)}`,
	);
}

function requiredInteger(
	value: unknown,
	field: string,
	payload: unknown,
): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		fail(`${field} must be a non-negative integer`, payload);
	}
	return value;
}

export function assertCompiledHotPathBenchmark(
	stdout: string,
	expectedScenarioIds: ReadonlySet<string>,
	expectedArtifactSha256: string,
): CompiledHotPathBenchmarkSummary {
	if (
		expectedScenarioIds.size === 0 ||
		[...expectedScenarioIds].some((scenarioId) => scenarioId.trim() === "")
	) {
		throw new Error(
			"compiled hot-path benchmark gate failed: expected scenario-id set is empty or invalid",
		);
	}
	if (!SHA256_PATTERN.test(expectedArtifactSha256)) {
		throw new Error(
			`compiled hot-path benchmark gate failed: invalid candidate SHA-256 ${compactText(expectedArtifactSha256)}`,
		);
	}

	let payload: unknown;
	try {
		payload = JSON.parse(stdout) as unknown;
	} catch {
		throw new Error(
			`compiled hot-path benchmark gate failed: invalid JSON; stdout=${compactText(stdout)}`,
		);
	}
	if (!isObject(payload)) fail("payload must be an object", payload);

	if (
		!Array.isArray(payload.selected_pack_ids) ||
		payload.selected_pack_ids.length !== 1 ||
		payload.selected_pack_ids[0] !== "workbench-parity"
	) {
		fail("workbench-parity must be the only selected pack", payload);
	}
	if (payload.status !== "passed" || payload.pass !== true) {
		fail("benchmark did not report passed", payload);
	}
	if (!isObject(payload.summary)) fail("summary is missing", payload);

	const resultCount = requiredInteger(
		payload.result_count,
		"result_count",
		payload,
	);
	const total = requiredInteger(
		payload.summary.total,
		"summary.total",
		payload,
	);
	const passed = requiredInteger(
		payload.summary.passed,
		"summary.passed",
		payload,
	);
	const failed = requiredInteger(
		payload.summary.failed,
		"summary.failed",
		payload,
	);
	const skipped = requiredInteger(
		payload.summary.skipped,
		"summary.skipped",
		payload,
	);
	const baselineMissing = requiredInteger(
		payload.summary.baseline_missing,
		"summary.baseline_missing",
		payload,
	);
	if (
		resultCount === 0 ||
		total === 0 ||
		resultCount !== total ||
		passed !== total ||
		failed !== 0 ||
		skipped !== 0 ||
		baselineMissing !== 0
	) {
		fail("results are empty or the benchmark has failures", payload);
	}
	if (
		!Array.isArray(payload.results) ||
		payload.results.length !== resultCount
	) {
		fail("results do not match result_count", payload);
	}

	const parsedResults: JsonObject[] = [];
	const resultIds: string[] = [];
	for (const [index, result] of payload.results.entries()) {
		if (!isObject(result)) fail(`result ${index + 1} is invalid`, payload);
		if (
			typeof result.scenario_id !== "string" ||
			result.scenario_id.trim() === ""
		) {
			fail(`result ${index + 1} has no scenario id`, payload);
		}
		parsedResults.push(result);
		resultIds.push(result.scenario_id);
	}
	const observedScenarioIds = new Set(resultIds);
	const duplicateScenarioIds = resultIds.filter(
		(scenarioId, index) => resultIds.indexOf(scenarioId) !== index,
	);
	const unknownScenarioIds = [...observedScenarioIds].filter(
		(scenarioId) => !expectedScenarioIds.has(scenarioId),
	);
	const missingScenarioIds = [...expectedScenarioIds].filter(
		(scenarioId) => !observedScenarioIds.has(scenarioId),
	);
	if (
		observedScenarioIds.size !== expectedScenarioIds.size ||
		duplicateScenarioIds.length > 0 ||
		unknownScenarioIds.length > 0 ||
		missingScenarioIds.length > 0
	) {
		fail(
			[
				"scenario-id set mismatch",
				`missing=${compactText(missingScenarioIds)}`,
				`duplicate=${compactText([...new Set(duplicateScenarioIds)])}`,
				`unknown=${compactText(unknownScenarioIds)}`,
			].join(" "),
			payload,
		);
	}

	for (const [index, result] of parsedResults.entries()) {
		if (
			result.pack_id !== "workbench-parity" ||
			result.status !== "passed" ||
			result.pass !== true
		) {
			fail(
				`result ${index + 1} is not passed workbench-parity coverage`,
				payload,
			);
		}
		if (
			typeof result.duration_ms !== "number" ||
			!Number.isFinite(result.duration_ms) ||
			result.duration_ms <= 0 ||
			typeof result.sample_count !== "number" ||
			!Number.isInteger(result.sample_count) ||
			result.sample_count <= 0 ||
			result.error_count !== 0
		) {
			fail(`result ${index + 1} has no meaningful measurements`, payload);
		}
		if (result.execution_mode !== "compiled-release") {
			fail(`result ${index + 1} is not compiled-release`, payload);
		}
		if (result.artifact_mode !== "bun-compile") {
			fail(`result ${index + 1} is not bun-compile`, payload);
		}
		if (result.artifact_sha256 !== expectedArtifactSha256) {
			fail(
				`result ${index + 1} artifact hash does not match candidate`,
				payload,
			);
		}
	}

	return {
		resultCount,
		passed,
		artifactSha256: expectedArtifactSha256,
	};
}
