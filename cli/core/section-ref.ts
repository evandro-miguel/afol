export type SectionRef = {
	domain: "adm" | "pstr" | "wb" | "memory" | "library" | "spec" | "adr";
	path: string;
	section?: string;
	anchor?: string;
};

export function parseSectionRef(ref: string): SectionRef | null {
	const colonIndex = ref.indexOf(":");
	if (colonIndex < 1) return null;

	const domain = ref.slice(0, colonIndex);
	const validDomains = [
		"adm",
		"pstr",
		"wb",
		"memory",
		"library",
		"spec",
		"adr",
	];
	if (!validDomains.includes(domain)) return null;

	let rest = ref.slice(colonIndex + 1);
	let section: string | undefined;
	let anchor: string | undefined;

	const atIndex = rest.indexOf("@");
	if (atIndex >= 0) {
		anchor = rest.slice(atIndex + 1);
		rest = rest.slice(0, atIndex);
	}

	const hashIndex = rest.indexOf("#");
	if (hashIndex >= 0) {
		section = rest.slice(hashIndex + 1);
		rest = rest.slice(0, hashIndex);
	}

	if (!rest) return null;

	return {
		domain: domain as SectionRef["domain"],
		path: rest,
		...(section ? { section } : {}),
		...(anchor ? { anchor } : {}),
	};
}

export function formatSectionRef(ref: SectionRef): string {
	let result = `${ref.domain}:${ref.path}`;
	if (ref.section) result += `#${ref.section}`;
	if (ref.anchor) result += `@${ref.anchor}`;
	return result;
}
