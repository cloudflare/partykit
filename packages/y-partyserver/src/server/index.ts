/**
 * Y.js server implementation for PartyServer.
 *
 * This module is compatible with both yjs 13.x and yjs 14.x (beta).
 *
 * Key differences between versions:
 * - yjs 14 changed AbstractType generic signature from <EventType> to <EventDelta, Self>
 * - yjs 14 uses stricter type constraints (T extends YValue)
 * - yjs 14 changed doc.share type from Map<string, AbstractType<YEvent<any>>> to Map<string, YType>
 * - Event handler signatures have additional parameters in yjs 14
 *
 * We use permissive types (any) where necessary to maintain compatibility.
 */

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

function updateHandler(update: Uint8Array, _origin: unknown, doc: WSSharedDoc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.conns.forEach((_, conn) => {
    send(doc, conn, message);
  });
}

class WSSharedDoc extends YDoc {
  conns: Map<Connection, Set<number>>;
  awareness: awarenessProtocol.Awareness;

  constructor() {
    super({ gc: true });

    /**
     * Maps from conn to set of controlled user ids. Delete all user ids from awareness when this conn is closed
     */
    this.conns = new Map();

    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    const awarenessChangeHandler = (
      {
        added,
        updated,
        removed
      }: {
        added: Array<number>;
        updated: Array<number>;
        removed: Array<number>;
      },
      conn: Connection | null // Origin is the connection that made the change
    ) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs =
          /** @type {Set<number>} */ this.conns.get(conn);
        if (connControlledIDs !== undefined) {
          added.forEach((clientID) => {
            connControlledIDs.add(clientID);
          });
          removed.forEach((clientID) => {
            connControlledIDs.delete(clientID);
          });
        }
      }
      // broadcast awareness update
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        send(this, c, buff);
      });
    };
    this.awareness.on("update", awarenessChangeHandler);
    // Note: Event handler signature differs between yjs 13 and 14, but both are
    // compatible at runtime since we only use the first 3 parameters.
    // yjs 13: on("update", (update: Uint8Array, origin: any, doc: Doc) => void)
    // yjs 14: on("update", (update: Uint8Array, origin: any, doc: Doc, transaction: Transaction) => void)
    // @ts-ignore - Type compatibility varies between yjs versions
    this.on("update", updateHandler);
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

function closeConn(doc: WSSharedDoc, conn: Connection): void {
  if (doc.conns.has(conn)) {
    const controlledIds: Set<number> = doc.conns.get(conn)!;
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds),
      null
    );
  }
  try {
    conn.close();
  } catch (e) {
    console.warn("failed to close connection", e);
  }
}

function send(doc: WSSharedDoc, conn: Connection, m: Uint8Array) {
  if (
    conn.readyState !== undefined &&
    conn.readyState !== wsReadyStateConnecting &&
    conn.readyState !== wsReadyStateOpen
  ) {
    closeConn(doc, conn);
  }
  try {
    conn.send(m);
  } catch (_e) {
    closeConn(doc, conn);
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

  async onLoad(): Promise<void> {
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
    this.document.conns.forEach((_, conn) => {
      if (excludeConnection && conn === excludeConnection) {
        return;
      }
      if (
        conn.readyState !== undefined &&
        conn.readyState !== wsReadyStateConnecting &&
        conn.readyState !== wsReadyStateOpen
      ) {
        return;
      }
      try {
        conn.send(formattedMessage);
      } catch (e) {
        console.warn("Failed to broadcast custom message", e);
      }
    });
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
            send(this.document, connection, encoding.toUint8Array(encoder));
          }
          break;
        case messageAwareness: {
          awarenessProtocol.applyAwarenessUpdate(
            this.document.awareness,
            decoding.readVarUint8Array(decoder),
            connection
          );
          break;
        }
      }
    } catch (err) {
      console.error(err);
      // Note: emit() signature uses a rest parameter internally but the
      // TypeScript declaration uses a single array parameter. This is intentional and
      // works correctly at runtime for both yjs 13 and 14.
      // @ts-ignore - Type compatibility varies between yjs versions
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
    closeConn(this.document, connection);
  }

  // TODO: explore why onError gets triggered when a connection closes

  onConnect(
    conn: Connection<unknown>,
    _ctx: ConnectionContext
  ): void | Promise<void> {
    // conn.binaryType = "arraybuffer"; // from y-websocket, breaks in our runtime

    this.document.conns.set(conn, new Set());

    // send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.document);
    send(this.document, conn, encoding.toUint8Array(encoder));
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
      send(this.document, conn, encoding.toUint8Array(encoder));
    }
  }
}
