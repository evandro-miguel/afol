import { describe, expect, test } from "bun:test";
import { formatCommandHelp, formatHelpText } from "../help";
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
});
