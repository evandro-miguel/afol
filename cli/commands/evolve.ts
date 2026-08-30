import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { basename, join, relative } from "node:path";
import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	assertAdmittedOperationContext,
	defaultOperationContext,
	isActionAllowed,
	isTrustedLocalInteractive,
	type OperationContext,
} from "../core/operation-context";
import {
	analyzeEvolutionProject,
	assertSafeEvolutionProjectRoot,
	assertSafeEvolutionTarget,
	checkEvolutionDbHealth,
	confirmExternalImport,
	type DailySuggestionPreview,
	type EvolutionDbHealth,
	type EvolutionStatus,
	evolutionDbPath,
	getEvolutionStatus,
	listExternalImports,
	observationJournalPath,
	openEvolutionDb,
	preferenceJournalPath,
	previewDailySuggestion,
	previewExternalImport,
	previewProposalEvaluation,
	productionDayJournalPath,
	type RecurrenceThresholds,
	readObservationJournal,
	readPreferenceJournal,
	readProductionDayJournal,
	recordProposalEvaluation,
	recordProposalSupersession,
	redactSensitiveText,
	repairEvolutionDerivedState,
	resolveDailySuggestion,
	resolveEvolutionConfig,
	withEvolutionDbSnapshot,
} from "../services/evolution";
import {
	discoverAdoptionCandidates,
	reviewAdoptionCandidate,
} from "../services/evolution/adoption-candidates";
import {
	applyEvolutionProposal,
	rollbackEvolutionProposal,
} from "../services/evolution/apply-service";
import { localDateForTimezone } from "../services/evolution/config";
import { previewHistoryBackfill } from "../services/evolution/history-backfill";
import type { ImportProvider } from "../services/evolution/imports";
import { ingestObservationsForSession } from "../services/evolution/observation-ingest";
import {
	dispatchSuggestionDecision,
	suggestionDecisionForAuthority,
} from "../services/evolution/suggestion-authority";
import {
	acknowledgeDailySuggestion,
	claimDailySuggestion,
	projectSuggestionReceipts,
	readSuggestionReceiptJournal,
	suggestionJournalPath,
} from "../services/evolution/suggestion-journal";
import { observeSessionLock } from "../services/io/session-lock";
import {
	readProjectConfig,
	resolveProjectPaths,
} from "../services/project/paths";
import {
	assertTaskInProgress,
	readActiveSession,
} from "../services/workbench/lifecycle";
import { verifyWorkbenchTasks } from "../services/workbench/verify";
import { type CommandIo, DEFAULT_IO } from "./io";

const CONTROL_CHARACTER = /\p{Cc}/u;
const MAX_OBSERVE_IDENTIFIER_LENGTH = 256;
const MAX_ANALYSIS_OUTPUT_BYTES = 4_000;
const MAX_ANALYSIS_PUBLIC_TEXT_BYTES = 128;
const MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES = 160;
const MAX_ANALYSIS_PUBLIC_REF_ID_BYTES = 64;
const MAX_ANALYSIS_PUBLIC_REF_LABEL_BYTES = 32;
const MAX_ANALYSIS_DTO_BYTES = 3_800;

function assertObserveIdentifier(value: string, label: string): void {
	if (
		value.length > MAX_OBSERVE_IDENTIFIER_LENGTH ||
		CONTROL_CHARACTER.test(value)
	)
		throw new Error(`${label} is invalid`);
}

export function parseObserveArgs(
	args: readonly string[],
):
	| { session: string; feedbackId: string; json: boolean }
	| { session: string; json: boolean } {
	let session = "";
	let feedbackId: string | undefined;
	let json = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg) continue;
		if (arg === "--session" || arg === "-S") {
			i++;
			const value = args[i];
			if (!value || value.startsWith("-"))
				throw new Error("--session requires a value");
			assertObserveIdentifier(value, "session identifier");
			session = value;
			continue;
		}
		if (arg === "--feedback-id" || arg === "-F") {
			i++;
			const value = args[i];
			if (!value || value.startsWith("-"))
				throw new Error("--feedback-id requires a value");
			assertObserveIdentifier(value, "feedback identifier");
			feedbackId = value;
			continue;
		}
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		throw new Error(`Unknown evolve observe argument: ${arg}`);
	}
	if (!session) throw new Error("evolve observe requires --session <id>");
	return {
		session,
		...(feedbackId !== undefined ? { feedbackId } : {}),
		json,
	};
}

export function runObserveCommand(
	args: readonly string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
	operationContext: OperationContext | undefined,
): number {
	assertAdmittedOperationContext(operationContext);
	if (
		!isActionAllowed(operationContext, {
			action: "evolve.observe",
			sideEffect: "write",
		})
	) {
		const message = "evolve.observe requires local interactive approval";
		if (args.includes("--json") || args.includes("-j")) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("approval-required", message, {
						action: "evolve.observe",
						exitCode: 2,
					}),
				),
			);
		} else {
			io.stderr(message);
		}
		return 2;
	}
	let parsed: ReturnType<typeof parseObserveArgs>;
	try {
		parsed = parseObserveArgs(args);
	} catch (parseError) {
		const message = (parseError as Error).message;
		const json = args.includes("--json") || args.includes("-j");
		if (json) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("EVOLVE_OBSERVE_FAILED", message, {
						action: "evolve.observe",
						exitCode: 2,
					}),
				),
			);
		} else {
			io.stderr(message);
		}
		return 2;
	}

	const resolved = resolveEvolutionConfig(readProjectConfig(projectRoot));
	if (!resolved.configured || !resolved.projectId || !resolved.enabled) {
		const message = !resolved.enabled
			? "evolution is disabled"
			: "evolution is not configured or lacks a project id";
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("EVOLVE_OBSERVE_FAILED", message, {
						action: "evolve.observe",
						exitCode: 1,
					}),
				),
			);
		} else {
			io.stderr(message);
		}
		return 1;
	}
	try {
		const result = ingestObservationsForSession({
			root: projectRoot,
			projectId: resolved.projectId,
			session: parsed.session,
			...("feedbackId" in parsed ? { feedbackId: parsed.feedbackId } : {}),
		});
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeOk(result, {
						action: "evolve.observe",
						exitCode: 0,
					}),
				),
			);
		} else {
			const lines: string[] = [];
			lines.push(
				`appended=${result.appended} duplicates=${result.duplicates} skipped=${result.skipped}`,
			);
			if (result.observation_ids.length > 0)
				lines.push(`observation_ids=${result.observation_ids.join(",")}`);
			if (result.warnings.length > 0)
				lines.push(`warnings=${result.warnings.join("; ")}`);
			io.stdout(lines.join("\n"));
		}
		return 0;
	} catch (error) {
		const message = (error as Error).message;
		if (parsed.json) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr("EVOLVE_OBSERVE_FAILED", message, {
						action: "evolve.observe",
						exitCode: 2,
					}),
				),
			);
		} else {
			io.stderr(message);
		}
		return 2;
	}
}

function parseImportArgs(args: readonly string[]): {
	provider: ImportProvider;
	source: string;
	confirm: boolean;
	json: boolean;
} {
	const provider = args[0];
	if (provider !== "codex" && provider !== "pi")
		throw new Error("evolve import requires codex or pi");
	let source = "";
	let confirm = false;
	let json = false;
	for (let index = 1; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json" || arg === "-j") json = true;
		else if (arg === "--confirm") confirm = true;
		else if (arg === "--source") {
			source = args[++index] ?? "";
			if (!source || source.startsWith("-"))
				throw new Error("evolve import --source requires a value");
		} else throw new Error(`Unknown evolve import argument: ${arg}`);
	}
	if (!source) throw new Error("evolve import requires --source <path>");
	return { provider, source, confirm, json };
}

function parseExternalArgs(args: readonly string[]): { json: boolean } {
	if (args[0] !== "list") throw new Error("evolve external requires list");
	let json = false;
	for (const arg of args.slice(1)) {
		if (arg === "--json" || arg === "-j") json = true;
		else throw new Error(`Unknown evolve external argument: ${arg}`);
	}
	return { json };
}

function importPreviewPayload(
	preview: Awaited<ReturnType<typeof previewExternalImport>>,
	mode: "preview" | "confirmed",
): Record<string, unknown> {
	return {
		mode,
		provider: preview.provider,
		import_id: preview.importId,
		adapter_version: preview.adapterVersion,
		source_path: preview.manifest.source_path
			? basename(preview.manifest.source_path)
			: null,
		bytes: preview.bytes,
		lines: preview.lines,
		records: preview.records,
		sessions: preview.sessions,
		warnings: preview.warnings,
		redacted: true,
		raw_stored: false,
	};
}

async function runImport(
	args: string[],
	root: string,
	io: CommandIo,
	operationContext: OperationContext,
): Promise<number> {
	const parsed = parseImportArgs(args);
	assertAdmittedOperationContext(operationContext);
	const policy = {
		action: parsed.confirm ? "evolve.import.confirm" : "evolve.import.preview",
		sideEffect: parsed.confirm ? ("write" as const) : ("preview" as const),
	};
	if (!isActionAllowed(operationContext, policy))
		throw new Error(
			"evolve import confirmation is not allowed for this caller",
		);
	if (!parsed.confirm) {
		const preview = await previewExternalImport(
			root,
			parsed.provider,
			parsed.source,
		);
		writeEvolutionPayload(
			io,
			parsed.json,
			"evolve.import",
			importPreviewPayload(preview, "preview"),
			operationContext,
		);
		return 0;
	}
	const accepted = await confirmExternalImport({
		root,
		provider: parsed.provider,
		source: parsed.source,
	});
	writeEvolutionPayload(
		io,
		parsed.json,
		"evolve.import",
		{
			...importPreviewPayload(accepted.preview, "confirmed"),
			artifact_path: relative(root, accepted.artifactPath).replaceAll(
				"\\",
				"/",
			),
			duplicate: accepted.duplicate,
			checkpoint_status: accepted.checkpoint?.status ?? null,
		},
		operationContext,
	);
	return 0;
}

function runExternalList(
	args: string[],
	root: string,
	io: CommandIo,
	operationContext: OperationContext,
): number {
	const parsed = parseExternalArgs(args);
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	if (!resolved.projectId) throw new Error("evolution project id is required");
	const dbPath = evolutionDbPath(root, resolved.paths.evolutionDb);
	let rows: ReturnType<typeof listExternalImports> = [];
	if (existsSync(dbPath)) {
		assertSafeEvolutionTarget(dbPath, "evolution db", false);
		rows = withEvolutionDbSnapshot(dbPath, (db) =>
			listExternalImports(db, resolved.projectId as string),
		);
	}
	const imports = rows.map((row) => ({
		import_id: row.import_id,
		provider: row.provider,
		adapter_version: row.adapter_version,
		source_format: row.source_format,
		source_path: row.source_path ? basename(row.source_path) : null,
		imported_at: row.imported_at,
		session_count: row.session_count,
		message_count: row.message_count,
		link_status: row.link_status,
		trust: row.trust,
		redacted: row.redacted,
		raw_stored: row.raw_stored,
		warnings: row.warnings,
	}));
	writeEvolutionPayload(
		io,
		parsed.json,
		"evolve.external.list",
		{ imports },
		operationContext,
	);
	return 0;
}

function parseSuggestArgs(args: readonly string[]): {
	json: boolean;
	firstSession: boolean;
	claimedBy: string;
} {
	let json = false;
	let firstSession = false;
	let claimedBy = "afol";
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json" || arg === "-j") json = true;
		else if (arg === "--first-session") firstSession = true;
		else if (arg === "--claimed-by") {
			claimedBy = args[++index] ?? "";
			if (!claimedBy) throw new Error("--claimed-by requires a value");
			if (!SUGGESTION_CLAIM_PROVIDERS.has(claimedBy))
				throw new Error(`Unsupported suggestion provider: ${claimedBy}`);
		} else throw new Error(`Unknown evolve suggest argument: ${arg}`);
	}
	if (!firstSession) throw new Error("evolve suggest requires --first-session");
	return { json, firstSession, claimedBy };
}

function parseDecisionArgs(args: readonly string[]): {
	json: boolean;
	suggestionId: string;
	reason?: string;
} {
	let json = false;
	let suggestionId = "";
	let reason: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json" || arg === "-j") json = true;
		else if (arg === "--reason") {
			reason = args[++index];
			if (!reason || reason.startsWith("-"))
				throw new Error("--reason requires a value");
		} else if (!suggestionId && arg) suggestionId = arg;
		else throw new Error(`Unknown evolve decision argument: ${arg}`);
	}
	if (!suggestionId)
		throw new Error("suggestion decision requires a suggestion id");
	return { json, suggestionId, ...(reason === undefined ? {} : { reason }) };
}

type EvolutionAnalysisAction = "analyze" | "weekly" | "after-merge" | "review";
const MAX_ANALYSIS_ARGUMENT_LENGTH = 256;
const ANALYSIS_CONTROL_CHARACTER = /\p{Cc}/u;

function parseAnalysisArgs(
	action: EvolutionAnalysisAction,
	args: readonly string[],
): { json: boolean; mergeRange?: string; proposalId?: string } {
	let json = false;
	let positional: string | undefined;
	for (const arg of args) {
		if (arg === "--json" || arg === "-j") json = true;
		else if (!positional && arg && !arg.startsWith("-")) {
			if (
				arg.length > MAX_ANALYSIS_ARGUMENT_LENGTH ||
				ANALYSIS_CONTROL_CHARACTER.test(arg)
			)
				throw new Error(`evolve ${action} argument is invalid`);
			positional = arg;
		} else throw new Error(`Unsupported evolve ${action} argument`);
	}
	if (action === "after-merge") {
		if (!positional)
			throw new Error("evolve after-merge requires <base>..<head>");
		return { json, mergeRange: positional };
	}
	if (action === "review") {
		if (!positional) throw new Error("evolve review requires <proposal-id>");
		return { json, proposalId: positional };
	}
	if (positional)
		throw new Error(`evolve ${action} does not accept positional arguments`);
	return { json };
}

function controlledGitExecutable(): string {
	const candidates =
		process.platform === "win32"
			? ["C:\\Program Files\\Git\\cmd\\git.exe"]
			: [
					"/usr/bin/git",
					"/bin/git",
					"/usr/local/bin/git",
					"/opt/homebrew/bin/git",
				];
	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		try {
			return realpathSync(candidate);
		} catch {
			// Try the next fixed system location.
		}
	}
	throw new Error(
		"evolve after-merge requires a controlled local git executable",
	);
}

function gitReadOnlyEnv(): NodeJS.ProcessEnv {
	const env = Object.fromEntries(
		[
			"PATH",
			"LANG",
			"LC_ALL",
			"LC_CTYPE",
			"SystemRoot",
			"SystemDrive",
			"windir",
		].flatMap((key) =>
			process.env[key] === undefined ? [] : [[key, process.env[key]]],
		),
	) as NodeJS.ProcessEnv;
	return {
		...env,
		GIT_NO_LAZY_FETCH: "1",
		GIT_OPTIONAL_LOCKS: "0",
		GIT_TERMINAL_PROMPT: "0",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
		GIT_CONFIG_SYSTEM: process.platform === "win32" ? "NUL" : "/dev/null",
	};
}

function runLocalGit(root: string, args: readonly string[]) {
	return spawnSync(controlledGitExecutable(), [...args], {
		cwd: root,
		env: gitReadOnlyEnv(),
		encoding: "utf8",
		maxBuffer: 1_048_576,
		shell: false,
		timeout: 3_000,
		windowsHide: true,
	});
}

function parseEvaluateArgs(args: readonly string[]): {
	mutationId: string;
	json: boolean;
	record: boolean;
	supersededBy?: string;
	reason?: string;
} {
	let mutationId = "";
	let json = false;
	let record = false;
	let supersededBy: string | undefined;
	let reason: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json" || arg === "-j") json = true;
		else if (arg === "--record") record = true;
		else if (arg === "--superseded-by") {
			supersededBy = args[++index];
			if (!supersededBy || supersededBy.startsWith("-"))
				throw new Error("--superseded-by requires a mutation id");
		} else if (arg === "--reason") {
			reason = args[++index];
			if (!reason || reason.startsWith("-"))
				throw new Error("--reason requires a value");
		} else if (!mutationId && arg && !arg.startsWith("-")) mutationId = arg;
		else throw new Error(`Unknown evolve evaluate argument: ${arg}`);
	}
	if (!mutationId) throw new Error("evolve evaluate requires <mutation-id>");
	if (supersededBy && !record)
		throw new Error("evolve evaluate supersession requires --record");
	if (supersededBy && !reason)
		throw new Error("evolve evaluate supersession requires --reason <text>");
	return {
		mutationId,
		json,
		record,
		...(supersededBy ? { supersededBy } : {}),
		...(reason ? { reason } : {}),
	};
}

async function runEvaluate(
	args: string[],
	root: string,
	io: CommandIo,
	operationContext: OperationContext,
	now: Date,
): Promise<number> {
	const parsed = parseEvaluateArgs(args);
	const projectId = resolveEvolutionConfig(readProjectConfig(root)).projectId;
	if (!projectId) throw new Error("evolution project id is required");
	if (!parsed.record) {
		if (parsed.supersededBy)
			throw new Error("evolve evaluate supersession requires --record");
		writeEvolutionPayload(
			io,
			parsed.json,
			"evolve.evaluate",
			previewProposalEvaluation(root, parsed.mutationId, projectId),
			operationContext,
		);
		return 0;
	}
	assertAdmittedOperationContext(operationContext);
	if (
		!isActionAllowed(operationContext, {
			action: "evolve.evaluate",
			sideEffect: "write",
		})
	)
		throw new Error("evolve evaluate --record requires local interactive mode");
	const { session, taskId } = resolveSingleInProgressTask(root);
	const result = parsed.supersededBy
		? recordProposalSupersession({
				root,
				projectId,
				subjectMutationId: parsed.mutationId,
				successorMutationId: parsed.supersededBy,
				reason: parsed.reason as string,
				invocationClass: "explicit_local",
				session,
				taskId,
				now,
			})
		: recordProposalEvaluation({
				root,
				projectId,
				mutationId: parsed.mutationId,
				invocationClass: "explicit_local",
				session,
				taskId,
				now,
			});
	writeEvolutionPayload(
		io,
		parsed.json,
		"evolve.evaluate",
		result,
		operationContext,
	);
	return 0;
}

function parseProposalMutationArgs(
	action: "apply" | "rollback",
	args: readonly string[],
): { proposalId: string; json: boolean } {
	let proposalId = "";
	let json = false;
	for (const arg of args) {
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (!proposalId && arg && !arg.startsWith("-")) {
			proposalId = arg;
			continue;
		}
		throw new Error(`Unsupported evolve ${action} argument`);
	}
	if (!proposalId) throw new Error(`evolve ${action} requires <proposal-id>`);
	return { proposalId, json };
}

function resolveSingleInProgressTask(root: string): {
	session: string;
	taskId: string;
} {
	const session = readActiveSession(root);
	if (!session)
		throw new Error("evolve mutation requires an active workbench session");
	const sessionPath = join(resolveProjectPaths(root).abs.wbDir, session);
	const verification = verifyWorkbenchTasks(sessionPath);
	const inProgress = verification.openTasks.filter(
		(task) => task.state === "in_progress",
	);
	if (inProgress.length !== 1) {
		throw new Error(
			`evolve mutation requires exactly one in-progress task (found ${inProgress.length})`,
		);
	}
	const taskId = inProgress[0]?.id;
	if (!taskId)
		throw new Error("evolve mutation could not resolve the in-progress task");
	assertTaskInProgress(root, session, taskId);
	return { session, taskId };
}

function evolutionPolicyMode(root: string): string {
	const settings = resolveEvolutionConfig(readProjectConfig(root)).settings;
	const autonomy = settings.autonomy;
	if (autonomy && typeof autonomy === "object" && !Array.isArray(autonomy)) {
		const mode = (autonomy as Record<string, unknown>).auto_apply_mode;
		if (typeof mode === "string" && mode.length > 0) return mode;
	}
	return "none";
}

async function runProposalMutation(
	action: "apply" | "rollback",
	args: string[],
	root: string,
	io: CommandIo,
	operationContext: OperationContext,
	now: Date,
): Promise<number> {
	const parsed = parseProposalMutationArgs(action, args);
	assertAdmittedOperationContext(operationContext);
	if (
		!isActionAllowed(operationContext, {
			action: `evolve.${action}`,
			sideEffect: "write",
		})
	) {
		throw new Error(`evolve ${action} requires local interactive mode`);
	}
	const { session, taskId } = resolveSingleInProgressTask(root);
	const projectId = resolveEvolutionConfig(readProjectConfig(root)).projectId;
	if (!projectId) {
		throw new Error("evolution project id is required");
	}
	const proposal =
		action === "apply"
			? analyzeEvolutionProject(root, { now }).proposals.find(
					(entry) => entry.id === parsed.proposalId,
				)
			: undefined;
	if (action === "apply" && !proposal)
		throw new Error("evolution proposal preview is missing or stale");
	const policyMode = evolutionPolicyMode(root) as
		| "none"
		| "canary"
		| "lessons_memory_only";
	const result =
		action === "apply"
			? applyEvolutionProposal({
					root,
					projectId,
					proposal: proposal as NonNullable<typeof proposal> &
						Record<string, unknown>,
					invocationClass: "explicit_local",
					policyMode,
					session,
					taskId,
					now,
				})
			: rollbackEvolutionProposal({
					root,
					projectId,
					proposalId: parsed.proposalId,
					invocationClass: "explicit_local",
					policyMode,
					session,
					taskId,
					now,
				});
	writeEvolutionPayload(
		io,
		parsed.json,
		`evolve.${action}`,
		result,
		operationContext,
	);
	return 0;
}

function resolveCommitRange(
	root: string,
	range: string,
): { base: string; head: string; commitIds: string[] } {
	const match = /^([a-f0-9]{7,64})\.\.([a-f0-9]{7,64})$/.exec(range);
	if (!match)
		throw new Error("evolve after-merge requires two hexadecimal commit SHAs");
	const base = match[1];
	const head = match[2];
	if (!base || !head)
		throw new Error("evolve after-merge requires two hexadecimal commit SHAs");
	const canonicalRoot = realpathSync(root);
	for (const sha of [base, head]) {
		const result = runLocalGit(canonicalRoot, [
			"--no-pager",
			"--no-optional-locks",
			"--no-lazy-fetch",
			"--no-replace-objects",
			"cat-file",
			"-e",
			`${sha}^{commit}`,
		]);
		if (result.error || result.status !== 0)
			throw new Error("evolve after-merge requires existing commit SHAs");
	}
	const rangeResult = runLocalGit(canonicalRoot, [
		"--no-pager",
		"--no-optional-locks",
		"--no-lazy-fetch",
		"--no-replace-objects",
		"rev-list",
		"--max-count=1001",
		head,
		`^${base}`,
	]);
	if (rangeResult.error || rangeResult.status !== 0)
		throw new Error("evolve after-merge could not resolve the commit range");
	const commitIds = rangeResult.stdout.trim().split(/\r?\n/).filter(Boolean);
	if (
		commitIds.length > 1_000 ||
		commitIds.some((commit) => !/^[a-f0-9]{40,64}$/.test(commit))
	)
		throw new Error("evolve after-merge commit range is invalid or too large");
	return { base, head, commitIds };
}

function publicValue(value: unknown, restricted: boolean): unknown {
	if (Array.isArray(value))
		return value.map((item) => publicValue(item, restricted));
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(
					([key]) =>
						!/(?:token|digest)/i.test(key) &&
						(!restricted ||
							!/(?:^db_path$|^project_id$|^cluster_id$|session_id|related_session_ids|source_refs|origin_ref)/i.test(
								key,
							)),
				)
				.map(([key, item]) => [key, publicValue(item, restricted)]),
		);
	return value;
}

function writeEvolutionPayload(
	io: CommandIo,
	json: boolean,
	action: string,
	payload: Record<string, unknown>,
	operationContext: OperationContext,
): void {
	const safe = publicValue(
		payload,
		!isTrustedLocalInteractive(operationContext),
	) as Record<string, unknown>;
	if (json) io.stdout(stringifyEnvelope(envelopeOk(safe, { action })));
	else io.stdout(JSON.stringify(safe, null, 2));
}

type PublicAnalysisMetric = {
	value: number | null;
	better: "lower" | "higher";
};
type PublicAnalysisScorecard = Record<
	string,
	Record<string, PublicAnalysisMetric>
>;
type PublicAnalysisProposal = {
	id?: string;
	fingerprint_version: number;
	rank: number;
	problem: string;
	recommendation: string;
	risk: string;
	validation: string;
	problem_truncated: boolean;
	problem_digest: string;
	recommendation_truncated: boolean;
	recommendation_digest: string;
	risk_truncated: boolean;
	risk_digest: string;
	validation_truncated: boolean;
	validation_digest: string;
	impact: PublicImpactCategory;
	score: number;
	confidence: number;
	occurrence_count: number;
	distinct_production_day_count: number;
	target_metrics?: Readonly<Record<string, number | null>>;
	distinct_session_count?: number;
	related_session_count?: number;
	related_session_ids?: readonly string[];
	evidence_refs?: readonly PublicAnalysisEvidenceRef[];
	evidence_ref_count?: number;
	baseline?: {
		window: "recorded";
		observation_count: number;
		production_day_count: number;
		minimum_comparable_sessions: number;
		production_day_window: number;
	};
	targets?: {
		minimum_comparable_sessions: number;
		production_day_window: number;
		state: "canary";
		metrics: Readonly<Record<string, number | null>>;
	};
	approval_policy?: "explicit";
	approval_surface?: "governed_workbench";
	target_kind?: "governance" | "behavior" | "documentation" | "code";
	target_refs?: readonly PublicAnalysisEvidenceRef[];
	target_ref_count?: number;
	target_refs_truncated?: boolean;
	provenance_digest?: string;
	classification?: "classified" | "needs_review";
	approval_required?: true;
	execution_surface?: "governed_workbench";
};
type PublicAnalysisEvidenceRef = {
	id: string;
	kind: string;
	authority?: string;
};
type PublicAnalysisAlert = {
	problem: string;
	risk: string;
	validation: string;
	impact: PublicImpactCategory;
	occurrence_count: number;
	distinct_production_day_count: number;
};
type PublicImpactCategory =
	| "rework"
	| "quality"
	| "security"
	| "integrity"
	| "data_loss"
	| "latency"
	| "efficiency"
	| "user_load"
	| "workflow"
	| "unknown";
type PublicEvolutionAnalysisDto = {
	version: number;
	mode: string;
	status: string;
	blocked_reason: string | null;
	recovery_action: string | null;
	generated_at: string;
	scorecard: PublicAnalysisScorecard;
	baseline: {
		window: "recorded";
		observation_count: number;
		production_day_count: number;
		scorecard: PublicAnalysisScorecard;
	};
	proposals: readonly PublicAnalysisProposal[];
	proposal_available_count: number;
	proposal_truncated: boolean;
	pending_count: number;
	critical_alerts: readonly PublicAnalysisAlert[];
	critical_alerts_truncated: boolean;
	critical_alert_count: number;
	critical_alert_pending_count: number;
	legacy_cluster_count: number;
};

function truncateUtf8(value: string, maxBytes: number): string {
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
	const suffix = "...";
	const contentBudget = Math.max(
		0,
		maxBytes - Buffer.byteLength(suffix, "utf8"),
	);
	let result = "";
	let bytes = 0;
	for (const codePoint of value) {
		const codePointBytes = Buffer.byteLength(codePoint, "utf8");
		if (bytes + codePointBytes > contentBudget) break;
		result += codePoint;
		bytes += codePointBytes;
	}
	return `${result}${suffix}`;
}

function boundedPublicTextTo(value: unknown, maxBytes: number): string {
	const redacted = redactSensitiveText(value, { redactPaths: true }).replace(
		/\p{Cc}/gu,
		" ",
	);
	return truncateUtf8(redacted, maxBytes);
}

function boundedPublicText(value: unknown): string {
	return boundedPublicTextTo(value, MAX_ANALYSIS_PUBLIC_TEXT_BYTES);
}

function publicText(
	value: unknown,
	maxBytes: number,
): {
	text: string;
	truncated: boolean;
	digest: string;
} {
	const redacted = redactSensitiveText(value, { redactPaths: true }).replace(
		/\p{Cc}/gu,
		" ",
	);
	return {
		text: truncateUtf8(redacted, maxBytes),
		truncated: Buffer.byteLength(redacted, "utf8") > maxBytes,
		digest: createHash("sha256").update(redacted).digest("hex"),
	};
}

function boundedPublicIdentifier(value: unknown, maxBytes = 128): string {
	if (
		typeof value !== "string" ||
		!/[A-Za-z0-9]/.test(value) ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ||
		/(?:token|secret|password|api[_-]?key|access[_-]?token|authorization|bearer)/i.test(
			value,
		) ||
		/^(?:gh[pousr]_|github_pat_|AKIA|ASIA|xox[baprs]-|eyJ[A-Za-z0-9_-]*\.)/.test(
			value,
		)
	)
		return "";
	const redacted = redactSensitiveText(value, { redactPaths: true });
	if (redacted !== value.toLowerCase() || redacted.includes("<redacted"))
		return "";
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
	return `${value.slice(0, maxBytes - 3)}...`;
}

function publicImpact(value: unknown): PublicImpactCategory {
	const impact = redactSensitiveText(value).replaceAll("-", "_");
	if (impact === "rework") return "rework";
	if (["regression", "test_failure"].includes(impact)) return "quality";
	if (["security", "security_error", "secret_exposure"].includes(impact))
		return "security";
	if (["integrity", "integrity_error"].includes(impact)) return "integrity";
	if (["data_loss", "data_loss_error"].includes(impact)) return "data_loss";
	if (impact === "latency_outlier") return "latency";
	if (impact === "token_outlier") return "efficiency";
	if (["user_correction", "unnecessary_user_intervention"].includes(impact))
		return "user_load";
	if (impact === "workflow_friction") return "workflow";
	return "unknown";
}

function publicMetric(value: unknown): PublicAnalysisMetric {
	const metric = value as { value?: unknown; better?: unknown };
	return {
		value:
			typeof metric.value === "number" && Number.isFinite(metric.value)
				? metric.value
				: null,
		better: metric.better === "higher" ? "higher" : "lower",
	};
}

function publicScorecard(value: unknown): PublicAnalysisScorecard {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(
			([dimension, metrics]) => [
				dimension,
				metrics && typeof metrics === "object" && !Array.isArray(metrics)
					? Object.fromEntries(
							Object.entries(metrics as Record<string, unknown>)
								.filter(([key]) => !/token|digest|secret/i.test(key))
								.map(([key, metric]) => [key, publicMetric(metric)]),
						)
					: {},
			],
		),
	);
}

export function publicAnalysisDto(
	analysis: Record<string, unknown>,
	restricted: boolean,
): PublicEvolutionAnalysisDto {
	const baseline = (analysis.baseline ?? {}) as Record<string, unknown>;
	const publicTargetMetrics = (
		value: unknown,
	): Readonly<Record<string, number | null>> =>
		value && typeof value === "object" && !Array.isArray(value)
			? Object.fromEntries(
					Object.entries(value as Record<string, unknown>).map(
						([key, metric]) => [
							key,
							typeof metric === "number" && Number.isFinite(metric)
								? metric
								: null,
						],
					),
				)
			: {};
	const publicEvidenceRefs = (
		value: unknown,
	): readonly PublicAnalysisEvidenceRef[] =>
		Array.isArray(value)
			? value
					.slice(0, 4)
					.map((item) => {
						const ref = item as Record<string, unknown>;
						const id = boundedPublicIdentifier(
							ref.id,
							MAX_ANALYSIS_PUBLIC_REF_ID_BYTES,
						);
						const kind = boundedPublicIdentifier(
							ref.kind,
							MAX_ANALYSIS_PUBLIC_REF_LABEL_BYTES,
						);
						const authority = boundedPublicIdentifier(
							ref.authority,
							MAX_ANALYSIS_PUBLIC_REF_LABEL_BYTES,
						);
						return {
							id,
							kind,
							...(authority ? { authority } : {}),
						};
					})
					.filter((ref) => ref.id && ref.kind)
			: [];
	const safeProposal = (
		proposal: Record<string, unknown>,
	): PublicAnalysisProposal => {
		const problem = publicText(
			proposal.problem,
			MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES,
		);
		const recommendation = publicText(
			proposal.recommendation,
			MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES,
		);
		const risk = publicText(
			proposal.risk,
			MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES,
		);
		const validation = publicText(
			proposal.validation,
			MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES,
		);
		const proposalBaseline = (proposal.baseline ?? {}) as Record<
			string,
			unknown
		>;
		const proposalTargets = (proposal.targets ?? {}) as Record<string, unknown>;
		const targetRefs = publicEvidenceRefs(proposal.target_refs);
		const relatedSessionIds = Array.isArray(proposal.related_session_ids)
			? proposal.related_session_ids
					.map((id) => boundedPublicIdentifier(id, 64))
					.filter(Boolean)
					.slice(0, 4)
			: [];
		const evidenceRefs = publicEvidenceRefs(proposal.evidence_refs);
		const targetKind =
			proposal.target_kind === "governance" ||
			proposal.target_kind === "documentation" ||
			proposal.target_kind === "code"
				? proposal.target_kind
				: "behavior";
		return {
			rank: Number(proposal.rank) || 0,
			problem: problem.text,
			problem_truncated: problem.truncated,
			problem_digest: problem.digest,
			recommendation: recommendation.text,
			recommendation_truncated: recommendation.truncated,
			recommendation_digest: recommendation.digest,
			risk: risk.text,
			risk_truncated: risk.truncated,
			risk_digest: risk.digest,
			validation: validation.text,
			validation_truncated: validation.truncated,
			validation_digest: validation.digest,
			impact: publicImpact(proposal.impact),
			score: Number(proposal.score) || 0,
			confidence: Number(proposal.confidence) || 0,
			occurrence_count: Number(proposal.occurrence_count) || 0,
			distinct_production_day_count:
				Number(proposal.distinct_production_day_count) || 0,
			id: boundedPublicIdentifier(proposal.id),
			fingerprint_version: Number(proposal.fingerprint_version) || 0,
			distinct_session_count: Number(proposal.distinct_session_count) || 0,
			related_session_count: Number(proposal.related_session_count) || 0,
			related_session_ids: relatedSessionIds,
			evidence_refs: evidenceRefs,
			evidence_ref_count: Number(proposal.evidence_ref_count) || 0,
			target_kind: targetKind,
			target_refs: targetRefs.slice(0, 1),
			target_ref_count: targetRefs.length,
			target_refs_truncated: targetRefs.length > 1,
			provenance_digest:
				typeof proposal.provenance_digest === "string" &&
				/^[a-f0-9]{64}$/.test(proposal.provenance_digest)
					? proposal.provenance_digest
					: "",
			classification:
				proposal.classification === "classified"
					? "classified"
					: "needs_review",
			approval_required: true as const,
			execution_surface: "governed_workbench" as const,
			...(restricted
				? { target_metrics: publicTargetMetrics(proposal.target_metrics) }
				: {}),
			...(!restricted
				? {
						baseline: {
							window: "recorded" as const,
							observation_count:
								Number(proposalBaseline.observation_count) || 0,
							production_day_count:
								Number(proposalBaseline.production_day_count) || 0,
							minimum_comparable_sessions:
								Number(proposalBaseline.minimum_comparable_sessions) || 0,
							production_day_window:
								Number(proposalBaseline.production_day_window) || 0,
						},
						targets: {
							minimum_comparable_sessions:
								Number(proposalTargets.minimum_comparable_sessions) || 0,
							production_day_window:
								Number(proposalTargets.production_day_window) || 0,
							state: "canary" as const,
							metrics: publicTargetMetrics(proposalTargets.metrics),
						},
						approval_policy: "explicit" as const,
						approval_surface: "governed_workbench" as const,
					}
				: {}),
		};
	};
	const safeAlert = (alert: Record<string, unknown>): PublicAnalysisAlert => ({
		problem: boundedPublicText(alert.problem),
		risk: boundedPublicText(alert.risk),
		validation: boundedPublicText(alert.validation),
		impact: publicImpact(alert.impact),
		occurrence_count: Number(alert.occurrence_count) || 0,
		distinct_production_day_count:
			Number(alert.distinct_production_day_count) || 0,
	});
	const blocked = analysis.status === "blocked";
	const blockedReason = blocked
		? boundedPublicText(analysis.blocked_reason ?? "analysis unavailable") ||
			"analysis unavailable"
		: null;
	const dto: PublicEvolutionAnalysisDto = {
		version: Number(analysis.version) || 1,
		mode: boundedPublicText(analysis.mode),
		status: boundedPublicText(analysis.status),
		blocked_reason: blockedReason,
		recovery_action: blocked
			? "afol evolve status --json"
			: Number(analysis.legacy_cluster_count) > 0
				? "afol evolve repair --json"
				: null,
		generated_at: boundedPublicText(analysis.generated_at),
		scorecard: publicScorecard(analysis.scorecard),
		baseline: {
			window: "recorded",
			observation_count: Number(baseline.observation_count) || 0,
			production_day_count: Number(baseline.production_day_count) || 0,
			scorecard: publicScorecard(baseline.scorecard),
		},
		proposals: Array.isArray(analysis.proposals)
			? analysis.proposals.map((proposal) =>
					safeProposal(proposal as Record<string, unknown>),
				)
			: [],
		proposal_available_count: Array.isArray(analysis.proposals)
			? analysis.proposals.length
			: 0,
		proposal_truncated: false,
		pending_count: Number(analysis.pending_count) || 0,
		critical_alerts: Array.isArray(analysis.critical_alerts)
			? analysis.critical_alerts.map((alert) =>
					safeAlert(alert as Record<string, unknown>),
				)
			: [],
		critical_alerts_truncated: false,
		critical_alert_count: Number(analysis.critical_alert_count) || 0,
		critical_alert_pending_count:
			Number(analysis.critical_alert_pending_count) || 0,
		legacy_cluster_count: Number(analysis.legacy_cluster_count) || 0,
	};
	const dtoBytes = (value: PublicEvolutionAnalysisDto): number =>
		Buffer.byteLength(JSON.stringify(value), "utf8");
	let compact = dto;
	// Preserve counts and proposal decision context while removing redundant
	// scorecards and progressively bounding prose in the largest valid envelope.
	if (dtoBytes(compact) > MAX_ANALYSIS_DTO_BYTES)
		compact = { ...compact, scorecard: {} };
	if (dtoBytes(compact) > MAX_ANALYSIS_DTO_BYTES)
		compact = {
			...compact,
			critical_alerts: compact.critical_alerts.map((alert) => ({
				...alert,
				problem: truncateUtf8(
					alert.problem,
					MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES,
				),
				risk: truncateUtf8(alert.risk, MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES),
				validation: truncateUtf8(
					alert.validation,
					MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES,
				),
			})),
		};
	if (dtoBytes(compact) > MAX_ANALYSIS_DTO_BYTES)
		compact = {
			...compact,
			baseline: { ...compact.baseline, scorecard: {} },
		};
	if (
		dtoBytes(compact) > MAX_ANALYSIS_DTO_BYTES &&
		compact.proposals.length > 1
	)
		compact = {
			...compact,
			proposals: compact.proposals.slice(0, 1),
			proposal_truncated: true,
		};
	if (
		dtoBytes(compact) > MAX_ANALYSIS_DTO_BYTES &&
		compact.critical_alerts.length > 1
	)
		compact = {
			...compact,
			critical_alerts: compact.critical_alerts.slice(0, 1),
			critical_alerts_truncated: true,
		};
	return compact;
}

export function writeAnalysisPayload(
	io: CommandIo,
	json: boolean,
	action: string,
	payload: Record<string, unknown>,
	operationContext: OperationContext,
): void {
	const dto = publicAnalysisDto(
		payload,
		!isTrustedLocalInteractive(operationContext),
	);
	const output = json
		? stringifyEnvelope(envelopeOk(dto, { action }))
		: JSON.stringify(dto);
	if (Buffer.byteLength(output, "utf8") > MAX_ANALYSIS_OUTPUT_BYTES)
		throw new Error("evolution analysis output exceeds the bounded limit");
	io.stdout(output);
}

function writeEvolutionError(
	io: CommandIo,
	json: boolean,
	code: string,
	message: string,
	action: string,
	operationContext: OperationContext,
): void {
	const trusted = isTrustedLocalInteractive(operationContext);
	const analysisMode = ["analyze", "weekly", "after-merge", "review"].includes(
		action.replace("evolve.", ""),
	);
	const safeMessage = analysisMode
		? "analysis unavailable"
		: trusted
			? message
			: code === "approval-required"
				? `${action} is not allowed; local interactive approval required`
				: code === "EVOLUTION_REBUILD_REQUIRED"
					? `${action} requires local interactive rebuild; no mutation was performed`
					: code === "EVOLVE_REPAIR_DISABLED"
						? `${action} is disabled; no mutation was performed`
						: `${action} failed; local interactive diagnostics required`;
	if (json)
		io.stdout(
			stringifyEnvelope(
				envelopeErr(code, safeMessage, { action, exitCode: 2 }),
			),
		);
	else io.stderr(`${code}: ${safeMessage}`);
}

async function runAnalysis(
	action: EvolutionAnalysisAction,
	args: string[],
	root: string,
	io: CommandIo,
	now: Date,
	operationContext: OperationContext,
): Promise<number> {
	assertAdmittedOperationContext(operationContext);
	if (
		!isActionAllowed(operationContext, {
			action: `evolve.${action}`,
			sideEffect: "read",
		})
	)
		throw new Error(`evolve.${action} is not allowed for this caller`);
	const parsed = parseAnalysisArgs(action, args);
	const mergeScope = parsed.mergeRange
		? resolveCommitRange(root, parsed.mergeRange)
		: undefined;
	const analysis = analyzeEvolutionProject(root, {
		mode:
			action === "after-merge"
				? "after_merge"
				: action === "weekly"
					? "weekly"
					: action === "review"
						? "review"
						: "analyze",
		...(parsed.proposalId ? { reviewProposalId: parsed.proposalId } : {}),
		...(mergeScope
			? {
					base: mergeScope.base,
					head: mergeScope.head,
					commitIds: mergeScope.commitIds,
				}
			: {}),
		now,
	});
	if (parsed.proposalId && analysis.proposals.length !== 1)
		throw new Error("evolution proposal preview is missing or stale");
	const payload = {
		...analysis,
	};
	writeAnalysisPayload(
		io,
		parsed.json,
		`evolve.${action}`,
		payload,
		operationContext,
	);
	return 0;
}

async function runSuggest(
	args: string[],
	root: string,
	io: CommandIo,
	now: Date,
	operationContext: OperationContext,
): Promise<number> {
	assertAdmittedOperationContext(operationContext);
	const parsed = parseSuggestArgs(args);
	if (
		!isActionAllowed(operationContext, {
			action: "evolve.suggest",
			sideEffect: "write",
		})
	) {
		writeEvolutionError(
			io,
			parsed.json,
			"approval-required",
			"evolve.suggest is not allowed for this caller; local interactive approval required",
			"evolve.suggest",
			operationContext,
		);
		return 2;
	}
	let resolution: ReturnType<typeof resolveDailySuggestion>;
	try {
		resolution = resolveDailySuggestion(root, now);
	} catch (error) {
		const message = (error as Error).message;
		const recoverable =
			message === "evolution projection checkpoint is missing" ||
			message === "evolution projection checkpoint is stale" ||
			message === "evolution suggestion projection migration is stale" ||
			message.includes("no such table: daily_suggestion_receipts");
		if (!recoverable) throw error;
		if (!isTrustedLocalInteractive(operationContext)) {
			writeEvolutionError(
				io,
				parsed.json,
				"EVOLUTION_REBUILD_REQUIRED",
				"evolution derived state requires local interactive rebuild; no mutation was performed",
				"evolve.suggest",
				operationContext,
			);
			return 2;
		}
		repairEvolutionDerivedState({ root });
		resolution = resolveDailySuggestion(root, now);
	}
	const preview = resolution.preview;
	if (preview.daily_status !== "available" || !preview.suggestion) {
		writeEvolutionPayload(
			io,
			parsed.json,
			"evolve.suggest",
			preview,
			operationContext,
		);
		return 0;
	}
	const internal = resolution.internal;
	if (!internal) {
		writeEvolutionPayload(
			io,
			parsed.json,
			"evolve.suggest",
			preview,
			operationContext,
		);
		return 0;
	}
	const db = openEvolutionDb(internal.dbPath);
	try {
		const claim = claimDailySuggestion({
			root,
			db,
			projectId: internal.projectId,
			suggestionId: internal.candidate.id,
			claimedBy: parsed.claimedBy,
			evidenceDigest: internal.candidate.evidence_digest,
			eventsDir: internal.eventsDir,
			localDate: internal.localDate,
			now,
		});
		acknowledgeDailySuggestion({
			root,
			db,
			projectId: internal.projectId,
			suggestionId: internal.candidate.id,
			claimedBy: parsed.claimedBy,
			claimToken: claim.claim_token,
			generation: claim.generation,
			evidenceDigest: internal.candidate.evidence_digest,
			action: "shown",
			eventsDir: internal.eventsDir,
			localDate: internal.localDate,
			now,
		});
	} finally {
		db.close();
	}
	writeEvolutionPayload(
		io,
		parsed.json,
		"evolve.suggest",
		{
			...preview,
			daily_status: "shown",
		},
		operationContext,
	);
	return 0;
}

async function runDecision(
	action: "skip" | "accept" | "reject",
	args: string[],
	root: string,
	io: CommandIo,
	operationContext: OperationContext,
	now: Date,
): Promise<number> {
	assertAdmittedOperationContext(operationContext);
	const parsed = parseDecisionArgs(args);
	if (
		!isActionAllowed(operationContext, {
			action: `evolve.${action}`,
			sideEffect: "write",
		})
	) {
		writeEvolutionError(
			io,
			parsed.json,
			"approval-required",
			`evolve.${action} is not allowed for this caller; local interactive approval required`,
			`evolve.${action}`,
			operationContext,
		);
		return 2;
	}
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	if (!resolved.projectId || !resolved.configured || !resolved.enabled)
		throw new Error("evolution suggestions are not enabled");
	const localDate = localDateForTimezone(now, resolved.timezone);
	const events = readSuggestionReceiptJournal(
		root,
		resolved.projectId,
		resolved.paths.evolutionEventsDir,
	);
	const receipt = [...projectSuggestionReceipts(events).values()].find(
		(item) =>
			item.project_id === resolved.projectId &&
			item.local_date === localDate &&
			item.suggestion_id === parsed.suggestionId &&
			item.receipt_status === "shown",
	);
	if (!receipt) throw new Error("suggestion must be shown before a decision");
	const mapped =
		action === "skip"
			? "skipped"
			: action === "accept"
				? "accepted"
				: "rejected";
	const authority = dispatchSuggestionDecision({
		projectId: resolved.projectId,
		localDate,
		suggestionId: parsed.suggestionId,
		evidenceDigest: receipt.evidence_digest,
		action: mapped,
		...(parsed.reason === undefined ? {} : { reason: parsed.reason }),
		sourceDecisionRef: `CLI-${action}-${parsed.suggestionId}`,
		operationContext,
		timestamp: now.toISOString(),
	});
	const decision = suggestionDecisionForAuthority(authority);
	const db = openEvolutionDb(evolutionDbPath(root, resolved.paths.evolutionDb));
	try {
		acknowledgeDailySuggestion({
			root,
			db,
			projectId: resolved.projectId,
			suggestionId: parsed.suggestionId,
			claimedBy: receipt.claimed_by,
			generation: receipt.generation,
			evidenceDigest: receipt.evidence_digest,
			action: mapped,
			...(decision.reason === undefined
				? {}
				: { rejectReason: decision.reason }),
			authority,
			eventsDir: resolved.paths.evolutionEventsDir,
			localDate,
			now,
		});
	} finally {
		db.close();
	}
	writeEvolutionPayload(
		io,
		parsed.json,
		`evolve.${action}`,
		{
			daily_status: mapped,
			suggestion: null,
			pending_count: 0,
			critical_alerts: [],
		},
		operationContext,
	);
	return 0;
}

function runRepair(
	args: string[],
	root: string,
	io: CommandIo,
	operationContext: OperationContext,
): number {
	assertAdmittedOperationContext(operationContext);
	const json = args.includes("--json") || args.includes("-j");
	if (args.some((arg) => arg !== "--json" && arg !== "-j"))
		throw new Error(
			`Unknown evolve repair argument: ${args.find((arg) => arg !== "--json" && arg !== "-j")}`,
		);
	const resolved = resolveEvolutionConfig(readProjectConfig(root));
	if (!resolved.configured || !resolved.enabled) {
		writeEvolutionError(
			io,
			json,
			"EVOLVE_REPAIR_DISABLED",
			"evolve.repair is disabled; no mutation was performed",
			"evolve.repair",
			operationContext,
		);
		return 2;
	}
	if (!isTrustedLocalInteractive(operationContext)) {
		writeEvolutionError(
			io,
			json,
			"approval-required",
			"evolve.repair requires a trusted local interactive context",
			"evolve.repair",
			operationContext,
		);
		return 2;
	}
	const result = repairEvolutionDerivedState({ root });
	writeEvolutionPayload(
		io,
		json,
		"evolve.repair",
		result as unknown as Record<string, unknown>,
		operationContext,
	);
	return 0;
}

type EvolutionStatusState =
	| "disabled"
	| "healthy"
	| "legacy_unconfigured"
	| "needs_project_id"
	| "reconciling"
	| "rebuild_required"
	| "ready_uninitialized"
	| "unhealthy";

type EvolutionJournalHealth = {
	exists: boolean;
	valid: boolean | null;
	error: string | null;
};

type EvolutionStatusData = {
	configured: boolean;
	enabled: boolean;
	state: EvolutionStatusState;
	recovery_action: string | null;
	project_id: string | null;
	timezone: string;
	db_path: string;
	db_health: EvolutionDbHealth | null;
	db_status: EvolutionStatus | null;
	journal_health: EvolutionJournalHealth;
	suggestion_queue: DailySuggestionPreview;
	analysis_available: boolean;
};

const REBUILD_RECOVERY_ACTION = "afol evolve repair --json";

const SUGGESTION_CLAIM_PROVIDERS = new Set([
	"afol",
	"afol-start",
	"codex",
	"grok",
	"hermes",
	"opencode",
	"pi",
]);

function parseArgs(args: readonly string[]): { json: boolean } {
	let json = false;
	for (const arg of args) {
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		throw new Error(`Unknown evolve argument: ${arg}`);
	}
	return { json };
}

function parseCandidatesArgs(args: readonly string[]): {
	session?: string;
	limit?: number;
	json: boolean;
	review?: {
		id: string;
		decision: "approved" | "rejected";
		reason: string;
		approve: boolean;
	};
} {
	let session: string | undefined;
	let limit: number | undefined;
	let json = false;
	let review = false;
	let id = "";
	let decision: "approved" | "rejected" | undefined;
	let reason = "";
	let approve = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json" || arg === "-j") json = true;
		else if (arg === "review") review = true;
		else if (arg === "--session" || arg === "-S") {
			session = args[++index];
			if (!session || session.startsWith("-"))
				throw new Error("evolve candidates --session requires a value");
		} else if (arg === "--limit") {
			const value = args[++index];
			if (!value || !/^\d+$/.test(value))
				throw new Error(
					"evolve candidates --limit requires an integer from 1 to 10",
				);
			limit = Number(value);
		} else if (arg === "--id") {
			id = args[++index] ?? "";
			if (!id || id.startsWith("-"))
				throw new Error(
					"evolve candidates review requires --id <candidate-id>",
				);
		} else if (arg === "--decision") {
			const value = args[++index];
			if (value !== "approved" && value !== "rejected")
				throw new Error(
					"evolve candidates review --decision must be approved or rejected",
				);
			decision = value;
		} else if (arg === "--reason") {
			reason = args[++index] ?? "";
			if (!reason || reason.startsWith("-"))
				throw new Error("evolve candidates review requires --reason <reason>");
		} else if (arg === "--approve") approve = true;
		else throw new Error(`Unknown evolve candidates argument: ${arg}`);
	}
	if (review && (!id || !decision || !reason))
		throw new Error(
			"evolve candidates review requires --id, --decision, and --reason",
		);
	return {
		...(session ? { session } : {}),
		...(limit === undefined ? {} : { limit }),
		...(review && decision
			? { review: { id, decision, reason, approve } }
			: {}),
		json,
	};
}

function parseBackfillArgs(args: readonly string[]): {
	offset?: number;
	limit?: number;
	json: boolean;
} {
	let offset: number | undefined;
	let limit: number | undefined;
	let json = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--json" || arg === "-j") json = true;
		else if (arg === "--offset" || arg === "--limit") {
			const value = args[++index];
			if (!value || !/^\d+$/.test(value))
				throw new Error(
					`evolve backfill ${arg} requires a non-negative integer`,
				);
			if (arg === "--offset") offset = Number(value);
			else limit = Number(value);
		} else throw new Error(`Unknown evolve backfill argument: ${arg}`);
	}
	return {
		...(offset === undefined ? {} : { offset }),
		...(limit === undefined ? {} : { limit }),
		json,
	};
}

function runBackfill(
	args: string[],
	root: string,
	io: CommandIo,
	operationContext: OperationContext,
): number {
	if (
		!isActionAllowed(operationContext, {
			action: "evolve.backfill",
			sideEffect: "read",
		})
	)
		throw new Error("evolve.backfill is not allowed for this caller");
	const parsed = parseBackfillArgs(args);
	const result = previewHistoryBackfill({
		root,
		...(parsed.offset === undefined ? {} : { offset: parsed.offset }),
		...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
	});
	const output = parsed.json
		? stringifyEnvelope(envelopeOk(result, { action: "evolve.backfill" }))
		: `backfill eligible=${result.coverage.eligible} returned=${result.pagination.returned} pending=${result.observations.pending_backfill} observed=${result.observations.already_observed}`;
	if (Buffer.byteLength(output, "utf8") > MAX_ANALYSIS_OUTPUT_BYTES)
		throw new Error("evolve backfill output exceeds the bounded limit");
	io.stdout(output);
	return 0;
}

function runCandidates(
	args: string[],
	root: string,
	io: CommandIo,
	operationContext: OperationContext,
): number {
	if (
		!isActionAllowed(operationContext, {
			action: "evolve.candidates",
			sideEffect: "read",
		})
	)
		throw new Error("evolve.candidates is not allowed for this caller");
	const parsed = parseCandidatesArgs(args);
	if (parsed.review) {
		if (
			!isActionAllowed(operationContext, {
				action: "evolve.candidates.review",
				sideEffect: "write",
			})
		)
			throw new Error(
				"evolve candidates review is not allowed for this caller",
			);
		if (!isTrustedLocalInteractive(operationContext))
			throw new Error(
				"evolve candidates review requires local interactive approval",
			);
		if (parsed.review.decision === "approved" && !parsed.review.approve)
			throw new Error("evolve candidates review approval requires --approve");
		if (!parsed.session)
			throw new Error("evolve candidates review requires --session <session>");
		const event = reviewAdoptionCandidate({
			root,
			session: parsed.session,
			candidateId: parsed.review.id,
			decision: parsed.review.decision,
			reason: redactSensitiveText(parsed.review.reason, { redactPaths: true }),
			createdAt: new Date().toISOString(),
		});
		if (parsed.json)
			io.stdout(
				stringifyEnvelope(
					envelopeOk(
						{
							candidate_id: event.candidate_id,
							decision: event.decision,
							review_id: event.id,
							append_only: true,
						},
						{ action: "evolve.candidates.review" },
					),
				),
			);
		else
			io.stdout(
				`review=${event.decision} candidate=${event.candidate_id} review_id=${event.id}`,
			);
		return 0;
	}
	const result = discoverAdoptionCandidates({
		root,
		...(parsed.session ? { session: parsed.session } : {}),
		...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
	});
	if (parsed.json)
		io.stdout(
			stringifyEnvelope(envelopeOk(result, { action: "evolve.candidates" })),
		);
	else
		io.stdout(
			`adoption=${result.review_state} candidates=${result.candidates.length}${result.session_id ? ` session=${result.session_id}` : ""}`,
		);
	return 0;
}

function readDbStatus(
	path: string,
	expectedProjectId: string,
	canonicalContext: {
		root: string;
		projectId: string;
		timezone: string;
		evolutionEventsDir?: string;
		recurrenceThresholds?: RecurrenceThresholds;
	},
): EvolutionStatus {
	return withEvolutionDbSnapshot(path, (db) =>
		getEvolutionStatus(db, expectedProjectId, canonicalContext),
	);
}

function recurrenceThresholds(
	settings: Record<string, unknown>,
): RecurrenceThresholds {
	const recurrence = settings.recurrence as Record<string, unknown>;
	return {
		minimum_occurrences: Number(recurrence.minimum_occurrences),
		minimum_distinct_sessions: Number(recurrence.minimum_distinct_sessions),
		minimum_distinct_production_days: Number(
			recurrence.minimum_distinct_production_days,
		),
	};
}

function statusState(
	configured: boolean,
	enabled: boolean,
	projectId: string | null,
	dbExists: boolean,
	dbHealthy: boolean,
	dbNeedsRebuild: boolean,
	journalExists: boolean,
	journalValid: boolean | null,
	journalLockActive: boolean,
): EvolutionStatusState {
	if (!configured) return "legacy_unconfigured";
	if (!enabled) return "disabled";
	if (!projectId) return "needs_project_id";
	if (journalExists && journalValid === false) return "unhealthy";
	if (dbNeedsRebuild && journalLockActive) return "reconciling";
	if (!dbExists && journalExists && journalValid === true)
		return "rebuild_required";
	if (!dbExists) return "ready_uninitialized";
	if (dbNeedsRebuild && journalExists && journalValid === true)
		return "rebuild_required";
	return dbHealthy ? "healthy" : "unhealthy";
}

function statusRecoveryAction(state: EvolutionStatusState): string | null {
	return state === "rebuild_required" ? REBUILD_RECOVERY_ACTION : null;
}

function buildStatus(projectRoot: string): EvolutionStatusData {
	assertSafeEvolutionProjectRoot(projectRoot);
	const resolved = resolveEvolutionConfig(readProjectConfig(projectRoot));
	const thresholds = recurrenceThresholds(resolved.settings);
	const journalLockActiveBefore = observeSessionLock(
		projectRoot,
		"__evolution-journal__",
	).active;
	const dbPath = evolutionDbPath(projectRoot, resolved.paths.evolutionDb);
	const journalPaths =
		resolved.configured && resolved.projectId
			? [
					{
						label: "production-days",
						path: productionDayJournalPath(
							projectRoot,
							resolved.paths.evolutionEventsDir,
						),
						read: () =>
							readProductionDayJournal(
								projectRoot,
								resolved.projectId as string,
								resolved.timezone,
								resolved.paths.evolutionEventsDir,
							),
					},
					{
						label: "preferences",
						path: preferenceJournalPath(
							projectRoot,
							resolved.paths.evolutionEventsDir,
						),
						read: () =>
							readPreferenceJournal(
								projectRoot,
								resolved.projectId as string,
								resolved.paths.evolutionEventsDir,
							),
					},
					{
						label: "observations",
						path: observationJournalPath(
							projectRoot,
							resolved.paths.evolutionEventsDir,
						),
						read: () =>
							readObservationJournal(
								projectRoot,
								resolved.projectId as string,
								resolved.paths.evolutionEventsDir,
							),
					},
					{
						label: "receipts",
						path: suggestionJournalPath(
							projectRoot,
							resolved.paths.evolutionEventsDir,
						),
						read: () =>
							readSuggestionReceiptJournal(
								projectRoot,
								resolved.projectId as string,
								resolved.paths.evolutionEventsDir,
							),
					},
				]
			: [];
	const existingJournals = journalPaths.filter((journal) =>
		existsSync(journal.path),
	);
	const journalExists = existingJournals.length > 0;
	let journalValid: boolean | null = journalExists ? true : null;
	let journalError: string | null = null;
	for (const journal of existingJournals) {
		try {
			journal.read();
		} catch (error) {
			journalValid = false;
			journalError = `${journal.label}: ${(error as Error).message}`;
			break;
		}
	}
	const dbExists = existsSync(dbPath);
	const dbHealth =
		dbExists &&
		resolved.configured &&
		resolved.projectId &&
		!journalLockActiveBefore
			? checkEvolutionDbHealth(dbPath, resolved.projectId, {
					root: projectRoot,
					projectId: resolved.projectId,
					timezone: resolved.timezone,
					evolutionEventsDir: resolved.paths.evolutionEventsDir,
					recurrenceThresholds: thresholds,
				})
			: null;
	const dbNeedsRebuild =
		journalLockActiveBefore ||
		dbHealth?.findings.some(
			(finding) =>
				finding.severity === "fail" &&
				/(?:projection differs|projection checkpoint is missing|schema is stale)/.test(
					finding.message,
				),
		) === true;
	const journalLockActive =
		journalLockActiveBefore ||
		observeSessionLock(projectRoot, "__evolution-journal__").active;
	const state = statusState(
		resolved.configured,
		resolved.enabled,
		resolved.projectId,
		dbExists,
		dbHealth?.ok ?? false,
		dbNeedsRebuild,
		journalExists,
		journalValid,
		journalLockActive,
	);
	const suggestionQueue: DailySuggestionPreview =
		!resolved.enabled || !resolved.configured
			? previewDailySuggestion(projectRoot)
			: dbHealth?.ok
				? previewDailySuggestion(projectRoot)
				: {
						daily_status: "unavailable",
						suggestion: null,
						pending_count: 0,
						critical_alerts: [],
					};
	return {
		configured: resolved.configured,
		enabled: resolved.enabled,
		state,
		recovery_action: statusRecoveryAction(state),
		project_id: resolved.projectId,
		timezone: resolved.timezone,
		db_path: dbPath,
		db_health: dbHealth,
		db_status:
			dbHealth?.ok && resolved.projectId
				? readDbStatus(dbPath, resolved.projectId, {
						root: projectRoot,
						projectId: resolved.projectId,
						timezone: resolved.timezone,
						evolutionEventsDir: resolved.paths.evolutionEventsDir,
						recurrenceThresholds: thresholds,
					})
				: null,
		journal_health: {
			exists: journalExists,
			valid: journalValid,
			error: journalError,
		},
		suggestion_queue: suggestionQueue,
		analysis_available:
			resolved.configured && resolved.enabled && (dbHealth?.ok ?? false),
	};
}

function formatStatus(data: EvolutionStatusData, restricted = false): string {
	return [
		`evolution status: ${data.state}`,
		`recovery_action=${data.recovery_action ?? "none"}`,
		`configured=${data.configured} enabled=${data.enabled} project_id=${restricted ? "hidden" : (data.project_id ?? "missing")} timezone=${data.timezone}`,
		`db=${data.db_health?.db_exists ?? false} migration=${data.db_health?.migration_version ?? 0}/${data.db_health?.expected_migration_version ?? 1} production_days=${data.db_status?.production_day_count ?? 0}`,
		`journal=${data.journal_health.exists ? (data.journal_health.valid ? "valid" : "invalid") : "absent"}`,
		`suggestion=${data.suggestion_queue.daily_status} +${data.suggestion_queue.pending_count} pending critical_alerts=${data.suggestion_queue.critical_alerts.length}`,
		data.analysis_available
			? "analysis=available"
			: "analysis=planned-for-slice-5",
	].join("\n");
}

export async function runEvolveCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	operationContext: OperationContext = defaultOperationContext(),
	now: Date = new Date(),
): Promise<number> {
	assertAdmittedOperationContext(operationContext);
	const jsonRequested = args.some((arg) => arg === "--json" || arg === "-j");
	const requestedAction = action || "analyze";
	try {
		if (
			["analyze", "weekly", "after-merge", "review"].includes(requestedAction)
		)
			return await runAnalysis(
				requestedAction as EvolutionAnalysisAction,
				args,
				projectRoot,
				io,
				now,
				operationContext,
			);
		if (action === "suggest")
			return await runSuggest(args, projectRoot, io, now, operationContext);
		if (action === "import")
			return await runImport(args, projectRoot, io, operationContext);
		if (action === "external")
			return runExternalList(args, projectRoot, io, operationContext);
		if (action === "evaluate")
			return await runEvaluate(args, projectRoot, io, operationContext, now);
		if (action === "apply" || action === "rollback")
			return await runProposalMutation(
				action,
				args,
				projectRoot,
				io,
				operationContext,
				now,
			);
		if (["skip", "accept", "reject"].includes(action))
			return await runDecision(
				action as "skip" | "accept" | "reject",
				args,
				projectRoot,
				io,
				operationContext,
				now,
			);
		if (action === "decision") {
			const [decisionAction, ...decisionArgs] = args;
			if (
				!decisionAction ||
				!["skip", "accept", "reject"].includes(decisionAction)
			)
				throw new Error("evolve decision requires skip, accept, or reject");
			return await runDecision(
				decisionAction as "skip" | "accept" | "reject",
				decisionArgs,
				projectRoot,
				io,
				operationContext,
				now,
			);
		}
		if (action === "repair")
			return runRepair(args, projectRoot, io, operationContext);
		if (action === "observe") {
			try {
				return runObserveCommand(args, projectRoot, io, operationContext);
			} catch (error) {
				const message = (error as Error).message;
				if (jsonRequested) {
					io.stdout(
						stringifyEnvelope(
							envelopeErr("EVOLVE_OBSERVE_FAILED", message, {
								action: "evolve.observe",
								exitCode: 2,
							}),
						),
					);
				} else {
					io.stderr(message);
				}
				return 2;
			}
		}
		if (action === "candidates")
			return runCandidates(args, projectRoot, io, operationContext);
		if (action === "backfill")
			return runBackfill(args, projectRoot, io, operationContext);
		if (action && action !== "status") {
			throw new Error(`Unknown evolve action: ${action}`);
		}
		const parsed = parseArgs(args);
		const data = buildStatus(projectRoot);
		const outputData = publicValue(
			data,
			!isTrustedLocalInteractive(operationContext),
		) as EvolutionStatusData;
		const exitCode = data.state === "unhealthy" ? 1 : 0;
		if (parsed.json) {
			const envelope =
				exitCode === 0
					? envelopeOk(outputData, {
							action: "evolve.status",
							exitCode,
						})
					: (envelopeErr(
							"EVOLUTION_UNHEALTHY",
							"evolution state is unhealthy",
							{
								action: "evolve.status",
								exitCode,
							},
						) as ResultEnvelope<EvolutionStatusData>);
			if (!envelope.ok) envelope.data = outputData;
			io.stdout(stringifyEnvelope(envelope));
		} else {
			io.stdout(
				formatStatus(data, !isTrustedLocalInteractive(operationContext)),
			);
		}
		return exitCode;
	} catch (error) {
		const message = (error as Error).message;
		const actionName = action || "analyze";
		const errorCode =
			actionName === "status"
				? "EVOLUTION_STATUS_FAILED"
				: `EVOLVE_${actionName.toUpperCase()}_FAILED`;
		writeEvolutionError(
			io,
			jsonRequested,
			errorCode,
			message,
			`evolve.${actionName}`,
			operationContext,
		);
		return 2;
	}
}
