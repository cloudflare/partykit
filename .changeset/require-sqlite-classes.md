---
"partyserver": minor
---

Uses `ctx.storage.kv` (synchronous KV) internally to persist `Server.name` across cold starts. This requires SQLite-backed Durable Objects, so you must use `new_sqlite_classes` instead of `new_classes` in your wrangler configuration's `migrations` field.

**Breaking:** If your Durable Object namespace still uses `new_classes`, you will see the following runtime error:

> The storage.kv (synchronous KV) API is only available for SQLite-backed Durable Objects, but this object's namespace is not declared to use SQLite. You can use the older, asynchronous interface via methods of `storage` itself (e.g. `storage.get()`). Alternatively, to enable SQLite, change `new_classes` to `new_sqlite_classes` within the 'migrations' field in your wrangler.jsonc or wrangler.toml file.

**Note:** This migration cannot be reversed once deployed to production.
