import { describe, expect, test } from "bun:test";
import {
	buildCommandCatalog,
	buildCommandHelpJson,
	formatCatalogJson,
	formatCommandHelp,
	formatHelpText,
} from "../help";
import { kernelRegistry } from "../registry";

describe("help formatter", () => {
	test("formats compact deterministic help text", () => {
		const help = formatHelpText();
		const copy = formatHelpText({
			...kernelRegistry,
			commands: [...kernelRegistry.commands],
		});

		expect(help).toBe(copy);
		expect(help.split("\n").length).toBeLessThanOrEqual(30);
		expect(help).toContain("Usage: afol");
		expect(help).toContain("Commands");
		expect(help).toContain("s/status");
		expect(help).toContain("v/validate");
		expect(help).toContain("n/new");
		expect(help).toContain("bench");
		expect(help).toContain("a=afol");
		expect(help).not.toContain("do/doctor");
		expect(help).not.toContain("ma/maintenance");
	});

	test("formats per-command help from registry metadata", () => {
		const help = formatCommandHelp("s", kernelRegistry);
		const unknown = formatCommandHelp("nope", kernelRegistry);

		expect(help).not.toBeNull();
		if (!help) {
			throw new Error("expected command help");
		}
		expect(help).toContain("Command: status");
		expect(help).toContain("Aliases: s");
		expect(help).toContain("Category: core");
		expect(help).toContain("Side effect: read");
		expect(help).toContain("Description: Show current project status");
		expect(unknown).toBeNull();
	});

	test("builds catalog json without fake aliases", () => {
		const catalog = buildCommandCatalog(kernelRegistry);
		const parsed = JSON.parse(formatCatalogJson(kernelRegistry)) as Array<{
			command: string;
			aliases: string[];
			kind: string;
			sideEffect: string;
			description: string;
			category?: string;
		}>;

		expect(parsed).toEqual(catalog);
		expect(parsed.map((entry) => entry.command)).toEqual(
			expect.arrayContaining(["status", "pstr", "adm"]),
		);
		expect(parsed.find((entry) => entry.command === "status")?.aliases).toEqual(
			["s"],
		);
		expect(parsed.find((entry) => entry.command === "adm")?.aliases).toEqual(
			[],
		);
		expect(
			parsed.every((entry) => !entry.aliases.includes(entry.command)),
		).toBe(true);
	});

	test("builds single command json from registry metadata", () => {
		const help = buildCommandHelpJson("status", kernelRegistry);
		expect(help).not.toBeNull();
		expect(help).toEqual({
			command: "status",
			aliases: ["s"],
			kind: "status",
			sideEffect: "read",
			description: "Show current project status",
			category: "core",
		});
		expect(buildCommandHelpJson("nope", kernelRegistry)).toBeNull();
	});
});
