import type { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { readProjectConfig } from "../project/paths";
import { resolveEvolutionIdentity } from "./config";
import type { ExternalSessionLink } from "./import-journal";
import { applyMigrations } from "./migrations";

export type EvaluateSessionLinkInput = {
	root: string;
	projectId: string;
	externalSessionId: string;
	afolSessionId?: string | null;
	verifiedCommit?: string | null;
	/** Accepted for callers carrying transcript data; never inspected. */
	transcriptText?: string;
};

export type ManualSessionLinkInput = EvaluateSessionLinkInput & {
	db: Database;
	canonicalDecisionRef: string;
};

function sessionExists(
	root: string,
	sessionId: string | null | undefined,
): boolean {
	if (
		!sessionId ||
		sessionId === "." ||
		sessionId === ".." ||
		sessionId.includes("/") ||
		sessionId.includes("\\")
	)
		return false;
	try {
		const wbRoot = realpathSync(join(root, ".afol", "wb"));
		const candidate = join(wbRoot, sessionId);
		const stat = lstatSync(candidate);
		const canonical = realpathSync(candidate);
		const offset = relative(wbRoot, canonical);
		return (
			stat.isDirectory() &&
			!stat.isSymbolicLink() &&
			!isAbsolute(offset) &&
			!offset.startsWith("..")
		);
	} catch {
		return false;
	}
}

function commitResolves(
	root: string,
	commit: string | null | undefined,
): boolean {
	if (!commit || !/^[0-9a-f]{7,64}$/i.test(commit)) return false;
	const canonicalRoot = realpathSync(root);
	const result = spawnSync(
		controlledGitExecutable(),
		[
			"--no-pager",
			"--no-optional-locks",
			"--no-replace-objects",
			"-C",
			canonicalRoot,
			"cat-file",
			"-e",
			`${commit}^{commit}`,
		],
		{
			stdio: "ignore",
			env: gitReadOnlyEnv(),
			shell: false,
			timeout: 3_000,
			windowsHide: true,
		},
	);
	return result.status === 0;
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
		"external import linking requires a controlled git executable",
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

function evidence(...items: string[]): Array<Record<string, string>> {
	return items.map((item) => ({ kind: item }));
}

export function evaluateSessionLink(
	input: EvaluateSessionLinkInput,
): ExternalSessionLink {
	const configuredProjectId = resolveEvolutionIdentity(
		readProjectConfig(input.root),
	).projectId;
	const projectMatches =
		configuredProjectId !== null && input.projectId === configuredProjectId;
	const hasSession = sessionExists(input.root, input.afolSessionId);
	const hasCommit = commitResolves(input.root, input.verifiedCommit);
	const verified = projectMatches && hasSession && hasCommit;

	return {
		external_session_id: input.externalSessionId,
		afol_session_id: input.afolSessionId ?? null,
		link_state: verified ? "auto_verified" : "pending",
		confidence: verified ? 1 : 0,
		evidence: verified
			? evidence(
					"project_uuid_exact_match",
					"afol_session_exists",
					"commit_resolved",
				)
			: evidence("automatic_link_not_verified"),
		verified_commit: verified ? (input.verifiedCommit ?? null) : null,
		confirmation_required: !verified,
		eligible_for_learning: verified,
	};
}

export const evaluateExternalSessionLink = evaluateSessionLink;

/** Build a confirmed local link only after both sides are known to exist. */
export function confirmManualSessionLink(
	input: ManualSessionLinkInput,
): ExternalSessionLink {
	applyMigrations(input.db);
	const imported = input.db
		.query(
			"SELECT 1 FROM external_sessions WHERE project_id = ? AND external_session_id = ?",
		)
		.get(input.projectId, input.externalSessionId);
	if (!imported) throw new Error("imported external session does not exist");
	if (!sessionExists(input.root, input.afolSessionId))
		throw new Error("AFOL session does not exist");
	if (!input.canonicalDecisionRef.trim())
		throw new Error("canonical decision reference is required");
	return {
		external_session_id: input.externalSessionId,
		afol_session_id: input.afolSessionId ?? null,
		link_state: "manual_confirmed",
		confidence: 1,
		evidence: evidence("explicit_local_confirmation"),
		canonical_decision_ref: input.canonicalDecisionRef,
		confirmation_required: false,
		eligible_for_learning: true,
	};
}

export const manualLinkExternalSession = confirmManualSessionLink;
