import { createHash, randomUUID } from "node:crypto";
import {
	assertAdmittedOperationContext,
	type OperationContext,
} from "../../core/operation-context";
import { validateEvolutionIdentity } from "./config";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;
export const MAX_SUGGESTION_REASON_LENGTH = 240;
const CONTROL_CHARACTER = /\p{Cc}/gu;
const AUTHORIZATION_HEADER = /\b(authorization\s*:)[^\r\n]*/gi;
const SECRET_VALUE = /\b(bearer\s+)[^\s,;]+/gi;
const KEYED_SECRET =
	/(token|password|passphrase|pwd|secret|cookie|authorization|api[_-]?key|credential|private[_-]?key|salt|cert(?:ificate)?|jwt)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const JSON_SECRET =
	/(["']?(?:token|password|passphrase|pwd|secret|cookie|authorization|api[_-]?key|credential|private[_-]?key|salt|cert(?:ificate)?|jwt)["']?\s*:\s*)(["'])[^"']*\2/gi;
const SENSITIVE_FLAG =
	/(--(?:api[_-]?key|access[_-]?token|authorization|password|secret|token))\s+[^\s,;]+/gi;
const SENSITIVE_QUERY =
	/([?&](?:api[_-]?key|access[_-]?token|authorization|password|secret|token)=)[^&#\s]+/gi;
const CAPABILITIES = new WeakMap<object, InternalCapability>();

export type SuggestionDecisionAction = "skipped" | "accepted" | "rejected";

export type SuggestionDecisionIntent = {
	id: string;
	projectId: string;
	localDate: string;
	suggestionId: string;
	evidenceDigest: string;
	action: SuggestionDecisionAction;
	reason?: string;
	sourceDecisionRef: string;
	timestamp: string;
};

export type SuggestionMutationBinding = Pick<
	SuggestionDecisionIntent,
	| "localDate"
	| "suggestionId"
	| "evidenceDigest"
	| "action"
	| "sourceDecisionRef"
> & { readonly reason?: string };

export type SuggestionAuthorityCapability = {
	readonly projectId: string;
	readonly kind: "project_user";
};

type InternalCapability = {
	projectId: string;
	kind: SuggestionAuthorityCapability["kind"];
	decision: SuggestionDecisionIntent;
};

export function redactSuggestionReason(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string")
		throw new Error("suggestion decision reason is invalid");
	const reason = value
		.replace(CONTROL_CHARACTER, " ")
		.replace(AUTHORIZATION_HEADER, "$1 [REDACTED]")
		.replace(JSON_SECRET, '$1"[REDACTED]"')
		.replace(SECRET_VALUE, "$1[REDACTED]")
		.replace(SENSITIVE_FLAG, "$1 [REDACTED]")
		.replace(SENSITIVE_QUERY, "$1[REDACTED]")
		.replace(KEYED_SECRET, "$1$2[REDACTED]")
		.replace(/\s+/g, " ")
		.trim();
	if (reason.length === 0) return undefined;
	if (reason.length > MAX_SUGGESTION_REASON_LENGTH)
		throw new Error("suggestion decision reason exceeds limit");
	return reason;
}

export function suggestionDecisionDigest(
	decision: SuggestionDecisionIntent,
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

function validateLocalDate(localDate: string): void {
	if (!DATE_RE.test(localDate))
		throw new Error("suggestion decision local date is invalid");
	const date = new Date(`${localDate}T00:00:00.000Z`);
	if (date.toISOString().slice(0, 10) !== localDate)
		throw new Error("suggestion decision local date is invalid");
}

function capability(
	projectId: string,
	decision: SuggestionDecisionIntent,
): SuggestionAuthorityCapability {
	validateEvolutionIdentity({ projectId, timezone: "UTC" });
	const value = Object.freeze({ projectId, kind: "project_user" as const });
	CAPABILITIES.set(value, {
		projectId,
		kind: "project_user",
		decision: Object.freeze({ ...decision }),
	});
	return value;
}

/** Dispatcher boundary; callers must provide a trusted local interactive context. */
export function dispatchSuggestionDecision(input: {
	projectId: string;
	localDate: string;
	suggestionId: string;
	evidenceDigest: string;
	action: SuggestionDecisionAction;
	reason?: string;
	sourceDecisionRef: string;
	operationContext: OperationContext;
	decisionId?: string;
	timestamp?: string;
}): SuggestionAuthorityCapability {
	assertTrustedInteractiveContext(input.operationContext);
	validateEvolutionIdentity({ projectId: input.projectId, timezone: "UTC" });
	if (!ID_RE.test(input.suggestionId))
		throw new Error("suggestion decision suggestion id is invalid");
	if (!DIGEST_RE.test(input.evidenceDigest))
		throw new Error("suggestion decision evidence digest is invalid");
	if (!ID_RE.test(input.sourceDecisionRef))
		throw new Error("suggestion decision source ref is invalid");
	validateLocalDate(input.localDate);
	if (
		!("skipped accepted rejected".split(" ") as string[]).includes(input.action)
	)
		throw new Error("suggestion decision action is invalid");
	const reason = redactSuggestionReason(input.reason);
	if (input.action === "rejected" && !reason)
		throw new Error("rejected suggestion requires a reason");
	const timestamp = (input.timestamp ?? new Date().toISOString()).trim();
	if (Number.isNaN(Date.parse(timestamp)))
		throw new Error("suggestion decision timestamp is invalid");
	const id = input.decisionId ?? `DEC-${randomUUID()}`;
	if (!ID_RE.test(id)) throw new Error("suggestion decision id is invalid");
	const decision: SuggestionDecisionIntent = {
		id,
		projectId: input.projectId,
		localDate: input.localDate,
		suggestionId: input.suggestionId,
		evidenceDigest: input.evidenceDigest,
		action: input.action,
		...(reason ? { reason } : {}),
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
			"suggestion authority requires a trusted local interactive context",
		);
}

export function assertSuggestionAuthority(
	authority: SuggestionAuthorityCapability | undefined,
	projectId: string,
	required: SuggestionAuthorityCapability["kind"],
	binding?: SuggestionMutationBinding,
): void {
	const admitted = authority ? CAPABILITIES.get(authority) : undefined;
	if (
		!admitted ||
		admitted.projectId !== projectId ||
		admitted.kind !== required
	)
		throw new Error(
			`suggestion mutation requires admitted ${required} authority`,
		);
	if (!binding) return;
	const decision = admitted.decision;
	const reason = redactSuggestionReason(binding.reason);
	if (
		decision.localDate !== binding.localDate ||
		decision.suggestionId !== binding.suggestionId ||
		decision.evidenceDigest !== binding.evidenceDigest ||
		decision.action !== binding.action ||
		decision.sourceDecisionRef !== binding.sourceDecisionRef ||
		decision.reason !== reason
	)
		throw new Error("suggestion authority decision does not match mutation");
	if (binding.action === "rejected" && !reason)
		throw new Error("rejected suggestion requires a reason");
}

export function suggestionDecisionForAuthority(
	authority: SuggestionAuthorityCapability,
): SuggestionDecisionIntent {
	const admitted = CAPABILITIES.get(authority);
	if (!admitted) throw new Error("suggestion authority decision is missing");
	return admitted.decision;
}
