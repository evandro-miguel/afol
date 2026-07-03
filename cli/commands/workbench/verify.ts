import { spawnSync } from "node:child_process";
import { isAbsolute, relative } from "node:path";
import { resolveProjectPaths } from "../../services/project/paths";
import { resolveProjectPath } from "../../services/project/root";
import {
	checkSpecCompatibility,
	getSpecCheck,
} from "../../services/spec-gate/checker";
import type { SpecCheckResult } from "../../services/spec-gate/types";
import {
	defaultAllowGlobalFallback,
	isCiMode,
	resolveSession as resolveBoundSession,
} from "../../services/workbench/session-context";

function pathIsInside(root: string, candidate: string): boolean {
	const relativePath = relative(root, candidate);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
}

export function resolveVerifyTargetPath(root: string, target: string): string {
	const result = resolveProjectPath(root, target);
	if (!result.ok) {
		throw new Error(result.error);
	}
	return result.value.path;
}

export function resolveVerifySessionPath(
	root: string,
	session: string,
): string {
	const projectPaths = resolveProjectPaths(root);
	const normalized = session.trim().replace(/\\/g, "/").replace(/^\.\//, "");
	const sessionTarget =
		normalized === projectPaths.wbDir ||
		normalized.startsWith(`${projectPaths.wbDir}/`)
			? normalized
			: `${projectPaths.wbDir}/${normalized}`;
	const result = resolveProjectPath(root, sessionTarget);
	if (!result.ok) {
		throw new Error(result.error);
	}
	if (!pathIsInside(projectPaths.abs.wbDir, result.value.path)) {
		throw new Error(`Path escapes workbench directory: ${session}`);
	}
	return result.value.path;
}

export function resolveSession(
	root: string,
	session: string,
	commandName: string,
): string {
	const resolved = resolveBoundSession(root, {
		explicit: session,
		allowGlobalFallback: defaultAllowGlobalFallback(),
	});
	if (resolved) {
		return resolved.session;
	}
	if (isCiMode()) {
		throw new Error(
			`Missing --session for ${commandName}; set --session, AFOL_SESSION, or bind the current context with afol session bind. Global fallback is disabled in CI.`,
		);
	}
	throw new Error(
		`Missing --session for ${commandName}; set --session, AFOL_SESSION, or bind the current context with afol session bind.`,
	);
}

export function resolveRequiredSpecCheck(
	root: string,
	session: string,
	taskId: string,
): SpecCheckResult {
	const current = getSpecCheck(root, session, taskId);
	if (current?.status === "waived") {
		return current;
	}
	return checkSpecCompatibility(root, session, taskId);
}

function splitCommandLine(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaping = false;
	for (const char of command) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = null;
				continue;
			}
			current += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (escaping) {
		current += "\\";
	}
	if (quote) {
		throw new Error("Unclosed quote in --test command.");
	}
	if (current.length > 0) {
		tokens.push(current);
	}
	return tokens;
}

export type RunVerificationResult = {
	exitCode: number;
	error?: string;
	signal?: string;
};

export function runVerification(
	root: string,
	command: string,
	options: { shell?: boolean } = {},
): RunVerificationResult {
	if (command.trim().length === 0) {
		return { exitCode: 1, error: "Empty --test command." };
	}
	let result: ReturnType<typeof spawnSync>;
	if (options.shell) {
		result = spawnSync(command, {
			cwd: root,
			encoding: "utf8",
			maxBuffer: 1024 * 1024,
			timeout: 120_000,
			shell: true,
		});
	} else {
		const argv = splitCommandLine(command);
		const executable = argv[0];
		if (!executable) {
			return { exitCode: 1, error: "Empty --test command." };
		}
		result = spawnSync(executable, argv.slice(1), {
			cwd: root,
			encoding: "utf8",
			maxBuffer: 1024 * 1024,
			timeout: 120_000,
		});
	}

	if (result.error) {
		return {
			exitCode: 1,
			error: result.error.message,
			...(result.signal ? { signal: result.signal } : {}),
		};
	}
	return {
		exitCode: result.status ?? 1,
		...(result.signal ? { signal: result.signal } : {}),
	};
}
