export type SpecCheckStatus =
	| "compatible"
	| "conflict"
	| "waived"
	| "not_applicable";

export type SpecCheckResult = {
	task_id: string;
	session_id: string;
	spec_id: string;
	status: SpecCheckStatus;
	checked_at: string;
	waiver_reason?: string;
	adr_ref?: string;
};
