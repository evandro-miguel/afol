import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadJsonObject } from "../../core/schema";
import {
	scanTemplateForbiddenPaths,
	scanTemplateToolchainClaims,
	TEMPLATE_ROOT,
} from "../../schemas/template-policy";
import {
	validateFilesIndex,
	validateRulesIndex,
	validateSkillsIndex,
	validateSpecsIndex,
} from "../local-state/project-indexes";
import {
	detectSessionHealth,
	validateWorkBenchIndex,
} from "../local-state/workbench-index";
import { verifyAllSessions } from "../workbench/verify";
import { resolveProjectPaths } from "./paths";

export type ProjectValidationCheck = {
	id:
		| "config"
		| "lock"
		| "manifest"
		| "adm_dir"
		| "rules_dir"
		| "hooks_dir"
		| "adm_source_dir"
		| "adm_tools"
		| "skills_dir"
		| "wb_dir"
		| "agents_payload_clean"
		| "template_forbidden"
		| "rules_local_state_index"
		| "skills_local_state_index"
		| "specs_local_state_index"
		| "files_local_state_index"
		| "wb_local_state_index"
		| "session_evidence"
		| "session_health"
		| "index_drift"
		| "toolchain_claims";
	ok: boolean;
	message: string;
};

export type ProjectValidationOptions = {
	checkDrift?: boolean;
};

export type ProjectValidationReport = {
	ok: boolean;
	checks: ProjectValidationCheck[];
};

function validateConfig(projectRoot: string): ProjectValidationCheck {
	const configPath = join(projectRoot, ".agents", "config.json");
	if (existsSync(configPath)) {
		const loaded = loadJsonObject(configPath);
		if (!loaded.ok) {
			return { id: "config", ok: false, message: loaded.error };
		}
		const skillPathError = validateSkillPathConfig(loaded.value);
		if (skillPathError) {
			return {
				id: "config",
				ok: false,
				message: `${configPath}: ${skillPathError}`,
			};
		}
		return { id: "config", ok: true, message: `ok ${configPath}` };
	}
	return {
		id: "config",
		ok: false,
		message: `missing .agents/config.json under ${projectRoot}`,
	};
}

function nestedObject(
	record: Record<string, unknown>,
	key: string,
): Record<string, unknown> | null {
	const value = record[key];
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function stringField(
	record: Record<string, unknown>,
	key: string,
): string | null {
	const value = record[key];
	return typeof value === "string" ? value : null;
}

function normalizeConfigPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+$/g, "").replace(/^\.\//, "");
}

function isProjectSkillPath(path: string): boolean {
	const normalized = normalizeConfigPath(path);
	return (
		normalized === ".agents/skills" || normalized.startsWith(".agents/skills/")
	);
}

function validateSkillPathConfig(
	config: Record<string, unknown>,
): string | null {
	const paths = nestedObject(config, "paths");
	const skillsSync = nestedObject(config, "skills_sync");
	const skillsDir = paths ? stringField(paths, "skills_dir") : null;
	const skillsSyncDir = skillsSync
		? stringField(skillsSync, "project_dir")
		: null;
	for (const [field, value] of [
		["paths.skills_dir", skillsDir],
		["skills_sync.project_dir", skillsSyncDir],
	] as const) {
		if (value !== null && !isProjectSkillPath(value)) {
			return `${field} must stay under .agents/skills; .afol/skills is not an active skills root`;
		}
	}
	return null;
}

function validateJsonFile(
	id: "lock" | "manifest" | "adm_tools",
	path: string,
): ProjectValidationCheck {
	const loaded = loadJsonObject(path);
	if (!loaded.ok) {
		return { id, ok: false, message: loaded.error };
	}
	return { id, ok: true, message: `ok ${path}` };
}

function validateDirectory(
	_projectRoot: string,
	id:
		| "adm_dir"
		| "rules_dir"
		| "hooks_dir"
		| "adm_source_dir"
		| "skills_dir"
		| "wb_dir",
	path: string,
): ProjectValidationCheck {
	if (!existsSync(path)) {
		return { id, ok: false, message: `missing directory: ${path}` };
	}
	try {
		const stat = statSync(path);
		if (!stat.isDirectory()) {
			return { id, ok: false, message: `not a directory: ${path}` };
		}
	} catch (error) {
		return {
			id,
			ok: false,
			message: `cannot inspect ${path}: ${(error as Error).message}`,
		};
	}
	return { id, ok: true, message: `ok ${path}` };
}

function validateAgentsPayloadClean(
	projectRoot: string,
): ProjectValidationCheck {
	const forbidden = [
		".agents/hooks",
		".agents/rules",
		".agents/source",
		".agents/tools",
		".agents/tools.json",
	].filter((path) => existsSync(join(projectRoot, path)));

	if (forbidden.length > 0) {
		return {
			id: "agents_payload_clean",
			ok: false,
			message: `operational AFOL payload must not live under .agents: ${forbidden.join(", ")}`,
		};
	}

	return {
		id: "agents_payload_clean",
		ok: true,
		message: "ok .agents contains provider-safe static payload only",
	};
}

async function validateTemplateForbidden(
	projectRoot: string,
): Promise<ProjectValidationCheck> {
	const templateRoot = join(projectRoot, TEMPLATE_ROOT);
	if (!existsSync(templateRoot)) {
		return {
			id: "template_forbidden",
			ok: true,
			message: `skipped ${templateRoot} missing`,
		};
	}

	const forbidden = await scanTemplateForbiddenPaths(templateRoot);
	if (forbidden.length > 0) {
		return {
			id: "template_forbidden",
			ok: false,
			message: `forbidden paths in ${TEMPLATE_ROOT}: ${forbidden.join(", ")}`,
		};
	}

	return {
		id: "template_forbidden",
		ok: true,
		message: `ok ${templateRoot}`,
	};
}

function detectIndexDrift(projectRoot: string): string[] {
	const drifts: string[] = [];

	type IndexRebuilder = {
		id: string;
	};
	const indexFiles: IndexRebuilder[] = [
		{ id: "rules" },
		{ id: "skills" },
		{ id: "specs" },
		{ id: "files" },
		{ id: "workbench" },
	];

	for (const { id } of indexFiles) {
		// We compare using the validate functions which check freshness
		// against source file mtimes — if generated_at < source_mtime, it's stale
		switch (id) {
			case "rules": {
				const result = validateRulesIndex(projectRoot);
				if (!result.ok) drifts.push(`${id}: ${result.message}`);
				break;
			}
			case "skills": {
				const result = validateSkillsIndex(projectRoot);
				if (!result.ok) drifts.push(`${id}: ${result.message}`);
				break;
			}
			case "specs": {
				const result = validateSpecsIndex(projectRoot);
				if (!result.ok) drifts.push(`${id}: ${result.message}`);
				break;
			}
			case "files": {
				const result = validateFilesIndex(projectRoot);
				if (!result.ok) drifts.push(`${id}: ${result.message}`);
				break;
			}
			case "workbench": {
				const result = validateWorkBenchIndex(projectRoot);
				if (!result.ok) drifts.push(`${id}: ${result.message}`);
				break;
			}
		}
	}

	return drifts;
}

export async function validateProjectStructure(
	projectRoot: string,
	options?: ProjectValidationOptions,
): Promise<ProjectValidationReport> {
	const projectPaths = resolveProjectPaths(projectRoot);
	const checks: ProjectValidationCheck[] = [
		validateConfig(projectRoot),
		validateJsonFile("lock", projectPaths.abs.lockFile),
		validateJsonFile("manifest", projectPaths.abs.manifestFile),
		validateDirectory(projectRoot, "adm_dir", projectPaths.abs.admDir),
		validateDirectory(projectRoot, "rules_dir", projectPaths.abs.rulesDir),
		validateDirectory(projectRoot, "hooks_dir", projectPaths.abs.hooksDir),
		validateDirectory(
			projectRoot,
			"adm_source_dir",
			join(projectPaths.abs.admDir, "source"),
		),
		validateJsonFile("adm_tools", join(projectPaths.abs.admDir, "tools.json")),
		validateDirectory(projectRoot, "skills_dir", projectPaths.abs.skillsDir),
		validateDirectory(projectRoot, "wb_dir", projectPaths.abs.wbDir),
		validateAgentsPayloadClean(projectRoot),
		(() => {
			const result = validateWorkBenchIndex(projectRoot);
			return {
				id: "wb_local_state_index",
				ok: result.ok,
				message: result.message,
			};
		})(),
		(() => {
			const result = validateRulesIndex(projectRoot);
			return {
				id: "rules_local_state_index",
				ok: result.ok,
				message: result.message,
			};
		})(),
		(() => {
			const result = validateSkillsIndex(projectRoot);
			return {
				id: "skills_local_state_index",
				ok: result.ok,
				message: result.message,
			};
		})(),
		(() => {
			const result = validateSpecsIndex(projectRoot);
			return {
				id: "specs_local_state_index",
				ok: result.ok,
				message: result.message,
			};
		})(),
		(() => {
			const result = validateFilesIndex(projectRoot);
			return {
				id: "files_local_state_index",
				ok: result.ok,
				message: result.message,
			};
		})(),
		await validateTemplateForbidden(projectRoot),
		(() => {
			// Session evidence check: run strict verify per session
			const results = verifyAllSessions(projectRoot, true);
			const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
			const openTaskSessions = results.filter((r) => r.openTasks.length > 0);
			if (results.length === 0) {
				return {
					id: "session_evidence" as const,
					ok: true,
					message: "no sessions to verify",
				};
			}
			if (totalIssues > 0) {
				return {
					id: "session_evidence" as const,
					ok: false,
					message: `${totalIssues} evidence issues across ${results.length} sessions`,
				};
			}
			if (openTaskSessions.length > 0) {
				return {
					id: "session_evidence" as const,
					ok: true,
					message: `ok, ${openTaskSessions.length} session(s) have open tasks (no evidence issues)`,
				};
			}
			return {
				id: "session_evidence" as const,
				ok: true,
				message: `ok ${results.length} sessions verified`,
			};
		})(),
		(() => {
			// Session health check
			const warnings = detectSessionHealth(projectRoot);
			if (warnings.length === 0) {
				return {
					id: "session_health" as const,
					ok: true,
					message: "no session health warnings",
				};
			}
			const hasDuplicates = warnings.some((w) => w.type === "duplicate_theme");
			return {
				id: "session_health" as const,
				ok: !hasDuplicates,
				message: warnings.map((w) => w.message).join("; "),
			};
		})(),
		(() => {
			// Toolchain claims check — only CRITICAL failures cause validate to fail
			const claims = scanTemplateToolchainClaims();
			const missing = claims.filter((c) => !c.available);
			const criticalMissing = missing.filter((c) => c.critical);
			if (missing.length === 0) {
				return {
					id: "toolchain_claims" as const,
					ok: true,
					message: `all claimed tools available: ${claims.map((c) => c.tool).join(", ")}`,
				};
			}
			if (criticalMissing.length > 0) {
				return {
					id: "toolchain_claims" as const,
					ok: false,
					message: criticalMissing.map((c) => c.error).join("; "),
				};
			}
			return {
				id: "toolchain_claims" as const,
				ok: true,
				message: `advisory tools missing: ${missing.map((c) => c.tool).join(", ")}`,
			};
		})(),
	];

	// Index drift check (opt-in via --check-drift)
	if (options?.checkDrift) {
		const drifts = detectIndexDrift(projectRoot);
		checks.push({
			id: "index_drift",
			ok: drifts.length === 0,
			message:
				drifts.length === 0
					? "no index drift"
					: `stale indexes: ${drifts.join("; ")}`,
		});
	}

	return {
		ok: checks.every((check) => check.ok),
		checks,
	};
}
