# partysync

Experimental library to synchronize state between a Durable Object and client. See [design discussion](https://github.com/cloudflare/partykit/issues/147).

> [!WARNING]
> WIP, API and design is subject to change.

See the [Todo fixture](/fixtures/todo-sync/) for a fully working example.

### Why?

- A common pattern is to use one DO per user (and/or entity), and you want to sync all it's state to the client.
- This is a simple (tm) way to sync state from a Durable Object to a client.
- Comes with all the other goodness of Durable Objects: consistency, hibernation, etc.
- If you're looking for syncing slices of state from a database like postgres/mysql, then this library is probably not for you (yet). I recommend something more featureful like zero tinybase electric powersync etc (Lots of great options here - https://localfirstweb.dev/)

### Why not?

- Not a good fit when the entire state is too large to fit in a client's memory.
- Missing features (right now): migrations, multiple DOs on a single socket, better error handling / messaging, etc.
- a higher level abstraction (than just using database records directly) would make this more useful.

### Usage

First, define some types.

```ts
// shared.ts

// define the shape of the records that are stored in the Durable Object database
export type TodoRecord = [
  // NOTE: _always_ add id
  string, // id
  string, // text
  0 | 1, // completed
  number, // created_at
  number, // updated_at
  (
    // NOTE: _always_ add deleted_at
    number | null
  ) // deleted_at
];

// define your actions
export type TodoAction =
  | {
      type: "create";
      payload: {
        id: string;
        text: string;
        completed: 0 | 1; // to match sqlite's idea of a boolean
      };
    }
  | {
      type: "update";
      // ... etc
    };
```

Then, setup your server.

```ts
// server.ts
import { SyncServer } from "partysync";

import type { TodoAction, TodoRecord } from "./shared";

export class MyServer extends SyncServer<
  Env,
  { todos: [TodoRecord, TodoAction] }
> {
  onStart() {
    // setup a database table for your records
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY NOT NULL UNIQUE, 
      text TEXT NOT NULL, 
      completed INTEGER NOT NULL, 
      created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP, 
      updated_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at INTEGER DEFAULT NULL
    )`
    );
  }
  // setup a handler for actions
  onAction(channel: "todos", action: TodoAction) {
    switch (action.type) {
      case "create": {
        const { id, text, completed } = action.payload;
        // return any changed records
        return [
          ...this.ctx.storage.sql
            .exec(
              "INSERT INTO todos (id, text, completed) VALUES (?, ?, ?) RETURNING *",
              id,
              text,
              completed
            )
            .raw()
        ] as TodoRecord[];
      }
      // etc
    }
  }
}
```

Finally, setup your client.

```tsx
// client.tsx
import { useSync } from "partysync/react";

import type { TodoAction, TodoRecord } from "./shared";

// in your component...
const [todos, sendAction] = useSync<TodoRecord, TodoAction>(
  "todos",
  socket, // your websocket
  // optionally do an optimistic update
  (todos, action) => {
    switch (action.type) {
      case "create": {
        const { id, text, completed } = action.payload;
        return [...todos, [id, text, completed, Date.now(), Date.now(), null]];
      }
      // ... etc
    }
  }
);

// call the action whenever
function onClick() {
  sendAction({
    type: "create",
    payload: { id: "1", text: "hello", completed: 0 }
  });
}
```

### TODO:

- multiple DOs on a single socket
- better error handling / messaging
- what do migrations look like?
- sync with other databases?
- sync with api endpoints
- add a higher level abstraction instead of using database records directly

### Maybe won't do

- what if the client/server is offline?
