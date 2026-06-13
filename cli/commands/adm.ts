import { relative } from "node:path";
import { listAdmFiles, resolveAdmPaths } from "../services/adm";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type AdmAction = "paths" | "show";

function normalizeAction(value: string | undefined): AdmAction {
	if (!value || value === "paths") {
		return "paths";
	}
	if (value === "show") {
		return "show";
	}
	throw new Error(`Unknown adm action: ${value}`);
}

function parseArgs(args: string[]): { json: boolean } {
	let json = false;
	for (const value of args) {
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		throw new Error(`Unknown adm argument: ${value}`);
	}
	return { json };
}

function toRelative(root: string, paths: Record<string, string>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(paths)) {
		result[key] = relative(root, value);
	}
	return result;
}

export async function runAdmCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const admAction = normalizeAction(action);
		const parsed = parseArgs(args);
		if (admAction === "paths") {
			const paths = resolveAdmPaths(projectRoot);
			if (parsed.json) {
				io.stdout(JSON.stringify({ action: admAction, paths }));
			} else {
				io.stdout(
					Object.entries(toRelative(projectRoot, paths))
						.map(([key, value]) => `${key}: ${value}`)
						.join("\n"),
				);
			}
			return 0;
		}

		const files = listAdmFiles(projectRoot);
		if (parsed.json) {
			io.stdout(JSON.stringify({ action: admAction, files }));
		} else {
			io.stdout(files.join("\n"));
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
