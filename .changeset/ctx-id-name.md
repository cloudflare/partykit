---
"partyserver": minor
---

Use native `ctx.id.name` to populate `this.name`.

Durable Objects now expose `ctx.id.name` on every entry point (constructor, fetch, alarm, hibernating websocket handlers) when the DO is addressed via `idFromName()`/`getByName()`. PartyServer now uses this as the primary source of `this.name`, which simplifies routing, eliminates storage writes, and makes `this.name` available inside the constructor.

Changes:

- `this.name` resolves from `this.ctx.id.name`. The apologetic `workerd#2240` error message is gone; the getter only throws when the DO is addressed via `idFromString()`/`newUniqueId()` (unsupported).
- `this.name` is now available inside the constructor and inside `onStart()` on cold wake without any prior `setName()` round trip.
- `routePartykitRequest` no longer issues a `setName()`/`_initAndFetch()` RPC before `fetch()`. The WebSocket path goes from 2 RPCs to 1; the HTTP path remains 1 RPC. Props, when supplied, are delivered to the DO via the `x-partykit-props` request header.
- `getServerByName` continues to perform a single RPC to ensure `onStart()` has completed before returning, so user-defined RPC methods can rely on initialization being done. That RPC is now cheaper internally (no storage write; name is read from `ctx.id.name`).
- `Server` no longer writes the `__ps_name` record to storage. Existing records remain on disk for backward compatibility and are only read inside `alarm()` as a fallback for alarms that were scheduled before 2026-03-15 (where `ctx.id.name` is not carried into the alarm handler; see the [Durable Objects ID docs](https://developers.cloudflare.com/durable-objects/api/id/#name)).
- `setName()` and `_initAndFetch()` are marked `@deprecated`. They continue to work for backward compatibility. `setName(name)` now throws if `name` does not match `ctx.id.name`.
- The `x-partykit-room` header is still accepted as a fallback when `ctx.id.name` is not available.

Not supported: addressing PartyServer DOs via `idFromString()` or `newUniqueId()`. These paths return `ctx.id.name === undefined` inside the DO, which will surface as a clear error from `this.name`. PartyServer has always assumed name-based addressing via `getServerByName` / `routePartykitRequest`; this release makes that assumption explicit.
