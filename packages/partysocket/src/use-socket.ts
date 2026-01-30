import { useEffect, useMemo, useRef, useState } from "react";

import type WebSocket from "./ws";
import type { Options } from "./ws";

export type SocketOptions = Options & {
  /** Whether the socket should be connected. Defaults to true. */
  enabled?: boolean;
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
  createSocketMemoKey: createOptionsMemoKey
}: {
  options: TOpts;
  createSocket: (options: TOpts) => T;
  createSocketMemoKey: (options: TOpts) => string;
}) {
  // extract enabled with default value of true
  const { enabled = true } = options;

  // ensure we only reconnect when necessary
  const shouldReconnect = createOptionsMemoKey(options);
  const socketOptions = useMemo(() => {
    return options;
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

  // finally, initialize the socket
  useEffect(() => {
    // if disabled, close the socket and don't proceed with connection logic
    if (!enabled) {
      socket.close();
      prevEnabledRef.current = enabled;
      return;
    }

    // if enabled just changed from false to true, reconnect
    if (!prevEnabledRef.current && enabled) {
      socket.reconnect();
      prevEnabledRef.current = enabled;
      return;
    }

    prevEnabledRef.current = enabled;

    // we haven't yet restarted the socket
    if (socketInitializedRef.current === socket) {
      // create new socket
      const newSocket = createSocketRef.current({
        ...socketOptions,
        // when reconnecting because of options change, we always reconnect
        // (startClosed only applies to initial mount)
        startClosed: false
      });

      // update socket reference (this will cause the effect to run again)
      setSocket(newSocket);
    } else {
      // if this is the first time we are running the hook, connect...
      if (!socketInitializedRef.current && socketOptions.startClosed !== true) {
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
