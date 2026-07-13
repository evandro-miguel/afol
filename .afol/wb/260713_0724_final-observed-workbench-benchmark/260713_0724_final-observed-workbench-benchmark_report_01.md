# Report: 260713_0724_final-observed-workbench-benchmark

## Summary
Observed workbench-parity benchmark passed 8/8 scenarios; short-path p50 65-70 ms, p95 66-71 ms, argv 6/24/12 chars.

## Tasks
- T-01: done — Record workbench-parity benchmark as observed durable evidence attempt=1

## Evidence
- T-01: failed (bun run kernel -- validate bench --pack workbench-parity --json > .afol/wb/260713_0724_final-observed-workbench-benchmark/260713_0724_final-observed-workbench-benchmark_benchmark.json; exit_code=2)
- T-01: passed (sh -c 'bun run kernel -- validate bench --pack workbench-parity --json > .afol/wb/260713_0724_final-observed-workbench-benchmark/260713_0724_final-observed-workbench-benchmark_benchmark.json'; exit_code=0)
