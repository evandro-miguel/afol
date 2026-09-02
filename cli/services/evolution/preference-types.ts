import type { Database } from "bun:sqlite";
import type {
	PreferenceAuthorityCapability,
	PreferenceDecisionIntent,
} from "./preference-authority";

export type PreferenceProvenance = "explicit" | "inferred" | "structural";
export type PreferenceStatus = "active" | "aging" | "dormant" | "rejected";
export type PreferenceEvidenceKind =
	| PreferenceProvenance
	| "external"
	| "accepted"
	| "rejected"
	| "contradiction";
export type PreferenceSourceRef = Record<string, string>;

export type PreferenceRecord = {
	project_id: string;
	id: string;
	statement: string;
	scope: "project";
	status: PreferenceStatus;
	provenance: PreferenceProvenance;
	confidence: number;
	effective_confidence: number;
	positive_evidence: number;
	negative_evidence: number;
	last_reinforced_production_day: number;
	current_production_day: number;
	created_at: string;
	updated_at: string;
	journal_event_id: string;
	source_refs: PreferenceSourceRef[];
};

export type PreferenceEvidenceRecord = {
	project_id: string;
	id: string;
	preference_id: string;
	kind: PreferenceEvidenceKind;
	trust: "local" | "untrusted";
	weight: number;
	production_day_sequence: number;
	created_at: string;
	journal_event_id: string;
	source_refs: PreferenceSourceRef[];
};

export type PreferenceCreateInput = {
	root: string;
	db: Database;
	projectId: string;
	id: string;
	statement: string;
	provenance: PreferenceProvenance;
	timezone: string;
	authority?: PreferenceAuthorityCapability;
	confidence?: number;
	sourceRefs: PreferenceSourceRef[];
	evidenceId?: string;
	evidenceKind?: PreferenceEvidenceKind;
	weight?: number;
	trust?: "local" | "untrusted";
	now?: Date;
	evolutionEventsDir?: string;
	syncDirectory?: (directory: string) => void;
};

export type PreferenceEvidenceInput = {
	root: string;
	db: Database;
	projectId: string;
	preferenceId: string;
	evidenceId: string;
	kind: PreferenceEvidenceKind;
	weight: number;
	timezone: string;
	authority?: PreferenceAuthorityCapability;
	sourceRefs: PreferenceSourceRef[];
	trust?: "local" | "untrusted";
	now?: Date;
	evolutionEventsDir?: string;
	syncDirectory?: (directory: string) => void;
};

export type PreferenceJournalPayload = {
	project_id: string;
	preference: PreferenceRecord;
	evidence?: PreferenceEvidenceRecord;
};

export type PreferenceJournalEvent = {
	sequence: number;
	event_id: string;
	event_type: "preference";
	action: "create" | "reinforce" | "contradict" | "reject" | "reopen";
	authority_kind:
		| "explicit_project_user"
		| "approved_policy"
		| "system_observer";
	actor: string;
	caller_type: "project_user" | "system" | "local_agent";
	trust_level: "local_trusted";
	origin_ref: string;
	subject_id: string;
	timestamp: string;
	command: string;
	previous_event_digest: string;
	payload: PreferenceJournalPayload;
	payload_digest: string;
	event_digest: string;
	source_refs: Array<Record<string, string>>;
	decision: PreferenceDecisionIntent;
	decision_digest: string;
};

export type PreferenceJournalContext = {
	root: string;
	projectId: string;
	timezone?: string;
	evolutionEventsDir?: string;
};
