---
"partyserver": patch
---

Document and test the supported pattern for using PartyServer with [Durable Object Facets](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/). No runtime behavior change.

**Background.** Facets spawned via `ctx.facets.get(name, factory)` _without_ an explicit `id` in `FacetStartupOptions` inherit the parent DO's `ctx.id` — including `ctx.id.name`. PartyServer's `name` getter reads `ctx.id.name` straight through, so on an implicit-id facet `this.name` returns the _parent's_ name rather than the facet's logical name. This is a faithful reflection of the workerd contract, but it's almost never what framework authors expect.

The fix is at the call site, not in PartyServer: pass `id: someBoundDONamespace.idFromName(facetName)` to `ctx.facets.get(...)`. The facet then gets its own native `ctx.id.name === facetName` and PartyServer's `name` getter does the right thing automatically. No `setName()` is required, no `__ps_name` storage record is written, and cold-wake recovery happens for free because the factory re-runs and `idFromName` is deterministic.

This release adds:

- **A "Using PartyServer with Durable Object Facets" section in the README** that walks through the recommended pattern with a code example, calls out the implicit-id footgun explicitly, and documents that plain-string `id` values are not a substitute for `idFromName(facetName)` (workerd treats string ids as `idFromString`-like, so the resulting facet has no `ctx.id.name`).
- **`setName()` docstring updated** to clarify that facets are NOT a `setName()` use case — point to the explicit-`id` pattern instead. The original `setName()` `ctx.id.name` mismatch throw is preserved as a typo guard for the `idFromName` happy path.
- **End-to-end facet test coverage** against the real workerd `ctx.facets.get(...)` API. A `FacetParent` / `FacetChild` fixture exercises both the implicit-id path (pinning the runtime contract that `this.name` returns the parent's name in that flow — i.e., behavior-as-documentation so framework authors are unsurprised) and the explicit-id path (recommended; verifies that all reasonable id-construction strategies work and that cold wake recovers without any storage record). Plain-string `id` is also tested; the test asserts it does NOT carry a name, pinning the contract so callers don't get tempted by the type signature.

The runtime behavior of `Server` (the `name` getter, `setName()`, the legacy `__ps_name` hydrate inside `#ensureInitialized()`) is unchanged from 0.5.2.
