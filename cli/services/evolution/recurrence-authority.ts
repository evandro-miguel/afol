import { createHash, randomUUID } from "node:crypto";
import {
	assertAdmittedOperationContext,
	type OperationContext,
} from "../../core/operation-context";
import { validateEvolutionIdentity } from "./config";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CAPABILITIES = new WeakMap<object, InternalCapability>();

export type RecurrenceDecisionAction = "confirm" | "dismiss" | "reopen";

export type RecurrenceDecisionIntent = {
	id: string;
	projectId: string;
	fingerprintVersion: number;
	fingerprint: string;
	action: RecurrenceDecisionAction;
	observationIds: readonly string[];
	observationMembershipDigest: string;
	sourceDecisionRef: string;
	timestamp: string;
};

export type RecurrenceMutationBinding = Pick<
	RecurrenceDecisionIntent,
	| "fingerprintVersion"
	| "fingerprint"
	| "action"
	| "observationIds"
	| "sourceDecisionRef"
> & {
	readonly observationMembershipDigest?: string;
};

export type RecurrenceAuthorityCapability = {
	readonly projectId: string;
	readonly kind: "project_user";
};

type InternalCapability = {
	projectId: string;
	kind: RecurrenceAuthorityCapability["kind"];
	decision: RecurrenceDecisionIntent;
};

export function recurrenceObservationMembershipDigest(
	observationIds: readonly string[],
): string {
	const sorted = normalizeObservationIds(observationIds);
	return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export function recurrenceDecisionDigest(
	decision: RecurrenceDecisionIntent,
): string {
	const stable = JSON.stringify(
		Object.fromEntries(
			Object.entries(decision).sort(([left], [right]) =>
				left.localeCompare(right),
			),
		),
	);
	return createHash("sha256").update(stable).digest("hex");
}

function capability(
	projectId: string,
	decision: RecurrenceDecisionIntent,
): RecurrenceAuthorityCapability {
	validateEvolutionIdentity({ projectId, timezone: "UTC" });
	const value = Object.freeze({ projectId, kind: "project_user" as const });
	CAPABILITIES.set(value, {
		projectId,
		kind: "project_user",
		decision: Object.freeze({
			...decision,
			observationIds: Object.freeze([...decision.observationIds]),
		}),
	});
	return value;
}

/** Dispatcher boundary; callers must provide a trusted local interactive context. */
export function dispatchRecurrenceDecision(input: {
	projectId: string;
	fingerprintVersion: number;
	fingerprint: string;
	action: RecurrenceDecisionAction;
	observationIds: readonly string[];
	sourceDecisionRef: string;
	operationContext: OperationContext;
	decisionId?: string;
	timestamp?: string;
}): RecurrenceAuthorityCapability {
	assertTrustedInteractiveContext(input.operationContext);
	validateEvolutionIdentity({ projectId: input.projectId, timezone: "UTC" });
	if (
		!Number.isInteger(input.fingerprintVersion) ||
		input.fingerprintVersion < 1
	)
		throw new Error("recurrence fingerprint version is invalid");
	if (!ID_RE.test(input.fingerprint))
		throw new Error("recurrence fingerprint is invalid");
	if (!ID_RE.test(input.sourceDecisionRef))
		throw new Error("recurrence source decision ref is invalid");
	if (!("confirm dismiss reopen".split(" ") as string[]).includes(input.action))
		throw new Error("recurrence decision action is invalid");
	const observationIds = normalizeObservationIds(input.observationIds);
	const timestamp = (input.timestamp ?? new Date().toISOString()).trim();
	if (Number.isNaN(Date.parse(timestamp)))
		throw new Error("recurrence decision timestamp is invalid");
	const id = input.decisionId ?? `DEC-${randomUUID()}`;
	if (!ID_RE.test(id)) throw new Error("recurrence decision id is invalid");
	const decision: RecurrenceDecisionIntent = {
		id,
		projectId: input.projectId,
		fingerprintVersion: input.fingerprintVersion,
		fingerprint: input.fingerprint,
		action: input.action,
		observationIds,
		observationMembershipDigest:
			recurrenceObservationMembershipDigest(observationIds),
		sourceDecisionRef: input.sourceDecisionRef,
		timestamp: new Date(timestamp).toISOString(),
	};
	return capability(input.projectId, decision);
}

function assertTrustedInteractiveContext(context: OperationContext): void {
	assertAdmittedOperationContext(context);
	if (
		context.callerType !== "local" ||
		!context.interactive ||
		context.trustLevel !== "trusted"
	)
		throw new Error(
			"recurrence authority requires a trusted local interactive context",
		);
}

export function assertRecurrenceAuthority(
	authority: RecurrenceAuthorityCapability | undefined,
	projectId: string,
	required: RecurrenceAuthorityCapability["kind"],
	binding?: RecurrenceMutationBinding,
): void {
	const admitted = authority ? CAPABILITIES.get(authority) : undefined;
	if (
		!admitted ||
		admitted.projectId !== projectId ||
		admitted.kind !== required
	)
		throw new Error(
			`recurrence mutation requires admitted ${required} authority`,
		);
	if (!binding) return;
	const decision = admitted.decision;
	if (
		decision.fingerprintVersion !== binding.fingerprintVersion ||
		decision.fingerprint !== binding.fingerprint ||
		decision.action !== binding.action ||
		decision.sourceDecisionRef !== binding.sourceDecisionRef ||
		decision.observationMembershipDigest !==
			recurrenceObservationMembershipDigest(binding.observationIds)
	)
		throw new Error("recurrence authority decision does not match mutation");
	if (
		binding.observationMembershipDigest !== undefined &&
		decision.observationMembershipDigest !== binding.observationMembershipDigest
	)
		throw new Error(
			"recurrence authority observation membership does not match",
		);
}

export function recurrenceDecisionForAuthority(
	authority: RecurrenceAuthorityCapability,
): RecurrenceDecisionIntent {
	const admitted = CAPABILITIES.get(authority);
	if (!admitted) throw new Error("recurrence authority decision is missing");
	return admitted.decision;
}

function normalizeObservationIds(observationIds: readonly string[]): string[] {
	if (!Array.isArray(observationIds) || observationIds.length === 0)
		throw new Error("recurrence observation ids are required");
	const sorted = [...observationIds].map((id) => id.trim()).sort();
	if (sorted.some((id) => !ID_RE.test(id)))
		throw new Error("recurrence observation id is invalid");
	if (new Set(sorted).size !== sorted.length)
		throw new Error("recurrence observation ids must be unique");
	return sorted;
}
