import { existsSync, readFileSync } from "node:fs";
import { computeSourceHash } from "../../core/source-hash";
import type { DriftFinding } from "../drift/types";
import { resolveProjectWritePath } from "../project/root";
import { buildAdmMigrationPlan } from "./planner";

export type AdmValidationReport = {
	ok: boolean;
	checked_at: string;
	findings: DriftFinding[];
};

function nowIso(): string {
	return new Date().toISOString();
}

function makeFinding(
	id: string,
	severity: DriftFinding["severity"],
	domain: DriftFinding["domain"],
	message: string,
	hint: string,
	expected?: string,
	actual?: string,
): DriftFinding {
	return {
		id,
		severity,
		domain,
		message,
		hint,
		...(expected !== undefined ? { expected } : {}),
		...(actual !== undefined ? { actual } : {}),
	};
}

function resolveSafeProjectPath(root: string, path: string): string {
	const resolved = resolveProjectWritePath(root, path);
	if (!resolved.ok) {
		throw new Error(resolved.error);
	}
	return resolved.value.path;
}

export function validateAdmMigration(root: string): AdmValidationReport {
	const plan = buildAdmMigrationPlan(root);
	const findings: DriftFinding[] = [];

	for (const entry of plan.manifest) {
		const sourcePath = resolveSafeProjectPath(root, entry.source_path);
		const targetPath = resolveSafeProjectPath(root, entry.target_path);
		if (!existsSync(targetPath)) {
			findings.push(
				makeFinding(
					`adm:${entry.target_path}:missing`,
					"warn",
					"adm",
					`missing migrated target ${entry.target_path}`,
					"run afol adm migrate",
					entry.source_hash,
					"missing",
				),
			);
			continue;
		}

		const targetHash = computeSourceHash(readFileSync(targetPath, "utf8")).hash;
		if (targetHash !== entry.source_hash) {
			findings.push(
				makeFinding(
					`adm:${entry.target_path}:stale`,
					"warn",
					"adm",
					`stale migrated target ${entry.target_path}`,
					"run afol adm migrate",
					entry.source_hash,
					targetHash,
				),
			);
		}

		if (!existsSync(sourcePath)) {
			findings.push(
				makeFinding(
					`adm:${entry.source_path}:missing`,
					"warn",
					"adm",
					`missing source ${entry.source_path}`,
					"restore the canonical .afol/adm target file",
					"missing",
					entry.source_hash,
				),
			);
		}
	}

	return {
		ok: findings.length === 0,
		checked_at: nowIso(),
		findings,
	};
}
