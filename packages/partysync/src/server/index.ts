import { Server } from "partyserver";

import type { BroadcastMessage, SyncRequest, SyncResponse } from "../types.js";
import type { RpcAction, RpcException, RpcResponse } from "partyfn";
import type { Connection, WSMessage } from "partyserver";

type ActionType = {
  type: string;
  payload: unknown;
};

type RecordType = unknown[];

type Channels = {
  [Channel: string]: {
    record: RecordType;
    action: ActionType;
  };
};

export class SyncServer<
  Env,
  TChannels extends Channels = Channels
> extends Server<Env> {
  static options = {
    hibernate: true
  };

  onAction<Channel extends keyof TChannels>(
    // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
    channel: Channel,
    // biome-ignore lint/correctness/noUnusedFunctionParameters: for autocomplete
    action: TChannels[typeof channel]["action"]
  ): TChannels[Channel]["record"][] | Promise<TChannels[Channel]["record"][]> {
    throw new Error(
      "onAction not implemented, you should implement this in your server"
    );
  }

  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    if (typeof message !== "string") {
      console.error("Received non-string message");
      return;
    }

    let json:
      | RpcAction<TChannels[keyof TChannels]["action"]>
      | SyncRequest<TChannels[keyof TChannels]["record"]>;
    try {
      json = JSON.parse(message);
    } catch (err) {
      connection.send(
        JSON.stringify({
          type: "exception",
          rpc: true,
          exception: [`Failed to parse message: ${(err as Error).message}`]
        } satisfies RpcException)
      );
      return;
    }

    const channel = json.channel as keyof TChannels;

    if ("sync" in json && json.sync) {
      connection.send(
        JSON.stringify({
          sync: true,
          channel: channel as string,
          payload: [
            ...(json.from
              ? this.ctx.storage.sql
                  .exec(
                    `SELECT * FROM ${channel as string} WHERE deleted_at IS NULL AND updated_at > ?`,
                    json.from
                  )
                  .raw()
              : this.ctx.storage.sql
                  .exec(
                    `SELECT * FROM ${channel as string} WHERE deleted_at IS NULL`
                  )
                  .raw())
          ] as TChannels[typeof channel]["record"][]
        } satisfies SyncResponse<TChannels[typeof channel]["record"]>)
      );
      return;
    }

    const { id: messageId, action } = json as RpcAction<
      TChannels[typeof channel]["action"]
    >;

    try {
      const result = await this.onAction(channel, action);

      connection.send(
        JSON.stringify({
          type: "success",
          rpc: true,
          channel: channel as string,
          id: messageId,
          result: result
        } satisfies RpcResponse<TChannels[typeof channel]["record"]>)
      );

      this.broadcast(
        JSON.stringify({
          broadcast: true,
          type: "update",
          channel: channel as string,
          payload: result
        } satisfies BroadcastMessage<TChannels[typeof channel]["record"]>),
        [connection.id]
      );
    } catch (err) {
      connection.send(
        JSON.stringify({
          type: "error",
          rpc: true,
          channel: channel as string,
          id: messageId,
          error: [(err as Error).message]
        } satisfies RpcResponse<TChannels[typeof channel]["record"]>)
      );
    }
  }
}
