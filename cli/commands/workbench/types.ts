import type { NewWorkstreamMetadata } from "../../services/workbench/lifecycle";

export type SessionTaskArgs = {
	session: string;
	taskId: string;
};

export type SessionTaskJsonArgs = SessionTaskArgs & {
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

export type DoneArgs = SessionTaskArgs & {
	testCommand: string | null;
	testShellCommand: string | null;
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
	reason: string;
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
};
