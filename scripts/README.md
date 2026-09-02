# Scripts

`audit-public-content.ts` rejects home paths, private-repo name markers,
private keys, bearer tokens, absolute symlinks, and files larger than 10 MiB.
When run from a Git checkout, it also audits reachable history blobs; run it
after cloning the exact public release candidate.

Run it against a checkout:

```bash
bun run public:audit -- .
```
