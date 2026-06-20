import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { resolveAdmPaths } from "../adm/paths";
import {
	readMaintenanceReviewSummary,
	scanLegacyReferences,
} from "../health/maintenance-review";
import { loadCoordinationRadar } from "../local-state/coordination-radar";
import { loadProjectRoot } from "../project/root";
import { collectGlobalStatusFindings } from "../status/global-findings";
import { computeCatchup } from "./catchup";

export type StartBriefing = {
	schema: "afol_start_briefing_v1";
	project: {
		name: string;
		root: string;
		branch: string | null;
		session: string;
		task: string;
	};
	resume: {
		session_status: "active" | "closed" | "no-session";
		changed_files: number;
		next_step: string;
		notes: string[];
	};
	roadmap: {
		total: number;
		fulfilled: number;
		by_status: Record<string, number>;
	} | null;
	tasks: {
		open_total: number;
		problem_total: number;
		open_task_ids: string[];
		problem_task_ids: string[];
	};
	warnings: string[];
	questions: string[];
};

type RoadmapSummary = StartBriefing["roadmap"];

function projectName(root: string): string {
	const loaded = loadProjectRoot(root);
	if (!loaded.ok) {
		return basename(root);
	}
	const project = loaded.value.config.project;
	if (
		project !== null &&
		typeof project === "object" &&
		!Array.isArray(project) &&
		typeof (project as Record<string, unknown>).name === "string"
	) {
		const name = ((project as Record<string, unknown>).name as string).trim();
		if (name.length > 0) {
			return name;
		}
	}
	return basename(root);
}

function summarizeRoadmap(root: string): RoadmapSummary {
	const roadmapPath = join(
		resolveAdmPaths(root).roadmapDir,
		"GENERAL-ROADMAP.md",
	);
	if (!existsSync(roadmapPath)) {
		return null;
	}
	const content = readFileSync(roadmapPath, "utf8");
	const byStatus: Record<string, number> = {};
	let total = 0;
	let fulfilled = 0;
	for (const section of content.split(/^###\s+/m).slice(1)) {
		const statusMatch = section.match(/^- Status:\s*(.+)$/m);
		if (!statusMatch?.[1]) {
			continue;
		}
		const status = statusMatch[1].trim().toLowerCase();
		if (!status) {
			continue;
		}
		total += 1;
		byStatus[status] = (byStatus[status] ?? 0) + 1;
		if (status === "final" || status === "fulfilled" || status === "done") {
			fulfilled += 1;
		}
	}
	return total > 0 ? { total, fulfilled, by_status: byStatus } : null;
}

function compactWarnings(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function pickQuestions(input: {
	openTasks: number;
	problemTasks: number;
	catchupNeedsSync: boolean;
	dueAreas: string[];
	legacyRefCount: number;
}): string[] {
	const questions: string[] = [];
	if (input.problemTasks > 0) {
		questions.push(
			"Problem tasks are open. Resolve or park them before broadening scope?",
		);
	}
	if (input.openTasks > 1) {
		questions.push(
			"More than one open task exists. Is ownership for this change clear?",
		);
	}
	if (input.catchupNeedsSync) {
		questions.push(
			"Session freshness is stale. Sync findings/log before more edits?",
		);
	}
	if (input.dueAreas.length > 0) {
		questions.push(
			`Overdue reviews exist for ${input.dueAreas.join(", ")}. Do assumptions need refresh?`,
		);
	}
	if (input.legacyRefCount > 0) {
		questions.push(
			"Legacy references remain in active docs/skills. Still intentional?",
		);
	}
	return questions.slice(0, 4);
}

export function briefingUnavailable(): {
	schema: "afol_start_briefing_v1";
	status: "briefing_unavailable";
	reason: string;
} {
	return {
		schema: "afol_start_briefing_v1",
		status: "briefing_unavailable",
		reason: "unknown",
	};
}

export function briefingUnavailableFor(
	error: unknown,
): ReturnType<typeof briefingUnavailable> {
	const raw = error instanceof Error ? error.message : String(error);
	const reason = raw.replace(/\s+/g, " ").trim().slice(0, 160) || "unknown";
	return {
		schema: "afol_start_briefing_v1",
		status: "briefing_unavailable",
		reason,
	};
}

export function buildStartBriefing(
	root: string,
	input: { session: string; taskId: string },
): StartBriefing {
	const catchup = computeCatchup(root, { session: input.session });
	const radar = loadCoordinationRadar(root);
	const maintenance = readMaintenanceReviewSummary(root);
	const legacyRefs = scanLegacyReferences(root);
	const globalFindings = collectGlobalStatusFindings(root);
	const warnings = compactWarnings([
		...globalFindings.map((entry) => entry.validation),
		...radar.warnings.map((entry) => entry.reason),
		...maintenance.due_areas.map(
			(area) =>
				`maintenance review overdue: ${area} (${maintenance.review_interval_days}d interval)`,
		),
		...(legacyRefs.count > 0
			? [
					`legacy references in active docs/skills: ${legacyRefs.files.slice(0, 3).join(", ")}${legacyRefs.count > 3 ? " ..." : ""}`,
				]
			: []),
	]);
	const problemTasks = radar.open_tasks.filter(
		(task) => task.state === "problem",
	);
	return {
		schema: "afol_start_briefing_v1",
		project: {
			name: projectName(root),
			root,
			branch: catchup.git_branch,
			session: input.session,
			task: input.taskId,
		},
		resume: {
			session_status: catchup.session_status,
			changed_files: catchup.git_changed_files.length,
			next_step: catchup.next_step,
			notes: catchup.freshness.notes,
		},
		roadmap: summarizeRoadmap(root),
		tasks: {
			open_total: radar.open_tasks.length,
			problem_total: problemTasks.length,
			open_task_ids: radar.open_tasks.map(
				(task) => `${task.session}:${task.task_id}`,
			),
			problem_task_ids: problemTasks.map(
				(task) => `${task.session}:${task.task_id}`,
			),
		},
		warnings,
		questions: pickQuestions({
			openTasks: radar.open_tasks.length,
			problemTasks: problemTasks.length,
			catchupNeedsSync:
				catchup.freshness.findings_stale || catchup.freshness.log_behind_diff,
			dueAreas: maintenance.due_areas,
			legacyRefCount: legacyRefs.count,
		}),
	};
}

export function formatStartBriefing(briefing: StartBriefing): string[] {
	const roadmap = briefing.roadmap
		? `roadmap=${briefing.roadmap.fulfilled}/${briefing.roadmap.total}`
		: "roadmap=n/a";
	const warningLine =
		briefing.warnings.length > 0
			? briefing.warnings.slice(0, 2).join(" | ")
			: "none";
	const questionLine =
		briefing.questions.length > 0
			? briefing.questions.slice(0, 2).join(" | ")
			: "none";
	return [
		`briefing: ${briefing.project.name} branch=${briefing.project.branch ?? "detached"} session=${briefing.project.session} ${roadmap}`,
		`resume: ${briefing.resume.session_status} changed=${briefing.resume.changed_files} next=${briefing.resume.next_step}`,
		`tasks: open=${briefing.tasks.open_total} problem=${briefing.tasks.problem_total}`,
		`warnings: ${warningLine}`,
		`questions: ${questionLine}`,
	];
}
