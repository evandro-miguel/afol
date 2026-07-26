import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
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
	redactSensitiveText,
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
const MAX_ANALYSIS_OUTPUT_BYTES = 4_000;
const MAX_ANALYSIS_PUBLIC_TEXT_BYTES = 128;
const MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES = 32;
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
	rank: number;
	problem: string;
	recommendation: string;
	risk: string;
	validation: string;
	impact: PublicImpactCategory;
	score: number;
	confidence: number;
	occurrence_count: number;
	distinct_production_day_count: number;
	target_metrics?: Readonly<Record<string, number | null>>;
	distinct_session_count?: number;
	related_session_count?: number;
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
	pending_count: number;
	critical_alerts: readonly PublicAnalysisAlert[];
	critical_alert_count: number;
	critical_alert_pending_count: number;
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

function boundedPublicProposalText(value: unknown): string {
	return boundedPublicTextTo(value, MAX_ANALYSIS_PUBLIC_PROPOSAL_TEXT_BYTES);
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
		const proposalBaseline = (proposal.baseline ?? {}) as Record<
			string,
			unknown
		>;
		const proposalTargets = (proposal.targets ?? {}) as Record<string, unknown>;
		return {
			rank: Number(proposal.rank) || 0,
			problem: boundedPublicProposalText(proposal.problem),
			recommendation: boundedPublicProposalText(proposal.recommendation),
			risk: boundedPublicProposalText(proposal.risk),
			validation: boundedPublicProposalText(proposal.validation),
			impact: publicImpact(proposal.impact),
			score: Number(proposal.score) || 0,
			confidence: Number(proposal.confidence) || 0,
			occurrence_count: Number(proposal.occurrence_count) || 0,
			distinct_production_day_count:
				Number(proposal.distinct_production_day_count) || 0,
			...(restricted
				? { target_metrics: publicTargetMetrics(proposal.target_metrics) }
				: {}),
			...(!restricted
				? {
						id: boundedPublicIdentifier(proposal.id),
						distinct_session_count:
							Number(proposal.distinct_session_count) || 0,
						related_session_count: Number(proposal.related_session_count) || 0,
						evidence_refs: publicEvidenceRefs(proposal.evidence_refs).slice(
							0,
							1,
						),
						evidence_ref_count: Number(proposal.evidence_ref_count) || 0,
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
	const dto: PublicEvolutionAnalysisDto = {
		version: Number(analysis.version) || 1,
		mode: boundedPublicText(analysis.mode),
		status: boundedPublicText(analysis.status),
		blocked_reason: blocked ? "analysis unavailable" : null,
		recovery_action: blocked ? "afol health --area state --json" : null,
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
		pending_count: Number(analysis.pending_count) || 0,
		critical_alerts: Array.isArray(analysis.critical_alerts)
			? analysis.critical_alerts.map((alert) =>
					safeAlert(alert as Record<string, unknown>),
				)
			: [],
		critical_alert_count: Number(analysis.critical_alert_count) || 0,
		critical_alert_pending_count:
			Number(analysis.critical_alert_pending_count) || 0,
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
	project_id: string | null;
	timezone: string;
	db_path: string;
	db_health: EvolutionDbHealth | null;
	db_status: EvolutionStatus | null;
	journal_health: EvolutionJournalHealth;
	suggestion_queue: DailySuggestionPreview;
	analysis_available: boolean;
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
		analysis_available:
			resolved.configured && resolved.enabled && (dbHealth?.ok ?? false),
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
