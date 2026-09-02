import type { VerificationRunStatus } from "./verification-runs";
import type { CompletionPolicy } from "./verify";

export type EvidenceProvenance = "declared" | "observed";

export type TaskState =
	| "pending"
	| "in_progress"
	| "implemented_untested"
	| "tested_needs_spec_validation"
	| "problem"
	| "done"
	| "moved";

export type EvidenceEntry = {
	id: string;
	task_id: string;
	project_id?: string;
	session_id?: string;
	created_at: string;
	command: string;
	result: string;
	provenance?: EvidenceProvenance;
	exit_code?: number;
	signal?: string;
	artifact?: string;
	note?: string;
	task_state?: TaskState;
	purpose?: "completion";
	authorization_type?: CompletionPolicy;
	artifact_sha256?: string;
	waiver_reason?: string;
	approved_by?: string;
	attempt?: number;
	verification_run_id?: string;
	task_attempt?: number;
	verification_attempt?: number;
	step_index?: number;
	step_count?: number;
	verification_status?: VerificationRunStatus;
	duration_ms?: number;
	command_digest?: string;
	warnings?: string[];
};
