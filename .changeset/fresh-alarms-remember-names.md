---
"partyserver": patch
---

Persist a `__ps_name` fallback for name-based Durable Objects during initialization. This lets alarm handlers recover `this.name` even when firing on a stale on-disk alarm record that was scheduled by an older workerd version that didn't yet persist `name` into the alarm record. See cloudflare/partykit#390.
