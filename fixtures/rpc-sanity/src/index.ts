import { getServerByName, Server } from "partyserver";
import { env } from "cloudflare:workers";

export class MyServer extends Server {
  async testMethod() {
    return this.name;
  }
  onRequest(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/test") {
      throw new Error("test onRequest");
    }
    return new Response("test onRequest");
  }
}

const SESSION_ID = "session-id";

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const stub = await getServerByName(env.MyServer, SESSION_ID);

    if (url.pathname === "/rpc") {
      const value = await stub.testMethod();
      return new Response(`the value is ${value}`);
    }
    return stub.fetch(request);
  }
} satisfies ExportedHandler<Env>;
