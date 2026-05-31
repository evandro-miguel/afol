import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadJsonObject, loadYamlObject } from "../../core/schema";
import { scanTemplateForbiddenPaths, TEMPLATE_ROOT } from "../../schemas/template-policy";
import { validateWorkBenchIndex } from "../local-state/workbench-index";

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
  | "wb_local_state_index";
  ok: boolean;
  message: string;
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

function validateJsonFile(projectRoot: string, id: "lock" | "manifest", name: string): ProjectValidationCheck {
  const path = join(projectRoot, ".agents", name);
  const loaded = loadJsonObject(path);
  if (!loaded.ok) {
    return { id, ok: false, message: loaded.error };
  }
  return { id, ok: true, message: `ok ${path}` };
}

function validateDirectory(
  projectRoot: string,
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

export async function validateProjectStructure(projectRoot: string): Promise<ProjectValidationReport> {
  const checks: ProjectValidationCheck[] = [
    validateConfig(projectRoot),
    validateJsonFile(projectRoot, "lock", "lock.json"),
    validateJsonFile(projectRoot, "manifest", "manifest.json"),
    validateDirectory(projectRoot, "rules_dir", join(projectRoot, ".agents", "rules")),
    validateDirectory(projectRoot, "skills_dir", join(projectRoot, ".agents", "skills")),
    validateDirectory(projectRoot, "wb_dir", join(projectRoot, ".agents", "wb")),
    validateDirectory(projectRoot, "docs_arc_dir", join(projectRoot, "docs", "arc")),
    (() => {
      const result = validateWorkBenchIndex(projectRoot);
      return {
        id: "wb_local_state_index",
        ok: result.ok,
        message: result.message,
      };
    })(),
    await validateTemplateForbidden(projectRoot),
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}
