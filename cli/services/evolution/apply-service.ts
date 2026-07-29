import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { runPatchMutation } from "../../commands/file/mutations/patch";
import { runUndoMutation } from "../../commands/file/mutations/undo";
import { normalizeHash } from "../../commands/file/shared";
import { withResourceLocks } from "../io/session-lock";
import {
	appendMutationRecord,
	findMutationById,
	loadMutationJournalStrict,
	type MutationRecord,
	withMutationJournalLock,
} from "../mutations/journal";
import { readProjectConfig } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import {
	assertTaskInProgress,
	readActiveSession,
} from "../workbench/lifecycle";
import {
	analyzeEvolutionProject,
	type EvolutionProposalPreview,
} from "./analysis";
import {
	APPLY_POLICY_VERSION,
	APPLY_VALIDATOR_V1,
	APPLY_VALIDATOR_VERSION,
	type ApplyBinding,
	type ApplyInvocationClass,
	type ApplySourceRef,
	type ApplyTargetKind,
	appendApplyEventUnlocked,
	applyDigest,
	readApplyJournal,
	unmatchedApplyPrepares,
	withApplyLock,
} from "./apply-journal";
import { evolutionDbPath, openEvolutionDb } from "./db";
import { writeEvolutionProjectionCheckpoint } from "./projection-checkpoint";
import { resolveEvolutionConfig } from "./runtime-config";
import { evaluationContractDigest } from "./suggestion-model";

type ApplyPolicyMode = "canary" | "lessons_memory_only" | "none";

export type ApplyInput = {
	root: string;
	projectId: string;
	proposal: EvolutionProposalPreview;
	invocationClass: ApplyInvocationClass;
	policyMode: ApplyPolicyMode;
	session: string;
	taskId: string;
	now?: Date;
	checkpointWriter?: typeof writeEvolutionProjectionCheckpoint;
};

export type RollbackInput = {
	root: string;
	projectId: string;
	proposalId: string;
	invocationClass: ApplyInvocationClass;
	policyMode?: ApplyPolicyMode;
	session: string;
	taskId: string;
	now?: Date;
	checkpointWriter?: typeof writeEvolutionProjectionCheckpoint;
};

export type ApplyResult = {
	status: "applied" | "blocked" | "rolled_back";
	mutation_id?: string;
	target_path?: string;
	before_hash?: string;
	after_hash?: string;
	duplicate?: boolean;
	message?: string;
};

const MAX_ARTIFACT_BYTES = 32 * 1024;
const EMPTY_HASH = normalizeHash("");

function policyMode(root: string): ApplyPolicyMode {
	const settings = resolveEvolutionConfig(readProjectConfig(root)).settings;
	const autonomy =
		settings.autonomy &&
		typeof settings.autonomy === "object" &&
		!Array.isArray(settings.autonomy)
			? (settings.autonomy as Record<string, unknown>)
			: {};
	const value = autonomy.auto_apply_mode;
	if (value === "canary" || value === "lessons_memory_only" || value === "none")
		return value;
	throw new Error("invalid evolution apply policy mode");
}

function assertGovernedTask(
	root: string,
	session: string,
	taskId: string,
): void {
	if (readActiveSession(root) !== session)
		throw new Error("evolution apply requires the active workbench session");
	assertTaskInProgress(root, session, taskId);
}

function safeInline(value: unknown, max = 320): string {
	return String(value ?? "")
		.replaceAll("\0", " ")
		.replace(/[\r\n\uFFFD]/g, " ")
		.replace(/[<>`#{}[\]*]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, max);
}

function safeSourceRefs(proposal: EvolutionProposalPreview): ApplySourceRef[] {
	const refs = proposal.evidence_refs.slice(0, 4).map((ref) => {
		const result: ApplySourceRef = {
			id: String(ref.id ?? ""),
			kind: String(ref.kind ?? ""),
		};
		if (ref.digest) result.digest = String(ref.digest);
		if (ref.authority) result.authority = String(ref.authority);
		return result;
	});
	if (refs.length === 0)
		throw new Error("evolution proposal has no evidence refs");
	return refs;
}

function timestampId(now: Date, proposalId: string): string {
	const iso = now.toISOString();
	const stamp = `${iso.slice(0, 10).replaceAll("-", "")}_${iso.slice(11, 16).replace(":", "")}`;
	const suffix = proposalId
		.replace(/^EVO-/, "")
		.replace(/[^A-Za-z0-9._-]/g, "");
	if (!suffix || suffix.length > 96)
		throw new Error("invalid evolution proposal id");
	return `${stamp}_evolution-${suffix}`;
}

function renderArtifact(input: {
	proposal: EvolutionProposalPreview;
	now: Date;
	targetKind: ApplyTargetKind;
	artifactId: string;
}): string {
	const createdAt = input.now.toISOString();
	const refs = safeSourceRefs(input.proposal);
	const evidenceLines = refs.map(
		(ref) => `- ${ref.kind}: ${ref.id}${ref.digest ? ` (${ref.digest})` : ""}`,
	);
	const proposalDigest = applyDigest(input.proposal);
	const title =
		safeInline(input.proposal.problem, 120) || "Recurring workflow friction";
	const status = input.targetKind === "lesson" ? "active" : "proposed";
	const docType =
		input.targetKind === "lesson" ? "lesson_entry" : "evolution_canary";
	const content = [
		"---",
		`doc_type: ${docType}`,
		`id: ${JSON.stringify(input.artifactId)}`,
		`status: ${status}`,
		`created_at: ${JSON.stringify(createdAt)}`,
		`updated_at: ${JSON.stringify(createdAt)}`,
		"tags: [evolution, quality]",
		`proposal_id: ${JSON.stringify(input.proposal.id)}`,
		`proposal_digest: ${proposalDigest}`,
		"---",
		"",
		`# ${createdAt.slice(0, 10)} - ${title}`,
		"",
		"## Context",
		"",
		safeInline(input.proposal.problem),
		"",
		"## Lesson",
		"",
		safeInline(input.proposal.recommendation),
		"",
		"## Prevention Rule",
		"",
		safeInline(input.proposal.recommendation),
		"",
		"## Guardrail",
		"",
		safeInline(input.proposal.validation),
		"",
		"## Evidence",
		"",
		...evidenceLines,
		"",
	].join("\n");
	if (
		Buffer.byteLength(content, "utf8") > MAX_ARTIFACT_BYTES ||
		content.split("\n").length > 80 ||
		content.includes("\0") ||
		content.includes("\uFFFD")
	)
		throw new Error("evolution apply artifact exceeds bounds");
	return content;
}

function canonicalProposal(
	input: Pick<ApplyInput, "now" | "projectId" | "proposal" | "root">,
): EvolutionProposalPreview {
	const analysis = analyzeEvolutionProject(input.root, {
		now: input.now ?? new Date(),
	});
	if (analysis.project_id !== input.projectId)
		throw new Error("evolution apply project identity mismatch");
	const proposal = analysis.proposals.find(
		(candidate) => candidate.id === input.proposal.id,
	);
	if (!proposal || applyDigest(proposal) !== applyDigest(input.proposal))
		throw new Error("evolution proposal preview is missing or stale");
	if (proposal.risk !== "low" || proposal.evidence_refs.length === 0)
		throw new Error("evolution proposal is not eligible for bounded apply");
	return proposal;
}

function plannedArtifact(
	input: ApplyInput,
	proposal: EvolutionProposalPreview,
) {
	const now = input.now ?? new Date();
	const currentMode = policyMode(input.root);
	if (input.policyMode !== currentMode)
		throw new Error("evolution apply policy changed");
	let targetKind: ApplyTargetKind;
	if (input.invocationClass === "explicit_local") targetKind = "lesson";
	else if (
		input.invocationClass === "policy_canary" &&
		currentMode === "canary"
	)
		targetKind = "generated";
	else throw new Error("evolution apply invocation or policy denied");
	const artifactId = timestampId(now, proposal.id);
	const path =
		targetKind === "lesson"
			? `docs/lessons/entries/${artifactId}.md`
			: `.afol/data/evolution/generated/${proposal.id}.md`;
	const content = renderArtifact({ proposal, now, targetKind, artifactId });
	return { artifactId, content, path, targetKind };
}

function resolveTarget(root: string, path: string) {
	const resolved = resolveProjectWritePath(root, path);
	if (!resolved.ok) throw new Error(resolved.error);
	return resolved.value.path;
}

function assertNewTarget(root: string, path: string): void {
	const absolute = resolveTarget(root, path);
	if (existsSync(absolute)) {
		const stat = lstatSync(absolute);
		throw new Error(
			stat.isSymbolicLink()
				? "evolution apply target symlink denied"
				: "evolution apply target must be a new file",
		);
	}
}

function artifactState(root: string, path: string) {
	const absolute = resolveTarget(root, path);
	if (!existsSync(absolute))
		return { exists: false, hash: EMPTY_HASH } as const;
	const stat = lstatSync(absolute);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
		throw new Error("evolution apply artifact must be a single regular file");
	if (stat.size > MAX_ARTIFACT_BYTES)
		throw new Error("evolution apply artifact exceeds size limit");
	const content = readFileSync(absolute, "utf8");
	if (content.includes("\0") || content.includes("\uFFFD"))
		throw new Error("evolution apply artifact is not valid text");
	return { exists: true, content, hash: normalizeHash(content) } as const;
}

function validateArtifact(root: string, binding: ApplyBinding): void {
	const state = artifactState(root, binding.target_path);
	if (!state.exists || state.hash !== binding.after_hash)
		throw new Error("evolution apply artifact hash mismatch");
	if (
		applyDigest(state.content) !== binding.content_digest ||
		state.content.split("\n").length !== binding.changed_lines ||
		Buffer.byteLength(state.content, "utf8") > MAX_ARTIFACT_BYTES
	)
		throw new Error("evolution apply artifact binding mismatch");
	for (const required of [
		"---\n",
		"## Context\n",
		"## Lesson\n",
		"## Prevention Rule\n",
		"## Guardrail\n",
		"## Evidence\n",
	])
		if (!state.content.includes(required))
			throw new Error("evolution apply artifact schema mismatch");
	const expectedDocType =
		binding.target_kind === "lesson"
			? "doc_type: lesson_entry"
			: "doc_type: evolution_canary";
	if (!state.content.includes(expectedDocType))
		throw new Error("evolution apply artifact kind mismatch");
}

function bind(input: {
	apply: ApplyInput;
	proposal: EvolutionProposalPreview;
	targetKind: ApplyTargetKind;
	targetPath: string;
	content: string;
	mutationId: string;
}): ApplyBinding {
	const resolved = resolveEvolutionConfig(readProjectConfig(input.apply.root));
	const db = openEvolutionDb(
		evolutionDbPath(input.apply.root, resolved.paths.evolutionDb),
	);
	let evaluationAnchorProductionDaySequence = 0;
	try {
		const row = db
			.prepare(
				"SELECT MAX(ordinal_sequence) AS sequence FROM production_days WHERE project_id = ?",
			)
			.get(input.apply.projectId) as { sequence: number | null } | null;
		evaluationAnchorProductionDaySequence = Number(row?.sequence ?? 0);
	} finally {
		db.close();
	}
	return {
		project_id: input.apply.projectId,
		proposal_id: input.proposal.id,
		cluster_id: input.proposal.cluster_id,
		task_type: input.proposal.task_type,
		proposal_digest: applyDigest(input.proposal),
		evidence_digest: input.proposal.evidence_digest,
		evidence_refs: safeSourceRefs(input.proposal),
		baseline: structuredClone(input.proposal.baseline) as Record<
			string,
			unknown
		>,
		targets: structuredClone(input.proposal.targets) as Record<string, unknown>,
		invocation_class: input.apply.invocationClass,
		policy_mode: input.apply.policyMode,
		policy_version: APPLY_POLICY_VERSION,
		validator_version: APPLY_VALIDATOR_VERSION,
		contract_version: input.proposal.contract_version,
		evaluation_contract: structuredClone(input.proposal.evaluation_contract),
		evaluation_contract_digest: evaluationContractDigest(
			input.proposal.evaluation_contract,
		),
		evaluation_anchor_production_day_sequence:
			evaluationAnchorProductionDaySequence,
		target_kind: input.targetKind,
		target_path: input.targetPath,
		before_state: "absent",
		before_hash: EMPTY_HASH,
		after_hash: normalizeHash(input.content),
		content_digest: applyDigest(input.content),
		changed_files: 1,
		changed_lines: input.content.split("\n").length,
		session: input.apply.session,
		task_id: input.apply.taskId,
		mutation_id: input.mutationId,
	};
}

function appendTerminal(input: {
	root: string;
	phase: "abort" | "commit" | "rollback";
	binding: ApplyBinding;
	session: string;
	taskId: string;
	now?: Date;
	checkpointWriter?: typeof writeEvolutionProjectionCheckpoint;
}) {
	const event = appendApplyEventUnlocked({
		root: input.root,
		phase: input.phase,
		binding: input.binding,
		commandSession: input.session,
		commandTaskId: input.taskId,
		...(input.now ? { now: input.now } : {}),
	});
	refreshApplyCheckpointBestEffort(input.root, input.checkpointWriter);
	return event;
}

function refreshApplyCheckpointBestEffort(
	root: string,
	checkpointWriter = writeEvolutionProjectionCheckpoint,
): void {
	try {
		refreshApplyCheckpoint(root, checkpointWriter);
	} catch {
		// The apply journal is canonical. A stale/missing checkpoint is derived
		// state and must not turn a durable terminal into a reported failure.
	}
}

function refreshApplyCheckpoint(
	root: string,
	checkpointWriter = writeEvolutionProjectionCheckpoint,
): void {
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	if (!resolved.projectId)
		throw new Error("evolution project id is required for apply checkpoint");
	const db = openEvolutionDb(evolutionDbPath(root, resolved.paths.evolutionDb));
	try {
		checkpointWriter({
			root,
			db,
			projectId: resolved.projectId,
			eventsDir: resolved.paths.evolutionEventsDir,
		});
	} finally {
		db.close();
	}
}

function committedMutation(
	records: readonly MutationRecord[],
	mutationId: string,
) {
	return records.findLast(
		(record) =>
			record.kind !== "undo" &&
			record.id === mutationId &&
			record.status === "committed",
	);
}

function mutationWasUndone(
	records: readonly MutationRecord[],
	mutationId: string,
) {
	return records.some(
		(record) =>
			record.kind === "undo" &&
			record.targetMutationId === mutationId &&
			(record.status === "applied" || record.status === "committed"),
	);
}

function undoBoundMutation(input: {
	root: string;
	binding: ApplyBinding;
	reason: string;
}): void {
	const result = runUndoMutation(
		{
			command: "ud",
			path: input.binding.target_path,
			dryRun: false,
			json: false,
			session: input.binding.session,
			taskId: input.binding.task_id,
			reason: input.reason,
			mutationId: input.binding.mutation_id,
		},
		input.root,
	);
	if (result.status === "blocked" || result.status === "noop")
		throw new Error(
			`evolution apply compensation failed: ${result.message ?? result.status}`,
		);
}

function exactCommittedApply(
	root: string,
	proposal: EvolutionProposalPreview,
): ApplyBinding | null {
	const events = readApplyJournal(root);
	const digest = applyDigest(proposal);
	const commit = events.findLast(
		(event) =>
			event.phase === "commit" &&
			event.binding.proposal_id === proposal.id &&
			event.binding.proposal_digest === digest,
	);
	if (!commit) return null;
	if (
		events.some(
			(event) =>
				event.phase === "rollback" &&
				event.binding.mutation_id === commit.binding.mutation_id,
		)
	)
		return null;
	return commit.binding;
}

function assertDuplicateMutation(root: string, binding: ApplyBinding): void {
	const journal = loadMutationJournalStrict(root);
	if (journal.issues.length > 0)
		throw new Error("evolution duplicate mutation journal is corrupt");
	const mutation = committedMutation(journal.records, binding.mutation_id);
	if (
		mutation?.kind !== "patch" ||
		mutation.session !== binding.session ||
		mutation.taskId !== binding.task_id ||
		mutation.sourcePath !== binding.target_path ||
		mutation.beforeExisted !== false ||
		mutation.beforeHash !== binding.before_hash ||
		mutation.afterHash !== binding.after_hash
	)
		throw new Error("evolution duplicate mutation binding mismatch");
	if (mutationWasUndone(journal.records, binding.mutation_id))
		throw new Error("evolution duplicate mutation was undone");
}

export function applyEvolutionProposal(input: ApplyInput): ApplyResult {
	return withApplyLock(input.root, () => {
		assertGovernedTask(input.root, input.session, input.taskId);
		recoverEvolutionAppliesUnlocked(input.root);
		const duplicate = exactCommittedApply(input.root, input.proposal);
		if (duplicate) {
			if (
				currentProjectId(input.root) !== input.projectId ||
				duplicate.project_id !== input.projectId
			)
				throw new Error("evolution apply project identity mismatch");
			if (
				duplicate.invocation_class !== input.invocationClass ||
				duplicate.policy_mode !== input.policyMode
			)
				throw new Error("evolution apply invocation or policy denied");
			assertDuplicateMutation(input.root, duplicate);
			validateArtifact(input.root, duplicate);
			refreshApplyCheckpointBestEffort(input.root, input.checkpointWriter);
			return {
				status: "applied",
				mutation_id: duplicate.mutation_id,
				target_path: duplicate.target_path,
				before_hash: duplicate.before_hash,
				after_hash: duplicate.after_hash,
				duplicate: true,
			};
		}
		const proposal = canonicalProposal(input);
		const planned = plannedArtifact(input, proposal);
		assertNewTarget(input.root, planned.path);
		let prepared: ApplyBinding | undefined;
		try {
			const result = runPatchMutation(
				{
					command: "pt",
					path: planned.path,
					appendText: planned.content,
					dryRun: false,
					json: false,
					session: input.session,
					taskId: input.taskId,
					reason: `evolution proposal ${proposal.id}`,
					expectedBeforeHash: EMPTY_HASH,
					expectedBeforeExisted: false,
				},
				input.root,
				{
					beforePrepared: (mutationId) => {
						const mutationJournal = loadMutationJournalStrict(input.root);
						if (
							mutationJournal.issues.length > 0 ||
							mutationJournal.records.some((record) => record.id === mutationId)
						)
							throw new Error(
								"evolution mutation journal is not collision-free",
							);
						prepared = bind({
							apply: input,
							proposal,
							targetKind: planned.targetKind,
							targetPath: planned.path,
							content: planned.content,
							mutationId,
						});
						appendApplyEventUnlocked({
							root: input.root,
							phase: "prepare",
							binding: prepared,
							commandSession: input.session,
							commandTaskId: input.taskId,
							...(input.now ? { now: input.now } : {}),
						});
						refreshApplyCheckpoint(input.root, input.checkpointWriter);
					},
				},
			);
			if (
				!prepared ||
				result.mutation_id !== prepared.mutation_id ||
				result.before_hash !== EMPTY_HASH ||
				result.after_hash !== prepared.after_hash
			)
				throw new Error("evolution apply mutation binding mismatch");
			validateArtifact(input.root, prepared);
			appendTerminal({
				root: input.root,
				phase: "commit",
				binding: prepared,
				session: input.session,
				taskId: input.taskId,
				...(input.checkpointWriter
					? { checkpointWriter: input.checkpointWriter }
					: {}),
				...(input.now ? { now: input.now } : {}),
			});
			return {
				status: "applied",
				mutation_id: prepared.mutation_id,
				target_path: prepared.target_path,
				before_hash: prepared.before_hash,
				after_hash: prepared.after_hash,
				duplicate: false,
			};
		} catch (error) {
			if (prepared) {
				const artifact = artifactState(input.root, prepared.target_path);
				if (artifact.exists && artifact.hash === prepared.after_hash)
					undoBoundMutation({
						root: input.root,
						binding: prepared,
						reason: `abort evolution proposal ${proposal.id}`,
					});
				const afterCompensation = artifactState(
					input.root,
					prepared.target_path,
				);
				if (afterCompensation.exists)
					throw new Error(
						`INTEGRITY_ERROR: evolution apply drift prevented compensation: ${(error as Error).message}`,
					);
				appendTerminal({
					root: input.root,
					phase: "abort",
					binding: prepared,
					session: input.session,
					taskId: input.taskId,
					...(input.checkpointWriter
						? { checkpointWriter: input.checkpointWriter }
						: {}),
					...(input.now ? { now: input.now } : {}),
				});
			}
			throw error;
		}
	});
}

function currentProjectId(root: string): string {
	const projectId = resolveEvolutionConfig(readProjectConfig(root)).projectId;
	if (!projectId) throw new Error("evolution project id is required");
	return projectId;
}

export function rollbackEvolutionProposal(input: RollbackInput): ApplyResult {
	return withApplyLock(input.root, () => {
		if (input.invocationClass !== "explicit_local")
			throw new Error("evolution rollback requires explicit local approval");
		assertGovernedTask(input.root, input.session, input.taskId);
		recoverEvolutionAppliesUnlocked(input.root);
		if (currentProjectId(input.root) !== input.projectId)
			throw new Error("evolution rollback project identity mismatch");
		const events = readApplyJournal(input.root);
		const commit = events.findLast(
			(event) =>
				event.phase === "commit" &&
				event.binding.proposal_id === input.proposalId,
		);
		if (!commit) throw new Error("evolution proposal rollback unavailable");
		if (commit.binding.project_id !== input.projectId)
			throw new Error("evolution rollback committed project identity mismatch");
		const priorRollback = events.findLast(
			(event) =>
				event.phase === "rollback" &&
				event.binding.mutation_id === commit.binding.mutation_id,
		);
		if (priorRollback) {
			const journal = loadMutationJournalStrict(input.root);
			const artifact = artifactState(input.root, commit.binding.target_path);
			if (
				journal.issues.length > 0 ||
				!mutationWasUndone(journal.records, commit.binding.mutation_id) ||
				artifact.exists
			)
				throw new Error(
					"INTEGRITY_ERROR: evolution rollback terminal state is inconsistent",
				);
			refreshApplyCheckpointBestEffort(input.root, input.checkpointWriter);
			return {
				status: "rolled_back",
				mutation_id: commit.binding.mutation_id,
				target_path: commit.binding.target_path,
				after_hash: EMPTY_HASH,
				duplicate: true,
			};
		}
		const mutationJournal = loadMutationJournalStrict(input.root);
		if (mutationJournal.issues.length > 0)
			throw new Error("evolution rollback mutation journal is corrupt");
		const alreadyUndone = mutationWasUndone(
			mutationJournal.records,
			commit.binding.mutation_id,
		);
		const state = artifactState(input.root, commit.binding.target_path);
		if (alreadyUndone && !state.exists) {
			appendTerminal({
				root: input.root,
				phase: "rollback",
				binding: commit.binding,
				session: input.session,
				taskId: input.taskId,
				...(input.checkpointWriter
					? { checkpointWriter: input.checkpointWriter }
					: {}),
				...(input.now ? { now: input.now } : {}),
			});
			return {
				status: "rolled_back",
				mutation_id: commit.binding.mutation_id,
				target_path: commit.binding.target_path,
				after_hash: EMPTY_HASH,
			};
		}
		validateArtifact(input.root, commit.binding);
		const mutation = findMutationById(input.root, commit.binding.mutation_id);
		if (!mutation || mutation.kind === "undo")
			throw new Error("evolution rollback mutation record is missing");
		undoBoundMutation({
			root: input.root,
			binding: commit.binding,
			reason: `rollback evolution proposal ${input.proposalId}`,
		});
		appendTerminal({
			root: input.root,
			phase: "rollback",
			binding: commit.binding,
			session: input.session,
			taskId: input.taskId,
			...(input.checkpointWriter
				? { checkpointWriter: input.checkpointWriter }
				: {}),
			...(input.now ? { now: input.now } : {}),
		});
		return {
			status: "rolled_back",
			mutation_id: mutation.id,
			target_path: commit.binding.target_path,
			after_hash: EMPTY_HASH,
		};
	});
}

function assertMutationBinding(
	record: Exclude<MutationRecord, { kind: "undo" }>,
	binding: ApplyBinding,
): void {
	if (
		record.kind !== "patch" ||
		record.sourcePath !== binding.target_path ||
		record.beforeExisted !== false ||
		record.beforeHash !== binding.before_hash ||
		record.afterHash !== binding.after_hash ||
		record.session !== binding.session ||
		record.taskId !== binding.task_id
	)
		throw new Error("evolution recovery mutation binding mismatch");
}

function revalidateRecovery(root: string, binding: ApplyBinding): void {
	if (binding.policy_version !== APPLY_POLICY_VERSION)
		throw new Error("evolution recovery validator version mismatch");
	if (
		binding.validator_version !== APPLY_VALIDATOR_V1 &&
		binding.validator_version !== APPLY_VALIDATOR_VERSION
	)
		throw new Error("evolution recovery validator version mismatch");
	if (
		binding.invocation_class === "policy_canary" &&
		policyMode(root) !== "canary"
	)
		throw new Error("evolution recovery policy no longer permits canary");
	if (binding.validator_version === APPLY_VALIDATOR_V1) {
		validateArtifact(root, binding);
		return;
	}
	if (currentProjectId(root) !== binding.project_id)
		throw new Error("evolution recovery proposal is stale");
	validateArtifact(root, binding);
}

function terminalizePreparedMutation(
	root: string,
	record: MutationRecord,
	status: "committed" | "rolled_back",
): void {
	appendMutationRecord(root, { ...record, status });
}

function recoverDanglingEvolutionUndos(root: string): void {
	const applyEvents = readApplyJournal(root);
	const journal = loadMutationJournalStrict(root);
	const terminalIds = new Set(
		journal.records
			.filter((record) =>
				["applied", "committed", "rolled_back"].includes(record.status),
			)
			.map((record) => record.id),
	);
	const dangling = journal.records.filter(
		(record) =>
			record.kind === "undo" &&
			record.status === "prepared" &&
			!terminalIds.has(record.id),
	);
	for (const undo of dangling) {
		if (undo.kind !== "undo") continue;
		const prepare = applyEvents.find(
			(event) => event.binding.mutation_id === undo.targetMutationId,
		);
		if (
			!prepare ||
			undo.sourcePath !== prepare.binding.target_path ||
			undo.destinationPath !== prepare.binding.target_path ||
			undo.session !== prepare.binding.session ||
			undo.taskId !== prepare.binding.task_id
		)
			throw new Error("evolution recovery undo binding mismatch");
		const state = artifactState(root, prepare.binding.target_path);
		if (!state.exists) {
			terminalizePreparedMutation(root, undo, "committed");
			const committed = applyEvents.some(
				(event) =>
					event.phase === "commit" &&
					event.binding.mutation_id === prepare.binding.mutation_id,
			);
			const rolledBack = applyEvents.some(
				(event) =>
					event.phase === "rollback" &&
					event.binding.mutation_id === prepare.binding.mutation_id,
			);
			if (committed && !rolledBack)
				appendTerminal({
					root,
					phase: "rollback",
					binding: prepare.binding,
					session: prepare.binding.session,
					taskId: prepare.binding.task_id,
				});
			continue;
		}
		if (state.hash === prepare.binding.after_hash) {
			terminalizePreparedMutation(root, undo, "rolled_back");
			continue;
		}
		throw new Error(
			`evolution recovery undo drift: ${prepare.binding.target_path}`,
		);
	}
}

function compensatePreparedApplyWrite(
	root: string,
	binding: ApplyBinding,
	prepared: Exclude<MutationRecord, { kind: "undo" }>,
): void {
	const absolute = resolveTarget(root, binding.target_path);
	withMutationJournalLock(root, () =>
		withResourceLocks(root, [absolute], () => {
			const state = artifactState(root, binding.target_path);
			if (!state.exists || state.hash !== binding.after_hash)
				throw new Error(`evolution recovery drift: ${binding.target_path}`);
			rmSync(absolute);
			terminalizePreparedMutation(root, prepared, "rolled_back");
		}),
	);
}

function recoverEvolutionAppliesUnlocked(root: string): ApplyResult[] {
	recoverDanglingEvolutionUndos(root);
	const pending = unmatchedApplyPrepares(root);
	const pendingMutationIds = new Set(
		pending.map((prepare) => prepare.binding.mutation_id),
	);
	return pending.map((prepare) => {
		const binding = prepare.binding;
		const journal = loadMutationJournalStrict(root);
		const allowedIssue = `unmatched-prepared:${binding.mutation_id}`;
		const otherIssues = journal.issues.filter((issue) => {
			const match = /^unmatched-prepared:(.+)$/.exec(issue);
			return !match || !pendingMutationIds.has(match[1] ?? "");
		});
		if (otherIssues.length > 0)
			throw new Error(
				`evolution recovery mutation journal corrupt: ${otherIssues.join("; ")}`,
			);
		const related = journal.records.filter(
			(record) => record.kind !== "undo" && record.id === binding.mutation_id,
		) as Array<Exclude<MutationRecord, { kind: "undo" }>>;
		for (const record of related) assertMutationBinding(record, binding);
		const state = artifactState(root, binding.target_path);
		const committed = committedMutation(journal.records, binding.mutation_id);
		const undone = mutationWasUndone(journal.records, binding.mutation_id);
		const rolledBack = related.some(
			(record) => record.status === "rolled_back",
		);
		const prepared = related.find((record) => record.status === "prepared");
		if (
			state.exists &&
			state.hash === binding.after_hash &&
			committed &&
			!undone
		) {
			try {
				revalidateRecovery(root, binding);
			} catch (error) {
				undoBoundMutation({
					root,
					binding,
					reason: `abort recovered evolution proposal ${binding.proposal_id}`,
				});
				appendTerminal({
					root,
					phase: "abort",
					binding,
					session: binding.session,
					taskId: binding.task_id,
				});
				return {
					status: "blocked" as const,
					mutation_id: binding.mutation_id,
					target_path: binding.target_path,
					message: (error as Error).message,
				};
			}
			appendTerminal({
				root,
				phase: "commit",
				binding,
				session: binding.session,
				taskId: binding.task_id,
			});
			return {
				status: "applied" as const,
				mutation_id: binding.mutation_id,
				target_path: binding.target_path,
			};
		}
		if (!state.exists && !committed && !undone && !rolledBack && !prepared) {
			appendTerminal({
				root,
				phase: "abort",
				binding,
				session: binding.session,
				taskId: binding.task_id,
			});
			return {
				status: "blocked" as const,
				mutation_id: binding.mutation_id,
				target_path: binding.target_path,
			};
		}
		if (!state.exists && prepared && !committed && !undone) {
			if (!journal.issues.includes(allowedIssue))
				throw new Error("evolution recovery prepared state is ambiguous");
			appendMutationRecord(root, { ...prepared, status: "rolled_back" });
			appendTerminal({
				root,
				phase: "abort",
				binding,
				session: binding.session,
				taskId: binding.task_id,
			});
			return {
				status: "blocked" as const,
				mutation_id: binding.mutation_id,
				target_path: binding.target_path,
			};
		}
		if (
			state.exists &&
			state.hash === binding.after_hash &&
			prepared &&
			!committed &&
			!undone
		) {
			if (!journal.issues.includes(allowedIssue))
				throw new Error("evolution recovery prepared state is ambiguous");
			compensatePreparedApplyWrite(root, binding, prepared);
			appendTerminal({
				root,
				phase: "abort",
				binding,
				session: binding.session,
				taskId: binding.task_id,
			});
			return {
				status: "blocked" as const,
				mutation_id: binding.mutation_id,
				target_path: binding.target_path,
			};
		}
		if (!state.exists && (rolledBack || undone)) {
			appendTerminal({
				root,
				phase: "abort",
				binding,
				session: binding.session,
				taskId: binding.task_id,
			});
			return {
				status: "blocked" as const,
				mutation_id: binding.mutation_id,
				target_path: binding.target_path,
			};
		}
		throw new Error(`evolution recovery drift: ${binding.target_path}`);
	});
}

export function recoverEvolutionApplies(root: string): ApplyResult[] {
	return withApplyLock(root, () => recoverEvolutionAppliesUnlocked(root));
}
