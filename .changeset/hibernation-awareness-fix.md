---
"y-partyserver": minor
---

Fix Yjs hibernation support and awareness propagation

**Server:**

- Replace in-memory `WSSharedDoc.conns` Map with `connection.setState()` and `getConnections()` so connection tracking survives Durable Object hibernation
- Move event handler registration from `WSSharedDoc` constructor into `onStart()` to use `getConnections()` for broadcasting
- Disable awareness protocol's built-in `_checkInterval` in `WSSharedDoc` constructor to prevent timers from defeating hibernation
- On `onStart`, send sync step 1 to all existing connections so clients re-sync the server's document after hibernation wake-up
- Simplify `send()` — no longer forcibly closes connections on failure
- Remove `closeConn()` helper; awareness cleanup now happens in `onClose` via persisted connection state
- Widen `onLoad()` return type to `Promise<YDoc | void>` to allow seeding the document from a returned YDoc

**Provider:**

- Switch awareness event listener from `"update"` to `"change"` so clock-only heartbeat renewals do not produce network traffic (allows DO hibernation during idle sessions)
- Disable awareness protocol's built-in `_checkInterval` on the client to stop 15-second clock renewals and 30-second peer timeout removal
- Remove provider's own `_checkInterval` liveness timer (was coupled to the awareness heartbeat)
- Clear stale awareness meta for remote clients on WebSocket close so reconnecting clients' awareness updates are accepted
- Bump awareness clock on reconnect to ensure remote peers accept the update
- Fix bug where `host.slice(0, -1)` result was not assigned, so trailing slashes were never stripped
