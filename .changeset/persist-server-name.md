---
"partyserver": minor
---

Persist `Server.name` to durable storage so it survives cold starts without an HTTP request. Fixes `this.name` throwing inside `onAlarm()` and scheduled callbacks (cloudflare/agents#933).
