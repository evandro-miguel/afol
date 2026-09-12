# Hop-count A/B winner table

Slice 1: scripted policies, no cli/** patches.

| Mark | mean hops | A-happy | kill | keep |
| --- | ---: | ---: | --- | --- |
| M0 | 3.33 | 3 | pass | keep |
| M1 | 3.33 | 3 | pass | reject |
| M2 | 3.22 | 3 | pass | keep |
| M3 | 3.11 | 3 | pass | keep |
| M4 | 3.11 | 3 | pass | keep |
| M5 | 3.22 | 3 | pass | keep |
| M6 | 3.22 | 3 | pass | keep |

## Per fixture hops

| Fixture | M0 | M1 | M2 | M3 | M4 | M5 | M6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A-dirty | 6 | 6 | 6 | 6 | 5 | 6 | 6 |
| A-ambiguous | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| A-help-flag | 3 | 3 | 2 | 3 | 3 | 3 | 3 |
| A-evidence | 3 | 3 | 3 | 1 | 3 | 3 | 3 |
| A-ls | 3 | 3 | 3 | 3 | 3 | 3 | 2 |
| A-verify | 3 | 3 | 3 | 3 | 3 | 2 | 3 |
| A-compact | 4 | 4 | 4 | 4 | 3 | 4 | 4 |
| A-qt-pending | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| A-happy | 3 | 3 | 3 | 3 | 3 | 3 | 3 |

Ties keep M0. No product patch in this slice; keep means candidate for a later residual.

## What moved hops

| Mark | Where hops fell vs M0 | A-happy |
| --- | --- | --- |
| M1 fast-help | no change in this scripted table | 3 |
| M2 help-parity | A-help-flag 3→2 | 3 |
| M3 collapse-hints | A-evidence 3→1 | 3 |
| M4 actionable status | A-dirty 6→5, A-compact 4→3 | 3 |
| M5 bound verify | A-verify 3→2 | 3 |
| M6 alias | A-ls 3→2 | 3 |

## Side findings (not a mark)

- `afol d T-01 -x true` does **not** authorize done: `true` is classified as a no-op execution command. Use `echo hop-ok` (or a real check). This is a hidden hop tax for agents that copy `-x true`.
- A-ambiguous `c` after a successful `d` still exited 2 (close/report), so hop traces stop at 4; fail-closed on bare `st` held for every mark.
- Slice 1 did not patch `cli/**`. Candidates above are policies to implement in a later residual, one mark at a time.

