import { lstatSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type SymlinkTestSupport = {
	available: boolean;
	reason: string;
};

function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

/** Detect real symlink support without changing any project state. */
export function detectSymlinkTestSupport(): SymlinkTestSupport {
	const root = mkdtempSync(join(tmpdir(), "afol-symlink-capability-"));
	const target = join(root, "target");
	const link = join(root, "link");
	try {
		symlinkSync(target, link, "dir");
		if (!lstatSync(link).isSymbolicLink()) {
			return {
				available: false,
				reason: "symlink creation did not produce a symbolic link",
			};
		}
		return { available: true, reason: "real symlink creation is available" };
	} catch (error) {
		const code = errorCode(error);
		if (
			process.platform === "win32" &&
			(code === "EPERM" || code === "EACCES" || code === "UNKNOWN")
		) {
			return {
				available: false,
				reason: `host denied symlink creation (${code}); enable Developer Mode or the symlink privilege for this lane`,
			};
		}
		throw error;
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

export const symlinkTestSupport = detectSymlinkTestSupport();

/** Detect a directory reparse-point capability for junction-specific tests. */
export function detectDirectoryReparseTestSupport(): SymlinkTestSupport {
	if (process.platform !== "win32") return symlinkTestSupport;
	const root = mkdtempSync(join(tmpdir(), "afol-junction-capability-"));
	const target = join(root, "target");
	const link = join(root, "link");
	try {
		symlinkSync(target, link, "junction");
		if (!lstatSync(link).isSymbolicLink()) {
			return {
				available: false,
				reason: "junction creation did not produce a directory reparse point",
			};
		}
		return { available: true, reason: "junction creation is available" };
	} catch (error) {
		const code = errorCode(error) ?? "unknown";
		return {
			available: false,
			reason: `host denied junction creation (${code})`,
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

export const directoryReparseTestSupport = detectDirectoryReparseTestSupport();
