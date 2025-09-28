import { createRequestHandler, logDevReady } from "@remix-run/cloudflare";
import * as build from "@remix-run/dev/server-build";
import { WorkerEntrypoint } from "cloudflare:workers";
import { routePartykitRequest, Server } from "partyserver";

// @ts-expect-error we haven't loaded node's types for this yet
if (process.env.NODE_ENV === "development") {
  logDevReady(build);
}

type Env = {
  MyPartyServer: DurableObjectNamespace<MyPartyServer<Env>>;
  CALLS_APP_ID: string;
  CALLS_APP_TOKEN: string;
};

declare module "@remix-run/cloudflare" {
  interface AppLoadContext {
    env: Env;
    MyPartyServer: DurableObjectNamespace<MyPartyServer<Env>>;
  }
}

const handleRemixRequest = createRequestHandler(build);

// TODO: test the expiration stuff
export class MyPartyServer<Env> extends Server<Env> {
  async fetch(_request: Request) {
    return new Response("Hello from the party server");
  }
}

export default class Worker extends WorkerEntrypoint<Env> {
  async fetch(request: Request) {
    // we need to do this dance just to get the session id
    // from the request to route it to the correct Party

    return (
      (await routePartykitRequest(request, this.env)) ||
      handleRemixRequest(request, {
        env: this.env,
        MyPartyServer: this.env.MyPartyServer
      })
    );
  }
}
