import { findHook, listHooks, resolveHooks } from "../services/catalog/hooks";
import { findRule, listRules, resolveRules } from "../services/catalog/rules";
import {
	findSkill,
	listSkills,
	searchSkills,
} from "../services/catalog/skills";
import { type CommandIo, DEFAULT_IO } from "./io";

function formatRule(rule: ReturnType<typeof listRules>[number]): string {
	return `${rule.id} ${rule.name} ${rule.path}`;
}

function formatHook(hook: ReturnType<typeof listHooks>[number]): string {
	return `${hook.id} ${hook.name} ${hook.path}`;
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

function contributionSummary(
	hook: ReturnType<typeof listHooks>[number],
): string[] {
	return [
		`messages: ${hook.contributions.messages.length}`,
		`tools: ${hook.contributions.tools.length}`,
		`validation_commands: ${hook.contributions.validationCommands.length}`,
		`pstr_refs: ${hook.contributions.pstrRefs.length}`,
		`memory_refs: ${hook.contributions.memoryRefs.length}`,
		`library_refs: ${hook.contributions.libraryRefs.length}`,
		`do_not_load: ${hook.contributions.doNotLoad.length}`,
	];
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

export async function runHookCommand(
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const [command = "list", ...rest] = args;
		if (command === "list" || command === "ls") {
			const hooks = listHooks(projectRoot);
			io.stdout(
				[`hooks: ${hooks.length}`, ...hooks.map(formatHook)].join("\n"),
			);
			return 0;
		}
		if (command === "show" || command === "get") {
			const identifier = rest[0];
			if (!identifier) {
				throw new Error("Missing hook id for hook show.");
			}
			const hook = findHook(projectRoot, identifier);
			if (!hook) {
				io.stderr(`Hook not found: ${identifier}`);
				return 1;
			}
			io.stdout(
				[
					`hook: ${hook.id}`,
					`name: ${hook.name}`,
					`path: ${hook.path}`,
					`enabled: ${hook.enabled ? "true" : "false"}`,
					`scope: ${hook.scope ?? "none"}`,
					`events: ${hook.events.join(",") || "none"}`,
					`roles: ${hook.roles.join(",") || "none"}`,
					`surfaces: ${hook.surfaces.join(",") || "none"}`,
					`work_types: ${hook.workTypes.join(",") || "none"}`,
					`languages: ${hook.languages.join(",") || "none"}`,
					`file_globs: ${hook.fileGlobs.join(",") || "none"}`,
					`exact_files: ${hook.exactFiles.join(",") || "none"}`,
					`priority: ${hook.priority}`,
					`message_char_count: ${hook.messageCharCount}`,
					...contributionSummary(hook),
				].join("\n"),
			);
			return 0;
		}
		if (command === "resolve") {
			const roles: string[] = [];
			const surfaces: string[] = [];
			const languages: string[] = [];
			let event = "context.bundle";
			let workType = "delivery";
			let filePath: string | undefined;
			let scope: string | undefined;
			for (let index = 0; index < rest.length; index += 1) {
				const value = rest[index];
				if (value === "--event") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error("Missing value for --event.");
					}
					event = next;
					index += 1;
					continue;
				}
				if (value === "--role" || value === "--roles") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					roles.push(...splitCsv(next));
					index += 1;
					continue;
				}
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
				if (value === "--language" || value === "--languages") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					languages.push(...splitCsv(next));
					index += 1;
					continue;
				}
				if (value === "--file") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error("Missing value for --file.");
					}
					filePath = next;
					index += 1;
					continue;
				}
				if (value === "--scope") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error("Missing value for --scope.");
					}
					scope = next;
					index += 1;
					continue;
				}
				throw new Error(`Unknown hook resolve argument: ${value}`);
			}
			const options: Parameters<typeof resolveHooks>[1] = {
				event,
				roles,
				surfaces,
				workType,
				languages,
			};
			if (filePath) {
				options.filePath = filePath;
			}
			if (scope) {
				options.scope = scope;
			}
			const hooks = resolveHooks(projectRoot, options);
			io.stdout(
				[`resolved hooks: ${hooks.length}`, ...hooks.map(formatHook)].join(
					"\n",
				),
			);
			return 0;
		}
		throw new Error(`Unknown hook command: ${command}`);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
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
					`scope: ${rule.scope ?? "none"}`,
					`required: ${rule.required ? "true" : "false"}`,
					`domains: ${rule.domains.join(",") || "none"}`,
					`surfaces: ${rule.surfaces.join(",") || "none"}`,
					`work_types: ${rule.workTypes.join(",") || "none"}`,
					`languages: ${rule.languages.join(",") || "none"}`,
					`file_globs: ${rule.fileGlobs.join(",") || "none"}`,
					`exact_files: ${rule.exactFiles.join(",") || "none"}`,
					`inject: ${rule.inject ?? "none"}`,
					`char_count: ${rule.charCount}`,
				].join("\n"),
			);
			return 0;
		}
		if (command === "resolve") {
			const domains: string[] = [];
			const surfaces: string[] = [];
			const languages: string[] = [];
			let workType = "delivery";
			let filePath: string | undefined;
			let scope: string | undefined;
			let inject: string | undefined;
			let required = false;
			for (let index = 0; index < rest.length; index += 1) {
				const value = rest[index];
				if (value === "--domain" || value === "--domains") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					domains.push(...splitCsv(next));
					index += 1;
					continue;
				}
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
				if (value === "--language" || value === "--languages") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					languages.push(...splitCsv(next));
					index += 1;
					continue;
				}
				if (value === "--file") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error("Missing value for --file.");
					}
					filePath = next;
					index += 1;
					continue;
				}
				if (value === "--scope") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error("Missing value for --scope.");
					}
					scope = next;
					index += 1;
					continue;
				}
				if (value === "--inject") {
					const next = rest[index + 1];
					if (!next) {
						throw new Error("Missing value for --inject.");
					}
					inject = next;
					index += 1;
					continue;
				}
				if (value === "--required") {
					required = true;
					continue;
				}
				throw new Error(`Unknown rule resolve argument: ${value}`);
			}
			const options: Parameters<typeof resolveRules>[1] = {
				domains,
				surfaces,
				workType,
				languages,
			};
			if (filePath) {
				options.filePath = filePath;
			}
			if (scope) {
				options.scope = scope;
			}
			if (inject) {
				options.inject = inject;
			}
			if (required) {
				options.required = true;
			}
			const rules = resolveRules(projectRoot, options);
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
