# AFOL case study

## Problem

Coding agents often operate with inconsistent project structures, oversized
context, weak completion claims, and unsafe mutations. AFOL provides a local
operating layer that makes intent, work, evidence, and closure inspectable.

## Role and constraints

Evandro Miguel designed the product, architecture, implementation, validation,
and release model. The system is local-first, provider-neutral, readable on
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
Binary-first distribution narrows installation risk but delays package-manager
convenience. Strong governance increases up-front discipline but produces
reviewable evidence. Hosted timing is useful observation, not deterministic
performance proof.

## Evidence and limits

The release workflow publishes the exact tests, critical-surface coverage,
scanner outcomes, artifact checksum, provenance, SBOM, and supported platform
evidence for each tag. No metric is claimed here without a release artifact.

Current limits include macOS/ARM, multi-principal authentication, experimental
evolution features, and hosted Windows evidence that remains blocked until the
CI account can start runners.
