import { localDateForTimezone } from "./config";

export function utcOffsetSeconds(date: Date, timezone: string): number {
	const name = new Intl.DateTimeFormat("en", {
		timeZone: timezone,
		timeZoneName: "longOffset",
	})
		.formatToParts(date)
		.find((part) => part.type === "timeZoneName")?.value;
	if (name === "GMT") return 0;
	const match = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(name ?? "");
	if (!match) throw new Error("production-day timezone offset unavailable");
	return (
		(match[1] === "-" ? -1 : 1) *
		(Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? 0))
	);
}

function dateAtOffset(date: Date, offset: number): string {
	if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 3600)
		throw new Error("invalid production-day journal UTC offset");
	return new Date(date.getTime() + offset * 1000).toISOString().slice(0, 10);
}

export function matchesJournalDate(
	createdAt: string,
	timezone: string,
	localDate: string,
	offset?: number,
): boolean {
	const date = new Date(createdAt);
	if (offset !== undefined) return localDate === dateAtOffset(date, offset);
	if (localDate === localDateForTimezone(date, timezone)) return true;
	// Legacy writers used tzdb 2024a: Para Mar Sun>=22 00:00 and Oct Sun>=1 00:00.
	// https://data.iana.org/time-zones/tzdb-2024a/southamerica
	// Only offset-less Asuncion records can use this historical interpretation.
	if (timezone !== "America/Asuncion" || date.getUTCFullYear() < 2025)
		return false;
	const year = date.getUTCFullYear();
	const sunday = (month: number, day: number, utcHour: number) =>
		Date.UTC(
			year,
			month,
			day + ((7 - new Date(Date.UTC(year, month, day)).getUTCDay()) % 7),
			utcHour,
		);
	const winter =
		date.getTime() >= sunday(2, 22, 3) && date.getTime() < sunday(9, 1, 4);
	return localDate === dateAtOffset(date, (winter ? -4 : -3) * 3600);
}
