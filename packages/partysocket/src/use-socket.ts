import { useEffect, useMemo, useRef, useState } from "react";

import type WebSocket from "./ws";
import type { Options } from "./ws";

export type SocketOptions = Options & {
  /** Whether the socket should be connected. Defaults to true. */
  enabled?: boolean;
  /**
   * Controls what happens to messages buffered by send() (sent while the
   * connection wasn't open) when the hook replaces the socket because
   * connection options changed.
   *
   * - `undefined` (default): transfer the buffered messages to the new
   *   socket only when the destination is unchanged — i.e. only
   *   credential-style options like `query` changed. If destination
   *   options (room, party, path, host, URL, ...) changed, the messages
   *   are discarded with a warning, since delivering messages composed
   *   for one destination to a different one is rarely what you want.
   * - `true`: always transfer buffered messages to the new socket.
   * - `false`: never transfer; buffered messages are discarded with a
   *   warning when the socket is replaced.
   */
  transferEnqueuedMessages?: boolean;
};

/** When any of the option values are changed, we should reinitialize the socket */
export const getOptionsThatShouldCauseRestartWhenChanged = (
  options: SocketOptions
) => [
  // Note: enabled is handled separately to avoid creating a new socket on toggle
  options.startClosed,
  options.minUptime,
  options.maxRetries,
  options.connectionTimeout,
  options.maxEnqueuedMessages,
  options.maxReconnectionDelay,
  options.minReconnectionDelay,
  options.reconnectionDelayGrowFactor,
  options.debug
];

/**
 * Initializes a PartySocket (or WebSocket) and keeps it stable across renders,
 * but reconnects and updates the reference when any of the connection args change.
 */
export function useStableSocket<
  T extends WebSocket,
  TOpts extends SocketOptions
>({
  options,
  createSocket,
  createSocketMemoKey: createOptionsMemoKey,
  createSocketDestinationKey
}: {
  options: TOpts;
  createSocket: (options: TOpts) => T;
  createSocketMemoKey: (options: TOpts) => string;
  /**
   * Serializes the parts of the options that identify *where* the socket
   * connects (room, party, path, host, URL — but not credentials like
   * query params). Used to decide whether messages buffered in a replaced
   * socket can safely be re-sent on its replacement: a matching
   * destination key means the messages still go to the same place.
   */
  createSocketDestinationKey?: (options: TOpts) => string;
}) {
  // extract enabled with default value of true
  const { enabled = true } = options;

  // Returns a stable reference to options, only updating when the serialized
  // key changes. This avoids reconnecting on every render when callers pass
  // an inline options object (new reference each time) whose values haven't
  // actually changed.
  const shouldReconnect = createOptionsMemoKey(options);

  const socketOptions = useMemo(() => {
    return options;
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- shouldReconnect is a serialized key derived from options — we intentionally memo on the key, not the object reference
  }, [shouldReconnect]);

  // this is the socket we return
  const [socket, setSocket] = useState<T>(() =>
    // only connect on first mount
    createSocket({ ...socketOptions, startClosed: true })
  );

  // keep track of the socket we initialized
  const socketInitializedRef = useRef<T | null>(null);

  // allow changing the socket factory without reconnecting
  const createSocketRef = useRef(createSocket);
  createSocketRef.current = createSocket;

  // track the previous enabled state to detect changes
  const prevEnabledRef = useRef(enabled);

  // track the previous socketOptions reference to distinguish option changes
  // from HMR/StrictMode effect re-runs. useMemo returns the same reference
  // when the memo key hasn't changed, so referential equality tells us
  // whether the connection options actually changed.
  const prevSocketOptionsRef = useRef(socketOptions);

  // tracks whether options changed at any point while the socket was disabled.
  // The disabled path early-returns without creating a new socket, so we need
  // to remember that options drifted and create a new socket on re-enable.
  const optionsChangedWhileDisabledRef = useRef(false);

  // the options the *current* socket was created with. Messages buffered in
  // a socket were destined for these options — when the socket is replaced,
  // we compare destination keys against them (not against the previous
  // render's options, which may have drifted while disabled).
  const socketCreatedWithOptionsRef = useRef(socketOptions);

  // Creates the replacement socket for an options change, migrating the old
  // socket's unsent message buffer per the transferEnqueuedMessages policy.
  // Anything in that buffer was never transmitted, so re-sending it on the
  // new socket cannot double-deliver; the only question is whether the new
  // socket still points at the same destination.
  // Held in a ref (like createSocketRef) so the effect below doesn't need
  // it as a dependency — it always reads the latest render's options.
  const createReplacementSocket = (oldSocket: T): T => {
    const newSocket = createSocketRef.current({
      ...socketOptions,
      startClosed: true
    });

    const queued = oldSocket.drainQueuedMessages();
    if (queued.length > 0) {
      const sameDestination = createSocketDestinationKey
        ? createSocketDestinationKey(socketCreatedWithOptionsRef.current) ===
          createSocketDestinationKey(socketOptions)
        : false;
      const shouldTransfer =
        socketOptions.transferEnqueuedMessages ?? sameDestination;
      if (shouldTransfer) {
        for (const message of queued) {
          newSocket.send(message);
        }
      } else {
        console.warn(
          `PartySocket: discarded ${queued.length} buffered message(s) while replacing the socket, ` +
            "because the connection destination changed. Pass transferEnqueuedMessages: true to " +
            "deliver buffered messages to the new destination instead."
        );
      }
    }

    socketCreatedWithOptionsRef.current = socketOptions;
    return newSocket;
  };
  const createReplacementSocketRef = useRef(createReplacementSocket);
  createReplacementSocketRef.current = createReplacementSocket;

  // finally, initialize the socket
  useEffect(() => {
    const optionsChanged = prevSocketOptionsRef.current !== socketOptions;
    prevSocketOptionsRef.current = socketOptions;

    // if disabled, close the socket and don't proceed with connection logic
    if (!enabled) {
      socket.close();
      prevEnabledRef.current = enabled;
      if (optionsChanged) {
        optionsChangedWhileDisabledRef.current = true;
      }
      return () => {
        socket.close();
      };
    }

    // if enabled just changed from false to true...
    if (!prevEnabledRef.current && enabled) {
      prevEnabledRef.current = enabled;
      const needsNewSocket =
        optionsChanged || optionsChangedWhileDisabledRef.current;
      optionsChangedWhileDisabledRef.current = false;

      if (!needsNewSocket) {
        // options unchanged — reconnect existing socket
        socket.reconnect();
        return () => {
          socket.close();
        };
      }

      // options changed while disabled — create new socket with current config
      const newSocket = createReplacementSocketRef.current(socket);
      setSocket(newSocket);
      return () => {
        newSocket.close();
      };
    }

    prevEnabledRef.current = enabled;

    // we haven't yet restarted the socket
    if (socketInitializedRef.current === socket) {
      if (optionsChanged) {
        // connection options changed — create new socket with new config.
        // startClosed: true so it's inert until the else branch below
        // connects it on the next render. This ensures the socket is safe
        // to clean up if the component unmounts before that re-render.
        const newSocket = createReplacementSocketRef.current(socket);

        // update socket reference (this will cause the effect to run again)
        setSocket(newSocket);
        return () => {
          newSocket.close();
        };
      } else {
        // HMR or React Strict Mode effect re-run — reconnect the existing
        // socket instead of creating a new instance. This preserves the
        // socket identity (event listeners, _pk, etc.) across Hot Module
        // Replacement, preventing downstream code from losing its reference
        // to the live socket.
        if (socketOptions.startClosed !== true) {
          socket.reconnect();
        }
        return () => {
          socket.close();
        };
      }
    } else {
      if (!socketInitializedRef.current) {
        // first mount — respect the caller's startClosed preference
        if (socketOptions.startClosed !== true) {
          socket.reconnect();
        }
      } else if (socketInitializedRef.current !== socket) {
        // replacement socket from an options change — always connect
        socket.reconnect();
      }
      // track initialized socket so we know not to do it again
      socketInitializedRef.current = socket;
      // close the old socket the next time the socket changes or we unmount
      return () => {
        socket.close();
      };
    }
  }, [socket, socketOptions, enabled]);

  return socket;
}
