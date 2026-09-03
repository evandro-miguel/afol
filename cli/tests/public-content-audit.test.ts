import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const auditScript = join(
	import.meta.dir,
	"..",
	"..",
	"scripts",
	"audit-public-content.ts",
);

let root = "";

function bearerCanary(value: string): string {
	return ["Bearer", value].join(" ");
}

const historicalLinuxPath = ["/", "home", "/", "operator", "/private.txt"].join(
	"",
);
const historicalWindowsSourcePath = [
	"C:",
	"\\\\",
	"Users",
	"\\\\",
	"operator",
	"\\\\private.txt",
].join("");

function write(path: string, content: string): void {
	const absolute = join(root, path);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, content, "utf8");
}

function git(args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], {
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
}

function commit(message: string): void {
	git(["add", "."]);
	git([
		"-c",
		"user.name=AFOL Test",
		"-c",
		"user.email=afol-test@example.invalid",
		"commit",
		"-qm",
		message,
	]);
}

function audit(): { exitCode: number; output: string } {
	const result = Bun.spawnSync([process.execPath, auditScript, root], {
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		output: `${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`,
	};
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "public-audit-"));
	write("README.md", "# Public fixture\n\n[Guide](docs/public/guide.md)\n");
	write("docs/public/guide.md", "# Guide\n");
	write("examples/README.md", '# Example\n\n`afol d T-01 -x "true"`\n');
	git(["init", "-q"]);
	commit("fixture");
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("public content audit", () => {
	test("accepts valid local links and runnable AFOL examples", () => {
		const result = audit();
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("public content audit passed");
	});

	test("rejects a missing local Markdown target", () => {
		write(
			"README.md",
			"# Public fixture\n\n[Missing](docs/public/missing.md)\n",
		);
		const result = audit();
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain(
			"README.md: missing-local-link:docs/public/missing.md",
		);
	});

	test("rejects unexpected root files and directories", () => {
		write("production.dump", "not production data\n");
		write("runtime-state/cache.txt", "local state\n");
		const result = audit();
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("production.dump: unexpected-root-file");
		expect(result.output).toContain("runtime-state: unexpected-root-directory");
	});

	test("rejects non-public docs and unapproved hosted workflows", () => {
		write("docs/internal/plan.md", "# Internal\n");
		write(".github/workflows/random.yml", "name: random\n");
		const result = audit();
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("docs/internal: non-public-docs-path");
		expect(result.output).toContain(
			".github/workflows/random.yml: hosted-workflow-path",
		);
	});

	test("allows only an explicitly approved hosted workflow", () => {
		write(
			"scripts/public-files.json",
			`${JSON.stringify({ allowed_workflows: [".github/workflows/ci.yml"] })}\n`,
		);
		write(".github/workflows/ci.yml", "name: CI\n");
		expect(audit().exitCode).toBe(0);

		write(".github/workflows/deploy.yml", "name: deploy\n");
		const result = audit();
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain(
			".github/workflows/deploy.yml: hosted-workflow-path",
		);
	});

	test("rejects stale public-release terminology", () => {
		const staleTerms = [
			["private", "factory"].join(" "),
			["public", "export"].join(":"),
		].join(" ");
		write("README.md", `# Public fixture\n\nUse the ${staleTerms}.\n`);
		const result = audit();
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain(
			["private", "factory", "terminology"].join("-"),
		);
		expect(result.output).toContain("retired-public-export");
	});

	test("rejects retired AFOL options anywhere in public Markdown", () => {
		write(
			"docs/public/guide.md",
			'# Guide\n\nRun `afol done T-01 --execute "bun test"`.\n',
		);
		const result = audit();
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain(
			"docs/public/guide.md: unsupported-done-option",
		);
	});

	test("allows only the exact historical redaction canaries", () => {
		write(
			"cli/services/evolution/imports/imports.test.ts",
			`const header = "${bearerCanary("secret-value")}";\n`,
		);
		write(
			"cli/tests/evolution-analysis.test.ts",
			[
				`const one = "${bearerCanary("persisted-secret")}";`,
				`const two = "${bearerCanary("json-secret")}";`,
				`const linux = "${historicalLinuxPath}";`,
				`const windows = "${historicalWindowsSourcePath}";`,
				"",
			].join("\n"),
		);
		commit("synthetic canaries");
		write(
			"cli/services/evolution/imports/imports.test.ts",
			'const header = ["Bearer", "secret-value"].join(" ");\n',
		);
		write("cli/tests/evolution-analysis.test.ts", "const safe = true;\n");
		commit("fragment synthetic canaries");

		expect(audit().exitCode).toBe(0);
	});

	test("still rejects any other reachable bearer value", () => {
		write(
			"cli/tests/evolution-analysis.test.ts",
			`const header = "${bearerCanary("not-a-synthetic-canary-12345")}";\n`,
		);
		commit("unknown bearer");
		write("cli/tests/evolution-analysis.test.ts", "const safe = true;\n");
		commit("remove unknown bearer");

		const result = audit();
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain(
			"history/cli/tests/evolution-analysis.test.ts: bearer-token",
		);
	});
});
