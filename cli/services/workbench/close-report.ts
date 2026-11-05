import type { TaskRow } from "./lifecycle";
import type { EvidenceEntry } from "./types";
import {
	completionPolicyFromNotes,
	evidenceCompletionAuthorization,
} from "./verify";

export function readLogSummary(content: string): string | null {
	const lines = content.split(/\r?\n/);
	const start = lines.findIndex((line) => /^##\s+Summary\s*$/.test(line));
	if (start < 0) {
		return null;
	}
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => /^##\s+/.test(line));
	const summary = rest
		.slice(0, end < 0 ? undefined : end)
		.join("\n")
		.trim();
	return summary || null;
}

export function closeMarkdownText(value: string): string {
	return value.replace(/\r?\n/g, " ").replace(/^##\s+/gm, "### ");
}

export function canonicalizeLogSummary(
	content: string,
	summary: string,
): string {
	const lines = content.split(/\r?\n/);
	const output: string[] = [];
	let found = false;
	let skipping = false;
	for (const line of lines) {
		if (/^##\s+Summary\s*$/.test(line)) {
			if (!found) {
				while (output.at(-1) === "") {
					output.pop();
				}
				output.push("## Summary", "", summary);
				found = true;
			}
			skipping = true;
			continue;
		}
		if (skipping) {
			if (!/^##\s+/.test(line)) {
				continue;
			}
			skipping = false;
			if (output.at(-1) !== "") {
				output.push("");
			}
		}
		output.push(line);
	}
	if (!found) {
		while (output.at(-1) === "") {
			output.pop();
		}
		output.push("", "## Summary", "", summary);
	}
	return `${output.join("\n").replace(/\n+$/g, "")}\n`;
}

export function renderCloseReport(
	session: string,
	taskRows: TaskRow[],
	evidence: EvidenceEntry[],
	summary: string,
): string {
	const authorizingEvidenceIds = new Set<string>();
	for (const row of taskRows) {
		const authorization = evidenceCompletionAuthorization(
			evidence.filter(
				(entry) =>
					entry.task_id === row.taskId && (entry.attempt ?? 0) === row.attempt,
			),
			completionPolicyFromNotes(row.notes),
		);
		if (authorization.status === "passed" && authorization.evidenceId) {
			authorizingEvidenceIds.add(authorization.evidenceId);
		}
	}
	const lines = [
		`# Report: ${session}`,
		"",
		"## Summary",
		closeMarkdownText(summary),
		"",
		"## Tasks",
		...taskRows.map((row) => `- ${row.taskId}: ${row.state}`),
		"",
		"## Evidence",
		...evidence.map(
			(entry) =>
				`- ${entry.task_id} attempt=${entry.attempt ?? 0} evidence_id=${entry.id}${authorizingEvidenceIds.has(entry.id) ? " authorizing" : ""}: ${entry.provenance === "observed" ? "" : "declared "}${closeMarkdownText(entry.result)} (${closeMarkdownText(entry.command)}; exit_code=${entry.exit_code ?? "n/a"})`,
		),
	];
	return `${lines.join("\n").replace(/\n+$/g, "")}\n`;
}
