# hono-party

🔥 [Hono](https://hono.dev) ⨉ 🎈 [PartyServer](https://github.com/cloudflare/partykit)

Websockets from the future, now in Hono. Add collaborative editing, multiplayer games, local-first apps, ai agents, (or whatever!) into your Hono app today.

```bash
npm install hono-party hono partyserver
```

## Usage

```tsx
import { Hono } from "hono";
import { partyserverMiddleware } from "hono-party";
import { Server } from "partyserver";

// Multiple party servers
export class Chat extends Server {}
export class Game extends Server {}
export class Document extends Server {}

// Basic setup
const app = new Hono();
app.use("*", partyserverMiddleware());

// or with authentication
app.use(
  "*",
  partyserverMiddleware({
    options: {
      onBeforeConnect: async (req) => {
        const token = req.headers.get("authorization");
        // validate token
        if (!token) return new Response("Unauthorized", { status: 401 });
      }
    }
  })
);

// With error handling
app.use(
  "*",
  partyserverMiddleware({ onError: (error) => console.error(error) })
);

// With custom routing
app.use(
  "*",
  partyserverMiddleware({
    options: {
      prefix: "/party" // Handles /party/* routes only
    }
  })
);

export default app;
```

## React Usage

```tsx
import { usePartySocket } from "partysocket/react";

// Basic connection
const socket = usePartySocket({ party: "chat", room: "general" });

// game connection
const socket = usePartySocket({ party: "game", room: "uuid" });

// document connection
const socket = usePartySocket({ party: "document", room: "id" });

// With auth
const socket = usePartySocket({
  party: "chat",
  room: "general",
  headers: { authorization: `Bearer ${token}` }
});
```

## Configuration

```jsonc
// wrangler.json
{
  "durable_objects": {
    "bindings": [
      { "name": "Chat", "class_name": "Chat" },
      { "name": "Game", "class_name": "Game" },
      { "name": "Document", "class_name": "Document" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["Chat", "Game", "Document"] }
  ]
}
```

## Thanks

Thanks to [Thomas Osmonson](https://x.com/aulneau_) for building this!
