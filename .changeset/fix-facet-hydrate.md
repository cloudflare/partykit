---
"partyserver": patch
---

Fix: restore legacy `__ps_name` storage fallback for framework bootstrap patterns.

0.5.0 moved the legacy storage hydrate into `alarm()` only, breaking Cloudflare Agents facets and any other framework that writes `__ps_name` directly before calling `__unsafe_ensureInitialized()`. Facet DOs are spawned via `ctx.facets.get(...)` rather than `idFromName()` and therefore have `ctx.id.name === undefined`; they relied on PartyServer reading the storage record back to populate `this.name` before `onStart()`.

Changes:

- Move the legacy `__ps_name` hydrate from `alarm()` into `#ensureInitialized()`, still gated on `!ctx.id.name && !#_name` so it costs nothing on the happy path (normal `idFromName()`/`getByName()` DOs skip the storage read entirely).
- `Server.fetch()` now delegates to `#ensureInitialized()` for the hydrate instead of doing its own. The `x-partykit-room` header fallback remains as a last resort when neither `ctx.id.name` nor a legacy storage record is available.
- `Server.alarm()` is simplified — it no longer needs its own hydrate call since `#ensureInitialized()` handles it.
- `setName()`'s `@deprecated` docblock is softened to clarify that it remains appropriate for framework-level bootstrap of non-`idFromName` DOs (e.g. Agents facets), not just a deprecated compatibility shim.
