import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
import { resolveFleetEntrypoint, runFleetCommand } from "../commands/fleet";
import { FLEET_MAX_PROJECTS, type FleetCheckReport } from "../services/fleet";

type CapturedIo = {
	stdout: string[];
	stderr: string[];
	io: {
		stdout: (message: string) => void;
		stderr: (message: string) => void;
	};
};

const createdRoots: string[] = [];
const testGitEnv = {
	...process.env,
	GIT_AUTHOR_NAME: "AFOL Fleet Test",
	GIT_AUTHOR_EMAIL: "afol-test@example.com",
	GIT_COMMITTER_NAME: "AFOL Fleet Test",
	GIT_COMMITTER_EMAIL: "afol-test@example.com",
};

function runGitCommand(root: string, args: string[]): void {
	const command = spawnSync("git", args, {
		cwd: root,
		encoding: "utf8",
		env: testGitEnv,
	});
	if (command.status !== 0) {
		throw new Error(`git command failed: git ${args.join(" ")} (${root})`);
	}
}

function initCleanGitRoot(root: string): void {
	runGitCommand(root, ["init"]);
	runGitCommand(root, ["add", "."]);
	runGitCommand(root, ["commit", "-m", "fleet command test baseline"]);
}

function captureIo(): CapturedIo {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		io: {
			stdout: (message: string) => {
				stdout.push(message);
			},
			stderr: (message: string) => {
				stderr.push(message);
			},
		},
	};
}

function mkFleetRoot(name = "root", includeConfig = true): string {
	const root = mkdtempSync(join(tmpdir(), `fleet-cmd-${name}-`));
	createdRoots.push(root);
	mkdirSync(join(root, ".afol"), { recursive: true });
	if (includeConfig) {
		writeFileSync(
			join(root, ".afol", "config.json"),
			JSON.stringify({ schema_version: 1, project: { name } }),
			"utf8",
		);
	}
	return root;
}

function cleanupRoots(): void {
	for (const root of createdRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
}

afterEach(() => {
	cleanupRoots();
});

describe("fleet command", () => {
	test("check command emits compact blocked contract for validation-blocked roots", async () => {
		const first = mkFleetRoot("first");
		const second = mkFleetRoot("second");

		const captured = captureIo();
		const status = await runFleetCommand(
			["check", "--root", first, "--root", second],
			process.cwd(),
			captured.io,
		);

		expect(status).toBe(1);
		const output = captured.stdout[0] ?? "";
		expect(output).toContain("fleet check: blocked");
		expect(output).toContain("max_roots: 25");
		expect(output).toContain("truncated: no");
		expect(output).toContain("projects: 2");
		expect(output).toContain(`- ${first}`);
		expect(output).toContain(`- ${second}`);
		expect(output).toContain("health: ");
		expect(output).toContain("template_conflicts:");
		expect(output).toContain("validation_ok:");
	});

	test("check command emits compact JSON envelope", async () => {
		const first = mkFleetRoot("json-a");
		const second = mkFleetRoot("json-b");

		const captured = captureIo();
		const status = await runFleetCommand(
			["check", "--root", first, "--root", second, "--json"],
			process.cwd(),
			captured.io,
		);

		expect(status).toBe(1);
		const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
			schema?: string;
			ok?: boolean;
			action?: string;
			exit_code?: number;
			data?: {
				ok?: boolean;
				max_projects?: number;
				truncated?: boolean;
				projects?: Array<{
					root: string;
					config_source: string | null;
					classification: string;
					git: { state: string; dirty_count: number };
					health_summary: {
						ok: boolean;
						fail: number;
						warn: number;
						info: number;
					};
					template_update: {
						operation_summary: {
							total: number;
							create: number;
							update: number;
							remove: number;
							conflict: number;
							preserve: number;
						};
						conflict_paths_overflow: boolean;
					};
					validation: { failed_check_ids: string[] };
					local_state: { checks_failed: number };
					decision: {
						action: string;
						blockers: string[];
						next_command: string | null;
						axes: {
							git: {
								state: string;
								reason: string;
							};
							derived: {
								state: string;
								reason: string;
							};
							scaffold: {
								state: string;
								reason: string;
							};
							history: {
								state: string;
								reason: string;
							};
						};
					};
				}>;
			};
		};
		expect(payload.schema).toBe("afol.result/v1");
		expect(typeof payload.ok).toBe("boolean");
		expect(payload.ok).toBe(false);
		expect(payload.action).toBe("fleet.check");
		expect(payload.exit_code).toBe(status);
		expect(payload.data?.projects).toHaveLength(2);
		expect(
			payload.data?.projects?.every((project) =>
				[
					"healthy",
					"derived-repairable",
					"legacy",
					"mixed",
					"validation-blocked",
					"update-conflicted",
					"blocked",
				].includes(project.classification),
			),
		).toBe(true);
		expect(
			payload.data?.projects?.map((project) => project.root).sort(),
		).toEqual([first, second].sort());
		expect((payload as { projects?: unknown }).projects).toBeUndefined();
	});

	test("check command emits compact JSON for 25 roots under 20KiB", async () => {
		const roots = Array.from({ length: FLEET_MAX_PROJECTS }, (_, index) =>
			mkFleetRoot(`bounded-json-${index}`),
		);
		const args = roots.flatMap((root) => ["--root", root]);
		const captured = captureIo();
		const status = await runFleetCommand(
			["check", ...args, "--json"],
			process.cwd(),
			captured.io,
		);

		expect(status).toBe(1);

		const payloadText = captured.stdout[0] ?? "";
		expect(Buffer.byteLength(payloadText, "utf8")).toBeLessThan(20 * 1024);
		const payload = JSON.parse(payloadText) as {
			ok?: boolean;
			exit_code?: number;
			data?: { projects?: unknown[] };
		};
		expect(payload.ok).toBe(false);
		expect(payload.exit_code).toBe(status);
		expect(payload.data?.projects).toHaveLength(FLEET_MAX_PROJECTS);
		expect(payload.data?.projects).toBeDefined();
		expect((payload as { projects?: unknown }).projects).toBeUndefined();
	});

	test("one-project manual-review check marks next as none", async () => {
		const root = mkFleetRoot("single-manual-review", false);
		const json = captureIo();
		const status = await runFleetCommand(
			["check", "--root", root, "--json"],
			process.cwd(),
			json.io,
		);
		expect(status).toBe(1);
		const payload = JSON.parse(json.stdout[0] ?? "{}") as {
			ok?: boolean;
			exit_code?: number;
			data?: {
				projects?: Array<{
					root: string;
					classification: string;
					decision: {
						action: string;
						blockers: string[];
						next_command: string | null;
					};
				}>;
			};
		};
		expect(payload.ok).toBe(false);
		expect(payload.exit_code).toBe(status);
		expect(payload.data?.projects).toHaveLength(1);
		const project = payload.data?.projects?.[0];
		expect(project?.classification).toBe("blocked");
		expect(project?.decision.action).toBe("manual-review");
		expect(project?.decision.next_command).toBeNull();
		expect(project?.decision.blockers).toContain("missing-config");

		const human = captureIo();
		expect(
			await runFleetCommand(["check", "--root", root], process.cwd(), human.io),
		).toBe(1);
		const output = human.stdout[0] ?? "";
		expect(output).toContain("next: none");
		expect(output).toContain("action: manual-review");
		expect(output).toContain("blockers: missing-config");
		expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		expect(existsSync(join(root, ".afol", "data"))).toBe(false);
	});

	test("compiled entrypoint resolution preserves an absolute special-character path", () => {
		const compiledEntrypoint = "/tmp/afol with shell$space &special/afol";
		expect(
			resolveFleetEntrypoint("/$bunfs/root/afol", compiledEntrypoint),
		).toBe(compiledEntrypoint);
	});

	test("check command limits output to max 25 roots", async () => {
		const roots = Array.from({ length: FLEET_MAX_PROJECTS + 1 }, (_, index) =>
			mkFleetRoot(`bounded-${index}`),
		);
		const args = roots.flatMap((root) => ["--root", root]);
		const captured = captureIo();

		const status = await runFleetCommand(
			["check", ...args],
			process.cwd(),
			captured.io,
		);

		expect(status).toBe(1);
		const output = captured.stdout[0] ?? "";
		const lines = output.split("\n");
		expect(output).toContain("fleet check: blocked");
		expect(output).toContain("truncated: yes");
		expect(output).toContain(`projects: ${FLEET_MAX_PROJECTS}`);
		expect(lines.filter((line) => line.startsWith("- ")).length).toBe(
			FLEET_MAX_PROJECTS,
		);
		expect(Buffer.byteLength(output, "utf8")).toBeLessThan(32000);
	});

	test("check command accepts missing roots as blocked and rejects non-absolute", async () => {
		const missing = join(tmpdir(), "fleet-command-missing-root");
		rmSync(missing, { recursive: true, force: true });

		const relative = captureIo();
		expect(
			await runFleetCommand(
				["check", "--root", "relative/path"],
				process.cwd(),
				relative.io,
			),
		).toBe(2);
		expect(relative.stderr.join("\n")).toContain(
			"fleet root must be absolute: relative/path",
		);

		const json = captureIo();
		const status = await runFleetCommand(
			["check", "--root", missing, "--json"],
			process.cwd(),
			json.io,
		);

		expect(status).toBe(1);
		const payload = JSON.parse(json.stdout[0] ?? "{}") as {
			ok?: boolean;
			exit_code?: number;
			data?: FleetCheckReport;
		};
		expect(payload.ok).toBe(false);
		expect(payload.exit_code).toBe(status);
		expect(payload.data?.projects[0]?.classification).toBe("blocked");
	});

	test("repair --dry-run previews without writing derived state", async () => {
		const root = mkFleetRoot("repair-preview");
		const captured = captureIo();

		expect(
			await runFleetCommand(
				["repair", "--derived", "--dry-run", "--root", root, "--json"],
				process.cwd(),
				captured.io,
			),
		).toBe(0);

		const payload = JSON.parse(captured.stdout[0] ?? "{}") as {
			ok?: boolean;
			action?: string;
			exit_code?: number;
			data?: {
				mode: string;
				writes_performed: boolean;
				eligible: boolean;
				eligibility_reason: string;
			};
		};
		expect(payload.ok).toBe(true);
		expect(payload.action).toBe("fleet.repair.preview");
		expect(payload.exit_code).toBe(0);
		expect(payload.data?.mode).toBe("preview");
		expect(payload.data?.writes_performed).toBe(false);
		expect(payload.data?.eligible).toBe(false);
		expect(payload.data?.eligibility_reason).toContain("not-eligible");
		expect(existsSync(join(root, ".afol", "state"))).toBe(false);
	});

	test("repair apply requires an explicit reason", async () => {
		const root = mkFleetRoot("repair-apply");
		const captured = captureIo();

		expect(
			await runFleetCommand(
				["repair", "--derived", "--root", root],
				process.cwd(),
				captured.io,
			),
		).toBe(2);
		expect(captured.stderr.join("\n")).toContain(
			"fleet repair requires --reason.",
		);
	});

	test("repair apply rejects missing config and performs no writes", async () => {
		const root = mkFleetRoot("repair-missing-config", false);
		const captured = captureIo();

		expect(
			await runFleetCommand(
				[
					"repair",
					"--derived",
					"--reason",
					"missing-config block check",
					"--root",
					root,
				],
				process.cwd(),
				captured.io,
			),
		).toBe(1);
		expect(captured.stderr.join("\n")).toContain(
			"fleet repair is not eligible: not-eligible:missing-config",
		);
		expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		expect(existsSync(join(root, ".afol", "data", "index"))).toBe(false);
	});

	test("repair apply rejects dirty git worktree and performs no writes", async () => {
		const root = mkFleetRoot("repair-dirty-worktree");
		const dirty = join(root, "dirty.txt");
		writeFileSync(dirty, "tracked-baseline", "utf8");
		initCleanGitRoot(root);
		writeFileSync(dirty, "tracked-dirty", "utf8");
		const captured = captureIo();

		expect(
			await runFleetCommand(
				["repair", "--derived", "--reason", "dirty-worktree", "--root", root],
				process.cwd(),
				captured.io,
			),
		).toBe(1);
		expect(captured.stderr.join("\n")).toContain(
			"fleet repair is not eligible: not-eligible:dirty-git-worktree",
		);
		expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		expect(existsSync(join(root, ".afol", "data", "index", "rules.json"))).toBe(
			false,
		);
		expect(existsSync(join(root, ".afol", "data", "index", "specs.json"))).toBe(
			false,
		);
		expect(readFileSync(dirty, "utf8")).toBe("tracked-dirty");
	});

	test("repair apply rejects update-conflicted projects and performs no writes", async () => {
		const root = mkFleetRoot("repair-update-conflicted");
		mkdirSync(join(root, ".agents"), { recursive: true });
		writeFileSync(
			join(root, ".agents", "manifest.json"),
			JSON.stringify({ project: { name: "local change" } }),
			"utf8",
		);
		const captured = captureIo();

		expect(
			await runFleetCommand(
				[
					"repair",
					"--derived",
					"--reason",
					"skip update-conflicted",
					"--root",
					root,
				],
				process.cwd(),
				captured.io,
			),
		).toBe(1);

		expect(captured.stderr.join("\n")).toContain(
			"fleet repair is not eligible: not-eligible:non-repairable-classification",
		);
		expect(existsSync(join(root, ".afol", "state"))).toBe(false);
		expect(existsSync(join(root, ".afol", "data", "index"))).toBe(false);
	});

	test("command rejects unknown subcommands", async () => {
		const captured = captureIo();
		expect(await runFleetCommand(["bogus"], process.cwd(), captured.io)).toBe(
			2,
		);
		expect(captured.stderr.join("\n")).toContain("Unknown fleet action: bogus");
	});
});
