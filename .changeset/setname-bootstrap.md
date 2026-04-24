---
"partyserver": patch
---

`setName()` is now the sanctioned bootstrap API for non-`idFromName` DOs.

When `ctx.id.name` is undefined (e.g. Cloudflare Agents facets, which are spawned via `ctx.facets.get(...)` rather than `idFromName()`), `setName(name)` now persists the name to the legacy `__ps_name` storage key in addition to stashing it in memory. This means cold-wake invocations of the DO recover the name through `#ensureInitialized()`'s legacy storage fallback without the framework having to reach into PartyServer's private storage layout.

Frameworks that previously did:

```ts
await this.ctx.storage.put("__ps_name", name);
await this.__unsafe_ensureInitialized();
```

can now do:

```ts
await this.setName(name);
```

Backward compatible:

- For DOs addressed via `idFromName()` / `getByName()` (the happy path), `setName()` continues to NOT write storage — `ctx.id.name` is the source of truth and `setName()` is just a no-op-plus-onStart.
- The pre-existing direct-storage-write pattern keeps working — the storage write becomes idempotent with what `setName()` would do.

`setName()`'s `@deprecated` docblock has been clarified: it remains the supported API for framework-level bootstrap of non-`idFromName` DOs and for delivering initial `props` to `onStart()`. The deprecation only applies to redundant calls on DOs that were addressed via `idFromName()`.
