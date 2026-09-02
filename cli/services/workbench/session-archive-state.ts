import { readEventLedgerRecords } from "../events/ledger";
import { hasEventLog } from "../local-state/workbench-events";

export type ArchivedSessionState = {
	archived: boolean;
	archived_at: string | null;
};

const EMPTY_ARCHIVED_SESSION_STATE: ArchivedSessionState = {
	archived: false,
	archived_at: null,
};

export function archiveStatesFromRecords(
	records: readonly Record<string, unknown>[],
): Map<string, ArchivedSessionState> {
	const states = new Map<string, ArchivedSessionState>();
	for (const record of records) {
		const session = typeof record.session === "string" ? record.session : "";
		if (!session) continue;
		const state = states.get(session) ?? {
			...EMPTY_ARCHIVED_SESSION_STATE,
		};
		if (record.type === "workbench.archive") {
			state.archived = true;
			state.archived_at = typeof record.ts === "string" ? record.ts : null;
		} else if (record.type === "workbench.restore") {
			state.archived = false;
			state.archived_at = null;
		}
		states.set(session, state);
	}
	return states;
}

export function readArchivedSessionState(
	root: string,
	session: string,
): ArchivedSessionState {
	if (!hasEventLog(root)) {
		return { ...EMPTY_ARCHIVED_SESSION_STATE };
	}
	return (
		archiveStatesFromRecords(readEventLedgerRecords(root)).get(session) ?? {
			...EMPTY_ARCHIVED_SESSION_STATE,
		}
	);
}
