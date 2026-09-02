import {
	envelopeErr,
	envelopeOk,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { findHook, listHooks, resolveHooks } from "../services/catalog/hooks";
import {
	findRule,
	listRules,
	resolveRulesWithDiagnostics,
} from "../services/catalog/rules";
import {
	findSkill,
	listSkills,
	searchSkills,
} from "../services/catalog/skills";
import { type CommandIo, DEFAULT_IO } from "./io";

function formatRule(rule: ReturnType<typeof listRules>[number]): string {
	return `${rule.id} ${rule.name} ${rule.path}`;
}

function optionalMetadataLine(
	label: string,
	values: readonly string[],
): string[] {
	return values.length > 0 ? [`${label}: ${values.join(",")}`] : [];
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

function parseJson(values: string[]): { json: boolean; args: string[] } {
	let json = false;
	const args = values.filter((value) => {
		if (value === "--json" || value === "-j") {
			json = true;
			return false;
		}
		return true;
	});
	return { json, args };
}

function writeJson<T>(
	io: CommandIo,
	_action: string,
	result: ResultEnvelope<T>,
): void {
	io.stdout(stringifyEnvelope(result));
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
		const { json, args: options } = parseJson(rest);
		if (command === "list" || command === "ls") {
			const hooks = listHooks(projectRoot);
			if (json) {
				writeJson(
					io,
					"hook.list",
					envelopeOk(
						{
							count: hooks.length,
							hooks: hooks.map((entry) => ({
								id: entry.id,
								name: entry.name,
								path: entry.path,
							})),
						},
						{ action: "hook.list" },
					),
				);
				return 0;
			}
			io.stdout(
				[`hooks: ${hooks.length}`, ...hooks.map(formatHook)].join("\n"),
			);
			return 0;
		}
		if (command === "show" || command === "get") {
			const identifier = options[0];
			if (!identifier) {
				throw new Error("Missing hook id for hook show.");
			}
			const hook = findHook(projectRoot, identifier);
			if (!hook) {
				if (json) {
					writeJson(
						io,
						"hook.show",
						envelopeErr("hook-not-found", `Hook not found: ${identifier}`, {
							action: "hook.show",
							exitCode: 1,
						}),
					);
					return 1;
				}
				io.stderr(`Hook not found: ${identifier}`);
				return 1;
			}
			if (json) {
				writeJson(
					io,
					"hook.show",
					envelopeOk(
						{
							hook: {
								id: hook.id,
								name: hook.name,
								path: hook.path,
								enabled: hook.enabled,
								scope: hook.scope,
								events: hook.events,
								roles: hook.roles,
								surfaces: hook.surfaces,
								work_types: hook.workTypes,
								languages: hook.languages,
								file_globs: hook.fileGlobs,
								exact_files: hook.exactFiles,
								priority: hook.priority,
							},
						},
						{ action: "hook.show" },
					),
				);
				return 0;
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
			const { json: jsonFlag, args: resolveArgs } = parseJson(options);
			const wantsJson = json || jsonFlag;
			const roles: string[] = [];
			const surfaces: string[] = [];
			const languages: string[] = [];
			let event = "context.bundle";
			let workType = "delivery";
			let filePath: string | undefined;
			let scope: string | undefined;
			for (let index = 0; index < resolveArgs.length; index += 1) {
				const value = resolveArgs[index];
				if (value === "--event") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error("Missing value for --event.");
					}
					event = next;
					index += 1;
					continue;
				}
				if (value === "--role" || value === "--roles") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					roles.push(...splitCsv(next));
					index += 1;
					continue;
				}
				if (value === "--surface" || value === "--surfaces") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					surfaces.push(...splitCsv(next));
					index += 1;
					continue;
				}
				if (value === "--work-type") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error("Missing value for --work-type.");
					}
					workType = next;
					index += 1;
					continue;
				}
				if (value === "--language" || value === "--languages") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					languages.push(...splitCsv(next));
					index += 1;
					continue;
				}
				if (value === "--file") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error("Missing value for --file.");
					}
					filePath = next;
					index += 1;
					continue;
				}
				if (value === "--scope") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error("Missing value for --scope.");
					}
					scope = next;
					index += 1;
					continue;
				}
				throw new Error(`Unknown hook resolve argument: ${value}`);
			}
			const resolveOptions: Parameters<typeof resolveHooks>[1] = {
				event,
				roles,
				surfaces,
				workType,
				languages,
			};
			if (filePath) {
				resolveOptions.filePath = filePath;
			}
			if (scope) {
				resolveOptions.scope = scope;
			}
			const hooks = resolveHooks(projectRoot, resolveOptions);
			if (wantsJson) {
				writeJson(
					io,
					"hook.resolve",
					envelopeOk(
						{
							count: hooks.length,
							hooks: hooks.map((entry) => ({ id: entry.id, name: entry.name })),
						},
						{ action: "hook.resolve" },
					),
				);
				return 0;
			}
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
		const { json, args: options } = parseJson(rest);
		if (command === "list" || command === "ls") {
			const rules = listRules(projectRoot);
			if (json) {
				writeJson(
					io,
					"rule.list",
					envelopeOk(
						{
							count: rules.length,
							rules: rules.map((entry) => ({
								id: entry.id,
								name: entry.name,
								path: entry.path,
							})),
						},
						{ action: "rule.list" },
					),
				);
				return 0;
			}
			io.stdout(
				[`rules: ${rules.length}`, ...rules.map(formatRule)].join("\n"),
			);
			return 0;
		}
		if (command === "show" || command === "get") {
			const identifier = options[0];
			if (!identifier) {
				throw new Error("Missing rule id for rule show.");
			}
			const rule = findRule(projectRoot, identifier);
			if (!rule) {
				if (json) {
					writeJson(
						io,
						"rule.show",
						envelopeErr("rule-not-found", `Rule not found: ${identifier}`, {
							action: "rule.show",
							exitCode: 1,
						}),
					);
					return 1;
				}
				io.stderr(`Rule not found: ${identifier}`);
				return 1;
			}
			if (json) {
				writeJson(
					io,
					"rule.show",
					envelopeOk(
						{
							rule: {
								id: rule.id,
								name: rule.name,
								path: rule.path,
								required: rule.required,
								domains: rule.domains,
								surfaces: rule.surfaces,
								work_types: rule.workTypes,
								languages: rule.languages,
								file_globs: rule.fileGlobs,
								exact_files: rule.exactFiles,
								priority: rule.priority,
							},
						},
						{ action: "rule.show" },
					),
				);
				return 0;
			}
			io.stdout(
				[
					`rule: ${rule.id} ${rule.name}`,
					`path: ${rule.path}`,
					...(rule.scope ? [`scope: ${rule.scope}`] : []),
					`required: ${rule.required ? "true" : "false"}`,
					...optionalMetadataLine("domains", rule.domains),
					...optionalMetadataLine("surfaces", rule.surfaces),
					...optionalMetadataLine("work_types", rule.workTypes),
					...optionalMetadataLine("languages", rule.languages),
					...optionalMetadataLine("file_globs", rule.fileGlobs),
					...optionalMetadataLine("exact_files", rule.exactFiles),
					...(rule.inject ? [`inject: ${rule.inject}`] : []),
					`char_count: ${rule.charCount}`,
				].join("\n"),
			);
			return 0;
		}
		if (command === "resolve") {
			const { json: jsonFlag, args: resolveArgs } = parseJson(rest);
			const domains: string[] = [];
			const surfaces: string[] = [];
			const languages: string[] = [];
			let workType = "delivery";
			let filePath: string | undefined;
			let scope: string | undefined;
			let inject: string | undefined;
			let required = false;
			for (let index = 0; index < resolveArgs.length; index += 1) {
				const value = resolveArgs[index];
				if (value === "--domain" || value === "--domains") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					domains.push(...splitCsv(next));
					index += 1;
					continue;
				}
				if (value === "--surface" || value === "--surfaces") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					surfaces.push(...splitCsv(next));
					index += 1;
					continue;
				}
				if (value === "--work-type") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error("Missing value for --work-type.");
					}
					workType = next;
					index += 1;
					continue;
				}
				if (value === "--language" || value === "--languages") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error(`Missing value for ${value}.`);
					}
					languages.push(...splitCsv(next));
					index += 1;
					continue;
				}
				if (value === "--file") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error("Missing value for --file.");
					}
					filePath = next;
					index += 1;
					continue;
				}
				if (value === "--scope") {
					const next = resolveArgs[index + 1];
					if (!next) {
						throw new Error("Missing value for --scope.");
					}
					scope = next;
					index += 1;
					continue;
				}
				if (value === "--inject") {
					const next = resolveArgs[index + 1];
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
			const options: Parameters<typeof resolveRulesWithDiagnostics>[1] = {
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
			const result = resolveRulesWithDiagnostics(projectRoot, options);
			if (jsonFlag) {
				writeJson(
					io,
					"rule.resolve",
					envelopeOk(
						{
							count: result.rules.length,
							rules: result.rules.map((entry) => ({
								id: entry.id,
								name: entry.name,
								path: entry.path,
							})),
							warnings: result.warnings,
						},
						{ action: "rule.resolve" },
					),
				);
				return 0;
			}
			io.stdout(
				[
					`resolved rules: ${result.rules.length}`,
					...result.rules.map(formatRule),
					...result.warnings.map(
						(warning) =>
							`warning ${warning.id}: ${warning.reason} ${warning.path}`,
					),
				].join("\n"),
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
		const { json, args: options } = parseJson(rest);
		if (command === "list" || command === "ls") {
			const verbose = parseVerboseListArgs(options);
			const skills = listSkills(projectRoot);
			if (json) {
				writeJson(
					io,
					"skill.list",
					envelopeOk(
						{
							count: skills.length,
							skills: skills.map((entry) => ({
								name: entry.name,
								path: entry.path,
								description: entry.description ?? undefined,
							})),
						},
						{ action: "skill.list" },
					),
				);
				return 0;
			}
			io.stdout(
				[
					`skills: ${skills.length}${verbose ? "" : " (use skill show <name> or skill list --verbose for descriptions)"}`,
					...skills.map(verbose ? formatSkill : formatSkillBrief),
				].join("\n"),
			);
			return 0;
		}
		if (command === "show" || command === "get") {
			const identifier = options[0];
			if (!identifier) {
				throw new Error("Missing skill name for skill show.");
			}
			const skill = findSkill(projectRoot, identifier);
			if (!skill) {
				if (json) {
					writeJson(
						io,
						"skill.show",
						envelopeErr("skill-not-found", `Skill not found: ${identifier}`, {
							action: "skill.show",
							exitCode: 1,
						}),
					);
					return 1;
				}
				io.stderr(`Skill not found: ${identifier}`);
				return 1;
			}
			if (json) {
				writeJson(
					io,
					"skill.show",
					envelopeOk(
						{
							name: skill.name,
							path: skill.path,
							description: skill.description ?? "none",
						},
						{ action: "skill.show" },
					),
				);
				return 0;
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
			const query = options.join(" ").trim();
			if (!query) {
				throw new Error("Missing query for skill search.");
			}
			const matches = searchSkills(projectRoot, query);
			if (json) {
				writeJson(
					io,
					"skill.search",
					envelopeOk(
						{
							query,
							count: matches.length,
							skills: matches.map((entry) => ({
								name: entry.name,
								path: entry.path,
							})),
						},
						{ action: "skill.search" },
					),
				);
				return 0;
			}
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
