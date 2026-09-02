import * as v from "valibot";
import { PROJECT_BENCHMARK_SCHEMA_VERSION } from "./types";

export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const PROJECT_BENCHMARK_JSON_SCHEMA = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	$id: "https://afol.local/schemas/project-benchmark.schema.json",
	title: "AFOL Project Benchmark Catalog",
	type: "object",
	required: [
		"schema_version",
		"id",
		"name",
		"category",
		"status",
		"source_access",
		"last_reviewed_at",
		"stale_after_days",
		"confidence",
		"similarity_axes",
		"similarities",
		"differences",
		"lessons_for_afol",
		"do_not_copy",
		"source_refs",
	],
	properties: {
		schema_version: { const: PROJECT_BENCHMARK_SCHEMA_VERSION },
		id: { type: "string", pattern: PROJECT_ID_PATTERN.source },
		name: { type: "string", minLength: 1 },
		category: {
			type: "string",
			enum: ["direct_comparable", "protocol_reference", "adjacent_reference"],
		},
		status: { type: "string", enum: ["active", "paused", "archived"] },
		source_access: {
			type: "string",
			enum: ["open_source", "official_docs", "docs_only", "closed_source"],
		},
		last_reviewed_at: { type: "string", format: "date" },
		stale_after_days: { type: "integer", minimum: 1 },
		confidence: { type: "string", enum: ["low", "medium", "high"] },
		similarity_axes: {
			type: "object",
			minProperties: 1,
			additionalProperties: {
				type: "object",
				required: ["score", "evidence_refs"],
				properties: {
					score: { type: "integer", minimum: 0, maximum: 5 },
					evidence_refs: {
						type: "array",
						items: { type: "string" },
						minItems: 1,
					},
				},
				additionalProperties: false,
			},
		},
		similarities: {
			type: "array",
			minItems: 1,
			items: { $ref: "#/$defs/axisClaim" },
		},
		differences: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				required: ["claim"],
				properties: { claim: { type: "string", minLength: 1 } },
				additionalProperties: false,
			},
		},
		lessons_for_afol: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				required: ["axis", "lesson"],
				properties: {
					axis: { type: "string" },
					lesson: { type: "string", minLength: 1 },
				},
				additionalProperties: false,
			},
		},
		do_not_copy: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				required: ["reason"],
				properties: { reason: { type: "string", minLength: 1 } },
				additionalProperties: false,
			},
		},
		source_refs: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				required: ["id", "title", "url", "source_type", "claim", "axes"],
				properties: {
					id: { type: "string", minLength: 1 },
					title: { type: "string", minLength: 1 },
					url: { type: "string", format: "uri" },
					source_type: {
						type: "string",
						enum: ["official_doc", "official_repo", "spec", "paper", "article"],
					},
					claim: { type: "string", minLength: 1 },
					axes: {
						type: "array",
						items: { type: "string", minLength: 1 },
						minItems: 1,
					},
				},
				additionalProperties: false,
			},
		},
	},
	additionalProperties: false,
	$defs: {
		axisClaim: {
			type: "object",
			required: ["axis", "claim", "evidence_refs"],
			properties: {
				axis: { type: "string" },
				claim: { type: "string", minLength: 1 },
				evidence_refs: {
					type: "array",
					items: { type: "string" },
					minItems: 1,
				},
			},
			additionalProperties: false,
		},
	},
} as const;

const nonEmptyString = v.pipe(v.string(), v.minLength(1));
const nonEmptyStringArray = v.pipe(v.array(nonEmptyString), v.minLength(1));
const axisClaim = v.strictObject({
	axis: v.string(),
	claim: nonEmptyString,
	evidence_refs: nonEmptyStringArray,
});

export const ProjectBenchmarkProjectSchema = v.strictObject({
	schema_version: v.literal(PROJECT_BENCHMARK_SCHEMA_VERSION),
	id: v.pipe(v.string(), v.regex(PROJECT_ID_PATTERN)),
	name: nonEmptyString,
	category: v.picklist([
		"direct_comparable",
		"protocol_reference",
		"adjacent_reference",
	]),
	status: v.picklist(["active", "paused", "archived"]),
	source_access: v.picklist([
		"open_source",
		"official_docs",
		"docs_only",
		"closed_source",
	]),
	last_reviewed_at: v.pipe(v.string(), v.isoDate()),
	stale_after_days: v.pipe(v.number(), v.integer(), v.minValue(1)),
	confidence: v.picklist(["low", "medium", "high"]),
	similarity_axes: v.pipe(
		v.record(
			v.string(),
			v.strictObject({
				score: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)),
				evidence_refs: nonEmptyStringArray,
			}),
		),
		v.minEntries(1),
	),
	similarities: v.pipe(v.array(axisClaim), v.minLength(1)),
	differences: v.pipe(
		v.array(v.strictObject({ claim: nonEmptyString })),
		v.minLength(1),
	),
	lessons_for_afol: v.pipe(
		v.array(
			v.strictObject({
				axis: v.string(),
				lesson: nonEmptyString,
			}),
		),
		v.minLength(1),
	),
	do_not_copy: v.pipe(
		v.array(v.strictObject({ reason: nonEmptyString })),
		v.minLength(1),
	),
	source_refs: v.pipe(
		v.array(
			v.strictObject({
				id: nonEmptyString,
				title: nonEmptyString,
				url: v.pipe(v.string(), v.url()),
				source_type: v.picklist([
					"official_doc",
					"official_repo",
					"spec",
					"paper",
					"article",
				]),
				claim: nonEmptyString,
				axes: nonEmptyStringArray,
			}),
		),
		v.minLength(1),
	),
});

export function validateProjectBenchmarkProjectSchema(project: unknown) {
	return v.safeParse(ProjectBenchmarkProjectSchema, project);
}
