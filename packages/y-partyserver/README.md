# y-partyserver

Yjs backend for PartyServer.

[//]: # "keep in sync with packages/y-partyserver/README.md"
[//]: # "keep in sync with docs/reference/y-partyserver.md"

`y-partyserver` is an addon library for `partyserver` designed to host backends for [Yjs](https://yjs.dev), a high-performance library of data structures for building collaborative software.

_This document assumes some familiarity with Yjs. If you're new to Yjs, you can learn more about it in the [official documentation](https://docs.yjs.dev)._

## Setting up a Yjs Server

Like PartyServer, `YServer` is a class that extends `DurableObject` (as well as PartyServer's `Server`). The simplest Yjs backend can be set up like so:

```ts
export { YServer as MyYServer } from "y-partyserver";

// then setup wrangler.jsonc and a default fetch handler
// like you would for PartyServer.
```

## Connecting from the client

Use the provider to connect to this server from your client:

```ts
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";

const yDoc = new Y.Doc();

const provider = new YProvider("localhost:8787", "my-document-name", yDoc);
```

You can add additional options to the provider:

```tsx
const provider = new YProvider(
  /* host */
  "localhost:8787",
  /* document/room name */
  "my-document-name",
  /* Yjs document instance */
  yDoc,
  {
    /* whether to connect to the server immediately */
    connect: false,
    /* the party server path to connect to, defaults to "main" */
    party: "my-party",
    /* the path to the Yjs document on the server
     * This replaces the default path of /parties/:party/:room.
     */
    prefix: "/my/own/path",
    /* use your own Yjs awareness instance */
    awareness: new awarenessProtocol.Awareness(yDoc),
    /* query params to add to the websocket connection
     * This can be an object or a function that returns an object
     */
    params: async () => ({
      token: await getAuthToken()
    }),
    /* the WebSocket implementation to use
     * This can be a polyfill or a custom implementation
     */
    WebSocketPolyfill: WebSocket,
    /* the interval at which to resync the document
     * This is set to -1 by default to disable resyncing by polling
     */
    resyncInterval: -1,
    /* Maximum amount of time to wait before trying to reconnect
     * (we try to reconnect using exponential backoff)
     */
    maxBackoffTimeout: 2500,

    /* Disable cross-tab BroadcastChannel communication */
    disableBc: false
  }
);
```

## Usage with React

If you're using React, then you can use the hook version of the provider: `useYProvider`.

```ts
import useYProvider from "y-partyserver/react";

function App() {
  const provider = useYProvider({
    host: "localhost:8787", // optional, defaults to window.location.host
    room: "my-document-name",
    party: "my-party", // optional, defaults to "main"
    doc: yDoc, // optional!
    options
  });
}
```

### Persistence

By default, PartyKit maintains a copy of the Yjs document as long as at least one client is connected to the server. When all clients disconnect, the document state may be lost.

To persist the Yjs document state between sessions, you can configure onLoad and onSave methods:

```ts
// server.ts
import { YServer } from "y-partyserver";

export class MyDocument extends YServer {
  /* control how often the onSave handler
   * is called with these options */
  static callbackOptions = {
    // all of these are optional
    debounceWait: /* number, default = */ 2000,
    debounceMaxWait: /* number, default = */ 10000,
    timeout: /* number, default = */ 5000
  };

  async onLoad() {
    // load a document from a database, or some remote resource
    // and apply it on to the Yjs document instance at `this.document`
    const content = (await fetchDataFromExternalService(
      this.name
    )) as Uint8Array;
    if (content) {
      Y.applyUpdate(this.document, content);
    }
    return;
  }

  async onSave() {
    // called every few seconds after edits, and when the room empties
    // you can use this to write to a database or some external storage

    await sendDataToExternalService(
      this.name,
      Y.encodeStateAsUpdate(this.document) satisfies Uint8Array
    );
  }
}
```

`onLoad` is called once when a client connects to the server. It should initialise the Yjs document instance at `this.document`. Once the document has been loaded, it's kept in memory until the session ends.

`onSave` is called periodically after the document has been edited, and when the room is emptied. It should be used to save the document state to a database or some other external storage.

## Custom Messages

In addition to Yjs synchronization, you can send custom string messages over the same WebSocket connection. This is useful for implementing custom function calling, chat features, or other real-time communication patterns.

### Sending custom messages from the client

```ts
// client.ts
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";

const yDoc = new Y.Doc();
const provider = new YProvider("localhost:8787", "my-document-name", yDoc);

// Send a custom message to the server
provider.sendMessage(JSON.stringify({ action: "ping", data: "hello" }));

// Listen for custom messages from the server
provider.on("custom-message", (message: string) => {
  const data = JSON.parse(message);
  console.log("Received custom message:", data);
});
```

### Handling custom messages on the server

```ts
// server.ts
import { YServer } from "y-partyserver";
import type { Connection } from "partyserver";

export class MyDocument extends YServer {
  // Override onCustomMessage to handle incoming custom messages
  onCustomMessage(connection: Connection, message: string): void {
    const data = JSON.parse(message);

    if (data.action === "ping") {
      // Send a response back to the specific connection
      this.sendCustomMessage(
        connection,
        JSON.stringify({
          action: "pong",
          data: "world"
        })
      );

      // Or broadcast to all connections
      this.broadcastCustomMessage(
        JSON.stringify({
          action: "notification",
          data: "Someone pinged!"
        })
      );
    }
  }
}
```

### Custom message API

**Client (YProvider):**

- `provider.sendMessage(message: string)` - Send a custom message to the server
- `provider.on("custom-message", (message: string) => {})` - Listen for custom messages from the server

**Server (YServer):**

- `onCustomMessage(connection: Connection, message: string)` - Override to handle incoming custom messages
- `sendCustomMessage(connection: Connection, message: string)` - Send a custom message to a specific connection
- `broadcastCustomMessage(message: string, excludeConnection?: Connection)` - Broadcast a custom message to all connections

Custom messages are sent as strings. We recommend using JSON for structured data.

## Learn more

For more information, refer to the [official Yjs documentation](https://docs.yjs.dev/ecosystem/editor-bindings). Examples provided in the Yjs documentation should work seamlessly with `y-partyserver` (ensure to replace `y-websocket` with `y-partyserver/provider`).

### TODO:

readonly mode
