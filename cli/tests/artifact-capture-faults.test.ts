import { describe, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveArtifact } from "../services/artifacts/storage";
import { removeEvolutionTestRoot } from "./evolution-test-support";

function fixture(): string {
	const root = fs.mkdtempSync(join(tmpdir(), "capture-faults-"));
	fs.mkdirSync(join(root, ".afol"));
	fs.writeFileSync(
		join(root, ".afol/config.json"),
		JSON.stringify({
			schema_version: 1,
			project: {
				id: "5f2d8c1e-9a44-4d7a-8f21-64c0f0a11c77",
				name: "capture-faults",
				timezone: "UTC",
			},
			paths: { wb_dir: ".afol/wb", records_dir: ".afol/records" },
		}),
	);
	return root;
}

function markdownFiles(root: string): string[] {
	return fs
		.readdirSync(root, { recursive: true })
		.filter((path) => typeof path === "string" && path.endsWith(".md"))
		.map(String);
}

function input(root: string) {
	return {
		root,
		kind: "note",
		text: "durable fault-matrix content",
		record: "R-fault",
		requestId: "one-request",
	};
}

function errno(code: string): Error {
	return Object.assign(new Error(`controlled ${code}`), { code });
}

function isPublicationFd(fd: number): boolean {
	return fs.readlinkSync(`/proc/self/fd/${fd}`).endsWith(".md.tmp");
}

describe.skipIf(process.platform !== "linux")(
	"capture durability faults",
	() => {
		for (const code of ["ENOSPC", "EACCES"]) {
			for (const point of ["open", "write", "fsync", "link"] as const) {
				test(`${code} at publication ${point} preserves a recoverable single request`, () => {
					const root = fixture();
					let injected = false;
					const originalOpen = fs.openSync;
					const originalWrite = fs.writeSync;
					const originalSync = fs.fsyncSync;
					const originalLink = fs.linkSync;
					const trigger = () => {
						injected = true;
						throw errno(code);
					};
					const spies = [
						spyOn(fs, "openSync").mockImplementation((...args) => {
							if (point === "open" && String(args[0]).endsWith(".md.tmp"))
								trigger();
							return originalOpen(...args);
						}),
						spyOn(fs, "writeSync").mockImplementation((...args) => {
							if (point === "write" && isPublicationFd(args[0])) trigger();
							return Reflect.apply(originalWrite, fs, args);
						}),
						spyOn(fs, "fsyncSync").mockImplementation((fd) => {
							if (point === "fsync" && isPublicationFd(fd)) trigger();
							return originalSync(fd);
						}),
						spyOn(fs, "linkSync").mockImplementation((...args) => {
							if (point === "link" && String(args[0]).endsWith(".md.tmp"))
								trigger();
							return originalLink(...args);
						}),
					];
					try {
						expect(() => saveArtifact(input(root))).toThrow(
							`controlled ${code}`,
						);
						expect(injected).toBe(true);
						expect(markdownFiles(root)).toEqual([]);
						for (const spy of spies) spy.mockRestore();
						const recovered = saveArtifact(input(root));
						expect(recovered.persisted).toBe(true);
						expect(recovered.request_state).toBe("committed");
						expect(saveArtifact(input(root))).toMatchObject({
							path: recovered.path,
							content_digest: recovered.content_digest,
							duplicate: true,
						});
						expect(markdownFiles(root)).toEqual([recovered.path]);
					} finally {
						for (const spy of spies) spy.mockRestore();
						removeEvolutionTestRoot(root);
					}
				});
			}
		}

		for (const failRename of [1, 2]) {
			test(`request marker rename failure ${failRename} leaves honest recoverable state`, () => {
				const root = fixture();
				const original = fs.renameSync;
				let calls = 0;
				const spy = spyOn(fs, "renameSync").mockImplementation((...args) => {
					if (String(args[1]).endsWith(".json") && ++calls === failRename)
						throw errno("ENOSPC");
					return original(...args);
				});
				try {
					if (failRename === 1) {
						expect(() => saveArtifact(input(root))).toThrow(
							"controlled ENOSPC",
						);
						expect(markdownFiles(root)).toEqual([]);
					} else {
						expect(saveArtifact(input(root))).toMatchObject({
							persisted: true,
							request_state: "prepared",
						});
						expect(markdownFiles(root)).toHaveLength(1);
					}
					expect(calls).toBe(failRename);
					spy.mockRestore();
					const recovered = saveArtifact(input(root));
					expect(recovered.request_state).toBe("committed");
					expect(markdownFiles(root)).toEqual([recovered.path]);
					expect(saveArtifact(input(root)).duplicate).toBe(true);
				} finally {
					spy.mockRestore();
					removeEvolutionTestRoot(root);
				}
			});
		}

		for (const point of [
			"afterIntent",
			"afterPublication",
			"beforeCompletion",
		]) {
			test(`process termination at ${point} recovers the original request without duplication`, () => {
				const root = fixture();
				try {
					const storage = join(
						import.meta.dir,
						"../services/artifacts/storage.ts",
					);
					const result = spawnSync(
						process.execPath,
						[
							"-e",
							`import { saveArtifact } from ${JSON.stringify(storage)}; saveArtifact(${JSON.stringify(input(root))}, { ${point}: () => process.exit(85) });`,
						],
						{ encoding: "utf8", timeout: 5_000 },
					);
					expect(result.status).toBe(85);
					expect(result.stderr).toBe("");
					expect(markdownFiles(root)).toHaveLength(
						point === "afterIntent" ? 0 : 1,
					);
					// Model restart after the documented stale-lock grace period. Only
					// this fixture's dead child locks are aged; live-lock tests are separate.
					const aged = Date.now() - 60_000;
					const locks = fs
						.readdirSync(root, { recursive: true })
						.filter(
							(path) => typeof path === "string" && path.endsWith(".lock"),
						);
					expect(locks).toHaveLength(1);
					for (const lock of locks) {
						const path = join(root, String(lock));
						const metadata = JSON.parse(fs.readFileSync(path, "utf8"));
						expect(metadata.pid).toBe(result.pid);
						fs.writeFileSync(
							path,
							JSON.stringify({
								...metadata,
								acquired_at: new Date(aged).toISOString(),
							}),
						);
						fs.utimesSync(path, aged / 1000, aged / 1000);
					}
					const recovered = saveArtifact(input(root));
					expect(recovered.persisted).toBe(true);
					expect(recovered.request_state).toBe("committed");
					expect(saveArtifact(input(root))).toMatchObject({
						path: recovered.path,
						content_digest: recovered.content_digest,
						duplicate: true,
					});
					expect(markdownFiles(root)).toEqual([recovered.path]);
				} finally {
					removeEvolutionTestRoot(root);
				}
			});
		}
	},
);
