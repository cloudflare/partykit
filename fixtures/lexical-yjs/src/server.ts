import { routePartykitRequest } from "partyserver";
import { YServer } from "y-partyserver";
import { env } from "cloudflare:workers";

export { YServer as LexicalDocument };

export default {
  async fetch(request: Request): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
