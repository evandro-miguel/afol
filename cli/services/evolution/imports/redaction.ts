const SECRET_KEY =
	/(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie|set-cookie|private[_-]?key)/i;

function redactText(value: string): string {
	return value
		.replace(
			/\b(authorization)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi,
			"$1=<redacted>",
		)
		.replace(/\b(bearer)\s+[^\s,;]+/gi, "$1 <redacted>")
		.replace(/\b( basic|digest)\s+[^\s,;]+/gi, "$1 <redacted>")
		.replace(
			/(--(?:api[_-]?key|access[_-]?token|authorization|password|secret|token))\s+[^\s,;]+/gi,
			"$1 <redacted>",
		)
		.replace(
			/([?&](?:api[_-]?key|access[_-]?token|authorization|password|secret|token)=)[^&#\s]+/gi,
			"$1<redacted>",
		)
		.replace(
			/\b(api[_ -]?key|access[_-]?token|authorization|password|secret|token)\s*[:=]\s*[^\s,;]+/gi,
			"$1=<redacted>",
		)
		.replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "<redacted>");
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
