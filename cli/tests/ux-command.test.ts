import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUxCommand } from "../commands/ux";
import { agentOperationContext } from "../core/operation-context";

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

Entry is a changed maintenance cadence. Exit is validated UX and benchmark evidence.

## Flow

1. Run \`afol maintenance weekly --dry-run\`.
2. Run \`afol ux coverage --tool maintenance\`.
3. Run \`a mt review --area memory --dry-run\`.

## Expected Result

The system names maintenance warnings and the related scenario evidence.

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
});
