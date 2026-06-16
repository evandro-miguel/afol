import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import { readActiveSession } from "./lifecycle";

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

type SessionBindingInput = {
	session: string;
	branch?: string | null;
	worktree?: string | null;
	actor?: string | null;
};

const EMPTY_CONTEXT: SessionContext = { bindings: [] };

function contextPath(root: string): string {
	return join(resolveProjectPaths(root).abs.wbDir, "session-context.json");
}

function normalizeText(value?: string | null): string | null {
	const trimmed = value?.trim() ?? "";
	return trimmed.length > 0 ? trimmed : null;
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
		typeof record.worktree === "string" ? normalizeText(record.worktree) : null;
	const actor =
		typeof record.actor === "string" ? normalizeText(record.actor) : null;
	return { session, branch, worktree, actor, last_touched: lastTouched };
}

function parseContext(input: unknown): SessionContext {
	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		return EMPTY_CONTEXT;
	}
	const record = input as Record<string, unknown>;
	const bindingsRaw = record.bindings;
	if (!Array.isArray(bindingsRaw)) {
		return EMPTY_CONTEXT;
	}
	const bindings: SessionBinding[] = [];
	for (const entry of bindingsRaw) {
		const parsed = parseBinding(entry);
		if (parsed) {
			bindings.push(parsed);
		}
	}
	return { bindings };
}

function currentGitBranch(root: string): string | null {
	const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		return null;
	}
	const branch = result.stdout.trim();
	return branch.length > 0 && branch !== "HEAD" ? branch : null;
}

function currentGitWorktree(root: string): string | null {
	const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		return null;
	}
	const worktree = result.stdout.trim();
	return worktree.length > 0 ? worktree : null;
}

function currentContext(root: string): {
	branch: string | null;
	worktree: string | null;
} {
	return {
		branch: currentGitBranch(root),
		worktree: currentGitWorktree(root),
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
	const targetWorktree = normalizeText(target.worktree ?? null);
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
	const worktree = normalizeText(input.worktree ?? null);
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
	try {
		const raw = readFileSync(path, "utf8");
		return parseContext(JSON.parse(raw) as unknown);
	} catch {
		return EMPTY_CONTEXT;
	}
}

export function writeSessionContext(root: string, ctx: SessionContext): void {
	writeContext(root, ctx);
}

export function bindSession(
	root: string,
	input: SessionBindingInput,
): SessionBinding {
	const context = readSessionContext(root);
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
}

export function resolveContextSession(root: string): string | null {
	const { branch, worktree } = currentContext(root);
	if (branch === null && worktree === null) {
		return null;
	}
	const bindings = readSessionContext(root).bindings;
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

	const contextSession = resolveContextSession(root);
	if (contextSession) {
		return { session: contextSession, source: "context" };
	}

	if (allowGlobalFallback) {
		const active = readActiveSession(root);
		if (active) {
			return { session: active, source: "global" };
		}
	}

	return null;
}

export function isCiMode(): boolean {
	return process.env.AFOL_CI === "1" || process.env.CI === "1";
}

export function defaultAllowGlobalFallback(): boolean {
	return !isCiMode();
}
