import { describe, expect, test } from "bun:test";
import { kernelRegistry } from "../registry";

describe("kernel registry", () => {
	test("exports expected command kinds and alias resolution", () => {
		expect(kernelRegistry.resolveKind("status")).toBe("status");
		expect(kernelRegistry.resolveKind("s")).toBe("status");
		expect(kernelRegistry.resolveKind("validate")).toBe("validate");
		expect(kernelRegistry.resolveKind("v")).toBe("validate");
		expect(kernelRegistry.resolveKind("check")).toBe("validate");
		expect(kernelRegistry.resolveKind("ck")).toBe("validate");
		expect(kernelRegistry.resolveKind("init")).toBe("init");
		expect(kernelRegistry.resolveKind("bootstrap")).toBe("bootstrap");
		expect(kernelRegistry.resolveKind("b")).toBe("bootstrap");
		expect(kernelRegistry.resolveKind("start")).toBe("start");
		expect(kernelRegistry.resolveKind("st")).toBe("start");
		expect(kernelRegistry.resolveKind("new")).toBe("new");
		expect(kernelRegistry.resolveKind("n")).toBe("new");
		expect(kernelRegistry.resolveKind("evidence")).toBe("evidence");
		expect(kernelRegistry.resolveKind("e")).toBe("evidence");
		expect(kernelRegistry.resolveKind("done")).toBe("done");
		expect(kernelRegistry.resolveKind("d")).toBe("done");
		expect(kernelRegistry.resolveKind("log")).toBe("log");
		expect(kernelRegistry.resolveKind("l")).toBe("log");
		expect(kernelRegistry.resolveKind("verify")).toBe("verifyTasks");
		expect(kernelRegistry.resolveKind("vf")).toBe("verifyTasks");
		expect(kernelRegistry.resolveKind("verify-tasks")).toBe("verifyTasks");
		expect(kernelRegistry.resolveKind("rule")).toBe("rule");
		expect(kernelRegistry.resolveKind("r")).toBe("rule");
		expect(kernelRegistry.resolveKind("skill")).toBe("skill");
		expect(kernelRegistry.resolveKind("sk")).toBe("skill");
		expect(kernelRegistry.resolveKind("update")).toBe("update");
		expect(kernelRegistry.resolveKind("up")).toBe("update");
		expect(kernelRegistry.resolveKind("local-state")).toBe("localState");
		expect(kernelRegistry.resolveKind("ls")).toBe("localState");
		expect(kernelRegistry.resolveKind("pstr")).toBe("pstr");
		expect(kernelRegistry.resolveKind("ps")).toBe("pstr");
		expect(kernelRegistry.resolveKind("ctx")).toBe("ctx");
		expect(kernelRegistry.resolveKind("cx")).toBe("ctx");
		expect(kernelRegistry.resolveKind("library")).toBe("library");
		expect(kernelRegistry.resolveKind("lb")).toBe("library");
		expect(kernelRegistry.resolveKind("adm")).toBe("adm");
		expect(kernelRegistry.resolveKind("health")).toBe("health");
		expect(kernelRegistry.resolveKind("ht")).toBe("health");
		expect(kernelRegistry.resolveKind("db")).toBe("db");
		expect(kernelRegistry.resolveKind("close")).toBe("close");
		expect(kernelRegistry.resolveKind("c")).toBe("close");
		expect(kernelRegistry.resolveKind("preflight")).toBe("preflight");
		expect(kernelRegistry.resolveKind("pf")).toBe("preflight");
		expect(kernelRegistry.resolveKind("task")).toBeNull();
		expect(kernelRegistry.resolveKind("query")).toBeNull();
	});

	test("keeps helper flags and public aliases only", () => {
		expect(kernelRegistry.isHelpAlias("-h")).toBe(true);
		expect(kernelRegistry.isHelpAlias("--help")).toBe(true);
		expect(kernelRegistry.isJsonAlias("-j")).toBe(true);
		expect(kernelRegistry.isJsonAlias("--json")).toBe(true);
		expect(kernelRegistry.canonicalize("sk")).toBe("skill");
		expect(kernelRegistry.canonicalize("b")).toBe("bootstrap");
		expect(kernelRegistry.canonicalize("ix")).toBe("ix");
	});

	test("publishes command side-effect metadata", () => {
		expect(kernelRegistry.commands.length).toBeGreaterThan(10);
		const byCommand = new Map(
			kernelRegistry.commands.map((entry) => [entry.command, entry]),
		);
		expect(byCommand.get("status")?.sideEffect).toBe("read");
		expect(byCommand.get("validate")?.sideEffect).toBe("read");
		expect(byCommand.get("init")?.sideEffect).toBe("write");
		expect(byCommand.get("bootstrap")?.sideEffect).toBe("write");
		expect(byCommand.get("log")?.sideEffect).toBe("append");
		expect(byCommand.get("verify-tasks")?.sideEffect).toBe("read");
		expect(byCommand.get("rule")?.sideEffect).toBe("read");
		expect(byCommand.get("skill")?.sideEffect).toBe("read");
		expect(byCommand.get("update")?.sideEffect).toBe("write");
		expect(byCommand.get("evidence")?.sideEffect).toBe("append");
		expect(byCommand.get("local-state")?.sideEffect).toBe("generated");
		expect(byCommand.get("pstr")?.sideEffect).toBe("read");
		expect(byCommand.get("ctx")?.sideEffect).toBe("read");
		expect(byCommand.get("state")?.sideEffect).toBe("read");
		expect(byCommand.get("hydrate")?.sideEffect).toBe("generated");
		expect(byCommand.get("render")?.sideEffect).toBe("generated");
		expect(byCommand.get("library")?.sideEffect).toBe("read");
		expect(byCommand.get("memory")?.sideEffect).toBe("read");
		expect(byCommand.get("adm")?.sideEffect).toBe("read");
		expect(byCommand.get("spec")?.sideEffect).toBe("read");
		expect(byCommand.get("adr")?.sideEffect).toBe("read");
		expect(byCommand.get("changelog")?.sideEffect).toBe("read");
		expect(byCommand.get("health")?.sideEffect).toBe("read");
		expect(byCommand.get("db")?.sideEffect).toBe("read");
		expect(byCommand.get("doctor")?.sideEffect).toBe("read");
		expect(byCommand.get("maintenance")?.sideEffect).toBe("read");
		expect(byCommand.get("sweep")?.sideEffect).toBe("read");
		expect(byCommand.get("schema")?.sideEffect).toBe("read");
		expect(byCommand.get("preflight")?.sideEffect).toBe("read");

		for (const entry of kernelRegistry.commands) {
			expect(["read", "write", "append", "generated"]).toContain(
				entry.sideEffect,
			);
			expect(entry.command.length).toBeGreaterThan(0);
			expect(entry.description.length).toBeGreaterThan(0);
			expect(entry.description.length).toBeLessThanOrEqual(80);
		}
	});
});
