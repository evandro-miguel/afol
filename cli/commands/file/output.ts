import {
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../../core/envelope";
import type { CommandIo, CommandResult } from "./shared";

const FILE_RESULT_LEGACY_KEYS = [
	"command",
	"status",
	"dry_run",
	"session",
	"task_id",
	"reason",
	"path",
	"destination",
	"before_hash",
	"after_hash",
	"mutation_id",
	"target_mutation_id",
	"backup_path",
	"overwritten_backup_path",
	"diff_preview",
	"message",
] as const satisfies readonly (keyof CommandResult)[];

function fileResultEnvelope(
	result: CommandResult,
): ResultEnvelope<CommandResult> {
	if (result.status !== "blocked") {
		return envelopeOk(result, { action: "file", exitCode: 0 });
	}

	return {
		schema: "afol.result/v1",
		ok: false,
		action: "file",
		exit_code: 4,
		data: result,
	};
}

function formatHumanResult(result: CommandResult): string {
	const lines = [
		`file:${result.command}`,
		`status=${result.status}`,
		`path=${result.path}`,
		`dry_run=${result.dry_run}`,
		result.destination ? `destination=${result.destination}` : "",
		result.mutation_id ? `mutation_id=${result.mutation_id}` : "",
		result.target_mutation_id
			? `target_mutation_id=${result.target_mutation_id}`
			: "",
		result.message || "",
	].filter(Boolean);
	if (result.diff_preview) {
		lines.push("diff=");
		lines.push(result.diff_preview);
	}
	return lines.join("\n");
}

export function outputResult(
	result: CommandResult,
	io: CommandIo,
	asJson: boolean,
): void {
	if (asJson) {
		io.stdout(
			`${stringifyEnvelope(
				envelopeWithLegacyKeys(
					fileResultEnvelope(result),
					FILE_RESULT_LEGACY_KEYS,
				),
			)}\n`,
		);
		return;
	}
	io.stdout(formatHumanResult(result));
}
