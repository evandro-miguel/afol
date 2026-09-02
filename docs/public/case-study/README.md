# AFOL case study

## Problem

Coding agents often operate with inconsistent project structures, oversized
context, weak completion claims, and unsafe mutations. AFOL provides a local
operating layer that makes intent, work, evidence, and closure inspectable.

## Role and constraints

Evandro Miguel designed the product, architecture, implementation, validation,
and release model. The system is local-first, readable on
disk, low-output, reversible, deterministic where release integrity requires
it, and usable without a resident daemon.

## Architecture

The universal TypeScript CLI installs a deterministic project template. Typed
services own lifecycle, state, path, lock, mutation, evidence, and release
rules. The project owns local state; external harnesses own model selection and
execution.

## Hard problems

- Crash-safe local mutation and recovery.
- Lock identity that accounts for PID reuse.
- Template ownership and conflict previews.
- Exact-artifact receipts, checksums, security scans, and provenance.
- Cross-platform byte normalization and native Windows path handling.
- Compact command output with explicit token budgets.

## Trade-offs

Human-readable state improves auditability but requires drift validation.
Source-only distribution requires a local Bun toolchain but keeps packaging
and publication boundaries explicit. Strong governance increases up-front
discipline but produces reviewable evidence. Local timings are observations,
not service-level objectives.

## Evidence and limits

A release candidate should retain local tests, selected coverage, scanner
outcomes, checksum, provenance, and SBOM evidence for the exact candidate
commit. No metric here is hosted-CI evidence, and no publication status is
claimed.

Current limits include macOS/ARM, multi-principal authentication, experimental
evolution features, and native Windows.
