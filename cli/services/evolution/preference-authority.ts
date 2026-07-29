import { createHash, randomUUID } from "node:crypto";
import type { OperationContext } from "../../core/operation-context";
import { validateEvolutionIdentity } from "./config";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CAPABILITIES = new WeakMap<object, InternalCapability>();

export type PreferenceDecisionIntent = {
	id: string;
	projectId: string;
	preferenceId: string;
	action: PreferenceMutationBinding["action"];
	provenance: PreferenceMutationBinding["provenance"];
	actor: "project_user" | "policy";
	timestamp: string;
};

export type PreferenceMutationBinding = {
	preferenceId: string;
	action: "create" | "reinforce" | "contradict" | "reject" | "reopen";
	provenance: "explicit" | "inferred" | "structural";
};

export type PreferenceAuthorityCapability = {
	readonly projectId: string;
	readonly kind: "project_user" | "policy" | "observer";
};

type InternalCapability = {
	projectId: string;
	kind: PreferenceAuthorityCapability["kind"];
	decision?: PreferenceDecisionIntent;
};

export function preferenceDecisionDigest(
	decision: PreferenceDecisionIntent,
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
	kind: PreferenceAuthorityCapability["kind"],
	decision?: PreferenceDecisionIntent,
): PreferenceAuthorityCapability {
	validateEvolutionIdentity({ projectId, timezone: "UTC" });
	const value = Object.freeze({
		projectId,
		kind,
	});
	CAPABILITIES.set(value, {
		projectId,
		kind,
		...(decision ? { decision: Object.freeze({ ...decision }) } : {}),
	});
	return value;
}

/** Dispatcher boundary; callers must provide a trusted local interactive context. */
export function dispatchPreferenceDecision(input: {
	projectId: string;
	preferenceId: string;
	action: PreferenceMutationBinding["action"];
	provenance: PreferenceMutationBinding["provenance"];
	operationContext: OperationContext;
	decisionId?: string;
	timestamp?: string;
}): PreferenceAuthorityCapability {
	assertTrustedInteractiveContext(input.operationContext);
	if (!ID_RE.test(input.projectId) || !ID_RE.test(input.preferenceId))
		throw new Error("preference decision identifiers are invalid");
	if (
		!(
			"create reinforce contradict reject reopen".split(" ") as string[]
		).includes(input.action)
	)
		throw new Error("preference decision action is invalid");
	if (!["explicit", "inferred", "structural"].includes(input.provenance))
		throw new Error("preference decision provenance is invalid");
	if (input.action === "reopen" && input.provenance === "structural")
		throw new Error("policy cannot reopen a preference");
	const actor = input.provenance === "structural" ? "policy" : "project_user";
	const timestamp = (input.timestamp ?? new Date().toISOString()).trim();
	if (Number.isNaN(Date.parse(timestamp)))
		throw new Error("preference decision timestamp is invalid");
	const decision: PreferenceDecisionIntent = {
		id: input.decisionId ?? `DEC-${randomUUID()}`,
		projectId: input.projectId,
		preferenceId: input.preferenceId,
		action: input.action,
		provenance: input.provenance,
		actor,
		timestamp: new Date(timestamp).toISOString(),
	};
	if (!ID_RE.test(decision.id))
		throw new Error("preference decision id is invalid");
	return capability(input.projectId, actor, decision);
}

function assertTrustedInteractiveContext(context: OperationContext): void {
	if (
		context.callerType !== "local" ||
		!context.interactive ||
		context.trustLevel !== "trusted"
	)
		throw new Error(
			"preference authority requires a trusted local interactive context",
		);
}

export function assertPreferenceAuthority(
	authority: PreferenceAuthorityCapability | undefined,
	projectId: string,
	required: PreferenceAuthorityCapability["kind"],
	binding?: PreferenceMutationBinding,
): void {
	const admitted = authority ? CAPABILITIES.get(authority) : undefined;
	if (
		!admitted ||
		admitted.projectId !== projectId ||
		admitted.kind !== required
	)
		throw new Error(
			`preference mutation requires admitted ${required} authority`,
		);
	if (!admitted.decision)
		throw new Error("preference authority decision is missing");
	if (
		binding &&
		(admitted.decision.preferenceId !== binding.preferenceId ||
			admitted.decision.action !== binding.action ||
			admitted.decision.provenance !== binding.provenance)
	)
		throw new Error("preference authority decision does not match mutation");
}

export function preferenceDecisionForAuthority(
	authority: PreferenceAuthorityCapability,
): PreferenceDecisionIntent {
	const admitted = CAPABILITIES.get(authority);
	if (!admitted?.decision)
		throw new Error("preference authority decision is missing");
	return admitted.decision;
}
