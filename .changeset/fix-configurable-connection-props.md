---
"partyserver": patch
---

Add `configurable: true` to `id`, `tags`, and `socket` property descriptors in `createLazyConnection` to fix Vite HMR compatibility

When using PartyServer with Vite's Cloudflare Workers dev mode, HMR reloads recreate the module-scoped `WeakSet` used to track wrapped sockets, while the underlying WebSocket instances survive. This caused `Object.defineProperties` to throw `TypeError: Cannot redefine property` on properties that were missing the `configurable` flag.
