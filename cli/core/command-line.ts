export function splitCommandLine(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let tokenStarted = false;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index] ?? "";
		if (quote !== "'" && char === "\\") {
			let quoteIndex = index;
			while (command[quoteIndex] === "\\") quoteIndex += 1;
			if (command[quoteIndex] === '"') {
				const slashCount = quoteIndex - index;
				current += "\\".repeat(Math.floor(slashCount / 2));
				tokenStarted = true;
				if (slashCount % 2 === 0) {
					quote = quote === '"' ? null : '"';
				} else {
					current += '"';
				}
				index = quoteIndex;
				continue;
			}
		}
		if (quote) {
			if (char === quote) {
				quote = null;
				continue;
			}
			current += char;
			tokenStarted = true;
			continue;
		}
		if (char === "\\") {
			const next = command[index + 1] ?? "";
			if (next && (/\s/.test(next) || next === '"' || next === "'")) {
				current += next;
				tokenStarted = true;
				index += 1;
				continue;
			}
			current += char;
			tokenStarted = true;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			tokenStarted = true;
			continue;
		}
		if (/\s/.test(char)) {
			if (tokenStarted) {
				tokens.push(current);
				current = "";
				tokenStarted = false;
			}
			continue;
		}
		current += char;
		tokenStarted = true;
	}
	if (quote) {
		throw new Error("Unclosed quote in --test command.");
	}
	if (tokenStarted) {
		tokens.push(current);
	}
	return tokens;
}
