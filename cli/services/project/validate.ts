import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadJsonObject, loadYamlObject } from "../../core/schema";
import { scanTemplateForbiddenPaths, scanTemplateToolchainClaims, TEMPLATE_ROOT } from "../../schemas/template-policy";
import {
  collectSessionIds,
  detectSessionHealth,
  validateWorkBenchIndex,
} from "../local-state/workbench-index";
import {
  rebuildRulesIndex,
  rebuildSkillsIndex,
  rebuildSpecsIndex,
  rebuildFilesIndex,
  validateFilesIndex,
  validateRulesIndex,
  validateSkillsIndex,
  validateSpecsIndex,
} from "../local-state/project-indexes";
import { verifyAllSessions } from "../workbench/verify";
import { resolveProjectPaths } from "./paths";

export type ProjectValidationCheck = {
  id:
    | "config"
    | "lock"
    | "manifest"
  | "rules_dir"
  | "skills_dir"
  | "wb_dir"
  | "docs_arc_dir"
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

function configCandidates(projectRoot: string): { path: string; kind: "json" | "yaml" }[] {
  return [
    { path: join(projectRoot, ".agents", "config.json"), kind: "json" },
    { path: join(projectRoot, ".agents", "agents.config"), kind: "yaml" },
  ];
}

function validateConfig(projectRoot: string): ProjectValidationCheck {
  for (const candidate of configCandidates(projectRoot)) {
    if (!existsSync(candidate.path)) {
      continue;
    }
    const loaded = candidate.kind === "json" ? loadJsonObject(candidate.path) : loadYamlObject(candidate.path);
    if (!loaded.ok) {
      return { id: "config", ok: false, message: loaded.error };
    }
    return { id: "config", ok: true, message: `ok ${candidate.path}` };
  }
  return {
    id: "config",
    ok: false,
    message: `missing .agents/config.json or .agents/agents.config under ${projectRoot}`,
  };
}

function validateJsonFile(id: "lock" | "manifest", path: string): ProjectValidationCheck {
  const loaded = loadJsonObject(path);
  if (!loaded.ok) {
    return { id, ok: false, message: loaded.error };
  }
  return { id, ok: true, message: `ok ${path}` };
}

function validateDirectory(
  _projectRoot: string,
  id: "rules_dir" | "skills_dir" | "wb_dir" | "docs_arc_dir",
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
    return { id, ok: false, message: `cannot inspect ${path}: ${(error as Error).message}` };
  }
  return { id, ok: true, message: `ok ${path}` };
}

async function validateTemplateForbidden(projectRoot: string): Promise<ProjectValidationCheck> {
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
  const dataIndexDir = resolveProjectPaths(projectRoot).abs.dataIndexDir;
  const drifts: string[] = [];

  type IndexRebuilder = {
    id: string;
    file: string;
  };
  const indexFiles: IndexRebuilder[] = [
    { id: "rules", file: "rules.json" },
    { id: "skills", file: "skills.json" },
    { id: "specs", file: "specs.json" },
    { id: "files", file: "files.json" },
    { id: "workbench", file: "workbench.json" },
  ];

  for (const { id, file } of indexFiles) {
    const indexPath = resolve(dataIndexDir, file);
    let oldContent = "";
    if (existsSync(indexPath)) {
      oldContent = readFileSync(indexPath, "utf8");
    }
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
    validateDirectory(projectRoot, "rules_dir", projectPaths.abs.rulesDir),
    validateDirectory(projectRoot, "skills_dir", projectPaths.abs.skillsDir),
    validateDirectory(projectRoot, "wb_dir", projectPaths.abs.wbDir),
    validateDirectory(projectRoot, "docs_arc_dir", join(projectRoot, "docs", "arc")),
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
        return { id: "session_evidence" as const, ok: true, message: "no sessions to verify" };
      }
      if (totalIssues > 0) {
        return {
          id: "session_evidence" as const,
          ok: false,
          message: `${totalIssues} evidence issues across ${results.length} sessions`,
        };
      }
      if (openTaskSessions.length > 0) {
        return { id: "session_evidence" as const, ok: true, message: `ok, ${openTaskSessions.length} session(s) have open tasks (no evidence issues)` };
      }
      return { id: "session_evidence" as const, ok: true, message: `ok ${results.length} sessions verified` };
    })(),
    (() => {
      // Session health check
      const warnings = detectSessionHealth(projectRoot);
      if (warnings.length === 0) {
        return { id: "session_health" as const, ok: true, message: "no session health warnings" };
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
        return { id: "toolchain_claims" as const, ok: true, message: `all claimed tools available: ${claims.map((c) => c.tool).join(", ")}` };
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
      message: drifts.length === 0 ? "no index drift" : `stale indexes: ${drifts.join("; ")}`,
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}
