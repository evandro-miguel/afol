import { expect, test } from "bun:test";
import {
	matchesJournalDate,
	utcOffsetSeconds,
} from "../services/evolution/journal-date";

test("recorded offsets preserve dates independently of current timezone rules", () => {
	expect(
		matchesJournalDate(
			"2026-08-07T03:05:00Z",
			"America/Asuncion",
			"2026-08-06",
			-14400,
		),
	).toBe(true);
	expect(
		matchesJournalDate(
			"2026-08-07T03:05:00Z",
			"America/Asuncion",
			"2026-08-07",
			-10800,
		),
	).toBe(true);
	expect(
		matchesJournalDate(
			"2026-08-07T03:05:00Z",
			"America/Asuncion",
			"2026-08-06",
			-10800,
		),
	).toBe(false);
	expect(() =>
		matchesJournalDate("2026-08-07T03:05:00Z", "UTC", "2026-08-07", NaN),
	).toThrow();
	expect(() =>
		matchesJournalDate("2026-08-07T03:05:00Z", "UTC", "2026-08-07", 90000),
	).toThrow();
	expect(utcOffsetSeconds(new Date("2026-01-01Z"), "Asia/Kathmandu")).toBe(
		20700,
	);
	expect(utcOffsetSeconds(new Date("2026-01-01Z"), "UTC")).toBe(0);
});

test("legacy compatibility is limited to historical Asuncion seasonal rules", () => {
	expect(
		matchesJournalDate(
			"2026-08-07T03:05:00Z",
			"America/Asuncion",
			"2026-08-06",
		),
	).toBe(true);
	expect(matchesJournalDate("2026-08-07T03:05:00Z", "UTC", "2026-08-06")).toBe(
		false,
	);
	expect(
		matchesJournalDate(
			"2026-01-07T03:05:00Z",
			"America/Asuncion",
			"2026-01-06",
		),
	).toBe(false);
	expect(
		matchesJournalDate(
			"2026-03-22T03:05:00Z",
			"America/Asuncion",
			"2026-03-21",
		),
	).toBe(true);
	expect(
		matchesJournalDate(
			"2026-10-04T03:05:00Z",
			"America/Asuncion",
			"2026-10-03",
		),
	).toBe(true);
	expect(
		matchesJournalDate(
			"2026-10-04T04:05:00Z",
			"America/Asuncion",
			"2026-10-03",
		),
	).toBe(false);
});
