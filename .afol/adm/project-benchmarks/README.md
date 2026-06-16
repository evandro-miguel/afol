# Project Benchmark

Curated reference catalog for comparing AFOL with adjacent projects and
protocols. This is strategic architecture evidence, not runtime benchmarking.

Editable source lives here:

```txt
.afol/adm/project-benchmarks/
```

Generated outputs, when produced by AFOL, live here:

```txt
.afol/data/project-benchmarks/
```

Do not place project-benchmark data under:

```txt
.afol/data/benchmarks/catalog/
```

That path is reserved for runtime/eval benchmark packs.

Each project file must include source references with specific claims. Every
axis score must point to evidence refs from `source_refs`.
