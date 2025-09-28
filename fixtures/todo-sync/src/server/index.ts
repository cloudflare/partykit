import { routePartykitRequest } from "partyserver";
import { SyncServer } from "partysync/server";

import type { TodoAction, TodoRecord } from "../shared";

type Env = {
  ToDos: DurableObjectNamespace<ToDos>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export class ToDos extends SyncServer<
  Env,
  { todos: { record: TodoRecord; action: TodoAction } }
> {
  sql2(sql: string, ...values: (string | number | null)[]) {
    if (
      ["insert", "update", "delete"].includes(
        sql.slice(0, sql.indexOf(" ")).toLowerCase()
      )
    ) {
      // set alarm to delete expired todos
      this.ctx.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
    }
    return this.ctx.storage.sql.exec(sql, ...values);
  }

  onStart() {
    this.sql2(`CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY NOT NULL UNIQUE, 
      text TEXT NOT NULL, 
      completed INTEGER NOT NULL, 
      created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP, 
      updated_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at INTEGER DEFAULT NULL
    )`);
  }

  async onAction(_channel: "todos", action: TodoAction): Promise<TodoRecord[]> {
    // uncomment this if you want to run actions sequentially
    // return this.ctx.blockConcurrencyWhile(async () => {
    await sleep(Math.random() * 2000);

    switch (action.type) {
      case "create": {
        const { id, text, completed } = action.payload;
        return [
          ...this.sql2(
            "INSERT INTO todos (id, text, completed) VALUES (?, ?, ?) RETURNING *",
            id,
            text,
            completed
          ).raw()
        ] as TodoRecord[];
      }
      case "update": {
        console.log("update", action.payload);
        const { id, text, completed } = action.payload;

        return [
          ...this.sql2(
            "UPDATE todos SET text = ?, completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *",
            text,
            completed,
            id
          ).raw()
        ] as TodoRecord[];
      }
      case "delete": {
        const { id } = action.payload;
        assert(id, "id is required");
        return [
          ...this.sql2(
            "UPDATE todos SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *",
            id
          ).raw()
        ] as TodoRecord[];
      }
    }
    // });
  }
  async onAlarm() {
    // actually delete any todos that have been
    // marked as deleted more than 24 hours ago
    this.sql2(
      "DELETE FROM todos WHERE deleted_at < ?",
      Date.now() - 24 * 60 * 60 * 1000
    );
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
