---
doc_type: report
id: 260907_1636_public-quality-repair_report_01
theme: public-quality-repair
status: final
owners:
- orchestrator
roadmap_feature: F-34
parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
child_spec: 260818_public-architecture-code-quality_spec-child_01
related_tasks:
- T-01
- T-02
- T-03
- T-04
---

# Report: Public quality repair

The repaired candidate passes the local functional, output-budget, tooling, security, and runtime checks described below. Changes remain uncommitted on `fix/quality-audit` in `/home/ozy/01_projects/dev/afol.public-root.fix-quality-audit`, based on public HEAD `48262833132d4add94220eba465d55089b2ba4fb`. The canonical `main` checkout and installed global binary were preserved.

## Delivered changes

- Replaced seven unsupported commands in `src/project-template/AGENTS.md` with executable `qt` and staged `n` → `st` → `d -x` → `c` workflows. The new installed-guide test extracts and executes the shipped examples in a fresh project.
- Reduced compact help from about 550 to 486 output tokens (AFOL's byte-based estimate), retaining commands, aliases, side-effect labels, and detailed help. The unit test now reads the actual 500-token benchmark limit instead of allowing 610.
- Preserved historical benchmark measurements and identified their original Git root with `source_root_commit`. The public export reused the repository URL but starts a different history. Historical external references no longer fail as missing local commits; regression tests retain missing-commit, ancestry, malformed-root, root-mismatch, and local-commit checks. Historical references do not certify current performance.
- Fixed Evolution's smoke to read the public built-in catalog instead of an absent private catalog path. Regenerated embedded assets with the native generator.
- Corrected the private `AGENTS.md` canonical engine path and added the explicit project slug now required by native RAG ingestion.
- Rebuilt private PSTR and local indexes. Aligned one finalized spec row, added eight missing specs, and reconciled totals in `.afol/adm/specs/INDEX.md` against current frontmatter.
- Repaired Project RAG project `afol-dev` (ID 1707), exact private checkout, include roots `cli,src,docs`. Final verification: ready, no issues, 582 fresh files, zero stale/missing content and zero missing/extra scope entries. The verifier retains one non-blocking metadata-drift counter.

## Checks actually run

| Check | Result |
| --- | --- |
| `bun run test:full` | 2,153 passed, five skipped, zero failed; all 127 discovered test files |
| `bun run typecheck` | Passed |
| `bun run validate:toolchain` | Version, manifest, Biome, Oxlint, Knip and toolchain smoke passed |
| `bun run template:check` | Generated assets match; 26 tests passed |
| `bun run public:audit` | Current content, examples, Markdown links and reachable history passed |
| `bun run coverage:check` | Required selected surfaces passed: bootstrap 91.82% lines, validate 100%, release provenance 87.10%; function gates also passed |
| `bun run security:scan:required` | OSV on `bun.lock`; redacted Gitleaks history and current directory scans passed |
| `bun run build`, local `release:provenance`, `smoke:wsl2`, `smoke:example` | Passed with receipts bound to the rebuilt artifact |
| `bun run smoke:clean` | Clean copied checkout installed locked dependencies and reproduced the same artifact hash |
| Native `v bench --pack token-economy` in a fresh project | All four scenarios passed; help 486 tokens, 16 ms |
| Evolution smoke, three samples plus warmup | Passed; p50 497 ms, p95 520 ms, 27 output tokens |
| State export, three samples plus warmup | Passed; p50 160 ms, p95 179 ms, 170 output tokens |
| Five compiled mutation scenarios, 20 samples each plus warmup | Passed all existing absolute thresholds; p50 42–86 ms, p95 61–224 ms |
| Private `afol v project --check-drift --strict` | All 24 checks passed |
| Project RAG final verify | `gateSignal.ready=true`, `issues=[]` |

Artifact SHA-256: `789dec652a06f2c768a2e16907331d6c9b74d2f009b82cd35150db4bfa2611d6`. Runtime: Bun 1.4.2, Linux x64/WSL2. Test temporary roots stayed outside Git checkouts under `/home/ozy/tmp/afol-quality-audit-20260907`.

## Evidence and limits

Public check logs and measured results are in the feature checkout's `.tmp/quality-repair/`. Initial audit evidence and RAG verification records are under the private checkout's `.afol/tmp/260907-project-quality/`. The initial audit report describes the pre-repair state and remains unchanged.

The first RAG cap of 100 could not consume the complete snapshot; it reported 208 remaining operations after 99 verified versions. The same reviewed scope completed with a positive cap of 350 and no force rebuild or service changes. An exploratory state benchmark initially lacked initialized project fixtures; the successful measurements use a fresh initialized project. Empty benchmark scratch directories were removed before the public-content gate. No failed attempt was counted as passing evidence.

The complete release-mode gate requires a clean, integrated source checkout and was not claimed. No commit, push, deployment, global installation, harness authorization change, or external model execution was performed. Fresh provider token receipts and native Windows/macOS/ARM validation remain unavailable. The temporary public feature checkout was not registered with Project RAG; code findings were confirmed in current source.

The earlier static import graph had no cycles. Evolution's three service-to-command imports and the large lifecycle/Evolution functions remain maintenance candidates; the repair does not refactor those unchanged mutation boundaries merely for file size. No claim of universal bug absence is made.

Skills used across audit and repair: exploring-tools, evandro-rag-system, token-economy, worktrunk-worktrees, systematic-debugging, afol-integration-test, git-skill, host-dependency-installation, typescript-expert, agentic-benchmarking, and markdownlint-skill. Execution was local without delegated agents. Unrelated private changes and concurrent sessions were preserved.
