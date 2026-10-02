import { describe, expect, test } from "bun:test";
import {
	agentOperationContext,
	defaultOperationContext,
	remoteOperationContext,
} from "../core/operation-context";
import {
	assertSuggestionAuthority,
	dispatchSuggestionDecision,
	MAX_SUGGESTION_REASON_LENGTH,
	redactSuggestionReason,
	suggestionDecisionForAuthority,
} from "../services/evolution/suggestion-authority";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const BASE = {
	projectId: PROJECT_ID,
	localDate: "2026-07-17",
	suggestionId: "SUG-abc123",
	evidenceDigest: "a".repeat(64),
	action: "accepted" as const,
	sourceDecisionRef: "DEC-suggestion-source",
	operationContext: defaultOperationContext(),
	decisionId: "DEC-suggestion-1",
	timestamp: "2026-07-17T00:00:00.000Z",
};

describe("evolution suggestion decision authority", () => {
	test("binds the complete accepted decision", () => {
		const authority = dispatchSuggestionDecision(BASE);
		const decision = suggestionDecisionForAuthority(authority);
		expect(decision).toEqual({
			id: "DEC-suggestion-1",
			projectId: PROJECT_ID,
			localDate: "2026-07-17",
			suggestionId: "SUG-abc123",
			evidenceDigest: "a".repeat(64),
			action: "accepted",
			sourceDecisionRef: "DEC-suggestion-source",
			timestamp: "2026-07-17T00:00:00.000Z",
		});
		assertSuggestionAuthority(authority, PROJECT_ID, "project_user", {
			localDate: decision.localDate,
			suggestionId: decision.suggestionId,
			evidenceDigest: decision.evidenceDigest,
			action: decision.action,
			sourceDecisionRef: decision.sourceDecisionRef,
		});
	});

	test("redacts and bounds a rejection reason", () => {
		const authority = dispatchSuggestionDecision({
			...BASE,
			action: "rejected",
			reason: "not suitable; token=top-secret; bearer abc123",
		});
		const decision = suggestionDecisionForAuthority(authority);
		expect(decision.reason).toBe(
			"not suitable; token=[REDACTED]; bearer [REDACTED]",
		);
		expect(() =>
			dispatchSuggestionDecision({
				...BASE,
				action: "rejected",
				reason: " ",
			}),
		).toThrow("requires a reason");
		expect(() =>
			dispatchSuggestionDecision({
				...BASE,
				action: "rejected",
				reason: "x".repeat(MAX_SUGGESTION_REASON_LENGTH + 1),
			}),
		).toThrow("exceeds limit");
	});

	test("redacts JSON keys, bearer values, flags, and sensitive query values", () => {
		const reason = redactSuggestionReason(
			[
				'{"token":"REDACTION_CANARY_1"} Authorization:',
				"Bearer",
				"REDACTION_CANARY_2 --token REDACTION_CANARY_3 https://invalid/?api_key=REDACTION_CANARY_4",
			].join(" "),
		);
		expect(reason?.toLowerCase()).not.toContain("redaction_canary");
	});

	test("redacts complete authorization headers for every scheme", () => {
		for (const value of [
			"Authorization: Basic REDACTION_CANARY_BASIC",
			'Authorization: Digest username="user", response="REDACTION_CANARY_DIGEST"',
			"Authorization: Custom REDACTION_CANARY_CUSTOM",
			"Authorization:\r\n Basic REDACTION_CANARY_FOLDED",
			"Authorization\0: Basic REDACTION_CANARY_CONTROL",
			"Authorization: [REDACTED] REDACTION_CANARY_PRETAGGED",
		]) {
			const reason = redactSuggestionReason(value);
			expect(reason).not.toContain("REDACTION_CANARY");
			expect(reason).toContain("[REDACTED]");
			expect(redactSuggestionReason(reason)).toBe(reason);
		}
	});

	test("rejects restricted, remote, and structurally forged contexts", () => {
		for (const operationContext of [
			agentOperationContext(),
			remoteOperationContext(),
		]) {
			expect(() =>
				dispatchSuggestionDecision({ ...BASE, operationContext }),
			).toThrow("trusted local interactive context");
		}
		expect(() =>
			dispatchSuggestionDecision({
				...BASE,
				operationContext: {
					callerType: "local",
					interactive: true,
					trustLevel: "trusted",
				},
			}),
		).toThrow("not admitted by the CLI boundary");
	});

	test("rejects forged capabilities and mismatched bindings", () => {
		const authority = dispatchSuggestionDecision(BASE);
		expect(() =>
			assertSuggestionAuthority({ ...authority }, PROJECT_ID, "project_user"),
		).toThrow("admitted project_user authority");
		expect(() =>
			assertSuggestionAuthority(authority, PROJECT_ID, "project_user", {
				localDate: BASE.localDate,
				suggestionId: "SUG-other",
				evidenceDigest: BASE.evidenceDigest,
				action: BASE.action,
				sourceDecisionRef: BASE.sourceDecisionRef,
			}),
		).toThrow("does not match mutation");
	});

	test.each([
		"skipped",
		"accepted",
		"rejected",
	] as const)("accepts the %s action", (action) => {
		const authority = dispatchSuggestionDecision({
			...BASE,
			action,
			...(action === "rejected" ? { reason: "wrong priority" } : {}),
		});
		expect(suggestionDecisionForAuthority(authority).action).toBe(action);
	});
});
