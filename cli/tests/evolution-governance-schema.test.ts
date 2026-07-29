import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020, { type AnySchema, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

const root = join(import.meta.dir, "..", "..");
const schemaPath = join(
	root,
	".afol",
	"adm",
	"schema",
	"evolution-v1.schema.json",
);
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as AnySchema & {
	$id: string;
};
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema);

function validator(definition: string): ValidateFunction {
	const found = ajv.getSchema(`${schema.$id}#/$defs/${definition}`);
	if (!found)
		throw new Error(`missing evolution schema definition: ${definition}`);
	return found;
}

function evolutionConfig() {
	return {
		enabled: true,
		external: {
			mode: "explicit_import_only",
			storage: "normalized_sections",
			redact_before_persist: true,
			store_raw: false,
		},
		preferences: {
			soft_decay_after_production_days: 7,
			stop_guiding_after_production_days: 20,
			minimum_effective_confidence: 0.65,
			decay_curve: "linear",
		},
		recurrence: {
			minimum_occurrences: 3,
			minimum_distinct_sessions: 2,
			minimum_distinct_production_days: 2,
		},
		suggestions: {
			first_session_of_day: true,
			dedupe_scope: "project",
			max_visible_per_day: 1,
			remind_skipped_next_day: true,
			deep_review_after_production_days: 5,
		},
		large_change: {
			changed_files: 20,
			changed_lines: 1000,
			critical_paths_trigger: true,
		},
		autonomy: {
			auto_observe: true,
			auto_refresh_preference_projections: true,
			auto_clean_derived_state: true,
			auto_apply_mode: "canary",
		},
	};
}

function projectConfig(overrides: Record<string, unknown> = {}) {
	return {
		schema_version: 1,
		project: {
			name: "afol",
			id: "6b7d91ca-496b-4f0c-8537-5c4993810d15",
			timezone: "America/Asuncion",
		},
		paths: {
			external_dir: ".afol/external",
			evolution_db: ".afol/state/evolution.db",
			evolution_data_dir: ".afol/data/evolution",
			evolution_events_dir: ".afol/data/events/evolution",
		},
		evolution: evolutionConfig(),
		...overrides,
	};
}

function sourceRefs() {
	return [{ id: "SRC-01", kind: "evidence" }];
}

function baseRecord(recordType: string) {
	return {
		record_type: recordType,
		id: `${recordType}-01`,
		state_class: "derived",
		status: "active",
		created_at: "2026-07-16T20:00:00Z",
		source_refs: sourceRefs(),
	};
}

function journalEntry(overrides: Record<string, unknown> = {}) {
	return {
		sequence: 1,
		event_id: "EV-01",
		event_type: "observation",
		action: "record",
		authority_kind: "system_observer",
		actor: "afol",
		caller_type: "system",
		trust_level: "local_trusted",
		origin_ref: "operation-context:system",
		subject_id: "OBS-01",
		timestamp: "2026-07-16T20:00:00Z",
		command: "afol evolve analyze",
		previous_event_digest: "GENESIS",
		payload: { subject_id: "OBS-01" },
		payload_digest: "sha256:payload",
		event_digest: "sha256:event",
		source_refs: sourceRefs(),
		...overrides,
	};
}

describe("Evolution Slice 0 governance schema", () => {
	test("keeps the current project config valid and validates the extension", () => {
		const validate = ajv.getSchema(schema.$id);
		expect(validate).toBeDefined();
		const current = JSON.parse(
			readFileSync(join(root, ".afol", "config.json"), "utf8"),
		);
		const template = JSON.parse(
			readFileSync(
				join(root, "src", "project-template", ".afol", "config.json"),
				"utf8",
			),
		);
		expect(validate?.(current)).toBe(true);
		expect(validate?.(template)).toBe(true);
		expect(validate?.(projectConfig())).toBe(true);
	});

	test("permits safe custom evolution storage paths and rejects unsafe paths", () => {
		const validate = ajv.getSchema(schema.$id);
		const custom = projectConfig({
			paths: {
				external_dir: ".afol/external",
				evolution_db: ".afol/state/custom-evolution.db",
				evolution_data_dir: ".afol/data/evolution",
				evolution_events_dir: ".afol/custom-events",
			},
		});
		expect(validate?.(custom)).toBe(true);
		expect(
			validate?.({
				...custom,
				paths: {
					...(custom.paths as Record<string, unknown>),
					evolution_db: "../escape.db",
				},
			}),
		).toBe(false);
		for (const path of [".agents/runtime/evolution.db", "docs/evolution.db"]) {
			expect(
				validate?.({
					...custom,
					paths: {
						...(custom.paths as Record<string, unknown>),
						evolution_db: path,
					},
				}),
			).toBe(false);
		}
	});

	test("rejects dot traversal in every AFOL path segment", () => {
		const validate = validator("projectRelativePath");
		for (const path of [
			".afol/./evolution.db",
			".afol/../evolution.db",
			".afol/data/./evolution.db",
			".afol/data/../evolution.db",
			".afol/.",
			".afol/..",
		]) {
			expect(validate(path)).toBe(false);
		}
		for (const path of [
			".afol/.cache/evolution.db",
			".afol/data/v1.2/evolution.db",
			".afol/data/..cache/evolution.db",
		]) {
			expect(validate(path)).toBe(true);
		}
	});

	test("rejects invalid project identity and timezone shape", () => {
		const validate = ajv.getSchema(schema.$id);
		const invalidId = projectConfig({
			project: { name: "afol", id: "not-a-uuid", timezone: "America/Asuncion" },
		});
		const invalidTimezone = projectConfig({
			project: {
				name: "afol",
				id: "6b7d91ca-496b-4f0c-8537-5c4993810d15",
				timezone: "not-a-timezone",
			},
		});
		expect(validate?.(invalidId)).toBe(false);
		expect(validate?.(invalidTimezone)).toBe(false);
		expect(
			() => new Intl.DateTimeFormat("en", { timeZone: "Mars/Olympus" }),
		).toThrow();
	});

	test("requires a verified commit for automatic links", () => {
		const validate = validator("sessionLink");
		const automatic = {
			...baseRecord("session_link"),
			journal_event_id: "EV-LINK-01",
			link_state: "auto_verified",
			external_session_id: "EXT-01",
			afol_session_id: "260716_2000_example",
			project_id: "6b7d91ca-496b-4f0c-8537-5c4993810d15",
			confidence: 0.99,
			confirmation_required: false,
			eligible_for_learning: true,
		};
		expect(validate(automatic)).toBe(false);
		expect(validate({ ...automatic, verified_commit: "abcdef123456" })).toBe(
			true,
		);
	});

	test("binds canonical recurrence decisions to exact observation membership", () => {
		const validate = validator("recurrenceDecision");
		const decision = {
			...baseRecord("recurrence_decision"),
			state_class: "canonical",
			journal_event_id: "EV-REC-01",
			fingerprint: "abc123",
			fingerprint_version: 1,
			action: "confirm",
			observation_ids: ["O-01", "O-02"],
			observation_membership_digest: "membership123",
			source_decision_ref: "USER-DEC-01",
			decision_digest: "decision123",
		};
		expect(validate(decision)).toBe(true);
		expect(validate({ ...decision, observation_ids: ["O-01", "O-01"] })).toBe(
			false,
		);
		expect(validate({ ...decision, action: "approve" })).toBe(false);
	});

	test("blocks observer decisions and binds proposal mutations", () => {
		const validate = validator("journalEntry");
		expect(validate(journalEntry())).toBe(true);
		const missingPayload = journalEntry();
		delete (missingPayload as { payload?: unknown }).payload;
		expect(validate(missingPayload)).toBe(false);
		expect(
			validate(
				journalEntry({
					event_type: "decision",
					action: "forget",
					caller_type: "local_agent",
				}),
			),
		).toBe(false);
		expect(
			validate(
				journalEntry({
					event_type: "session_link",
					action: "manual_confirmed",
					authority_kind: "explicit_project_user",
					caller_type: "project_user",
				}),
			),
		).toBe(true);
		expect(
			validate(
				journalEntry({
					event_type: "decision",
					action: "forget",
					authority_kind: "approved_policy",
					caller_type: "system",
				}),
			),
		).toBe(false);
		expect(
			validate(
				journalEntry({
					event_type: "decision",
					action: "forget",
					authority_kind: "explicit_project_user",
					actor: "user-01",
					caller_type: "project_user",
				}),
			),
		).toBe(true);
		expect(
			validate(
				journalEntry({
					event_type: "receipt_decision",
					action: "rejected",
				}),
			),
		).toBe(false);
		expect(
			validate(
				journalEntry({
					event_type: "receipt_decision",
					action: "rejected",
					authority_kind: "explicit_project_user",
					caller_type: "project_user",
				}),
			),
		).toBe(true);
		expect(
			validate(
				journalEntry({
					event_type: "session_link",
					action: "manual_confirmed",
				}),
			),
		).toBe(false);
		expect(
			validate(
				journalEntry({
					event_type: "mutation",
					action: "apply",
					proposal_digest: "sha256:proposal",
				}),
			),
		).toBe(false);
		for (const event_type of ["mutation", "evaluation", "rollback"]) {
			expect(validate(journalEntry({ event_type, action: event_type }))).toBe(
				false,
			);
			expect(
				validate(
					journalEntry({
						event_type,
						action: event_type,
						proposal_digest: "sha256:proposal",
						...(event_type === "rollback" || event_type === "mutation"
							? {
									authority_kind: "approved_policy",
									caller_type: "system",
								}
							: {}),
					}),
				),
			).toBe(true);
		}
		expect(
			validate(
				journalEntry({
					event_type: "tombstone",
					action: "retain_digest",
				}),
			),
		).toBe(false);
		expect(
			validate(
				journalEntry({
					event_type: "tombstone",
					action: "retain_digest",
					authority_kind: "approved_policy",
					caller_type: "system",
				}),
			),
		).toBe(true);
	});

	test("validates real preference journal shape and authority constraints", () => {
		const validate = validator("journalEntry");
		const projectId = "6b7d91ca-496b-4f0c-8537-5c4993810d15";
		const decisionDigest = "a".repeat(64);
		const decision = {
			id: "DEC-PREF-01",
			projectId,
			preferenceId: "PREF-01",
			action: "create",
			provenance: "explicit",
			actor: "project_user",
			timestamp: "2026-07-16T20:00:00Z",
		};
		const decisionRef = {
			id: decision.id,
			kind: "decision",
			path: ".afol/data/events/evolution/preferences.jsonl",
			digest: decisionDigest,
			authority: "canonical",
		};
		const preferenceEvent = journalEntry({
			event_id: "PREF-EV-01",
			event_type: "preference",
			action: "create",
			authority_kind: "explicit_project_user",
			caller_type: "project_user",
			origin_ref: ".afol/data/events/evolution/preferences.jsonl",
			subject_id: "PREF-01",
			command: "afol evolution preference create",
			payload: {
				project_id: projectId,
				preference: {
					project_id: projectId,
					id: "PREF-01",
					statement: "Prefer focused validation",
					scope: "project",
					status: "active",
					provenance: "explicit",
					confidence: 1,
					effective_confidence: 1,
					positive_evidence: 1,
					negative_evidence: 0,
					last_reinforced_production_day: 1,
					current_production_day: 1,
					created_at: "2026-07-16T20:00:00Z",
					updated_at: "2026-07-16T20:00:00Z",
					journal_event_id: "PREF-EV-01",
					source_refs: [decisionRef],
				},
			},
			source_refs: [decisionRef],
			decision,
			decision_digest: decisionDigest,
		});
		expect(validate(preferenceEvent)).toBe(true);

		expect(validate({ ...preferenceEvent, action: "reject" })).toBe(false);
		expect(
			validate({
				...preferenceEvent,
				authority_kind: "approved_policy",
				caller_type: "system",
			}),
		).toBe(false);
		expect(
			validate({
				...preferenceEvent,
				decision: { ...decision, unexpected: true },
			}),
		).toBe(false);
		expect(validate({ ...preferenceEvent, unexpected: true })).toBe(false);
		const withoutDecision = { ...preferenceEvent };
		delete (withoutDecision as { decision?: unknown }).decision;
		expect(validate(withoutDecision)).toBe(false);

		const policyEvent = {
			...preferenceEvent,
			authority_kind: "approved_policy",
			caller_type: "system",
			decision: {
				...decision,
				provenance: "structural",
				actor: "policy",
			},
		};
		expect(validate(policyEvent)).toBe(true);
		expect(
			validate({
				...policyEvent,
				action: "reopen",
				decision: { ...policyEvent.decision, action: "reopen" },
			}),
		).toBe(false);
		expect(
			validate(
				journalEntry({
					event_type: "observation",
					action: "record",
					decision,
					decision_digest: decisionDigest,
				}),
			),
		).toBe(false);
	});

	test("keeps imported preference evidence untrusted and non-explicit", () => {
		const validate = validator("preferenceEvidence");
		const external = {
			...baseRecord("preference_evidence"),
			preference_id: "PREF-01",
			kind: "explicit",
			trust: "local",
			weight: 1,
			source_refs: [{ id: "EXT-01", kind: "external_session" }],
		};
		expect(validate(external)).toBe(false);
		expect(
			validate({ ...external, kind: "external", trust: "untrusted" }),
		).toBe(true);
	});

	test("keeps tombstones derived and linked to the canonical journal", () => {
		const validate = validator("tombstone");
		const tombstone = {
			...baseRecord("retention_tombstone"),
			subject_id: "IMPORT-01",
			content_digest: "sha256:content",
			reason: "retention expired",
			actor: "afol",
		};
		expect(validate(tombstone)).toBe(false);
		expect(validate({ ...tombstone, journal_event_id: "EV-TOMB-01" })).toBe(
			true,
		);
	});

	test("separates calendar receipts from production ordinal sequences", () => {
		const receipt = {
			...baseRecord("daily_suggestion_receipt"),
			journal_event_id: "EV-RECEIPT-01",
			local_date: "2026-07-16",
			suggestion_id: "SUG-01",
			claimed_by: "codex",
			claim_token_digest: "a".repeat(64),
			generation: 1,
			claim_expires_at: "2026-07-16T20:05:00Z",
			receipt_status: "claimed",
		};
		expect(validator("receipt")(receipt)).toBe(true);
		const receiptWithoutJournal = { ...receipt };
		delete (receiptWithoutJournal as { journal_event_id?: string })
			.journal_event_id;
		expect(validator("receipt")(receiptWithoutJournal)).toBe(false);
		const productionDay = {
			...baseRecord("production_day"),
			journal_event_id: "EV-PD-01",
			local_date: "2026-07-16",
			ordinal: "PD-0001",
			qualifying_events: ["E-01"],
		};
		expect(validator("productionDay")(productionDay)).toBe(false);
		expect(
			validator("productionDay")({ ...productionDay, ordinal_sequence: 1 }),
		).toBe(true);
	});
});
