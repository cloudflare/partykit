import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import debounce from "lodash.debounce";
import type { Connection, ConnectionContext, WSMessage } from "partyserver";
import { Server } from "partyserver";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import {
  applyUpdate,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVector,
  UndoManager,
  XmlText,
  XmlElement,
  XmlFragment
} from "yjs";

const snapshotOrigin = Symbol("snapshot-origin");
type YjsRootType =
  | "Text"
  | "Map"
  | "Array"
  | "XmlText"
  | "XmlElement"
  | "XmlFragment";

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
// biome-ignore lint/correctness/noUnusedVariables: it's fine
const wsReadyStateClosing = 2;
// biome-ignore lint/correctness/noUnusedVariables: it's fine
const wsReadyStateClosed = 3;

const messageSync = 0;
const messageAwareness = 1;
// biome-ignore lint/correctness/noUnusedVariables: it's fine
const messageAuth = 2;

/**
 * Internal key used in connection.setState() to track which awareness
 * client IDs are controlled by each connection. This survives hibernation
 * because connection state is persisted to WebSocket attachments.
 */
const AWARENESS_IDS_KEY = "__ypsAwarenessIds";

type YServerConnectionState = {
  [AWARENESS_IDS_KEY]?: number[];
  [key: string]: unknown;
};

function getAwarenessIds(conn: Connection): number[] {
  try {
    const state = conn.state as YServerConnectionState | null;
    return state?.[AWARENESS_IDS_KEY] ?? [];
  } catch {
    return [];
  }
}

function setAwarenessIds(conn: Connection, ids: number[]): void {
  try {
    conn.setState((prev: YServerConnectionState | null) => ({
      ...prev,
      [AWARENESS_IDS_KEY]: ids
    }));
  } catch {
    // ignore — may fail if connection is already closed
  }
}

class WSSharedDoc extends YDoc {
  awareness: awarenessProtocol.Awareness;

  constructor() {
    super({ gc: true });
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    // Disable the awareness protocol's built-in check interval.
    // It renews the local clock every 15s and removes peers after 30s,
    // but we handle peer cleanup via onClose instead. Clearing it here
    // prevents it from defeating Durable Object hibernation.
    clearInterval(
      (
        this.awareness as unknown as {
          _checkInterval: ReturnType<typeof setInterval>;
        }
      )._checkInterval
    );
  }
}

const CALLBACK_DEFAULTS = {
  debounceWait: 2000,
  debounceMaxWait: 10000,
  timeout: 5000
};

function readSyncMessage(
  decoder: decoding.Decoder,
  encoder: encoding.Encoder,
  doc: YDoc,
  transactionOrigin: Connection,
  readOnly = false
) {
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case syncProtocol.messageYjsSyncStep1:
      syncProtocol.readSyncStep1(decoder, encoder, doc);
      break;
    case syncProtocol.messageYjsSyncStep2:
      if (!readOnly)
        syncProtocol.readSyncStep2(decoder, doc, transactionOrigin);
      break;
    case syncProtocol.messageYjsUpdate:
      if (!readOnly) syncProtocol.readUpdate(decoder, doc, transactionOrigin);
      break;
    default:
      throw new Error("Unknown message type");
  }
  return messageType;
}

function send(conn: Connection, m: Uint8Array): void {
  if (
    conn.readyState !== undefined &&
    conn.readyState !== wsReadyStateConnecting &&
    conn.readyState !== wsReadyStateOpen
  ) {
    return;
  }
  try {
    conn.send(m);
  } catch {
    // connection is broken, ignore
  }
}

export interface CallbackOptions {
  debounceWait?: number;
  debounceMaxWait?: number;
  timeout?: number;
}

export class YServer<
  Env extends Cloudflare.Env = Cloudflare.Env
> extends Server<Env> {
  static callbackOptions: CallbackOptions = {};

  #ParentClass: typeof YServer = Object.getPrototypeOf(this).constructor;
  readonly document: WSSharedDoc = new WSSharedDoc();

  async onLoad(): Promise<YDoc | void> {
    // to be implemented by the user
    return;
  }

  async onSave(): Promise<void> {
    // to be implemented by the user
  }

  /**
   * Replaces the document with a different state using Yjs UndoManager key remapping.
   *
   * @param snapshotUpdate - The snapshot update to replace the document with.
   * @param getMetadata (optional) - A function that returns the type of the root for a given key.
   */
  unstable_replaceDocument(
    snapshotUpdate: Uint8Array,
    getMetadata: (key: string) => YjsRootType = () => "Map"
  ): void {
    try {
      const doc = this.document;
      const snapshotDoc = new YDoc();
      applyUpdate(snapshotDoc, snapshotUpdate, snapshotOrigin);

      const currentStateVector = encodeStateVector(doc);
      const snapshotStateVector = encodeStateVector(snapshotDoc);

      const changesSinceSnapshotUpdate = encodeStateAsUpdate(
        doc,
        snapshotStateVector
      );

      const undoManager = new UndoManager(
        [...snapshotDoc.share.keys()].map((key) => {
          const type = getMetadata(key);
          if (type === "Text") {
            return snapshotDoc.getText(key);
          } else if (type === "Map") {
            return snapshotDoc.getMap(key);
          } else if (type === "Array") {
            return snapshotDoc.getArray(key);
          } else if (type === "XmlText") {
            return snapshotDoc.get(key, XmlText);
          } else if (type === "XmlElement") {
            return snapshotDoc.get(key, XmlElement);
          } else if (type === "XmlFragment") {
            return snapshotDoc.get(key, XmlFragment);
          }
          throw new Error(`Unknown root type: ${type} for key: ${key}`);
        }),
        {
          trackedOrigins: new Set([snapshotOrigin])
        }
      );

      applyUpdate(snapshotDoc, changesSinceSnapshotUpdate, snapshotOrigin);
      undoManager.undo();

      const documentChangesSinceSnapshotUpdate = encodeStateAsUpdate(
        snapshotDoc,
        currentStateVector
      );

      applyUpdate(this.document, documentChangesSinceSnapshotUpdate);
    } catch (error) {
      throw new Error(
        `Failed to replace document: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async onStart(): Promise<void> {
    const src = await this.onLoad();
    if (src != null) {
      const state = encodeStateAsUpdate(src);
      applyUpdate(this.document, state);
    }

    // Broadcast doc updates to all connections.
    // Uses this.getConnections() which works for both hibernate and non-hibernate
    // modes and survives DO hibernation (unlike an in-memory Map).
    this.document.on("update", (update: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      for (const conn of this.getConnections()) {
        send(conn, message);
      }
    });

    // Track which awareness clientIDs each connection controls.
    // Stored in connection.setState() so it survives hibernation.
    // When conn is null (internal changes like removeAwarenessStates on close),
    // broadcast the update to remaining connections.
    // When conn is non-null (client message), handleMessage broadcasts directly.
    this.document.awareness.on(
      "update",
      (
        {
          added,
          updated,
          removed
        }: {
          added: Array<number>;
          updated: Array<number>;
          removed: Array<number>;
        },
        conn: Connection | null
      ) => {
        if (conn !== null) {
          // Track which clientIDs this connection controls
          try {
            const currentIds = new Set(getAwarenessIds(conn));
            for (const clientID of added) currentIds.add(clientID);
            for (const clientID of removed) currentIds.delete(clientID);
            setAwarenessIds(conn, [...currentIds]);
          } catch (_e) {
            // ignore — best-effort tracking
          }
        } else {
          // Internal awareness change (e.g. removeAwarenessStates on close)
          // — broadcast to all remaining connections
          const changedClients = added.concat(updated, removed);
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageAwareness);
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(
              this.document.awareness,
              changedClients
            )
          );
          const buff = encoding.toUint8Array(encoder);
          for (const c of this.getConnections()) {
            send(c, buff);
          }
        }
      }
    );

    // Debounced persistence handler
    this.document.on(
      "update",
      debounce(
        (_update: Uint8Array, _origin: Connection, _doc: YDoc) => {
          try {
            this.onSave().catch((err) => {
              console.error("failed to persist:", err);
            });
          } catch (err) {
            console.error("failed to persist:", err);
          }
        },
        this.#ParentClass.callbackOptions.debounceWait ||
          CALLBACK_DEFAULTS.debounceWait,
        {
          maxWait:
            this.#ParentClass.callbackOptions.debounceMaxWait ||
            CALLBACK_DEFAULTS.debounceMaxWait
        }
      )
    );

    // After hibernation wake-up, the doc is empty but existing connections
    // survive. Re-sync by sending sync step 1 to all connections — they'll
    // respond with sync step 2 containing their full state.
    // On first start there are no connections, so this is a no-op.
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, messageSync);
    syncProtocol.writeSyncStep1(syncEncoder, this.document);
    const syncMessage = encoding.toUint8Array(syncEncoder);
    for (const conn of this.getConnections()) {
      send(conn, syncMessage);
    }
  }

  // biome-ignore lint/correctness/noUnusedFunctionParameters: so autocomplete works
  isReadOnly(connection: Connection): boolean {
    // to be implemented by the user
    return false;
  }

  /**
   * Handle custom string messages from the client.
   * Override this method to implement custom message handling.
   * @param connection - The connection that sent the message
   * @param message - The custom message string (without the __YPS: prefix)
   */
  // biome-ignore lint/correctness/noUnusedFunctionParameters: so autocomplete works
  onCustomMessage(connection: Connection, message: string): void {
    // to be implemented by the user
    console.warn(
      `Received custom message but onCustomMessage is not implemented in ${this.#ParentClass.name}:`,
      message
    );
  }

  /**
   * Send a custom string message to a specific connection.
   * @param connection - The connection to send the message to
   * @param message - The custom message string to send
   */
  sendCustomMessage(connection: Connection, message: string): void {
    if (
      connection.readyState !== undefined &&
      connection.readyState !== wsReadyStateConnecting &&
      connection.readyState !== wsReadyStateOpen
    ) {
      return;
    }
    try {
      connection.send(`__YPS:${message}`);
    } catch (e) {
      console.warn("Failed to send custom message", e);
    }
  }

  /**
   * Broadcast a custom string message to all connected clients.
   * @param message - The custom message string to broadcast
   * @param excludeConnection - Optional connection to exclude from the broadcast
   */
  broadcastCustomMessage(
    message: string,
    excludeConnection?: Connection
  ): void {
    const formattedMessage = `__YPS:${message}`;
    for (const conn of this.getConnections()) {
      if (excludeConnection && conn === excludeConnection) {
        continue;
      }
      if (
        conn.readyState !== undefined &&
        conn.readyState !== wsReadyStateConnecting &&
        conn.readyState !== wsReadyStateOpen
      ) {
        continue;
      }
      try {
        conn.send(formattedMessage);
      } catch (e) {
        console.warn("Failed to broadcast custom message", e);
      }
    }
  }

  handleMessage(connection: Connection, message: WSMessage) {
    if (typeof message === "string") {
      // Handle custom messages with __YPS: prefix
      if (message.startsWith("__YPS:")) {
        const customMessage = message.slice(6); // Remove __YPS: prefix
        this.onCustomMessage(connection, customMessage);
        return;
      }
      console.warn(
        `Received non-prefixed string message. Custom messages should be sent using sendMessage() on the provider.`
      );
      return;
    }
    try {
      const encoder = encoding.createEncoder();
      // Convert ArrayBuffer to Uint8Array if needed (ArrayBufferView like Uint8Array can be used directly)
      const uint8Array =
        message instanceof Uint8Array
          ? message
          : message instanceof ArrayBuffer
            ? new Uint8Array(message)
            : new Uint8Array(
                message.buffer,
                message.byteOffset,
                message.byteLength
              );
      const decoder = decoding.createDecoder(uint8Array);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          readSyncMessage(
            decoder,
            encoder,
            this.document,
            connection,
            this.isReadOnly(connection)
          );

          // If the `encoder` only contains the type of reply message and no
          // message, there is no need to send the message. When `encoder` only
          // contains the type of reply, its length is 1.
          if (encoding.length(encoder) > 1) {
            send(connection, encoding.toUint8Array(encoder));
          }
          break;
        case messageAwareness: {
          const awarenessData = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(
            this.document.awareness,
            awarenessData,
            connection
          );
          // Forward raw awareness bytes to all connections
          const awarenessEncoder = encoding.createEncoder();
          encoding.writeVarUint(awarenessEncoder, messageAwareness);
          encoding.writeVarUint8Array(awarenessEncoder, awarenessData);
          const awarenessBuff = encoding.toUint8Array(awarenessEncoder);
          for (const c of this.getConnections()) {
            send(c, awarenessBuff);
          }
          break;
        }
      }
    } catch (err) {
      console.error(err);
      // @ts-expect-error - TODO: fix this
      this.document.emit("error", [err]);
    }
  }

  onMessage(conn: Connection, message: WSMessage) {
    this.handleMessage(conn, message);
  }

  onClose(
    connection: Connection<unknown>,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): void | Promise<void> {
    // Read controlled awareness clientIDs from connection state
    // (survives hibernation unlike an in-memory Map)
    const controlledIds = getAwarenessIds(connection);
    if (controlledIds.length > 0) {
      awarenessProtocol.removeAwarenessStates(
        this.document.awareness,
        controlledIds,
        null
      );
    }
  }

  // TODO: explore why onError gets triggered when a connection closes

  onConnect(
    conn: Connection<unknown>,
    _ctx: ConnectionContext
  ): void | Promise<void> {
    // Note: awareness IDs are lazily initialized when the first awareness
    // message is received — no need to call setAwarenessIds(conn, []) here

    // send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.document);
    send(conn, encoding.toUint8Array(encoder));
    const awarenessStates = this.document.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          this.document.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      send(conn, encoding.toUint8Array(encoder));
    }
  }
}
