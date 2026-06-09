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

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
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
			if (manifestEntry?.owner === "ignored") {
				operations.push({
					kind: "preserve-project-owned",
					path,
					reason: "manifest-owner-ignored-missing",
					owner: manifestEntry.owner,
				});
				continue;
			}
			if (manifestEntry?.owner === "project-owned") {
				operations.push({
					kind: "preserve-project-owned",
					path,
					reason: "manifest-owner-project-owned-missing",
					owner: manifestEntry.owner,
				});
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

		if (manifestEntry?.owner === "project-owned") {
			operations.push({
				kind: "preserve-project-owned",
				path,
				reason: "manifest-owner-project-owned",
				owner: manifestEntry.owner,
			});
			continue;
		}

		if (manifestEntry?.owner === "ignored") {
			operations.push({
				kind: "preserve-project-owned",
				path,
				reason: "manifest-owner-ignored",
				owner: manifestEntry.owner,
			});
			continue;
		}

		if (manifestEntry?.owner === "conflict") {
			operations.push({
				kind: "conflict",
				path,
				reason: "manifest-owner-conflict",
				owner: "conflict",
				diffPreview: buildPatch(path, currentContent, templateContent),
			});
			continue;
		}

		if (manifestEntry?.owner === "generated") {
			operations.push({
				kind: "update-managed",
				path,
				reason: "manifest-owner-generated",
				owner: manifestEntry.owner,
				diffPreview: buildPatch(path, currentContent, templateContent),
			});
			continue;
		}

		if (
			manifestEntry?.owner === "managed" &&
			manifestEntry.hash === currentHash
		) {
			operations.push({
				kind: "update-managed",
				path,
				reason: "managed-hash-matches-manifest",
				owner: manifestEntry.owner,
				diffPreview: buildPatch(path, currentContent, templateContent),
			});
			continue;
		}

		operations.push({
			kind: "conflict",
			path,
			reason: "local-drift-or-unknown-ownership",
			owner: owner === "managed" ? "conflict" : owner,
			diffPreview: buildPatch(path, currentContent, templateContent),
		});
	}

	return {
		operations,
		filteredForbiddenCount,
	};
}
