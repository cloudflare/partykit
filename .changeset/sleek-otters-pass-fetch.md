---
"partytracks": patch
---

Pass `options.fetch` to `fromFetch` when fetching `/generate-ice-servers`. The matching `sessions/new` request already uses it, so a consumer that wires up a custom `fetch` via `PartyTracksConfig.fetch` (for auth headers, tracing, retries, request signing, etc.) now gets it applied uniformly across both calls instead of just one. No behavior change for consumers that don't pass a custom fetch — `fetchImpl` defaults to the global `fetch` in `fromFetch.ts`.
