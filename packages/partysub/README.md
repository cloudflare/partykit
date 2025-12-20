# partysub

Pub-sub functionality for Durable Objects in PartyServer.

## 🥖 partysub

> [!WARNING]
> This project is experimental and is not yet recommended for production use.

PubSub for Cloudflare Workers, powered by [PartyServer](https://github.com/cloudflare/partykit/).

### Installation

```shell
npm install partyserver partysub partysocket
```

### Usage

In your Worker, define a PartySub class:

```ts
import { createPubSubServer } from "partysub/server";

const { PubSubServer, routePubSubRequest } = createPubSubServer({
  binding: "PubSub", // the name of the binding
  nodes: /* number of nodes _PER :id_, default 1 */ 100,

  locations: {
    // optionally define locations, and weight them
    // the weight determines how many nodes are spun up in that location
    // possible values at https://developers.cloudflare.com/durable-objects/reference/data-location/#provide-a-location-hint
    // example:
    eu: 1,
    wnam: 3
    // If a user connects from one of these areas, they will
    // be connected to a node in that location
    // If a user connects from an area not listed here,
    // they will be connected to a random node

    // Note: location hints are best attempt, not guaranteed

    // Note: In the future, we will autoscale servers
    // so this configuration isn't needed anymore
  },

  // The below config doesn't work _yet_, but it's the goal
  jurisdiction: "eu" /* optional, default undefined */
  // Note: You CANNOT define a jurisdiction and locations at the same time
});

export { PubSubServer };

// setup your worker handler
export default {
  async fetch(request, env) {
    const pubSubResponse = await routePubSubRequest(request, env);
    return pubSubResponse || new Response("Not found", { status: 404 });
  }
};
```

And setup your wrangler.jsonc:

```jsonc
{
  // ...
  "durable_objects": {
    "bindings": [
      {
        "name": "PubSub",
        "class_name": "PubSubServer"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["PubSubServer"]
    }
  ]
}
```

In your application, use PartySocket to connect to the server:

```ts
import { PartySocket } from "partysocket";

const ws = new PartySocket({
  host: "...", // the host of the partyserver, defaults to window.location.host
  party: "pubsub", // the name of the party, use the binding's lowercase form
  room: "default", // the name of the room/channel
  query: {
    // by default, it subscribes to all topics
    // but you can set it to specific topics
    topics: [
      "topic-abc", // a specific topic
      "prefix:*" // a prefixed topic,
    ]
  }
});

// Listen to incoming messages
client.addEventListener("message", (event) => {
  console.log(event.topic, event.data);
});

// publish a message to the server
ws.send(JSON.stringify({ topic: "topic-abc", data: "hello world" }));

// You can also POST a message to the server
PartySocket.fetch(
  {
    host: window.location.host, // the host of the partyserver
    party: "pubsub", // the name of the party, use the binding's lowercase form
    room: "default" // the name of the room/channel
  },
  {
    method: "POST",
    body: JSON.stringify({ topic: "topic-abc", data: "hello world" })
  }
);
```

### react

```tsx
import { usePartySocket } from "partysocket/react";

function App() {
  usePartySocket({
    party: "pubsub",
    room: "default",
    query: {
      // by default, it subscribes to all topics
      // but you can set it to specific topics
      topics: [
        "topic-abc", // a specific topic
        "prefix:*" // a prefixed topic,
      ]
    },
    onMessage: (event) => {
      console.log(event.topic, event.data);
    }
  });

  return <div>...</div>;
}
```

## TODO

- what should rate limiting look like?
- we should try to use binary payloads on everything
- this does at-most-once delivery, should we try to support at-least-once?
- should we have config for skipping messages sent by self?
- autoscaling. that's the dream.
