import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const DOS_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;

export type ResolvedReleaseArtifact = {
	artifact: string;
	artifactPath: string;
	distPath: string;
};

function hasControlCharacter(value: string): boolean {
	return [...value].some((character) => {
		const codePoint = character.codePointAt(0);
		return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
	});
}

function isDescendant(parentPath: string, candidatePath: string): boolean {
	const relativePath = relative(parentPath, candidatePath);
	return (
		relativePath.length > 0 &&
		relativePath !== ".." &&
		!relativePath.startsWith("..\\") &&
		!relativePath.startsWith("../") &&
		!isAbsolute(relativePath)
	);
}

function assertNoReparsePath(cwd: string, segments: string[]): void {
	for (let index = 1; index <= segments.length; index += 1) {
		const candidate = join(cwd, ...segments.slice(0, index));
		if (lstatSync(candidate).isSymbolicLink()) {
			throw new Error(`release artifact uses a reparse path: ${candidate}`);
		}
	}
}

export function resolveReleaseArtifact(
	cwd: string,
	artifact: string,
): ResolvedReleaseArtifact {
	const canonical = artifact.replaceAll("\\", "/");
	const segments = canonical.split("/");
	if (
		artifact.length === 0 ||
		canonical.startsWith("/") ||
		/^[A-Za-z]:/u.test(artifact) ||
		artifact.includes(":") ||
		hasControlCharacter(artifact) ||
		segments[0] !== "dist" ||
		segments.length < 2 ||
		segments.some(
			(segment) =>
				segment.length === 0 ||
				segment === "." ||
				segment === ".." ||
				segment.endsWith(".") ||
				segment.endsWith(" ") ||
				DOS_DEVICE_NAME.test(segment),
		)
	) {
		throw new Error(`invalid release artifact: ${artifact}`);
	}
	const distPath = resolve(cwd, "dist");
	const artifactPath = resolve(cwd, canonical);
	if (!isDescendant(distPath, artifactPath)) {
		throw new Error(`invalid release artifact: ${artifact}`);
	}
	return { artifact: canonical, artifactPath, distPath };
}

export function resolveExistingReleaseArtifact(
	cwd: string,
	artifact: string,
): ResolvedReleaseArtifact {
	const resolved = resolveReleaseArtifact(cwd, artifact);
	if (!existsSync(resolved.artifactPath)) {
		throw new Error(`missing release artifact: ${resolved.artifact}`);
	}
	const segments = resolved.artifact.split("/");
	assertNoReparsePath(cwd, segments);
	const realCwd = realpathSync(cwd);
	const realDist = realpathSync(resolved.distPath);
	const realArtifact = realpathSync(resolved.artifactPath);
	if (
		!isDescendant(realCwd, realDist) ||
		!isDescendant(realDist, realArtifact)
	) {
		throw new Error(
			`release artifact escapes its physical containment: ${resolved.artifact}`,
		);
	}
	return resolved;
}

export function assertReleaseArtifactOutputRoot(cwd: string): string {
	const distPath = resolve(cwd, "dist");
	if (lstatSync(distPath).isSymbolicLink()) {
		throw new Error(`release artifact uses a reparse path: ${distPath}`);
	}
	const realCwd = realpathSync(cwd);
	const realDist = realpathSync(distPath);
	if (!isDescendant(realCwd, realDist)) {
		throw new Error(
			`release artifact escapes its physical containment: ${distPath}`,
		);
	}
	return distPath;
}
