import { describe, expect, test } from "bun:test";
import type { TelemetryEvent } from "../services/events/telemetry";
import { normalizeObservationRecord } from "../services/evolution/observation-model";
import {
	observationFromEvidence,
	observationFromFeedback,
	observationFromTelemetry,
} from "../services/evolution/observation-sources";
import type { FeedbackReport } from "../services/feedback";

const CONTEXT = {
	projectId: "6b7d91ca-496b-4f0c-8537-5c4993810d15",
	sessionId: "S-01",
	productionDaySequence: 2,
	taskType: "bug_fix",
};

describe("evolution observation source adapters", () => {
	test("normalizes only failed telemetry and keeps stable source evidence", () => {
		const event: TelemetryEvent = {
			schema_version: "1",
			id: "TEL-01",
			ts: "2026-07-17T00:00:00.000Z",
			source: "afol-cli",
			event_type: "tool_exec",
			session_id: "S-01",
			cmd_type: "bun",
			outcome: "success",
		};
		expect(observationFromTelemetry(event, CONTEXT)).toBeNull();
		const failed = observationFromTelemetry(
			{ ...event, outcome: "failure" },
			CONTEXT,
		);
		expect(failed).not.toBeNull();
		const record = normalizeObservationRecord(
			failed as NonNullable<typeof failed>,
		);
		expect(record).toMatchObject({
			kind: "tool_failure",
			session_id: "S-01",
			production_day_sequence: 2,
		});
		expect(record.source_refs[0]).toMatchObject({
			id: "TEL-01",
			kind: "telemetry",
		});
		expect(record.source_refs[0]?.digest).toHaveLength(64);
	});

	test("uses a redacted command signature for failed evidence", () => {
		const input = observationFromEvidence(
			{
				id: "E-01",
				created_at: "2026-07-17T00:00:00.000Z",
				result: "failed",
				exit_code: 1,
				command: "OPENAI_API_KEY=sk-secret-value bun test --filter unsafe",
				test: "suite/a",
			},
			CONTEXT,
		);
		expect(input).not.toBeNull();
		const record = normalizeObservationRecord(
			input as NonNullable<typeof input>,
		);
		expect(record.kind).toBe("test_failure");
		expect(record.normalized_fields.command).toBe("bun test --filter unsafe");
		expect(JSON.stringify(record)).not.toContain("sk-secret-value");
		expect(record.id).toBe(
			normalizeObservationRecord(
				observationFromEvidence(
					{
						id: "E-01",
						created_at: "2026-07-17T00:00:00.000Z",
						result: "failed",
						exit_code: 1,
						command:
							"OPENAI_API_KEY=a-different-secret bun test --filter unsafe",
						test: "suite/a",
					},
					CONTEXT,
				) as NonNullable<ReturnType<typeof observationFromEvidence>>,
			).id,
		);
		const changedSensitiveFields = normalizeObservationRecord(
			observationFromEvidence(
				{
					id: "E-01",
					created_at: "2026-07-17T00:00:00.000Z",
					result: "failed",
					exit_code: 1,
					command: "OPENAI_API_KEY=REDACTION_CANARY_456789 bun test",
					test: "REDACTION_CANARY_567890",
					error_code: [
						"Authorization:",
						"Bearer",
						"REDACTION_CANARY_678901",
					].join(" "),
				},
				CONTEXT,
			) as NonNullable<ReturnType<typeof observationFromEvidence>>,
		);
		expect(changedSensitiveFields.normalized_fields.error_code).toBe(
			"authorization=<redacted>",
		);
	});

	test("separates meaningful bun command families while normalizing equivalent forms", () => {
		const make = (command: string) =>
			normalizeObservationRecord(
				observationFromEvidence(
					{
						id: "E-02",
						created_at: "2026-07-17T00:00:00.000Z",
						result: "failed",
						exit_code: 1,
						command,
					},
					CONTEXT,
				) as NonNullable<ReturnType<typeof observationFromEvidence>>,
			);
		const test = make("TOKEN=secret bun test cli/tests/a.test.ts");
		const check = make("bun run check --trace-id 123456789");
		const build = make("bun run build /private/path");
		expect(
			new Set([test.fingerprint, check.fingerprint, build.fingerprint]).size,
		).toBe(3);
		expect(make("TOKEN=other bun   test cli/tests/a.test.ts").fingerprint).toBe(
			test.fingerprint,
		);
		expect(JSON.stringify(build)).not.toContain("/private/path");
	});

	test("converts already-redacted linked feedback without persisting its message", () => {
		const report: FeedbackReport = {
			report_id: "FB-01",
			created_at: "2026-07-17T00:00:00.000Z",
			kind: "user-correction",
			message: "do not persist this free text",
			error_code: "DOC_STALE",
			metadata: {},
			stack_digest: null,
			last_note: null,
			last_note_at: null,
		};
		const record = normalizeObservationRecord(
			observationFromFeedback(report, CONTEXT),
		);
		expect(record.kind).toBe("user_correction");
		expect(record.impact).toBe("user correction required");
		expect(JSON.stringify(record)).not.toContain(report.message);
	});
});
