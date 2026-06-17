import { spawnSync } from "node:child_process";
import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { atomicWriteText } from "../services/io/atomic";
import { resolveProjectPaths } from "../services/project/paths";
import { readActiveSession } from "../services/workbench/lifecycle";
import {
	bindSession,
	listBindings,
	removeBinding,
	resolveContextSession,
} from "../services/workbench/session-context";
import { type CommandIo, DEFAULT_IO } from "./io";

type ActionResult = {
	data: Record<string, unknown>;
	lines: string[];
	exitCode: number;
};

type ParsedArgs = {
	json: boolean;
	dryRun: boolean;
	branch: string | null;
	actor: string | null;
	session: string | null;
	positional: string[];
};

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

function parseArgs(args: string[]): ParsedArgs {
	let json = false;
	let dryRun = false;
	let branch: string | null = null;
	let actor: string | null = null;
	let session: string | null = null;
	const positional: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--session") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --session in session.");
			}
			session = value;
			index += 1;
			continue;
		}
		if (arg === "--branch") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --branch in session.");
			}
			branch = value;
			index += 1;
			continue;
		}
		if (arg === "--actor") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --actor in session.");
			}
			actor = value;
			index += 1;
			continue;
		}
		positional.push(arg);
	}
	return { json, dryRun, branch, actor, session, positional };
}

function emit(
	result: ActionResult,
	action: string,
	json: boolean,
	io: CommandIo,
): number {
	if (json) {
		const envelope: ResultEnvelope<Record<string, unknown>> = envelopeOk(
			result.data,
			{ action, exitCode: result.exitCode },
		);
		io.stdout(stringifyEnvelope(envelope));
		return result.exitCode;
	}
	for (const line of result.lines) {
		io.stdout(line);
	}
	return result.exitCode;
}

function listSessions(projectRoot: string): ActionResult {
	const currentBranch = currentGitBranch(projectRoot);
	const currentWorktree = currentGitWorktree(projectRoot);
	const globalActiveSession = readActiveSession(projectRoot);
	const contextSession = resolveContextSession(projectRoot);
	const bindings = listBindings(projectRoot).map((binding) => ({
		...binding,
		matches_context:
			(currentBranch !== null && binding.branch === currentBranch) ||
			(currentWorktree !== null && binding.worktree === currentWorktree),
		is_global_active: globalActiveSession === binding.session,
	}));
	return {
		data: {
			current_branch: currentBranch,
			current_worktree: currentWorktree,
			global_active_session: globalActiveSession,
			context_session: contextSession,
			bindings,
		},
		lines: [
			"session list:",
			`  current branch: ${currentBranch ?? "(none)"}`,
			`  current worktree: ${currentWorktree ?? "(none)"}`,
			`  global active: ${globalActiveSession ?? "(none)"}`,
			`  context session: ${contextSession ?? "(none)"}`,
			...(bindings.length > 0
				? bindings.map((binding) => {
						const flags = [
							binding.matches_context ? "context" : "",
							binding.is_global_active ? "global" : "",
						]
							.filter((value) => value.length > 0)
							.join(", ");
						return `  - ${binding.session} branch=${binding.branch ?? "(none)"} worktree=${binding.worktree ?? "(none)"} actor=${binding.actor ?? "(none)"} touched=${binding.last_touched}${flags ? ` [${flags}]` : ""}`;
					})
				: ["  (no bindings)"]),
		],
		exitCode: 0,
	};
}

function bindCurrentSession(
	projectRoot: string,
	parsed: ParsedArgs,
): ActionResult {
	const session = parsed.session ?? parsed.positional[0] ?? "";
	if (!session) {
		throw new Error("Missing --session for session bind.");
	}
	const branch = parsed.branch ?? currentGitBranch(projectRoot);
	const worktree = currentGitWorktree(projectRoot) ?? projectRoot;
	if (parsed.dryRun) {
		return {
			data: {
				action: "bind",
				dry_run: true,
				session,
				binding: { session, branch, worktree, actor: parsed.actor ?? null },
			},
			lines: [
				`session bind ${session}: dry-run`,
				`  branch: ${branch ?? "(none)"}`,
				`  worktree: ${worktree ?? "(none)"}`,
				`  actor: ${parsed.actor ?? "(none)"}`,
			],
			exitCode: 0,
		};
	}
	const binding = bindSession(projectRoot, {
		session,
		branch,
		worktree,
		actor: parsed.actor,
	});
	return {
		data: { action: "bind", session, binding },
		lines: [
			`session bound: ${session}`,
			`  branch: ${binding.branch ?? "(none)"}`,
			`  worktree: ${binding.worktree ?? "(none)"}`,
			`  actor: ${binding.actor ?? "(none)"}`,
		],
		exitCode: 0,
	};
}

function switchSession(projectRoot: string, session: string): ActionResult {
	const branch = currentGitBranch(projectRoot);
	const worktree = currentGitWorktree(projectRoot) ?? projectRoot;
	atomicWriteText(
		resolveProjectPaths(projectRoot).abs.activeSessionFile,
		`${session}\n`,
	);
	const binding = bindSession(projectRoot, { session, branch, worktree });
	return {
		data: {
			action: "switch",
			session,
			global_active_session: session,
			binding,
		},
		lines: [
			`session switched: ${session}`,
			`  global active: ${session}`,
			`  branch: ${binding.branch ?? "(none)"}`,
			`  worktree: ${binding.worktree ?? "(none)"}`,
		],
		exitCode: 0,
	};
}

function unbindSession(projectRoot: string, session: string): ActionResult {
	const removed = removeBinding(projectRoot, session);
	return {
		data: { action: "unbind", session, removed },
		lines: [
			removed ? `session unbound: ${session}` : `session not bound: ${session}`,
		],
		exitCode: 0,
	};
}

export async function runSessionCommand(
	action: string,
	args: string[],
	projectRoot: string,
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	const parsed = parseArgs(args);
	if (action === "" || action === "list") {
		return emit(listSessions(projectRoot), "session.list", parsed.json, io);
	}
	if (action === "bind") {
		return emit(
			bindCurrentSession(projectRoot, parsed),
			"session.bind",
			parsed.json,
			io,
		);
	}
	if (action === "switch") {
		const session = parsed.positional[0] ?? parsed.session ?? "";
		if (!session) {
			throw new Error("Missing session identifier for session switch.");
		}
		return emit(
			switchSession(projectRoot, session),
			"session.switch",
			parsed.json,
			io,
		);
	}
	if (action === "unbind") {
		const session = parsed.session ?? parsed.positional[0] ?? "";
		if (!session) {
			throw new Error("Missing --session for session unbind.");
		}
		return emit(
			unbindSession(projectRoot, session),
			"session.unbind",
			parsed.json,
			io,
		);
	}

	const message = `afol session: unknown action '${action}'`;
	if (parsed.json) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr("SESSION_ACTION_UNKNOWN", message, {
					action: "session",
					exitCode: 2,
					hint: "use list, bind, switch, or unbind",
				}),
			),
		);
	} else {
		io.stderr(
			'err session-action-unknown hint="use list, bind, switch, or unbind"',
		);
	}
	return 2;
}
