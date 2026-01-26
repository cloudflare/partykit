import { routePartykitRequest, Server } from "../index";

import type { Connection, ConnectionContext } from "../index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export type Env = {
  Stateful: DurableObjectNamespace<Stateful>;
  OnStartServer: DurableObjectNamespace<OnStartServer>;
  Mixed: DurableObjectNamespace<Mixed>;
};

export class Stateful extends Server {
  static options = {
    hibernate: true
  };

  onConnect(
    connection: Connection,
    _ctx: ConnectionContext
  ): void | Promise<void> {
    connection.send(
      JSON.stringify({
        name: this.name
      })
    );
  }

  onRequest(
    _request: Request<unknown, CfProperties<unknown>>
  ): Response | Promise<Response> {
    return Response.json({
      name: this.name
    });
  }
}

export class OnStartServer extends Server {
  counter = 0;
  async onStart() {
    // this stray assert is simply to make sure .name is available
    // inside onStart, it should throw if not
    assert(this.name, "name is not available inside onStart");
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.counter++;
        resolve();
      }, 300);
    });
  }
  onConnect(connection: Connection) {
    connection.send(this.counter.toString());
  }
  onRequest(
    _request: Request<unknown, CfProperties<unknown>>
  ): Response | Promise<Response> {
    return new Response(this.counter.toString());
  }
}

export class Mixed extends Server {
  static options = {
    hibernate: true
  };

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/foreign")) {
      const room = request.headers.get("x-partykit-room");
      if (room) {
        await this.setName(room);
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // Accept a hibernated websocket that PartyServer does not manage. This is
      // equivalent to user code calling `this.ctx.acceptWebSocket()` directly.
      this.ctx.acceptWebSocket(server, ["foreign"]);
      return new Response(null, { status: 101, webSocket: client });
    }

    return super.fetch(request);
  }

  onConnect(connection: Connection): void {
    // Trigger a broadcast while a foreign hibernated socket exists.
    this.broadcast("hello");
    connection.send("connected");
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    return (
      (await routePartykitRequest(request, env, {
        onBeforeConnect: async (_request, { party, name }) => {
          if (party === "on-start-server") {
            if (name === "is-error") {
              return new Response("Error", { status: 503 });
            } else if (name === "is-redirect") {
              return new Response("Redirect", {
                status: 302,
                headers: { Location: "https://example2.com" }
              });
            }
          }
        },
        onBeforeRequest: async (_request, { party, name }) => {
          if (party === "on-start-server") {
            if (name === "is-error") {
              return new Response("Error", { status: 504 });
            } else if (name === "is-redirect") {
              return new Response("Redirect", {
                status: 302,
                headers: { Location: "https://example3.com" }
              });
            }
          }
        }
      })) || new Response("Not Found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
