import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { resolveExistingReleaseArtifact } from "./release-artifact";

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
	optionalDependencies?: unknown;
	peerDependencies?: unknown;
	peerDependenciesMeta?: unknown;
};

type JsonRecord = Record<string, unknown>;

export type BuildReleaseSbomOptions = {
	cwd: string;
	assetName: string;
	artifactSha256: string;
	provenance: ReleaseSbomProvenance;
};

export type WriteReleaseSbomDraftOptions = {
	cwd?: string;
	artifact?: string;
};

export type WriteReleaseSbomDraftResult = {
	path: string;
	sbomSha256: string;
	artifactSha256: string;
	packageCount: number;
};

type ResolvedPackage = {
	metadata: PackageJson;
	metadataPath: string;
	packageDir: string;
};

type RuntimePackage = {
	name: string;
	version: string;
	license: string;
	spdxId: string;
};

type RuntimeRelationship = {
	spdxElementId: string;
	relationshipType:
		| "DESCRIBES"
		| "DEPENDS_ON"
		| "OPTIONAL_DEPENDENCY_OF"
		| "CONTAINS";
	relatedSpdxElement: string;
};

type LockedPackage = {
	key: string;
	name: string;
	version: string;
	info: JsonRecord;
};

type PackageLockIndex = {
	rootDependencies: Record<string, string>;
	rootOptionalDependencies: Record<string, string>;
	packagesByKey: Map<string, LockedPackage>;
	packagesByIdentity: Map<string, LockedPackage[]>;
};

type LockedPackageResolution = {
	package: LockedPackage;
	contexts: string[];
};

function readPackageJson(path: string): PackageJson {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		throw new Error(`invalid package metadata: ${path}`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`invalid package metadata: ${path}`);
	}
	return parsed as PackageJson;
}

function asRecord(value: unknown, label: string): JsonRecord {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`invalid ${label}`);
	}
	return value as JsonRecord;
}

function requiredString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`missing ${label}`);
	}
	return value;
}

function stringMap(value: unknown, label: string): Record<string, string> {
	if (value === undefined) return {};
	const record = asRecord(value, label);
	const result: Record<string, string> = {};
	for (const [name, specifier] of Object.entries(record)) {
		if (
			name.length === 0 ||
			name.includes("\\") ||
			name.split("/").some((part) => !part || part === "." || part === "..") ||
			typeof specifier !== "string" ||
			specifier.trim().length === 0
		) {
			throw new Error(`invalid ${label}`);
		}
		result[name] = specifier;
	}
	return result;
}

function sameStringMap(
	left: Record<string, string>,
	right: Record<string, string>,
): boolean {
	const names = Object.keys(left).sort();
	return (
		JSON.stringify(names.map((name) => [name, left[name]])) ===
		JSON.stringify(
			Object.keys(right)
				.sort()
				.map((name) => [name, right[name]]),
		)
	);
}

function lockPackageInfo(entry: unknown[], key: string): JsonRecord {
	const infoValue =
		entry.length >= 4
			? entry[2]
			: entry.length > 1 && typeof entry[1] === "object" && entry[1] !== null
				? entry[1]
				: undefined;
	return infoValue === undefined
		? {}
		: asRecord(infoValue, `Bun lock package metadata for ${key}`);
}

function lockPackageIdentity(reference: string): {
	name: string;
	version: string;
} {
	const separator = reference.lastIndexOf("@");
	if (separator <= 0 || separator === reference.length - 1) {
		throw new Error("invalid Bun lock package reference");
	}
	return {
		name: reference.slice(0, separator),
		version: reference.slice(separator + 1),
	};
}

function lockMetadataMatches(
	left: JsonRecord,
	right: JsonRecord,
	label: string,
): boolean {
	for (const field of [
		"dependencies",
		"optionalDependencies",
		"peerDependencies",
	] as const) {
		if (
			!sameStringMap(
				stringMap(left[field], `${label} ${field}`),
				stringMap(right[field], `${label} ${field}`),
			)
		) {
			return false;
		}
	}
	const leftPeers = left.optionalPeers;
	const rightPeers = right.optionalPeers;
	const normalizePeers = (value: unknown): string[] => {
		if (value === undefined) return [];
		if (
			!Array.isArray(value) ||
			value.some((peer) => typeof peer !== "string") ||
			new Set(value).size !== value.length
		) {
			throw new Error(`invalid ${label} optionalPeers`);
		}
		return [...(value as string[])].sort();
	};
	return (
		JSON.stringify(normalizePeers(leftPeers)) ===
		JSON.stringify(normalizePeers(rightPeers))
	);
}

function packageLockIndex(
	cwd: string,
	rootPackage: PackageJson,
): PackageLockIndex {
	const lockPath = join(cwd, "bun.lock");
	if (!existsSync(lockPath) || !statSync(lockPath).isFile()) {
		throw new Error("missing Bun dependency lockfile");
	}
	let parsed: unknown;
	try {
		parsed = Bun.JSONC.parse(readFileSync(lockPath, "utf8"));
	} catch {
		throw new Error("invalid Bun dependency lockfile");
	}
	const lock = asRecord(parsed, "Bun dependency lockfile");
	const workspaces = asRecord(lock.workspaces, "Bun lock workspaces");
	const rootWorkspace = asRecord(workspaces[""], "root Bun lock workspace");
	const rootDependencies = stringMap(
		rootWorkspace.dependencies,
		"root Bun lock dependencies",
	);
	const rootOptionalDependencies = stringMap(
		rootWorkspace.optionalDependencies,
		"root Bun lock optionalDependencies",
	);
	if (
		!sameStringMap(
			stringMap(rootPackage.dependencies, "package.json dependencies"),
			rootDependencies,
		) ||
		!sameStringMap(
			stringMap(
				rootPackage.optionalDependencies,
				"package.json optionalDependencies",
			),
			rootOptionalDependencies,
		)
	) {
		throw new Error("bun.lock dependencies do not match package.json");
	}
	const packages = asRecord(lock.packages, "Bun lock packages");
	const packagesByKey = new Map<string, LockedPackage>();
	const packagesByIdentity = new Map<string, LockedPackage[]>();
	for (const [key, value] of Object.entries(packages)) {
		const entry = value;
		if (!Array.isArray(entry) || typeof entry[0] !== "string") {
			throw new Error("invalid Bun lock package resolution");
		}
		const { name, version } = lockPackageIdentity(entry[0]);
		const node: LockedPackage = {
			key,
			name,
			version,
			info: lockPackageInfo(entry, key),
		};
		if (packagesByKey.has(key)) {
			throw new Error(`duplicate Bun lock package key: ${key}`);
		}
		packagesByKey.set(key, node);
		const identity = `${name}\u0000${version}`;
		const sameIdentity = packagesByIdentity.get(identity) ?? [];
		if (
			sameIdentity.some(
				(prior) =>
					!lockMetadataMatches(
						prior.info,
						node.info,
						`Bun lock package ${name}@${version}`,
					),
			)
		) {
			throw new Error(`conflicting Bun lock metadata for ${name}@${version}`);
		}
		sameIdentity.push(node);
		packagesByIdentity.set(identity, sameIdentity);
	}
	return {
		rootDependencies,
		rootOptionalDependencies,
		packagesByKey,
		packagesByIdentity,
	};
}

function resolveLockedDependency(
	lockIndex: PackageLockIndex,
	parentLockContexts: string[],
	requestedName: string,
): LockedPackageResolution | undefined {
	for (const [index, context] of parentLockContexts.entries()) {
		const nested = lockIndex.packagesByKey.get(`${context}/${requestedName}`);
		if (nested) {
			return {
				package: nested,
				contexts: [nested.key, ...parentLockContexts.slice(index)],
			};
		}
	}
	const root = lockIndex.packagesByKey.get(requestedName);
	return root ? { package: root, contexts: [root.key] } : undefined;
}

function optionalPeerNames(metadata: PackageJson, label: string): string[] {
	const peerMetaValue = metadata.peerDependenciesMeta;
	if (peerMetaValue === undefined) return [];
	const peerMeta = asRecord(peerMetaValue, `${label} peerDependenciesMeta`);
	const optional: string[] = [];
	for (const [name, value] of Object.entries(peerMeta)) {
		const entry = asRecord(value, `${label} peer metadata`);
		if (entry.optional === true) optional.push(name);
	}
	return optional.sort();
}

function assertPackageLockMatchesMetadata(
	metadata: PackageJson,
	locked: LockedPackage,
): void {
	const metadataView: JsonRecord = {
		dependencies: stringMap(
			metadata.dependencies,
			`${locked.name} dependencies`,
		),
		optionalDependencies: stringMap(
			metadata.optionalDependencies,
			`${locked.name} optionalDependencies`,
		),
		peerDependencies: stringMap(
			metadata.peerDependencies,
			`${locked.name} peerDependencies`,
		),
		optionalPeers: optionalPeerNames(metadata, locked.name),
	};
	if (
		!lockMetadataMatches(
			metadataView,
			locked.info,
			`${locked.name}@${locked.version}`,
		)
	) {
		throw new Error(
			`installed dependency metadata does not match bun.lock: ${locked.name}@${locked.version}`,
		);
	}
}

function versionMatchesSpecifier(version: string, specifier: string): boolean {
	try {
		return Bun.semver.satisfies(version, specifier);
	} catch {
		return false;
	}
}

function isWithin(root: string, candidate: string): boolean {
	const child = relative(root, candidate);
	return (
		child === "" ||
		(child !== ".." &&
			!child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
			!isAbsolute(child))
	);
}

function packagePathParts(name: string): string[] {
	const parts = name.split("/");
	const scope = parts[0];
	const packageName = parts[1];
	if (
		name.startsWith("@")
			? parts.length !== 2 || !scope || scope.length < 2 || !packageName
			: parts.length !== 1 || name === "." || name === ".."
	) {
		throw new Error(`invalid runtime dependency name: ${name}`);
	}
	return parts;
}

function resolveInstalledPackage(
	projectRoot: string,
	fromDir: string,
	requestedName: string,
): ResolvedPackage | undefined {
	const parts = packagePathParts(requestedName);
	let current = fromDir;
	while (isWithin(projectRoot, current)) {
		const candidate = join(current, "node_modules", ...parts, "package.json");
		if (existsSync(candidate)) {
			let metadataPath: string;
			try {
				metadataPath = realpathSync(candidate);
			} catch {
				throw new Error(
					`cannot resolve installed runtime dependency: ${requestedName}`,
				);
			}
			if (
				!isWithin(projectRoot, metadataPath) ||
				!statSync(metadataPath).isFile()
			) {
				throw new Error(
					`unsafe installed runtime dependency: ${requestedName}`,
				);
			}
			return {
				metadata: readPackageJson(metadataPath),
				metadataPath,
				packageDir: dirname(metadataPath),
			};
		}
		if (current === projectRoot) break;
		const parent = dirname(current);
		if (parent === current || !isWithin(projectRoot, parent)) break;
		current = parent;
	}
	return undefined;
}

function spdxId(value: string): string {
	return value.replaceAll(/[^A-Za-z0-9.-]/gu, "-");
}

function runtimeSpdxId(name: string, version: string): string {
	const identity = `${name}@${version}`;
	const suffix = createHash("sha256")
		.update(identity)
		.digest("hex")
		.slice(0, 12);
	return `SPDXRef-Package-${spdxId(name)}-${spdxId(version)}-${suffix}`;
}

function installedRuntimePackages(
	cwd: string,
	rootPackage: PackageJson,
): {
	packages: RuntimePackage[];
	relationships: RuntimeRelationship[];
} {
	const projectRoot = realpathSync(cwd);
	const lockIndex = packageLockIndex(projectRoot, rootPackage);
	const rootDir = projectRoot;
	const applicationId = "SPDXRef-Package-AFOL";
	const packages = new Map<string, RuntimePackage>();
	const queue: Array<{
		fromDir: string;
		requestedName: string;
		specifier: string;
		optional: boolean;
		root: boolean;
		parentLockContexts: string[];
		parentId: string;
		parentLabel: string;
	}> = [];
	const visitedLocations = new Set<string>();
	const relationships = new Map<string, RuntimeRelationship>();
	for (const [name, specifier] of Object.entries(
		lockIndex.rootDependencies,
	).sort(([a], [b]) => a.localeCompare(b))) {
		queue.push({
			fromDir: rootDir,
			requestedName: name,
			specifier,
			optional: false,
			root: true,
			parentLockContexts: [],
			parentId: applicationId,
			parentLabel: "AFOL",
		});
	}
	for (const [name, specifier] of Object.entries(
		lockIndex.rootOptionalDependencies,
	).sort(([a], [b]) => a.localeCompare(b))) {
		queue.push({
			fromDir: rootDir,
			requestedName: name,
			specifier,
			optional: true,
			root: true,
			parentLockContexts: [],
			parentId: applicationId,
			parentLabel: "AFOL",
		});
	}
	while (queue.length > 0) {
		const dependency = queue.shift();
		if (!dependency) break;
		const rootLockPackage = dependency.root
			? lockIndex.packagesByKey.get(dependency.requestedName)
			: undefined;
		if (
			dependency.root &&
			(!rootLockPackage ||
				!versionMatchesSpecifier(rootLockPackage.version, dependency.specifier))
		) {
			throw new Error(
				`root dependency does not match its bun.lock resolution: ${dependency.requestedName}`,
			);
		}
		const installed = resolveInstalledPackage(
			projectRoot,
			dependency.fromDir,
			dependency.requestedName,
		);
		if (!installed) {
			if (dependency.optional) continue;
			throw new Error(
				`missing installed runtime dependency ${dependency.requestedName} for ${dependency.parentLabel}`,
			);
		}
		const name = requiredString(
			installed.metadata.name,
			"runtime dependency name",
		);
		const version = requiredString(
			installed.metadata.version,
			`runtime dependency version for ${name}`,
		);
		const license = requiredString(
			installed.metadata.license,
			`runtime dependency license for ${name}`,
		);
		if (
			dependency.root &&
			rootLockPackage &&
			(rootLockPackage.name !== name || rootLockPackage.version !== version)
		) {
			throw new Error(
				`root dependency does not match its bun.lock resolution: ${dependency.requestedName}@${rootLockPackage.version}`,
			);
		}
		const lockedResolution = dependency.root
			? rootLockPackage
				? {
						package: rootLockPackage,
						contexts: [rootLockPackage.key],
					}
				: undefined
			: resolveLockedDependency(
					lockIndex,
					dependency.parentLockContexts,
					dependency.requestedName,
				);
		const lockedPackage = lockedResolution?.package;
		if (
			!lockedResolution ||
			!lockedPackage ||
			lockedPackage.name !== name ||
			lockedPackage.version !== version
		) {
			throw new Error(
				`runtime dependency does not match its bun.lock resolution: ${dependency.requestedName}@${version}`,
			);
		}
		if (!versionMatchesSpecifier(version, dependency.specifier)) {
			throw new Error(
				`runtime dependency does not satisfy its bun.lock edge: ${dependency.requestedName}@${version}`,
			);
		}
		assertPackageLockMatchesMetadata(installed.metadata, lockedPackage);
		const key = `${name}\u0000${version}`;
		const id = runtimeSpdxId(name, version);
		const prior = packages.get(key);
		if (prior && (prior.license !== license || prior.spdxId !== id)) {
			throw new Error(
				`runtime dependency metadata differs for ${name}@${version}`,
			);
		}
		if (!prior) packages.set(key, { name, version, license, spdxId: id });
		const relationshipType: RuntimeRelationship["relationshipType"] =
			dependency.optional ? "OPTIONAL_DEPENDENCY_OF" : "DEPENDS_ON";
		const relationship = dependency.optional
			? { spdxElementId: id, relatedSpdxElement: dependency.parentId }
			: { spdxElementId: dependency.parentId, relatedSpdxElement: id };
		relationships.set(
			`${relationshipType}\u0000${relationship.spdxElementId}\u0000${relationship.relatedSpdxElement}`,
			{ ...relationship, relationshipType },
		);
		const locationKey = `${key}\u0000${installed.metadataPath}`;
		if (visitedLocations.has(locationKey)) continue;
		visitedLocations.add(locationKey);
		const dependencyMaps: Array<{
			values: Record<string, string>;
			optional: boolean;
		}> = [
			{
				values: stringMap(
					installed.metadata.dependencies,
					`${name} dependencies`,
				),
				optional: false,
			},
			{
				values: stringMap(
					installed.metadata.optionalDependencies,
					`${name} optionalDependencies`,
				),
				optional: true,
			},
		];
		const peers = stringMap(
			installed.metadata.peerDependencies,
			`${name} peerDependencies`,
		);
		const peerMetaValue = installed.metadata.peerDependenciesMeta;
		const peerMeta =
			peerMetaValue === undefined
				? {}
				: asRecord(peerMetaValue, `${name} peerDependenciesMeta`);
		for (const peerName of Object.keys(peers).sort()) {
			const peerSpecifier = peers[peerName];
			if (!peerSpecifier) throw new Error(`invalid ${name} peerDependencies`);
			const metadata = peerMeta[peerName];
			const optional =
				metadata !== undefined &&
				asRecord(metadata, `${name} peer metadata`).optional === true;
			dependencyMaps.push({ values: { [peerName]: peerSpecifier }, optional });
		}
		for (const group of dependencyMaps) {
			for (const [childName, specifier] of Object.entries(group.values).sort(
				([a], [b]) => a.localeCompare(b),
			)) {
				queue.push({
					fromDir: installed.packageDir,
					requestedName: childName,
					specifier,
					optional: group.optional,
					root: false,
					parentLockContexts: lockedResolution.contexts,
					parentId: id,
					parentLabel: `${name}@${version}`,
				});
			}
		}
	}
	return {
		packages: [...packages.values()].sort(
			(left, right) =>
				left.name.localeCompare(right.name) ||
				left.version.localeCompare(right.version),
		),
		relationships: [...relationships.values()].sort(
			(left, right) =>
				left.spdxElementId.localeCompare(right.spdxElementId) ||
				left.relatedSpdxElement.localeCompare(right.relatedSpdxElement) ||
				left.relationshipType.localeCompare(right.relationshipType),
		),
	};
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
	const runtimeId = "SPDXRef-Package-Bun-runtime";
	const runtime = installedRuntimePackages(cwd, rootPackage);
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
			SPDXID: runtimeId,
			versionInfo: requiredString(provenance.bun, "Bun runtime version"),
			downloadLocation: "NOASSERTION",
			filesAnalyzed: false,
			licenseConcluded: "NOASSERTION",
			licenseDeclared: "MIT",
			copyrightText: "NOASSERTION",
			primaryPackagePurpose: "RUNTIME",
			comment:
				"Bun-linked and binary-embedded components not represented by installed package metadata cannot be inferred by this inventory.",
		},
	];
	for (const dependency of runtime.packages) {
		packages.push({
			name: dependency.name,
			SPDXID: dependency.spdxId,
			versionInfo: dependency.version,
			downloadLocation: "NOASSERTION",
			filesAnalyzed: false,
			licenseConcluded: "NOASSERTION",
			licenseDeclared: dependency.license,
			copyrightText: "NOASSERTION",
			externalRefs: [
				{
					referenceCategory: "PACKAGE-MANAGER",
					referenceType: "purl",
					referenceLocator: `pkg:npm/${dependency.name}@${dependency.version}`,
				},
			],
		});
	}
	const relationships: RuntimeRelationship[] = [
		{
			spdxElementId: "SPDXRef-DOCUMENT",
			relationshipType: "DESCRIBES",
			relatedSpdxElement: applicationId,
		},
		{
			spdxElementId: applicationId,
			relationshipType: "CONTAINS",
			relatedSpdxElement: runtimeId,
		},
		...runtime.relationships,
	];
	relationships.sort(
		(left, right) =>
			left.spdxElementId.localeCompare(right.spdxElementId) ||
			left.relatedSpdxElement.localeCompare(right.relatedSpdxElement) ||
			left.relationshipType.localeCompare(right.relationshipType),
	);
	return {
		spdxVersion: "SPDX-2.3",
		dataLicense: "CC0-1.0",
		SPDXID: "SPDXRef-DOCUMENT",
		name: `${packageName}-${packageVersion}-${assetName}`,
		documentNamespace: `https://spdx.org/spdxdocs/${encodeURIComponent(packageName)}-${packageVersion}-${artifactSha256}`,
		comment:
			"Runtime inventory follows declared production dependencies and installed package metadata resolved against bun.lock. Bun-linked or binary-embedded components not represented by package metadata cannot be inferred.",
		creationInfo: {
			created: provenance.generated_at,
			creators: [`Tool: ${packageName}-release-stage-${packageVersion}`],
		},
		packages,
		relationships,
	};
}

export function writeReleaseSbomDraft({
	cwd: cwdOption,
	artifact: artifactOption,
}: WriteReleaseSbomDraftOptions = {}): WriteReleaseSbomDraftResult {
	const cwd = realpathSync(cwdOption ?? process.cwd());
	const artifact = resolveExistingReleaseArtifact(
		cwd,
		artifactOption ?? "dist/afol",
	);
	const provenancePath = `${artifact.artifactPath}.provenance.json`;
	if (!existsSync(provenancePath) || !lstatSync(provenancePath).isFile()) {
		throw new Error("missing release provenance");
	}
	const provenance = readPackageJson(provenancePath) as JsonRecord;
	const artifactSha256 = createHash("sha256")
		.update(readFileSync(artifact.artifactPath))
		.digest("hex");
	if (provenance.sha256 !== artifactSha256) {
		throw new Error("release provenance does not bind the artifact");
	}
	const lockPath = join(cwd, "bun.lock");
	if (!existsSync(lockPath) || !lstatSync(lockPath).isFile()) {
		throw new Error("missing Bun dependency lockfile");
	}
	const lockSha256 = createHash("sha256")
		.update(readFileSync(lockPath))
		.digest("hex");
	if (
		provenance.lockfile !== "bun.lock" ||
		provenance.lock_sha256 !== lockSha256
	) {
		throw new Error("release provenance does not bind the current bun.lock");
	}
	const sbom = buildReleaseSpdxSbom({
		cwd,
		assetName: artifact.artifact.split("/").at(-1) ?? "afol",
		artifactSha256,
		provenance: {
			package_name: requiredString(provenance.package_name, "package name"),
			version: requiredString(provenance.version, "package version"),
			bun: requiredString(provenance.bun, "Bun runtime version"),
			generated_at: requiredString(provenance.generated_at, "generated_at"),
			commit_sha: requiredString(provenance.commit_sha, "source commit"),
		},
	});
	const outputPath = join(artifact.distPath, "sbom.spdx.draft.json");
	try {
		const outputStat = lstatSync(outputPath);
		if (!outputStat.isFile() || outputStat.isSymbolicLink()) {
			throw new Error("SBOM review draft output is not a regular file");
		}
	} catch (error) {
		if (
			!error ||
			typeof error !== "object" ||
			!("code" in error) ||
			error.code !== "ENOENT"
		) {
			throw error;
		}
	}
	const draft = `${JSON.stringify(sbom, null, 2)}\n`;
	const outputTempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
	try {
		writeFileSync(outputTempPath, draft, { encoding: "utf8", flag: "wx" });
		renameSync(outputTempPath, outputPath);
	} finally {
		if (existsSync(outputTempPath)) rmSync(outputTempPath);
	}
	return {
		path: outputPath,
		sbomSha256: createHash("sha256").update(draft).digest("hex"),
		artifactSha256,
		packageCount: Array.isArray(sbom.packages) ? sbom.packages.length : 0,
	};
}

function main(args: string[]): void {
	let artifact: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] !== "--artifact") {
			throw new Error(`unknown SBOM draft option: ${args[index]}`);
		}
		const value = args[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error("missing value for --artifact");
		}
		artifact = value;
		index += 1;
	}
	const result = writeReleaseSbomDraft({ ...(artifact ? { artifact } : {}) });
	console.log(
		`SBOM review draft ready: ${relative(process.cwd(), result.path)} sha256=${result.sbomSha256} artifact_sha256=${result.artifactSha256} packages=${result.packageCount}; no compliance approval is asserted`,
	);
}

if (import.meta.main) main(process.argv.slice(2));
