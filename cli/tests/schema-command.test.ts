import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSchemaCommand } from "../commands/schema-cmd";
import {
	agentOperationContext,
	remoteOperationContext,
} from "../core/operation-context";
import {
	detectResolver,
	detectShape,
	resolverPathForRoot,
	writeResolver,
	writeShapePack,
} from "../services/schema";

function mkRoot(name: string): string {
	return mkdtempSync(join(tmpdir(), `schema-${name}-`));
}

describe("schema command", () => {
	test("resolver detect returns markdown sections", () => {
		const root = mkRoot("resolver-detect");
		try {
			const content = detectResolver(root);
			expect(content).toContain("# Resolver routing");
			expect(content).toContain("## Signals");
			expect(content).toContain("## Rules");
			expect(content).toContain("## Validation commands");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolver write creates file", () => {
		const root = mkRoot("resolver-write");
		try {
			const path = writeResolver(root);
			expect(path).toBe(resolverPathForRoot(root));
			expect(existsSync(path)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolver json returns path and content", async () => {
		const root = mkRoot("resolver-json");
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (_: string) => undefined,
			};
			expect(await runSchemaCommand("resolver", ["--json"], root, io)).toBe(0);
			const payload = JSON.parse(out[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				ok: boolean;
				path: string;
				content: string;
				data: { path: string; content: string };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.path).toBe(resolverPathForRoot(root));
			expect(payload.content).toContain("# Resolver routing");
			expect(payload.content).toBe(payload.data.content);
			expect(existsSync(payload.path)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("resolver write command creates file", async () => {
		const root = mkRoot("resolver-write-cmd");
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (_: string) => undefined,
			};
			expect(
				await runSchemaCommand("resolver", ["--write", "--json"], root, io),
			).toBe(0);
			const payload = JSON.parse(out[0] ?? "{}") as {
				ok: boolean;
				path: string;
				content: string;
				write: boolean;
			};
			expect(payload.ok).toBe(true);
			expect(payload.write).toBe(true);
			expect(existsSync(payload.path)).toBe(true);
			expect(payload.content).toContain("## Tools");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detect emits a shape pack", async () => {
		const root = mkRoot("detect");
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (_: string) => undefined,
			};
			expect(await runSchemaCommand("detect", ["--json"], root, io)).toBe(0);
			const payload = JSON.parse(out[0] ?? "{}") as {
				schema: string;
				exit_code: number;
				ok: boolean;
				pack: { name: string };
				shape: { name: string };
				data: { pack: { name: string }; shape: { name: string } };
			};
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.ok).toBe(true);
			expect(payload.exit_code).toBe(0);
			expect(payload.pack.name).toBe("afol-shape");
			expect(payload.pack).toEqual(payload.shape);
			expect(payload.pack).toEqual(payload.data.pack);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("detect prints human output", async () => {
		const root = mkRoot("detect-human");
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (_: string) => undefined,
			};
			expect(await runSchemaCommand("detect", [], root, io)).toBe(0);
			expect(out[0] ?? "").toContain("schema: afol-shape");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("apply writes for local callers and blocks remote callers", async () => {
		const localRoot = mkRoot("local");
		try {
			const localOut: string[] = [];
			const localIo = {
				stdout: (value: string) => localOut.push(value),
				stderr: (_: string) => undefined,
			};
			expect(
				await runSchemaCommand("apply", ["--json"], localRoot, localIo),
			).toBe(0);
			const localPayload = JSON.parse(localOut[0] ?? "{}");
			expect(localPayload.schema).toBe("afol.result/v1");
			expect(localPayload.exit_code).toBe(0);
			expect(localPayload.pack).toEqual((localPayload.data as { pack: unknown }).pack);
			expect(
				existsSync(
					join(localRoot, ".afol", "adm", "schema", "afol-shape.yaml"),
				),
			).toBe(true);
		} finally {
			rmSync(localRoot, { recursive: true, force: true });
		}

		const remoteRoot = mkRoot("remote");
		try {
			const remoteErr: string[] = [];
			const remoteIo = {
				stdout: (_: string) => undefined,
				stderr: (value: string) => remoteErr.push(value),
			};
			expect(
				await runSchemaCommand(
					"apply",
					[],
					remoteRoot,
					remoteIo,
					remoteOperationContext(),
				),
			).toBe(2);
			expect(remoteErr[0]).toContain("remote callers");
		} finally {
			rmSync(remoteRoot, { recursive: true, force: true });
		}

		const agentRoot = mkRoot("agent");
		try {
			const agentErr: string[] = [];
			const agentIo = {
				stdout: (_: string) => undefined,
				stderr: (value: string) => agentErr.push(value),
			};
			expect(
				await runSchemaCommand(
					"apply",
					[],
					agentRoot,
					agentIo,
					agentOperationContext(),
				),
			).toBe(2);
			expect(agentErr[0]).toContain("--dry-run");
		} finally {
			rmSync(agentRoot, { recursive: true, force: true });
		}
	});

	test("suggest and review report current shape", async () => {
		const suggestRoot = mkRoot("suggest");
		try {
			const suggestOut: string[] = [];
			const suggestIo = {
				stdout: (value: string) => suggestOut.push(value),
				stderr: (_: string) => undefined,
			};
			expect(
				await runSchemaCommand("suggest", [], suggestRoot, suggestIo),
			).toBe(0);
			expect(suggestOut[0] ?? "").toContain(
				"write .afol/adm/schema/afol-shape.yaml",
			);
		} finally {
			rmSync(suggestRoot, { recursive: true, force: true });
		}

		const reviewRoot = mkRoot("review");
		try {
			writeShapePack(reviewRoot, detectShape(reviewRoot));
			const reviewOut: string[] = [];
			const reviewIo = {
				stdout: (value: string) => reviewOut.push(value),
				stderr: (_: string) => undefined,
			};
			expect(
				await runSchemaCommand("review", ["--json"], reviewRoot, reviewIo),
			).toBe(0);
			const payload = JSON.parse(reviewOut[0] ?? "{}");
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(payload.action).toBe("schema.review");
			expect(payload.detected.name).toBe("afol-shape");
			expect(Array.isArray(payload.suggestions)).toBe(true);
			expect(payload.suggestions).toEqual((payload.data as { suggestions: unknown[] }).suggestions);
		} finally {
			rmSync(reviewRoot, { recursive: true, force: true });
		}
	});

	test("apply dry-run reports without writing", async () => {
		const root = mkRoot("dry-run");
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (_: string) => undefined,
			};
			expect(
				await runSchemaCommand("apply", ["--dry-run", "--json"], root, io),
			).toBe(0);
			const payload = JSON.parse(out[0] ?? "{}");
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(0);
			expect(payload.dry_run).toBe(true);
			expect(payload.pack).toEqual((payload.data as { pack: { name: string } }).pack);
			expect(
				existsSync(join(root, ".afol", "adm", "schema", "afol-shape.yaml")),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("schema command rejects invalid action", async () => {
		const root = mkRoot("invalid");
		try {
			const out: string[] = [];
			const io = {
				stdout: (value: string) => out.push(value),
				stderr: (value: string) => out.push(value),
			};
			expect(await runSchemaCommand("bogus", ["--json"], root, io)).toBe(2);
			const payload = JSON.parse(out[0] ?? "{}");
			expect(payload.schema).toBe("afol.result/v1");
			expect(payload.exit_code).toBe(2);
			expect(payload.ok).toBe(false);
			expect((payload.error as { code: string }).code).toBe("schema.command.error");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
