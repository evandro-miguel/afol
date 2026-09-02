import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdapterCommand } from "../commands/adapter";
import {
	ADAPTER_DEFINITIONS,
	describeAdapter,
} from "../services/adapter/antigravity";
import { symlinkTestSupport } from "./symlink-test-support";

const roots: string[] = [];
const symlinkTest = test.skipIf(!symlinkTestSupport.available);

function createRoot(enabled = false): string {
	const root = mkdtempSync(join(tmpdir(), "adapter-cmd-"));
	roots.push(root);
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(join(root, "AGENTS.md"), "# Canonical\n", "utf8");
	writeFileSync(
		join(root, ".afol", "config.json"),
		`${JSON.stringify(
			{
				schema_version: 1,
				project: { name: "adapter-test" },
				adapters: { antigravity: { enabled } },
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	return root;
}

function captureIo() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (line: string) => stdout.push(line),
			stderr: (line: string) => stderr.push(line),
		},
	};
}

function mirrorPath(root: string): string {
	return join(root, ADAPTER_DEFINITIONS.antigravity.mirrorPath);
}

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe("adapter command", () => {
	test("lists Antigravity as disabled by default", async () => {
		const capture = captureIo();
		expect(
			await runAdapterCommand("list", ["--json"], createRoot(), capture.io),
		).toBe(0);
		const payload = JSON.parse(capture.stdout.join("\n"));
		expect(payload.data.adapters).toEqual([
			expect.objectContaining({
				id: "antigravity",
				enabled: false,
				mirror_path: ".agents/rules/afol.md",
				ownership: "missing",
			}),
		]);
	});

	test("enable dry-run reports changes without mutating", async () => {
		const root = createRoot();
		const configPath = join(root, ".afol", "config.json");
		const before = readFileSync(configPath, "utf8");
		const capture = captureIo();
		expect(
			await runAdapterCommand(
				"enable",
				["antigravity", "--dry-run", "--json"],
				root,
				capture.io,
			),
		).toBe(0);
		expect(existsSync(mirrorPath(root))).toBe(false);
		expect(readFileSync(configPath, "utf8")).toBe(before);
		expect(JSON.parse(capture.stdout.join("\n")).data.changed_paths).toEqual([
			".afol/config.json",
			".agents/rules/afol.md",
		]);
	});

	test("enables the exact managed rule and sync is idempotent", async () => {
		const root = createRoot();
		expect(
			await runAdapterCommand("enable", ["antigravity"], root, captureIo().io),
		).toBe(0);
		expect(readFileSync(mirrorPath(root), "utf8")).toBe(
			ADAPTER_DEFINITIONS.antigravity.content,
		);
		expect(describeAdapter(root, "antigravity")).toEqual(
			expect.objectContaining({
				enabled: true,
				ownership: "managed",
				inSync: true,
			}),
		);
		const capture = captureIo();
		expect(
			await runAdapterCommand("sync", ["--all", "--json"], root, capture.io),
		).toBe(0);
		expect(JSON.parse(capture.stdout.join("\n")).data.outcome).toBe(
			"unchanged",
		);
	});

	test("enable preserves an unmarked user rule and returns conflict", async () => {
		const root = createRoot();
		mkdirSync(join(root, ".agents", "rules"), { recursive: true });
		writeFileSync(mirrorPath(root), "# User instructions\n", "utf8");
		const capture = captureIo();
		expect(
			await runAdapterCommand("enable", ["antigravity"], root, capture.io),
		).toBe(4);
		expect(readFileSync(mirrorPath(root), "utf8")).toBe(
			"# User instructions\n",
		);
		expect(capture.stderr.join("\n")).toContain("adapter-conflict");
	});

	test("disable removes only its exact managed file", async () => {
		const root = createRoot();
		expect(
			await runAdapterCommand("enable", ["antigravity"], root, captureIo().io),
		).toBe(0);
		writeFileSync(
			join(root, ".agents", "rules", "user.md"),
			"# User\n",
			"utf8",
		);
		expect(
			await runAdapterCommand("disable", ["antigravity"], root, captureIo().io),
		).toBe(0);
		expect(existsSync(mirrorPath(root))).toBe(false);
		expect(
			readFileSync(join(root, ".agents", "rules", "user.md"), "utf8"),
		).toBe("# User\n");
	});

	test("malformed config fails closed without rewriting", async () => {
		const root = createRoot();
		const configPath = join(root, ".afol", "config.json");
		writeFileSync(configPath, "{ malformed\n", "utf8");
		expect(
			await runAdapterCommand("enable", ["antigravity"], root, captureIo().io),
		).toBe(2);
		expect(readFileSync(configPath, "utf8")).toBe("{ malformed\n");
		expect(existsSync(mirrorPath(root))).toBe(false);
	});

	test.each([
		['{"adapters":"user value"}\n', "adapters must be an object"],
		['{"adapters":{"antigravity":[]}}\n', "antigravity must be an object"],
		[
			'{"adapters":{"antigravity":{"enabled":"yes"}}}\n',
			"antigravity.enabled must be a boolean",
		],
	])("invalid adapter config fails closed", async (raw, message) => {
		const root = createRoot();
		const configPath = join(root, ".afol", "config.json");
		writeFileSync(configPath, raw, "utf8");
		const capture = captureIo();
		expect(
			await runAdapterCommand("enable", ["antigravity"], root, capture.io),
		).toBe(2);
		expect(readFileSync(configPath, "utf8")).toBe(raw);
		expect(existsSync(mirrorPath(root))).toBe(false);
		expect(capture.stderr.join("\n")).toContain(message);
	});

	test("dry-run preserves a conflicting user-owned rule and config", async () => {
		const root = createRoot();
		const configPath = join(root, ".afol", "config.json");
		const rawConfig = readFileSync(configPath, "utf8");
		mkdirSync(join(root, ".agents", "rules"), { recursive: true });
		writeFileSync(mirrorPath(root), "# User instructions\n", "utf8");
		expect(
			await runAdapterCommand(
				"enable",
				["antigravity", "--dry-run"],
				root,
				captureIo().io,
			),
		).toBe(4);
		expect(readFileSync(configPath, "utf8")).toBe(rawConfig);
		expect(readFileSync(mirrorPath(root), "utf8")).toBe(
			"# User instructions\n",
		);
	});

	symlinkTest("refuses to follow a symlinked managed rule", async () => {
		const root = createRoot();
		const outside = join(root, "outside.md");
		writeFileSync(outside, "outside\n", "utf8");
		mkdirSync(join(root, ".agents", "rules"), { recursive: true });
		symlinkSync(outside, mirrorPath(root));
		expect(
			await runAdapterCommand("enable", ["antigravity"], root, captureIo().io),
		).toBe(4);
		expect(readFileSync(outside, "utf8")).toBe("outside\n");
	});
});
