import { routePartykitRequest, Server } from "partyserver";
import type { Connection, WSMessage } from "partyserver";
import { env } from "cloudflare:workers";

export class Chat extends Server {
  static options = { hibernate: true };

  onMessage(_connection: Connection, message: WSMessage) {
    console.log("Received a message:", message);
    this.broadcast(message);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
