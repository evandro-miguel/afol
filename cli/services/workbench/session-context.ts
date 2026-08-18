import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { atomicWriteText } from "../io/atomic";
import { withSessionLock } from "../io/session-lock";
import { resolveProjectPaths } from "../project/paths";
import {
	readActiveSession,
	sessionLifecycleState,
	sessionPaths,
} from "./lifecycle";

export type SessionBinding = {
	session: string;
	branch: string | null;
	worktree: string | null;
	actor: string | null;
	last_touched: string;
};

export type SessionContext = {
	bindings: SessionBinding[];
};

export type SessionResolution = {
	session: string;
	source: "explicit" | "env" | "context" | "global";
};

export type ResolveSessionOptions = {
	explicit?: string;
	allowGlobalFallback?: boolean;
};

export type ImplicitSessionState = "open" | "closed" | "missing" | "corrupt";

type SessionBindingInput = {
	session: string;
	branch?: string | null;
	worktree?: string | null;
	actor?: string | null;
};

const EMPTY_CONTEXT: SessionContext = { bindings: [] };
const SESSION_CONTEXT_LOCK = "__session-context__";
const GIT_CONTEXT_TIMEOUT_MS = 5_000;

function contextPath(root: string): string {
	return join(resolveProjectPaths(root).abs.wbDir, "session-context.json");
}

function normalizeText(value?: string | null): string | null {
	const trimmed = value?.trim() ?? "";
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeWorktree(value?: string | null): string | null {
	const normalized = normalizeText(value);
	return normalized?.replaceAll("\\", "/") ?? null;
}

function parseBinding(input: unknown): SessionBinding | null {
	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		return null;
	}
	const record = input as Record<string, unknown>;
	const session = normalizeText(
		typeof record.session === "string" ? record.session : null,
	);
	const lastTouched = normalizeText(
		typeof record.last_touched === "string" ? record.last_touched : null,
	);
	if (!session || !lastTouched) {
		return null;
	}
	const branch =
		typeof record.branch === "string" ? normalizeText(record.branch) : null;
	const worktree =
		typeof record.worktree === "string"
			? normalizeWorktree(record.worktree)
			: null;
	const actor =
		typeof record.actor === "string" ? normalizeText(record.actor) : null;
	return { session, branch, worktree, actor, last_touched: lastTouched };
}

function parseContext(input: unknown): SessionContext {
	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("Invalid session context: expected object");
	}
	const record = input as Record<string, unknown>;
	const bindingsRaw = record.bindings;
	if (!Array.isArray(bindingsRaw)) {
		throw new Error("Invalid session context: bindings must be an array");
	}
	const bindings: SessionBinding[] = [];
	for (const entry of bindingsRaw) {
		const parsed = parseBinding(entry);
		if (!parsed) throw new Error("Invalid session context binding");
		bindings.push(parsed);
	}
	return { bindings };
}

function currentContext(root: string): {
	branch: string | null;
	worktree: string | null;
} {
	const result = spawnSync(
		"git",
		["rev-parse", "--git-dir", "--show-toplevel"],
		{
			cwd: root,
			encoding: "utf8",
			timeout: GIT_CONTEXT_TIMEOUT_MS,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	if (result.status !== 0) {
		return { branch: null, worktree: null };
	}
	const [gitDir = "", worktree = ""] = result.stdout.trim().split(/\r?\n/, 2);
	let branch: string | null = null;
	try {
		const head = readFileSync(resolve(root, gitDir, "HEAD"), "utf8").trim();
		const prefix = "ref: refs/heads/";
		branch = head.startsWith(prefix) ? head.slice(prefix.length) || null : null;
	} catch {
		branch = null;
	}
	return {
		branch,
		worktree: normalizeWorktree(worktree),
	};
}

function writeContext(root: string, ctx: SessionContext): void {
	atomicWriteText(contextPath(root), `${JSON.stringify(ctx, null, 2)}\n`);
}

function bindingScore(
	binding: SessionBinding,
	branch: string | null,
	worktree: string | null,
): number {
	let score = 0;
	if (branch !== null && binding.branch === branch) {
		score += 2;
	}
	if (worktree !== null && binding.worktree === worktree) {
		score += 1;
	}
	return score;
}

function touchedAt(binding: SessionBinding): number {
	const time = Date.parse(binding.last_touched);
	return Number.isFinite(time) ? time : 0;
}

function removeMatchedBinding(
	bindings: SessionBinding[],
	target: SessionBindingInput,
): SessionBinding[] {
	const targetSession = normalizeText(target.session);
	if (!targetSession) {
		return bindings.slice();
	}
	const targetBranch = normalizeText(target.branch ?? null);
	const targetWorktree = normalizeWorktree(target.worktree ?? null);
	return bindings.filter((binding) => {
		if (binding.session === targetSession) {
			return false;
		}
		if (
			targetBranch !== null &&
			targetWorktree !== null &&
			binding.branch === targetBranch &&
			binding.worktree === targetWorktree
		) {
			return false;
		}
		return true;
	});
}

function upsertBinding(
	context: SessionContext,
	input: SessionBindingInput,
): SessionContext {
	const session = normalizeText(input.session);
	if (!session) {
		throw new Error("Missing session identifier for binding.");
	}
	const branch = normalizeText(input.branch ?? null);
	const worktree = normalizeWorktree(input.worktree ?? null);
	const actor = normalizeText(input.actor ?? null);
	const nextBinding: SessionBinding = {
		session,
		branch,
		worktree,
		actor,
		last_touched: new Date().toISOString(),
	};
	const bindings = removeMatchedBinding(context.bindings, {
		session,
		branch,
		worktree,
	});
	bindings.push(nextBinding);
	return { bindings };
}

export function readSessionContext(root: string): SessionContext {
	const path = contextPath(root);
	if (!existsSync(path)) {
		return EMPTY_CONTEXT;
	}
	const raw = readFileSync(path, "utf8");
	try {
		return parseContext(JSON.parse(raw) as unknown);
	} catch (error) {
		throw new Error(
			`Invalid session context ${path}: ${(error as Error).message}`,
		);
	}
}

export function withSessionContextLock<T>(root: string, action: () => T): T {
	return withSessionLock(root, SESSION_CONTEXT_LOCK, action);
}

export function writeSessionContext(root: string, ctx: SessionContext): void {
	writeContext(root, ctx);
}

export function bindSession(
	root: string,
	input: SessionBindingInput,
	options: { resetInvalid?: boolean } = {},
): SessionBinding {
	return withSessionContextLock(root, () => {
		let context: SessionContext;
		try {
			context = readSessionContext(root);
		} catch (error) {
			if (!options.resetInvalid) throw error;
			context = EMPTY_CONTEXT;
		}
		const nextContext = upsertBinding(context, input);
		writeContext(root, nextContext);
		const session = normalizeText(input.session);
		if (!session) {
			throw new Error("Missing session identifier for binding.");
		}
		const binding = nextContext.bindings[nextContext.bindings.length - 1];
		if (!binding) {
			throw new Error("Failed to persist session binding.");
		}
		return binding;
	});
}

export function bindCurrentContextSession(
	root: string,
	session: string,
	actor?: string | null,
): SessionBinding | null {
	const context = currentContext(root);
	if (context.branch === null && context.worktree === null) {
		return null;
	}
	return bindSession(
		root,
		{
			session,
			branch: context.branch,
			worktree: context.worktree,
			...(actor !== undefined ? { actor } : {}),
		},
		{ resetInvalid: true },
	);
}

export function compensateCarriedContinuationBinding(
	root: string,
	input: { sourceSession: string; continuation: SessionBinding },
): void {
	withSessionContextLock(root, () => {
		const context = readSessionContext(root);
		const current = currentContext(root);
		const owned = context.bindings.find(
			(binding) =>
				binding.session === input.continuation.session &&
				binding.last_touched === input.continuation.last_touched &&
				binding.branch === current.branch &&
				binding.worktree === current.worktree,
		);
		if (!owned) return;
		const bindings = context.bindings.filter((binding) => binding !== owned);
		const hasCurrentBinding = bindings.some(
			(binding) =>
				binding.branch === current.branch &&
				binding.worktree === current.worktree,
		);
		if (!hasCurrentBinding) {
			bindings.push({
				session: input.sourceSession,
				branch: current.branch,
				worktree: current.worktree,
				actor: null,
				last_touched: new Date().toISOString(),
			});
		}
		writeContext(root, { bindings });
	});
}

export function resolveContextSession(
	root: string,
	options: { failClosed?: boolean } = {},
): string | null {
	let bindings: SessionBinding[];
	try {
		bindings = readSessionContext(root).bindings;
	} catch (error) {
		if (options.failClosed) throw error;
		return null;
	}
	if (bindings.length === 0) {
		return null;
	}
	const { branch, worktree } = currentContext(root);
	if (branch === null && worktree === null) {
		return null;
	}
	let best: SessionBinding | null = null;
	let bestScore = 0;
	let bestTouched = 0;
	for (const binding of bindings) {
		const score = bindingScore(binding, branch, worktree);
		if (score === 0) {
			continue;
		}
		const touched = touchedAt(binding);
		if (score > bestScore || (score === bestScore && touched > bestTouched)) {
			best = binding;
			bestScore = score;
			bestTouched = touched;
		}
	}
	return best?.session ?? null;
}

export function listBindings(root: string): SessionBinding[] {
	return readSessionContext(root).bindings;
}

export function removeBinding(root: string, session: string): boolean {
	return withSessionContextLock(root, () => {
		const targetSession = normalizeText(session);
		if (!targetSession) {
			return false;
		}
		const context = readSessionContext(root);
		const nextBindings = context.bindings.filter(
			(binding) => binding.session !== targetSession,
		);
		if (nextBindings.length === context.bindings.length) {
			return false;
		}
		writeContext(root, { bindings: nextBindings });
		return true;
	});
}

export function resolveSession(
	root: string,
	opts: ResolveSessionOptions,
): SessionResolution | null {
	const allowGlobalFallback = opts.allowGlobalFallback ?? !isCiMode();
	const explicit = normalizeText(opts.explicit ?? null);
	if (explicit) {
		return { session: explicit, source: "explicit" };
	}

	const envSession = normalizeText(process.env.AFOL_SESSION ?? null);
	if (envSession) {
		return { session: envSession, source: "env" };
	}

	const contextSession = resolveContextSession(root, { failClosed: true });
	if (contextSession) {
		const state = inspectImplicitSessionState(root, contextSession);
		if (state === "corrupt") {
			throw new Error(
				`Context session binding is corrupt: ${contextSession}. Repair it with afol session switch or unbind.`,
			);
		}
		if (state === "open") {
			return { session: contextSession, source: "context" };
		}
	}

	if (allowGlobalFallback) {
		const active = readActiveSession(root);
		if (active && isUsableImplicitSession(root, active)) {
			return { session: active, source: "global" };
		}
	}

	return null;
}

export function inspectImplicitSessionState(
	root: string,
	session: string,
): ImplicitSessionState {
	const paths = sessionPaths(root, session);
	if (!existsSync(paths.sessionDir)) {
		return "missing";
	}
	if (!existsSync(paths.taskPath)) {
		return "corrupt";
	}
	try {
		return sessionLifecycleState(root, session);
	} catch {
		return "corrupt";
	}
}

function isUsableImplicitSession(root: string, session: string): boolean {
	return inspectImplicitSessionState(root, session) === "open";
}

export function isCiMode(): boolean {
	return process.env.AFOL_CI === "1" || process.env.CI === "1";
}

export function defaultAllowGlobalFallback(): boolean {
	return !isCiMode();
}
