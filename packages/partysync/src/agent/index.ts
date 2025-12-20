import { RPCClient } from "partyfn";
import { getServerByName } from "partyserver";

import { SyncServer } from "../server/index.ts";

import type { BroadcastMessage, SyncRequest, SyncResponse } from "../types";
import type { RpcException, RpcResponse } from "partyfn";
import type { WebSocket as PSWebSocket } from "partysocket";

export class Agent<
  Env extends Cloudflare.Env = Cloudflare.Env,
  Channels extends {
    [Channel: string]: {
      record: unknown[];
      action: { type: string; payload: unknown };
    };
  } = Record<
    string,
    { record: unknown[]; action: { type: string; payload: unknown } }
  >
> extends SyncServer<Env, Channels> {
  ws: WebSocket | null = null;
  state: Record<string, Channels[keyof Channels]["record"][]> = {};
  rpc: Record<
    string,
    RPCClient<
      Channels[keyof Channels]["action"],
      Channels[keyof Channels]["record"][]
    >
  > = {};

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY NOT NULL DEFAULT (uuid()),
        text TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at INTEGER DEFAULT NULL
      )`
    );
  }

  onAction(
    _channel: keyof Channels,
    action: Channels[keyof Channels]["action"]
  ):
    | Channels[keyof Channels]["record"][]
    | Promise<Channels[keyof Channels]["record"][]> {
    this.ctx.storage.sql.exec(
      `INSERT INTO logs (text) VALUES (${action.payload})`
    );

    return [];
  }

  async connect(namespace: string, room: string) {
    const stub = await getServerByName(
      this.env[namespace as keyof Env] as DurableObjectNamespace<
        SyncServer<Env, Channels>
      >,
      room
    );
    const res = await stub.fetch("https://dummy-example.com/", {
      headers: {
        Upgrade: "websocket"
      }
    });

    if (!res.webSocket) {
      throw new Error("Failed to connect to server");
    }

    this.ws = res.webSocket;

    this.ws.addEventListener("message", (event) => {
      const json = JSON.parse(event.data as string) as
        | RpcResponse<Channels[keyof Channels]["record"][]>
        | RpcException
        | SyncResponse<Channels[keyof Channels]["record"]>
        | BroadcastMessage<Channels[keyof Channels]["record"]>;

      // we handle rpc and sync separately elsewhere
      if ("broadcast" in json && json.broadcast && json.type === "update") {
        const broadcast = json as BroadcastMessage<
          Channels[keyof Channels]["record"]
        >;

        if (!this.state[broadcast.channel]) {
          console.error(
            "channel not synced, discarding update",
            broadcast.channel
          );
          return;
        }
        if (broadcast.type === "update") {
          for (const record of broadcast.payload) {
            const foundIndex = this.state[broadcast.channel].findIndex(
              (item) => item[0] === record[0]
            );
            if (foundIndex !== -1) {
              this.state[broadcast.channel].splice(foundIndex, 1, record);
            } else {
              this.state[broadcast.channel].push(record);
            }
          }
        } else if (broadcast.type === "delete-all") {
          this.state[broadcast.channel] = [];
        }
      }
    });
  }

  async sync(channel: string) {
    if (this.state[channel]) {
      // already synced
      return;
    }

    if (!this.ws) {
      throw new Error("WebSocket not connected before sync");
    }

    this.ws.send(
      JSON.stringify({
        sync: true,
        channel,
        from: null
      } satisfies SyncRequest<Channels[keyof Channels]["record"]>)
    );

    const handleSyncMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string);
      if ("sync" in data && data.sync && data.channel === channel) {
        const syncResponse = data as SyncResponse<
          Channels[keyof Channels]["record"]
        >;
        this.state[channel] = syncResponse.payload;
        this.ws?.removeEventListener("message", handleSyncMessage);
      }
    };

    this.ws?.addEventListener("message", handleSyncMessage);
  }

  async sendAction(
    channel: keyof Channels,
    action: Channels[keyof Channels]["action"]
  ) {
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.sync(channel as string);

      this.rpc[channel as string] ||= new RPCClient(
        channel as string,
        this.ws as unknown as PSWebSocket
      );

      try {
        const result = await this.rpc[channel as string].call(action);
        for (const record of result) {
          const foundIndex = this.state[channel as string].findIndex(
            (item) => item[0] === record[0]
          );
          if (foundIndex !== -1) {
            this.state[channel as string].splice(foundIndex, 1, record);
          } else {
            this.state[channel as string].push(record);
          }
        }
      } catch (error) {
        console.error("RPC call failed", error);
        throw error;
      }
    });
  }
}
