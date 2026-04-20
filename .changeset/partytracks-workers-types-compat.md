---
"partytracks": patch
---

Fix type errors under newer `@cloudflare/workers-types` and TypeScript lib typings:

- Avoid `typeof fetch` in internal signatures — CF workers-types merges `fetch` with the `Fetcher` interface (which has `fetch()` and `connect()` methods), which doesn't match a plain fetch function. Internal helpers now use an explicit `(input, init?) => Promise<Response>` signature.
- Rename the internal `fetcher` option on `fromFetch` to `fetchImpl` to avoid colliding with CF's built-in `RequestInit.fetcher?: Fetcher | null`, which was intersected in and made the property uncallable.
- Cast `Response#json()` results (which are now typed `unknown`) before destructuring `{ sessionId }` / `{ iceServers }`.

All changes are internal; no public API changes.
