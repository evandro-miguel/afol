---
description: "Bun Native Testing (`bun:test`)"
metadata:
  category: development
  tags: "spies, bun, scripts, typescript, pull-requests, usage, javascript, testing"
---

# Bun Native Testing (`bun:test`)

Fast, Jest-compatible test runner.

## Basic Usage

```typescript
import { describe, it, expect, mock, spyOn } from "bun:test";

describe("math", () => {
  it("adds", () => {
    expect(2 + 2).toBe(4);
  });

  it("async", async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
```
