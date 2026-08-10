import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { boundedSpawn } from "../../core/subprocess";
import { listOpenPendingSpecs } from "../governance/pending-specs";
import { collectSessionIds } from "../local-state/workbench-index";
import { readActiveSession, sessionPaths } from "./lifecycle";
import {
	bindCurrentContextSession,
	defaultAllowGlobalFallback,
	inspectImplicitSessionState,
	listBindings,
	removeBinding,
	resolveSession,
} from "./session-context";

export type ArtifactState = {
	present: boolean;
	mtime: string | null;
	lines: number;
};

export type CatchupUnbindAction = {
	session: string;
	state: "corrupt" | "missing";
};

export type CatchupSkip = {
	reason: string;
	session?: string;
};

export type CatchupRepairReport = {
	/** True when --fix path ran (mutations may still be empty). */
	applied: boolean;
	unbound: CatchupUnbindAction[];
	rebound: string | null;
	skipped: CatchupSkip[];
	/** True when session-context bindings were written. */
	mutated: boolean;
};

export type CatchupReport = {
	session: string | null;
	session_status: "active" | "closed" | "no-session";
	git_changed_files: string[];
	git_changed_files_overflow: boolean;
	git_changed_files_degraded: boolean;
	git_branch: string | null;
	artifacts: {
		plan: ArtifactState;
		task: ArtifactState;
		log: ArtifactState;
		report: ArtifactState;
	};
	freshness: {
		findings_stale: boolean;
		log_behind_diff: boolean;
		notes: string[];
	};
	next_step: string;
	/** Diagnostic only — never auto-resolved by catchup. Always set by computeCatchup. */
	pending_spec_open?: number;
	/** Present when `afol catchup --fix` ran. */
	repair?: CatchupRepairReport;
};

const CATCHUP_GIT_FILE_LIMIT = 50;
function readArtifactState(path: string): ArtifactState {
	if (!existsSync(path)) {
		return { present: false, mtime: null, lines: 0 };
	}

	const content = readFileSync(path, "utf8");
	const lines = content.split(/\r?\n/);
	const lineCount =
		lines.length > 0 && lines[lines.length - 1] === ""
			? lines.length - 1
			: lines.length;

	return {
		present: true,
		mtime: statSync(path).mtime.toISOString(),
		lines: lineCount,
	};
}

function readSessionResearchMtime(sessionDir: string, session: string): number {
	if (!existsSync(sessionDir)) {
		return 0;
	}

	let latest = 0;
	try {
		for (const entry of readdirSync(sessionDir, { withFileTypes: true })) {
			if (!entry.isFile()) {
				continue;
			}
			if (!/\.(md|markdown)$/i.test(entry.name)) {
				continue;
			}
			if (
				!entry.name.startsWith(`${session}_research_`) &&
				!entry.name.startsWith(`${session}_findings_`)
			) {
				continue;
			}
			const path = join(sessionDir, entry.name);
			try {
				latest = Math.max(latest, statSync(path).mtimeMs);
			} catch {
				// ignore unreadable paths
			}
		}
	} catch {
		return 0;
	}
	return latest;
}

function normalizeChangedFile(value: string): string {
	return value.replaceAll("\\", "/").trim();
}

function parsePorcelainLine(line: string): string | null {
	if (line.length < 4) {
		return null;
	}
	const pathPart = line.slice(3).trim();
	if (!pathPart) {
		return null;
	}
	const renameIndex = pathPart.lastIndexOf(" -> ");
	if (renameIndex >= 0) {
		return normalizeChangedFile(pathPart.slice(renameIndex + 4));
	}
	return normalizeChangedFile(pathPart);
}

function runGit(root: string, args: string[]): { ok: boolean; stdout: string } {
	const result = boundedSpawn("git", args, { cwd: root, timeoutMs: 15_000 });
	return {
		ok: result.ok,
		stdout: result.stdout,
	};
}

function gitProbeOk(root: string): boolean {
	return boundedSpawn("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd: root,
		timeoutMs: 10_000,
	}).ok;
}

function readGitBranch(root: string): string | null {
	const result = runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"]);
	return result.ok ? result.stdout.trim() || null : null;
}

/**
 * Pure combining logic for git status + diff outputs.
 * Exported for deterministic testing without spawning real git.
 */
export function combineGitChangedFiles(
	porcelain: { ok: boolean; stdout: string },
	diff: { ok: boolean; stdout: string },
): { files: string[]; overflow: boolean; gitQueryFailed: boolean } {
	const files: string[] = [];
	const seen = new Set<string>();
	let statusOk = false;

	if (porcelain.ok) {
		statusOk = true;
		for (const rawLine of porcelain.stdout.split(/\r?\n/)) {
			const line = rawLine.trimEnd();
			if (!line) {
				continue;
			}
			const parsed = parsePorcelainLine(line);
			if (!parsed || seen.has(parsed)) {
				continue;
			}
			seen.add(parsed);
			files.push(parsed);
			if (files.length >= CATCHUP_GIT_FILE_LIMIT) {
				return { files, overflow: true, gitQueryFailed: false };
			}
		}
	}

	if (diff.ok) {
		for (const rawLine of diff.stdout.split(/\r?\n/)) {
			const parsed = normalizeChangedFile(rawLine);
			if (!parsed || seen.has(parsed)) {
				continue;
			}
			seen.add(parsed);
			files.push(parsed);
			if (files.length >= CATCHUP_GIT_FILE_LIMIT) {
				return { files, overflow: true, gitQueryFailed: !statusOk };
			}
		}
	}

	return { files, overflow: false, gitQueryFailed: !statusOk };
}

export function readGitChangedFiles(root: string): {
	files: string[];
	overflow: boolean;
	gitQueryFailed: boolean;
} {
	return combineGitChangedFiles(
		runGit(root, ["status", "--porcelain"]),
		runGit(root, ["diff", "--name-only", "HEAD"]),
	);
}

function latestChangedFileMtime(root: string, files: string[]): number {
	let latest = 0;
	for (const file of files) {
		const path = join(root, file);
		try {
			latest = Math.max(latest, statSync(path).mtimeMs);
		} catch {
			// changed file may have been deleted; ignore
		}
	}
	return latest;
}

function recentSessionsHint(root: string): string {
	const sessions = collectSessionIds(root).slice(-5).reverse();
	return sessions.length > 0 ? sessions.join(", ") : "none";
}

function readOpenPendingSpecCount(root: string): number {
	try {
		return listOpenPendingSpecs(root).length;
	} catch {
		return 0;
	}
}

function appendPendingSpecDiagnostics(
	notes: string[],
	nextStep: string,
	pendingSpecOpen: number,
	options: { preferPendingNextStep: boolean },
): { notes: string[]; next_step: string } {
	if (pendingSpecOpen <= 0) {
		return { notes, next_step: nextStep };
	}
	const pendingNote = `open pending_spec: ${pendingSpecOpen} (not auto-resolved; run afol governance pending)`;
	const nextNotes = notes.includes(pendingNote)
		? notes
		: [...notes, pendingNote];
	if (!options.preferPendingNextStep) {
		return { notes: nextNotes, next_step: nextStep };
	}
	return {
		notes: nextNotes,
		next_step: `open pending_spec count=${pendingSpecOpen} — run afol governance pending`,
	};
}

function buildArtifactStates(
	root: string,
	session: string,
): {
	researchMtime: number;
	artifacts: CatchupReport["artifacts"];
} {
	const paths = sessionPaths(root, session);
	const reportPath = join(paths.sessionDir, `${session}_report_01.md`);
	const researchMtime = readSessionResearchMtime(paths.sessionDir, session);

	return {
		researchMtime,
		artifacts: {
			plan: readArtifactState(paths.planPath),
			task: readArtifactState(paths.taskPath),
			log: readArtifactState(paths.logPath),
			report: readArtifactState(reportPath),
		},
	};
}

/**
 * Safe session-context repair for `afol catchup --fix`.
 *
 * Fail-closed and partial: unbind corrupt/missing bindings, optionally rebind
 * a usable global active session when git context exists. Never deletes session
 * dirs, never resolves/waives governance, never archives.
 */
export function applyCatchupRepair(root: string): CatchupRepairReport {
	const unbound: CatchupUnbindAction[] = [];
	const skipped: CatchupSkip[] = [];
	let rebound: string | null = null;

	let bindings: ReturnType<typeof listBindings> = [];
	try {
		bindings = listBindings(root);
	} catch (error) {
		skipped.push({
			reason: `context file unreadable: ${(error as Error).message}`,
		});
		return {
			applied: true,
			unbound,
			rebound,
			skipped,
			mutated: false,
		};
	}

	for (const binding of bindings) {
		const state = inspectImplicitSessionState(root, binding.session);
		if (state !== "corrupt" && state !== "missing") {
			continue;
		}
		try {
			const removed = removeBinding(root, binding.session);
			if (removed) {
				unbound.push({ session: binding.session, state });
			} else {
				skipped.push({
					reason: "unbind found no matching binding",
					session: binding.session,
				});
			}
		} catch (error) {
			skipped.push({
				reason: `unbind failed: ${(error as Error).message}`,
				session: binding.session,
			});
		}
	}

	let hasEffectiveOpen = false;
	try {
		const resolved = resolveSession(root, {
			allowGlobalFallback: defaultAllowGlobalFallback(),
		});
		hasEffectiveOpen = resolved !== null;
	} catch (error) {
		skipped.push({
			reason: `session resolve failed after unbind: ${(error as Error).message}`,
		});
		hasEffectiveOpen = false;
	}

	if (!hasEffectiveOpen) {
		const active = readActiveSession(root);
		if (!active) {
			skipped.push({ reason: "no global active session to rebind" });
		} else {
			const activeState = inspectImplicitSessionState(root, active);
			if (activeState !== "open") {
				skipped.push({
					reason: `global active not usable (${activeState})`,
					session: active,
				});
			} else {
				try {
					const binding = bindCurrentContextSession(root, active);
					if (binding) {
						rebound = active;
					} else {
						skipped.push({
							reason: "no git context to bind",
							session: active,
						});
					}
				} catch (error) {
					skipped.push({
						reason: `rebind failed: ${(error as Error).message}`,
						session: active,
					});
				}
			}
		}
	}

	return {
		applied: true,
		unbound,
		rebound,
		skipped,
		mutated: unbound.length > 0 || rebound !== null,
	};
}

export function computeCatchup(
	root: string,
	opts: { session?: string; repair?: CatchupRepairReport } = {},
): CatchupReport {
	const explicitSession = opts.session?.trim() || null;
	const activeSession = readActiveSession(root);
	const pendingSpecOpen = readOpenPendingSpecCount(root);
	const effectiveSession = resolveSession(root, {
		...(explicitSession ? { explicit: explicitSession } : {}),
		allowGlobalFallback: defaultAllowGlobalFallback(),
	});
	const gitAvailable = gitProbeOk(root);
	const branch = gitAvailable ? readGitBranch(root) : null;
	const git = readGitChangedFiles(root);
	const session = effectiveSession?.session ?? null;
	if (!session) {
		const recent = recentSessionsHint(root);
		const notes = [`recent sessions: ${recent}`];
		if (!gitAvailable) {
			notes.unshift("degraded: git unavailable, state unknown");
		} else if (git.gitQueryFailed) {
			notes.unshift("degraded: git status query failed, state uncertain");
		}
		const pending = appendPendingSpecDiagnostics(
			notes,
			"no active session — run afol n",
			pendingSpecOpen,
			{ preferPendingNextStep: false },
		);
		const report: CatchupReport = {
			session: null,
			session_status: "no-session",
			git_changed_files: git.files,
			git_changed_files_overflow: git.overflow,
			git_changed_files_degraded: !gitAvailable || git.gitQueryFailed,
			git_branch: branch,
			artifacts: {
				plan: { present: false, mtime: null, lines: 0 },
				task: { present: false, mtime: null, lines: 0 },
				log: { present: false, mtime: null, lines: 0 },
				report: { present: false, mtime: null, lines: 0 },
			},
			freshness: {
				findings_stale: false,
				log_behind_diff: false,
				notes: pending.notes,
			},
			next_step: pending.next_step,
			pending_spec_open: pendingSpecOpen,
		};
		if (opts.repair) {
			report.repair = opts.repair;
		}
		return report;
	}

	const sessionState = buildArtifactStates(root, session);
	const latestChanged = latestChangedFileMtime(root, git.files);
	const planTaskMtime = Math.max(
		sessionState.artifacts.plan.present && sessionState.artifacts.plan.mtime
			? Date.parse(sessionState.artifacts.plan.mtime)
			: 0,
		sessionState.artifacts.task.present && sessionState.artifacts.task.mtime
			? Date.parse(sessionState.artifacts.task.mtime)
			: 0,
	);
	const staleResearch =
		sessionState.researchMtime > 0 ? sessionState.researchMtime : 0;
	const findingsStale =
		git.files.length > 0 && planTaskMtime > 0 && planTaskMtime > staleResearch;
	const logMtime =
		sessionState.artifacts.log.present && sessionState.artifacts.log.mtime
			? Date.parse(sessionState.artifacts.log.mtime)
			: 0;
	const logBehindDiff =
		git.files.length > 0 && latestChanged > 0 && logMtime < latestChanged;

	const notes: string[] = [];
	if (!gitAvailable) {
		notes.push("degraded: git unavailable, state unknown");
	} else if (git.gitQueryFailed) {
		notes.push("degraded: git status query failed, state uncertain");
	}
	if (!sessionState.artifacts.plan.present) {
		notes.push("plan missing");
	}
	if (!sessionState.artifacts.task.present) {
		notes.push("task missing");
	}
	if (!sessionState.artifacts.log.present) {
		notes.push("log missing");
	}
	if (sessionState.researchMtime === 0) {
		notes.push("no research/findings artifact found");
	}
	if (git.overflow) {
		notes.push(`git changes truncated at ${CATCHUP_GIT_FILE_LIMIT} files`);
	}
	if (findingsStale) {
		notes.push("plan/task moved ahead of research");
	}
	if (logBehindDiff) {
		notes.push("log mtime trails changed files");
	}
	if (notes.length === 0) {
		notes.push("artifacts look fresh");
	}

	let nextStep = "artifacts look fresh";
	if (!gitAvailable) {
		nextStep = "degraded: git unavailable, state unknown";
	} else if (git.gitQueryFailed) {
		nextStep = "degraded: git status query failed, state uncertain";
	}
	const sessionIsActive = session !== null && session === activeSession;
	if (explicitSession && !sessionIsActive) {
		nextStep =
			"session is closed — switch to the active session or start a new one";
	} else if (logBehindDiff) {
		nextStep = "log unsynced changes before continuing";
	} else if (findingsStale) {
		nextStep = "sync findings into research before continuing";
	}

	// Prefer pending_spec hint only when the session is otherwise healthy.
	const pending = appendPendingSpecDiagnostics(
		notes,
		nextStep,
		pendingSpecOpen,
		{
			preferPendingNextStep: nextStep === "artifacts look fresh",
		},
	);

	const report: CatchupReport = {
		session,
		session_status: sessionIsActive ? "active" : "closed",
		git_changed_files: git.files,
		git_changed_files_overflow: git.overflow,
		git_changed_files_degraded: !gitAvailable || git.gitQueryFailed,
		git_branch: branch,
		artifacts: sessionState.artifacts,
		freshness: {
			findings_stale: findingsStale,
			log_behind_diff: logBehindDiff,
			notes: pending.notes,
		},
		next_step: pending.next_step,
		pending_spec_open: pendingSpecOpen,
	};
	if (opts.repair) {
		report.repair = opts.repair;
	}
	return report;
}
