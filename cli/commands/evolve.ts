import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
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
	assertSafeEvolutionProjectRoot,
	checkEvolutionDbHealth,
	type DailySuggestionPreview,
	type EvolutionDbHealth,
	type EvolutionStatus,
	evolutionDbPath,
	getEvolutionStatus,
	observationJournalPath,
	openEvolutionDb,
	preferenceJournalPath,
	previewDailySuggestion,
	productionDayJournalPath,
	type RecurrenceThresholds,
	readObservationJournal,
	readPreferenceJournal,
	readProductionDayJournal,
	repairEvolutionDerivedState,
	resolveDailySuggestion,
	resolveEvolutionConfig,
} from "../services/evolution";
import { localDateForTimezone } from "../services/evolution/config";
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
import { readProjectConfig } from "../services/project/paths";
import { type CommandIo, DEFAULT_IO } from "./io";

const CONTROL_CHARACTER = /\p{Cc}/u;
const MAX_OBSERVE_IDENTIFIER_LENGTH = 256;

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

function writeEvolutionError(
	io: CommandIo,
	json: boolean,
	code: string,
	message: string,
	action: string,
	operationContext: OperationContext,
): void {
	const trusted = isTrustedLocalInteractive(operationContext);
	const safeMessage = trusted
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
	project_id: string | null;
	timezone: string;
	db_path: string;
	db_health: EvolutionDbHealth | null;
	db_status: EvolutionStatus | null;
	journal_health: EvolutionJournalHealth;
	suggestion_queue: DailySuggestionPreview;
	analysis_available: false;
};

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
	const db = new Database(path, { readonly: true });
	try {
		return getEvolutionStatus(db, expectedProjectId, canonicalContext);
	} finally {
		db.close();
	}
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
		dbExists && resolved.configured && resolved.projectId
			? checkEvolutionDbHealth(dbPath, resolved.projectId, {
					root: projectRoot,
					projectId: resolved.projectId,
					timezone: resolved.timezone,
					evolutionEventsDir: resolved.paths.evolutionEventsDir,
					recurrenceThresholds: thresholds,
				})
			: null;
	const dbNeedsRebuild =
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
		analysis_available: false,
	};
}

function formatStatus(data: EvolutionStatusData, restricted = false): string {
	return [
		`evolution status: ${data.state}`,
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
	try {
		if (action === "suggest")
			return await runSuggest(args, projectRoot, io, now, operationContext);
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
		const actionName = action || "status";
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
