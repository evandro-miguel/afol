export type StateBoardTaskRow = {
	taskId: string;
	state: string;
	owner: string;
	notes: string;
};

function isMarkdownPipeDelimiter(body: string, index: number): boolean {
	let backslashCount = 0;
	for (let cursor = index - 1; cursor >= 0 && body[cursor] === "\\"; cursor--) {
		backslashCount++;
	}
	return backslashCount % 2 === 0;
}

/** Parse a Markdown table row while retaining escaped pipes in cell values. */
export function parseMarkdownTableCells(line: string): string[] | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("|")) return null;
	let body = trimmed.slice(1);
	if (body.endsWith("|") && isMarkdownPipeDelimiter(body, body.length - 1)) {
		body = body.slice(0, -1);
	}
	const cells: string[] = [];
	let cell = "";
	for (let index = 0; index < body.length; index++) {
		if (body[index] === "|" && isMarkdownPipeDelimiter(body, index)) {
			cells.push(cell.trim());
			cell = "";
			continue;
		}
		cell += body[index];
	}
	cells.push(cell.trim());
	return cells;
}

export function parseStateBoardTaskRow(line: string): StateBoardTaskRow | null {
	const cells = parseMarkdownTableCells(line);
	if (
		cells?.length !== 4 ||
		!/^T-\d{2,3}$/.test(cells[0] ?? "") ||
		!(cells[1] ?? "")
	) {
		return null;
	}
	return {
		taskId: cells[0] ?? "",
		state: cells[1] ?? "",
		owner: cells[2] ?? "",
		notes: cells[3] ?? "",
	};
}
