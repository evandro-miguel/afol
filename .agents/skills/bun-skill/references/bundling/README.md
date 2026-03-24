---
description: Bun bundler configuration, optimization, and build patterns.
metadata:
  tags: "bun, bundler, bun build, optimization, code splitting, esm, cjs"
---

# Bun Bundler

Fast native bundler for JavaScript, TypeScript, JSX, and more.

## Quick Start

```bash
# Basic build
bun build ./index.tsx --outdir ./out

# With watch mode
bun build ./index.tsx --outdir ./out --watch

# For production
bun build ./index.tsx --outdir ./out --minify
```

## JavaScript API

```typescript
const result = await Bun.build({
  entrypoints: ['./index.tsx'],
  outdir: './out',
});

if (result.success) {
  console.log("Build successful!");
  for (const output of result.outputs) {
    console.log(`${output.path}: ${output.size} bytes`);
  }
}
```

## Configuration Options

### Entrypoints

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],  // Required
  outdir: './out',
});
```

Multiple entrypoints:
```typescript
await Bun.build({
  entrypoints: [
    './src/app.tsx',
    './src/admin.tsx',
    './src/api.ts'
  ],
  outdir: './dist',
});
```

### Output Directory

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './dist',  // Output directory
});
```

Without `outdir`, returns artifacts in memory:
```typescript
const result = await Bun.build({
  entrypoints: ['./index.ts'],
});

for (const output of result.outputs) {
  const code = await output.text();
  // Handle in memory
}
```

### Target

| Target | Description |
|--------|-------------|
| `"browser"` | Default. For browsers, uses `"browser"` export condition |
| `"bun"` | For Bun runtime, adds `// @bun` pragma |
| `"node"` | For Node.js, uses `"node"` export condition |

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  target: 'browser',  // or 'bun', 'node'
});
```

### Format

| Format | Description |
|--------|-------------|
| `"esm"` | Default. ES modules with top-level await |
| `"cjs"` | CommonJS (experimental) |
| `"iife"` | Immediately Invoked Function Expression (experimental) |

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  format: 'esm',  // or 'cjs', 'iife'
});
```

### Minification

```typescript
// Enable all minification
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  minify: true,
});

// Granular control
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  minify: {
    whitespace: true,
    identifiers: true,
    syntax: true,
  },
});
```

CLI:
```bash
bun build ./index.ts --outdir ./out --minify
bun build ./index.ts --outdir ./out --minify-whitespace --minify-identifiers --minify-syntax
```

### Source Maps

| Option | Description |
|--------|-------------|
| `"none"` | Default. No sourcemap |
| `"linked"` | Separate `.js.map` file with sourceMappingURL comment |
| `"external"` | Separate file without comment (uses debugId) |
| `"inline"` | Base64-encoded inline sourcemap |

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  sourcemap: 'linked',  // or 'external', 'inline'
});
```

### Code Splitting

```typescript
await Bun.build({
  entrypoints: ['./page-a.tsx', './page-b.tsx'],
  outdir: './out',
  splitting: true,  // Enable code splitting
});
```

### External Dependencies

```typescript
// Mark specific packages as external
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  external: ['react', 'react-dom'],
});

// Mark all imports as external
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  external: ['*'],
});
```

CLI:
```bash
bun build ./index.ts --outdir ./out --external react --external react-dom
bun build ./index.ts --outdir ./out --external '*'
```

### Packages

```typescript
// Don't bundle node_modules
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  packages: 'external',  // or 'bundle' (default)
});
```

### Naming

```typescript
// Custom file naming
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  naming: '[dir]/[name]-[hash].[ext]',
});

// Separate patterns for different types
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  naming: {
    entry: '[dir]/[name].[ext]',
    chunk: '[name]-[hash].[ext]',
    asset: '[name]-[hash].[ext]',
  },
});
```

Tokens:
- `[name]` - File name without extension
- `[ext]` - File extension
- `[hash]` - Content hash
- `[dir]` - Directory path

### Public Path

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  publicPath: 'https://cdn.example.com/',
});
```

Output:
```javascript
// Before
import logo from "./logo.svg";

// After
var logo = "https://cdn.example.com/logo-a7305bdef.svg";
```

### Define (Global Replacement)

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  define: {
    'process.env.NODE_ENV': '"production"',
    'API_URL': '"https://api.example.com"',
    'VERSION': '"1.0.0"',
  },
});
```

CLI:
```bash
bun build ./index.ts --outdir ./out --define process.env.NODE_ENV='"production"'
```

### Environment Variables

```typescript
// Inline all env vars
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  env: 'inline',
});

// Inline specific prefix
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  env: 'PUBLIC_*',  // Only inline PUBLIC_ prefixed vars
});

// Disable inlining
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  env: 'disable',
});
```

### Root

```typescript
await Bun.build({
  entrypoints: ['./pages/a.tsx', './pages/b.tsx'],
  outdir: './out',
  root: '.',  // Project root
});
```

### Banner/Footer

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  banner: '"use client";',
  footer: '// built with Bun',
});
```

### Drop

Remove specific code:

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  drop: ['console', 'debugger'],
});
```

### Features (Compile-time Flags)

```typescript
// In source code
import { feature } from "bun:bundle";

if (feature("PREMIUM")) {
  enablePremium();
}

// In build
await Bun.build({
  entrypoints: ['./app.ts'],
  outdir: './out',
  features: ["PREMIUM"],  // PREMIUM=true
});
```

Type safety:
```typescript
// env.d.ts
declare module "bun:bundle" {
  interface Registry {
    features: "DEBUG" | "PREMIUM" | "BETA";
  }
}
```

### Metafile

```typescript
const result = await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  metafile: true,
});

if (result.metafile) {
  // Analyze bundle
  for (const [path, meta] of Object.entries(result.metafile.inputs)) {
    console.log(`${path}: ${meta.bytes} bytes`);
  }
  
  // Save for analysis tools
  await Bun.write('./dist/meta.json', JSON.stringify(result.metafile));
}
```

### Bytecode

Generate `.jsc` bytecode for faster startup:

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  format: 'cjs',
  target: 'bun',
  bytecode: true,
});
```

## File Types

### Supported Extensions

| Extension | Handling |
|-----------|----------|
| `.js`, `.jsx`, `.ts`, `.tsx` | Transpiled |
| `.json`, `.jsonc` | Inlined as object |
| `.toml` | Parsed and inlined |
| `.yaml`, `.yml` | Parsed and inlined |
| `.txt` | Inlined as string |
| `.html` | Processed, assets bundled |
| `.css` | Bundled to single CSS file |
| `.node`, `.wasm` | Treated as assets |

### Assets

Unrecognized extensions are treated as assets:

```typescript
import logo from "./logo.svg";
// logo = "./logo-a7305bdef.svg" (copied to outdir)
```

### Custom Loaders

```typescript
await Bun.build({
  entrypoints: ['./index.ts'],
  outdir: './out',
  loader: {
    '.png': 'dataurl',  // Inline as data URL
    '.txt': 'file',     // Copy as file
  },
});
```

## Plugins

Bun supports plugins for custom transformations:

```typescript
import { plugin } from "bun";

plugin({
  name: "Custom Loader",
  setup(build) {
    build.onLoad({ filter: /\.txt$/ }, async (args) => {
      const text = await Bun.file(args.path).text();
      return {
        contents: `export default ${JSON.stringify(text)}`,
        loader: "js",
      };
    });
  },
});
```

## In-Memory Files

Bundle virtual files:

```typescript
const result = await Bun.build({
  entrypoints: ["/app/index.ts"],
  files: {
    "/app/index.ts": `
      import { greet } from "./greet.ts";
      console.log(greet("World"));
    `,
    "/app/greet.ts": `
      export function greet(name: string) {
        return "Hello, " + name + "!";
      }
    `,
  },
});
```

Override disk files:
```typescript
await Bun.build({
  entrypoints: ['./src/index.ts'],
  files: {
    './src/config.ts': `
      export const API_URL = "https://api.production.com";
    `,
  },
  outdir: './dist',
});
```

## Executables

Compile to standalone executable:

```bash
bun build ./cli.ts --outfile mycli --compile
./mycli
```

## Watch Mode

```bash
bun build ./index.ts --outdir ./out --watch
```

## Error Handling

```typescript
try {
  const result = await Bun.build({
    entrypoints: ['./index.ts'],
    outdir: './out',
  });
} catch (e) {
  const error = e as AggregateError;
  console.error("Build Failed");
  console.error(error);
  console.error(JSON.stringify(error, null, 2));
}
```

## Build Output

```typescript
interface BuildOutput {
  outputs: BuildArtifact[];
  success: boolean;
  logs: BuildMessage[];
  metafile?: BuildMetafile;
}

interface BuildArtifact extends Blob {
  kind: "entry-point" | "chunk" | "asset" | "sourcemap";
  path: string;
  loader: string;
  hash: string | null;
  sourcemap: BuildArtifact | null;
}
```

Usage:
```typescript
const build = await Bun.build({ /* ... */ });

for (const output of build.outputs) {
  const text = await output.text();
  const bytes = await output.bytes();
  const buffer = await output.arrayBuffer();
  
  // Can be used directly in Response
  return new Response(output);
}
```

## Best Practices

1. **Use `target: 'bun'`** for server-side code
2. **Enable `splitting`** for multi-page apps
3. **Use `external`** for large dependencies
4. **Set `publicPath`** for CDN deployments
5. **Enable `minify`** for production
6. **Use `sourcemap: 'linked'`** for debugging
7. **Leverage `define`** for environment-specific code
8. **Use `metafile`** for bundle analysis

## Common Patterns

### React App

```typescript
await Bun.build({
  entrypoints: ['./src/index.tsx'],
  outdir: './dist',
  target: 'browser',
  minify: true,
  sourcemap: 'linked',
  splitting: true,
});
```

### Library Build

```typescript
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  format: 'esm',
  external: ['*'],  // Don't bundle dependencies
  minify: {
    whitespace: true,
    identifiers: false,  // Keep readable names
    syntax: true,
  },
});
```

### Full-Stack App

```typescript
// Client
await Bun.build({
  entrypoints: ['./src/client.tsx'],
  outdir: './dist/public',
  target: 'browser',
  minify: true,
});

// Server
await Bun.build({
  entrypoints: ['./src/server.ts'],
  outdir: './dist',
  target: 'bun',
  minify: true,
});
```

---

*Source: Official Bun Documentation - bun.com*
