import { describe, expect, test } from "bun:test";
import {
	agentOperationContext,
	defaultOperationContext,
	remoteOperationContext,
} from "../core/operation-context";
import {
	assertRecurrenceAuthority,
	dispatchRecurrenceDecision,
	recurrenceDecisionForAuthority,
	recurrenceObservationMembershipDigest,
} from "../services/evolution/recurrence-authority";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
const BASE = {
	projectId: PROJECT_ID,
	fingerprintVersion: 1,
	fingerprint: "error:E42",
	action: "confirm" as const,
	observationIds: ["OBS-2", "OBS-1"],
	sourceDecisionRef: "DEC-source-1",
	operationContext: defaultOperationContext(),
	decisionId: "DEC-recurrence-1",
	timestamp: "2026-07-17T00:00:00.000Z",
};

describe("evolution recurrence decision authority", () => {
	test("normalizes observation membership and binds the decision", () => {
		const authority = dispatchRecurrenceDecision(BASE);
		const decision = recurrenceDecisionForAuthority(authority);
		expect(decision).toMatchObject({
			id: "DEC-recurrence-1",
			projectId: PROJECT_ID,
			fingerprintVersion: 1,
			fingerprint: "error:E42",
			action: "confirm",
			sourceDecisionRef: "DEC-source-1",
			timestamp: "2026-07-17T00:00:00.000Z",
		});
		expect(decision.observationIds).toEqual(["OBS-1", "OBS-2"]);
		expect(decision.observationMembershipDigest).toBe(
			recurrenceObservationMembershipDigest(["OBS-2", "OBS-1"]),
		);
		assertRecurrenceAuthority(authority, PROJECT_ID, "project_user", {
			fingerprintVersion: 1,
			fingerprint: "error:E42",
			action: "confirm",
			observationIds: ["OBS-1", "OBS-2"],
			observationMembershipDigest: decision.observationMembershipDigest,
			sourceDecisionRef: "DEC-source-1",
		});
	});

	test("rejects restricted or remote dispatchers", () => {
		for (const operationContext of [
			agentOperationContext(),
			remoteOperationContext(),
		]) {
			expect(() =>
				dispatchRecurrenceDecision({ ...BASE, operationContext }),
			).toThrow("trusted local interactive context");
		}
	});

	test("rejects a structurally forged trusted operation context", () => {
		expect(() =>
			dispatchRecurrenceDecision({
				...BASE,
				operationContext: {
					callerType: "local",
					interactive: true,
					trustLevel: "trusted",
				},
			}),
		).toThrow("not admitted by the CLI boundary");
	});

	test("rejects forged capabilities and mismatched membership", () => {
		const authority = dispatchRecurrenceDecision(BASE);
		const forged = { ...authority };
		expect(() =>
			assertRecurrenceAuthority(forged, PROJECT_ID, "project_user"),
		).toThrow("admitted project_user authority");
		expect(() =>
			assertRecurrenceAuthority(authority, PROJECT_ID, "project_user", {
				fingerprintVersion: 1,
				fingerprint: "error:E42",
				action: "confirm",
				observationIds: ["OBS-1", "OBS-other"],
				sourceDecisionRef: "DEC-source-1",
			}),
		).toThrow("does not match mutation");
	});

	test("rejects duplicate observations and invalid actions", () => {
		expect(() =>
			dispatchRecurrenceDecision({
				...BASE,
				observationIds: ["OBS-1", "OBS-1"],
			}),
		).toThrow("must be unique");
		expect(() =>
			dispatchRecurrenceDecision({
				...BASE,
				action: "approve" as never,
			}),
		).toThrow("action is invalid");
	});

	test.each([
		"confirm",
		"dismiss",
		"reopen",
	] as const)("accepts the %s decision action", (action) => {
		const authority = dispatchRecurrenceDecision({ ...BASE, action });
		expect(recurrenceDecisionForAuthority(authority).action).toBe(action);
	});
});
