# ADR-003: Project state stays readable on disk

Status: accepted

AFOL records tasks, evidence, locks, and configuration as project-local files
under `.afol/` and provider metadata under `.agents/`. SQLite materializes
queries; it does not replace the on-disk governance tree as the source of
truth.

Human-readable state improves auditability and requires drift validation.
The optional Antigravity workspace rule is a separate surface and never
replaces the canonical project state; see
[ADR-005](005-optional-provider-mirrors.md).
