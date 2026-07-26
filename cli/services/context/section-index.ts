import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { computeSourceHash } from "../../core/source-hash";
import { atomicWriteText } from "../io/atomic";
import { resolveProjectPaths } from "../project/paths";
import type {
	SectionEntry,
	SectionIndex,
	SectionSourceManifestEntry,
} from "./types";

type Frontmatter = Record<string, unknown>;

type Heading = {
	title: string;
	level: number;
	line_start: number;
};

type DocMeta = {
	ref: string;
	path: string;
};

type CanonicalDoc = {
	filePath: string;
	kind: "spec" | "decision";
};

type CanonicalSource = CanonicalDoc & {
	content: string;
	meta: Frontmatter;
	sourcePath: string;
	contentSha256: string;
};

export type SectionIndexCacheStatus =
	| "current"
	| "missing"
	| "stale"
	| "incomplete"
	| "foreign"
	| "corrupt";

export type SectionIndexCacheInspection = {
	status: SectionIndexCacheStatus;
	detail: string;
	index: SectionIndex | null;
	verified_sources: ReadonlyMap<string, string>;
};

export class SectionIndexTrustError extends Error {
	readonly code = "CTX_TRUST_ERROR";
	readonly remediation = "afol ctx build";
	readonly status: Exclude<SectionIndexCacheStatus, "current">;
	readonly detail: string;

	constructor(
		status: Exclude<SectionIndexCacheStatus, "current">,
		detail: string,
	) {
		super(
			`Section index is not trusted (${status}: ${detail}). Run afol ctx build.`,
		);
		this.name = "SectionIndexTrustError";
		this.status = status;
		this.detail = detail;
	}
}

const INDEX_FILE = "sections.json";
const INDEXABLE_SPEC_TYPES = new Set(["spec", "spec-child", "spec-test"]);
const INDEXABLE_DECISION_TYPES = new Set(["adr", "decision"]);
let fullBuildInvocationCount = 0;
let cacheInspectionCount = 0;
let afterInspectionHook: (() => void) | null = null;

export const sectionIndexTestSeam = {
	reset(): void {
		fullBuildInvocationCount = 0;
		cacheInspectionCount = 0;
		afterInspectionHook = null;
	},
	fullBuildInvocations(): number {
		return fullBuildInvocationCount;
	},
	inspectionInvocations(): number {
		return cacheInspectionCount;
	},
	replaceAfterInspection(callback: () => void): void {
		afterInspectionHook = callback;
	},
};

function now(): string {
	return new Date().toISOString();
}

function indexPath(root: string): string {
	return join(resolveProjectPaths(root).abs.dataIndexDir, INDEX_FILE);
}

function readJsonFile(path: string): unknown | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch {
		return null;
	}
}

type FrontmatterResult =
	| { kind: "absent" }
	| { kind: "parsed"; meta: Frontmatter }
	| { kind: "malformed"; detail: string };

function frontmatter(content: string): FrontmatterResult {
	const normalized = content.replace(/\r\n/g, "\n");
	if (!/^---(?:\n|$)/.test(normalized)) {
		return { kind: "absent" };
	}
	const match = /^---\n([\s\S]*?)^---(?:\n|$)/m.exec(normalized);
	if (!match) {
		return { kind: "malformed", detail: "unterminated YAML block" };
	}
	try {
		const parsed = Bun.YAML.parse(match[1] ?? "");
		if (parsed === null) {
			return { kind: "parsed", meta: {} };
		}
		if (typeof parsed !== "object" || Array.isArray(parsed)) {
			return {
				kind: "malformed",
				detail: "frontmatter must be a YAML mapping",
			};
		}
		return { kind: "parsed", meta: parsed as Frontmatter };
	} catch (error) {
		return {
			kind: "malformed",
			detail: (error as Error).message || "invalid YAML",
		};
	}
}

function toPosixPath(value: string): string {
	return value.replace(/\\/g, "/");
}

function compareCodePoints(left: string, right: string): number {
	const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
	const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
	const length = Math.min(leftPoints.length, rightPoints.length);
	for (let index = 0; index < length; index += 1) {
		const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
		if (difference !== 0) {
			return difference < 0 ? -1 : 1;
		}
	}
	return leftPoints.length - rightPoints.length;
}

function compareStableText(left: string, right: string): number {
	const rawLeft = toPosixPath(left);
	const rawRight = toPosixPath(right);
	const normalizedComparison = compareCodePoints(
		rawLeft.normalize("NFC"),
		rawRight.normalize("NFC"),
	);
	return normalizedComparison || compareCodePoints(rawLeft, rawRight);
}

function projectRelativeSourcePath(root: string, filePath: string): string {
	const sourcePath = toPosixPath(relative(root, filePath));
	if (
		!sourcePath ||
		sourcePath.startsWith("/") ||
		sourcePath.split("/").some((segment) => segment === "..")
	) {
		throw new Error(`unsafe canonical source path: ${sourcePath || "<empty>"}`);
	}
	return sourcePath;
}

function normalizeRefPart(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function fallbackDocumentId(admDir: string, filePath: string): string {
	const relPath = projectRelativeSourcePath(admDir, filePath);
	const pathWithoutExtension = relPath.slice(
		0,
		Math.max(0, relPath.length - extname(relPath).length),
	);
	const basename = pathWithoutExtension.split("/").at(-1) ?? "";
	if (normalizeRefPart(basename)) {
		return normalizeRefPart(pathWithoutExtension);
	}
	return `doc-${computeSourceHash(pathWithoutExtension).hash.slice(0, 12)}`;
}

function docMetaForPath(admDir: string, source: CanonicalSource): DocMeta {
	const fallbackId = fallbackDocumentId(admDir, source.filePath);
	const configuredId =
		typeof source.meta.id === "string" ? normalizeRefPart(source.meta.id) : "";
	const id = configuredId || fallbackId;
	if (source.kind === "spec") {
		const feature =
			typeof source.meta.roadmap_feature === "string"
				? normalizeRefPart(source.meta.roadmap_feature)
				: "";
		return {
			ref: `spec:${feature || id}/${id}`,
			path: source.sourcePath,
		};
	}
	return { ref: `adr:${id}`, path: source.sourcePath };
}

function slugify(title: string): string {
	return title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function headingIdentity(title: string): string {
	return (
		slugify(title) ||
		`heading-${computeSourceHash(title.normalize("NFC")).hash.slice(0, 12)}`
	);
}

function collectMarkdownFiles(dir: string): string[] {
	if (!existsSync(dir)) {
		return [];
	}
	const files: string[] = [];
	const stack = [dir];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		for (const entry of readdirSync(current, { withFileTypes: true }).sort(
			(left, right) => compareStableText(right.name, left.name),
		)) {
			const entryPath = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}
			if (
				entry.isFile() &&
				entry.name.endsWith(".md") &&
				entry.name !== "INDEX.md" &&
				entry.name !== "README.md"
			) {
				files.push(entryPath);
			}
		}
	}
	return files;
}

function isIndexableDoc(doc: CanonicalDoc, meta: Frontmatter): boolean {
	const docType =
		typeof meta.doc_type === "string" ? meta.doc_type.trim().toLowerCase() : "";
	return doc.kind === "spec"
		? INDEXABLE_SPEC_TYPES.has(docType)
		: INDEXABLE_DECISION_TYPES.has(docType);
}

function collectDocs(root: string): CanonicalDoc[] {
	const admDir = resolveProjectPaths(root).abs.admDir;
	return [
		...collectMarkdownFiles(join(admDir, "specs")).map(
			(filePath): CanonicalDoc => ({ filePath, kind: "spec" }),
		),
		...collectMarkdownFiles(join(admDir, "decisions")).map(
			(filePath): CanonicalDoc => ({ filePath, kind: "decision" }),
		),
	].sort((left, right) =>
		compareStableText(
			projectRelativeSourcePath(root, left.filePath),
			projectRelativeSourcePath(root, right.filePath),
		),
	);
}

function collectCanonicalSources(root: string): CanonicalSource[] {
	return collectDocs(root).flatMap((doc) => {
		const content = readFileSync(doc.filePath, "utf8");
		const parsedFrontmatter = frontmatter(content);
		const sourcePath = projectRelativeSourcePath(root, doc.filePath);
		if (parsedFrontmatter.kind === "malformed") {
			throw new Error(
				`malformed canonical frontmatter: ${sourcePath} (${parsedFrontmatter.detail})`,
			);
		}
		if (parsedFrontmatter.kind === "absent") {
			return [];
		}
		if (!isIndexableDoc(doc, parsedFrontmatter.meta)) {
			return [];
		}
		return [
			{
				...doc,
				content,
				meta: parsedFrontmatter.meta,
				sourcePath,
				contentSha256: computeSourceHash(content).hash,
			},
		];
	});
}

function parseHeadings(content: string): Heading[] {
	const headings: Heading[] = [];
	const lines = content.split(/\r?\n/);
	let insideCodeBlock = false;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (line.trim().startsWith("```")) {
			insideCodeBlock = !insideCodeBlock;
			continue;
		}
		if (insideCodeBlock) {
			continue;
		}
		const match = /^(##|###)\s+(.*?)\s*$/.exec(line.trim());
		if (!match?.[1] || !match[2]) {
			continue;
		}
		const title = match[2].replace(/#+\s*$/, "").trim();
		if (!title) {
			continue;
		}
		headings.push({
			title,
			level: match[1].length,
			line_start: index + 1,
		});
	}
	return headings;
}

function sectionsForDoc(
	admDir: string,
	source: CanonicalSource,
): SectionEntry[] {
	const meta = docMetaForPath(admDir, source);
	const headings = parseHeadings(source.content);
	const lines = source.content.split(/\r?\n/);
	const slugOccurrences = new Map<string, number>();

	return headings.map((heading, index) => {
		let lineEnd = lines.length;
		for (let next = index + 1; next < headings.length; next += 1) {
			const nextHeading = headings[next];
			if (!nextHeading) {
				continue;
			}
			if (nextHeading.level <= heading.level) {
				lineEnd = Math.max(heading.line_start, nextHeading.line_start - 1);
				break;
			}
		}
		const slug = headingIdentity(heading.title);
		const occurrence = (slugOccurrences.get(slug) ?? 0) + 1;
		slugOccurrences.set(slug, occurrence);
		const anchor = occurrence === 1 ? slug : `${slug}-${occurrence}`;
		return {
			ref: `${meta.ref}#${anchor}`,
			title: heading.title,
			level: heading.level,
			line_start: heading.line_start,
			line_end: lineEnd,
			source_path: meta.path,
		};
	});
}

function isSafePersistedSourcePath(value: string): boolean {
	return (
		value.trim().length > 0 &&
		value === toPosixPath(value) &&
		!value.startsWith("/") &&
		!value
			.split("/")
			.some((segment) => !segment || segment === "." || segment === "..")
	);
}

function isSectionEntry(value: unknown): value is SectionEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const entry = value as Partial<SectionEntry>;
	return (
		typeof entry.ref === "string" &&
		entry.ref.trim().length > 0 &&
		typeof entry.title === "string" &&
		entry.title.trim().length > 0 &&
		(entry.level === 2 || entry.level === 3) &&
		Number.isInteger(entry.line_start) &&
		(entry.line_start ?? 0) > 0 &&
		Number.isInteger(entry.line_end) &&
		(entry.line_end ?? 0) >= (entry.line_start ?? 1) &&
		typeof entry.source_path === "string" &&
		isSafePersistedSourcePath(entry.source_path)
	);
}

function isManifestEntry(value: unknown): value is SectionSourceManifestEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const entry = value as Partial<SectionSourceManifestEntry>;
	return (
		typeof entry.source_path === "string" &&
		isSafePersistedSourcePath(entry.source_path) &&
		typeof entry.content_sha256 === "string" &&
		/^[a-f0-9]{64}$/.test(entry.content_sha256) &&
		Number.isInteger(entry.section_count) &&
		(entry.section_count ?? -1) >= 0
	);
}

function sectionPayloadDigest(sections: SectionEntry[]): string {
	const canonicalRows = sections.map((section) => [
		section.ref,
		section.title,
		section.level,
		section.line_start,
		section.line_end,
		section.source_path,
	]);
	return computeSourceHash(JSON.stringify(canonicalRows)).hash;
}

function validateStoredIndexShape(
	value: unknown,
): { ok: true; index: SectionIndex } | { ok: false; detail: string } {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { ok: false, detail: "invalid JSON object" };
	}
	const candidate = value as Record<string, unknown>;
	if (candidate.kind === "sections_index_v1" || candidate.version === 1) {
		return { ok: false, detail: "unsupported v1; rebuild required" };
	}
	if (candidate.kind !== "sections_index_v2" || candidate.version !== 2) {
		return { ok: false, detail: "unsupported section index schema" };
	}
	if (
		typeof candidate.generated_at !== "string" ||
		!Number.isFinite(Date.parse(candidate.generated_at))
	) {
		return { ok: false, detail: "invalid generated_at" };
	}
	if (
		!candidate.manifest ||
		typeof candidate.manifest !== "object" ||
		Array.isArray(candidate.manifest)
	) {
		return { ok: false, detail: "missing source manifest" };
	}
	const manifest = candidate.manifest as Record<string, unknown>;
	if (typeof manifest.sections_sha256 !== "string") {
		return { ok: false, detail: "missing section payload digest" };
	}
	if (
		manifest.algorithm !== "sha256" ||
		!Number.isInteger(manifest.source_count) ||
		(manifest.source_count as number) < 0 ||
		!Number.isInteger(manifest.section_count) ||
		(manifest.section_count as number) < 0 ||
		!/^[a-f0-9]{64}$/.test(manifest.sections_sha256) ||
		!Array.isArray(manifest.sources) ||
		!manifest.sources.every(isManifestEntry)
	) {
		return { ok: false, detail: "invalid source manifest" };
	}
	if (
		!Array.isArray(candidate.sections) ||
		!candidate.sections.every(isSectionEntry)
	) {
		return { ok: false, detail: "invalid section entries" };
	}
	return { ok: true, index: candidate as unknown as SectionIndex };
}

export function buildSectionIndexSnapshot(root: string): SectionIndex {
	fullBuildInvocationCount += 1;
	const admDir = resolveProjectPaths(root).abs.admDir;
	const sources = collectCanonicalSources(root);
	const manifestSources: SectionSourceManifestEntry[] = [];
	const sections = sources.flatMap((source) => {
		const sourceSections = sectionsForDoc(admDir, source);
		if (sourceSections.length === 0) {
			throw new Error(
				`Indexable canonical document has no indexable sections: ${source.sourcePath}`,
			);
		}
		manifestSources.push({
			source_path: source.sourcePath,
			content_sha256: source.contentSha256,
			section_count: sourceSections.length,
		});
		return sourceSections;
	});
	sections.sort(
		(a, b) =>
			compareStableText(a.source_path, b.source_path) ||
			a.line_start - b.line_start,
	);
	const lookupRefs = new Set<string>();
	for (const section of sections) {
		const lookupRef = section.ref.toLowerCase();
		if (lookupRefs.has(lookupRef)) {
			throw new Error(`Duplicate canonical section ref: ${section.ref}`);
		}
		lookupRefs.add(lookupRef);
	}
	return {
		kind: "sections_index_v2",
		version: 2,
		generated_at: now(),
		manifest: {
			algorithm: "sha256",
			source_count: manifestSources.length,
			section_count: sections.length,
			sections_sha256: sectionPayloadDigest(sections),
			sources: manifestSources,
		},
		sections,
	};
}

function writeIndex(root: string, snapshot: SectionIndex): SectionIndex {
	mkdirSync(resolveProjectPaths(root).abs.dataIndexDir, { recursive: true });
	atomicWriteText(indexPath(root), `${JSON.stringify(snapshot)}\n`);
	return snapshot;
}

export function rebuildSectionIndex(root: string): SectionIndex {
	return writeIndex(root, buildSectionIndexSnapshot(root));
}

function inspection(
	status: SectionIndexCacheStatus,
	detail: string,
	index: SectionIndex | null = null,
	verifiedSources: ReadonlyMap<string, string> = new Map(),
): SectionIndexCacheInspection {
	return {
		status,
		detail,
		index,
		verified_sources: verifiedSources,
	};
}

export function inspectSectionIndexCache(
	root: string,
): SectionIndexCacheInspection {
	cacheInspectionCount += 1;
	const path = indexPath(root);
	if (!existsSync(path)) {
		return inspection("missing", "index file does not exist");
	}
	const parsed = readJsonFile(path);
	if (parsed === null) {
		return inspection("corrupt", "invalid JSON");
	}
	const shape = validateStoredIndexShape(parsed);
	if (!shape.ok) {
		return inspection("corrupt", shape.detail);
	}
	const index = shape.index;
	const manifest = index.manifest;
	const sourcePaths = manifest.sources.map((source) => source.source_path);
	if (
		manifest.source_count !== manifest.sources.length ||
		new Set(sourcePaths).size !== sourcePaths.length
	) {
		return inspection(
			"corrupt",
			"manifest source_count or uniqueness mismatch",
		);
	}
	const lookupRefs = index.sections.map((section) => section.ref.toLowerCase());
	if (new Set(lookupRefs).size !== lookupRefs.length) {
		return inspection("corrupt", "duplicate section refs");
	}
	if (manifest.sections_sha256 !== sectionPayloadDigest(index.sections)) {
		return inspection("corrupt", "section payload digest mismatch");
	}

	let currentSources: CanonicalSource[];
	try {
		currentSources = collectCanonicalSources(root);
	} catch (error) {
		return inspection(
			"corrupt",
			`cannot read canonical sources: ${(error as Error).message}`,
		);
	}
	const currentByPath = new Map(
		currentSources.map((source) => [source.sourcePath, source] as const),
	);
	const manifestByPath = new Map(
		manifest.sources.map((source) => [source.source_path, source] as const),
	);

	const foreignManifestSource = manifest.sources.find(
		(source) => !currentByPath.has(source.source_path),
	);
	if (foreignManifestSource !== undefined) {
		return inspection(
			"foreign",
			`non-canonical source: ${foreignManifestSource.source_path}`,
		);
	}
	const foreignSection = index.sections.find(
		(section) => !currentByPath.has(section.source_path),
	);
	if (foreignSection !== undefined) {
		return inspection(
			"foreign",
			`non-canonical source: ${foreignSection.source_path}`,
		);
	}

	const missingSource = currentSources.find(
		(source) => !manifestByPath.has(source.sourcePath),
	);
	if (missingSource) {
		return inspection(
			"incomplete",
			`missing canonical source: ${missingSource.sourcePath}`,
		);
	}

	const staleSource = currentSources.find(
		(source) =>
			manifestByPath.get(source.sourcePath)?.content_sha256 !==
			source.contentSha256,
	);
	if (staleSource) {
		return inspection(
			"stale",
			`content hash changed: ${staleSource.sourcePath}`,
		);
	}

	if (
		manifest.section_count !== index.sections.length ||
		manifest.sources.reduce(
			(total, source) => total + source.section_count,
			0,
		) !== index.sections.length
	) {
		return inspection("incomplete", "manifest section_count mismatch");
	}
	for (const source of manifest.sources) {
		const actualCount = index.sections.filter(
			(section) => section.source_path === source.source_path,
		).length;
		if (source.section_count === 0) {
			return inspection(
				"incomplete",
				`no indexable sections: ${source.source_path}`,
			);
		}
		if (source.section_count !== actualCount) {
			return inspection(
				"incomplete",
				`section coverage mismatch: ${source.source_path}`,
			);
		}
	}
	return inspection(
		"current",
		"source manifest and section coverage current",
		index,
		new Map(
			currentSources.map(
				(source) => [source.sourcePath, source.content] as const,
			),
		),
	);
}

export function getSectionIndex(root: string): SectionIndex | null {
	const inspected = inspectSectionIndexCache(root);
	return inspected.status === "current" ? inspected.index : null;
}

export function requireSectionIndexCache(root: string): {
	index: SectionIndex;
	verified_sources: ReadonlyMap<string, string>;
} {
	const inspected = inspectSectionIndexCache(root);
	const hook = afterInspectionHook;
	afterInspectionHook = null;
	hook?.();
	if (inspected.status === "current") {
		if (inspected.index) {
			return {
				index: inspected.index,
				verified_sources: inspected.verified_sources,
			};
		}
		throw new SectionIndexTrustError(
			"corrupt",
			"current inspection did not return an index payload",
		);
	}
	throw new SectionIndexTrustError(inspected.status, inspected.detail);
}

export function requireSectionIndex(root: string): SectionIndex {
	return requireSectionIndexCache(root).index;
}

export function resolveSection(root: string, ref: string): SectionEntry | null {
	const needle = ref.trim().toLowerCase();
	if (!needle) {
		return null;
	}
	const index = requireSectionIndex(root);
	const exact = index.sections.find(
		(entry) => entry.ref.toLowerCase() === needle,
	);
	if (exact) {
		return exact;
	}

	const legacySpec = /^spec:([^/#]+)#(.+)$/.exec(needle);
	const candidates = legacySpec
		? index.sections.filter((entry) => {
				const candidate = entry.ref.toLowerCase();
				return (
					candidate.startsWith(`spec:${legacySpec[1]}/`) &&
					candidate.endsWith(`#${legacySpec[2]}`)
				);
			})
		: index.sections.filter((entry) => {
				const candidate = entry.ref.toLowerCase();
				if (needle.startsWith("spec:") && !needle.includes("/")) {
					return candidate.startsWith(`${needle}/`);
				}
				return candidate.startsWith(`${needle}#`);
			});
	return candidates.length === 1 ? (candidates[0] ?? null) : null;
}
