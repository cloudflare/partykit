import { createPubSubServer } from "partysub/server";

const { PubSubServer, routePubSubRequest } = createPubSubServer({
  binding: "PubSub",
  nodes: 100
});

export { PubSubServer };

export default {
  async fetch(req, env) {
    return (
      (await routePubSubRequest(req, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
