---
"partysync": patch
---

Rename `Agent#connect(namespace, room)` to `Agent#connectTo(namespace, room)`. The base `DurableObject` class in `@cloudflare/workers-types` now declares `connect?(socket: Socket): void | Promise<void>` for TCP socket bindings, which collided with our override and produced a `TS2416` "not assignable to the same property in base type" error. The rename also better reflects the method's intent — connecting to another PartyServer by namespace + room, not accepting a TCP socket.
