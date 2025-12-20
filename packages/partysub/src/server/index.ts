import { env as defaultEnv } from "cloudflare:workers";

import { routePartykitRequest, Server } from "partyserver";

import {
  countriesGroupedByLocation,
  generateIdsGroupedByLocation
} from "./gen-ids";

import type { Connection, ConnectionContext, WSMessage } from "partyserver";

type ConnectionState = {
  topics: string[];
};

function camelCaseToKebabCase(str: string): string {
  let kebabified = str.replace(
    /[A-Z]/g,
    (letter) => `-${letter.toLowerCase()}`
  );
  kebabified = kebabified.startsWith("-") ? kebabified.slice(1) : kebabified;
  // also remove any trailing -'s
  return kebabified.replace(/-$/, "");
}

export function createPubSubServer<
  Env extends Cloudflare.Env = Cloudflare.Env
>(options: {
  binding: string;
  nodes?: number;
  locations?: Partial<Record<DurableObjectLocationHint, number>>;
  jurisdiction?: DurableObjectJurisdiction;
}): {
  PubSubServer: typeof Server<Env>;
  routePubSubRequest: (request: Request, env: Env) => Promise<Response | null>;
} {
  const nodeIDs = generateIdsGroupedByLocation(
    options.nodes,
    options.locations
  );

  if (options.locations && options.jurisdiction) {
    throw new Error("You can't specify both locations and jurisdiction");
  }

  class PubSubServer extends Server<Env> {
    static options = {
      hibernate: true
    };

    onConnect(
      connection: Connection<ConnectionState>,
      ctx: ConnectionContext
    ): void | Promise<void> {
      const url = new URL(ctx.request.url);

      // get topics it's interested in from the url
      // save topics to state
      const initialTopics = url.searchParams.get("topics")?.split(",") || ["*"];
      connection.setState({ topics: initialTopics });
    }

    onMessage(
      connection: Connection<ConnectionState>,
      message: WSMessage
    ): void | Promise<void> {
      const { topic, data, __topics } = JSON.parse(message as string) as {
        topic: string;
        data: string;
        __topics?: string[];
      };
      // technically it'll be an object
      // with either {topic, data} or {__topics}
      // but this type makes typechecking easier

      if (__topics) {
        connection.setState({ topics: __topics });
        return;
      }

      this.broadcastPubSubMessage(topic, data);
    }

    broadcastPubSubMessage(topic: string, data: string) {
      this.publish(topic, data);
      // also publish this message to all the other nodes
      const namespace =
        // @ts-expect-error I don't know typescript
        this.env[options.binding] as DurableObjectNamespace<PubSubServer<Env>>;

      const baseName = this.name.split("-").slice(0, -2).join("-");

      for (const location of Object.keys(
        nodeIDs
      ) as DurableObjectLocationHint[]) {
        for (const nodeID of nodeIDs[location]) {
          const name = `${baseName}-${nodeID}`;
          if (this.name === name) {
            continue;
          }

          const id = namespace.idFromName(name);
          const stub = namespace.get(id);

          stub.publish(topic, data).catch((err: Error) => {
            console.error(`Error publishing to ${name}`);
            console.error(err);
          });
        }
      }
    }

    publish(topic: string, data: string) {
      for (const conn of this.getConnections<ConnectionState>()) {
        // naive topic matching
        // we should look at optimising this somehow
        for (const topicToMatch of conn.state!.topics) {
          if (
            topicToMatch === "*" ||
            topicToMatch === topic ||
            (topicToMatch.endsWith(":*") &&
              topic.startsWith(topicToMatch.slice(0, -2)))
          ) {
            conn.send(JSON.stringify({ topic, data }));
          }
        }
      }
    }

    async onRequest(request: Request): Promise<Response> {
      const { topic, data } = await request.json<{
        topic: string;
        data: string;
      }>();
      if (!topic || !data) {
        return new Response("Invalid request", { status: 400 });
      }
      this.broadcastPubSubMessage(topic, data);

      return new Response("OK");
    }
  }

  async function routePubSubRequest(
    request: Request,
    env: Env = defaultEnv as Env
  ) {
    // the request will come tp /parties/:party/:room
    // and we should rewrite it to /parties/:party/:room-${id}
    // where id = Math.floor(Math.random() * nodes)
    const url = new URL(request.url);
    const path = url.pathname;
    const parts = path.split("/");
    if (parts[1] !== "parties") {
      return null;
    }
    if (parts.length < 4) {
      return null;
    }
    const party = parts[2];
    const room = parts[3];

    if (party !== camelCaseToKebabCase(options.binding)) {
      return null;
    }

    let countryOfOrigin: Iso3166Alpha2Code | "T1" | undefined = request.cf
      ?.country as Iso3166Alpha2Code | "T1" | undefined;
    if (countryOfOrigin === "T1") {
      countryOfOrigin = undefined;
    }

    // find which location this request came from
    let foundLocation: DurableObjectLocationHint | undefined;
    if (countryOfOrigin) {
      for (const location of Object.keys(
        countriesGroupedByLocation
      ) as DurableObjectLocationHint[]) {
        if (countriesGroupedByLocation[location].includes(countryOfOrigin)) {
          foundLocation = location;
          break;
        }
      }
    }

    if (!foundLocation || !Object.keys(nodeIDs).includes(foundLocation)) {
      // pick a random one from Object.keys(nodeIDs)
      const keys = Object.keys(nodeIDs);
      foundLocation = keys[
        Math.floor(Math.random() * keys.length)
      ] as DurableObjectLocationHint;
    }

    const id = Math.floor(Math.random() * nodeIDs[foundLocation].length);
    const newPath = `/parties/${party}/${room}-${nodeIDs[foundLocation][id]}`;
    url.pathname = newPath;
    const newRequest = new Request(url.toString(), request);
    return routePartykitRequest(newRequest, env, {
      locationHint: foundLocation
    });
  }

  return {
    PubSubServer,
    routePubSubRequest
  };
}
