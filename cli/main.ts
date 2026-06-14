#!/usr/bin/env bun

import { runAdapterCommand } from "./commands/adapter";
import { runAdmCommand } from "./commands/adm";
import { runAdrCommand } from "./commands/adr";
import { runBootstrapCommand } from "./commands/bootstrap";
import { runRuleCommand, runSkillCommand } from "./commands/catalog";
import { runChangelogCommand } from "./commands/changelog";
import { runContextCommand } from "./commands/context";
import { runDbCommand } from "./commands/db";
import { runDoctorCommand } from "./commands/doctor";
import { runFileCommand } from "./commands/file";
import { runHealthCommand } from "./commands/health";
import { runHydrateCommand } from "./commands/hydrate";
import { runInitCommand } from "./commands/init";
import { runLibraryCommand } from "./commands/library";
import { runLocalStateCommand } from "./commands/local-state";
import { runMaintenanceCommand } from "./commands/maintenance";
import { runMemoryCommand } from "./commands/memory";
import { runPstrCommand } from "./commands/pstr";
import { runSchemaCommand } from "./commands/schema-cmd";
import { runSpecCommand } from "./commands/spec";
import { runStateCommand } from "./commands/state";
import { runStatusCommand } from "./commands/status";
import { runSweepCommand } from "./commands/sweep";
import { runUpdateCommand } from "./commands/update";
import { runValidateCommand } from "./commands/validate";
import {
	runCloseCommand,
	runDoneCommand,
	runEvidenceCommand,
	runLogCommand,
	runNewCommand,
	runStartCommand,
	runVerifyTasksCommand,
} from "./commands/workbench";
import { CLI_VERSION } from "./generated/version";
import {
	buildCommandHelpJson,
	formatCatalogJson,
	formatCommandHelp,
	formatHelpText,
} from "./help";
import { kernelRegistry } from "./registry";
import { resolveCommand } from "./router";
import { loadProjectRoot } from "./services/project/root";
import { runValidationCommand } from "./validate/contract";

const NEW_COMMAND_HELP = [
	"Usage: afol new <theme> [options]",
	"",
	"Options",
	"  --intent <intent>        Delivery or planning intent",
	"  --feature-id <id>        Governing roadmap feature ID",
	"  --parent-spec <spec-id>  Parent spec identifier",
	"  --task <text>            Initial task summary",
].join("\n");

const exit = (code: number): never => {
	process.exit(code);
};

function resolveValidateMode(
	projectRoot: string,
	args: string[],
): {
	mode: "project" | "benchmark";
	args: string[];
} {
	void projectRoot;
	const explicitProject = args[0] === "project" || args.includes("--project");
	if (explicitProject) {
		return {
			mode: "project",
			args: args.filter((arg) => arg !== "project" && arg !== "--project"),
		};
	}

	const explicitBenchmarkMode = args[0];
	if (
		explicitBenchmarkMode === "bench" ||
		explicitBenchmarkMode === "select" ||
		explicitBenchmarkMode === "run"
	) {
		return { mode: "benchmark", args };
	}

	return { mode: "project", args };
}

export async function main(argv: string[]): Promise<number> {
	const args = argv.slice(2);
	if (
		args.length === 1 &&
		(args[0] === "--version" || args[0] === "-V" || args[0] === "version")
	) {
		console.log(`afol ${CLI_VERSION}`);
		return 0;
	}

	if (args[0] === "help") {
		const jsonRequested = args.some((arg) => kernelRegistry.isJsonAlias(arg));
		const helpTarget = args[1] ?? "";
		if (jsonRequested) {
			if (helpTarget && !kernelRegistry.isJsonAlias(helpTarget)) {
				const help = buildCommandHelpJson(helpTarget, kernelRegistry);
				if (help) {
					console.log(`${JSON.stringify(help, null, 2)}\n`);
					return 0;
				}
				console.error(
					`err unknown-command command=${helpTarget} hint="run afol -h"`,
				);
				return 2;
			}
			console.log(formatCatalogJson(kernelRegistry));
			return 0;
		}
		if (args.length === 1) {
			console.log(formatHelpText(kernelRegistry));
			return 0;
		}
		const help = formatCommandHelp(helpTarget, kernelRegistry);
		if (help) {
			console.log(help);
			return 0;
		}
		console.error(
			`err unknown-command command=${args[1] ?? ""} hint="run afol -h"`,
		);
		return 2;
	}

	const resolution = resolveCommand(args);

	if (resolution.kind === "help") {
		console.log(formatHelpText(kernelRegistry));
		return 0;
	}

	if (resolution.kind === "unknown") {
		console.error(resolution.message);
		return resolution.exitCode;
	}

	if (
		resolution.kind === "new" &&
		resolution.args.length === 1 &&
		(resolution.args[0] === "-h" || resolution.args[0] === "--help")
	) {
		console.log(NEW_COMMAND_HELP);
		return 0;
	}

	if (resolution.kind === "bootstrap") {
		return runBootstrapCommand(resolution.args);
	}

	if (resolution.kind === "init") {
		return runInitCommand(resolution.args);
	}

	const project = loadProjectRoot(process.cwd());
	if (!project.ok) {
		console.error(project.error.message);
		return project.error.code;
	}

	if (resolution.kind === "validate") {
		const validateMode = resolveValidateMode(
			project.value.root,
			resolution.args,
		);
		if (validateMode.mode === "benchmark") {
			return runValidationCommand(project.value.root, validateMode.args);
		}
		return runValidateCommand(project.value.root, validateMode.args);
	}

	if (resolution.kind === "status") {
		return runStatusCommand(project.value.root, resolution.args);
	}

	if (resolution.kind === "new") {
		return runNewCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "start") {
		return runStartCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "evidence") {
		return runEvidenceCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "done") {
		return runDoneCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "log") {
		return runLogCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "verifyTasks") {
		return runVerifyTasksCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "rule") {
		return runRuleCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "skill") {
		return runSkillCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "update") {
		return runUpdateCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "close") {
		return runCloseCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "file") {
		return runFileCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "localState") {
		return runLocalStateCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "subcommand" && resolution.group === "adm") {
		return runAdmCommand(
			resolution.action,
			resolution.args,
			project.value.root,
		);
	}

	if (resolution.kind === "subcommand") {
		if (resolution.group === "health") {
			return runHealthCommand(
				[resolution.action, ...resolution.args].filter(Boolean),
				project.value.root,
			);
		}
		if (resolution.group === "db") {
			return runDbCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "doctor") {
			return runDoctorCommand(
				[resolution.action, ...resolution.args].filter(Boolean),
				project.value.root,
			);
		}
		if (resolution.group === "maintenance") {
			return runMaintenanceCommand(
				[resolution.action, ...resolution.args].filter(Boolean),
				project.value.root,
			);
		}
		if (resolution.group === "pstr") {
			return runPstrCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "schema") {
			return runSchemaCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "sweep") {
			return runSweepCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "spec") {
			return runSpecCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "adr") {
			return runAdrCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "changelog") {
			return runChangelogCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "ctx") {
			return runContextCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "library") {
			return runLibraryCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "memory") {
			return runMemoryCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "state") {
			return runStateCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "adapter") {
			return runAdapterCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "hydrate") {
			return runHydrateCommand(
				"hydrate",
				[resolution.action, ...resolution.args],
				project.value.root,
			);
		}
		console.error(
			`afol ${resolution.group} ${resolution.action}: not yet implemented`,
		);
		return 1;
	}

	console.error("err unsupported-command");
	return 2;
}

if (import.meta.main) {
	exit(await main(process.argv));
}
