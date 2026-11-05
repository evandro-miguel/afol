import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { boundedSpawn } from "../../core/subprocess";
import { resolveProjectPath } from "../project/root";
import { isNoopExecutionCommand } from "../workbench/verify";

const SHA256_RE = /^[a-f0-9]{64}$/i;
const COMMIT_RE = /^[a-f0-9]{40}$/i;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_CHECKS = 8;
const MAX_ARTIFACTS = 64;
const MAX_ARGV = 64;
const MAX_ARG_LENGTH = 4_096;
const MAX_ARTIFACT_PATH_LENGTH = 512;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const CHECK_TIMEOUT_MS = 30_000;
const MAX_CHECK_BUDGET_MS = 60_000;
const GIT_TIMEOUT_MS = 15_000;

const SENSITIVE_SEGMENT_PATTERNS = [
	/^\.env(?:\.|$)/,
	/(?:^|[-_\s.])chaves?(?:[-_\s.]|$)/,
	/(?:^|[-_\s.])credentials?(?:[-_\s.]|$)/,
	/(?:^|[-_\s.])enderecos?(?:[-_\s.]|$)/,
	/(?:^|[-_\s.])keys?(?:[-_\s.]|$)/,
	/^secrets?(?:\.|$)/,
	/(?:^|[-_\s.])senhas?(?:[-_\s.]|$)/,
];

export interface AcceptanceCheck {
	id: string;
	argv: string[];
}

export interface AcceptanceContract {
	checks: AcceptanceCheck[];
	artifacts: string[];
}

export type AcceptanceCheckResult = {
	id: string;
	exit_code: number | null;
	duration_ms: number;
	status: "passed" | "failed" | "blocked";
};

export type BenchmarkAcceptanceResult = {
	passed: boolean;
	notes: string[];
	checks: AcceptanceCheckResult[];
};

type AcceptanceEvidence = {
	source_commit: string;
	contract_sha256: string;
	artifacts: Array<{ path: string; sha256: string }>;
};

type PreparedArtifact = {
	path: string;
	sha256: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
	throw new Error(message);
}

function requiredString(
	value: unknown,
	label: string,
	maxLength: number,
): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > maxLength ||
		value.trim() !== value ||
		value.includes("\u0000")
	) {
		fail(`Invalid ${label}.`);
	}
	return value;
}

function validateArtifactPath(value: unknown, label: string): string {
	const path = requiredString(value, label, MAX_ARTIFACT_PATH_LENGTH);
	if (
		isAbsolute(path) ||
		/^[A-Za-z]:[\\/]/.test(path) ||
		path.includes("\\") ||
		path.startsWith("/")
	) {
		fail(`Invalid ${label}: path must be relative and use '/'.`);
	}
	const parts = path.split("/");
	if (
		parts.length === 0 ||
		parts.some((part) => part.length === 0 || part === "." || part === "..")
	) {
		fail(`Invalid ${label}: path is not canonical.`);
	}
	return path;
}

function validateArgv(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ARGV) {
		fail(`Invalid ${label}: argv must be a bounded nonempty array.`);
	}
	const argv = value.map((argument, index) =>
		requiredString(argument, `${label}[${index}]`, MAX_ARG_LENGTH),
	);
	if (argv[0]?.trim().length === 0) {
		fail(`Invalid ${label}: executable is empty.`);
	}
	return argv;
}

function ensureOnlyKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
	label: string,
): void {
	const allowedSet = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!allowedSet.has(key))
			fail(`Invalid ${label}: unexpected property ${key}.`);
	}
}

/** Parse and bound the operator-owned acceptance contract. */
export function parseAcceptanceContract(value: unknown): AcceptanceContract {
	if (!isRecord(value)) fail("Acceptance contract must be an object.");
	ensureOnlyKeys(value, ["checks", "artifacts"], "acceptance contract");

	if (
		!Array.isArray(value.checks) ||
		value.checks.length === 0 ||
		value.checks.length > MAX_CHECKS
	) {
		fail("Acceptance contract checks must be a bounded nonempty array.");
	}
	if (
		!Array.isArray(value.artifacts) ||
		value.artifacts.length === 0 ||
		value.artifacts.length > MAX_ARTIFACTS
	) {
		fail("Acceptance contract artifacts must be a bounded nonempty array.");
	}

	const ids = new Set<string>();
	const checks = value.checks.map((entry, index) => {
		if (!isRecord(entry)) fail(`Invalid acceptance check at index ${index}.`);
		ensureOnlyKeys(entry, ["id", "argv"], `acceptance check ${index}`);
		const id = requiredString(entry.id, `acceptance check ${index} id`, 128);
		if (!ID_RE.test(id)) fail(`Invalid acceptance check id: ${id}.`);
		if (ids.has(id)) fail(`Duplicate acceptance check id: ${id}.`);
		ids.add(id);
		return {
			id,
			argv: validateArgv(entry.argv, `acceptance check ${index} argv`),
		};
	});

	const artifactPaths = new Set<string>();
	const artifacts = value.artifacts.map((entry, index) => {
		const path = validateArtifactPath(entry, `acceptance artifact ${index}`);
		if (artifactPaths.has(path))
			fail(`Duplicate acceptance artifact path: ${path}.`);
		artifactPaths.add(path);
		return path;
	});

	return { checks, artifacts };
}

function canonicalContract(contract: AcceptanceContract): string {
	return JSON.stringify({
		checks: contract.checks.map((check) => ({
			id: check.id,
			argv: [...check.argv],
		})),
		artifacts: [...contract.artifacts].sort(),
	});
}

export function acceptanceContractDigest(contract: AcceptanceContract): string {
	const parsed = parseAcceptanceContract(contract);
	return createHash("sha256")
		.update(canonicalContract(parsed), "utf8")
		.digest("hex");
}

function parseAcceptanceEvidence(value: unknown): AcceptanceEvidence {
	if (!isRecord(value)) fail("Acceptance evidence must be an object.");
	const sourceCommit = requiredString(value.source_commit, "source_commit", 40);
	if (!COMMIT_RE.test(sourceCommit))
		fail("source_commit must be a full commit hash.");
	const contractSha = requiredString(
		value.contract_sha256,
		"contract_sha256",
		64,
	);
	if (!SHA256_RE.test(contractSha))
		fail("contract_sha256 must be a SHA-256 digest.");
	if (!Array.isArray(value.artifacts))
		fail("Acceptance evidence artifacts must be an array.");
	if (value.artifacts.length === 0 || value.artifacts.length > MAX_ARTIFACTS)
		fail("Acceptance evidence artifacts must be bounded and nonempty.");
	const paths = new Set<string>();
	const artifacts = value.artifacts.map((entry, index) => {
		if (!isRecord(entry))
			fail(`Invalid acceptance evidence artifact ${index}.`);
		ensureOnlyKeys(
			entry,
			["path", "sha256"],
			`acceptance evidence artifact ${index}`,
		);
		const path = validateArtifactPath(
			entry.path,
			`acceptance evidence artifact ${index} path`,
		);
		if (paths.has(path))
			fail(`Duplicate acceptance evidence artifact path: ${path}.`);
		paths.add(path);
		const sha256 = requiredString(
			entry.sha256,
			`acceptance evidence artifact ${index} sha256`,
			64,
		);
		if (!SHA256_RE.test(sha256))
			fail(`Acceptance evidence artifact ${index} sha256 is invalid.`);
		return { path, sha256: sha256.toLowerCase() };
	});
	return {
		source_commit: sourceCommit.toLowerCase(),
		contract_sha256: contractSha.toLowerCase(),
		artifacts,
	};
}

function sensitiveArtifactPath(path: string): boolean {
	return path.split("/").some((segment) => {
		const normalized = segment.toLowerCase();
		return (
			normalized === ".git" ||
			normalized === ".ssh" ||
			SENSITIVE_SEGMENT_PATTERNS.some((pattern) => pattern.test(normalized))
		);
	});
}

function resolveRegularArtifact(root: string, path: string): string {
	if (sensitiveArtifactPath(path))
		fail(`Acceptance artifact path is sensitive: ${path}.`);
	const resolved = resolveProjectPath(root, path);
	if (!resolved.ok) fail(resolved.error);
	const rootReal = realpathSync(root);
	const absolutePath = resolve(resolved.value.path);
	if (
		resolved.value.relativePath !== path ||
		!isInsideRoot(rootReal, absolutePath)
	) {
		fail(`Acceptance artifact path is outside the project: ${path}.`);
	}

	let current = rootReal;
	for (const segment of path.split("/")) {
		current = join(current, segment);
		const entry = lstatSync(current);
		if (entry.isSymbolicLink())
			fail(`Acceptance artifact path uses a symlink: ${path}.`);
	}
	const entry = lstatSync(absolutePath);
	if (!entry.isFile())
		fail(`Acceptance artifact is not a regular file: ${path}.`);
	if (entry.size > MAX_ARTIFACT_BYTES)
		fail(`Acceptance artifact exceeds the size limit: ${path}.`);
	return absolutePath;
}

function isInsideRoot(root: string, target: string): boolean {
	const path = relative(root, target);
	return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function hashFile(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readHead(root: string): string {
	let result: ReturnType<typeof boundedSpawn>;
	try {
		result = boundedSpawn("git", ["rev-parse", "--verify", "HEAD"], {
			cwd: root,
			timeoutMs: GIT_TIMEOUT_MS,
			maxBuffer: 256,
		});
	} catch (error) {
		fail(`Cannot read project HEAD: ${(error as Error).message}`);
	}
	if (!result.ok || result.timedOut || result.status !== 0)
		fail(
			`Cannot read project HEAD: ${
				result.timedOut
					? "timed out"
					: result.spawnError
						? "unavailable"
						: "failed"
			}.`,
		);
	const head = result.stdout.trim().toLowerCase();
	if (!COMMIT_RE.test(head)) fail("Project HEAD is not a full commit hash.");
	return head;
}

function blockedChecks(contract: AcceptanceContract): AcceptanceCheckResult[] {
	return contract.checks.map((check) => ({
		id: check.id,
		exit_code: null,
		duration_ms: 0,
		status: "blocked",
	}));
}

function evidenceFailure(
	contract: AcceptanceContract,
	notes: string[],
): BenchmarkAcceptanceResult {
	return { passed: false, notes, checks: blockedChecks(contract) };
}

function artifactSetMatches(
	contract: AcceptanceContract,
	evidence: AcceptanceEvidence,
): boolean {
	if (contract.artifacts.length !== evidence.artifacts.length) return false;
	const expected = new Set(contract.artifacts);
	return evidence.artifacts.every((artifact) => expected.has(artifact.path));
}

function prepareArtifacts(
	root: string,
	contract: AcceptanceContract,
	evidence: AcceptanceEvidence,
	notes: string[],
): PreparedArtifact[] {
	const evidenceByPath = new Map(
		evidence.artifacts.map((artifact) => [artifact.path, artifact.sha256]),
	);
	const prepared: PreparedArtifact[] = [];
	for (const path of contract.artifacts) {
		try {
			const absolutePath = resolveRegularArtifact(root, path);
			const sha256 = hashFile(absolutePath);
			const claimed = evidenceByPath.get(path);
			if (!claimed || claimed !== sha256) {
				notes.push(`acceptance-artifact-digest-mismatch:${path}`);
				continue;
			}
			prepared.push({ path, sha256 });
		} catch (error) {
			notes.push(
				`acceptance-artifact-invalid:${path}:${(error as Error).message}`,
			);
		}
	}
	return prepared;
}

function verifyPreparedArtifacts(
	root: string,
	prepared: PreparedArtifact[],
	notes: string[],
	prefix: string,
): boolean {
	let valid = true;
	for (const artifact of prepared) {
		try {
			const current = resolveRegularArtifact(root, artifact.path);
			const sha256 = hashFile(current);
			if (sha256 !== artifact.sha256) {
				notes.push(`${prefix}:${artifact.path}`);
				valid = false;
			}
		} catch {
			notes.push(`${prefix}:${artifact.path}`);
			valid = false;
		}
	}
	return valid;
}

function verifyCheckBoundary(
	root: string,
	head: string,
	prepared: PreparedArtifact[],
	notes: string[],
	prefix: string,
): boolean {
	let valid = true;
	try {
		if (readHead(root) !== head) {
			notes.push("acceptance-source-commit-changed");
			valid = false;
		}
	} catch {
		notes.push("acceptance-source-commit-recheck-unavailable");
		valid = false;
	}
	return verifyPreparedArtifacts(root, prepared, notes, prefix) && valid;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function isNoopArgv(argv: string[]): boolean {
	return isNoopExecutionCommand(argv.map(shellQuote).join(" "));
}

type CheckRun = AcceptanceCheckResult & {
	reason?: "timeout" | "unavailable";
};

function runCheck(
	root: string,
	check: AcceptanceCheck,
	timeoutMs: number,
): CheckRun {
	const startedAt = performance.now();
	if (isNoopArgv(check.argv)) {
		return {
			id: check.id,
			exit_code: null,
			duration_ms: 0,
			status: "blocked",
		};
	}
	const [command, ...args] = check.argv;
	if (!command) {
		return {
			id: check.id,
			exit_code: null,
			duration_ms: 0,
			status: "blocked",
		};
	}
	try {
		const result = boundedSpawn(command, args, {
			cwd: root,
			timeoutMs,
			maxBuffer: 1024 * 1024,
		});
		const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
		if (result.timedOut || result.spawnError) {
			return {
				id: check.id,
				exit_code: result.status,
				duration_ms: durationMs,
				status: "blocked",
				reason: result.timedOut ? "timeout" : "unavailable",
			};
		}
		return {
			id: check.id,
			exit_code: result.status,
			duration_ms: durationMs,
			status: result.ok && result.status === 0 ? "passed" : "failed",
		};
	} catch {
		return {
			id: check.id,
			exit_code: null,
			duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
			status: "blocked",
			reason: "unavailable",
		};
	}
}

/**
 * Verify receipt provenance and run only the deterministic checks declared by
 * the operator-owned contract. Receipt fields never supply commands.
 */
export function evaluateBenchmarkAcceptance(
	root: string,
	contract: AcceptanceContract | undefined,
	receipt: unknown,
): BenchmarkAcceptanceResult {
	if (contract === undefined) {
		return {
			passed: false,
			notes: ["acceptance-contract-missing"],
			checks: [],
		};
	}

	let parsedContract: AcceptanceContract;
	try {
		parsedContract = parseAcceptanceContract(contract);
	} catch (error) {
		return {
			passed: false,
			notes: [`acceptance-contract-invalid:${(error as Error).message}`],
			checks: [],
		};
	}

	let evidence: AcceptanceEvidence;
	try {
		evidence = parseAcceptanceEvidence(receipt);
	} catch (error) {
		return evidenceFailure(parsedContract, [
			`acceptance-receipt-invalid:${(error as Error).message}`,
		]);
	}

	const notes: string[] = [];
	let head: string;
	try {
		head = readHead(root);
	} catch (error) {
		return evidenceFailure(parsedContract, [
			`acceptance-source-commit-unavailable:${(error as Error).message}`,
		]);
	}
	if (evidence.source_commit !== head) {
		return evidenceFailure(parsedContract, [
			"acceptance-source-commit-mismatch",
		]);
	}
	if (evidence.contract_sha256 !== acceptanceContractDigest(parsedContract)) {
		return evidenceFailure(parsedContract, [
			"acceptance-contract-digest-mismatch",
		]);
	}
	if (!artifactSetMatches(parsedContract, evidence)) {
		return evidenceFailure(parsedContract, [
			"acceptance-artifact-set-mismatch",
		]);
	}

	const prepared = prepareArtifacts(root, parsedContract, evidence, notes);
	if (notes.length > 0 || prepared.length !== parsedContract.artifacts.length) {
		return evidenceFailure(parsedContract, notes);
	}

	const actualChecks = parsedContract.checks.filter(
		(check) => !isNoopArgv(check.argv),
	);
	if (actualChecks.length === 0) {
		return evidenceFailure(
			parsedContract,
			parsedContract.checks.map((check) => `acceptance-check-noop:${check.id}`),
		);
	}

	const checks: AcceptanceCheckResult[] = [];
	const checkStartedAt = performance.now();
	for (const check of parsedContract.checks) {
		if (
			!verifyCheckBoundary(
				root,
				head,
				prepared,
				notes,
				"acceptance-artifact-changed-before-check",
			)
		) {
			notes.push(`acceptance-check-blocked-before:${check.id}`);
			checks.push({
				id: check.id,
				exit_code: null,
				duration_ms: 0,
				status: "blocked",
			});
			break;
		}
		if (isNoopArgv(check.argv)) {
			checks.push({
				id: check.id,
				exit_code: null,
				duration_ms: 0,
				status: "blocked",
			});
			notes.push(`acceptance-check-noop:${check.id}`);
			break;
		}
		const elapsedMs = performance.now() - checkStartedAt;
		const remainingMs = Math.floor(MAX_CHECK_BUDGET_MS - elapsedMs);
		if (remainingMs <= 0) {
			checks.push({
				id: check.id,
				exit_code: null,
				duration_ms: 0,
				status: "blocked",
			});
			notes.push(`acceptance-check-timeout:${check.id}`);
			break;
		}
		const result = runCheck(
			root,
			check,
			Math.min(CHECK_TIMEOUT_MS, remainingMs),
		);
		checks.push({
			id: result.id,
			exit_code: result.exit_code,
			duration_ms: result.duration_ms,
			status: result.status,
		});
		if (result.status === "blocked") {
			if (result.reason === "timeout")
				notes.push(`acceptance-check-timeout:${check.id}`);
			else notes.push(`acceptance-check-unavailable:${check.id}`);
		} else if (result.status === "failed") {
			notes.push(
				`acceptance-check-failed:${check.id}:exit:${result.exit_code ?? "null"}`,
			);
		}
		const afterCheckValid = verifyCheckBoundary(
			root,
			head,
			prepared,
			notes,
			"acceptance-artifact-changed-after-check",
		);
		if (result.status !== "passed" || !afterCheckValid) break;
	}
	while (checks.length < parsedContract.checks.length) {
		const check = parsedContract.checks[checks.length];
		if (!check) break;
		checks.push({
			id: check.id,
			exit_code: null,
			duration_ms: 0,
			status: "blocked",
		});
	}

	verifyCheckBoundary(
		root,
		head,
		prepared,
		notes,
		"acceptance-artifact-changed",
	);

	return {
		passed:
			notes.length === 0 &&
			checks.length > 0 &&
			checks.every((check) => check.status === "passed"),
		notes,
		checks,
	};
}
