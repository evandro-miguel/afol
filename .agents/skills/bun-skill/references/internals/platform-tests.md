---
description: "Integration Testing Patterns"
metadata:
  category: development
  tags: "file-api, client, apis, api-testing, typescript, open-graph, fetching, minification"
---

# Integration Testing Patterns

Patterns for testing Bun itself (the bundler, dev server, etc).

## 1. Bundler Tests

**File**: `test/bundler/expectBundled.ts`

```typescript
import { itBundled } from "./expectBundled";

itBundled("category/FeatureName", {
  files: {
    "index.js": `console.log("hello")`
  },
  minifySyntax: true,
  run: {
    stdout: "hello",
    exitCode: 0
  },
  onAfterBundle(api) {
    api.expectFile("out.js").toContain("console.log");
  }
});
```

## 2. HMR / Dev Server Tests

**File**: `test/bake/bake-harness.ts`

```typescript
import { devTest } from "../bake-harness";

devTest("hmr updates content", {
  files: {
    "index.html": "<h1>Hello</h1>"
  },
  async test(dev) {
    // Initial check
    await dev.fetch("/").expect.toInclude("<h1>Hello</h1>");

    // Client simulation
    const client = await dev.client("/");

    // HMR Trigger & Verify
    await client.expectReload(async () => {
      await dev.write("index.html", "<h1>World</h1>");
    });
    
    await dev.fetch("/").expect.toInclude("<h1>World</h1>");
  }
});
```
