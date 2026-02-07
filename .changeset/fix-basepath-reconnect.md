---
"partysocket": patch
---

Fix `PartySocket.reconnect()` crashing when using `basePath` without `room`. The reconnect guard now accepts either `room` or `basePath` as sufficient context to construct a connection URL.
