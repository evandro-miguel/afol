import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { listSkills } from "../catalog/skills";
import { readBoundedSourceFile } from "../io/safe-source";
import { readProjectConfig, resolveProjectPaths } from "../project/paths";
import {
	type AssistedProposalEvent,
	proposalPreparedEvent,
	proposalVersionEvents,
	readAssistedProposalJournal,
} from "./assisted-proposal-journal";
import {
	distinctLocalProductionDays,
	readProductionDayJournal,
} from "./journal";
import type { ContextLessonEntry } from "./lesson-records";
import {
	lessonMatchesRequest,
	type readLessonRecords,
	resolveLessonVersionForAdoption,
} from "./lesson-records";
import { preferenceFreshness } from "./preference-decay";
import { resolveEvolutionConfig } from "./runtime-config";

const MAX_GUIDANCE_ITEMS = 16;
const MAX_OMITTED_GUIDANCE = 16;

export type ApprovedContextGuidance = {
	proposal_id: string;
	version_digest: string;
	kind:
		| "skill_discovery"
		| "lesson_adoption"
		| "contextual_preference"
		| "durable_decision"
		| "durable_restriction";
	approved_at: string;
	applied_at: string;
	operation_index: number;
	target?: string;
	statement?: string;
	scope?: string;
	lesson?: ContextLessonEntry & {
		version_id: string;
		field_set_digest: string;
	};
	production_day_age?: number;
	preference_freshness?: number;
};

export type AssistedContextGuidance = {
	items: ApprovedContextGuidance[];
	lesson_versions: Array<{
		lesson_id: string;
		version_id: string;
		field_set_digest: string;
		proposal_id: string;
		version_digest: string;
	}>;
	contextual_preference_health: "not_present" | "healthy" | "unknown";
	current_production_day?: number;
	omitted: Array<{
		proposal_id: string;
		reason: string;
		reconfirmation_required?: boolean;
	}>;
	omitted_count: number;
	mandatory_omitted: boolean;
	truncated: boolean;
};

type AppliedProposal = {
	prepared: AssistedProposalEvent;
	decision: AssistedProposalEvent;
	applied: AssistedProposalEvent;
};

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function operationList(preview: unknown): Record<string, unknown>[] {
	const operations = record(record(preview)?.intervention)?.operations;
	return Array.isArray(operations)
		? operations.flatMap((operation) => {
				const parsed = record(operation);
				return parsed ? [parsed] : [];
			})
		: [];
}

function approvedAppliedProposals(
	events: readonly AssistedProposalEvent[],
): AppliedProposal[] {
	const applied: AppliedProposal[] = [];
	for (const event of events) {
		if (event.event_type !== "applied") continue;
		const prepared = proposalPreparedEvent(
			events,
			event.proposal_id,
			event.version_digest,
		);
		if (!prepared) continue;
		const versionEvents = proposalVersionEvents(
			events,
			event.proposal_id,
			event.version_digest,
		);
		const decision = versionEvents.findLast(
			(candidate) => candidate.event_type === "decision",
		);
		if (decision?.payload.decision !== "approve") continue;
		if (versionEvents.some((candidate) => candidate.event_type === "revoked"))
			continue;
		applied.push({ prepared, decision, applied: event });
	}
	return applied;
}

function inRequestedScope(
	scope: string | undefined,
	request: { filePath?: string; surface: string; role: string },
): boolean {
	const normalized = scope?.trim().replaceAll("\\", "/").toLowerCase();
	if (!normalized || normalized === "project") return true;
	const file = request.filePath?.replaceAll("\\", "/").toLowerCase();
	if (file && (file === normalized || file.startsWith(`${normalized}/`)))
		return true;
	return [request.surface, request.role].some(
		(value) => value.trim().toLowerCase() === normalized,
	);
}

function omitted(
	items: AssistedContextGuidance["omitted"],
	proposalId: string,
	reason: string,
	stats: { count: number },
	reconfirmationRequired = false,
): void {
	stats.count += 1;
	if (items.length < MAX_OMITTED_GUIDANCE)
		items.push({
			proposal_id: proposalId,
			reason,
			...(reconfirmationRequired ? { reconfirmation_required: true } : {}),
		});
}

/** Returns only guidance that has an exact approved and applied receipt.
 * Context rendering is read-only and never appends reinforcement evidence. */
export function resolveAssistedContextGuidance(input: {
	root: string;
	projectId: string;
	filePath?: string;
	requestFiles?: string[];
	surface: string;
	role: string;
}): AssistedContextGuidance {
	if (!input.projectId)
		return {
			items: [],
			lesson_versions: [],
			contextual_preference_health: "not_present",
			omitted: [],
			omitted_count: 0,
			mandatory_omitted: false,
			truncated: false,
		};
	const events = readAssistedProposalJournal(input.root, input.projectId);
	const proposals = approvedAppliedProposals(events);
	const omittedItems: AssistedContextGuidance["omitted"] = [];
	const omissionStats = { count: 0 };
	let mandatoryOmitted = false;
	let hasContextualPreference = false;
	let hasUnknownApprovalBasis = false;
	let currentProductionDay: number | undefined;
	let preferenceHealth: AssistedContextGuidance["contextual_preference_health"] =
		"not_present";
	const pendingPreferenceProposals = proposals.filter(
		({ prepared }) =>
			(prepared.payload.preview as Record<string, unknown>)?.kind ===
				"contextual_preference" &&
			operationList(prepared.payload.preview).some(
				(operation) =>
					operation.type === "publish_guidance" &&
					typeof operation.statement === "string" &&
					inRequestedScope(
						typeof operation.scope === "string" ? operation.scope : undefined,
						input,
					),
			),
	);
	if (pendingPreferenceProposals.length > 0) {
		hasContextualPreference = true;
		try {
			const config = resolveEvolutionConfig(readProjectConfig(input.root));
			if (!config.projectId || config.projectId !== input.projectId)
				throw new Error("project identity unavailable");
			const productionDays = readProductionDayJournal(
				input.root,
				input.projectId,
				config.timezone,
				config.paths.evolutionEventsDir,
			);
			// One ordinal per distinct local date, matching decision stamping
			// and apply receipts; same-date events age nothing (R4).
			currentProductionDay = distinctLocalProductionDays(
				productionDays,
				input.projectId,
			);
			preferenceHealth = "healthy";
		} catch {
			preferenceHealth = "unknown";
		}
	}

	const paths = resolveProjectPaths(input.root);
	const availableSkills = listSkills(input.root);
	const skillsRoot = resolve(paths.abs.skillsDir);
	const items: ApprovedContextGuidance[] = [];
	const lessonVersions: AssistedContextGuidance["lesson_versions"] = [];
	for (const { prepared, decision, applied } of proposals) {
		const preview = prepared.payload.preview as Record<string, unknown>;
		const kind = preview.kind;
		if (
			kind !== "skill_discovery" &&
			kind !== "lesson_adoption" &&
			kind !== "contextual_preference" &&
			kind !== "durable_decision" &&
			kind !== "durable_restriction"
		)
			continue;
		const operations = operationList(preview);
		for (const [operationIndex, operation] of operations.entries()) {
			if (operation.type === "activate_skill") {
				const target = operation.target;
				const expected = operation.expected_sha256;
				if (typeof target !== "string" || typeof expected !== "string") {
					omitted(
						omittedItems,
						prepared.proposal_id,
						"invalid_skill_activation",
						omissionStats,
					);
					continue;
				}
				const absoluteTarget = resolve(input.root, target);
				const relativeTarget = relative(skillsRoot, absoluteTarget);
				if (
					isAbsolute(target) ||
					relativeTarget === "" ||
					relativeTarget === ".." ||
					relativeTarget.startsWith(`..${sep}`)
				) {
					omitted(
						omittedItems,
						prepared.proposal_id,
						"skill_target_unsafe",
						omissionStats,
					);
					continue;
				}
				const skill = availableSkills.find(
					(candidate) => candidate.path === target,
				);
				const content = readBoundedSourceFile(
					absoluteTarget,
					"approved skill context target",
					{ maxBytes: 256 * 1024, maxLines: 20_000, maxCandidates: 50_000 },
				);
				const actual =
					content === null
						? null
						: createHash("sha256").update(content).digest("hex");
				if (!skill || actual !== expected) {
					omitted(
						omittedItems,
						prepared.proposal_id,
						"skill_target_changed",
						omissionStats,
					);
					continue;
				}
				items.push({
					proposal_id: prepared.proposal_id,
					version_digest: prepared.version_digest,
					kind,
					approved_at: decision.timestamp,
					applied_at: applied.timestamp,
					operation_index: operationIndex + 1,
					target,
				});
				continue;
			}
			if (operation.type === "apply_lesson") {
				const lessonId = operation.lesson_id;
				const versionId = operation.version_id;
				const fieldSetDigest = operation.field_set_digest;
				if (
					typeof lessonId !== "string" ||
					typeof versionId !== "string" ||
					typeof fieldSetDigest !== "string"
				) {
					omitted(
						omittedItems,
						prepared.proposal_id,
						"invalid_lesson_adoption",
						omissionStats,
					);
					continue;
				}
				try {
					const lesson = resolveLessonVersionForAdoption(
						input.root,
						lessonId,
						versionId,
						fieldSetDigest,
					);
					if (
						!lessonMatchesRequest(
							lesson.fields.applies_when,
							lesson.work_type.module,
							input.requestFiles ?? [],
						)
					)
						continue;
					const entry: ContextLessonEntry & {
						version_id: string;
						field_set_digest: string;
					} = {
						id: lesson.lesson_id,
						version: lesson.version,
						version_id: lesson.version_id,
						field_set_digest: lesson.field_set_digest,
						problem: lesson.fields.problem,
						...(lesson.fields.applies_when === undefined
							? {}
							: { applies_when: lesson.fields.applies_when }),
						...(lesson.fields.preventive_action === undefined
							? {}
							: { preventive_action: lesson.fields.preventive_action }),
						...(lesson.fields.verify === undefined
							? {}
							: { verify: lesson.fields.verify }),
					};
					items.push({
						proposal_id: prepared.proposal_id,
						version_digest: prepared.version_digest,
						kind,
						approved_at: decision.timestamp,
						applied_at: applied.timestamp,
						operation_index: operationIndex + 1,
						lesson: entry,
					});
					lessonVersions.push({
						lesson_id: lesson.lesson_id,
						version_id: lesson.version_id,
						field_set_digest: lesson.field_set_digest,
						proposal_id: prepared.proposal_id,
						version_digest: prepared.version_digest,
					});
				} catch {
					omitted(
						omittedItems,
						prepared.proposal_id,
						"lesson_version_changed",
						omissionStats,
					);
				}
				continue;
			}
			if (operation.type !== "publish_guidance") continue;
			const statement = operation.statement;
			const scope =
				typeof operation.scope === "string" ? operation.scope : undefined;
			if (typeof statement !== "string" || !inRequestedScope(scope, input))
				continue;
			if (kind === "contextual_preference") {
				if (
					decision.payload.approval_production_day_base !==
					"distinct_local_dates"
				) {
					hasUnknownApprovalBasis = true;
					omitted(
						omittedItems,
						prepared.proposal_id,
						"approval_production_day_basis_unknown",
						omissionStats,
						true,
					);
					continue;
				}
				const approvalDay = decision.payload.approval_production_day;
				if (
					preferenceHealth !== "healthy" ||
					currentProductionDay === undefined ||
					!Number.isInteger(approvalDay) ||
					Number(approvalDay) < 0 ||
					Number(approvalDay) > currentProductionDay
				) {
					omitted(
						omittedItems,
						prepared.proposal_id,
						"production_day_health_unknown",
						omissionStats,
					);
					continue;
				}
				const age = currentProductionDay - Number(approvalDay);
				const freshness = preferenceFreshness(age);
				if (freshness <= 0) {
					omitted(
						omittedItems,
						prepared.proposal_id,
						"preference_expired",
						omissionStats,
					);
					continue;
				}
				items.push({
					proposal_id: prepared.proposal_id,
					version_digest: prepared.version_digest,
					kind,
					approved_at: decision.timestamp,
					applied_at: applied.timestamp,
					operation_index: operationIndex + 1,
					statement,
					...(scope ? { scope } : {}),
					production_day_age: age,
					preference_freshness: freshness,
				});
				continue;
			}
			items.push({
				proposal_id: prepared.proposal_id,
				version_digest: prepared.version_digest,
				kind,
				approved_at: decision.timestamp,
				applied_at: applied.timestamp,
				operation_index: operationIndex + 1,
				statement,
				...(scope ? { scope } : {}),
			});
		}
	}
	const priority = (item: ApprovedContextGuidance): number => {
		switch (item.kind) {
			case "durable_restriction":
				return 0;
			case "durable_decision":
				return 1;
			case "lesson_adoption":
				return 2;
			case "skill_discovery":
				return 3;
			case "contextual_preference":
				return 4;
		}
	};
	items.sort(
		(left, right) =>
			priority(left) - priority(right) ||
			left.applied_at.localeCompare(right.applied_at) ||
			left.proposal_id.localeCompare(right.proposal_id),
	);
	const truncated = items.length > MAX_GUIDANCE_ITEMS;
	const boundedItems = items.slice(0, MAX_GUIDANCE_ITEMS);
	const capOmitted = items.slice(MAX_GUIDANCE_ITEMS);
	for (const item of capOmitted) {
		omissionStats.count += 1;
		if (item.kind === "durable_restriction" || item.kind === "durable_decision")
			mandatoryOmitted = true;
		if (omittedItems.length < MAX_OMITTED_GUIDANCE)
			omittedItems.push({
				proposal_id: item.proposal_id,
				reason: "guidance_item_limit",
			});
	}
	return {
		items: boundedItems,
		lesson_versions: lessonVersions.filter((lesson) =>
			boundedItems.some(
				(item) =>
					item.proposal_id === lesson.proposal_id &&
					item.version_digest === lesson.version_digest,
			),
		),
		contextual_preference_health: hasContextualPreference
			? hasUnknownApprovalBasis
				? "unknown"
				: preferenceHealth
			: "not_present",
		...(currentProductionDay === undefined
			? {}
			: { current_production_day: currentProductionDay }),
		omitted: omittedItems,
		omitted_count: omissionStats.count,
		mandatory_omitted: mandatoryOmitted,
		truncated,
	};
}

export function approvedLessonViews(
	views: ReturnType<typeof readLessonRecords>,
	guidance: AssistedContextGuidance,
) {
	const approved = new Set(
		guidance.lesson_versions.map(
			({ lesson_id, version_id, field_set_digest }) =>
				`${lesson_id}\n${version_id}\n${field_set_digest}`,
		),
	);
	return views.filter((view) =>
		view.current.some((version) =>
			approved.has(
				`${view.lesson_id}\n${version.version_id}\n${version.field_set_digest}`,
			),
		),
	);
}

export function activatedSkillNames(
	root: string,
	guidance: AssistedContextGuidance,
): string[] {
	const skills = listSkills(root);
	const targets = new Set(
		guidance.items
			.filter((item) => item.kind === "skill_discovery" && item.target)
			.map((item) => item.target),
	);
	return skills
		.filter((skill) => targets.has(skill.path))
		.map((skill) => skill.name);
}
