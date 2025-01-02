export type RpcAction<T> = {
  id: string;
  channel: string;
  rpc: true;
  action: T;
};

export type RpcResponse<RecordType extends unknown[]> =
  | {
      id: string;
      channel: string;
      rpc: true;
      type: "success";
      result: RecordType[];
    }
  | {
      id: string;
      channel: string;
      rpc: true;
      type: "error";
      error: string[];
    };

export type RpcException = {
  rpc: true;
  type: "exception";
  exception: string[];
};

export type BroadcastMessage<T> = {
  broadcast: true;
  channel: string;
} & (
  | {
      type: "update";
      payload: T[];
    }
  | {
      type: "delete-all";
    }
);

export type SyncRequest<T> = {
  channel: string;
  sync: true;
  from: number | null;
};

export type SyncResponse<T> = {
  channel: string;
  sync: true;
  payload: T[];
};
