import { routePartykitRequest, Server } from "partyserver";

import type { Connection, WSMessage } from "partyserver";

type Env = { Chat: DurableObjectNamespace<Chat> };

export class Chat extends Server {
  static options = { hibernate: true };

  onMessage(_connection: Connection, message: WSMessage) {
    console.log("Received a message:", message);
    this.broadcast(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
