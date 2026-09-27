import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fchmodSync,
	constants as fsConstants,
	fstatSync,
	fsyncSync,
	openSync,
	rmSync,
	writeSync,
} from "node:fs";
import {
	backupPath,
	readJournalBackupBytes,
	resolveJournalBackupPath,
} from "../../commands/file/shared";
import {
	atomicWriteText,
	atomicWriteTextPreservingMetadata,
} from "../io/atomic";
import { readBoundedSourceFile } from "../io/safe-source";
import { withResourceLocks } from "../io/session-lock";
import {
	appendMutationRecords,
	assertMutationJournalIntegrity,
	createMutationId,
	loadMutationJournalStrict,
	type MutationRecord,
	withMutationJournalLock,
} from "../mutations/journal";
import { readProjectConfig } from "../project/paths";
import { resolveProjectWritePath } from "../project/root";
import { verifyArtifactReference } from "./artifact-inspection";
import {
	appendAssistedProposalEvent,
	proposalPreparedEvent,
	proposalVersionEvents,
	readAssistedProposalJournal,
	withAssistedProposalJournalLock,
} from "./assisted-proposal-journal";
import {
	literalReplaceOnce,
	targetAllowed,
	type AssistedProposalPreview,
} from "./assisted-proposal-packet";
import { assertSafeEvolutionTarget } from "./db";
import {
	distinctLocalProductionDays,
	readProductionDayJournal,
} from "./journal";
import { resolveLessonVersionForAdoption } from "./lesson-records";
import { resolveEvolutionConfig } from "./runtime-config";

const MAX_TARGET_BYTES = 256 * 1024;

type FileOperation = {
	index: number;
	target: string;
	type: "replace_text" | "create_text";
	before: string | null;
	after: string;
	beforeHash: string | null;
	afterHash: string;
	absolutePath: string;
	metadata?: { mode: number; uid: number; gid: number };
	backupPath?: string;
	backupIdentity?: { dev: string; ino: string };
	mutationId?: string;
};

type PatchMutationRecord = MutationRecord & { kind: "patch" };

function isPatchMutationRecord(
	record: MutationRecord,
): record is PatchMutationRecord {
	return record.kind === "patch";
}

function hash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function operationRecord(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("prepared proposal operation is invalid");
	return value as Record<string, unknown>;
}

function sameBaseline(
	preview: AssistedProposalPreview,
	index: number,
	operation: Record<string, unknown>,
	state: "present" | "absent",
	sha256: string | null,
): void {
	const baseline = preview.target_baselines[index];
	if (
		!baseline ||
		baseline.target !== operation.target ||
		baseline.operation !== operation.type ||
		baseline.state !== state ||
		baseline.sha256 !== sha256
	)
		throw new Error("prepared proposal target baseline is inconsistent");
}

function safeTargetPath(root: string, target: string): string {
	const resolved = resolveProjectWritePath(root, target);
	if (!resolved.ok) throw new Error("proposal target path is unsafe");
	return resolved.value.path;
}

function assertTargetPolicyAllowed(
	root: string,
	preview: AssistedProposalPreview,
	target: string,
): void {
	// Re-check the kind target policy at apply time with the configured
	// paths.skillsDir, so prepare, apply, and context consumption agree on
	// the valid skills root (R6).
	if (!targetAllowed(root, preview.kind, target))
		throw new Error(
			`approved target is not allowed for ${preview.kind}: ${target}`,
		);
}

function preflightOperation(
	root: string,
	preview: AssistedProposalPreview,
	value: unknown,
	index: number,
): FileOperation | null {
	const operation = operationRecord(value);
	if (operation.type === "activate_skill") {
		const target = operation.target;
		const expected = operation.expected_sha256;
		if (typeof target !== "string" || typeof expected !== "string")
			throw new Error("prepared skill activation is invalid");
		assertTargetPolicyAllowed(root, preview, target);
		const absolutePath = safeTargetPath(root, target);
		assertSafeEvolutionTarget(absolutePath, "skill activation target", false);
		const content = readBoundedSourceFile(
			absolutePath,
			"skill activation target",
			{
				maxBytes: MAX_TARGET_BYTES,
				maxLines: 20_000,
				maxCandidates: 50_000,
			},
		);
		if (content === null || hash(content) !== expected)
			throw new Error("approved skill activation target changed");
		sameBaseline(preview, index, operation, "present", expected);
		return null;
	}
	if (operation.type === "apply_lesson") {
		const lessonId = operation.lesson_id;
		const versionId = operation.version_id;
		const fieldSetDigest = operation.field_set_digest;
		if (
			typeof lessonId !== "string" ||
			typeof versionId !== "string" ||
			typeof fieldSetDigest !== "string"
		)
			throw new Error("prepared lesson adoption is invalid");
		const lesson = resolveLessonVersionForAdoption(
			root,
			lessonId,
			versionId,
			fieldSetDigest,
		);
		const baseline = preview.target_baselines[index];
		if (
			!baseline ||
			baseline.target !== `lesson:${lesson.lesson_id}` ||
			baseline.operation !== operation.type ||
			baseline.state !== "present" ||
			baseline.sha256 !== lesson.field_set_digest
		)
			throw new Error("prepared lesson adoption baseline is inconsistent");
		return null;
	}
	if (operation.type !== "replace_text" && operation.type !== "create_text")
		if (operation.type === "publish_guidance") return null;
		else throw new Error("prepared proposal operation type is unsupported");
	const target = operation.target;
	if (typeof target !== "string")
		throw new Error("prepared proposal target is invalid");
	assertTargetPolicyAllowed(root, preview, target);
	const absolutePath = safeTargetPath(root, target);
	const stat = assertSafeEvolutionTarget(absolutePath, "proposal target");
	const existing = readBoundedSourceFile(absolutePath, "proposal target", {
		maxBytes: MAX_TARGET_BYTES,
		maxLines: 20_000,
		maxCandidates: 50_000,
	});
	if (operation.type === "replace_text") {
		const expected = operation.expected_sha256;
		const beforeText = operation.before;
		const afterText = operation.after;
		if (
			!stat ||
			existing === null ||
			typeof expected !== "string" ||
			typeof beforeText !== "string" ||
			typeof afterText !== "string" ||
			hash(existing) !== expected
		)
			throw new Error(`approved replace target changed: ${target}`);
		const replacement = literalReplaceOnce({
			content: existing,
			before: beforeText,
			after: afterText,
			target,
		});
		sameBaseline(preview, index, operation, "present", expected);
		return {
			index,
			target,
			type: operation.type,
			before: existing,
			after: replacement.content,
			beforeHash: hash(existing),
			afterHash: replacement.sha256,
			absolutePath,
			metadata: {
				mode: Number(stat.mode),
				uid: Number(stat.uid),
				gid: Number(stat.gid),
			},
		};
	}
	const content = operation.content;
	if (stat || existing !== null || typeof content !== "string")
		throw new Error(`approved create target is no longer absent: ${target}`);
	if (Buffer.byteLength(content, "utf8") > MAX_TARGET_BYTES)
		throw new Error(`approved target exceeds the safe size limit: ${target}`);
	sameBaseline(preview, index, operation, "absent", null);
	return {
		index,
		target,
		type: operation.type,
		before: null,
		after: content,
		beforeHash: null,
		afterHash: hash(content),
		absolutePath,
	};
}

function mutationRecord(
	input: {
		operation: FileOperation;
		session: string;
		taskId: string;
		reason: string;
		batchId: string;
		now: Date;
	},
	status: "prepared" | "committed" | "rolled_back",
): MutationRecord {
	const operation = input.operation;
	if (!operation.mutationId)
		throw new Error("proposal mutation identity was not initialized");
	return {
		id: operation.mutationId,
		ts: input.now.toISOString(),
		kind: "patch",
		status,
		dryRun: false,
		session: input.session,
		taskId: input.taskId,
		reason: input.reason,
		sourcePath: operation.target,
		beforeHash: operation.beforeHash,
		afterHash: operation.afterHash,
		backupPath: operation.backupPath ?? null,
		beforeExisted: operation.before !== null,
		batchId: input.batchId,
	};
}

type ProposalFileSpec = {
	index: number;
	target: string;
	type: "replace_text" | "create_text";
	absolutePath: string;
	beforeHash: string | null;
	beforeExisted: boolean;
	content?: string;
	beforeText?: string;
	afterText?: string;
};

function proposalFileSpecs(
	root: string,
	preview: AssistedProposalPreview,
): ProposalFileSpec[] {
	const specs: ProposalFileSpec[] = [];
	for (const [index, value] of preview.intervention.operations.entries()) {
		const operation = operationRecord(value);
		if (operation.type !== "replace_text" && operation.type !== "create_text")
			continue;
		if (typeof operation.target !== "string")
			throw new Error("prepared proposal target is invalid");
		const target = operation.target;
		const absolutePath = safeTargetPath(root, target);
		if (operation.type === "replace_text") {
			const expected = operation.expected_sha256;
			const beforeText = operation.before;
			const afterText = operation.after;
			if (
				typeof expected !== "string" ||
				typeof beforeText !== "string" ||
				typeof afterText !== "string"
			)
				throw new Error("prepared replace operation is invalid");
			sameBaseline(preview, index, operation, "present", expected);
			specs.push({
				index,
				target,
				type: operation.type,
				absolutePath,
				beforeHash: expected,
				beforeExisted: true,
				beforeText,
				afterText,
			});
			continue;
		}
		if (typeof operation.content !== "string")
			throw new Error("prepared create operation is invalid");
		sameBaseline(preview, index, operation, "absent", null);
		specs.push({
			index,
			target,
			type: operation.type,
			absolutePath,
			beforeHash: null,
			beforeExisted: false,
			content: operation.content,
		});
	}
	return specs;
}

function proposalResourceTargets(
	root: string,
	preview: AssistedProposalPreview,
): string[] {
	const paths: string[] = [];
	for (const value of preview.intervention.operations) {
		const operation = operationRecord(value);
		if (
			operation.type !== "replace_text" &&
			operation.type !== "create_text" &&
			operation.type !== "activate_skill"
		)
			continue;
		if (typeof operation.target !== "string")
			throw new Error("prepared proposal target is invalid");
		paths.push(safeTargetPath(root, operation.target));
	}
	return paths;
}

function cleanupCreatedBackups(
	root: string,
	files: readonly FileOperation[],
): unknown[] {
	const errors: unknown[] = [];
	for (const file of files) {
		if (!file.backupPath || !file.backupIdentity) continue;
		try {
			const path = resolveJournalBackupPath(root, file.backupPath);
			if (!path || !existsSync(path)) continue;
			const stat = assertSafeEvolutionTarget(path, "proposal backup", false);
			if (
				!stat ||
				String(stat.dev) !== file.backupIdentity.dev ||
				String(stat.ino) !== file.backupIdentity.ino
			)
				continue;
			rmSync(path);
		} catch (error) {
			errors.push(error);
		}
	}
	return errors;
}

function rollbackWrittenFiles(
	files: readonly FileOperation[],
	root: string,
	mutationContext: {
		session: string;
		taskId: string;
		reason: string;
		batchId: string;
		now: Date;
	},
): void {
	const changed: FileOperation[] = [];
	for (const file of [...files].reverse()) {
		const current = readBoundedSourceFile(
			file.absolutePath,
			"proposal target",
			{
				maxBytes: MAX_TARGET_BYTES,
				maxLines: 20_000,
				maxCandidates: 50_000,
			},
		);
		if (current === file.before) continue;
		if (current === null || hash(current) !== file.afterHash)
			throw new Error(
				`proposal rollback stopped on target drift: ${file.target}`,
			);
		if (file.before === null) rmSync(file.absolutePath);
		else if (file.metadata)
			atomicWriteTextPreservingMetadata(
				file.absolutePath,
				file.before,
				file.metadata,
			);
		else atomicWriteText(file.absolutePath, file.before);
		changed.push(file);
	}
	const terminal = files
		.filter((file) => file.mutationId)
		.map((file) =>
			mutationRecord({ operation: file, ...mutationContext }, "rolled_back"),
		);
	if (terminal.length > 0) appendMutationRecords(root, terminal);
	const cleanupErrors = cleanupCreatedBackups(root, changed);
	if (cleanupErrors.length > 0)
		throw new AggregateError(cleanupErrors, "proposal backup cleanup failed");
}

function mutationBeforeFromBackup(
	root: string,
	record: PatchMutationRecord,
	spec: ProposalFileSpec,
): FileOperation {
	if (spec.type === "create_text") {
		const content = spec.content;
		if (
			typeof content !== "string" ||
			record.beforeHash !== null ||
			record.beforeExisted !== false ||
			record.backupPath !== null ||
			hash(content) !== record.afterHash
		)
			throw new Error(
				"proposal create mutation does not match the approved operation",
			);
		return {
			index: spec.index,
			target: spec.target,
			type: spec.type,
			before: null,
			after: content,
			beforeHash: null,
			afterHash: record.afterHash,
			absolutePath: spec.absolutePath,
			mutationId: record.id,
		};
	}
	if (!record.backupPath)
		throw new Error(`proposal mutation backup is missing: ${spec.target}`);
	const backupPath = resolveJournalBackupPath(root, record.backupPath);
	if (!backupPath) throw new Error("proposal mutation backup is unavailable");
	const backupStat = assertSafeEvolutionTarget(
		backupPath,
		"proposal mutation backup",
		false,
	);
	const backupBytes = readJournalBackupBytes(root, record.backupPath);
	if (!backupStat || !backupBytes || backupBytes.byteLength > MAX_TARGET_BYTES)
		throw new Error("proposal mutation backup is unavailable");
	const before = backupBytes.toString("utf8");
	if (hash(before) !== spec.beforeHash)
		throw new Error(
			"proposal mutation backup does not match the approved preimage",
		);
	if (
		typeof spec.beforeText !== "string" ||
		typeof spec.afterText !== "string"
	)
		throw new Error(
			"proposal mutation backup does not match the approved operation",
		);
	const replacement = literalReplaceOnce({
		content: before,
		before: spec.beforeText,
		after: spec.afterText,
		target: spec.target,
	});
	if (replacement.sha256 !== record.afterHash)
		throw new Error(
			"proposal mutation output does not match the approved operation",
		);
	const targetStat = assertSafeEvolutionTarget(
		spec.absolutePath,
		"proposal target",
		false,
	);
	if (
		!targetStat ||
		Number(targetStat.mode) !== Number(backupStat.mode) ||
		Number(targetStat.uid) !== Number(backupStat.uid) ||
		Number(targetStat.gid) !== Number(backupStat.gid)
	)
		throw new Error(
			"proposal target metadata changed during interrupted apply",
		);
	return {
		index: spec.index,
		target: spec.target,
		type: spec.type,
		before,
		after: replacement.content,
		beforeHash: spec.beforeHash,
		afterHash: record.afterHash,
		absolutePath: spec.absolutePath,
		metadata: {
			mode: Number(backupStat.mode),
			uid: Number(backupStat.uid),
			gid: Number(backupStat.gid),
		},
		backupPath,
		backupIdentity: {
			dev: String(backupStat.dev),
			ino: String(backupStat.ino),
		},
		mutationId: record.id,
	};
}

function reconcileInterruptedMutationBatch(input: {
	root: string;
	preview: AssistedProposalPreview;
	proposalId: string;
	mutationContext: {
		session: string;
		taskId: string;
		reason: string;
		batchId: string;
		now: Date;
	};
}): string[] | null {
	const journal = loadMutationJournalStrict(input.root);
	if (journal.issues.length > 0)
		throw new Error("proposal mutation journal is not recoverable");
	const batch = journal.records.filter(
		(record) => record.batchId === input.proposalId,
	);
	if (batch.length === 0) return null;
	const patchBatch = batch.filter(isPatchMutationRecord);
	if (patchBatch.length !== batch.length)
		throw new Error("proposal mutation batch has an unsupported record");
	const specs = proposalFileSpecs(input.root, input.preview);
	if (specs.length === 0)
		throw new Error(
			"proposal mutation batch does not match the approved operations",
		);
	const byTarget = new Map(specs.map((spec) => [spec.target, spec]));
	if (byTarget.size !== specs.length)
		throw new Error("approved proposal repeats a mutation target");
	if (patchBatch.some((record) => !byTarget.has(record.sourcePath)))
		throw new Error("proposal mutation batch has an unapproved target");

	const latest: Array<{
		spec: ProposalFileSpec;
		record: PatchMutationRecord;
		status: "committed" | "rolled_back";
		before?: FileOperation;
	}> = [];
	for (const spec of specs) {
		const history = patchBatch.filter(
			(record) => record.sourcePath === spec.target,
		);
		if (history.length === 0)
			throw new Error("proposal mutation batch is incomplete");
		if (
			history.some(
				(record) =>
					record.reason !== input.mutationContext.reason ||
					record.batchId !== input.proposalId ||
					record.beforeHash !== spec.beforeHash ||
					record.beforeExisted !== spec.beforeExisted ||
					typeof record.afterHash !== "string" ||
					!/^[a-f0-9]{64}$/.test(record.afterHash),
			)
		)
			throw new Error(
				"proposal mutation batch does not match the approved preimage",
			);
		const afterHash = history[0]?.afterHash;
		if (history.some((record) => record.afterHash !== afterHash))
			throw new Error("proposal mutation batch has conflicting output hashes");
		if (spec.type === "create_text" && afterHash !== hash(spec.content ?? ""))
			throw new Error(
				"proposal mutation output does not match the approved content",
			);
		const prepared = history.filter((record) => record.status === "prepared");
		const lastPrepared = prepared.at(-1);
		if (!lastPrepared)
			throw new Error("proposal mutation batch is missing its prepare record");
		const attempt = history.filter((record) => record.id === lastPrepared.id);
		if (
			attempt.some(
				(record) =>
					record.beforeHash !== lastPrepared.beforeHash ||
					record.afterHash !== lastPrepared.afterHash,
			)
		)
			throw new Error("proposal mutation attempt changed its journal binding");
		const terminal = attempt.at(-1);
		if (terminal?.status !== "committed" && terminal?.status !== "rolled_back")
			throw new Error(
				"proposal mutation attempt has no recoverable terminal state",
			);
		const current = readBoundedSourceFile(
			spec.absolutePath,
			"proposal target",
			{
				maxBytes: MAX_TARGET_BYTES,
				maxLines: 20_000,
				maxCandidates: 50_000,
			},
		);
		if (terminal.status === "rolled_back") {
			const matchesBefore = spec.beforeExisted
				? current !== null && hash(current) === spec.beforeHash
				: current === null;
			if (!matchesBefore)
				throw new Error(
					`proposal target drifted after rollback: ${spec.target}`,
				);
		} else {
			const record = mutationBeforeFromBackup(input.root, terminal, spec);
			if (current === null || hash(current) !== record.afterHash)
				throw new Error(`committed proposal target changed: ${spec.target}`);
			latest.push({
				spec,
				record: terminal,
				status: terminal.status,
				before: record,
			});
			continue;
		}
		latest.push({ spec, record: terminal, status: terminal.status });
	}

	if (latest.every((item) => item.status === "committed"))
		return latest.map((item) => item.record.id);
	const committed = latest
		.filter((item) => item.status === "committed")
		.map((item) => item.before as FileOperation);
	if (committed.length > 0)
		rollbackWrittenFiles(committed, input.root, input.mutationContext);
	return null;
}

function preflightNonFileOperations(
	root: string,
	preview: AssistedProposalPreview,
): void {
	for (const [index, operation] of preview.intervention.operations.entries()) {
		const type = operationRecord(operation).type;
		if (type === "replace_text" || type === "create_text") continue;
		preflightOperation(root, preview, operation, index);
	}
}

type LessonAdoptionReceipt = {
	lesson_id: string;
	version_id: string;
	field_set_digest: string;
};

type ApplyAssistedProposalResult = {
	proposal_id: string;
	version_digest: string;
	applied: true;
	duplicate: boolean;
	targets: string[];
	mutation_ids: string[];
	lesson_adoptions: LessonAdoptionReceipt[];
};

function proposalTargets(preview: AssistedProposalPreview): string[] {
	return preview.intervention.operations.map((value) => {
		const operation = operationRecord(value);
		if (typeof operation.target === "string") return operation.target;
		if (
			operation.type === "apply_lesson" &&
			typeof operation.lesson_id === "string"
		)
			return `lesson:${operation.lesson_id}`;
		return typeof operation.scope === "string" ? operation.scope : "project";
	});
}

function proposalLessonAdoptions(
	preview: AssistedProposalPreview,
): LessonAdoptionReceipt[] {
	return preview.intervention.operations.flatMap((value) => {
		const operation = operationRecord(value);
		if (
			operation.type !== "apply_lesson" ||
			typeof operation.lesson_id !== "string" ||
			typeof operation.version_id !== "string" ||
			typeof operation.field_set_digest !== "string"
		)
			return [];
		return [
			{
				lesson_id: operation.lesson_id,
				version_id: operation.version_id,
				field_set_digest: operation.field_set_digest,
			},
		];
	});
}

function currentProductionDaySequence(
	root: string,
	projectId: string,
): number | undefined {
	try {
		const config = resolveEvolutionConfig(readProjectConfig(root));
		const days = readProductionDayJournal(
			root,
			projectId,
			config.timezone,
			config.paths.evolutionEventsDir,
		);
		return distinctLocalProductionDays(days, projectId);
	} catch {
		return undefined;
	}
}

function appendAppliedReceipt(input: {
	root: string;
	projectId: string;
	proposalId: string;
	versionDigest: string;
	problemIdentity: string;
	preview: AssistedProposalPreview;
	mutationIds: string[];
	session: string;
	taskId: string;
	now: Date;
	events: ReturnType<typeof readAssistedProposalJournal>;
}): ApplyAssistedProposalResult {
	const targets = proposalTargets(input.preview);
	const lessonAdoptions = proposalLessonAdoptions(input.preview);
	const appliedProductionDaySequence = currentProductionDaySequence(
		input.root,
		input.projectId,
	);
	const event = appendAssistedProposalEvent({
		root: input.root,
		projectId: input.projectId,
		eventType: "applied",
		proposalId: input.proposalId,
		versionDigest: input.versionDigest,
		problemIdentity: input.problemIdentity,
		payload: {
			targets,
			mutation_ids: input.mutationIds,
			lesson_adoptions: lessonAdoptions,
			...(appliedProductionDaySequence === undefined
				? {}
				: { applied_production_day_sequence: appliedProductionDaySequence }),
			session: input.session,
			task_id: input.taskId,
			applied_at: input.now.toISOString(),
		},
		now: input.now,
	});
	return {
		proposal_id: input.proposalId,
		version_digest: input.versionDigest,
		applied: true,
		duplicate: event.sequence <= input.events.length,
		targets: Array.isArray(event.payload.targets)
			? (event.payload.targets as string[])
			: targets,
		mutation_ids: Array.isArray(event.payload.mutation_ids)
			? (event.payload.mutation_ids as string[])
			: input.mutationIds,
		lesson_adoptions: Array.isArray(event.payload.lesson_adoptions)
			? (event.payload.lesson_adoptions as LessonAdoptionReceipt[])
			: lessonAdoptions,
	};
}

export function applyAssistedProposal(input: {
	root: string;
	projectId: string;
	proposalId: string;
	versionDigest: string;
	session: string;
	taskId: string;
	now: Date;
	/** Narrow failure seam for transaction rollback tests. */
	afterOperationWritten?: (target: string, index: number) => void;
	/** Simulates process interruption before the committed mutation rows. */
	afterOperationWrittenAbruptly?: (target: string, index: number) => void;
	/** Simulates process interruption after the mutation journal commit point. */
	afterMutationRecordsCommitted?: () => void;
	/** Narrow failure seam for backup preparation cleanup tests. */
	afterBackupCreated?: (target: string, index: number) => void;
	/** Fails after exclusive backup creation but before its content is copied. */
	afterBackupReserved?: (target: string, index: number) => void;
}): ApplyAssistedProposalResult {
	return withAssistedProposalJournalLock(input.root, () => {
		const events = readAssistedProposalJournal(input.root, input.projectId);
		const prepared = proposalPreparedEvent(
			events,
			input.proposalId,
			input.versionDigest,
		);
		if (!prepared)
			throw new Error("assisted proposal version is missing or stale");
		const versionEvents = proposalVersionEvents(
			events,
			input.proposalId,
			input.versionDigest,
		);
		const decision = versionEvents.findLast(
			(event) => event.event_type === "decision",
		);
		if (decision?.payload.decision !== "approve")
			throw new Error("proposal apply requires approval of the exact version");
		const priorApply = versionEvents.find(
			(event) => event.event_type === "applied",
		);
		const preview = prepared.payload.preview as AssistedProposalPreview;
		if (priorApply)
			return {
				proposal_id: input.proposalId,
				version_digest: input.versionDigest,
				applied: true,
				duplicate: true,
				targets: Array.isArray(priorApply.payload.targets)
					? (priorApply.payload.targets as string[])
					: [],
				mutation_ids: Array.isArray(priorApply.payload.mutation_ids)
					? (priorApply.payload.mutation_ids as string[])
					: [],
				lesson_adoptions: Array.isArray(priorApply.payload.lesson_adoptions)
					? (priorApply.payload.lesson_adoptions as LessonAdoptionReceipt[])
					: [],
			};
		if (
			preview.project_id !== input.projectId ||
			preview.version_digest !== input.versionDigest ||
			preview.proposal_id !== input.proposalId ||
			preview.approved !== false ||
			!Array.isArray(preview.intervention?.operations) ||
			preview.intervention.operations.length < 1 ||
			preview.intervention.operations.length > 8
		)
			throw new Error("prepared proposal binding is invalid");
		for (const reference of preview.evidence_refs)
			verifyArtifactReference(input.root, reference);
		const fileTargets = proposalResourceTargets(input.root, preview);
		const mutationContext = {
			session: input.session,
			taskId: input.taskId,
			reason: `apply approved Evolve proposal ${input.proposalId}`,
			batchId: input.proposalId,
			now: input.now,
		};
		return withMutationJournalLock(input.root, () => {
			assertMutationJournalIntegrity(input.root);
			return withResourceLocks(input.root, fileTargets, () => {
				for (const reference of preview.evidence_refs)
					verifyArtifactReference(input.root, reference);
				const recoveredMutationIds = reconcileInterruptedMutationBatch({
					root: input.root,
					preview,
					proposalId: input.proposalId,
					mutationContext,
				});
				if (recoveredMutationIds) {
					preflightNonFileOperations(input.root, preview);
					return appendAppliedReceipt({
						root: input.root,
						projectId: input.projectId,
						proposalId: input.proposalId,
						versionDigest: input.versionDigest,
						problemIdentity: prepared.problem_identity,
						preview,
						mutationIds: recoveredMutationIds,
						session: input.session,
						taskId: input.taskId,
						now: input.now,
						events,
					});
				}
				const checked = preview.intervention.operations
					.map((operation, index) =>
						preflightOperation(input.root, preview, operation, index),
					)
					.filter((file): file is FileOperation => file !== null);
				const mutationIds: string[] = [];
				for (const file of checked) {
					file.mutationId = createMutationId();
					mutationIds.push(file.mutationId);
				}
				let preparedRecords: MutationRecord[] = [];
				let interrupted = false;
				let interruptionError: unknown;
				try {
					for (const file of checked) {
						if (file.before === null) continue;
						const backup = backupPath(
							input.root,
							file.mutationId as string,
							file.target,
						);
						const backupFd = openSync(
							backup,
							fsConstants.O_WRONLY |
								fsConstants.O_CREAT |
								fsConstants.O_EXCL |
								(fsConstants.O_NOFOLLOW ?? 0),
							0o600,
						);
						try {
							const opened = fstatSync(backupFd);
							if (!opened.isFile() || opened.nlink !== 1)
								throw new Error("proposal backup must be a regular file");
							file.backupPath = backup;
							file.backupIdentity = {
								dev: String(opened.dev),
								ino: String(opened.ino),
							};
							input.afterBackupReserved?.(file.target, file.index);
							const bytes = Buffer.from(file.before ?? "", "utf8");
							let offset = 0;
							while (offset < bytes.length) {
								const written = writeSync(
									backupFd,
									bytes,
									offset,
									bytes.length - offset,
									null,
								);
								if (written < 1)
									throw new Error("proposal backup write made no progress");
								offset += written;
							}
							fchmodSync(backupFd, (file.metadata?.mode ?? 0o600) & 0o7777);
							fsyncSync(backupFd);
						} finally {
							closeSync(backupFd);
						}
						const backupStat = assertSafeEvolutionTarget(
							backup,
							"proposal backup",
							false,
						);
						if (
							!backupStat ||
							String(backupStat.dev) !== file.backupIdentity?.dev ||
							String(backupStat.ino) !== file.backupIdentity?.ino
						)
							throw new Error("proposal backup could not be verified");
						input.afterBackupCreated?.(file.target, file.index);
					}
					preparedRecords = checked.map((operation) =>
						mutationRecord({ operation, ...mutationContext }, "prepared"),
					);
					if (preparedRecords.length > 0)
						appendMutationRecords(input.root, preparedRecords);
				} catch (error) {
					const cleanupErrors: unknown[] = [];
					try {
						const journal = loadMutationJournalStrict(input.root);
						const recoverableIssues = journal.issues.every((issue) =>
							issue.startsWith("unmatched-prepared:"),
						);
						const batch = journal.records.filter(
							(record) => record.batchId === input.proposalId,
						);
						const terminalIds = new Set(
							batch
								.filter((record) =>
									["applied", "committed", "rolled_back"].includes(
										record.status,
									),
								)
								.map((record) => record.id),
						);
						const pending = checked.filter(
							(file) =>
								file.mutationId &&
								batch.some(
									(record) =>
										record.id === file.mutationId &&
										record.status === "prepared",
								) &&
								!terminalIds.has(file.mutationId),
						);
						const targetsUnchanged = checked.every(
							(file) =>
								readBoundedSourceFile(file.absolutePath, "proposal target", {
									maxBytes: MAX_TARGET_BYTES,
									maxLines: 20_000,
									maxCandidates: 50_000,
								}) === file.before,
						);
						if (recoverableIssues && pending.length > 0 && targetsUnchanged)
							appendMutationRecords(
								input.root,
								pending.map((operation) =>
									mutationRecord(
										{ operation, ...mutationContext },
										"rolled_back",
									),
								),
							);
					} catch (cleanupError) {
						cleanupErrors.push(cleanupError);
					}
					cleanupErrors.push(...cleanupCreatedBackups(input.root, checked));
					if (cleanupErrors.length > 0)
						throw new AggregateError(
							[error, ...cleanupErrors],
							"approved proposal preparation failed and cleanup was incomplete",
						);
					throw error;
				}
				try {
					for (const file of checked) {
						if (file.metadata)
							atomicWriteTextPreservingMetadata(
								file.absolutePath,
								file.after,
								file.metadata,
							);
						else atomicWriteText(file.absolutePath, file.after);
						input.afterOperationWritten?.(file.target, file.index);
						try {
							input.afterOperationWrittenAbruptly?.(file.target, file.index);
						} catch (error) {
							interrupted = true;
							interruptionError = error;
							break;
						}
					}
					if (!interrupted && preparedRecords.length > 0)
						appendMutationRecords(
							input.root,
							checked.map((operation) =>
								mutationRecord({ operation, ...mutationContext }, "committed"),
							),
						);
				} catch (error) {
					try {
						rollbackWrittenFiles(checked, input.root, mutationContext);
					} catch (rollbackError) {
						throw new AggregateError(
							[error, rollbackError],
							"approved proposal apply failed and rollback was incomplete",
						);
					}
					throw error;
				}
				if (interrupted) throw interruptionError;
				input.afterMutationRecordsCommitted?.();
				try {
					return appendAppliedReceipt({
						root: input.root,
						projectId: input.projectId,
						proposalId: input.proposalId,
						versionDigest: input.versionDigest,
						problemIdentity: prepared.problem_identity,
						preview,
						mutationIds,
						session: input.session,
						taskId: input.taskId,
						now: input.now,
						events,
					});
				} catch (error) {
					try {
						rollbackWrittenFiles(checked, input.root, mutationContext);
					} catch (rollbackError) {
						throw new AggregateError(
							[error, rollbackError],
							"approved proposal apply failed and rollback was incomplete",
						);
					}
					throw error;
				}
			});
		});
	});
}
