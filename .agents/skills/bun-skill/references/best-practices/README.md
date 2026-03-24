---
name: bun-best-practices
description: Bun runtime best practices covering performance, memory management, and common patterns. 25 rules organized by impact.
version: "1.0.0"
metadata:
  author: bun-community
  category: performance
---

# Bun Best Practices

25 performance and reliability rules for Bun runtime, organized by impact from CRITICAL to LOW.

## Rule Categories by Priority

| Priority | Category | Impact | Rules |
|----------|----------|--------|-------|
| 1 | Memory Management | CRITICAL | 5 rules |
| 2 | File Operations | HIGH | 5 rules |
| 3 | HTTP Server | HIGH | 5 rules |
| 4 | Testing | MEDIUM | 5 rules |
| 5 | Build Optimization | MEDIUM | 5 rules |

---

## 1. Memory Management (CRITICAL)

### 1.1 Use Bun.file() for Large Files

**Impact: CRITICAL** - Prevents memory exhaustion

**❌ Incorrect: loads entire file into memory**
```typescript
const fs = require('fs');
const content = fs.readFileSync('./large-file.zip'); // Loads entire file
```

**✅ Correct: streams file efficiently**
```typescript
const file = Bun.file('./large-file.zip');
const stream = file.stream(); // Lazy streaming

for await (const chunk of stream) {
  // Process chunk by chunk
}
```

### 1.2 Use Blob for Binary Data

**Impact: HIGH** - Efficient binary handling

**❌ Incorrect: string manipulation on binary**
```typescript
const data = fs.readFileSync('./image.png', 'utf8'); // Corrupts binary
```

**✅ Correct: preserve binary integrity**
```typescript
const file = Bun.file('./image.png');
const arrayBuffer = await file.arrayBuffer();
const uint8Array = new Uint8Array(arrayBuffer);
```

### 1.3 Avoid Memory Leaks in Event Handlers

**Impact: CRITICAL** - Prevents server crashes

**❌ Incorrect: unbounded array growth**
```typescript
const connections = [];

Bun.serve({
  websocket: {
    open(ws) {
      connections.push(ws); // Never cleaned up
    },
    close(ws) {
      // Missing cleanup
    }
  }
});
```

**✅ Correct: proper cleanup**
```typescript
const connections = new Set();

Bun.serve({
  websocket: {
    open(ws) {
      connections.add(ws);
    },
    close(ws) {
      connections.delete(ws); // Clean up
    }
  }
});
```

### 1.4 Use WeakMap for Metadata

**Impact: MEDIUM** - Allows garbage collection

```typescript
const metadata = new WeakMap();

function processObject(obj) {
  metadata.set(obj, { processedAt: Date.now() });
  // Object can still be garbage collected
}
```

### 1.5 Pool Resources

**Impact: HIGH** - Reduces allocation overhead

**❌ Incorrect: creating new objects per request**
```typescript
Bun.serve({
  fetch(req) {
    const buffer = new Uint8Array(1024 * 1024); // 1MB per request
    // ...
  }
});
```

**✅ Correct: reuse buffers**
```typescript
const bufferPool = [];

function getBuffer() {
  return bufferPool.pop() || new Uint8Array(1024 * 1024);
}

function releaseBuffer(buf) {
  bufferPool.push(buf);
}
```

---

## 2. File Operations (HIGH)

### 2.1 Prefer Bun.write() Over fs.writeFile

**Impact: HIGH** - 2-3× faster

**❌ Incorrect: Node.js API**
```typescript
import { writeFile } from 'fs/promises';
await writeFile('./output.txt', 'Hello');
```

**✅ Correct: Bun native API**
```typescript
await Bun.write('./output.txt', 'Hello');
```

### 2.2 Use Streaming for Large Writes

**Impact: CRITICAL** - Prevents memory issues

**❌ Incorrect: buffering entire content**
```typescript
const chunks = [];
for (const item of largeDataset) {
  chunks.push(JSON.stringify(item));
}
await Bun.write('./output.json', chunks.join('\n'));
```

**✅ Correct: stream writing**
```typescript
const file = Bun.file('./output.json');
const writer = file.writer();

for (const item of largeDataset) {
  await writer.write(JSON.stringify(item) + '\n');
}
await writer.end();
```

### 2.3 Leverage Bun's Built-in TOML Support

**Impact: MEDIUM** - No external dependency

**❌ Incorrect: external library**
```typescript
import TOML from '@iarna/toml';
const config = TOML.parse(await fs.readFile('./config.toml', 'utf8'));
```

**✅ Correct: native support**
```typescript
const config = await Bun.file('./config.toml').toml();
```

### 2.4 Use Efficient Path Resolution

**Impact: LOW** - Micro-optimization

**❌ Incorrect: manual string concatenation**
```typescript
const path = __dirname + '/' + filename;
```

**✅ Correct: Bun.pathToFileURL**
```typescript
import { pathToFileURL } from 'bun';
const path = pathToFileURL(filename);
```

### 2.5 Cache File Reads

**Impact: MEDIUM** - Reduces I/O

```typescript
const fileCache = new Map();

async function getFile(path: string) {
  if (!fileCache.has(path)) {
    const content = await Bun.file(path).text();
    fileCache.set(path, content);
  }
  return fileCache.get(path);
}
```

---

## 3. HTTP Server (HIGH)

### 3.1 Use Response.json() for JSON

**Impact: HIGH** - Proper content-type

**❌ Incorrect: manual JSON stringify**
```typescript
return new Response(JSON.stringify({ success: true }), {
  headers: { 'Content-Type': 'application/json' }
});
```

**✅ Correct: built-in helper**
```typescript
return Response.json({ success: true });
```

### 3.2 Stream Large Responses

**Impact: CRITICAL** - Prevents memory issues

**❌ Incorrect: buffering entire response**
```typescript
const data = await fetchLargeDataset();
return Response.json(data); // May be huge
```

**✅ Correct: streaming**
```typescript
const stream = new ReadableStream({
  async start(controller) {
    for await (const chunk of fetchLargeDatasetStream()) {
      controller.enqueue(chunk);
    }
    controller.close();
  }
});

return new Response(stream);
```

### 3.3 Use Compression for Text

**Impact: MEDIUM** - Reduces bandwidth

```typescript
import { gzipSync } from 'bun';

Bun.serve({
  fetch(req) {
    const text = generateLargeResponse();
    const compressed = gzipSync(text);
    
    return new Response(compressed, {
      headers: {
        'Content-Encoding': 'gzip',
        'Content-Type': 'application/json'
      }
    });
  }
});
```

### 3.4 Implement Rate Limiting

**Impact: HIGH** - Prevents abuse

```typescript
const rateLimit = new Map();

Bun.serve({
  fetch(req) {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    
    if (rateLimit.has(ip)) {
      const { count, resetTime } = rateLimit.get(ip);
      if (now < resetTime && count > 100) {
        return new Response('Rate limited', { status: 429 });
      }
      if (now > resetTime) {
        rateLimit.set(ip, { count: 1, resetTime: now + 60000 });
      } else {
        rateLimit.set(ip, { count: count + 1, resetTime });
      }
    } else {
      rateLimit.set(ip, { count: 1, resetTime: now + 60000 });
    }
    
    // ... handle request
  }
});
```

### 3.5 Use WebSocket for Real-time

**Impact: MEDIUM** - More efficient than polling

```typescript
Bun.serve({
  websocket: {
    open(ws) {
      ws.subscribe('updates');
    },
    message(ws, message) {
      // Broadcast to all subscribers
      ws.publish('updates', message);
    },
    close(ws) {
      ws.unsubscribe('updates');
    }
  },
  fetch(req, server) {
    if (server.upgrade(req)) {
      return;
    }
    return new Response('Hello');
  }
});
```

---

## 4. Testing (MEDIUM)

### 4.1 Use bun:test for Speed

**Impact: HIGH** - 10× faster than Jest

**❌ Incorrect: Jest setup**
```json
{
  "scripts": {
    "test": "jest"
  }
}
```

**✅ Correct: bun:test**
```json
{
  "scripts": {
    "test": "bun test"
  }
}
```

### 4.2 Mock Modules Efficiently

**Impact: MEDIUM** - Faster test execution

```typescript
import { mock } from 'bun:test';

mock.module('./database', () => ({
  query: () => Promise.resolve([{ id: 1 }])
}));
```

### 4.3 Use Snapshot Testing

**Impact: LOW** - Catch regressions

```typescript
import { test, expect } from 'bun:test';

test('component renders correctly', () => {
  const html = renderComponent();
  expect(html).toMatchSnapshot();
});
```

### 4.4 Parallel Test Execution

**Impact: MEDIUM** - Faster CI

```bash
bun test --concurrent
```

### 4.5 Test with Real Files

**Impact: MEDIUM** - More realistic tests

```typescript
import { test, expect } from 'bun:test';

test('processes file correctly', async () => {
  const file = Bun.file('./test-data.json');
  const result = await processFile(file);
  expect(result).toBeDefined();
});
```

---

## 5. Build Optimization (MEDIUM)

### 5.1 Use Correct Target

**Impact: HIGH** - Smaller bundles

**❌ Incorrect: wrong target**
```typescript
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist'
  // target defaults to 'browser'
});
```

**✅ Correct: specify target**
```typescript
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'bun' // or 'node' or 'browser'
});
```

### 5.2 Externalize Dependencies

**Impact: HIGH** - Smaller bundles

```typescript
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  external: ['react', 'react-dom', 'lodash']
});
```

### 5.3 Use Source Maps for Debugging

**Impact: MEDIUM** - Better debugging

```typescript
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  sourcemap: 'linked' // or 'inline' or 'external'
});
```

### 5.4 Minify for Production

**Impact: MEDIUM** - Smaller output

```typescript
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  minify: true
});
```

### 5.5 Define Environment Variables

**Impact: LOW** - Build-time constants

```typescript
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.API_URL': '"https://api.example.com"'
  }
});
```

---

## Quick Reference

### Most Critical Rules

| Rule | Impact | Description |
|------|--------|-------------|
| Use Bun.file() for large files | CRITICAL | Prevents memory exhaustion |
| Stream large responses | CRITICAL | Prevents memory issues |
| Clean up WebSocket connections | CRITICAL | Prevents server crashes |
| Use Bun.write() over fs | HIGH | 2-3× faster |
| Use Response.json() | HIGH | Proper content-type |

### Performance Comparison

| Operation | Bun | Node.js | Improvement |
|-----------|-----|---------|-------------|
| File read | Bun.file() | fs.readFile() | 2× faster |
| File write | Bun.write() | fs.writeFile() | 3× faster |
| HTTP server | Bun.serve() | http.createServer() | 4× faster |
| Tests | bun:test | Jest | 10× faster |
| Package install | bun install | npm install | 30× faster |

---

*Based on Bun community best practices*
