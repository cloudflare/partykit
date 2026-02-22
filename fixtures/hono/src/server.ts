import { Hono } from "hono";
import { partyserverMiddleware } from "hono-party";
import { Server } from "partyserver";

import type { Connection, WSMessage } from "partyserver";

type Bindings = {
  Chat: DurableObjectNamespace;
};

export class Chat extends Server {
  onMessage(connection: Connection, message: WSMessage): void | Promise<void> {
    console.log("onMessage", message);
    this.broadcast(message, [connection.id]);
  }
}

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  partyserverMiddleware<{ Bindings: Bindings }>({
    options: {
      onBeforeConnect(req, _lobby, c) {
        const url = new URL(req.url);
        const token = url.searchParams.get("token");
        if (!token) {
          return new Response("Unauthorized", { status: 401 });
        }
        console.log("env bindings available:", Object.keys(c.env));
      }
    }
  })
);

app.get("/", (c) => c.text("Hello from Hono!"));

export default app;
