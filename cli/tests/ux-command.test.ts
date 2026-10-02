import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUxCommand } from "../commands/ux";
import { agentOperationContext } from "../core/operation-context";
import { loadUxRegistry } from "../services/ux/journeys";

type CapturedIo = {
	stdout: string[];
	stderr: string[];
	io: {
		stdout: (message: string) => void;
		stderr: (message: string) => void;
	};
};

let root = "";

function captureIo(): CapturedIo {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message) => stdout.push(message),
			stderr: (message) => stderr.push(message),
		},
	};
}

function write(path: string, content: string): void {
	const absolute = join(root, path);
	mkdirSync(join(absolute, ".."), { recursive: true });
	writeFileSync(absolute, content.trimStart(), "utf8");
}

function parsePayload(captured: CapturedIo): Record<string, unknown> {
	return JSON.parse(captured.stdout[0] ?? "{}") as Record<string, unknown>;
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ux-command-"));
	write("docs/standards/user-journey-registry.md", "# User Journey Registry\n");
	write("docs/templates/ux-journey.md", "# UX Journey Template\n");
	write(
		".afol/adm/benchmarks/afol-tool-scenario-coverage-plan.md",
		"# Tool Scenario Coverage Plan\n",
	);
	write(
		".afol/adm/specs/fixture-source_spec-child_01.md",
		`
---
doc_type: spec-child
id: fixture-source_spec-child_01
theme: UX source spec
status: active
roadmap_feature: F-TEST
parent_spec: fixture-parent_spec_01
---

# UX Source Spec

This spec requires an afol ux user journey for maintenance warning coverage.
`,
	);
	write(
		".afol/adm/ux/fixture-maintenance_ux-journey_01.md",
		`
---
doc_type: ux-journey
id: fixture-maintenance_ux-journey_01
theme: Maintenance Warning UX
status: active
roadmap_feature: F-TEST
parent_spec: fixture-parent_spec_01
---

# UX Journey: Maintenance Warning UX

## Purpose

The operator verifies that afol maintenance warnings are visible before closing coverage.

## Entry And Exit

- Entry point: a changed maintenance cadence.
- Success exit: UX and benchmark evidence are validated.
- Recovery exit: validation names the repair and preserves the current state.

## Flow

1. Run \`afol maintenance weekly --dry-run\`.
2. Run \`afol ux coverage --tool maintenance\`.
3. Run \`afol mt review --area memory --dry-run\`.

## Expected Result

- Output: maintenance warnings and related scenario evidence.
- Durable state change: none for validation commands.
- Warning or review prompt: the exact missing coverage and repair command.
- Token/output budget: default output remains below 5k tokens.

## States And Recovery

- Default: run the validation.
- Error: preserve state and show the failing field.
- Partial failure: continue unaffected checks and report the failed check.
- Success: show the evidence lane and next safe action.

## Evidence

Use \`afol validate bench --pack runtime-live-agent --json\`.

## Metrics

Default output remains below 5k tokens.

## Acceptance

- [x] Primary actor and goal are explicit
- [x] Steps, states, failures, and recovery are explicit
- [x] Expected AFOL tools are named
- [x] Expected output and durable state change are explicit
- [x] Evidence path is explicit
`,
	);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("ux command", () => {
	test("lists and validates user journey registry entries", async () => {
		const list = captureIo();
		expect(await runUxCommand("list", ["--json"], root, list.io)).toBe(0);
		expect(list.stderr).toEqual([]);
		const listPayload = parsePayload(list);
		expect(listPayload.ok).toBe(true);
		expect(listPayload.count).toBe(2);
		expect(JSON.stringify(listPayload)).toContain(
			"fixture-maintenance_ux-journey_01",
		);

		const validate = captureIo();
		expect(await runUxCommand("validate", ["--json"], root, validate.io)).toBe(
			0,
		);
		const validatePayload = parsePayload(validate);
		expect(validatePayload.ok).toBe(true);
		expect(validatePayload.error_count).toBe(0);
	});

	test("keeps default list compact and exposes paths in verbose mode", async () => {
		const compact = captureIo();
		expect(await runUxCommand("list", [], root, compact.io)).toBe(0);
		const compactOutput = compact.stdout.join("\n");
		expect(compactOutput).toContain("ux journeys: 2");
		expect(compactOutput).toContain("statuses: active=2");
		expect(compactOutput).toContain("sources: spec=1 ux-journey=1");
		expect(compactOutput).toContain("issues: none");
		expect(compactOutput).toContain(
			"next: use afol ux list --verbose for paths/details",
		);
		expect(compactOutput).not.toContain("path=");
		expect(Buffer.byteLength(compactOutput, "utf8")).toBeLessThan(500);
		expect(
			Math.ceil(Buffer.byteLength(compactOutput, "utf8") / 4),
		).toBeLessThan(125);
		expect(compactOutput.split("\n")).toHaveLength(5);

		const verbose = captureIo();
		expect(await runUxCommand("list", ["--verbose"], root, verbose.io)).toBe(0);
		const verboseOutput = verbose.stdout.join("\n");
		expect(verboseOutput).toContain(
			"path=.afol/adm/ux/fixture-maintenance_ux-journey_01.md",
		);
		expect(Buffer.byteLength(verboseOutput, "utf8")).toBeGreaterThan(
			Buffer.byteLength(compactOutput, "utf8"),
		);
	});

	test("keeps compact list JSON entries and full verbose entries", async () => {
		const compact = captureIo();
		expect(await runUxCommand("list", ["--json"], root, compact.io)).toBe(0);
		const payload = parsePayload(compact);
		expect(Object.keys(payload).sort()).toEqual([
			"action",
			"count",
			"data",
			"detail_hint",
			"entries",
			"exit_code",
			"generated_at",
			"issue_count",
			"issues",
			"ok",
			"schema",
			"verbose",
		]);
		expect(payload).toMatchObject({
			schema: "afol.result/v1",
			ok: true,
			action: "ux.list",
			exit_code: 0,
			count: 2,
			issue_count: 0,
			verbose: false,
		});
		const data = payload.data as Record<string, unknown>;
		expect(data).toMatchObject({
			ok: true,
			count: 2,
			issue_count: 0,
			verbose: false,
		});
		expect(payload.entries).toEqual(data.entries);
		const entry = (payload.entries as Record<string, unknown>[]).find(
			(candidate) => candidate.id === "fixture-maintenance_ux-journey_01",
		);
		expect(entry).toBeDefined();
		expect(Object.keys(entry ?? {}).sort()).toEqual([
			"doc_type",
			"id",
			"source",
			"status",
		]);
		expect(entry).toMatchObject({
			id: "fixture-maintenance_ux-journey_01",
			doc_type: "ux-journey",
			status: "active",
			source: "ux-journey",
		});

		const verbose = captureIo();
		expect(
			await runUxCommand("list", ["--json", "--verbose"], root, verbose.io),
		).toBe(0);
		const verbosePayload = parsePayload(verbose);
		const verboseEntry = (
			verbosePayload.entries as Record<string, unknown>[]
		).find((candidate) => candidate.id === "fixture-maintenance_ux-journey_01");
		expect(Object.keys(verboseEntry ?? {}).sort()).toEqual([
			"commands",
			"doc_type",
			"id",
			"missing_fields",
			"parent_spec",
			"path",
			"roadmap_feature",
			"source",
			"status",
			"title",
		]);
		expect(verboseEntry).toMatchObject({
			path: ".afol/adm/ux/fixture-maintenance_ux-journey_01.md",
			title: "UX Journey: Maintenance Warning UX",
			commands: expect.any(Array),
			missing_fields: [],
			roadmap_feature: "F-TEST",
			parent_spec: "fixture-parent_spec_01",
		});
	});

	test("summarizes issue severity and points to validation", async () => {
		write(
			".afol/adm/ux/incomplete_ux-journey_01.md",
			`
---
doc_type: ux-journey
id: incomplete_ux-journey_01
theme: Incomplete
status: draft
---

# Incomplete UX Journey
`,
		);
		const captured = captureIo();
		expect(await runUxCommand("list", [], root, captured.io)).toBe(0);
		const output = captured.stdout.join("\n");
		expect(output).toMatch(/issues: [1-9].*errors=[1-9]/);
		expect(output).toContain("next: run afol ux validate to inspect issues");
		expect(output).not.toContain("incomplete_ux-journey_01");
	});

	test("shows coverage for one AFOL tool", async () => {
		const captured = captureIo();
		expect(
			await runUxCommand(
				"coverage",
				["--tool", "maintenance", "--json"],
				root,
				captured.io,
			),
		).toBe(0);
		expect(captured.stderr).toEqual([]);
		const payload = parsePayload(captured);
		expect(payload.tool).toBe("maintenance");
		expect(payload.count).toBe(1);
		expect(JSON.stringify(payload)).toContain(
			"fixture-maintenance_ux-journey_01",
		);
	});

	test("fails closed when a tool has no UX coverage", async () => {
		const captured = captureIo();
		expect(
			await runUxCommand(
				"coverage",
				["--tool", "feedback", "--json"],
				root,
				captured.io,
			),
		).toBe(1);
		const payload = parsePayload(captured);
		expect(payload.ok).toBe(false);
		expect(payload.count).toBe(0);
		expect(payload.hint).toContain("Register a UX journey");
	});

	test("bounds verbose JSON when the UX registry is large", async () => {
		const template = readFileSync(
			join(root, ".afol", "adm", "ux", "fixture-maintenance_ux-journey_01.md"),
			"utf8",
		);
		for (let index = 0; index < 200; index += 1) {
			const id = `fixture-bulk-${index}_ux-journey_01`;
			write(
				`.afol/adm/ux/${id}.md`,
				template
					.replaceAll("fixture-maintenance_ux-journey_01", id)
					.replaceAll("Maintenance Warning UX", `Bulk UX ${index}`),
			);
		}
		const captured = captureIo();
		expect(
			await runUxCommand("list", ["--json", "--verbose"], root, captured.io),
		).toBe(0);
		expect(
			Buffer.byteLength(captured.stdout[0] ?? "", "utf8"),
		).toBeLessThanOrEqual(12_000);
		const payload = parsePayload(captured);
		expect(payload.details_truncated).toBe(true);
		expect(payload.entries_omitted).toBeGreaterThan(0);
	});

	test("bounds validation JSON when an invalid registry has many issues", async () => {
		for (let index = 0; index < 160; index += 1) {
			const id = `fixture-invalid-${index}_ux-journey_01`;
			write(
				`.afol/adm/ux/${id}.md`,
				`---\ndoc_type: ux-journey\nid: ${id}\nstatus: active\n---\n\n# Invalid UX ${index}\n`,
			);
		}
		const captured = captureIo();
		expect(await runUxCommand("validate", ["--json"], root, captured.io)).toBe(
			1,
		);
		expect(
			Buffer.byteLength(captured.stdout[0] ?? "", "utf8"),
		).toBeLessThanOrEqual(12_000);
		const payload = parsePayload(captured);
		expect(payload.details_truncated).toBe(true);
		expect(payload.issues_omitted).toBeGreaterThan(0);
	});

	test("shows one UX journey by id", async () => {
		const captured = captureIo();
		expect(
			await runUxCommand(
				"show",
				["fixture-maintenance_ux-journey_01", "--json"],
				root,
				captured.io,
			),
		).toBe(0);
		expect(captured.stderr).toEqual([]);
		const payload = parsePayload(captured);
		expect(payload.ok).toBe(true);
		expect(JSON.stringify(payload)).toContain(
			"fixture-maintenance_ux-journey_01",
		);
	});

	test("normalizes AFOL aliases when showing coverage", async () => {
		const captured = captureIo();
		expect(
			await runUxCommand(
				"coverage",
				["--tool", "mt", "--json"],
				root,
				captured.io,
			),
		).toBe(0);
		expect(captured.stderr).toEqual([]);
		const payload = parsePayload(captured);
		expect(payload.tool).toBe("mt");
		expect(payload.count).toBe(1);
		expect(JSON.stringify(payload)).toContain("afol maintenance review");
		expect(JSON.stringify(payload)).not.toContain("a mt review");
	});

	test.each([
		{
			name: "canonical command in inline code",
			id: "canonical-inline",
			body: "Run `afol status --json`.",
			expected: ["afol status"],
		},
		{
			name: "documented command alias in inline code",
			id: "documented-alias",
			body: "Run `afol mt review --dry-run`.",
			expected: ["afol maintenance review"],
		},
		{
			name: "local executable in a fenced code block",
			id: "local-executable",
			body: "```sh\n./afol v project --json\n```",
			expected: ["afol validate project"],
		},
		{
			name: "bare prose alias",
			id: "prose-alias",
			body: "A prose sentence mentions a mt review without a code span.",
			expected: [],
		},
		{
			name: "unknown command in inline code",
			id: "unknown-command",
			body: "The invalid invocation is `afol not-a-command inspect`.",
			expected: [],
		},
		{
			name: "known executable in prose",
			id: "known-executable-prose",
			body: "The prose says afol ux user journey without documenting a command.",
			expected: [],
		},
	])("extracts $name without indexing prose or unknown commands", ({
		body,
		expected,
		id: fixtureId,
	}) => {
		const id = `fixture-extraction-${fixtureId}_spec-child_01`;
		write(
			`.afol/adm/specs/${id}.md`,
			`\n---\ndoc_type: spec-child\nid: ${id}\ntheme: UX extraction\nstatus: active\nroadmap_feature: F-TEST\nparent_spec: fixture-parent_spec_01\n---\n\n# Extraction fixture\n\n${body}\n`,
		);

		const entry = loadUxRegistry(root).entries.find(
			(candidate) => candidate.id === id,
		);
		expect(entry?.commands).toEqual([...expected]);
	});

	test("previews spec-linked UX journey registration", async () => {
		const captured = captureIo();
		expect(
			await runUxCommand(
				"register",
				["--from-spec", "fixture-source_spec-child_01", "--dry-run", "--json"],
				root,
				captured.io,
			),
		).toBe(0);
		expect(captured.stderr).toEqual([]);
		const payload = parsePayload(captured);
		expect(payload.created).toBe(false);
		expect(payload.dry_run).toBe(true);
		expect(payload.path).toBe(".afol/adm/ux/fixture-source_ux-journey_01.md");
		expect(payload.entry).toMatchObject({ missing_fields: [] });
		expect(
			existsSync(join(root, ".afol/adm/ux/fixture-source_ux-journey_01.md")),
		).toBe(false);
	});

	test("respects configured adm_dir for registry reads and registration", async () => {
		write(
			".afol/config.json",
			JSON.stringify({ paths: { adm_dir: "governance/adm" } }),
		);
		write(
			"governance/adm/specs/custom-source_spec-child_01.md",
			`
---
doc_type: spec-child
id: custom-source_spec-child_01
theme: Custom UX source spec
status: active
roadmap_feature: F-TEST
parent_spec: fixture-parent_spec_01
---

# Custom UX Source Spec

This spec requires afol ux coverage.
`,
		);
		write(
			"governance/adm/ux/custom-journey_ux-journey_01.md",
			`
---
doc_type: ux-journey
id: custom-journey_ux-journey_01
theme: Custom UX journey
status: active
roadmap_feature: F-TEST
parent_spec: fixture-parent_spec_01
---

# UX Journey: Custom

## Purpose
Configured adm_dir is scanned.

## Entry And Exit
Entry is list. Exit is registry entry.

## Flow
1. Run \`afol ux list\`.

## Expected Result
The custom journey appears.

## Evidence
Use this test.

## Metrics
Default output remains compact.

## Acceptance
- [x] Primary actor and goal are explicit
- [x] Steps, states, failures, and recovery are explicit
- [x] Expected AFOL tools are named
- [x] Expected output and durable state change are explicit
- [x] Evidence path is explicit
`,
		);

		const list = captureIo();
		expect(await runUxCommand("list", ["--json"], root, list.io)).toBe(0);
		expect(JSON.stringify(parsePayload(list))).toContain(
			"custom-journey_ux-journey_01",
		);

		const register = captureIo();
		expect(
			await runUxCommand(
				"register",
				["--from-spec", "custom-source_spec-child_01", "--dry-run", "--json"],
				root,
				register.io,
			),
		).toBe(0);
		expect(parsePayload(register).path).toBe(
			"governance/adm/ux/custom-source_ux-journey_01.md",
		);
	});

	test("rejects spec ids that would escape the UX registry path", async () => {
		write(
			".afol/adm/specs/malicious-source_spec-child_01.md",
			`
---
doc_type: spec-child
id: ../../outside_spec-child_01
theme: Malicious UX source spec
status: active
roadmap_feature: F-TEST
parent_spec: fixture-parent_spec_01
---

# Malicious UX Source Spec
`,
		);
		const captured = captureIo();
		expect(
			await runUxCommand(
				"register",
				["--from-spec", "../../outside_spec-child_01", "--dry-run", "--json"],
				root,
				captured.io,
			),
		).toBe(2);
		expect(captured.stderr.join("\n")).toContain(
			"Spec id cannot be used as UX journey id",
		);
		expect(existsSync(join(root, ".afol/adm/outside_ux-journey_01.md"))).toBe(
			false,
		);
		expect(existsSync(join(root, "outside_ux-journey_01.md"))).toBe(false);
	});

	test("blocks non-dry-run registration for restricted callers", async () => {
		const captured = captureIo();
		expect(
			await runUxCommand(
				"register",
				["--from-spec", "fixture-source_spec-child_01", "--json"],
				root,
				captured.io,
				agentOperationContext(),
			),
		).toBe(2);
		expect(captured.stderr.join("\n")).toContain(
			"requires local interactive approval",
		);
		expect(
			existsSync(join(root, ".afol/adm/ux/fixture-source_ux-journey_01.md")),
		).toBe(false);
	});

	test("returns a registry error for incomplete ux journey docs", async () => {
		write(
			".afol/adm/ux/incomplete_ux-journey_01.md",
			`
---
doc_type: ux-journey
id: incomplete_ux-journey_01
theme: Incomplete
status: draft
---

# Incomplete UX Journey
`,
		);
		const captured = captureIo();
		expect(await runUxCommand("validate", ["--json"], root, captured.io)).toBe(
			1,
		);
		const payload = parsePayload(captured);
		expect(payload.ok).toBe(false);
		expect(payload.error_count).toBeGreaterThan(0);
	});

	test("rejects journeys without explicit output, exits, and recovery states", async () => {
		write(
			".afol/adm/ux/unsafe-flow_ux-journey_01.md",
			`
---
doc_type: ux-journey
id: unsafe-flow_ux-journey_01
theme: Unsafe Flow
status: active
roadmap_feature: F-TEST
parent_spec: fixture-parent_spec_01
---

# UX Journey: Unsafe Flow

## Purpose

Run a command.

## Entry And Exit

The flow starts and eventually ends.

## Flow

1. Run the command.

## Expected Result

The command works.

## Evidence

Use a test.

## Metrics

It passes.

## Acceptance

- [ ] Complete
`,
		);
		const captured = captureIo();
		expect(await runUxCommand("validate", ["--json"], root, captured.io)).toBe(
			1,
		);
		const payload = parsePayload(captured);
		const messages = JSON.stringify(payload.issues);
		expect(messages).toContain("Success exit:");
		expect(messages).toContain("Recovery exit:");
		expect(messages).toContain("## States And Recovery");
		expect(messages).toContain("Output:");
		expect(messages).toContain("Warning or review prompt:");
	});

	test("rejects marker-only journeys without an actionable recovery transition", async () => {
		write(
			".afol/adm/ux/marker-only_ux-journey_01.md",
			`
---
doc_type: ux-journey
id: marker-only_ux-journey_01
theme: Marker Only
status: active
roadmap_feature: F-TEST
parent_spec: fixture-parent_spec_01
---

# UX Journey: Marker Only

## Purpose

Run a command.

## Entry And Exit

- Success exit: Present
- Recovery exit: Present

## Flow

1. Run the command.

## Expected Result

- Output: Present
- Durable state change: Present
- Warning or review prompt: Present
- Token/output budget: Present

## States And Recovery

Everything is present.

## Evidence

Use a test.

## Metrics

It passes.

## Acceptance

- [ ] Complete
`,
		);
		const captured = captureIo();
		expect(await runUxCommand("validate", ["--json"], root, captured.io)).toBe(
			1,
		);
		const payload = parsePayload(captured);
		expect(payload.ok).toBe(false);
		expect(JSON.stringify(payload)).toContain(
			"States And Recovery: actionable transition",
		);
	});
});
