import {
  startTransition,
  useEffect,
  useMemo,
  useOptimistic,
  useState
} from "react";
import { nanoid } from "nanoid";

import { Persist } from "../client/persist";

import type {
  BroadcastMessage,
  RpcAction,
  RpcException,
  RpcResponse,
  SyncRequest,
  SyncResponse
} from "..";
import type { WebSocket as PSWebSocket } from "partysocket";

// we keep the actual cache external to the class
// so it can be reused across instances/rerenders

const rpcCaches = new Map<
  string,
  Map<string, ReturnType<typeof Promise.withResolvers>>
>();

class RPC<
  RecordType extends unknown[],
  Action extends { type: string; payload: unknown }
> {
  private rpcCache: Map<string, ReturnType<typeof Promise.withResolvers>>;
  private controller = new AbortController();
  constructor(
    private channel: string,
    private socket: PSWebSocket
  ) {
    const cache = rpcCaches.get(channel);
    if (!cache) {
      rpcCaches.set(channel, new Map());
    }
    this.rpcCache = rpcCaches.get(channel)!;
    this.socket.addEventListener(
      "message",
      (event) => {
        const message = JSON.parse(event.data) as RpcResponse<RecordType>;
        if (
          (message.type === "success" || message.type === "error") &&
          message.channel === this.channel &&
          message.rpc === true
        ) {
          this.resolve(message);
        }
      },
      { signal: this.controller.signal }
    );
  }

  private rpc(id: string, timeout = 10000) {
    const resolver = Promise.withResolvers();
    this.rpcCache.set(id, resolver);
    setTimeout(() => {
      this.rpcCache.delete(id);
      resolver.reject(new Error(`RPC call ${id} timed out`));
    }, timeout);
    return resolver.promise;
  }

  public async call(action: Action, timeout = 10000): Promise<RecordType[]> {
    const id: string = nanoid(8);
    this.socket.send(
      JSON.stringify({
        id,
        channel: this.channel,
        rpc: true,
        action
      } satisfies RpcAction<Action>)
    );
    return this.rpc(id, timeout) as Promise<RecordType[]>;
  }

  private async resolve(response: RpcResponse<RecordType> | RpcException) {
    if (response.type === "exception") {
      throw new Error(response.exception.join("\n"));
    }
    const resolver = this.rpcCache.get(response.id);
    if (!resolver) {
      console.warn(`No resolver found for id: ${response.id}`);
      return;
    }
    if (response.type === "success") {
      resolver.resolve(response.result);
    } else {
      resolver.reject(new Error(response.error.join("\n")));
    }
  }

  destroy() {
    // this.rpcCache.clear();
    // cancel the signal
    this.controller.abort();
  }
}

function useRPC<
  RecordType extends unknown[],
  Action extends { type: string; payload: unknown }
>(key: string, socket: PSWebSocket) {
  const [rpc] = useState<RPC<RecordType, Action>>(
    () => new RPC<RecordType, Action>(key, socket)
  );

  useEffect(() => {
    return () => {
      rpc.destroy();
    };
  }, [rpc]);

  return rpc;
}

export function useSync<
  RecordType extends unknown[],
  Action extends { type: string; payload: unknown }
>(
  key: string,
  socket: PSWebSocket,
  optimisticReducer: (
    currentState: RecordType[],
    action: Action
  ) => RecordType[] = (currentState) => currentState
): [RecordType[], (action: Action) => void] {
  const persist = useMemo(() => new Persist<RecordType>(key), [key]);
  const [value, setValue] = useState<RecordType[]>([]);

  const rpc = useRPC<RecordType, Action>(key, socket);

  useEffect(() => {
    // do initial sync
    const controller = new AbortController();

    persist.getAll().then((records) => {
      setValue(records.filter((r) => r.at(-1) === null));
      // find the time of the latest record
      let lastRecordTime: number | null = null;
      for (const record of records) {
        const recordDeletedAt = record[record.length - 1] as number | null;
        const recordUpdatedAt = record[record.length - 2] as number | null;

        // if the record is deleted, we want to sync up to the deleted time
        if (
          recordDeletedAt &&
          (!lastRecordTime || recordDeletedAt > lastRecordTime)
        ) {
          lastRecordTime = recordDeletedAt;
        }
        // if the record is updated, we want to sync up to the updated time
        if (
          recordUpdatedAt &&
          (!lastRecordTime || recordUpdatedAt > lastRecordTime)
        ) {
          lastRecordTime = recordUpdatedAt;
        }
      }
      socket.send(
        JSON.stringify({
          channel: key,
          sync: true,
          from: lastRecordTime
        } satisfies SyncRequest<RecordType>)
      );
    });

    socket.addEventListener(
      "message",
      async (event) => {
        const message = JSON.parse(event.data) as SyncResponse<RecordType>;
        if (message.channel === key && message.sync === true) {
          // this is all the data for initial sync

          setValue((value) => {
            const updatedRecords = [...value];
            for (const record of message.payload) {
              const index = updatedRecords.findIndex((r) => r[0] === record[0]);
              if (index !== -1) {
                updatedRecords.splice(index, 1, record);
              } else {
                updatedRecords.push(record);
              }
            }
            persist.set(message.payload);
            return updatedRecords;
          });
        }
      },
      { signal: controller.signal }
    );
    return () => {
      controller.abort();
    };
  }, [socket, key, persist]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const message = JSON.parse(event.data) as BroadcastMessage<RecordType>;
      if (message.broadcast === true && message.channel === key) {
        if (message.type === "update") {
          setValue((records) => {
            const updates = message.payload;
            const updatedRecords = [...records];
            for (const update of updates) {
              const index = updatedRecords.findIndex((r) => r[0] === update[0]);
              if (update.at(-1) === null) {
                // doesn't have deleted_at, so it's not a delete

                if (index !== -1) {
                  // update the record
                  updatedRecords.splice(index, 1, update);
                } else {
                  // add the record
                  updatedRecords.push(update);
                }
              } else {
                // this is a delete

                if (index !== -1) {
                  updatedRecords.splice(index, 1);
                } else {
                  // this is a delete for a record that doesn't exist
                  // so let's just ignore it
                }
              }
            }
            persist.set(updates);
            return updatedRecords;
          });
        } else if (message.type === "delete-all") {
          setValue([]);
        }
      }
    }

    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [socket, key, persist]);

  const [optimisticValue, setOptimisticValue] = useOptimistic<
    RecordType[],
    Action
  >(value, (currentState, action) => {
    return optimisticReducer(currentState, action);
  });

  return [
    optimisticValue,
    (action) => {
      startTransition(async () => {
        setOptimisticValue(action);

        const result = await rpc.call(action);
        if (result.length === 0) {
          return;
        }

        startTransition(() => {
          setValue((value) => {
            // let changed = false;
            const newValue = [...value];
            for (const record of result) {
              // if record is in data, update it
              const index = newValue.findIndex((item) => item[0] === record[0]);
              if (index !== -1) {
                if (record.at(-1) !== null) {
                  // this is a delete
                  newValue.splice(index, 1);
                } else {
                  newValue.splice(index, 1, record);
                }
              }
              // if record is not in data, add it
              else if (index === -1) {
                if (record.at(-1) === null) {
                  // this is not a delete
                  newValue.push(record);
                } else {
                  // this is a delete for a record that doesn't exist
                  // so let's just ignore it
                }
              }
            }
            persist.set(result);
            return newValue;
          });
        });
      });
    }
  ];
}
