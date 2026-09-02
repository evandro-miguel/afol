import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { legacyReconcileSession } from "../services/project/legacy-reconcile";
import { hasJsonFlag } from "./workbench/args";
import { writeJsonError } from "./workbench/shared";
import { resolveSession } from "./workbench/verify";

function assertWorkbenchMutationAllowed(
	ctx: OperationContext,
	action: string,
): void {
	if (!requiresApproval(ctx)) return;
	throw new Error(
		`${action} denied for ${ctx.callerType} callers; rerun from a trusted local context`,
	);
}

type LegacyReconcileArgs = {
	session: string;
	reason: string;
	issue: string;
	allMissing: boolean;
	taskIds: string[];
	confirm: boolean;
	summary: string;
	json: boolean;
};

function parseLegacyReconcileArgs(
	args: string[],
	root: string,
): LegacyReconcileArgs {
	let session = "";
	let reason = "";
	let issue = "";
	let allMissing = true;
	const taskIds: string[] = [];
	let confirm = false;
	let dryRun = false;
	let summary = "";
	let json = false;

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const value = args[i + 1];
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--confirm") {
			confirm = true;
			continue;
		}
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (arg === "--all-missing") {
			allMissing = true;
			continue;
		}
		if (arg === "--session" || arg === "-S") {
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --session in legacy reconcile.");
			}
			session = value;
			i += 1;
			continue;
		}
		if (arg === "--reason" || arg === "-r") {
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --reason in legacy reconcile.");
			}
			reason = value;
			i += 1;
			continue;
		}
		if (arg === "--issue") {
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --issue in legacy reconcile.");
			}
			issue = value;
			i += 1;
			continue;
		}
		if (arg === "--task-id" || arg === "-T") {
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --task-id in legacy reconcile.");
			}
			taskIds.push(value);
			i += 1;
			continue;
		}
		if (arg === "--summary" || arg === "-m") {
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --summary in legacy reconcile.");
			}
			summary = value;
			i += 1;
			continue;
		}
		throw new Error(`Unknown legacy reconcile argument: ${arg}`);
	}

	if (!reason.trim()) {
		throw new Error("Missing nonempty --reason for legacy reconcile.");
	}
	if (!issue.trim()) {
		throw new Error("Missing nonempty --issue for legacy reconcile.");
	}

	return {
		session: resolveSession(root, session, "legacy reconcile"),
		reason,
		issue,
		allMissing: allMissing || taskIds.length === 0,
		taskIds,
		confirm: confirm && !dryRun,
		summary,
		json,
	};
}

export async function runLegacyCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	if (args[0] === "reconcile") {
		return runLegacyReconcileCommand(args.slice(1), root, ctx);
	}
	const action = args[0] ?? "";
	if (action) {
		console.error(
			`err unknown-legacy-action action=${action} hint="afol legacy reconcile"`,
		);
		return 2;
	}
	console.error('err missing-legacy-action hint="afol legacy reconcile"');
	return 2;
}

export async function runLegacyReconcileCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		const parsed = parseLegacyReconcileArgs(args, root);
		if (parsed.confirm) {
			assertWorkbenchMutationAllowed(ctx, "legacy.reconcile");
		}
		const result = legacyReconcileSession(root, {
			sessionId: parsed.session,
			reason: parsed.reason,
			issue: parsed.issue,
			allMissing: parsed.allMissing,
			taskIds: parsed.taskIds,
			confirm: parsed.confirm,
			...(parsed.summary ? { summary: parsed.summary } : {}),
		});
		const action = result.dry_run
			? "legacy.reconcile.preview"
			: "legacy.reconcile";
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							status: result.status,
							session: result.session_id,
							dry_run: result.dry_run,
							written: result.written,
							admissions: result.admissions,
							baseline_path: result.baseline_path,
							projected_close: result.projected_close,
							...(result.close ? { close: result.close } : {}),
						},
						{ action },
					),
				),
			);
			return 0;
		}
		const lines = [
			`legacy reconcile ${result.status}: ${result.admissions.length} admission(s) for ${result.session_id}`,
			`baseline: ${result.baseline_path}`,
		];
		for (const admission of result.admissions) {
			lines.push(
				`  ${admission.task_id} ${admission.issue_type} board=${admission.state_board_sha256.slice(0, 12)}… ledger=${admission.evidence_ledger_present ? "present" : "absent"}`,
			);
		}
		if (result.dry_run) {
			lines.push(
				result.projected_close.all_issues_admitted
					? "projected close: would succeed after admission"
					: "projected close: would still fail (remaining issues)",
			);
			lines.push(
				"re-run with --confirm to admit and close in one transaction.",
			);
		} else if (result.status === "reconciled") {
			lines.push("session closed in the same transaction.");
			for (const warning of result.close?.warnings ?? []) {
				lines.push(`warning: ${warning}`);
			}
		} else {
			lines.push(
				`warning: baseline written but close failed: ${result.close?.error ?? "unknown error"}`,
			);
			lines.push(
				`retry: rerun afol legacy reconcile --confirm (or afol close with legacy admit) for ${result.session_id}`,
			);
		}
		console.log(lines.join("\n"));
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("legacy.reconcile", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}
