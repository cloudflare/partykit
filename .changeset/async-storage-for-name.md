---
"partyserver": patch
---

Switch name persistence from sync `ctx.storage.kv` to async `ctx.storage.get/put`, removing the requirement for SQLite-backed Durable Objects.
