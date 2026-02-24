import { routePartykitRequest } from "partyserver";
import { YServer } from "../server/index";
import * as Y from "yjs";

import type { Connection, ConnectionContext } from "partyserver";
import type { CallbackOptions } from "../server/index";

// ---------------------------------------------------------------------------
// Env type for all test DOs
// ---------------------------------------------------------------------------
export type Env = {
  YBasic: DurableObjectNamespace<YBasic>;
  YPersistent: DurableObjectNamespace<YPersistent>;
  YReadOnly: DurableObjectNamespace<YReadOnly>;
  YCustomMessage: DurableObjectNamespace<YCustomMessage>;
  YOnLoadReturnsDoc: DurableObjectNamespace<YOnLoadReturnsDoc>;
  YCallbackOptions: DurableObjectNamespace<YCallbackOptions>;
  YHibernateTracker: DurableObjectNamespace<YHibernateTracker>;
};

// ---------------------------------------------------------------------------
// 1. Basic YServer — no persistence, no customization
// ---------------------------------------------------------------------------
export class YBasic extends YServer {
  static options = {
    hibernate: true
  };
}

// ---------------------------------------------------------------------------
// 2. Persistent YServer — stores doc in SQLite, exercises onLoad/onSave
// ---------------------------------------------------------------------------
export class YPersistent extends YServer {
  static options = {
    hibernate: true
  };

  static callbackOptions: CallbackOptions = {
    debounceWait: 50,
    debounceMaxWait: 100
  };

  async onStart() {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, content BLOB)"
    );
    return super.onStart();
  }

  async onLoad() {
    const rows = [
      ...this.ctx.storage.sql.exec(
        "SELECT content FROM documents WHERE id = ? LIMIT 1",
        this.name
      )
    ];
    if (rows.length > 0 && rows[0].content) {
      Y.applyUpdate(
        this.document,
        new Uint8Array(rows[0].content as ArrayBuffer)
      );
    }
    return;
  }

  async onSave() {
    const update = Y.encodeStateAsUpdate(this.document);
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO documents (id, content) VALUES (?, ?)",
      this.name,
      update
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Read-only YServer — all connections are read-only
// ---------------------------------------------------------------------------
export class YReadOnly extends YServer {
  static options = {
    hibernate: true
  };

  isReadOnly(_connection: Connection): boolean {
    return true;
  }

  onConnect(conn: Connection, _ctx: ConnectionContext): void {
    super.onConnect(conn, _ctx);
    // Also send a marker so the test knows the connection was accepted
    conn.send("connected:readonly");
  }
}

// ---------------------------------------------------------------------------
// 4. Custom message YServer — exercises onCustomMessage, sendCustomMessage,
//    broadcastCustomMessage
// ---------------------------------------------------------------------------
export class YCustomMessage extends YServer {
  static options = {
    hibernate: true
  };

  onCustomMessage(connection: Connection, message: string): void {
    try {
      const data = JSON.parse(message) as { action: string };
      if (data.action === "ping") {
        this.sendCustomMessage(connection, JSON.stringify({ action: "pong" }));
      } else if (data.action === "broadcast") {
        this.broadcastCustomMessage(
          JSON.stringify({ action: "broadcasted" }),
          connection
        );
      } else if (data.action === "echo") {
        this.sendCustomMessage(connection, message);
      }
    } catch {
      this.sendCustomMessage(
        connection,
        JSON.stringify({ error: "parse-error" })
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 5. YServer where onLoad returns a YDoc (tests the return-YDoc code path)
// ---------------------------------------------------------------------------
export class YOnLoadReturnsDoc extends YServer {
  static options = {
    hibernate: true
  };

  async onLoad(): Promise<Y.Doc | void> {
    // Create a fresh doc with some pre-seeded content
    const seedDoc = new Y.Doc();
    seedDoc.getText("shared").insert(0, "seeded-content");
    return seedDoc;
  }
}

// ---------------------------------------------------------------------------
// 6. YServer with custom callback options
// ---------------------------------------------------------------------------
export class YCallbackOptions extends YServer {
  static options = {
    hibernate: true
  };

  static callbackOptions: CallbackOptions = {
    debounceWait: 50,
    debounceMaxWait: 100
  };

  saveCount = 0;

  async onSave() {
    this.saveCount++;
  }

  // Expose saveCount via HTTP for testing
  onRequest(): Response {
    return Response.json({ saveCount: this.saveCount });
  }
}

// ---------------------------------------------------------------------------
// 7. YServer that tracks onStart calls via storage — detects hibernation
// ---------------------------------------------------------------------------
export class YHibernateTracker extends YServer {
  static options = {
    hibernate: true
  };

  async onStart() {
    const count = (await this.ctx.storage.get<number>("onStartCount")) ?? 0;
    await this.ctx.storage.put("onStartCount", count + 1);
    return super.onStart();
  }

  async onRequest(): Promise<Response> {
    const count = (await this.ctx.storage.get<number>("onStartCount")) ?? 0;
    return Response.json({ onStartCount: count });
  }
}

// ---------------------------------------------------------------------------
// Default fetch handler — routes to the correct DO
// ---------------------------------------------------------------------------
export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
