import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
				: dirName,
		path: `${projectPaths.skillsDir}/${dirName}/SKILL.md`,
		description:
			typeof metadata.description === "string" && metadata.description.trim()
				? metadata.description.trim().replace(/\s+/g, " ")
				: "",
	};
}

export function listSkills(projectRoot: string): SkillEntry[] {
	const projectPaths = resolveProjectPaths(projectRoot);
	const skillsRoot = projectPaths.abs.skillsDir;
	if (!existsSync(skillsRoot)) {
		return [];
	}
	return readdirSync(skillsRoot)
		.filter((name) => {
			const path = join(skillsRoot, name);
			return statSync(path).isDirectory();
		})
		.map((name) => skillFromDir(projectPaths, name))
		.filter((entry): entry is SkillEntry => entry !== null)
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function findSkill(
	projectRoot: string,
	identifier: string,
): SkillEntry | null {
	const needle = identifier.trim().toLowerCase();
	if (!needle) {
		return null;
	}
	return (
		listSkills(projectRoot).find(
			(skill) => skill.name.toLowerCase() === needle,
		) ?? null
	);
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
