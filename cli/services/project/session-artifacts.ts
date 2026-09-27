import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	opendirSync,
	openSync,
	readSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { isSchemaObject } from "../../core/schema";
import { parseTaskLifecycleState } from "../workbench/session-lifecycle-state";
import { sessionPaths } from "../workbench/session-reader";
import { resolveProjectPaths } from "./paths";
import { resolveProjectWritePath } from "./root";

const MAX_ENTRIES = 1_024;
const MAX_BYTES = 64 * 1_024;
const MAX_READS = 128;
const MAX_DEPTH = 3;
const ARTIFACT_TYPE =
	/^(?:workbench[_-])?(?:report|handoff|review|plan|task|log|research|evidence)(?:[_-].*)?$/;
const ARTIFACT_NAME =
	/(?:^|[-_.])(?:report|handoff|review|findings)(?:[-_.]|$)/i;
const EXCLUDED =
	/^(?:node_modules|\.git|\.codex|\.claude|fixtures?|caches?|dist|build|vendor|credentials?|secrets?)$/i;

type Inspection = { ok: boolean; message: string };

function readMetadata(content: string) {
	const header = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
	const metadata: unknown = header ? Bun.YAML.parse(header) : undefined;
	return isSchemaObject(metadata) ? metadata : undefined;
}

function verifiedTaskState(content: string, path: string, session: string) {
	const metadata = readMetadata(content);
	if (
		!metadata ||
		(metadata.doc_type !== "workbench_task" && metadata.doc_type !== "task") ||
		metadata.id !== `${session}_task_01` ||
		metadata.session_id !== session
	)
		return undefined;
	return parseTaskLifecycleState(content, path, session).kind;
}

/** Bounded diagnostics, not a filesystem sandbox for external agent writes. */
export function inspectSessionArtifactLocations(root: string): Inspection {
	const paths = resolveProjectPaths(root);
	const pending = [...new Set([paths.tmpDir, ".tmp", "tmp"])].map((path) => ({
		path,
		depth: 0,
	}));
	const seen = new Set<string>();
	const failures: string[] = [];
	let candidates = 0;
	let entries = 0;
	let reads = 0;
	let incomplete = false;

	function readText(path: string): string | undefined {
		if (reads >= MAX_READS) {
			incomplete = true;
			return;
		}
		reads++;
		const resolved = resolveProjectWritePath(root, path);
		if (!resolved.ok) {
			incomplete = true;
			return;
		}
		let fd: number | undefined;
		try {
			fd = openSync(
				resolved.value.path,
				constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			);
			const stat = fstatSync(fd);
			if (!stat.isFile() || stat.size > MAX_BYTES) {
				incomplete = true;
				return;
			}
			const buffer = Buffer.alloc(MAX_BYTES + 1);
			const size = readSync(fd, buffer, 0, buffer.length, 0);
			if (size > MAX_BYTES) {
				incomplete = true;
				return;
			}
			return buffer.toString("utf8", 0, size);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") incomplete = true;
			return;
		} finally {
			if (fd !== undefined) closeSync(fd);
		}
	}

	function inspectFile(path: string, candidateName: boolean): void {
		const content = readText(path);
		if (content === undefined) return;
		try {
			const metadata = readMetadata(content);
			if (!metadata) {
				if (candidateName) candidates++;
				return;
			}
			const type = metadata.doc_type;
			const session = metadata.session_id;
			if (typeof type !== "string" || !ARTIFACT_TYPE.test(type)) return;
			if (typeof session !== "string" || !session.trim()) {
				candidates++;
				return;
			}
			const owner = sessionPaths(root, session);
			const target = owner.sessionDir;
			const safeTarget = resolveProjectWritePath(root, relative(root, target));
			if (!safeTarget.ok || !lstatSync(target).isDirectory()) {
				candidates++;
				return;
			}
			const taskContent = readText(relative(root, owner.taskPath));
			if (taskContent === undefined) {
				candidates++;
				return;
			}
			if (!verifiedTaskState(taskContent, owner.taskPath, session)) {
				candidates++;
				return;
			}
			const fromTarget = relative(target, resolve(root, path));
			if (!fromTarget.startsWith("..") && !isAbsolute(fromTarget)) return;
			// The metadata ties this work artifact to a real session. A filename alone cannot.
			failures.push(`${path} -> ${relative(root, target)}/`);
		} catch {
			// Malformed metadata, disappearing files and invalid session identifiers
			// cannot establish ownership, and must not trigger destructive guesses.
			candidates++;
		}
	}

	// Inspect only bounded canonical reports and their explicit evidence sections.
	// Historical references remain warnings; a live report must retain its evidence.
	try {
		const directory = opendirSync(paths.abs.wbDir);
		const sessions: string[] = [];
		let workbenchEntries = 0;
		try {
			while (workbenchEntries < MAX_ENTRIES) {
				const entry = directory.readSync();
				if (!entry) break;
				workbenchEntries++;
				if (entry.isDirectory() && /^[\w][\w.-]{0,127}$/.test(entry.name))
					sessions.push(entry.name);
			}
		} finally {
			directory.closeSync();
		}
		if (sessions.length > 32 || workbenchEntries >= MAX_ENTRIES)
			incomplete = true;
		for (const session of sessions.sort().reverse().slice(0, 32)) {
			const reportPath = join(paths.wbDir, session, `${session}_report_01.md`);
			const content = readText(reportPath);
			if (!content) continue;
			const evidence = content.match(
				/^## Evidence(?: Locations)?\s*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m,
			)?.[1];
			if (!evidence) continue;
			for (const match of evidence.matchAll(
				/`([^`\r\n]+)`|\]\(([^)\r\n]+)\)/g,
			)) {
				const ref = match[1] ?? match[2] ?? "";
				const normalized = ref.replaceAll("\\", "/");
				const temporary = isAbsolute(ref)
					? /\/(?:tmp|\.tmp)\//.test(normalized) ||
						[paths.tmpDir, ".tmp", "tmp"].some((dir) =>
							normalized.startsWith(
								`${resolve(root, dir).replaceAll("\\", "/")}/`,
							),
						)
					: [paths.tmpDir, ".tmp", "tmp"].some((dir) =>
							normalized.startsWith(`${dir}/`),
						);
				if (!temporary) continue;
				// A customized session root may itself live beneath a temporary ancestor.
				const fromSession = relative(
					join(paths.abs.wbDir, session),
					resolve(root, ref),
				);
				if (!fromSession.startsWith("..") && !isAbsolute(fromSession)) continue;
				try {
					const taskPath = join(paths.wbDir, session, `${session}_task_01.md`);
					const taskContent = readText(taskPath);
					if (
						taskContent === undefined ||
						verifiedTaskState(taskContent, taskPath, session) !== "open"
					)
						candidates++;
					else
						failures.push(
							`${reportPath}: temporary evidence reference -> ${join(paths.wbDir, session)}/`,
						);
				} catch {
					candidates++;
				}
			}
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") incomplete = true;
	}

	while (pending.length && entries < MAX_ENTRIES) {
		const current = pending.shift();
		if (!current || seen.has(current.path)) continue;
		seen.add(current.path);
		const safe = resolveProjectWritePath(root, current.path);
		if (!safe.ok) {
			incomplete = true;
			continue;
		}
		try {
			const directory = opendirSync(safe.value.path);
			try {
				while (entries < MAX_ENTRIES) {
					const entry = directory.readSync();
					if (!entry) break;
					entries++;
					if (EXCLUDED.test(entry.name)) continue;
					const path = join(current.path, entry.name);
					if (entry.isSymbolicLink()) {
						incomplete = true;
					} else if (entry.isDirectory()) {
						if (current.depth < MAX_DEPTH) {
							pending.push({ path, depth: current.depth + 1 });
						} else incomplete = true;
					} else if (entry.isFile() && entry.name.endsWith(".md")) {
						inspectFile(path, ARTIFACT_NAME.test(entry.name));
					}
				}
			} finally {
				directory.closeSync();
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") incomplete = true;
		}
	}
	incomplete ||= entries >= MAX_ENTRIES || pending.length > 0;
	const notes = [
		...(candidates
			? [
					`${candidates} unassigned/legacy candidate(s); inspect before migration`,
				]
			: []),
		...(incomplete
			? ["bounded scan incomplete; no exhaustive cleanliness claim"]
			: []),
	];
	if (failures.length) {
		return {
			ok: false,
			message: `${failures.length} session artifact(s) in temporary storage: ${failures.slice(0, 5).join("; ")}${failures.length > 5 ? "; more omitted" : ""}${notes.length ? `; ${notes.join("; ")}` : ""}`,
		};
	}
	return {
		ok: true,
		message: notes.length
			? `warning: ${notes.join("; ")}`
			: "no confirmed session artifacts in inspected temporary roots",
	};
}
