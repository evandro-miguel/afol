import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
	type ResolvedProjectPaths,
	resolveProjectPaths,
} from "../project/paths";

export type SkillEntry = {
	name: string;
	path: string;
	description: string;
};

function frontmatterBlock(content: string): Record<string, unknown> {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!match?.[1]) {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(match[1]);
	} catch {
		return {};
	}
	return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
		? (parsed as Record<string, unknown>)
		: {};
}

function skillFromDir(
	projectPaths: ResolvedProjectPaths,
	dirName: string,
): SkillEntry | null {
	const skillFile = join(projectPaths.abs.skillsDir, dirName, "SKILL.md");
	if (!existsSync(skillFile)) {
		return null;
	}
	const content = readFileSync(skillFile, "utf8");
	const metadata = frontmatterBlock(content);
	return {
		name:
			typeof metadata.name === "string" && metadata.name.trim()
				? metadata.name.trim()
				: dirName.split(/[\\/]/).pop() || dirName,
		path: `${projectPaths.skillsDir}/${dirName}/SKILL.md`,
		description:
			typeof metadata.description === "string" && metadata.description.trim()
				? metadata.description.trim().replace(/\s+/g, " ")
				: "",
	};
}

function safeSkillDirEntries(dir: string) {
	try {
		return readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

function listSkillDirs(skillsRoot: string, dir: string = skillsRoot): string[] {
	const entries = safeSkillDirEntries(dir);
	return entries
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => {
			const child = join(dir, entry.name);
			if (existsSync(join(child, "SKILL.md"))) {
				return [relative(skillsRoot, child).replaceAll("\\", "/")];
			}
			return listSkillDirs(skillsRoot, child);
		});
}

export function listSkills(projectRoot: string): SkillEntry[] {
	const projectPaths = resolveProjectPaths(projectRoot);
	const skillsRoot = projectPaths.abs.skillsDir;
	if (!existsSync(skillsRoot)) {
		return [];
	}
	return listSkillDirs(skillsRoot)
		.map((dirName) => skillFromDir(projectPaths, dirName))
		.filter((entry): entry is SkillEntry => entry !== null)
		.sort(
			(a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path),
		);
}

export function findSkill(
	projectRoot: string,
	identifier: string,
): SkillEntry | null {
	const needle = identifier.trim().toLowerCase();
	if (!needle) {
		return null;
	}
	const matches = listSkills(projectRoot).filter(
		(skill) => skill.name.toLowerCase() === needle,
	);
	if (matches.length > 1) {
		throw new Error(
			`Ambiguous skill name: ${identifier}. Matches: ${matches.map((skill) => skill.path).join(", ")}`,
		);
	}
	return matches[0] ?? null;
}

export function searchSkills(projectRoot: string, query: string): SkillEntry[] {
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return [];
	}
	return listSkills(projectRoot).filter((skill) =>
		[skill.name, skill.description, skill.path].some((value) =>
			value.toLowerCase().includes(needle),
		),
	);
}
