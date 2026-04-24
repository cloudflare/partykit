---
"partyserver": minor
"partysub": minor
"partysync": minor
"y-partyserver": minor
"hono-party": minor
---

Use native `ctx.id.name` to populate `this.name`.

Durable Objects now expose `ctx.id.name` on every entry point (constructor, fetch, alarm, hibernating websocket handlers) when the DO is addressed via `idFromName()`/`getByName()`. PartyServer now uses this as the primary source of `this.name`, which simplifies routing, eliminates storage writes, and makes `this.name` available inside the constructor.

Changes in `partyserver`:

- `this.name` resolves from `this.ctx.id.name`. The apologetic `workerd#2240` error message is gone.
- `this.name` is now available **inside the constructor** and from class field initializers, not just after `setName()`/`fetch()` has run.
- `routePartykitRequest` no longer issues a `setName()`/`_initAndFetch()` RPC before `fetch()`. The WebSocket path goes from 2 RPCs to 1; the HTTP path remains 1 RPC. Props, when supplied, are delivered to the DO via the `x-partykit-props` request header, set after `onBeforeConnect`/`onBeforeRequest` hooks run.
- `getServerByName` continues to perform a single RPC to ensure `onStart()` has completed before returning, so user-defined RPC methods on the returned stub can rely on initialization being done. That RPC is now cheaper internally (no storage write; name is read from `ctx.id.name`).
- `Server` no longer writes the `__ps_name` record to storage. Existing records remain on disk for backward compatibility and are only read inside `alarm()` as a fallback for alarms that were scheduled before 2026-03-15 (where `ctx.id.name` is not carried into the alarm handler — see the [Durable Objects ID docs](https://developers.cloudflare.com/durable-objects/api/id/#name)).
- `setName()` and `_initAndFetch()` are marked `@deprecated`. They continue to work for backward compatibility. `setName(name)` now throws if `name` does not match `ctx.id.name`.
- The `x-partykit-room` header is still accepted as a fallback when `ctx.id.name` is not available.
- Error message when the name cannot be resolved has been rewritten to list the three real causes (unsupported addressing via `idFromString()`/`newUniqueId()`, runtime too old to expose `ctx.id.name`, or direct `stub.fetch()` without `routePartykitRequest`/`getServerByName`).
- When reading `this.name` throws, it is because `ctx.id.name` is undefined and no legacy fallback has populated the name: the DO was addressed via `idFromString()` or `newUniqueId()` (both unsupported), the runtime is too old to expose `ctx.id.name`, or a pre-2026-03-15 alarm fired before the legacy storage fallback ran.

Changes in all affected packages (`partyserver`, `partysub`, `partysync`, `y-partyserver`, `hono-party`):

- `@cloudflare/workers-types` peer dependency bumped from `^4.20240729.0` to `^4.20260424.1`. The old range predates `ctx.id.name` in the type surface.

Not supported: addressing PartyServer DOs via `idFromString()` or `newUniqueId()`. These paths return `ctx.id.name === undefined` inside the DO and will surface as a clear error from `this.name`. PartyServer has always assumed name-based addressing via `getServerByName` / `routePartykitRequest`; this release makes that assumption explicit.
