import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadJsonObject } from "../../core/schema";
import {
	scanTemplateForbiddenPaths,
	scanTemplateToolchainClaims,
	TEMPLATE_ROOT,
} from "../../schemas/template-policy";
import {
	findClaudeArtifacts,
	readClaudeAdapterEnabled,
} from "../adapter/claude";
import { resolveAdmPaths } from "../adm";
import {
	formatEventLedgerValidation,
	inspectEventLedger,
} from "../events/ledger";
import { validateEvolutionConfigExtension } from "../evolution";
import { listOpenPendingSpecs } from "../governance/pending-specs";
import {
	validateFilesIndex,
	validateRulesIndex,
	validateSkillsIndex,
	validateSpecsIndex,
} from "../local-state/project-indexes";
import {
	detectSessionHealth,
	loadWorkBenchIndexSnapshot,
	validateWorkBenchIndex,
} from "../local-state/workbench-index";
import { sessionLifecycleState } from "../workbench/lifecycle";
import { verifyAllSessions } from "../workbench/verify";
import { resolveProjectConfigPath, resolveProjectPaths } from "./paths";

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
		| "adapter_consistency"
		| "template_forbidden"
		| "event_ledger"
		| "rules_local_state_index"
		| "skills_local_state_index"
		| "specs_local_state_index"
		| "files_local_state_index"
		| "wb_local_state_index"
		| "governance_pending_specs"
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
	try {
		const resolved = resolveProjectConfigPath(projectRoot);
		if (resolved) {
			const loaded = loadJsonObject(resolved.absolutePath);
			if (!loaded.ok) {
				return { id: "config", ok: false, message: loaded.error };
			}
			const skillPathError = validateSkillPathConfig(loaded.value);
			if (skillPathError) {
				return {
					id: "config",
					ok: false,
					message: `${resolved.absolutePath}: ${skillPathError}`,
				};
			}
			const evolutionIssues = validateEvolutionConfigExtension(loaded.value);
			if (evolutionIssues.length > 0) {
				return {
					id: "config",
					ok: false,
					message: `${resolved.absolutePath}: ${evolutionIssues.join("; ")}`,
				};
			}
			return {
				id: "config",
				ok: true,
				message: `ok ${resolved.absolutePath} source=${resolved.source}`,
			};
		}
	} catch (error) {
		return { id: "config", ok: false, message: (error as Error).message };
	}
	return {
		id: "config",
		ok: false,
		message: `missing .afol/config.json or .agents/config.json under ${projectRoot}`,
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
		".agents/skills/agentic-folder-sys",
		".afol/adm/source/universal-skills/skills/agentic-folder-sys",
		".agents/skills-sync.manifest.json",
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

function validateSharedEventLedger(
	validation: ReturnType<typeof inspectEventLedger>,
): ProjectValidationCheck {
	return {
		id: "event_ledger",
		ok: validation.ok,
		message: formatEventLedgerValidation(validation),
	};
}

function validateAdapterConsistency(
	projectRoot: string,
): ProjectValidationCheck {
	const claudeEnabled = readClaudeAdapterEnabled(projectRoot);
	const claudeArtifacts = findClaudeArtifacts(projectRoot);
	if (!claudeEnabled && claudeArtifacts.length > 0) {
		return {
			id: "adapter_consistency",
			ok: false,
			message: `claude adapter is disabled but owned artifacts are present: ${claudeArtifacts.join(", ")}`,
		};
	}

	return {
		id: "adapter_consistency",
		ok: true,
		message: claudeEnabled
			? "ok claude adapter enabled"
			: "ok claude adapter disabled with no owned artifacts",
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
				const markdownResult = validateSpecsMarkdownIndex(projectRoot);
				if (!markdownResult.ok) {
					drifts.push(`specs_markdown: ${markdownResult.message}`);
				}
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

type SpecsMarkdownEntry = {
	theme: string;
	status: string;
	owner: string;
};

const SPEC_STATUSES = new Set(["draft", "active", "final", "superseded"]);

function readSpecFrontmatter(path: string): Record<string, unknown> | null {
	try {
		const content = readFileSync(path, "utf8");
		const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
		if (!match?.[1]) return null;
		const parsed = Bun.YAML.parse(match[1]);
		return parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function ownerValue(value: unknown): string {
	if (Array.isArray(value)) return stringValue(value[0]);
	return stringValue(value);
}

function validateSpecsMarkdownIndex(projectRoot: string): {
	ok: boolean;
	message: string;
} {
	const specsDir = resolveAdmPaths(projectRoot).specsDir;
	const indexPath = join(specsDir, "INDEX.md");
	if (!existsSync(indexPath)) {
		return { ok: false, message: `missing markdown index: ${indexPath}` };
	}

	const indexFrontmatter = readSpecFrontmatter(indexPath);
	if (
		!indexFrontmatter ||
		stringValue(indexFrontmatter.doc_type) !== "specs_index" ||
		stringValue(indexFrontmatter.id) !== "specs_index"
	) {
		return { ok: false, message: `invalid index frontmatter: ${indexPath}` };
	}

	const expected = new Map<string, SpecsMarkdownEntry>();
	const counts = new Map<string, number>();
	for (const name of readdirSync(specsDir).sort()) {
		if (!name.endsWith(".md") || name === "INDEX.md" || name === "README.md") {
			continue;
		}
		const path = join(specsDir, name);
		const frontmatter = readSpecFrontmatter(path);
		if (!frontmatter) {
			return { ok: false, message: `invalid spec frontmatter: ${name}` };
		}
		const id = stringValue(frontmatter.id);
		const status = stringValue(frontmatter.status);
		if (!id || !SPEC_STATUSES.has(status)) {
			return {
				ok: false,
				message: `invalid spec metadata: ${name} (id/status required)`,
			};
		}
		if (expected.has(id)) {
			return { ok: false, message: `duplicate spec id in frontmatter: ${id}` };
		}
		expected.set(id, {
			theme: stringValue(frontmatter.theme),
			status,
			owner: ownerValue(frontmatter.owners),
		});
		counts.set(status, (counts.get(status) ?? 0) + 1);
	}

	const rows = new Map<string, SpecsMarkdownEntry>();
	for (const match of readFileSync(indexPath, "utf8").matchAll(
		/^\|\s*([^|]+?)\s*\|\s*([^|]*)\s*\|\s*([^|]+?)\s*\|\s*([^|]*)\s*\|/gm,
	)) {
		const id = match[1]?.trim() ?? "";
		if (
			!id ||
			id === "SPEC ID" ||
			id.startsWith("-") ||
			["Metric", "Total", "Draft", "Active", "Final", "Superseded"].includes(id)
		) {
			continue;
		}
		if (rows.has(id))
			return { ok: false, message: `duplicate index row: ${id}` };
		rows.set(id, {
			theme: match[2]?.trim() ?? "",
			status: match[3]?.trim() ?? "",
			owner: match[4]?.trim() ?? "",
		});
	}

	for (const [id, entry] of expected) {
		const row = rows.get(id);
		if (!row) return { ok: false, message: `missing index row: ${id}` };
		if (
			row.theme !== entry.theme ||
			row.status !== entry.status ||
			row.owner !== entry.owner
		) {
			return {
				ok: false,
				message: `index/frontmatter mismatch: ${id}`,
			};
		}
	}
	for (const id of rows.keys()) {
		if (!expected.has(id))
			return { ok: false, message: `stale index row: ${id}` };
	}

	const indexSource = readFileSync(indexPath, "utf8");
	const summary = new Map<string, number>();
	for (const match of indexSource.matchAll(
		/^\|\s*(Total|Draft|Active|Final|Superseded)\s*\|\s*(\d+)\s*\|/gm,
	)) {
		summary.set(match[1] ?? "", Number(match[2]));
	}
	const expectedSummary: Record<string, number> = {
		Total: expected.size,
		Draft: counts.get("draft") ?? 0,
		Active: counts.get("active") ?? 0,
		Final: counts.get("final") ?? 0,
		Superseded: counts.get("superseded") ?? 0,
	};
	for (const [label, count] of Object.entries(expectedSummary)) {
		if (summary.get(label) !== count) {
			return { ok: false, message: `index summary drift: ${label}=${count}` };
		}
	}
	return { ok: true, message: `ok ${indexPath}` };
}

export async function validateProjectStructure(
	projectRoot: string,
	options?: ProjectValidationOptions,
): Promise<ProjectValidationReport> {
	const projectPaths = resolveProjectPaths(projectRoot);
	const eventLedger = inspectEventLedger(projectRoot);
	const workbenchIndex = validateWorkBenchIndex(projectRoot, { eventLedger });
	const workbenchSnapshot = workbenchIndex.ok
		? loadWorkBenchIndexSnapshot(projectRoot)
		: null;
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
		validateAdapterConsistency(projectRoot),
		validateSharedEventLedger(eventLedger),
		{
			id: "wb_local_state_index",
			ok: workbenchIndex.ok,
			message: workbenchIndex.message,
		},
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
		(() => {
			const open = listOpenPendingSpecs(projectRoot);
			return {
				id: "governance_pending_specs" as const,
				ok: true,
				message:
					open.length === 0
						? "no open pending_spec entries"
						: `warning: ${open.length} open pending_spec entr${open.length === 1 ? "y" : "ies"}`,
			};
		})(),
		await validateTemplateForbidden(projectRoot),
		(() => {
			// Session evidence check: run strict verify per session
			const results = verifyAllSessions(projectRoot, true);
			const totalIssues = results.reduce((sum, result) => {
				const session = result.sessionPath.split(/[\\/]/).pop() ?? "";
				const closed =
					result.taskFiles.length > 0 &&
					sessionLifecycleState(projectRoot, session) === "closed";
				return (
					sum +
					(closed || result.openTasks.length > 0
						? result.issues.length
						: result.issues.filter(
								(issue) =>
									issue.type !== "missing_evidence" &&
									issue.type !== "failed_evidence",
							).length)
				);
			}, 0);
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
			const warnings = detectSessionHealth(projectRoot, {
				eventLedger,
				...(workbenchSnapshot ? { workbenchSnapshot } : {}),
			});
			if (warnings.length === 0) {
				return {
					id: "session_health" as const,
					ok: true,
					message: "no session health warnings",
				};
			}
			const hasUnavailableSession = warnings.some(
				(w) =>
					w.type === "unreadable_session_directory" ||
					w.type === "invalid_event_ledger",
			);
			return {
				id: "session_health" as const,
				ok: !hasUnavailableSession,
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
