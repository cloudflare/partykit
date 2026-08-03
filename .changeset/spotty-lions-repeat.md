---
"partyserver": minor
---

Stop persisting the `__ps_name` self-heal fallback record on named-access initialization; deprecate the `setName()` name-bootstrap role and the `x-partykit-room` header fallback; document the native `ctx.id.name` availability matrix

`ctx.id.name` has been populated natively inside Durable Objects addressed via `idFromName()`/`getByName()` since 2026-03-15 (https://developers.cloudflare.com/changelog/post/2026-03-15-durable-object-id-name/), and production verification on a worker pinned to `compatibility_date` 2024-06-01 (i.e. the behavior is not compat-date gated) confirmed the name is present in the constructor, on hibernating-WebSocket message wakeups, and in alarm handlers firing on cold instances after eviction. PartyServer therefore no longer writes a `__ps_name` fallback copy of the native name during initialization.

What stays:

- the legacy `__ps_name` **read** — records written by older partyserver versions (covering e.g. pre-2026-03-15 alarm records) or by the `setName()` bootstrap are still honored when `ctx.id.name` is undefined;
- the `setName()` bootstrap **write** for raw-ID DOs (`idFromString()`/`newUniqueId()`) — now deprecated, to become an error in a future major version;
- the `x-partykit-room` header fallback read — now deprecated;
- `setName()` itself — it remains the onStart-synchronization + `props`-delivery channel used by `getServerByName()` on every resolution.
