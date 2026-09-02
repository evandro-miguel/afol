import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ReleaseSbomProvenance = {
	package_name: string;
	version: string;
	bun: string;
	generated_at: string;
	commit_sha: string;
};

type PackageJson = {
	name?: unknown;
	version?: unknown;
	license?: unknown;
	dependencies?: unknown;
};

export type BuildReleaseSbomOptions = {
	cwd: string;
	assetName: string;
	artifactSha256: string;
	provenance: ReleaseSbomProvenance;
};

function readPackageJson(path: string): PackageJson {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		throw new Error(`invalid package metadata: ${path}`);
	}
	if (!parsed || typeof parsed !== "object") {
		throw new Error(`invalid package metadata: ${path}`);
	}
	return parsed as PackageJson;
}

function requiredString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`missing ${label}`);
	}
	return value;
}

function spdxId(value: string): string {
	return value.replaceAll(/[^A-Za-z0-9.-]/gu, "-");
}

function dependencyNames(value: unknown): string[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return [];
	return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

export function buildReleaseSpdxSbom({
	cwd,
	assetName,
	artifactSha256,
	provenance,
}: BuildReleaseSbomOptions): Record<string, unknown> {
	const rootPackage = readPackageJson(join(cwd, "package.json"));
	const packageName = requiredString(rootPackage.name, "package name");
	const packageVersion = requiredString(rootPackage.version, "package version");
	const packageLicense = requiredString(rootPackage.license, "package license");
	if (
		packageName !== provenance.package_name ||
		packageVersion !== provenance.version
	) {
		throw new Error("package metadata does not match release provenance");
	}
	if (!Number.isFinite(Date.parse(provenance.generated_at))) {
		throw new Error("release provenance has invalid generated_at");
	}

	const applicationId = "SPDXRef-Package-AFOL";
	const bunId = "SPDXRef-Package-Bun-runtime";
	const packages: Array<Record<string, unknown>> = [
		{
			name: packageName,
			SPDXID: applicationId,
			versionInfo: packageVersion,
			packageFileName: assetName,
			downloadLocation: "NOASSERTION",
			filesAnalyzed: false,
			checksums: [{ algorithm: "SHA256", checksumValue: artifactSha256 }],
			licenseConcluded: "NOASSERTION",
			licenseDeclared: packageLicense,
			copyrightText: "NOASSERTION",
			primaryPackagePurpose: "APPLICATION",
			comment: `source_commit_sha=${provenance.commit_sha}; artifact_sha256=${artifactSha256}`,
		},
		{
			name: "Bun runtime",
			SPDXID: bunId,
			versionInfo: requiredString(provenance.bun, "Bun runtime version"),
			downloadLocation: "NOASSERTION",
			filesAnalyzed: false,
			licenseConcluded: "NOASSERTION",
			licenseDeclared: "NOASSERTION",
			copyrightText: "NOASSERTION",
			primaryPackagePurpose: "RUNTIME",
			comment:
				"The staged compliance bundle carries the reviewed Bun and linked-library notices.",
		},
	];
	const relationships: Array<Record<string, string>> = [
		{
			spdxElementId: "SPDXRef-DOCUMENT",
			relationshipType: "DESCRIBES",
			relatedSpdxElement: applicationId,
		},
		{
			spdxElementId: applicationId,
			relationshipType: "CONTAINS",
			relatedSpdxElement: bunId,
		},
	];

	for (const name of dependencyNames(rootPackage.dependencies)) {
		const dependency = readPackageJson(
			join(cwd, "node_modules", name, "package.json"),
		);
		const version = requiredString(
			dependency.version,
			`runtime dependency version for ${name}`,
		);
		const license = requiredString(
			dependency.license,
			`runtime dependency license for ${name}`,
		);
		const id = `SPDXRef-Package-${spdxId(name)}`;
		packages.push({
			name,
			SPDXID: id,
			versionInfo: version,
			downloadLocation: "NOASSERTION",
			filesAnalyzed: false,
			licenseConcluded: "NOASSERTION",
			licenseDeclared: license,
			copyrightText: "NOASSERTION",
			externalRefs: [
				{
					referenceCategory: "PACKAGE-MANAGER",
					referenceType: "purl",
					referenceLocator: `pkg:npm/${encodeURIComponent(name)}@${version}`,
				},
			],
		});
		relationships.push({
			spdxElementId: applicationId,
			relationshipType: "CONTAINS",
			relatedSpdxElement: id,
		});
	}

	return {
		spdxVersion: "SPDX-2.3",
		dataLicense: "CC0-1.0",
		SPDXID: "SPDXRef-DOCUMENT",
		name: `${packageName}-${packageVersion}-${assetName}`,
		documentNamespace: `https://spdx.org/spdxdocs/${encodeURIComponent(packageName)}-${packageVersion}-${artifactSha256}`,
		creationInfo: {
			created: provenance.generated_at,
			creators: [`Tool: ${packageName}-release-stage-${packageVersion}`],
		},
		packages,
		relationships,
	};
}
