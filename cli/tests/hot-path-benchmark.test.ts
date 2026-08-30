import { describe, expect, test } from "bun:test";
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
import { parseDoneArgs } from "../commands/workbench/args";
import {
	runVerificationAsync,
	splitCommandLine,
} from "../commands/workbench/verify";
import { sha256 } from "../services/evolution/imports/digest";
import { HOT_PATH_BENCHMARK_MARKER } from "../services/hot-path/instrumentation";
import {
	captureBenchmarkMarker,
	declaredHotPathArgs,
	executionProfile,
	F32_CONFIG_VERIFICATION_COMMAND,
	resolveHotPathLauncherArgv,
	runHotPathScenario,
} from "../validate/hot-path-benchmark";
import {
	maxSampleOutputBytes,
	prepareCompiledReleaseArtifact,
	runScenarioCommand,
} from "../validate/scenario-execution";
import type { HotPathScenarioConfig, Scenario } from "../validate/types";

function runScenario(config: HotPathScenarioConfig) {
	const root = mkdtempSync(join(tmpdir(), "f32-hot-path-test-"));
	try {
		const command =
			config.operation === "status"
				? config.derived_path === "health"
					? "afol status --health --json"
					: config.derived_path === "catchup"
						? "afol status --catchup --session fixture"
						: "afol status --json"
				: config.operation === "done"
					? `afol done T-01 --test ${JSON.stringify(F32_CONFIG_VERIFICATION_COMMAND)} --json`
					: `afol ${config.operation} --json`;
		const scenario: Scenario = {
			schema_version: "1.0.0",
			scenario_id: `f32-test-${config.operation}-${config.mode}`,
			scenario_version: "1.0.0",
			pack_id: "workbench-parity",
			command,
			result_schema: "1.0.0",
			oracle: "f32-hot-path-test",
			thresholds: {},
			baseline_id: "workbench-parity-v1",
			deterministic_metrics: { duration_ms: 0 },
			implementation_status: "implemented",
			runner: "hot-path",
			hot_path: {
				...config,
				...(config.mode === "explicit-derived" && config.operation !== "status"
					? { recovery_command: "afol local-state rebuild --json" }
					: {}),
			},
		};
		return runHotPathScenario(root, scenario, {
			sampleCount: 1,
			warmupCount: 0,
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe("F-32 hot-path benchmark runner", () => {
	test("measures the largest varying stdout/stderr sample in UTF-8 bytes", () => {
		const samples = [
			{ stdout: "é".repeat(100), stderr: "" },
			{ stdout: "x".repeat(150), stderr: "é".repeat(26) },
			{ stdout: "", stderr: "😀".repeat(51) },
		];

		expect(maxSampleOutputBytes(samples)).toBe(
			Buffer.byteLength(samples[2]?.stderr ?? "", "utf8"),
		);
	});

	test("excludes the instrumentation marker from measured stderr", () => {
		const captured = captureBenchmarkMarker(
			`visible stderr\n${HOT_PATH_BENCHMARK_MARKER}{"counters":{},"measurements":{}}`,
		);
		expect(captured.output).toBe("visible stderr");
	});

	test("source runtime launches the Bun runtime with the external entrypoint", () => {
		expect(
			resolveHotPathLauncherArgv(
				false,
				"/usr/local/bin/bun",
				"/repo/cli/main.ts",
				["status", "--json"],
			),
		).toEqual(["/usr/local/bin/bun", "/repo/cli/main.ts", "status", "--json"]);
	});

	test("compiled runtime re-executes the current binary without the embedded entrypoint", () => {
		expect(
			resolveHotPathLauncherArgv(
				true,
				"/opt/afol/bin/afol",
				"/repo/cli/main.ts",
				["status", "--json"],
			),
		).toEqual(["/opt/afol/bin/afol", "status", "--json"]);
	});

	test("compiled hot-path scenarios execute and report the prepared release artifact", () => {
		const scenario: Scenario = {
			schema_version: "1.0.0",
			scenario_id: "f32-compiled-status-default",
			scenario_version: "1.0.0",
			pack_id: "cli-kernel-local",
			command: "afol status --json",
			compiled_binary: true,
			result_schema: "1.0.0",
			oracle: "f32-hot-path-compiled-artifact",
			thresholds: {},
			baseline_id: "cli-kernel-local-v1",
			deterministic_metrics: { duration_ms: 0 },
			implementation_status: "implemented",
			runner: "hot-path",
			hot_path: { operation: "status", mode: "default" },
		};

		const root = mkdtempSync(join(tmpdir(), "f32-hot-path-compiled-"));
		const artifact = prepareCompiledReleaseArtifact(process.cwd());
		try {
			const result = runScenarioCommand(root, scenario, {
				sampleCount: 1,
				warmupCount: 0,
				artifact,
			});

			expect(result.passed).toBe(true);
			expect(result.profile.execution_mode).toBe("compiled-release");
			expect(result.profile.artifact_mode).toBe("bun-compile");
			expect(result.profile.artifact_sha256).not.toBe("source");
			expect(existsSync(join(root, ".afol"))).toBe(false);
		} finally {
			artifact.cleanup();
			rmSync(root, { recursive: true, force: true });
		}
	}, 30_000);

	test("source runtime reports the source execution profile unchanged", () => {
		const profile = executionProfile("/repo/cli/main.ts");
		expect(profile.execution_mode).toBe("source");
		expect(profile.artifact_mode).toBe("source");
		expect(profile.artifact_sha256).toBe("source");
		expect(profile.runtime_version).toBe(Bun.version);
	});

	test("compiled runtime reports compiled-release provenance with a real artifact SHA-256", () => {
		const root = mkdtempSync(join(tmpdir(), "f32-hot-path-profile-"));
		try {
			const artifactPath = join(root, "afol");
			writeFileSync(artifactPath, "compiled benchmark binary bytes");
			const profile = executionProfile(
				"/$bunfs/root/cli/main.ts",
				artifactPath,
			);
			expect(profile.execution_mode).toBe("compiled-release");
			expect(profile.artifact_mode).toBe("bun-compile");
			expect(profile.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
			expect(profile.artifact_sha256).toBe(sha256(readFileSync(artifactPath)));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("compiled runtime fails closed when the running executable cannot be hashed", () => {
		expect(() =>
			executionProfile("/$bunfs/root/cli/main.ts", "/nonexistent/afol"),
		).toThrow(/compiled-runtime-artifact-hash-failed/);
	});

	test("executes lifecycle catalog argv without synthesizing --session", () => {
		const session = "fixture-session";
		expect(
			declaredHotPathArgs(
				{ operation: "start", mode: "default" },
				"afol start T-01 --json",
				session,
			),
		).toEqual(["start", "T-01", "--json"]);
		expect(
			declaredHotPathArgs(
				{ operation: "done", mode: "default" },
				`afol done T-01 --test ${JSON.stringify(F32_CONFIG_VERIFICATION_COMMAND)} --json`,
				session,
			),
		).toEqual([
			"done",
			"T-01",
			"--test",
			F32_CONFIG_VERIFICATION_COMMAND,
			"--json",
		]);
		expect(
			declaredHotPathArgs(
				{ operation: "close", mode: "default" },
				"afol close --json",
				session,
			),
		).toEqual(["close", "--json"]);
	});

	test("tokenizes the F-32 config verification command consistently on Windows", () => {
		expect(splitCommandLine(F32_CONFIG_VERIFICATION_COMMAND)).toEqual([
			"bun",
			"-e",
			'let c=await Bun.file(".afol/config.json").json().catch(()=>null);process.exit(c?.schema_version===1&&c?.project?.name==="f32-hot-path-fixture"?0:1)',
		]);
	});

	test("done config verification requires the F-32 fixture schema and project", async () => {
		const root = mkdtempSync(join(tmpdir(), "f32-config-verification-"));
		try {
			const parsed = parseDoneArgs(
				[
					"T-01",
					"--session",
					"fixture",
					"--test",
					F32_CONFIG_VERIFICATION_COMMAND,
					"--json",
				],
				root,
			);
			expect(parsed.verifications).toEqual([
				{
					mode: "argv",
					executable: "bun",
					args: [
						"-e",
						'let c=await Bun.file(".afol/config.json").json().catch(()=>null);process.exit(c?.schema_version===1&&c?.project?.name==="f32-hot-path-fixture"?0:1)',
					],
				},
			]);
			const verification = parsed.verifications[0];
			expect(verification).toBeDefined();
			mkdirSync(join(root, ".afol"), { recursive: true });
			writeFileSync(
				join(root, ".afol", "config.json"),
				'{"schema_version":1,"project":{"name":"f32-hot-path-fixture"}}\n',
			);
			expect(
				await runVerificationAsync(
					root,
					verification as NonNullable<typeof verification>,
				),
			).toMatchObject({ exitCode: 0, status: "passed" });
			writeFileSync(join(root, ".afol", "config.json"), "{malformed\n");
			expect(
				await runVerificationAsync(
					root,
					verification as NonNullable<typeof verification>,
				),
			).toMatchObject({ exitCode: 1, status: "failed" });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.each([
		"status",
		"start",
		"done",
		"close",
	] as const)("default %s records no derived work or telemetry", (operation) => {
		const result = runScenario({ operation, mode: "default" });
		expect(result.passed).toBe(true);
		expect(result.metrics.derived_work_calls).toBe(0);
		expect(result.metrics.telemetry_append_count).toBe(0);
		expect(result.metrics.instrumented_duration_ms).toBeGreaterThan(0);
		expect(result.profile.execution_mode).toBe("source");
		expect(result.profile.artifact_mode).toBe("source");
		expect(result.profile.artifact_sha256).toBe("source");
		if (operation !== "status") {
			expect(result.metrics.canonical_write_count).toBeGreaterThan(0);
		}
	});

	test.each([
		"status",
		"start",
		"done",
		"close",
	] as const)("explicit-derived %s reports derived work", (operation) => {
		const derived_path = operation === "status" ? "health" : "rebuild";
		const result = runScenario({
			operation,
			mode: "explicit-derived",
			derived_path,
		});
		expect(result.passed).toBe(true);
		expect(result.metrics.derived_work_calls).toBeGreaterThan(0);
		expect(result.metrics.telemetry_append_count).toBe(0);
		expect(result.metrics.instrumented_duration_ms).toBeGreaterThan(0);
	});
});
