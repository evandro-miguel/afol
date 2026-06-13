---
doc_type: spec
id: 260521_0120_public-distribution-and-onboarding_spec_01
theme: public-distribution-and-onboarding
status: final
owners:
- orchestrator
created_at: '2026-05-21T02:00:00+08:00'
updated_at: '2026-05-29T11:42:15-03:00'
roadmap_feature: F-12
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - README.md src/project-template docs package
  packages:
  - agentic-cli
risk_level: medium
---

# SPEC: public-distribution-and-onboarding

## 1) Feature Intent

Prepare the system for future public use without compromising the current
personal workflow.

## 2) Problem

A personal-only tool may contain private assumptions, unclear onboarding, long
internal context, or machine-specific workflows.

## 3) Expected Behavior

Future users can install the CLI, initialize a project, run afol s, create
governed tasks, add evidence, close sessions, and update the local template
without reading long internal docs.

The public command name is `afol`; `afol` remains a local compatibility wrapper
while migration parity is incomplete.

## 4) Product Boundary

The universal CLI owns reusable behavior. The project-local template owns local
state, rules, skills, workbench artifacts, specs, evidence, logs, config, and
update metadata. Current Python/uv/Bash behavior remains compatibility contract
until Bun/TypeScript parity is proven by focused tests.

## 5) Scope

In scope: Public README shape, install path, first-run experience, minimal
examples, public-safe assumptions, versioning model.

Out of scope: Hosted service, marketplace, large plugin ecosystem before core
stability, public launch before internal MVP works.

## 5.1) Distribution Addendum 2026-05-31

Release packaging should follow the smallest proven path first:

1. Package entrypoint: keep `"bin": { "afol": "./afol" }` for local and package
   manager installs.
2. Standalone artifact: build `dist/afol` with `bun build --compile` and smoke
   `./dist/afol --help`.
3. Reproducibility: validate release candidates from a clean checkout with
   `bun install --frozen-lockfile`.
4. Platform targets: only claim Linux/macOS/Windows targets after each target
   has native or VM-backed smoke evidence.
5. Provenance: publish checksums and version metadata with any binary release.
6. macOS: disclose non-notarized status until signing/notarization is actually
   implemented.
7. Installers: Homebrew taps and `curl | bash` scripts are future channels, not
   MVP requirements.
8. MCP full/native adapters, runtime-live-agent transport, and broad cross-platform
   parity are deferred until benchmark and smoke evidence is complete per target/runtime.
9. Security checks are required by policy, but the release lane is allowed to proceed
   with explicit waiver if OSV/Gitleaks are absent; waiver must name missing tools
   and reason.

Rejected for the current public-readiness lane:

- adopting Bunli, meow, Ace CLI/Bejibun, or another framework as a wholesale
  replacement for the local registry/router;
- adding Node.js fallback before a concrete downstream stability requirement;
- shipping interactive-first setup that blocks noninteractive agents.

### 5.1.1) Script Mapping

- `bun run build:deterministic` for frozen-lockfile compile and stable artifact
  verification.
- `bun run smoke:dist` for standalone binary smoke validation.
- `bun run validate:security` for optional OSV/Gitleaks scans (informative when
  scanners are missing).

## 6) Acceptance

A new user can understand the tool quickly; first-run setup is simple; example
project works; private assumptions are removed; docs stay short and practical.
Before any public release claim, `bun run build`, `bun run smoke:dist`, a clean
`bun install --frozen-lockfile`, and the target-platform smoke matrix must pass
for every advertised artifact.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?

## 8) Closure

- Accepted implementation evidence: `E-20260528144544308053`.
- Closeout session: `.afol/wb/260528_1444_public-distribution-and-onboarding/`.
- Status: final
