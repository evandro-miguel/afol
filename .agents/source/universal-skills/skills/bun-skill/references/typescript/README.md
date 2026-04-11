---
description: TypeScript configuration and usage with Bun runtime.
metadata:
  tags: "bun, typescript, tsconfig, types, @types/bun, configuration"
---

# TypeScript with Bun

Official TypeScript support and configuration for Bun projects.

## Quick Setup

### New Projects

```bash
bun init my-app
```

This automatically creates an optimal `tsconfig.json` for Bun.

### Existing Projects

Install Bun's TypeScript definitions:

```bash
bun add -d @types/bun
```

## Recommended tsconfig.json

```json
{
  "compilerOptions": {
    // Environment setup & latest features
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,

    // Bundler mode
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,

    // Best practices
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,

    // Optional stricter flags (disabled by default)
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  }
}
```

## Key Configuration Options

### Module System

| Option | Value | Purpose |
|--------|-------|---------|
| `module` | `"Preserve"` | Preserve ES modules |
| `moduleResolution` | `"bundler"` | Modern bundler resolution |
| `allowImportingTsExtensions` | `true` | Import `.ts` files directly |
| `verbatimModuleSyntax` | `true` | Preserve import/export syntax |
| `noEmit` | `true` | Bun transpiles on-the-fly |

### Environment

| Option | Value | Purpose |
|--------|-------|---------|
| `lib` | `["ESNext"]` | Latest ECMAScript features |
| `target` | `"ESNext"` | Target latest JS |
| `jsx` | `"react-jsx"` | React JSX transform |
| `allowJs` | `true` | Allow JS imports |

### Strictness

| Option | Value | Purpose |
|--------|-------|---------|
| `strict` | `true` | Enable all strict checks |
| `noUncheckedIndexedAccess` | `true` | Safer array/object access |
| `noImplicitOverride` | `true` | Require `override` keyword |
| `noFallthroughCasesInSwitch` | `true` | Prevent switch fallthrough |

## Type Definitions

### Bun Global

After installing `@types/bun`, you get access to the `Bun` global:

```typescript
// Bun APIs are fully typed
const server = Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response("Hello!");
  }
});

// File I/O
const file = Bun.file("./data.txt");
const content = await file.text();

// Environment
const env = Bun.env.MY_VAR;
```

### Test Types

```typescript
import { expect, test, describe } from "bun:test";

test("math", () => {
  expect(2 + 2).toBe(4);
});

describe("suite", () => {
  test("nested", () => {
    expect(true).toBe(true);
  });
});
```

## Import Patterns

### TypeScript Extensions

Bun supports importing TypeScript files with extensions:

```typescript
// ✅ Works in Bun
import { helper } from "./helper.ts";
import { Component } from "./Component.tsx";

// Also works without extension
import { helper } from "./helper";
```

### JSON Imports

```typescript
// With type assertion (recommended)
import config from "./config.json" assert { type: "json" };

// Direct import (also works)
import config from "./config.json";
```

### Dynamic Imports

```typescript
// Dynamic import with proper typing
const { helper } = await import("./helper.ts");

// Conditional import
if (condition) {
  const module = await import("./optional.ts");
}
```

## Common Issues

### "Cannot find module 'bun'"

**Solution:** Install type definitions

```bash
bun add -d @types/bun
```

### "Bun is not defined"

**Solution:** Ensure tsconfig.json has proper lib settings:

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext"
  }
}
```

### Import path errors

**Solution:** Use bundler module resolution:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true
  }
}
```

## Advanced Configuration

### Path Mapping

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"]
    }
  }
}
```

Usage:

```typescript
import { Button } from "@components/Button";
import { utils } from "@/utils";
```

### Declaration Files

Create `src/types.d.ts` for global types:

```typescript
// src/types.d.ts
declare global {
  interface Window {
    myLib: any;
  }
}

export {};
```

### Module Augmentation

Extend Bun's types:

```typescript
// types/bun.d.ts
declare module "bun" {
  interface Env {
    MY_CUSTOM_VAR: string;
    APP_CONFIG_VALUE: string;
  }
}
```

## IDE Integration

### VS Code

1. Install TypeScript extension
2. Select Bun's TypeScript version:
   - Open command palette: `Cmd/Ctrl + Shift + P`
   - Run: "TypeScript: Select TypeScript Version"
   - Choose "Use Workspace Version"

### WebStorm

1. Go to Preferences → Languages & Frameworks → TypeScript
2. Set Node interpreter to Bun
3. Enable "Recompile on changes"

## Build Configuration

### For Libraries

```json
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "./dist"
  }
}
```

### For Applications

```json
{
  "compilerOptions": {
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

## Type Checking

```bash
# Type check without emitting
bunx tsc --noEmit

# Watch mode
bunx tsc --noEmit --watch

# With project references
bunx tsc --build
```

## Best Practices

1. **Use `bun init`** for new projects - sets up optimal config
2. **Enable strict mode** - catches more errors at compile time
3. **Use `verbatimModuleSyntax`** - ensures proper ESM/CJS handling
4. **Set `noEmit: true`** - Bun transpiles on-the-fly
5. **Install `@types/bun`** - for full Bun API support
6. **Use `moduleResolution: "bundler"`** - modern resolution algorithm

---

*Source: Official Bun Documentation - bun.com*
