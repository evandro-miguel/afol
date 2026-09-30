const SECRET_KEY =
	/(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie|set-cookie|sessionid|private[_-]?key)/i;

export type TextRedactionSpan = { start: number; end: number };

const TEXT_REDACTION_RULES: ReadonlyArray<{
	pattern: RegExp;
	group: number;
	replacement: string;
}> = [
	{
		pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+:[^/@\s]+)(@)/gi,
		group: 2,
		replacement: "$1<redacted>$3",
	},
	{
		pattern:
			/("|')(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie|set-cookie|sessionid|private[_-]?key)\1\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,}\]\s]+)/gi,
		group: 3,
		replacement: '$1$2$1:"<redacted>"',
	},
	{
		pattern: /\b(cookie|set-cookie)\s*[:=]\s*([^\r\n]+)/gi,
		group: 2,
		replacement: "$1=<redacted>",
	},
	{
		pattern: /\b(authorization)\s*[:=]\s*(?:bearer\s+)?([^\s,;]+)/gi,
		group: 2,
		replacement: "$1=<redacted>",
	},
	{
		pattern: /\b(bearer)\s+([^\s,;]+)/gi,
		group: 2,
		replacement: "$1 <redacted>",
	},
	{
		pattern: /\b(basic|digest)\s+([^\s,;]+)/gi,
		group: 2,
		replacement: "$1 <redacted>",
	},
	{
		pattern:
			/(--(?:api[_-]?key|access[_-]?token|authorization|password|secret|token))\s+([^\s,;]+)/gi,
		group: 2,
		replacement: "$1 <redacted>",
	},
	{
		pattern:
			/([?&](?:api[_-]?key|access[_-]?token|authorization|password|secret|token|cookie|sessionid)=)([^&#\s]+)/gi,
		group: 2,
		replacement: "$1<redacted>",
	},
	{
		pattern:
			/\b(api[_ -]?key|access[_ -]?token|authorization|password|secret|token|sessionid)\s*[:=]\s*([^\s,;]+)/gi,
		group: 2,
		replacement: "$1=<redacted>",
	},
	{
		pattern: /\b(sk-[A-Za-z0-9_-]{12,})\b/gi,
		group: 1,
		replacement: "<redacted>",
	},
];

/** Exact UTF-16 source spans matched by the shared text redaction rules. */
export function importedTextRedactionSpans(value: string): TextRedactionSpan[] {
	const spans: TextRedactionSpan[] = [];
	for (const { pattern, group } of TEXT_REDACTION_RULES) {
		const indexed = new RegExp(pattern.source, `${pattern.flags}d`);
		for (const match of value.matchAll(indexed)) {
			const span = match.indices?.[group];
			if (span && span[1] > span[0])
				spans.push({ start: span[0], end: span[1] });
		}
	}
	spans.sort((left, right) => left.start - right.start || left.end - right.end);
	const merged: TextRedactionSpan[] = [];
	for (const span of spans) {
		const previous = merged.at(-1);
		if (previous && span.start <= previous.end)
			previous.end = Math.max(previous.end, span.end);
		else merged.push({ ...span });
	}
	return merged;
}

function redactText(value: string): string {
	return TEXT_REDACTION_RULES.reduce(
		(text, rule) =>
			text.replace(
				new RegExp(rule.pattern.source, rule.pattern.flags),
				rule.replacement,
			),
		value,
	);
}

export function redactImported(value: unknown, depth = 0): unknown {
	if (depth > 20) return "<redacted-depth>";
	if (typeof value === "string") return redactText(value);
	if (Array.isArray(value))
		return value.map((entry) => redactImported(entry, depth + 1));
	if (value && typeof value === "object") {
		const output: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			output[key] = SECRET_KEY.test(key)
				? "<redacted>"
				: redactImported(item, depth + 1);
		}
		return output;
	}
	return value;
}

export function redactImportedPath(path: string): string {
	void path;
	return "<redacted-local-source>";
}
