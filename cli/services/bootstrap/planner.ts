import { createHash } from "node:crypto";
import { createPatch } from "diff";
import { matchesTemplateForbiddenPattern } from "../../schemas/template-policy";
import type { TemplateFileMap } from "../template/payload";

export type ManagedOwnership =
	| "managed"
	| "project-owned"
	| "generated"
	| "ignored"
	| "conflict";

export type BootstrapManifestEntry = {
	owner: ManagedOwnership;
	hash?: string;
};

export type BootstrapOperationKind =
	| "create"
	| "skip-identical"
	| "update-managed"
	| "preserve-project-owned"
	| "conflict";

export type BootstrapOperation = {
	kind: BootstrapOperationKind;
	path: string;
	reason: string;
	owner: ManagedOwnership;
	diffPreview?: string;
	nextContent?: string;
};

export type BootstrapPlanInput = {
	templateFiles: TemplateFileMap;
	currentFiles: Record<string, string>;
	manifest: Record<string, BootstrapManifestEntry>;
};

export type BootstrapPlan = {
	operations: BootstrapOperation[];
	filteredForbiddenCount: number;
};

const LEGACY_SPECS_INDEX_PATH = ".afol/adm/specs/INDEX.md";
export const COMPLETION_LOCK_GITIGNORE_RULE = ".afol/wb/.locks/";
// This is the untouched index shipped before the specs-index validation schema
// was introduced. Only this exact scaffold payload is safe to migrate.
const LEGACY_SPECS_INDEX_SHA256 =
	"cbbc5c7bd9e882a44c2fc12a020e671fd2250ffd841ebe87fee4c5e4d736e808";

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function isLegacySpecsIndex(path: string, content: string): boolean {
	return (
		path === LEGACY_SPECS_INDEX_PATH &&
		sha256Hex(content) === LEGACY_SPECS_INDEX_SHA256
	);
}

function toOperationOwner(
	manifestOwner: ManagedOwnership | undefined,
): ManagedOwnership {
	return manifestOwner ?? "managed";
}

function buildPatch(
	path: string,
	currentContent: string,
	templateContent: string,
): string {
	return createPatch(
		path,
		currentContent,
		templateContent,
		"current",
		"template",
	);
}

function buildPreserveProjectOwnedOperation(
	path: string,
	owner: ManagedOwnership | undefined,
	isMissing: boolean,
): BootstrapOperation | null {
	if (owner === "project-owned" && isMissing) {
		return null;
	}
	if (owner !== "project-owned" && owner !== "ignored") {
		return null;
	}
	return {
		kind: "preserve-project-owned",
		path,
		reason: `manifest-owner-${owner}${isMissing ? "-missing" : ""}`,
		owner,
	};
}

function buildOperationWithPatch(
	kind: Extract<BootstrapOperationKind, "conflict" | "update-managed">,
	path: string,
	reason: string,
	owner: ManagedOwnership,
	currentContent: string,
	templateContent: string,
): BootstrapOperation {
	return {
		kind,
		path,
		reason,
		owner,
		diffPreview: buildPatch(path, currentContent, templateContent),
	};
}

export function planCompletionLockGitignoreOperation(input: {
	state: "absent" | "regular" | "unsafe";
	content?: string;
	reason?: string;
}): BootstrapOperation {
	if (input.state === "unsafe") {
		return {
			kind: "conflict",
			path: ".gitignore",
			reason: input.reason ?? "project-owned-gitignore-unsafe",
			owner: "conflict",
		};
	}
	const currentContent = input.content ?? "";
	if (currentContent.split(/\r?\n/).includes(COMPLETION_LOCK_GITIGNORE_RULE)) {
		return {
			kind: "skip-identical",
			path: ".gitignore",
			reason: "managed-lock-ignore-present",
			owner: "project-owned",
		};
	}
	const nextContent = `${currentContent}${
		currentContent.length > 0 && !currentContent.endsWith("\n") ? "\n" : ""
	}${COMPLETION_LOCK_GITIGNORE_RULE}\n`;
	return {
		kind: "update-managed",
		path: ".gitignore",
		reason: "managed-lock-ignore",
		owner: "project-owned",
		nextContent,
		diffPreview: buildPatch(".gitignore", currentContent, nextContent),
	};
}

export function planBootstrapOperations(
	input: BootstrapPlanInput,
): BootstrapPlan {
	const operations: BootstrapOperation[] = [];
	const templatePaths = Object.keys(input.templateFiles).sort();
	let filteredForbiddenCount = 0;

	for (const path of templatePaths) {
		if (matchesTemplateForbiddenPattern(path)) {
			filteredForbiddenCount += 1;
			continue;
		}

		const templateEntry = input.templateFiles[path];
		if (!templateEntry) {
			continue;
		}
		const currentContent = input.currentFiles[path];
		const manifestEntry = input.manifest[path];
		const owner = toOperationOwner(manifestEntry?.owner);
		const templateContent = Buffer.from(
			templateEntry.contentBase64,
			"base64",
		).toString("utf8");

		if (typeof currentContent !== "string") {
			const preserveOperation = buildPreserveProjectOwnedOperation(
				path,
				manifestEntry?.owner,
				true,
			);
			if (preserveOperation) {
				operations.push(preserveOperation);
				continue;
			}
			operations.push({
				kind: "create",
				path,
				reason: "missing-target-file",
				owner,
			});
			continue;
		}

		const currentHash = sha256Hex(currentContent);
		if (currentHash === templateEntry.sha256) {
			operations.push({
				kind: "skip-identical",
				path,
				reason: "same-content-hash",
				owner,
			});
			continue;
		}

		if (owner === "project-owned" && isLegacySpecsIndex(path, currentContent)) {
			operations.push(
				buildOperationWithPatch(
					"update-managed",
					path,
					"legacy-template-index",
					"generated",
					currentContent,
					templateContent,
				),
			);
			continue;
		}

		const preserveOperation = buildPreserveProjectOwnedOperation(
			path,
			manifestEntry?.owner,
			false,
		);
		if (preserveOperation) {
			operations.push(preserveOperation);
			continue;
		}

		if (manifestEntry?.owner === "conflict") {
			operations.push(
				buildOperationWithPatch(
					"conflict",
					path,
					"manifest-owner-conflict",
					"conflict",
					currentContent,
					templateContent,
				),
			);
			continue;
		}

		if (manifestEntry?.owner === "generated") {
			operations.push(
				buildOperationWithPatch(
					"update-managed",
					path,
					"manifest-owner-generated",
					manifestEntry.owner,
					currentContent,
					templateContent,
				),
			);
			continue;
		}

		if (
			manifestEntry?.owner === "managed" &&
			manifestEntry.hash === currentHash
		) {
			operations.push(
				buildOperationWithPatch(
					"update-managed",
					path,
					"managed-hash-matches-manifest",
					manifestEntry.owner,
					currentContent,
					templateContent,
				),
			);
			continue;
		}

		operations.push(
			buildOperationWithPatch(
				"conflict",
				path,
				"local-drift-or-unknown-ownership",
				owner === "managed" ? "conflict" : owner,
				currentContent,
				templateContent,
			),
		);
	}

	return {
		operations,
		filteredForbiddenCount,
	};
}
