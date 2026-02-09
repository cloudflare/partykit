---
"partyserver": minor
---

Add `connection.tags` property to read back tags assigned via `getConnectionTags()`. Works in both hibernating and in-memory modes. Tags are validated and always include the connection id as the first tag.
