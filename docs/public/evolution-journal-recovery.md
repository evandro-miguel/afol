# Evolution journal dates and recovery

Evolution analysis returns exit 1 and an error envelope with `data.status=blocked` when its input state is unavailable. An empty, healthy analysis remains successful. Use `afol evolve status --json` to distinguish invalid canonical source data from a missing or stale derived database.

When the canonical journal or referenced evidence is invalid, inspect and restore verified source data first. Rebuilding the database cannot repair its source. AFOL does not automatically rewrite historical journal events. The status recovery guidance is diagnostic text in this case, not an executable repair command.

New production-day events record `utc_offset_seconds` inside their hashed payload. Replay validates the stored date using that recorded offset, so a runtime timezone-data update does not reinterpret previously allocated days. Evidence provenance, source digests, project/timezone identity and the complete hash chain remain mandatory.

Older events without an offset retain current timezone validation. For `America/Asuncion` events from 2025 onward, replay also recognizes the seasonal interpretation used by [IANA tzdb 2024a](https://data.iana.org/time-zones/tzdb-2024a/southamerica): standard time starts on the Sunday on or after March 22, and summer time starts on the first Sunday of October. This bounded compatibility rule preserves existing event bytes and production-day ordinals; it does not accept arbitrary date differences. Unknown legacy timezone changes still fail closed and require diagnosis.

The CLI root-help budget is 550 estimated output tokens (bytes divided by four, rounded up). The help test and builtin token-economy scenario enforce the same cap. `afol help <command>` and `<command> --help` use the command registry, including the active-session fast paths.
