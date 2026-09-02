import { envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import { closeSession } from "../services/workbench/lifecycle";
import {
	bindCurrentContextSession,
	compensateCarriedContinuationBinding,
	removeBinding,
	type SessionBinding,
} from "../services/workbench/session-context";
import { hasJsonFlag, parseCloseArgs } from "./workbench/args";
import { writeJsonError } from "./workbench/shared";

function assertCloseAllowed(ctx: OperationContext): void {
	if (!requiresApproval(ctx)) return;
	throw new Error(
		`workbench.close denied for ${ctx.callerType} callers; rerun from a trusted local context`,
	);
}

export async function runCloseCommand(
	args: string[],
	root: string = process.cwd(),
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	try {
		assertCloseAllowed(ctx);
		const parsed = parseCloseArgs(args, root);
		let continuationBinding: SessionBinding | null = null;
		const closeWarnings = closeSession(root, parsed.session, {
			allowNoReport: parsed.allowNoReport,
			carryOpen: parsed.carryOpen,
			reason: parsed.reason,
			summary: parsed.summary,
			admitLegacyBaseline: parsed.admitLegacyBaseline,
			...(parsed.carryOpen
				? {
						onContinuationCreated: (continuation: string) => {
							continuationBinding = bindCurrentContextSession(
								root,
								continuation,
							);
						},
						onContinuationRollback: () => {
							if (continuationBinding) {
								compensateCarriedContinuationBinding(root, {
									sourceSession: parsed.session,
									continuation: continuationBinding,
								});
							}
						},
					}
				: {}),
		});
		try {
			removeBinding(root, parsed.session);
		} catch {
			closeWarnings.push(
				`session context cleanup failed after the durable close commit; run afol ss unbind ${parsed.session}.`,
			);
		}
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							status: "closed",
							report: closeWarnings.report,
							...(closeWarnings.continuation
								? { continuation: closeWarnings.continuation }
								: {}),
						},
						{
							action: "workbench.close",
							...(closeWarnings.length > 0 ? { warnings: closeWarnings } : {}),
						},
					),
				),
			);
		} else {
			console.log(`session closed: ${parsed.session}`);
			if (closeWarnings.continuation) {
				console.log(`continuation created: ${closeWarnings.continuation}`);
			}
			for (const warning of closeWarnings) console.warn(`warning: ${warning}`);
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) writeJsonError("workbench.close", error);
		else console.error((error as Error).message);
		return 2;
	}
}
