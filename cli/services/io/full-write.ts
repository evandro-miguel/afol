import { writeSync } from "node:fs";

export type WriteBufferSync = (
	fd: number,
	buffer: Uint8Array,
	offset: number,
	length: number,
	position: number | null,
) => number;

export function writeBufferFullySync(
	fd: number,
	buffer: Uint8Array,
	write: WriteBufferSync = writeSync,
	startPosition: number | null = null,
): void {
	let offset = 0;
	while (offset < buffer.byteLength) {
		const position = startPosition === null ? null : startPosition + offset;
		const written = write(
			fd,
			buffer,
			offset,
			buffer.byteLength - offset,
			position,
		);
		if (!Number.isInteger(written) || written <= 0)
			throw new Error("file write made no progress");
		if (written > buffer.byteLength - offset)
			throw new Error("file write exceeded the requested byte count");
		offset += written;
	}
}
