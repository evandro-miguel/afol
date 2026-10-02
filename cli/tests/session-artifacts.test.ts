import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
import { dirname, join } from "node:path";
import { inspectSessionArtifactLocations } from "../services/project/session-artifacts";
import { validateProjectStructure } from "../services/project/validate";

const roots: string[] = [];
function fixture(wbDir = ".afol/wb", tmpDir = ".afol/tmp") {
	const root = mkdtempSync(join(tmpdir(), "session-artifacts-"));
	roots.push(root);
	put(
		root,
		".afol/config.json",
		JSON.stringify({ paths: { wb_dir: wbDir, tmp_dir: tmpDir } }),
	);
	return root;
}
function put(root: string, path: string, content: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), content);
}
function session(
	root: string,
	id = "260926_0000_work",
	wbDir = ".afol/wb",
	closed = false,
) {
	put(
		root,
		`${wbDir}/${id}/${id}_task_01.md`,
		`---\ndoc_type: workbench_task\nid: ${id}_task_01\nsession_id: ${id}\nstatus: ${closed ? "closed" : "active"}\nupdated_at: "2026-09-26T00:00:00Z"\n${closed ? 'closed_at: "2026-09-26T00:00:00Z"\n' : ""}---\n`,
	);
	return id;
}
function artifact(id: string) {
	return `---\ndoc_type: report\nsession_id: ${id}\n---\n# Durable outcome\n`;
}
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe("bounded session artifact location checks", () => {
	test.each([
		"tmp",
		".tmp",
		".afol/tmp",
	])("rejects an explicitly associated report in %s", (directory) => {
		const root = fixture();
		const id = session(root);
		put(root, `${directory}/result.md`, artifact(id));
		const before = readFileSync(join(root, `${directory}/result.md`), "utf8");
		const check = inspectSessionArtifactLocations(root);
		expect(check.ok).toBe(false);
		expect(check.message).toContain(
			`${directory}/result.md -> .afol/wb/${id}/`,
		);
		expect(readFileSync(join(root, `${directory}/result.md`), "utf8")).toBe(
			before,
		);
	});

	test("does not force sessions or infer ownership from filenames", () => {
		const root = fixture();
		put(root, "tmp/handoff.md", "# Notes\nNo associated workbench session.\n");
		expect(inspectSessionArtifactLocations(root)).toMatchObject({ ok: true });
		expect(inspectSessionArtifactLocations(root).message).toContain(
			"unassigned/legacy",
		);
		expect(existsSync(join(root, ".afol/wb"))).toBe(false);
	});

	test.each([
		"workbench_task",
		"workbench_log",
	])("detects a misplaced managed %s document", (type) => {
		const root = fixture();
		const id = session(root);
		put(
			root,
			"tmp/work.md",
			artifact(id).replace("doc_type: report", `doc_type: ${type}`),
		);
		expect(inspectSessionArtifactLocations(root).ok).toBe(false);
	});

	test("uses explicit artifact ownership across multiple sessions, not the global pointer", () => {
		const root = fixture();
		const first = session(root, "260926_0001_first");
		const second = session(root, "260926_0002_second");
		put(root, ".afol/wb/.active_session", second);
		put(root, "tmp/handoff.md", artifact(first));
		expect(inspectSessionArtifactLocations(root).message).toContain(
			`-> .afol/wb/${first}/`,
		);
	});

	test("does not infer a session from an empty directory with a matching name", () => {
		const root = fixture();
		const id = "260926_0000_empty";
		mkdirSync(join(root, `.afol/wb/${id}`), { recursive: true });
		put(root, "tmp/report.md", artifact(id));
		const check = inspectSessionArtifactLocations(root);
		expect(check.ok).toBe(true);
		expect(check.message).toContain("unassigned/legacy");
	});

	test.each([
		"Unrelated notes without frontmatter.\n",
		"---\nstatus: active\n---\n# Legacy notes\n",
	])("does not establish session ownership from an unverified task filename: %s", (content) => {
		const root = fixture();
		const id = "260926_0000_unverified";
		put(root, `.afol/wb/${id}/${id}_task_01.md`, content);
		put(
			root,
			`.afol/wb/${id}/${id}_report_01.md`,
			"# Report\n\n## Evidence\n\n`tmp/output.log`\n",
		);
		put(root, "tmp/report.md", artifact(id));
		const check = inspectSessionArtifactLocations(root);
		expect(check.ok).toBe(true);
		expect(check.message).toContain("unassigned/legacy");
	});

	test("supports customized roots and artifacts inside a workbench beneath tmp", () => {
		const root = fixture("tmp/work", ".scratch");
		const id = session(root, "260926_0000_custom", "tmp/work");
		put(root, `tmp/work/${id}/artifacts/T-01-review.md`, artifact(id));
		expect(inspectSessionArtifactLocations(root).ok).toBe(true);
		put(root, ".scratch/wrong.md", artifact(id));
		expect(inspectSessionArtifactLocations(root).ok).toBe(false);
	});

	test("ignores disposable fixtures and ordinary source documents", () => {
		const root = fixture();
		const id = session(root);
		put(root, "tmp/fixtures/report.md", artifact(id));
		put(root, "tmp/dist/report.md", artifact(id));
		put(root, "tmp/source.md", "---\ndoc_type: spec\n---\n# Product spec\n");
		expect(inspectSessionArtifactLocations(root).ok).toBe(true);
	});

	test("does not traverse symlinks or session path escapes", () => {
		const root = fixture();
		const outside = fixture();
		const id = session(root);
		put(outside, "report.md", artifact(id));
		mkdirSync(join(root, "tmp"));
		symlinkSync(join(outside, "report.md"), join(root, "tmp/linked.md"));
		put(root, "tmp/escape.md", artifact("../../outside"));
		const check = inspectSessionArtifactLocations(root);
		expect(check.ok).toBe(true);
		expect(check.message).toContain("incomplete");
		expect(check.message).not.toContain("outside/report.md");
	});

	test("rejects configured root symlinks even when they point inside the project", () => {
		const root = fixture("work");
		mkdirSync(join(root, "real-work"));
		symlinkSync(join(root, "real-work"), join(root, "work"));
		expect(() => inspectSessionArtifactLocations(root)).toThrow("symlink");
	});

	test("bounds content and reports incomplete inspection without outputting document contents", () => {
		const root = fixture();
		const id = session(root);
		put(root, "tmp/large-report.md", artifact(id) + "x".repeat(70_000));
		const check = inspectSessionArtifactLocations(root);
		expect(check.ok).toBe(true);
		expect(check.message).toContain("incomplete");
		expect(check.message.length).toBeLessThan(300);
	});

	test("rejects a live report referencing temporary evidence without opening external files", () => {
		const root = fixture();
		const id = session(root);
		put(
			root,
			`.afol/wb/${id}/${id}_report_01.md`,
			"# Report\n\n## Evidence Locations\n\n- `/not-accessed/tmp/receipt.json`\n\n## Notes\nOther content.\n",
		);
		const check = inspectSessionArtifactLocations(root);
		expect(check.ok).toBe(false);
		expect(check.message).toContain("temporary evidence reference");
		expect(check.message).not.toContain("/not-accessed");
	});

	test("diagnoses historical evidence references without rewriting closed records", () => {
		const root = fixture();
		const id = session(root, "260926_0000_closed", ".afol/wb", true);
		put(
			root,
			`.afol/wb/${id}/${id}_report_01.md`,
			"# Report\n\n## Evidence\n\n[receipt](tmp/receipt.log)\n",
		);
		const check = inspectSessionArtifactLocations(root);
		expect(check.ok).toBe(true);
		expect(check.message).toContain("unassigned/legacy");
	});

	test("does not read symlinked lifecycle files while checking evidence references", () => {
		const root = fixture();
		const outside = fixture();
		const id = "260926_0000_linked";
		put(
			root,
			`.afol/wb/${id}/${id}_report_01.md`,
			"# Report\n\n## Evidence\n\n`tmp/receipt.log`\n",
		);
		put(outside, "task.md", "---\nstatus: active\n---\n");
		symlinkSync(
			join(outside, "task.md"),
			join(root, `.afol/wb/${id}/${id}_task_01.md`),
		);
		const check = inspectSessionArtifactLocations(root);
		expect(check.ok).toBe(true);
		expect(check.message).toContain("incomplete");
	});

	test.skipIf(process.platform === "win32")(
		"does not block while opening a FIFO in a canonical report path",
		() => {
			const root = fixture();
			const id = session(root);
			const report = join(root, `.afol/wb/${id}/${id}_report_01.md`);
			expect(spawnSync("mkfifo", [report]).status).toBe(0);
			const check = inspectSessionArtifactLocations(root);
			expect(check.ok).toBe(true);
			expect(check.message).toContain("incomplete");
		},
	);

	test("project validation keeps confirmed misplaced artifacts blocking in ordinary mode", async () => {
		const root = fixture();
		const id = session(root);
		put(root, "tmp/report.md", artifact(id));
		const result = await validateProjectStructure(root);
		expect(
			result.checks.find((check) => check.id === "session_artifact_locations")
				?.ok,
		).toBe(false);
	});
});
