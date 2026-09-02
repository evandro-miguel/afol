import type { Database } from "bun:sqlite";
import {
	closeSync,
	constants as fsConstants,
	openSync,
	readSync,
} from "node:fs";
import { assertSafeEvolutionTarget } from "./db";

const MAX_TAIL_BYTES = 65_536;
const KINDS = new Set(["observation", "receipt", "apply", "evaluation"]);
type TailReader = (
	fd: number,
	buffer: Buffer,
	offset: number,
	length: number,
	position: number,
) => number;

export function readExactTailBytes(
	fd: number,
	buffer: Buffer,
	position: number,
	incompleteMessage: string,
	readBytes: TailReader = readSync,
): void {
	let offset = 0;
	while (offset < buffer.length) {
		const bytesRead = readBytes(
			fd,
			buffer,
			offset,
			buffer.length - offset,
			position + offset,
		);
		if (
			!Number.isInteger(bytesRead) ||
			bytesRead <= 0 ||
			bytesRead > buffer.length - offset
		)
			throw new Error(incompleteMessage);
		offset += bytesRead;
	}
}

function metadataKey(kind: string): string {
	if (!KINDS.has(kind))
		throw new Error("unknown evolution projection watermark");
	return `${kind}_journal_watermark`;
}

export function journalTailFingerprint(
	path: string,
): { size: number; tail_digest: string } | null {
	const stat = assertSafeEvolutionTarget(path, "evolution journal watermark");
	if (!stat) return null;
	if (stat.size <= 0) return { size: 0, tail_digest: "GENESIS" };
	const length = Math.min(Number(stat.size), MAX_TAIL_BYTES);
	const buffer = Buffer.alloc(length);
	const fd = openSync(
		path,
		fsConstants.O_RDONLY |
			(process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW),
	);
	try {
		readExactTailBytes(
			fd,
			buffer,
			Number(stat.size) - length,
			"evolution journal watermark read was incomplete",
		);
	} finally {
		closeSync(fd);
	}
	const lines = buffer.toString("utf8").trimEnd().split("\n");
	if (stat.size > MAX_TAIL_BYTES && lines.length < 2)
		throw new Error("evolution journal tail exceeds watermark bound");
	const tail = JSON.parse(lines.at(-1) ?? "null") as {
		event_digest?: unknown;
	} | null;
	if (!tail || !/^[a-f0-9]{64}$/.test(String(tail.event_digest ?? "")))
		throw new Error("evolution journal tail digest is invalid");
	return { size: Number(stat.size), tail_digest: String(tail.event_digest) };
}

export function writeProjectionWatermark(
	db: Database,
	kind: "observation" | "receipt" | "apply" | "evaluation",
	path: string,
): void {
	const current = journalTailFingerprint(path);
	if (!current)
		throw new Error("evolution journal watermark source is missing");
	db.query(
		"INSERT INTO evolution_metadata(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
	).run(metadataKey(kind), JSON.stringify(current));
}

export function clearProjectionWatermark(
	db: Database,
	kind: "observation" | "receipt" | "apply" | "evaluation",
): void {
	db.query("DELETE FROM evolution_metadata WHERE key = ?").run(
		metadataKey(kind),
	);
}

export function assertProjectionWatermark(
	db: Database,
	kind: "observation" | "receipt" | "apply" | "evaluation",
	path: string,
	required: boolean,
): void {
	const current = journalTailFingerprint(path);
	const row = db
		.query("SELECT value FROM evolution_metadata WHERE key = ?")
		.get(metadataKey(kind)) as { value?: unknown } | null;
	if (!current && !row && !required) return;
	if (!current || !row)
		throw new Error(`evolution ${kind} projection watermark is missing`);
	let stored: unknown;
	try {
		stored = JSON.parse(String(row.value ?? ""));
	} catch {
		throw new Error(`evolution ${kind} projection watermark is invalid`);
	}
	if (JSON.stringify(stored) !== JSON.stringify(current))
		throw new Error(`evolution ${kind} projection watermark differs`);
}
