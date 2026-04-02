---
description: Common pitfalls and solutions for bun-skill
metadata:
  tags: "gotchas, pitfalls, troubleshooting"
---

# Gotchas

## Overview

Common pitfalls when working with Bun runtime and how to avoid them.

## Pitfalls

### Mixing Package Managers
**Problem**: Using `npm` or `yarn` commands in a project with `bun.lockb`, causing lockfile conflicts and dependency resolution issues.
**Solution**: Check for `bun.lockb` before running any package commands. If present, use `bun install`, `bun add`, and `bun remove` exclusively. Delete other lockfiles if migrating to Bun.

### Using Node-specific APIs Without Fallbacks
**Problem**: Using Node.js-specific APIs (like `process.binding`, native modules) that Bun doesn't support, causing runtime errors.
**Solution**: Test thoroughly with `bun run` before assuming compatibility. Use Bun's native alternatives when available (`Bun.file()` instead of `fs.readFile` for better performance). Check compatibility for native modules.

### Ignoring TypeScript Configuration
**Problem**: Assuming Bun's TypeScript support means "no configuration needed," leading to type mismatches and module resolution issues.
**Solution**: Install `@types/bun` for proper type definitions. Configure `tsconfig.json` with appropriate `moduleResolution` (bundler) and `target` (ESNext). Run `bunx tsc --noEmit` for type checking.

### Not Using Bun's Native APIs
**Problem**: Using Node.js patterns when Bun provides faster, more ergonomic alternatives, missing out on performance benefits.
**Solution**: Use `Bun.serve()` for HTTP servers, `Bun.file()` for file operations, `Bun.env` for environment variables, and `Bun.write()` for file writing. These are optimized for Bun's runtime.

### Hot Reload Breaking State
**Problem**: Using `--hot` with stateful servers, losing in-memory state on every file change and confusing development behavior.
**Solution**: Use `--watch` for restarts without state persistence, or `--hot` only for stateless handlers. For databases and connections, re-initialize in the module scope.

### Assuming Jest Compatibility is 100%
**Problem**: Assuming Bun's test runner is fully Jest-compatible, leading to test failures with unsupported matchers or configuration.
**Solution**: Test the specific APIs you use. For complex mocking, consider Vitest. Use `bun:test` imports explicitly rather than relying on globals. Check supported matchers in Bun docs.

### Creating Large Single Bundles
**Problem**: Bundling everything into a single file without code splitting, resulting in large initial loads and poor caching.
**Solution**: Use `splitting: true` in `Bun.build()` for code splitting. Set `outdir` instead of `outfile`. Use dynamic imports for lazy loading. Target appropriate environment (browser/node/bun).