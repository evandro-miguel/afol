export type SuggestionReceiptStatus =
	| "claimed"
	| "shown"
	| "skipped"
	| "accepted"
	| "rejected";

export type SuggestionReceipt = {
	project_id: string;
	local_date: string;
	suggestion_id: string;
	receipt_status: SuggestionReceiptStatus;
	claimed_by: string;
	claim_token_digest: string;
	generation: number;
	claim_expires_at: string;
	reject_reason: string | null;
	evidence_digest: string;
	journal_sequence: number;
	journal_event_id: string;
};
