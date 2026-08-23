# Scripts

`audit-public-content.ts` rejects home paths, private-repo name markers,
private keys, bearer tokens, absolute symlinks, and files larger than 10 MiB.

Run it against a checkout:

```bash
bun run public:audit -- .
```
