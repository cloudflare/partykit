export type BroadcastMessage<T> =
  | {
      broadcast: true;
      channel: string;
      type: "update";
      payload: T[];
    }
  | {
      broadcast: true;
      channel: string;
      type: "delete-all";
    };

export type SyncRequest<_T> = {
  channel: string;
  sync: true;
  from: number | null;
};

export type SyncResponse<T> = {
  channel: string;
  sync: true;
  payload: T[];
};
