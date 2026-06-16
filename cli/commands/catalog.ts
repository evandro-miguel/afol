import { findRule, listRules, resolveRules } from "../services/catalog/rules";
import {
	findSkill,
	listSkills,
	searchSkills,
} from "../services/catalog/skills";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message: string) => console.log(message),
	stderr: (message: string) => console.error(message),
};

function formatRule(rule: ReturnType<typeof listRules>[number]): string {
	return `${rule.id} ${rule.name} ${rule.path}`;
}

function formatSkill(skill: ReturnType<typeof listSkills>[number]): string {
	const suffix = skill.description ? ` - ${skill.description}` : "";
	return `${skill.name} ${skill.path}${suffix}`;
}

function formatSkillBrief(
	skill: ReturnType<typeof listSkills>[number],
): string {
	return `${skill.name} ${skill.path}`;
}

function parseVerboseListArgs(values: string[]): boolean {
	let verbose = false;
	for (const value of values) {
		if (value === "--verbose" || value === "-v") {
			verbose = true;
			continue;
		}
		throw new Error(`Unknown skill list argument: ${value}`);
	}
	return verbose;
}

function splitCsv(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

export async function runRuleCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const [command = "list", ...rest] = args;
		if (command === "list" || command === "ls") {
			const rules = listRules(projectRoot);
			io.stdout(
				[`rules: ${rules.length}`, ...rules.map(formatRule)].join("\n"),
			);
			return 0;
		}
		if (command === "show" || command === "get") {
			const identifier = rest[0];
			if (!identifier) {
				throw new Error("Missing rule id for rule show.");
			}
			const rule = findRule(projectRoot, identifier);
			if (!rule) {
				io.stderr(`Rule not found: ${identifier}`);
				return 1;
			}
			io.stdout(
				[
					`rule: ${rule.id}`,
					`name: ${rule.name}`,
					`path: ${rule.path}`,
					`surfaces: ${rule.surfaces.join(",") || "none"}`,
					`work_types: ${rule.workTypes.join(",") || "none"}`,
				].join("\n"),
			);
			return 0;
		}
		if (command === "resolve") {
			const surfaces: string[] = [];
			let workType = "delivery";
			for (let index = 0; index < rest.length; index += 1) {
				const value = rest[index];
				if (value === "--surface" || value === "--surfaces") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					surfaces.push(...splitCsv(next));
					index += 1;
					continue;
				}
				if (value === "--work-type") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error("Missing value for --work-type.");
					}
					workType = next;
					index += 1;
					continue;
				}
				throw new Error(`Unknown rule resolve argument: ${value}`);
			}
			const rules = resolveRules(projectRoot, { surfaces, workType });
			io.stdout(
				[`resolved rules: ${rules.length}`, ...rules.map(formatRule)].join(
					"\n",
				),
			);
			return 0;
		}
		throw new Error(`Unknown rule command: ${command}`);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}

export async function runSkillCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const [command = "list", ...rest] = args;
		if (command === "list" || command === "ls") {
			const verbose = parseVerboseListArgs(rest);
			const skills = listSkills(projectRoot);
			io.stdout(
				[
					`skills: ${skills.length}${verbose ? "" : " (use skill show <name> or skill list --verbose for descriptions)"}`,
					...skills.map(verbose ? formatSkill : formatSkillBrief),
				].join("\n"),
			);
			return 0;
		}
		if (command === "show" || command === "get") {
			const identifier = rest[0];
			if (!identifier) {
				throw new Error("Missing skill name for skill show.");
			}
			const skill = findSkill(projectRoot, identifier);
			if (!skill) {
				io.stderr(`Skill not found: ${identifier}`);
				return 1;
			}
			io.stdout(
				[
					`skill: ${skill.name}`,
					`path: ${skill.path}`,
					`description: ${skill.description || "none"}`,
				].join("\n"),
			);
			return 0;
		}
		if (command === "search") {
			const query = rest.join(" ").trim();
			if (!query) {
				throw new Error("Missing query for skill search.");
			}
			const matches = searchSkills(projectRoot, query);
			io.stdout(
				[`skill matches: ${matches.length}`, ...matches.map(formatSkill)].join(
					"\n",
				),
			);
			return 0;
		}
		throw new Error(`Unknown skill command: ${command}`);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
