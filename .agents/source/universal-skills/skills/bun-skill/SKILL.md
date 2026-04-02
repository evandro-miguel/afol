---
name: bun-skill
description: Use when working with Bun runtime development. Covers runtime, package manager, test runner, bundler, and internals.
metadata:
  category: runtime
  tags: "bun, bun install, bun run, bun test, bun build, zig, jsc, javascript, typescript, package-manager, bundler, test-runner"
  triggers: "bun, bun:test, bun build, bun install, bun run, zig, jsc, bun internals, package.json, tsconfig.json"
  references: "installation, usage, typescript, testing, bundling, internals, best-practices"
  version: 1.0.1
---
# Bun Skill 🥟

Consolidated skill for building with Bun runtime. Use decision trees below to find the right workflow, then load detailed references.

## Quick Decision Trees

### "I need to run JavaScript/TypeScript"

```
Need to run code?
├─ Run a script file → bun run script.ts
├─ Run package.json scripts → bun run dev
├─ Execute a package → bunx create-react-app
├─ Start a development server → bun --hot run server.ts
├─ Run with watch mode → bun --watch run dev
└─ Debug an application → bun --inspect run app.ts
```

### "I need to manage dependencies"

```
Need package management?
├─ Install all dependencies → bun install
├─ Add a dependency → bun add package-name
├─ Add dev dependency → bun add -d package-name
├─ Remove a dependency → bun remove package-name
├─ Update dependencies → bun update
└─ Install with specific version → bun add package-name@1.2.3
```

### "I need to test my code"

```
Need testing?
├─ Logic / Backend / Utils?
│  └─ Use Bun Test (Native)
│     • Zero config/overhead
│     • Jest-compatible API
│     • Instant startup
│
├─ React Components (Complex)?
│  └─ Use Vitest
│     • Browser emulation (happy-dom/jsdom)
│     • Vite plugin ecosystem
│     • Complex mocking
│
├─ E2E Flows?
│  └─ Use Playwright
│     • Real browser automation
│     • Visual regression
```

### "I need to build for production"

```
Need bundling?
├─ Bundle for Bun runtime → bun build ./index.ts --outdir ./out
├─ Bundle for browser → bun build ./index.tsx --outdir ./out --target browser
├─ Bundle for Node.js → bun build ./index.ts --outdir ./out --target node
├─ Create executable → bun build ./cli.ts --compile --outfile mycli
├─ Bundle with minification → bun build ./index.ts --outdir ./out --minify
└─ Bundle library (external deps) → bun build ./index.ts --outdir ./dist --external '*'
```

### "I need to configure TypeScript"

```
Need TypeScript setup?
├─ Initialize new project → bun init my-app
├─ Install types for Bun → bun add -d @types/bun
├─ Configure tsconfig.json → references/typescript/
├─ Type check without emit → bunx tsc --noEmit
└─ Use with JSX → bun build automatically handles .tsx
```

### "I need to contribute to Bun"

```
Contributing to Bun core?
├─ Work on Zig bindings → references/internals/zig.md
├─ Work on C++ bindings → references/internals/cpp.md
├─ Platform-specific code → references/internals/platform-tests.md
└─ Build from source → references/internals/build.md
```

## Product Index

### Runtime & CLI
| Product | Reference |
|---------|-----------|
| Installation | `references/installation/` |
| Runtime Usage | `references/usage/` |
| Package Manager | `references/usage/` (bun install, bun add) |
| TypeScript Support | `references/typescript/` |

### Testing
| Product | Reference |
|---------|-----------|
| Test Runner | `references/testing/` |
| Jest Compatibility | `references/testing/` |
| Mocks & Spies | `references/testing/` |
| Snapshots | `references/testing/` |

### Build Tools
| Product | Reference |
|---------|-----------|
| Bundler | `references/bundling/` |
| Code Splitting | `references/bundling/` |
| Minification | `references/bundling/` |
| Executables | `references/bundling/` |

### Best Practices
| Product | Reference | Impact |
|---------|-----------|--------|
| Memory Management | `references/best-practices/` | CRITICAL |
| File Operations | `references/best-practices/` | HIGH |
| HTTP Server | `references/best-practices/` | HIGH |
| Testing | `references/best-practices/` | MEDIUM |
| Build Optimization | `references/best-practices/` | MEDIUM |

### Internals (Contributors)
| Product | Reference |
|---------|-----------|
| Zig Bindings | `references/internals/zig.md` |
| C++ Bindings | `references/internals/cpp.md` |
| Platform Tests | `references/internals/platform-tests.md` |

## Core Templates

### 1. Fast HTTP Server
```typescript
// server.ts
const server = Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname === '/') {
      return new Response('Hello World!');
    }
    
    if (url.pathname === '/api/users') {
      return Response.json({ users: [] });
    }
    
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
```

### 2. File Operations
```typescript
// Read file
const file = Bun.file('./data.txt');
const text = await file.text();
const json = await file.json();

// Write file
await Bun.write('./output.txt', 'Hello World');
await Bun.write('./data.json', JSON.stringify({ key: 'value' }));

// Stream file
const stream = file.stream();
```

### 3. Environment Variables
```typescript
// Access env vars
const apiKey = Bun.env.API_KEY;
const port = Bun.env.PORT || '3000';

// Type-safe env (define in env.d.ts)
declare module 'bun' {
  interface Env {
    API_KEY: string;
    DATABASE_URL: string;
  }
}
```

### 4. Test with bun:test
```typescript
import { test, expect, describe, beforeEach } from 'bun:test';

describe('Math operations', () => {
  test('adds 1 + 2 to equal 3', () => {
    expect(1 + 2).toBe(3);
  });
  
  test('async operation', async () => {
    const result = await fetchData();
    expect(result).toBeDefined();
  });
});
```

### 5. Bundle Configuration
```typescript
// build.ts
const result = await Bun.build({
  entrypoints: ['./src/index.tsx'],
  outdir: './dist',
  target: 'browser',
  minify: true,
  splitting: true,
  sourcemap: 'linked',
});

if (!result.success) {
  console.error('Build failed:', result.logs);
}
```

## Essential Commands

```bash
# Development
bun run index.ts              # Run a file
bun --watch run dev          # Watch mode
bun --hot run server.ts      # Hot reload

# Package Management
bun install                   # Install dependencies
bun add package-name         # Add dependency
bun add -d package-name      # Add dev dependency
bun remove package-name      # Remove dependency
bun update                   # Update dependencies

# Testing
bun test                     # Run tests
bun test --watch            # Watch mode
bun test --coverage         # With coverage

# Building
bun build ./index.ts        # Bundle file
bun build --outdir ./dist   # Specify output
bun build --target browser  # Browser target
bun build --minify          # Minify output
bun build --compile         # Create executable

# Utilities
bunx package-name           # Execute package
bun upgrade                 # Upgrade Bun
bun --version              # Show version
```

## Reading Order

| Task | Start With | Then Read |
|------|------------|-----------|
| First Bun project | Installation → Usage | TypeScript → Testing |
| Set up TypeScript | TypeScript | Usage (running .ts files) |
| Add testing | Testing | Usage (bun test command) |
| Production build | Bundling | TypeScript (if using TS) |
| Optimize performance | Usage | Bundling (optimization) |
| Contribute to Bun | Internals → Zig Bindings | Platform Tests |

## Reference Tables

### Bun vs Node.js

| Feature | Bun | Node.js |
|---------|-----|---------|
| Startup time | ~5ms | ~25ms |
| Package install | ~30x faster | Baseline |
| Script execution | ~4x faster | Baseline |
| Test runner | Built-in | Requires Jest/Vitest |
| Bundler | Built-in | Requires webpack/etc |
| TypeScript | Native | Requires ts-node |
| Memory usage | Lower | Higher |

### File Extensions

| Extension | Support |
|-----------|---------|
| `.js`, `.jsx` | Native |
| `.ts`, `.tsx` | Native (transpiled on-the-fly) |
| `.json`, `.jsonc` | Native |
| `.toml` | Native |
| `.wasm` | Native |

## See Also

- [TypeScript Skill](skill://typescript-skill) - TypeScript configuration patterns
- [Vitest Skill](../vitest-skill/SKILL.md) - Alternative testing (Bun test is Jest-compatible)
- [Docker Skill](../docker-skill/SKILL.md) - Containerization with Bun
- [Vite Skill](../vite-skill/SKILL.md) - Alternative build tool

## Projects

Project-specific contexts live in dedicated project skills.

If you are in a multi-app repo, consult:
- `project-context-catalog`
- the matching project context skill (example: `project-minha-biblioteca-digital`)

## Changelog

- 2026-02-07: Move project contexts out of `bun-skill` into dedicated project skills.

---

*Based on official Bun documentation from bun.com*
