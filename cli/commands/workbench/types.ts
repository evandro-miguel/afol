import type { NewWorkstreamMetadata } from "../../services/workbench/lifecycle";

export type VerificationSpec =
	| { mode: "argv"; executable: string; args: string[] }
	| { mode: "shell"; command: string };

export type SessionTaskArgs = {
	session: string;
	taskId: string;
};

export type SessionTaskBatchArgs = SessionTaskArgs & {
	taskIds: string[];
};

export type SessionTaskJsonArgs = SessionTaskBatchArgs & {
	json: boolean;
	compact: boolean;
	brief: boolean;
	briefMode: "compact" | "full" | null;
};

export type EvidenceArgs = SessionTaskArgs & {
	command: string;
	result: string;
	artifact?: string;
	note?: string;
	json?: boolean;
};

export type DoneArgs = SessionTaskBatchArgs & {
	testCommands: string[];
	testShellCommand: string | null;
	verifications: VerificationSpec[];
	verificationTimeoutMs: number;
	evidenceCommand: string | null;
	evidenceResult: string | null;
	requireSpecCheck: boolean;
	artifact?: string;
	note?: string;
	json: boolean;
};

export type NewCommandArgs = {
	theme: string;
	metadata: NewWorkstreamMetadata;
	json: boolean;
};

export type CloseArgs = {
	session: string;
	json: boolean;
	allowNoReport: boolean;
	carryOpen: boolean;
	reason: string;
	summary: string;
	admitLegacyBaseline: boolean;
};

export type LogArgs = {
	session: string;
	message: string;
	json: boolean;
};

export type VerifyArgs = {
	sessionPath: string;
	strict: boolean;
	json: boolean;
	verbose: boolean;
};
